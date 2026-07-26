"""Low-level audio synthesis helpers.

The audio counterpart to pixel.py: everything works on a plain list of floats
in -1..1 at a fixed sample rate, so the same routines serve a 40ms blip and a
900ms death sting without knowing which is which. All randomness is seeded
per-call so regenerating assets is byte-reproducible.

Deliberately not named `wave.py`: tools/ is prepended to sys.path, so that name
would shadow the standard library module this file writes its output with.

22050 Hz mono is a period-correct choice as much as a practical one - it is the
sample rate these sounds would have shipped at, and a quarter the bytes of
stereo 44.1k for clips this short.
"""

import math
import random
import struct
import wave

RATE = 22050


def frames(seconds):
    return max(1, int(RATE * seconds))


def silence(seconds):
    return [0.0] * frames(seconds)


def _freq_at(freq, t):
    """`freq` is a constant, or an (start, end) pair glided exponentially.

    Exponential rather than linear because pitch is perceived in ratios: a
    linear sweep from 900 to 300 spends most of its time sounding high.
    """
    if isinstance(freq, (tuple, list)):
        f0, f1 = freq
        return f0 * ((f1 / f0) ** t)
    return freq


def tone(shape, freq, seconds, duty=0.5, seed=0):
    """One oscillator. `shape` is square, saw, tri, sine or noise."""
    n = frames(seconds)
    rng = random.Random(seed)
    out = []
    phase = 0.0
    # Noise holds each sample for a few frames; at full rate it is white hiss
    # with no pitch to it, and the pitch is what makes a hit read as a hit.
    held = 0.0
    hold_for = 0

    for i in range(n):
        t = i / n
        f = _freq_at(freq, t)
        phase = (phase + f / RATE) % 1.0

        if shape == 'square':
            value = 1.0 if phase < duty else -1.0
        elif shape == 'saw':
            value = 2.0 * phase - 1.0
        elif shape == 'tri':
            value = 4.0 * abs(phase - 0.5) - 1.0
        elif shape == 'sine':
            value = math.sin(phase * 2.0 * math.pi)
        elif shape == 'noise':
            if hold_for <= 0:
                held = rng.uniform(-1.0, 1.0)
                hold_for = max(1, int(RATE / max(f, 1.0)))
            hold_for -= 1
            value = held
        else:
            raise ValueError(f'unknown shape "{shape}"')

        out.append(value)
    return out


def envelope(buf, attack=0.004, curve=2.0, sustain=0.0):
    """Short attack ramp, then a power-curve decay to silence.

    The attack is never zero: a waveform that starts at full amplitude clicks,
    and the click is louder than the sound.
    """
    n = len(buf)
    a = min(frames(attack), n)
    hold = min(frames(sustain), n - a)
    tail = max(1, n - a - hold)
    out = []
    for i, sample in enumerate(buf):
        if i < a:
            gain = i / a
        elif i < a + hold:
            gain = 1.0
        else:
            gain = (1.0 - (i - a - hold) / tail) ** curve
        out.append(sample * gain)
    return out


def gain(buf, amount):
    return [sample * amount for sample in buf]


def mix(*bufs):
    """Sum buffers, aligned at the start, length of the longest."""
    n = max(len(buf) for buf in bufs)
    out = [0.0] * n
    for buf in bufs:
        for i, sample in enumerate(buf):
            out[i] += sample
    return out


def chain(*bufs):
    out = []
    for buf in bufs:
        out.extend(buf)
    return out


def crush(buf, levels=12):
    """Quantise amplitude. The grit that separates a chip blip from a beep."""
    step = 2.0 / levels
    return [round(sample / step) * step for sample in buf]


def clip(buf):
    return [max(-1.0, min(1.0, sample)) for sample in buf]


def arpeggio(shape, notes, per_note, duty=0.5, curve=1.4):
    """Play notes back to back, each with its own envelope."""
    return chain(*(
        envelope(tone(shape, note, per_note, duty=duty), curve=curve)
        for note in notes
    ))


def save(path, buf, headroom=0.86):
    """Write 16-bit mono PCM, normalised to a fixed headroom.

    Normalising per sound means the manifest's per-sound volumes describe how
    loud something should be in the mix, rather than compensating for how hot
    its synthesis happened to come out.
    """
    peak = max((abs(sample) for sample in buf), default=0.0)
    scale = (headroom / peak) if peak > 0 else 0.0
    data = b''.join(
        struct.pack('<h', int(max(-1.0, min(1.0, sample * scale)) * 32000))
        for sample in buf
    )
    with wave.open(str(path), 'wb') as fh:
        fh.setnchannels(1)
        fh.setsampwidth(2)
        fh.setframerate(RATE)
        fh.writeframes(data)
    return len(buf) / RATE
