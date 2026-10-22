import asyncio
import json
import sys
import types
import numpy as np
import pytest
from aiohttp.test_utils import TestClient, TestServer
from audio_service.server import Service, create_app, resolve_input, audio_devices
from audio_service.analysis import default_config, HOP


def configured(channels=(1, 2), rate='auto'):
    return {**default_config(), 'device': {'name': 'USB mix', 'hostApi': 'Core Audio'}, 'channels': list(channels), 'sampleRate': rate}


def test_fixture_websocket_persistence_conflicts_and_guards(tmp_path):
    async def run():
        path = tmp_path / 'config.json'
        service = Service(path, fixture=True)
        async with TestClient(TestServer(create_app(service, tmp_path))) as client:
            ws = await client.ws_connect('/ws')
            packet = await ws.receive_json(timeout=3)
            assert packet['v'] == 2 and not packet['fresh'] and packet['mix']['intensity'] == 0
            assert packet['health']['captureAgeMs'] is None
            config = configured((11, 12), 44100)
            response = await client.put('/api/config', json={'config': config, 'revision': 1})
            assert response.status == 200
            assert Service(path).config == config
            assert (await client.put('/api/config', json={'config': config, 'revision': 1})).status == 409
            for _ in range(100):
                packet = await ws.receive_json(timeout=3)
                if packet['fresh'] and packet['mix']['intensity'] > .1: break
            assert packet['sampleRate'] == 44100
            assert 0 <= packet['health']['captureAgeMs'] < 500
            assert len(packet['meters']) == 2 and packet['actual']['captureChannels'] == 12
            assert packet['mix']['intensity'] > .1
            await ws.send_json({'type': 'ping', 'clientTime': 42})
            for _ in range(100):
                reply = await ws.receive_json(timeout=3)
                if reply['type'] == 'pong': break
            assert reply['clientTime'] == 42 and reply['v'] == 2
            assert (await client.get('/api/config', headers={'Origin': 'https://example.com'})).status == 403
            assert (await client.get('/api/health', headers={'Host': 'evil.example'})).status == 403
            assert (await client.post('/api/shutdown')).status == 403
            assert (await client.get('/api/unknown')).status == 404
            config['channels'] = [1, 1]
            assert (await client.put('/api/config', json={'config': config, 'revision': 2})).status == 400
            await ws.close()
    asyncio.run(run())


def fake_driver(monkeypatch, capacity=2, rate=44100, reject=None, read=None, name='USB mix'):
    settings = []
    def check(**kw):
        settings.append(kw)
        if reject and reject(kw): raise ValueError('Unsupported test format')
    class Input:
        def __init__(self, **kw): self.kw = kw; settings.append(kw); self.active = False
        def start(self):
            self.active = True
            if read: read(self)
        def abort(self): self.active = False
        def close(self): pass
    driver = types.SimpleNamespace(query_hostapis=lambda: [{'name': 'Core Audio'}],
        query_devices=lambda: [{'name': name, 'hostapi': 0, 'max_input_channels': capacity, 'default_samplerate': rate}],
        check_input_settings=check, InputStream=Input)
    monkeypatch.setitem(sys.modules, 'sounddevice', driver)
    return settings


@pytest.mark.parametrize('channels,capacity,rate', [([1], 1, 44100), ([1, 2], 2, 48000), ([11, 12], 32, 96000)])
def test_capture_selects_only_requested_inputs(monkeypatch, tmp_path, channels, capacity, rate):
    service = Service(tmp_path / 'config.json')
    service.config = configured(channels)
    def read(stream):
        block = np.tile(np.arange(capacity, dtype=np.float32), (HOP, 1))[:, :stream.kw['channels']]
        stream.kw['callback'](block, HOP, None, types.SimpleNamespace(input_overflow=False))
        service.stop.set()
    settings = fake_driver(monkeypatch, capacity, rate, read=read)
    service.capture()
    opened = [s for s in settings if 'callback' in s]
    assert len(opened) == 1
    assert opened[0]['channels'] == max(channels) and opened[0]['samplerate'] == rate
    assert opened[0]['dtype'] == 'float32'
    data, _, _, _ = service.next_block()
    assert data.shape == (HOP, len(channels))
    assert data[0].tolist() == [c - 1 for c in channels]


