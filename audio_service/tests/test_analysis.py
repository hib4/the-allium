import copy
import numpy as np
import pytest
from audio_service.analysis import Analyzer, default_config, validate_config, HOP, RATE


def tone(frequency, samples=HOP, start=0, amplitude=.2):
    return amplitude * np.sin(2*np.pi*frequency*(np.arange(samples)+start)/RATE)


def configured(channels=(11,)):
    config = default_config()
    config['instruments']['guitar']['channels'] = list(channels)
    return config


def test_no_instrument_assignments_by_default():
    assert all(not g['channels'] for g in default_config()['instruments'].values())


@pytest.mark.parametrize('frequency,band', [(100, 0), (1000, 1), (8000, 2)])
def test_individual_channel_spectrum_and_bands(frequency, band):
    analyzer = Analyzer(configured())
    for n in range(8):
        block = np.zeros((HOP, 32), np.float32)
        block[:, 10] = tone(frequency, start=n*HOP)
        meters, features = analyzer.process(block, n*HOP/RATE*1000)
    assert meters[10]['rms'] > .1
    assert meters[0]['rms'] == 0
    assert features['guitar']['bands'][band] > .95
    assert features['guitar']['intensity'] > .4
    assert features['vocals']['intensity'] == 0
    assert len(features['guitar']['spectrum']) == 32


def test_grouping_does_not_cancel_opposite_phase():
    a, b = Analyzer(configured()), Analyzer(configured((11, 12)))
    block = np.zeros((HOP, 32), np.float32)
    block[:, 10] = tone(440)
    block[:, 11] = -block[:, 10]
    _, single = a.process(block, 0)
    _, group = b.process(block, 0)
    assert group['guitar']['intensity'] == pytest.approx(single['guitar']['intensity'])
    assert group['guitar']['bands'] == pytest.approx(single['guitar']['bands'])


def test_pitch_onset_silence_and_clipping():
    analyzer = Analyzer(configured())
    for n in range(8):
        block = np.zeros((HOP, 32), np.float32)
        block[:, 10] = tone(440, start=n*HOP)
        _, features = analyzer.process(block, n*HOP/RATE*1000)
    assert features['guitar']['pitch'] == pytest.approx(69, abs=.15)
    assert features['guitar']['confidence'] > .75
    assert len(analyzer.drain_events()) == 1
    block[:] = 0
    meters, features = analyzer.process(block, 100)
    assert features['guitar']['intensity'] == 0
    assert features['guitar']['pitch'] is None
    assert not analyzer.drain_events()
    block[:, 10] = 1
    meters, _ = analyzer.process(block, 200)
    assert meters[10]['clip']
    meters, _ = analyzer.process(np.zeros_like(block), 300)
    assert meters[10]['clip']
    meters, _ = analyzer.process(np.zeros_like(block), 1300)
    assert not meters[10]['clip']


def test_noise_gate_does_not_invent_notes_or_beats():
    analyzer = Analyzer(configured())
    rng = np.random.default_rng(0)
    for n in range(100):
        block = rng.normal(0, 1e-5, (HOP, 32)).astype(np.float32)
        _, features = analyzer.process(block, n*11)
        assert features['guitar']['intensity'] == 0
    assert analyzer.drain_events() == []


@pytest.mark.parametrize('patch', [{'channels': [0]}, {'channels': [33]}, {'channels': [11, 11]}, {'channels': [True]}, {'sensitivity': float('nan')}, {'noiseDb': 0}, {'pitch': 'yes'}])
def test_config_validation(patch):
    config = configured()
    config['instruments']['guitar'].update(patch)
    with pytest.raises(ValueError):
        validate_config(config)


def test_shared_channels_are_allowed_and_reset_is_clean():
    config = configured()
    config['instruments']['vocals']['channels'] = [11]
    validate_config(config)
    analyzer = Analyzer(config)
    analyzer.process(np.zeros((HOP, 32), np.float32), 0)
    assert analyzer.drain_events() == []

def test_legacy_config_adds_saxophone_and_preserves_assignments():
    config = configured((11, 12))
    del config['instruments']['saxophone']
    upgraded = validate_config(config)
    assert upgraded['instruments']['guitar']['channels'] == [11, 12]
    assert upgraded['instruments']['saxophone'] == default_config()['instruments']['saxophone']
    assert 'saxophone' not in config['instruments']
    del config['instruments']['bass']
    with pytest.raises(ValueError):
        validate_config(config)


def test_saxophone_pitch_and_unmapped_silence():
    config = default_config()
    config['instruments']['saxophone']['channels'] = [16]
    analyzer = Analyzer(config)
    for n in range(8):
        block = np.zeros((HOP, 32), np.float32)
        block[:, 15] = tone(440, start=n*HOP)
        _, features = analyzer.process(block, n*HOP/RATE*1000)
    assert features['saxophone']['intensity'] > .4
    assert features['saxophone']['pitch'] == pytest.approx(69, abs=.15)
    assert features['saxophone']['confidence'] > .75
    assert features['guitar']['intensity'] == 0
    assert any(e['instrument'] == 'saxophone' for e in analyzer.drain_events())
