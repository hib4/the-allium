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


def audio_devices(probe=True, selected=None):
    import sounddevice as sd
    apis = sd.query_hostapis()
    devices = []
    for n, d in enumerate(sd.query_devices()):
        capacity = min(256, d['max_input_channels'])
        if capacity < 1:
            continue
        rates = sorted({int(d['default_samplerate']), 44100, 48000, 96000})
        checked = []
        # Representative capture widths. Exact selected channels are checked on Apply/open.
        check_selected = probe and selected and selected['name'] == d['name'] and selected['hostApi'] == apis[d['hostapi']]['name']
        for width in (sorted({1, min(2, capacity), capacity}) if check_selected else []):
            for rate in rates:
                try:
                    sd.check_input_settings(device=n, channels=width, dtype='float32', samplerate=rate)
                    checked.append({'channels': width, 'sampleRate': rate})
                except Exception:
                    pass
        devices.append({'id': n, 'name': d['name'], 'hostApi': apis[d['hostapi']]['name'],
                        'channels': capacity, 'sampleRate': int(d['default_samplerate']),
                        'checkedConfigurations': checked})
    return devices


def resolve_input(config, devices):
    import sounddevice as sd
    selected = config['device']
    matches = [d for d in devices if d['name'] == selected['name'] and d['hostApi'] == selected['hostApi']]
    if len(matches) != 1:
        raise ValueError('Selected input unavailable or ambiguous. Reconnect it, refresh devices and select it explicitly.')
    device = matches[0]
    width = max(config['channels'])
    if width > device['channels']:
        raise ValueError(f"Selected channel {width} exceeds this device’s {device['channels']} inputs.")
    rates = list(dict.fromkeys([device['sampleRate'], 48000, 44100, 96000])) if config['sampleRate'] == 'auto' else [config['sampleRate']]
    errors = []
    widths = sorted({width, device['channels'], *[c['channels'] for c in device.get('checkedConfigurations', []) if c['channels'] >= width]})
    for rate in rates:
        for capture_width in widths:
            try:
                sd.check_input_settings(device=device['id'], channels=capture_width, dtype='float32', samplerate=rate)
                return device['id'], capture_width, rate
            except Exception as error:
                errors.append(f'{capture_width} ch / {rate} Hz: {error}')
    raise ValueError('Input format unsupported. ' + '; '.join(errors))


