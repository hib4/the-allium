"""Bounded, hardware-independent multichannel feature extraction."""
import numpy as np

INSTRUMENTS = ('vocals', 'guitar', 'drums', 'bass', 'piano', 'saxophone')
RATE = 48000
WINDOW = 2048
HOP = 512


def default_config():
    return {'device': None, 'instruments': {
        name: {'channels': [], 'sensitivity': 1.0, 'noiseDb': -60.0, 'pitch': name in ('vocals', 'guitar', 'bass', 'saxophone')}
        for name in INSTRUMENTS}}


def validate_config(value):
    if not isinstance(value, dict) or set(value) != {'device', 'instruments'}:
        raise ValueError('Configuration requires device and instruments.')
    device = value['device']
    if device is not None and (not isinstance(device, dict) or set(device) != {'name', 'hostApi'} or
                               not all(isinstance(v, str) and 0 < len(v) <= 200 for v in device.values())):
        raise ValueError('Choose an audio device and host API.')
    groups = value['instruments']
    # Upgrade only the complete legacy five-instrument shape.
    if isinstance(groups, dict) and set(groups) == set(INSTRUMENTS) - {'saxophone'}:
        groups = {**groups, 'saxophone': default_config()['instruments']['saxophone']}
        value = {**value, 'instruments': groups}
    if not isinstance(groups, dict) or set(groups) != set(INSTRUMENTS):
        raise ValueError('Configure all six instruments.')
    for name, group in groups.items():
        if not isinstance(group, dict) or set(group) != {'channels', 'sensitivity', 'noiseDb', 'pitch'}:
            raise ValueError(f'Invalid settings for {name}.')
        channels = group['channels']
        if not isinstance(channels, list) or len(channels) > 32 or len(set(channels)) != len(channels):
            raise ValueError('Select unique USB channel positions.')
        if any(type(c) is not int or not 1 <= c <= 32 for c in channels):
            raise ValueError('USB channel positions must be 1–32.')
        for key, low, high in [('sensitivity', 0.1, 10), ('noiseDb', -90, -10)]:
            v = group[key]
            if type(v) not in (int, float) or not np.isfinite(v) or not low <= v <= high:
                raise ValueError(f'{key} must be between {low} and {high}.')
        if type(group['pitch']) is not bool:
            raise ValueError('Pitch tracking must be on or off.')
    return value