def test_exact_format_validation_auto_and_no_device_fallback(monkeypatch):
    fake_driver(monkeypatch, reject=lambda s: s['samplerate'] != 48000)
    devices = audio_devices(selected=configured()['device'])
    assert devices[0]['channels'] == 2
    assert all(c['sampleRate'] == 48000 for c in devices[0]['checkedConfigurations'])
    assert resolve_input(configured(), devices) == (0, 2, 48000)
    with pytest.raises(ValueError, match='unsupported'): resolve_input(configured(rate=44100), devices)
    with pytest.raises(ValueError, match='exceeds'): resolve_input(configured((12,)), devices)
    with pytest.raises(ValueError, match='unavailable'): resolve_input(configured(), [])
    with pytest.raises(ValueError, match='ambiguous'): resolve_input(configured(), devices * 2)


def test_device_disconnect_then_reconnect(monkeypatch, tmp_path):
    service = Service(tmp_path / 'config.json')
    service.config = configured()
    attempts = []
    def read(stream):
        attempts.append(1)
        if len(attempts) == 1: raise RuntimeError('USB removed')
        stream.kw['callback'](np.zeros((HOP, 2), np.float32), HOP, None, types.SimpleNamespace(input_overflow=False))
        service.stop.set()
    fake_driver(monkeypatch, read=read)
    waits = []
    original_wait = service.stop.wait
    def wait(seconds):
        waits.append((seconds, service.status))
        if len(waits) > 4: service.stop.set()
        return original_wait(0)
    monkeypatch.setattr(service.stop, 'wait', wait)
    service.capture()
    assert len(attempts) == 2 and (2, 'unavailable') in waits
    assert service.blocks.qsize() == 1


def test_stalled_capture_watchdog(monkeypatch, tmp_path):
    import audio_service.server as module
    service = Service(tmp_path / 'config.json')
    service.config = configured()
    fake_driver(monkeypatch)
    now = [100.]
    monkeypatch.setattr(module.time, 'monotonic', lambda: now[0])
    def wait(seconds):
        if seconds == 2: service.stop.set()
        now[0] += .6
    monkeypatch.setattr(service.stop, 'wait', wait)
    service.capture()
    assert service.status == 'unavailable' and 'stalled' in service.error
    assert service.active_stream is None and service.last_capture == 0


def test_queue_backup_and_legacy_preservation(tmp_path):
    path = tmp_path / 'config.json'
    path.write_text('broken')
    path.with_suffix('.bak').write_text(json.dumps(configured()))
    service = Service(path)
    assert service.config == configured() and 'Recovered' in service.warning
    for n in range(20): service.enqueue(np.zeros((HOP, 2), np.float32), n)
    assert service.blocks.qsize() == 4 and service.dropped == 16
    legacy = {'device': None, 'instruments': {}}
    path.write_text(json.dumps(legacy))
    path.with_suffix('.bak').unlink()
    service = Service(path)
    assert service.config == default_config()
    assert json.loads(path.with_suffix('.legacy.json').read_text()) == legacy


def test_device_discovery_single_flight_and_retryable(tmp_path, monkeypatch):
    import threading
    import audio_service.server as module
    calls, release = [], threading.Event()
    def discovery(**kwargs): calls.append(1); release.wait(2); return []
    monkeypatch.setattr(module, 'audio_devices', discovery)
    async def run():
        service = Service(tmp_path / 'settings.json')
        first = asyncio.create_task(service.devices(None))
        await asyncio.sleep(.02)
        second = asyncio.create_task(service.devices(None))
        await asyncio.sleep(.02)
        assert len(calls) == 1
        release.set()
        assert (await first).status == 200 and (await second).status == 200
        assert (await service.devices(None)).status == 200
        assert len(calls) == 2
    asyncio.run(run())


def test_interface_can_require_full_capture_width(monkeypatch):
    fake_driver(monkeypatch, capacity=32, reject=lambda s: s['channels'] != 32)
    assert resolve_input(configured((11, 12)), audio_devices(selected=configured()['device'])) == (0, 32, 44100)


def test_atomic_revision_recheck_after_preflight(tmp_path, monkeypatch):
    import threading
    import audio_service.server as module
    entered, release = threading.Event(), threading.Event()
    monkeypatch.setattr(module, 'audio_devices', lambda **kwargs: [])
    def resolve(config, devices):
        entered.set(); release.wait(2); return (0, 2, 48000)
    monkeypatch.setattr(module, 'resolve_input', resolve)
    async def run():
        service = Service(tmp_path / 'config.json')
        async with TestClient(TestServer(create_app(service, tmp_path))) as client:
            first = asyncio.create_task(client.put('/api/config', json={'config': configured(), 'revision': 1}))
            for _ in range(100):
                if entered.is_set(): break
                await asyncio.sleep(.01)
            second = await client.put('/api/config', json={'config': default_config(), 'revision': 1})
            assert second.status == 200
            release.set()
            assert (await first).status == 409
            assert service.config == default_config() and service.revision == 2
    asyncio.run(run())


