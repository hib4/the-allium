"""Bounded mixed-input analysis. Stereo power is combined without phase cancellation."""
import copy
import numpy as np

RATE = 48000  # Default for explicit synthetic fixtures only; hardware negotiates its rate.
WINDOW = 2048
HOP = 512


def default_config():
    return {'version': 2, 'device': None, 'channels': [], 'sampleRate': 'auto',
            'sensitivity': 1.0, 'noiseDb': -60.0}


def validate_config(value):
    if not isinstance(value, dict):
        raise ValueError('Expected mixed-input settings.')
    if set(value) == {'device', 'instruments'} and isinstance(value['instruments'], dict):
        # Never guess which legacy instrument assignment carries the venue mix.
        return default_config()
    if set(value) != set(default_config()) or value['version'] != 2:
        raise ValueError('Expected version 2 mixed-input settings.')
    device = value['device']
    if device is not None and (not isinstance(device, dict) or set(device) != {'name', 'hostApi'} or
                               not all(isinstance(v, str) and 0 < len(v) <= 200 for v in device.values())):
        raise ValueError('Choose an audio input device and host API.')
    channels = value['channels']
    if not isinstance(channels, list) or len(channels) > 2 or any(type(c) is not int or not 1 <= c <= 256 for c in channels):
        raise ValueError('Select one mono channel or two stereo channels (1–256).')
    if len(set(channels)) != len(channels) or (device is not None and not channels):
        raise ValueError('Select unique input channels before connecting a device.')
    rate = value['sampleRate']
    if rate != 'auto' and (type(rate) is not int or not 8000 <= rate <= 192000):
        raise ValueError('Sample rate must be auto or 8000–192000 Hz.')
    for key, low, high in [('sensitivity', .1, 10), ('noiseDb', -90, -10)]:
        v = value[key]
        if type(v) not in (int, float) or not np.isfinite(v) or not low <= v <= high:
            raise ValueError(f'{key} must be between {low} and {high}.')
    return copy.deepcopy(value)


class Analyzer:
    def __init__(self, config, sample_rate=RATE):
        self.config = validate_config(config)
        self.rate = sample_rate
        self.channels = max(1, len(self.config['channels']))
        self.samples = np.zeros((WINDOW, self.channels), dtype=np.float32)
        self.hann = np.hanning(WINDOW).astype(np.float32)
        self.freq = np.fft.rfftfreq(WINDOW, 1 / self.rate)
        self.previous = np.zeros(WINDOW // 2 + 1)
        self.flux = []
        self.last_onset = -1e9
        self.clip_until = np.zeros(self.channels)
        self.pending = []
        self.short = self.long = 0.

    def process(self, block, timestamp):
        if block.shape != (HOP, self.channels) or not np.isfinite(block).all():
            raise ValueError(f'Expected {HOP} × {self.channels} finite selected-input samples.')
        self.samples[:-HOP] = self.samples[HOP:]
        self.samples[-HOP:] = block
        rms = np.sqrt(np.mean(block.astype(np.float64) ** 2, axis=0))
        peak = np.max(np.abs(block), axis=0)
        self.clip_until[peak >= .999] = timestamp + 1000
        meters = [{'rms': float(r), 'peak': float(p), 'db': float(max(-120, 20*np.log10(max(r, 1e-6)))),
                   'clip': bool(timestamp < expiry)} for r, p, expiry in zip(rms, peak, self.clip_until)]
        level = float(np.sqrt(np.mean(rms ** 2)))
        gate = 10 ** (self.config['noiseDb'] / 20)
        active = bool(level > gate)
        gain = self.config['sensitivity'] * 4
        intensity = float(np.clip((level - gate) * gain, 0, 1)) if active else 0.
        # Sum channel powers, never average stereo waveforms.
        power = (np.abs(np.fft.rfft(self.samples * self.hann[:, None], axis=0)) ** 2).mean(axis=1)
        total = power.sum() + 1e-12
        fractions = [float(power[(self.freq >= a) & (self.freq < b)].sum() / total)
                     for a, b in [(20, 250), (250, 4000), (4000, self.rate / 2 + 1)]]
        bands = [float(np.clip(level * np.sqrt(f) * gain, 0, 1)) if active else 0. for f in fractions]
        magnitude = np.sqrt(power) / WINDOW
        flux = float(np.maximum(magnitude - self.previous, 0).sum()) if active else 0.
        threshold = max(.015, float(np.median(self.flux)) * 2.5 if self.flux else .015)
        onset = active and flux > threshold and timestamp - self.last_onset >= 160
        if onset:
            self.pending.append({'timestamp': timestamp, 'intensity': intensity})
            self.pending = self.pending[-8:]
            self.last_onset = timestamp
        self.flux = (self.flux + [flux])[-90:]
        self.previous = magnitude if active else np.zeros_like(magnitude)
        seconds = HOP / self.rate
        self.short += (intensity - self.short) * (1 - np.exp(-seconds / .12))
        self.long += (intensity - self.long) * (1 - np.exp(-seconds / 2))
        features = {'rms': level, 'peak': float(peak.max()), 'active': active,
                    'intensity': intensity, 'bands': bands,
                    'spectrum': [float(np.clip(np.sqrt(v.mean()) / WINDOW * gain * 2, 0, 1)) if active else 0.
                                 for v in np.array_split(power, 32)],
                    'centroid': float(np.dot(self.freq, power) / total) if active else 0.,
                    'flux': float(np.clip(flux * gain, 0, 1)),
                    'shortEnergy': float(self.short) if active else 0.,
                    'longEnergy': float(self.long) if active else 0.,
                    'dynamics': float(np.clip(self.short - self.long, -1, 1)) if active else 0.}
        return meters, features

    def drain_events(self):
        events, self.pending = self.pending, []
        return events


def fixture_block(sample, channels=2, sample_rate=RATE):
    """Explicit synthetic mixed soundcheck, never a fallback for physical capture."""
    t = (np.arange(HOP) + sample) / sample_rate
    envelope = np.maximum(0, np.sin(2*np.pi * 2 * t)) ** 4
    transient = .22 * np.exp(-(t % .5) * 45) * np.sin(2*np.pi*90*t)
    mix = transient + .12 * np.sin(2*np.pi*110*t) + .1 * np.sin(2*np.pi*660*t) + .1 * envelope * np.sin(2*np.pi*6000*t)
    return np.column_stack([mix for _ in range(channels)]).astype(np.float32)
