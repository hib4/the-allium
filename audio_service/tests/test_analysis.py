import numpy as np
import pytest
from audio_service.analysis import Analyzer, default_config, validate_config, HOP


def configured(channels=(1,), **patch):
    return {**default_config(), 'channels': list(channels), **patch}


def tone(frequency, start=0, rate=48000, amplitude=.2):
    return (amplitude * np.sin(2*np.pi*frequency*(np.arange(HOP)+start)/rate)).astype(np.float32)


@pytest.mark.parametrize('rate', [44100, 48000, 96000])
@pytest.mark.parametrize('frequency,band', [(100, 0), (1000, 1), (8000, 2)])
def test_bands_use_actual_rate_and_absolute_energy(rate, frequency, band):
    analyzer = Analyzer(configured(), rate)
    for n in range(8):
        meters, features = analyzer.process(tone(frequency, n*HOP, rate)[:, None], n*HOP/rate*1000)
    assert meters[0]['rms'] > .1
    assert features['bands'][band] > .4
    assert all(v < .08 for i, v in enumerate(features['bands']) if i != band)
    assert features['centroid'] == pytest.approx(frequency, abs=35)
    assert len(features['spectrum']) == 32
    assert features['intensity'] > .4


def test_opposite_phase_stereo_matches_mono_power():
    a, b = Analyzer(configured()), Analyzer(configured((11, 12)))
    for n in range(8):
        mono = tone(440, n*HOP)
        _, single = a.process(mono[:, None], n*11)
        meters, stereo = b.process(np.column_stack([mono, -mono]), n*11)
    assert stereo['intensity'] == pytest.approx(single['intensity'])
    assert stereo['bands'] == pytest.approx(single['bands'])
    assert meters[0]['rms'] == pytest.approx(meters[1]['rms'])


def test_silence_noise_and_clipping_are_truthful():
    analyzer = Analyzer(configured())
    for n in range(8):
        analyzer.process(tone(440, n*HOP)[:, None], n*11)
    assert analyzer.drain_events()
    meters, f = analyzer.process(np.zeros((HOP, 1), np.float32), 100)
    assert not f['active'] and f['intensity'] == 0 and f['bands'] == [0, 0, 0]
    assert analyzer.drain_events() == []
    rng = np.random.default_rng(2)
    for n in range(100):
        _, f = analyzer.process(rng.normal(0, 1e-5, (HOP, 1)).astype(np.float32), 200 + n*11)
        assert not f['active'] and f['flux'] == 0
    assert analyzer.drain_events() == []
    meters, _ = analyzer.process(np.ones((HOP, 1), np.float32), 1400)
    assert meters[0]['clip']
    meters, _ = analyzer.process(np.zeros((HOP, 1), np.float32), 1500)
    assert meters[0]['clip']
    meters, _ = analyzer.process(np.zeros((HOP, 1), np.float32), 2500)
    assert not meters[0]['clip']


def test_energy_steps_and_transients_are_bounded():
    analyzer = Analyzer(configured())
    values = []
    for n in range(400):
        amplitude = .03 if n < 100 or n > 300 else .2
        _, f = analyzer.process(tone(440, n*HOP, amplitude=amplitude)[:, None], n*HOP/48)
        values.append(f)
    assert values[200]['shortEnergy'] > values[90]['shortEnergy'] * 3
    assert values[150]['dynamics'] > 0
    assert values[350]['dynamics'] < 0
    events = analyzer.drain_events()
    assert 1 <= len(events) <= 8
    assert all(b['timestamp'] - a['timestamp'] >= 160 for a, b in zip(events, events[1:]))


@pytest.mark.parametrize('patch', [{'channels': [0]}, {'channels': [257]}, {'channels': [1, 1]}, {'channels': [True]}, {'channels': [1, 2, 3]}, {'sensitivity': float('nan')}, {'noiseDb': 0}, {'sampleRate': 0}, {'sampleRate': True}])
def test_rejects_invalid_config(patch):
    with pytest.raises(ValueError): validate_config(configured(**patch))


def test_legacy_config_requires_explicit_mix_selection():
    legacy = {'device': {'name': 'old', 'hostApi': 'Core Audio'}, 'instruments': {'guitar': {'channels': [11]}}}
    assert validate_config(legacy) == default_config()
    assert legacy['instruments']['guitar']['channels'] == [11]


@pytest.mark.parametrize('block', [np.zeros((HOP, 32)), np.full((HOP, 1), np.nan), np.full((HOP, 1), np.inf)])
def test_rejects_bad_pcm(block):
    with pytest.raises(ValueError): Analyzer(configured()).process(block, 0)


@pytest.mark.parametrize('sensitivity', [.1, 1, 10])
def test_microphone_raw_meters_are_independent_of_gate_and_sensitivity(sensitivity):
    block = tone(440, amplitude=.01)[:, None]
    raw = Analyzer(configured(noiseDb=-90, sensitivity=1))
    gated = Analyzer(configured(noiseDb=-10, sensitivity=sensitivity))
    meters, active = raw.process(block, 100)
    gated_meters, silent = gated.process(block, 100)
    assert meters == gated_meters
    assert gated_meters[0]['rms'] > 0 and gated_meters[0]['peak'] > 0
    assert active['active'] and not silent['active'] and silent['intensity'] == 0
    assert gated.drain_events() == []