@pytest.mark.parametrize('rate', [44100, 48000])
def test_macbook_microphone_is_explicit_mono_coreaudio(monkeypatch, tmp_path, rate):
    service = Service(tmp_path / 'microphone.json')
    service.config = configured((1,))
    service.config['device']['name'] = 'MacBook Pro Microphone'
    def read(stream):
        stream.kw['callback'](np.full((HOP, 1), .02, np.float32), HOP, None, types.SimpleNamespace(input_overflow=False))
        service.stop.set()
    settings = fake_driver(monkeypatch, capacity=1, rate=rate, read=read, name='MacBook Pro Microphone')
    service.capture()
    opened = [s for s in settings if 'callback' in s]
    assert len(opened) == 1 and opened[0]['device'] == 0
    assert opened[0]['channels'] == 1 and opened[0]['samplerate'] == rate
    assert service.actual == {'sampleRate': rate, 'captureChannels': 1, 'channels': [1]}
    assert service.next_block()[0].shape == (HOP, 1)


@pytest.mark.parametrize('failure', [PermissionError('Microphone access denied'), RuntimeError('CoreAudio input cannot open')])
def test_microphone_open_failure_is_diagnostic_without_fallback(monkeypatch, tmp_path, failure):
    service = Service(tmp_path / 'microphone.json')
    service.config = configured((1,))
    service.config['device']['name'] = 'MacBook Pro Microphone'
    def read(stream): raise failure
    settings = fake_driver(monkeypatch, capacity=1, name='MacBook Pro Microphone', read=read)
    monkeypatch.setattr(service.stop, 'wait', lambda _: service.stop.set())
    service.capture()
    assert service.status == 'unavailable' and str(failure) in service.error
    assert service.blocks.empty() and service.actual is None and service.active_stream is None
    assert len([s for s in settings if 'callback' in s]) == 1
    assert not service.fixture


def test_capture_preflight_does_not_probe_unselected_devices(monkeypatch, tmp_path):
    import audio_service.server as module
    service = Service(tmp_path / 'microphone.json')
    service.config = configured((1,))
    service.config['device']['name'] = 'MacBook Pro Microphone'
    def read(stream):
        stream.kw['callback'](np.zeros((HOP, 1), np.float32), HOP, None, types.SimpleNamespace(input_overflow=False))
        service.stop.set()
    settings = fake_driver(monkeypatch, capacity=1, rate=48000, read=read, name='MacBook Pro Microphone')
    driver = sys.modules['sounddevice']
    driver.query_devices = lambda: [
        {'name': 'Unrelated microphone', 'hostapi': 0, 'max_input_channels': 1, 'default_samplerate': 48000},
        {'name': 'MacBook Pro Microphone', 'hostapi': 0, 'max_input_channels': 1, 'default_samplerate': 48000},
    ]
    service.capture()
    assert settings and all(s['device'] == 1 for s in settings)
    assert service.blocks.qsize() == 1


def test_discovery_probes_only_the_requested_device(monkeypatch):
    settings = fake_driver(monkeypatch, capacity=1, name='MacBook Pro Microphone')
    driver = sys.modules['sounddevice']
    driver.query_devices = lambda: [
        {'name': 'Unrelated microphone', 'hostapi': 0, 'max_input_channels': 1, 'default_samplerate': 48000},
        {'name': 'MacBook Pro Microphone', 'hostapi': 0, 'max_input_channels': 1, 'default_samplerate': 48000},
    ]
    reported = audio_devices()
    assert len(reported) == 2 and not settings
    checked = audio_devices(selected={'name': 'MacBook Pro Microphone', 'hostApi': 'Core Audio'})
    assert checked[1]['checkedConfigurations'] and not checked[0]['checkedConfigurations']
    assert settings and all(s['device'] == 1 for s in settings)


def test_refresh_does_not_probe_formats_on_active_microphone(monkeypatch, tmp_path):
    settings = fake_driver(monkeypatch, capacity=1, rate=48000, name='MacBook Pro Microphone')
    async def run():
        service = Service(tmp_path / 'microphone.json')
        service.config = configured((1,))
        service.config['device']['name'] = 'MacBook Pro Microphone'
        service.status = 'connected'
        service.capture_revision = service.revision
        service.actual = {'sampleRate': 48000, 'captureChannels': 1, 'channels': [1]}
        response = await service.devices(None)
        assert response.status == 200 and not settings
        devices = json.loads(response.body)['devices']
        assert devices[0]['checkedConfigurations'] == [{'channels': 1, 'sampleRate': 48000}]
    asyncio.run(run())
