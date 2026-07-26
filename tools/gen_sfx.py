"""Generates every sound effect the game plays.

Sounds are synthesised from oscillators and envelopes for the same reason the
art is drawn from primitives rather than sourced: the whole soundtrack is a few
hundred lines of source that regenerates byte-identically, and a new effect is
one function here rather than a file somebody has to find a licence for.

The palette is deliberately narrow - square, saw, triangle and pitched noise,
quantised - because that is what the pixel art sounds like. `volume` is the
sound's place in the mix, not a fix for how hot it synthesised; synth.save
normalises every clip to the same peak.
"""

from synth import (arpeggio, chain, clip, crush, envelope, gain, mix, save,
                   silence, tone)

SOUNDS = []


def sfx(name, volume=1.0):
    def deco(fn):
        SOUNDS.append({'name': name, 'fn': fn, 'volume': volume})
        return fn
    return deco


# ---------------------------------------------------------------- player verbs

@sfx('slash', volume=0.45)
def s_slash():
    """Monoblade. Air first, then the edge of it."""
    air = envelope(tone('noise', (2600, 700), 0.13, seed=11), curve=2.4)
    edge = envelope(tone('saw', (1500, 380), 0.09), attack=0.002, curve=3.0)
    return clip(mix(gain(air, 0.75), gain(edge, 0.4)))


@sfx('shoot', volume=0.35)
def s_shoot():
    """Caseless pistol: a hard click over a very fast downward chirp."""
    click = envelope(tone('noise', (5000, 1800), 0.035, seed=3), curve=3.5)
    body = envelope(tone('square', (1100, 260), 0.085, duty=0.35), curve=2.6)
    return clip(crush(mix(gain(click, 0.7), gain(body, 0.6)), 10))


@sfx('dash', volume=0.4)
def s_dash():
    """Rising whoosh - the i-frames are the point, so it should sound like one."""
    air = envelope(tone('noise', (700, 3200), 0.17, seed=7), attack=0.02, curve=1.6)
    lift = envelope(tone('tri', (300, 900), 0.17), attack=0.03, curve=1.8)
    return clip(mix(gain(air, 0.55), gain(lift, 0.35)))


@sfx('hurt', volume=0.6)
def s_hurt():
    """Taking a hit. Low, square and unpleasant on purpose."""
    body = envelope(tone('square', (260, 70), 0.24, duty=0.28), curve=1.8)
    tear = envelope(tone('noise', (900, 300), 0.12, seed=23), curve=2.5)
    return clip(crush(mix(gain(body, 0.75), gain(tear, 0.35)), 8))


@sfx('death', volume=0.75)
def s_death():
    """Flatline: a long fall with the noise floor rising to meet it."""
    fall = envelope(tone('square', (330, 48), 0.9, duty=0.4), attack=0.01, curve=1.2)
    static = envelope(tone('noise', (600, 120), 0.9, seed=41), attack=0.4, curve=0.8)
    return clip(crush(mix(gain(fall, 0.7), gain(static, 0.3)), 8))


# ---------------------------------------------------------------------- combat

@sfx('hit', volume=0.5)
def s_hit():
    """Landing a blow on something. Short, blunt, no pitch to speak of."""
    thud = envelope(tone('noise', (1400, 420), 0.09, seed=17), curve=2.8)
    snap = envelope(tone('square', (400, 150), 0.06, duty=0.2), curve=3.0)
    return clip(crush(mix(gain(thud, 0.6), gain(snap, 0.5)), 8))


@sfx('enemy_down', volume=0.5)
def s_enemy_down():
    """Something stops working: three steps down, then it comes apart."""
    steps = arpeggio('square', [440, 300, 190], 0.075, duty=0.35)
    debris = envelope(tone('noise', (800, 180), 0.2, seed=29), attack=0.15, curve=1.8)
    return clip(crush(mix(gain(steps, 0.55), gain(debris, 0.4)), 10))


@sfx('alarm', volume=0.55)
def s_alarm():
    """Two-tone corp siren, twice. The drone has seen you."""
    def wail(f):
        return envelope(tone('square', f, 0.16, duty=0.5), attack=0.02,
                        sustain=0.1, curve=1.0)
    return clip(crush(chain(wail(700), wail(480), wail(700), wail(480)), 6))


# ------------------------------------------------------------------- the world

@sfx('pickup', volume=0.45)
def s_pickup():
    """Two notes up. Anything you put in a pocket."""
    return clip(crush(arpeggio('square', [660, 990], 0.055, duty=0.4), 12))


@sfx('nuyen', volume=0.4)
def s_nuyen():
    """Money is brighter and busier than an item, and gets a third note."""
    return clip(crush(arpeggio('square', [880, 1170, 1480], 0.045, duty=0.25), 12))


@sfx('door', volume=0.5)
def s_door():
    """Something heavy releases and slides."""
    clunk = envelope(tone('square', (150, 60), 0.1, duty=0.5), curve=2.2)
    slide = envelope(tone('noise', (420, 900), 0.28, seed=13), attack=0.06, curve=1.4)
    return clip(crush(mix(gain(clunk, 0.7), gain(slide, 0.3)), 10))


@sfx('terminal', volume=0.4)
def s_terminal():
    """Data chatter: four blips with gaps, deliberately not a melody."""
    def blip(f):
        return envelope(tone('square', f, 0.03, duty=0.15), curve=2.0)

    gap = silence(0.022)
    return clip(crush(chain(blip(1500), gap, blip(1180), gap,
                            blip(1650), gap, blip(1320)), 8))


@sfx('deny', volume=0.5)
def s_deny():
    """Locked, empty, refused. One flat buzz that does not resolve."""
    buzz = envelope(tone('square', 105, 0.19, duty=0.22), attack=0.006,
                    sustain=0.1, curve=1.6)
    return clip(crush(buzz, 6))


# ------------------------------------------------------------------- jobs / UI

@sfx('objective', volume=0.45)
def s_objective():
    """One step of a job done. A small nod, not a fanfare."""
    return clip(crush(arpeggio('square', [784, 1046], 0.06, duty=0.3), 12))


@sfx('job', volume=0.5)
def s_job():
    """Work accepted."""
    return clip(crush(arpeggio('square', [523, 659, 784], 0.075, duty=0.35), 12))


@sfx('job_done', volume=0.6)
def s_job_done():
    """Paid. The only thing in the game that gets four notes and a held one."""
    run = arpeggio('square', [523, 659, 784], 0.07, duty=0.35)
    final = envelope(tone('square', 1046, 0.3, duty=0.35), attack=0.006,
                     sustain=0.12, curve=1.5)
    return clip(crush(chain(run, final), 12))


@sfx('save', volume=0.3)
def s_save():
    """Checkpoint. Soft triangle so it never competes with what you are doing."""
    return clip(arpeggio('tri', [784, 1046], 0.06, curve=2.0))


@sfx('select', volume=0.3)
def s_select():
    """Menu cursor. Has to be short enough to hold a key down through."""
    return clip(crush(envelope(tone('square', 720, 0.035, duty=0.25), curve=2.5), 10))


@sfx('confirm', volume=0.4)
def s_confirm():
    """Menu commit."""
    return clip(crush(arpeggio('square', [660, 990], 0.045, duty=0.3), 12))


def build_all(outdir, manifest):
    manifest['sfx'] = {}
    for entry in SOUNDS:
        seconds = save(outdir / f'sfx_{entry["name"]}.wav', entry['fn']())
        manifest['sfx'][entry['name']] = {
            'volume': entry['volume'],
            'seconds': round(seconds, 3),
        }
    return len(SOUNDS)