class Analyzer:
    def __init__(self, config):
        self.config = validate_config(config)
        self.samples = np.zeros((WINDOW, 32), dtype=np.float32)
        self.hann = np.hanning(WINDOW).astype(np.float32)
        self.freq = np.fft.rfftfreq(WINDOW, 1 / RATE)
        self.previous = {i: np.zeros(WINDOW // 2 + 1) for i in INSTRUMENTS}
        self.flux = {i: [] for i in INSTRUMENTS}
        self.last_onset = {i: -1e9 for i in INSTRUMENTS}
        self.clip_until = np.zeros(32)
        self.pending = {i: [] for i in INSTRUMENTS}

    def pitch(self, signal):
        # Normalized autocorrelation; only a monophonic estimate, never chord recognition.
        signal = signal - signal.mean()
        fft = np.fft.rfft(signal, n=WINDOW * 2)
        corr = np.fft.irfft(fft * fft.conj())[:WINDOW]
        lo, hi = int(RATE / 1000), min(WINDOW // 2, int(RATE / 50))
        if corr[0] < 1e-9:
            return None, 0.0
        # Correct for shrinking overlap before comparing periodic peaks.
        corr = corr / np.arange(WINDOW, 0, -1)
        peaks = np.flatnonzero((corr[lo:hi] > corr[lo-1:hi-1]) & (corr[lo:hi] >= corr[lo+1:hi+1])) + lo
        if not len(peaks):
            return None, 0.0
        best = max(corr[p] for p in peaks)
        lag = next(p for p in peaks if corr[p] >= best * .95)
        confidence = float(np.clip(corr[lag] / corr[0], 0, 1))
        if confidence < .75:
            return None, confidence
        offset = .5 * (corr[lag-1] - corr[lag+1]) / (corr[lag-1] - 2*corr[lag] + corr[lag+1] + 1e-12)
        note = float(69 + 12 * np.log2((RATE / (lag + offset)) / 440))
        return float(np.clip(note, 0, 127)), confidence

    def process(self, block, timestamp):
        if block.shape != (HOP, 32) or not np.isfinite(block).all():
            raise ValueError('Expected 512 × 32 finite samples.')
        self.samples[:-HOP] = self.samples[HOP:]
        self.samples[-HOP:] = block
        rms = np.sqrt(np.mean(block ** 2, axis=0))
        peak = np.max(np.abs(block), axis=0)
        power = np.abs(np.fft.rfft(self.samples * self.hann[:, None], axis=0)) ** 2
        self.clip_until[peak >= .999] = timestamp + 1000
        meters = [{'rms': float(r), 'peak': float(p), 'db': float(max(-120, 20*np.log10(max(r, 1e-6)))), 'clip': bool(timestamp < expiry)} for r, p, expiry in zip(rms, peak, self.clip_until)]
        features = {}
        for name in INSTRUMENTS:
            settings = self.config['instruments'][name]
            indexes = np.array(settings['channels'], dtype=int) - 1
            if not len(indexes):
                features[name] = {'intensity': 0., 'bands': [0., 0., 0.], 'spectrum': [0.] * 32, 'pitch': None, 'confidence': 0., 'centroid': 0.}
                continue
            level = float(np.sqrt(np.mean(rms[indexes] ** 2)))
            gate = 10 ** (settings['noiseDb'] / 20)
            active = level > gate
            intensity = float(np.clip((level - gate) * settings['sensitivity'] * 4, 0, 1)) if active else 0.
            spectrum = power[:, indexes].mean(axis=1)
            total = spectrum.sum() + 1e-12
            bands = [float(spectrum[(self.freq >= a) & (self.freq < b)].sum() / total) if active else 0. for a, b in [(20, 250), (250, 4000), (4000, 24001)]]
            centroid = float(np.dot(self.freq, spectrum) / total) if active else 0.
            magnitude = np.sqrt(spectrum) / WINDOW
            flux = float(np.maximum(magnitude - self.previous[name], 0).sum())
            history = self.flux[name]
            threshold = max(.015, (float(np.median(history)) * 2.5 if history else .015))
            if active and flux > threshold and timestamp - self.last_onset[name] >= 100:
                self.pending[name].append({'timestamp': timestamp, 'intensity': intensity,
                                           'articulation': ('kick' if bands[0] > .5 else 'hat' if bands[2] > .35 else 'snare') if name == 'drums' else None})
                self.pending[name] = self.pending[name][-8:]
                self.last_onset[name] = timestamp
            history.append(flux)
            self.flux[name] = history[-90:]
            self.previous[name] = magnitude
            note, confidence = (None, 0.)
            if active and settings['pitch'] and name in ('vocals', 'guitar', 'bass', 'saxophone'):
                strongest = indexes[np.argmax(rms[indexes])]
                note, confidence = self.pitch(self.samples[:, strongest])
            bins = [float(np.clip(np.sqrt(v.mean()) / WINDOW * 8 * settings['sensitivity'], 0, 1)) if active else 0. for v in np.array_split(spectrum, 32)]
            features[name] = {'intensity': intensity, 'bands': bands, 'spectrum': bins, 'pitch': note, 'confidence': confidence, 'centroid': centroid}
        return meters, features

    def drain_events(self):
        events = [{'instrument': i, **e} for i in INSTRUMENTS for e in self.pending[i]]
        self.pending = {i: [] for i in INSTRUMENTS}
        return events


def fixture_block(sample):
    """Illustrative 32-channel soundcheck; fixture channels are not venue assignments."""
    t = (np.arange(HOP) + sample) / RATE
    result = np.zeros((HOP, 32), np.float32)
    for index in range(32):
        frequency = [220, 330, 70, 110, 523][index % 5]
        envelope = np.maximum(0, np.sin(2*np.pi * (1 + index % 3) * t)) ** (8 if index % 5 == 2 else 2)
        result[:, index] = .2 * envelope * np.sin(2*np.pi*frequency*t)
    return result
