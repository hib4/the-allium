import asyncio
from aiohttp.test_utils import TestClient, TestServer
from audio_service.server import Service, create_app
from audio_service.analysis import default_config


def test_fixture_websocket_config_persistence_and_conflicts(tmp_path):
    async def run():
        path = tmp_path / 'config.json'
        service = Service(path, fixture=True)
        async with TestClient(TestServer(create_app(service, tmp_path))) as client:
            ws = await client.ws_connect('/ws')
            packet = await ws.receive_json(timeout=3)
            assert packet['v'] == 1
            assert packet['status'] == 'fixture'
            assert len(packet['meters']) == 32
            assert all(f['intensity'] == 0 for f in packet['instruments'].values())
            await ws.send_json({'type': 'ping', 'clientTime': 42})
            while True:
                reply = await ws.receive_json(timeout=3)
                if reply['type'] == 'pong':
                    assert reply['clientTime'] == 42
                    break
            config = default_config()
            config['instruments']['guitar']['channels'] = [11, 12]
            response = await client.put('/api/config', json={'config': config, 'revision': 1})
            assert response.status == 200
            assert (await response.json())['revision'] == 2
            assert Service(path).config == config
            assert (await client.put('/api/config', json={'config': config, 'revision': 1})).status == 409
            config['instruments']['guitar']['channels'] = [33]
            assert (await client.put('/api/config', json={'config': config, 'revision': 2})).status == 400
            while True:
                packet = await ws.receive_json(timeout=3)
                if packet['type'] == 'features' and packet['revision'] == 2 and packet['instruments']['guitar']['intensity'] > .1:
                    break
            assert packet['health']['processingMs'] < 100
            assert (await client.get('/api/config', headers={'Origin': 'https://example.com'})).status == 403
            assert (await client.get('/api/unknown')).status == 404
            await ws.close()
    asyncio.run(run())


def test_queues_are_bounded_and_corrupt_config_recovers(tmp_path):
    import numpy as np
    path = tmp_path / 'config.json'
    path.write_text('broken')
    service = Service(path)
    assert service.warning
    for n in range(20):
        service.enqueue(np.zeros((512, 32), np.float32), n)
    assert service.blocks.qsize() == 4
    assert service.dropped == 16


def test_capture_uses_only_explicit_32_channel_input(tmp_path, monkeypatch):
    import sys
    import types
    import numpy as np
    service = Service(tmp_path / 'config.json')
    service.config['device'] = {'name': 'Ui24R test double', 'hostApi': 'Core Audio'}
    settings = []
    class Input:
        def __init__(self, **kwargs):
            settings.append(kwargs)
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def read(self, frames):
            service.stop.set()
            return np.zeros((frames, 32), np.float32), False
    fake = types.SimpleNamespace(query_hostapis=lambda: [{'name': 'Core Audio'}],
        query_devices=lambda: [{'name': 'Ui24R test double', 'hostapi': 0, 'max_input_channels': 32, 'default_samplerate': 48000}],
        check_input_settings=lambda **kwargs: settings.append(kwargs), InputStream=Input)
    monkeypatch.setitem(sys.modules, 'sounddevice', fake)
    service.capture()
    assert service.status == 'connected'
    assert service.blocks.qsize() == 1
    assert all(s['channels'] == 32 and s['samplerate'] == 48000 and s['dtype'] == 'float32' for s in settings)
    assert all(s['device'] == 0 for s in settings)


def test_stereo_device_is_rejected_without_microphone_fallback(tmp_path, monkeypatch):
    import sys
    import types
    service = Service(tmp_path / 'config.json')
    service.config['device'] = {'name': 'Stereo test double', 'hostApi': 'Core Audio'}
    fake = types.SimpleNamespace(query_hostapis=lambda: [{'name': 'Core Audio'}],
        query_devices=lambda: [{'name': 'Stereo test double', 'hostapi': 0, 'max_input_channels': 2, 'default_samplerate': 48000}])
    monkeypatch.setitem(sys.modules, 'sounddevice', fake)
    monkeypatch.setattr(service.stop, 'wait', lambda _: service.stop.set())
    service.capture()
    assert service.status == 'unavailable'
    assert 'fewer than 32' in service.error
    assert service.blocks.qsize() == 0


def test_health_host_validation_backup_and_shutdown_guard(tmp_path):
    async def run():
        path = tmp_path / 'settings.json'
        service = Service(path, fixture=True)
        async with TestClient(TestServer(create_app(service, tmp_path))) as client:
            health = await (await client.get('/api/health')).json()
            assert health['application'] == 'The Allium'
            assert health['fixture'] is True
            assert (await client.post('/api/shutdown')).status == 403
            assert (await client.get('/api/health', headers={'Host':'evil.example'})).status == 403
            original = default_config()
            assert (await client.put('/api/config',json={'config':original,'revision':1})).status == 200
            modified = default_config()
            modified['instruments']['guitar']['channels'] = [11]
            assert (await client.put('/api/config',json={'config':modified,'revision':2})).status == 200
            path.write_text('corrupt')
            recovered = Service(path)
            assert recovered.config == original
            assert 'Recovered' in recovered.warning
    asyncio.run(run())


def test_device_discovery_is_single_flight_and_retryable(tmp_path, monkeypatch):
    import threading
    import time
    import audio_service.server as module
    calls = []
    entered = threading.Event()
    release = threading.Event()
    def discovery():
        calls.append(1)
        entered.set()
        release.wait(2)
        return []
    monkeypatch.setattr(module, 'audio_devices', discovery)
    async def run():
        service = Service(tmp_path / 'settings.json')
        first = asyncio.create_task(service.devices(None))
        while not entered.is_set():
            await asyncio.sleep(.01)
        second = asyncio.create_task(service.devices(None))
        await asyncio.sleep(.02)
        assert len(calls) == 1
        release.set()
        assert (await first).status == 200
        assert (await second).status == 200
        assert (await service.devices(None)).status == 200
        assert len(calls) == 2
    asyncio.run(run())

def test_legacy_saved_config_and_backup_recovery(tmp_path):
    import json
    path = tmp_path / 'config.json'
    legacy = default_config()
    legacy['instruments']['guitar']['channels'] = [11, 12]
    del legacy['instruments']['saxophone']
    path.write_text(json.dumps(legacy))
    assert Service(path).config['instruments']['guitar']['channels'] == [11, 12]
    assert Service(path).config['instruments']['saxophone']['channels'] == []
    path.with_suffix('.bak').write_text(json.dumps(legacy))
    path.write_text('broken')
    recovered = Service(path)
    assert recovered.config['instruments']['guitar']['channels'] == [11, 12]
    assert recovered.config['instruments']['saxophone']['pitch'] is True
