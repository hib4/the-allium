"""Run with python -m audio_service.server. Never opens an output stream."""
import argparse
import asyncio
import copy
import json
import os
import queue
import threading
import time
import uuid
import secrets
import logging
from pathlib import Path

# Windows pip wheels provide ASIO, but it must be enabled before import.
if os.name == 'nt':
    os.environ.setdefault('SD_ENABLE_ASIO', '1')

import numpy as np
from aiohttp import web
from .analysis import Analyzer, HOP, RATE, default_config, fixture_block, validate_config


def audio_devices():
    import sounddevice as sd
    apis = sd.query_hostapis()
    return [{'id': n, 'name': d['name'], 'hostApi': apis[d['hostapi']]['name'],
             'channels': d['max_input_channels'], 'sampleRate': d['default_samplerate']}
            for n, d in enumerate(sd.query_devices()) if d['max_input_channels'] > 0]


class Service:
    def __init__(self, config_path, fixture=False):
        self.path = config_path
        self.config = default_config()
        self.warning = ''
        if self.path.exists():
            try:
                self.config = validate_config(json.loads(self.path.read_text()))
            except (ValueError, TypeError, OSError) as error:
                self.warning = f'Saved configuration unavailable: {error}'
        if self.warning:
            backup = self.path.with_suffix('.bak')
            try:
                self.config = validate_config(json.loads(backup.read_text()))
                self.warning += ' Recovered last-known-good backup.'
            except (OSError, ValueError, TypeError):
                pass
        self.shutdown_token = secrets.token_urlsafe(32)
        self.fixture = fixture
        self.revision = 1
        self.stream_id = str(uuid.uuid4())
        self.sequence = 0
        self.status = 'fixture' if fixture else 'unconfigured'
        self.error = self.warning
        self.overflows = 0
        self.dropped = 0
        self.clients = set()
        self.device_task = None
        self.blocks = queue.Queue(maxsize=4)
        self.stop = threading.Event()
        self.last_capture = 0.
        self.origin = time.monotonic()

    def stamp(self):
        return (time.monotonic() - self.origin) * 1000

    def capture(self):
        if self.fixture:
            sample = 0
            deadline = time.monotonic()
            while not self.stop.is_set():
                self.enqueue(fixture_block(sample), self.stamp())
                sample += HOP
                deadline = max(deadline + HOP / RATE, time.monotonic())
                self.stop.wait(max(0, deadline - time.monotonic()))
            return
        while not self.stop.is_set():
            selected = copy.deepcopy(self.config['device'])
            if selected is None:
                self.status = 'unconfigured'
                self.stop.wait(.5)
                continue
            try:
                import sounddevice as sd
                matches = [d for d in audio_devices() if d['name'] == selected['name'] and d['hostApi'] == selected['hostApi']]
                if len(matches) != 1:
                    raise RuntimeError('Selected device unavailable or ambiguous. Refresh devices and choose the Ui24R.')
                device = matches[0]
                if device['channels'] < 32:
                    raise RuntimeError('This device exposes fewer than 32 inputs. Select the multichannel CoreAudio/ASIO device.')
                sd.check_input_settings(device=device['id'], channels=32, dtype='float32', samplerate=RATE)
                with sd.InputStream(device=device['id'], channels=32, dtype='float32', samplerate=RATE,
                                    blocksize=HOP, latency='low') as stream:
                    self.stream_id = str(uuid.uuid4())
                    self.status, self.error = 'connected', ''
                    while not self.stop.is_set() and self.config['device'] == selected:
                        # Blocking input thread: no DSP or networking on an audio callback.
                        data, overflow = stream.read(HOP)
                        self.overflows += int(overflow)
                        self.enqueue(data, self.stamp())
            except Exception as error:
                message = str(error)[:500]
                if self.status != 'unavailable' or self.error != message:
                    logging.warning('Audio input unavailable: %s', message)
                self.status, self.error = 'unavailable', message
                self.stop.wait(2)

    def enqueue(self, data, timestamp):
        self.last_capture = time.monotonic()
        try:
            self.blocks.put_nowait((data, timestamp, self.stream_id))
        except queue.Full:
            try:
                self.blocks.get_nowait()
            except queue.Empty:
                pass
            self.dropped += 1
            try:
                self.blocks.put_nowait((data, timestamp, self.stream_id))
            except queue.Full:
                self.dropped += 1

    def next_block(self):
        try:
            return self.blocks.get(timeout=.1)
        except queue.Empty:
            return None

    async def run(self):
        thread = threading.Thread(target=self.capture, daemon=True)
        thread.start()
        analyzer = Analyzer(self.config)
        revision, stream_id = self.revision, self.stream_id
        meters, features = analyzer.process(np.zeros((HOP, 32), np.float32), 0)
        next_send = time.monotonic()
        try:
            while True:
                block = await asyncio.to_thread(self.next_block)
                if revision != self.revision or stream_id != self.stream_id:
                    analyzer = Analyzer(copy.deepcopy(self.config))
                    revision, stream_id = self.revision, self.stream_id
                    meters, features = analyzer.process(np.zeros((HOP, 32), np.float32), self.stamp())
                timestamp = self.stamp()
                if block:
                    samples, timestamp, captured_stream = block
                    if captured_stream == stream_id:
                        meters, features = analyzer.process(samples, timestamp)
                fresh = time.monotonic() - self.last_capture < .5
                if not fresh:
                    meters, features = analyzer.process(np.zeros((HOP, 32), np.float32), timestamp)
                now = time.monotonic()
                if now < next_send:
                    continue
                next_send = max(next_send + 1 / 30, now)
                self.sequence += 1
                payload = {'v': 1, 'type': 'features', 'streamId': stream_id, 'sequence': self.sequence,
                           'timestamp': timestamp, 'revision': revision, 'config': self.config,
                           'status': self.status, 'error': self.error, 'fresh': fresh,
                           'sampleRate': RATE, 'meters': meters, 'instruments': features,
                           'events': analyzer.drain_events() if fresh else [],
                           'health': {'overflows': self.overflows, 'dropped': self.dropped,
                                      'processingMs': max(0, self.stamp() - timestamp)}}
                # Slow clients are disconnected instead of accumulating stale frames.
                for client in list(self.clients):
                    try:
                        await asyncio.wait_for(client.send_json(payload), timeout=.02)
                    except (TimeoutError, ConnectionError, RuntimeError):
                        self.clients.discard(client)
                        await client.close()
        finally:
            self.stop.set()
            await asyncio.to_thread(thread.join, 2)

    async def devices(self, request):
        try:
            if self.device_task is None or self.device_task.done():
                loop = asyncio.get_running_loop()
                self.device_task = loop.create_future()
                pending = self.device_task
                pending.add_done_callback(lambda future: future.exception() if not future.cancelled() else None)
                def complete(result, error):
                    if pending.done():
                        return
                    if error:
                        pending.set_exception(error)
                    else:
                        pending.set_result(result)
                def discover():
                    try:
                        result, error = audio_devices(), None
                    except Exception as failure:
                        result, error = None, failure
                    try:
                        loop.call_soon_threadsafe(complete, result, error)
                    except RuntimeError:
                        pass  # A blocked driver must not retain a shutting-down process.
                threading.Thread(target=discover, daemon=True).start()
            devices = await asyncio.wait_for(asyncio.shield(self.device_task), timeout=4)
            return web.json_response({'devices': devices, 'fixture': self.fixture})
        except Exception as error:
            message = str(error) or 'Device discovery timed out. Check the USB driver and restart The Allium if it remains unavailable.'
            return web.json_response({'devices': [], 'fixture': self.fixture, 'error': message}, status=503)

    async def settings(self, request):
        if request.method == 'GET':
            return web.json_response({'config': self.config, 'revision': self.revision})
        try:
            value = await request.json()
            if value.get('revision') != self.revision:
                return web.json_response({'error': 'Settings changed in another tab. Refresh and retry.'}, status=409)
            config = validate_config(value.get('config'))
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            with temporary.open('w', encoding='utf-8') as saved:
                json.dump(config, saved, indent=2, allow_nan=False)
                saved.flush()
                os.fsync(saved.fileno())
            if self.path.exists() and not self.warning:
                self.path.with_suffix('.bak').write_bytes(self.path.read_bytes())
            temporary.replace(self.path)
            if self.error == self.warning:
                self.error = ''
            self.warning = ''
            self.config = copy.deepcopy(config)
            self.revision += 1
            return web.json_response({'config': self.config, 'revision': self.revision})
        except (ValueError, TypeError, AttributeError) as error:
            return web.json_response({'error': str(error)}, status=400)
        except OSError as error:
            return web.json_response({'error': f'Could not save settings: {error}'}, status=500)

    async def websocket(self, request):
        ws = web.WebSocketResponse(heartbeat=5, max_msg_size=4096)
        await ws.prepare(request)
        self.clients.add(ws)
        try:
            async for message in ws:
                if message.type == web.WSMsgType.TEXT:
                    try:
                        value = json.loads(message.data)
                        if value.get('type') == 'ping':
                            await ws.send_json({'v': 1, 'type': 'pong', 'clientTime': value.get('clientTime'), 'timestamp': self.stamp()})
                    except (ValueError, AttributeError):
                        pass
        finally:
            self.clients.discard(ws)
        return ws