class Service:
    def __init__(self, config_path, fixture=False):
        self.path = config_path
        self.config = default_config()
        self.warning = ''
        if self.path.exists():
            try:
                raw = json.loads(self.path.read_text())
                self.config = validate_config(raw)
                if raw.get('version') != 2:
                    self.warning = 'Legacy settings retained in backup; select the mixed input device and channels.'
                    self.path.with_suffix('.legacy.json').write_text(json.dumps(raw, indent=2))
            except (ValueError, TypeError, OSError) as error:
                self.warning = f'Saved configuration unavailable: {error}'
        if self.warning.startswith('Saved configuration unavailable:'):
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
        self.device_selection = None
        self.device_formats = {}
        self.blocks = queue.Queue(maxsize=4)
        self.stop = threading.Event()
        self.last_capture = 0.
        self.origin = time.monotonic()
        self.actual = None
        self.active_stream = None
        self.capture_revision = 0

    def stamp(self):
        return (time.monotonic() - self.origin) * 1000

    def capture(self):
        while not self.stop.is_set():
            config = copy.deepcopy(self.config)
            revision = self.revision
            if not config['channels'] or (config['device'] is None and not self.fixture):
                self.status = 'unconfigured'
                self.actual = None
                self.stop.wait(.1)
                continue
            try:
                self.status = 'connecting'
                if self.fixture:
                    rate = RATE if config['sampleRate'] == 'auto' else config['sampleRate']
                    width = max(config['channels'])
                else:
                    device_id, width, rate = resolve_input(config, audio_devices(probe=False))
                stream_id = str(uuid.uuid4())
                self.actual = {'sampleRate': rate, 'captureChannels': width, 'channels': config['channels']}
                self.capture_revision = revision
                self.stream_id = stream_id
                self.last_capture = 0
                self.status, self.error = ('fixture' if self.fixture else 'connecting'), ''
                if self.fixture:
                    sample = 0
                    deadline = time.monotonic()
                    while not self.stop.is_set() and self.revision == revision:
                        self.enqueue(fixture_block(sample, len(config['channels']), rate), self.stamp(), stream_id, revision)
                        sample += HOP
                        deadline = max(deadline + HOP / rate, time.monotonic())
                        self.stop.wait(max(0, deadline - time.monotonic()))
                    continue
                import sounddevice as sd
                indexes = np.array(config['channels']) - 1
                def callback(data, frames, timing, status):
                    # Copy only selected inputs into a bounded queue; DSP/networking run elsewhere.
                    self.overflows += int(bool(status.input_overflow))
                    self.enqueue(data[:, indexes].copy(), self.stamp(), stream_id, revision)
                stream = sd.InputStream(device=device_id, channels=width, dtype='float32', samplerate=rate,
                                        blocksize=HOP, latency='low', callback=callback)
                self.active_stream = stream
                try:
                    stream.start()
                    opened = time.monotonic()
                    while not self.stop.is_set() and self.revision == revision:
                        if not stream.active or time.monotonic() - max(opened, self.last_capture) > 1:
                            raise RuntimeError('Capture stalled. Check device availability and microphone permission for the app or terminal running Python. Retrying the selected input.')
                        if self.last_capture >= opened:
                            self.status = 'connected'
                        self.stop.wait(.1)
                finally:
                    stream.abort()
                    stream.close()
                    self.active_stream = None
            except Exception as error:
                message = str(error)[:500]
                if self.status != 'unavailable' or self.error != message:
                    logging.warning('Audio input unavailable: %s', message)
                self.status, self.error = 'unavailable', message
                self.actual = None
                self.last_capture = 0
                self.stop.wait(2)

    def enqueue(self, data, timestamp, stream_id=None, revision=None):
        self.last_capture = time.monotonic()
        try:
            self.blocks.put_nowait((data, timestamp, stream_id or self.stream_id, self.revision if revision is None else revision))
        except queue.Full:
            try:
                self.blocks.get_nowait()
            except queue.Empty:
                pass
            self.dropped += 1
            try:
                self.blocks.put_nowait((data, timestamp, stream_id or self.stream_id, self.revision if revision is None else revision))
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
        analyzer = None
        revision, stream_id = 0, ''
        next_send = time.monotonic()
        try:
            while True:
                block = await asyncio.to_thread(self.next_block)
                actual = copy.deepcopy(self.actual) if self.capture_revision == self.revision else None
                rate = actual['sampleRate'] if actual else RATE
                if revision != self.revision or stream_id != self.stream_id or analyzer is None:
                    config = copy.deepcopy(self.config)
                    analyzer = Analyzer(config, rate)
                    revision, stream_id = self.revision, self.stream_id
                    meters, features = analyzer.process(np.zeros((HOP, analyzer.channels), np.float32), self.stamp())
                timestamp = self.stamp()
                fresh = (self.status in {'connected', 'fixture'} and actual is not None and
                         time.monotonic() - self.last_capture < .5)
                if block:
                    samples, captured_time, captured_stream, captured_revision = block
                    if captured_stream == stream_id and captured_revision == revision and fresh:
                        try:
                            meters, features = analyzer.process(samples, captured_time)
                            timestamp = captured_time
                            if self.error.startswith('Invalid captured samples:'):
                                self.error = ''
                        except ValueError as error:
                            self.error = f'Invalid captured samples: {error}'
                            fresh = False
                if not fresh:
                    # A lost input must not retain FFT-window energy or pending transients.
                    analyzer = Analyzer(config, rate)
                    meters, features = analyzer.process(np.zeros((HOP, analyzer.channels), np.float32), timestamp)
                now = time.monotonic()
                if now < next_send:
                    continue
                next_send = max(next_send + 1 / 30, now)
                self.sequence += 1
                payload = {'v': 2, 'type': 'features', 'streamId': stream_id, 'sequence': self.sequence,
                           'timestamp': timestamp, 'revision': revision, 'config': config,
                           'status': self.status, 'error': self.error or self.warning, 'fresh': fresh,
                           'sampleRate': rate, 'actual': actual, 'meters': meters, 'mix': features,
                           'events': analyzer.drain_events() if fresh else [],
                           'health': {'overflows': self.overflows, 'dropped': self.dropped,
                                      'processingMs': max(0, self.stamp() - timestamp),
                                      'captureAgeMs': max(0, (time.monotonic() - self.last_capture) * 1000) if self.last_capture else None}}
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
            selected = ({'name': request.query['name'], 'hostApi': request.query['hostApi']}
                        if request is not None and request.query.get('name') and request.query.get('hostApi') else copy.deepcopy(self.config['device']))
            if not self.fixture and (self.device_task is None or self.device_task.done() or selected != self.device_selection):
                self.device_selection = selected
                loop = asyncio.get_running_loop()
                self.device_task = loop.create_future()
                pending = self.device_task
                requested_selection = copy.deepcopy(selected)
                active_format = (copy.deepcopy(self.actual) if selected == self.config['device'] and
                                 self.status == 'connected' and self.capture_revision == self.revision else None)
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
                        # Format probes can interrupt CoreAudio capture. Use proven/cached formats while live.
                        result = audio_devices(probe=active_format is None, selected=requested_selection)
                        for device in result:
                            key = (device['name'], device['hostApi'])
                            if active_format and requested_selection and key == (requested_selection['name'], requested_selection['hostApi']):
                                known = {'channels': active_format['captureChannels'], 'sampleRate': active_format['sampleRate']}
                                device['checkedConfigurations'] = copy.deepcopy(self.device_formats.get(key, []))
                                if known not in device['checkedConfigurations']:
                                    device['checkedConfigurations'].append(known)
                            elif device['checkedConfigurations']:
                                self.device_formats[key] = copy.deepcopy(device['checkedConfigurations'])
                        error = None
                    except Exception as failure:
                        result, error = None, failure
                    try:
                        loop.call_soon_threadsafe(complete, result, error)
                    except RuntimeError:
                        pass  # A blocked driver must not retain a shutting-down process.
                threading.Thread(target=discover, daemon=True).start()
            devices = ([{'id': -1, 'name': 'Synthetic mixed soundcheck', 'hostApi': 'Fixture', 'channels': 32,
                         'sampleRate': RATE, 'checkedConfigurations': [{'channels': n, 'sampleRate': r} for n in [1, 2, 32] for r in [44100, 48000, 96000]]}]
                       if self.fixture else await asyncio.wait_for(asyncio.shield(self.device_task), timeout=4))
            return web.json_response({'devices': devices, 'fixture': self.fixture})
        except Exception as error:
            message = str(error) or 'Device discovery timed out. Check the input device/driver and restart The Allium if it remains unavailable.'
            return web.json_response({'devices': [], 'fixture': self.fixture, 'error': message}, status=503)

    async def settings(self, request):
        if request.method == 'GET':
            return web.json_response({'config': self.config, 'revision': self.revision})
        try:
            value = await request.json()
            if value.get('revision') != self.revision:
                return web.json_response({'error': 'Settings changed in another tab. Refresh and retry.'}, status=409)
            config = validate_config(value.get('config'))
            if config['device'] is not None and not self.fixture:
                await asyncio.wait_for(asyncio.to_thread(lambda: resolve_input(config, audio_devices(probe=False))), timeout=5)
            if value.get('revision') != self.revision:
                return web.json_response({'error': 'Settings changed in another tab. Discard edits and retry.'}, status=409)
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
        except (ValueError, TypeError, AttributeError, TimeoutError) as error:
            return web.json_response({'error': str(error) or 'Input format check timed out. Check the USB device and retry.'}, status=400)
        except OSError as error:
            return web.json_response({'error': f'Could not save settings: {error}'}, status=500)
        except Exception as error:
            return web.json_response({'error': f'Input configuration failed: {error}'}, status=503)

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
                            await ws.send_json({'v': 2, 'type': 'pong', 'clientTime': value.get('clientTime'), 'timestamp': self.stamp()})
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
    parser = argparse.ArgumentParser(description='The Allium input-only mixed audio analyzer')
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