def create_app(service, dist, development=False):
    @web.middleware
    async def local_origin(request, handler):
        hostname = request.host.split(':')[0]
        if hostname not in {'127.0.0.1', 'localhost'}:
            raise web.HTTPForbidden(text='Use the local Allium website.')
        origin = request.headers.get('Origin')
        allowed = {f'http://{request.host}'}
        if development:
            allowed.update({'http://localhost:5173', 'http://127.0.0.1:5173'})
        if origin and origin not in allowed:
            raise web.HTTPForbidden(text='Use the local Allium website.')
        return await handler(request)

    app = web.Application(middlewares=[local_origin], client_max_size=16384)
    async def health(request):
        return web.json_response({'application': 'The Allium', 'version': '1.1.0-rc.2',
            'instance': service.stream_id, 'status': service.status, 'fixture': service.fixture,
            'shutdownToken': service.shutdown_token})

    async def shutdown(request):
        if request.headers.get('X-Allium-Token') != service.shutdown_token:
            raise web.HTTPForbidden()
        def finish():
            raise web.GracefulExit()
        asyncio.get_running_loop().call_later(.2, finish)
        return web.json_response({'stopping': True})

    app.router.add_get('/api/health', health)
    app.router.add_post('/api/shutdown', shutdown)
    app.router.add_get('/api/devices', service.devices)
    app.router.add_get('/api/config', service.settings)
    app.router.add_put('/api/config', service.settings)
    app.router.add_get('/ws', service.websocket)

    async def static(request):
        path = (dist / request.match_info['path']).resolve()
        if not path.is_relative_to(dist.resolve()):
            raise web.HTTPNotFound()
        if not path.is_file():
            if path.suffix or request.path.startswith('/api/'):
                raise web.HTTPNotFound()
            path = dist / 'index.html'
        if not path.is_file():
            raise web.HTTPServiceUnavailable(text='Run npm run build, or use the Vite development server.')
        return web.FileResponse(path)

    app.router.add_get('/{path:.*}', static)

    async def lifecycle(app):
        task = asyncio.create_task(service.run())
        yield
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        for client in list(service.clients):
            await client.close()

    app.cleanup_ctx.append(lifecycle)
    return app


def main():
    parser = argparse.ArgumentParser(description='The Allium input-only Ui24R analyzer')
    parser.add_argument('--development', action='store_true', help='Allow local Vite development origins')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--fixture', action='store_true', help='Synthetic PCM soundcheck; no physical capture')
    parser.add_argument('--list-devices', action='store_true')
    parser.add_argument('--config', type=Path, default=Path('audio_service/local-config.json'))
    parser.add_argument('--dist', type=Path, default=Path('dist'))
    args = parser.parse_args()
    if args.list_devices:
        print(json.dumps(audio_devices(), indent=2))
        return
    web.run_app(create_app(Service(args.config, args.fixture), args.dist, args.development), host='127.0.0.1', port=args.port)


if __name__ == '__main__':
    main()
