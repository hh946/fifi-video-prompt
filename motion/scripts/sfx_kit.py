"""Voiceover sound-effect kit: the small set of effects a voiceover video keeps using, all synthesised in code; change a number, change the sound.

Two parts:
1. PRESETS: synthesised sounds. Each is a parameter table (frequencies, durations, decays ...) rendered by one of the generic
   generators ("engines") below. They are short, bright UI-style effects; nothing is sampled.
2. KIT: the catalogue of the whole kit. The PRESETS sounds plus the legacy sounds from sfx.py, grouped by what the picture is doing,
   with whether they work under speech, where they come from and their status.
   Voiceover animations pick their sounds from this catalogue. Heavy, muffled sounds are deliberately left out.

Usage:
  python3 sfx_kit.py --list                         list the kit
  python3 sfx_kit.py --audition out.wav             render everything into one audition file (optionally pitch=1.06 bright=0.3 len=0.9 seed=2)
  python3 sfx_kit.py --export <dir>                 export every sound as wav (default + two variants) into <dir>/wav
  python3 sfx_kit.py --page <dir>                   export + an HTML audition page in <dir> (an optional refs.json there adds reference clips)

In a video (timeline.js):
  window.SFX_KIT = { pitch: 1.06, bright: 0.2, len: 0.9, seed: 3 };   // this video's "colour": the whole kit shifts a little, constant within one video
  const SFX = [[T.tagIn, 'tik'], [T.title, 'sparkle', { bright: 0.4 }]];   // [t, name, { options }]; a single cue can also adjust bright / len / pitch
  With SFX_KIT set, kit sounds without gain use a level-matched default volume (every sound about equally loud); set the overall
  level against voice and music in your final mix.
  Without SFX_KIT nothing changes: older videos re-render with the same sound.

Four knobs (all optional):
  pitch   pitch factor. 1.06 ≈ one semitone up. Pitched sounds are then snapped to the key of the video's BGM.
  bright  −1…1. Positive = brighter, crisper (more and longer highs), negative = darker, softer.
  len     duration factor. 0.8 shorter and drier, 1.3 longer.
  seed    random seed. Sounds with random grains (sparkle, riffle ...) get a different arrangement per seed.
Legacy sounds (from sfx.py) only take pitch and seed.

Requires: numpy scipy
"""
import json
import os
import sys

import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
_host = None        # the sfx.py module (registered by install); legacy sounds come from it


# ---------------- helpers ----------------
def _t(d):
    return np.arange(max(1, int(d * SR))) / SR


def _band(x, lo, hi, order=2):
    lo, hi = max(20.0, lo), min(hi, SR / 2 * 0.98)
    if lo <= 25:
        return sosfilt(butter(order, hi, 'lowpass', fs=SR, output='sos'), x)
    if hi >= SR / 2 * 0.97:
        return sosfilt(butter(order, lo, 'highpass', fs=SR, output='sos'), x)
    return sosfilt(butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)


def _put(out, x, at):
    i = int(at * SR)
    if i < len(out):
        n = min(len(x), len(out) - i)
        out[i:i + n] += x[:n]


def _tilt(b):
    """bright -> gain factor for the high-frequency part (±6 dB)"""
    return 10 ** (b * 6 / 20)


# ---------------- engines: parameter table P + knobs (p pitch, b brightness, L length) -> waveform ----------------
def e_partials(rng, P, d, p, b, L):
    """A few sine partials, each with its own level and decay. A struck metal / glass / small tick."""
    t = _t(d)
    s = np.zeros(len(t))
    f0 = min(f for f, _, _ in P['partials'])
    for f, a, tau in P['partials']:
        hi = f > f0 * 1.05
        s += a * (_tilt(b) if hi else 1) * np.sin(2 * np.pi * f * p * t + rng.uniform(0, 6.28)) * np.exp(-t / (tau * L * (1 + 0.3 * b if hi else 1)))
    s *= np.minimum(1, t / P.get('attack', 0.002))
    if P.get('click'):
        s += _band(rng.standard_normal(len(t)), 3000, 20000) * np.exp(-t / 0.0015) * P['click']
    return s


def e_hiss(rng, P, d, p, b, L):
    """A burst of band-passed noise: soft attack, exponential release. A small hiss / breath."""
    t = _t(d)
    k = 2 ** (0.35 * b)
    env = (1 - np.exp(-t / (P['attack'] * L))) * np.exp(-np.maximum(t - P.get('hold', 0) * L, 0) / (P['tau'] * L))
    s = _band(rng.standard_normal(len(t)), P['lo'] * p * k, P['hi'] * p * k) * env
    if P.get('under'):
        lo, hi, a = P['under']
        s += _band(rng.standard_normal(len(t)), lo * p, hi * p) * env * a
    return s


def e_glide(rng, P, d, p, b, L):
    """One gliding sine from f0 to f1. A pop (fast in, fast out) / a chirp (gets louder as it glides, swell)."""
    t = _t(d)
    g = P['glide'] * L
    k = np.clip(t / g, 0, 1) ** P.get('curve', 1.0)
    f = P['f0'] * p * (P['f1'] / P['f0']) ** k
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph)
    for m, a in P.get('harm', []):
        s += a * _tilt(b) * np.sin(m * ph)
    if P.get('swell'):
        env = np.where(t < g, (0.15 + 0.85 * (t / g) ** P.get('pw', 1.5)), np.exp(-(t - g) / (P['tau'] * L)))
        env *= np.minimum(1, t / 0.004)
    else:
        env = np.minimum(1, t / P.get('attack', 0.003)) * (np.exp(-t / (P['tau'] * L)) + P.get('tail', 0) * np.exp(-t / (P.get('tau2', 0.08) * L)))
    s *= env
    if P.get('click'):
        s += _band(rng.standard_normal(len(t)), 1500, 12000) * np.exp(-t / 0.002) * P['click'] * _tilt(b)
    return s


def e_arp(rng, P, d, p, b, L):
    """A run of very short notes stepping up (or down). Optionally layered with a noise 'tsk'."""
    out = np.zeros(len(_t(d)))
    step = P['step'] * L
    fs = [P['root'] * 2 ** (st / 12) for st in P['semis']] if 'semis' in P else P['freqs']
    n = len(fs)
    for i, f in enumerate(fs):
        last = i == n - 1
        u = _t(step * (4 if last else 1.6))
        tau = (P.get('ring', 0.03) if last else P.get('tau', 0.012)) * L
        a = P.get('amp0', 0.5) + (1 - P.get('amp0', 0.5)) * i / max(1, n - 1)
        x = np.sin(2 * np.pi * f * p * u)
        for m, ha in P.get('harm', []):
            x += ha * _tilt(b) * np.sin(2 * np.pi * f * p * m * u)
        _put(out, x * np.minimum(1, u / 0.002) * np.exp(-u / tau) * a, i * step)
    if P.get('noise'):
        at, lo, hi, tau, a = P['noise']
        u = _t(tau * L * 6)
        k = 2 ** (0.35 * b)
        _put(out, _band(rng.standard_normal(len(u)), lo * k, hi * k) * np.minimum(1, u / 0.003) * np.exp(-u / (tau * L)) * a, at * L)
    for f, a, tau in P.get('tail', []):                             # a few thin lines left ringing after the 'tsk'
        u = _t(tau * L * 5)
        _put(out, np.sin(2 * np.pi * f * p * u + rng.uniform(0, 6.28)) * np.minimum(1, u / 0.004) * np.exp(-u / (tau * L)) * a * _tilt(b), P['noise'][0] * L if P.get('noise') else n * step)
    if P.get('echo'):                                               # a soft repeat (echo)
        dly, a = P['echo']
        i = int(dly * L * SR)
        out[i:] += out[:len(out) - i] * a
    return out


def e_grains(rng, P, d, p, b, L):
    """Sparkle: dozens of very short high notes scattered at random, over a soft breath bed."""
    t = _t(d)
    out = np.zeros(len(t))
    lo, hi = P['f'][0] * p * 2 ** (0.3 * b), P['f'][1] * p * 2 ** (0.2 * b)
    span = P['span'] * L
    for _ in range(int(P['n'] * (1 + 0.4 * b))):
        at = span * rng.beta(P.get('early', 1.6), 3.2)            # dense at the start, sparse later
        f = min(lo * (hi / lo) ** rng.random(), SR * 0.45)
        u = _t(rng.uniform(*P['glen']) * L)
        g = np.sin(2 * np.pi * f * u) * np.sin(np.pi * u / u[-1]) ** 2 if len(u) > 2 else u
        _put(out, g * rng.uniform(0.3, 1.0) * min(1.0, 0.35 + at / (P.get('rise', 0.1) * L)) * (1 - 0.5 * at / span), at)
    for i, f in enumerate(P.get('stairs', [])):                    # a few small rising steps at the start
        u = _t(0.035 * L)
        _put(out, np.sin(2 * np.pi * min(f * p, SR * 0.45) * u) * np.sin(np.pi * u / u[-1]) ** 2 * 0.8, i * 0.035 * L)
    bed = P['bed']
    env = (1 - np.exp(-t / (bed['attack'] * L))) * np.exp(-np.maximum(t - bed['attack'] * L, 0) / (bed['tau'] * L))
    out += _band(rng.standard_normal(len(t)), bed['lo'] * p, bed['hi'] * p) * env * bed['amp']
    return out


def e_cluster(rng, P, d, p, b, L):
    """A cluster of sustained high partials that slowly lights up, shimmers slightly, then fades. Glow, outline lighting up."""
    t = _t(d)
    s = np.zeros(len(t))
    for f, a in P['partials']:
        trem = 1 + P.get('shimmer', 0.3) * np.sin(2 * np.pi * rng.uniform(9, 19) * t + rng.uniform(0, 6.28))
        s += a * np.sin(2 * np.pi * f * p * t + rng.uniform(0, 6.28)) * trem
    att, hold = P['attack'] * L, P['hold'] * L
    k = np.clip(t / att, 0, 1)
    env = k * k * (3 - 2 * k) * np.exp(-np.maximum(t - att - hold, 0) / (P['tau'] * L))
    s *= env
    if P.get('air'):
        s += _band(rng.standard_normal(len(t)), 7000 * 2 ** (0.3 * b), 16000) * env * P['air'] * _tilt(b)
    return s


def e_flutter(rng, P, d, p, b, L):
    """A train of short noise bursts getting faster and louder, ending with one settling tap. Riffling paper / cards. Total length follows dur."""
    out = np.zeros(len(_t(d + 0.15)))
    pos, k = 0.0, 2 ** (0.35 * b)
    end = max(0.2, d - 0.06)
    while pos < end:
        q = pos / end
        u = _t(P['blen'] * rng.uniform(0.7, 1.3))
        x = _band(rng.standard_normal(len(u)), P['lo'] * p * k, P['hi'] * p * k) * np.minimum(1, u / 0.001) * np.exp(-u / (P['blen'] / 3))
        _put(out, x * (P['amp0'] + (1 - P['amp0']) * q ** 1.5) * rng.uniform(0.7, 1.0), pos)
        pos += (P['gap0'] * (P['gap1'] / P['gap0']) ** q) * rng.uniform(0.85, 1.15)
    if P.get('bed'):
        u = _t(end)
        _put(out, _band(rng.standard_normal(len(u)), P['lo'] * p * k, P['hi'] * p * k) * (u / end) ** 2 * P['bed'], 0)
    if P.get('tap'):
        u = _t(0.05)
        _put(out, _band(rng.standard_normal(len(u)), 900 * p, 5000 * p) * np.minimum(1, u / 0.001) * np.exp(-u / 0.012) * P['tap'], end)
    return out


def e_tally(rng, P, d, p, b, L):
    """Number flip: a run of very dry ticks (one main resonance at P['f'] + a weak one at 2× + a 1 ms broadband noise head, -20 dB within 4 ms).
    The first tick is at 0, spacing starts at gap0 and is multiplied by grow each time (sparser and sparser); the last tick lands on d
    (the frame the number settles), a bit louder (× last). A tick less than merge s before d is merged into the last one. Length follows dur, ignores len."""
    out = np.zeros(len(_t(d + 0.05)))
    k = 2 ** (0.25 * b)

    def flick():
        u = _t(0.03)
        f = P['f'] * p * k * (1 + rng.uniform(-.04, .04))
        x = np.sin(2 * np.pi * f * u) * np.exp(-u / P['tau']) + P['h2'] * np.sin(2 * np.pi * 2 * f * u + 1.1) * np.exp(-u / (P['tau'] * .7))
        nz = _band(rng.standard_normal(len(u)), 900 * p * k, 5200 * p * k) * np.exp(-u / .0008)
        x = x + P['noise'] * nz / (np.max(np.abs(nz)) + 1e-9)
        return x * np.minimum(1, u / .0003) / (np.max(np.abs(x)) + 1e-9)
    ts, gap, t = [0.0], P['gap0'], 0.0
    while t + gap < d - P['merge']:
        t += gap
        ts.append(t)
        gap = max(gap * P['grow'], 0.025)          # with grow < 1 (accelerating) the spacing bottoms out at 25 ms, otherwise it would never reach d
    if d > 0.05:
        ts.append(d)
    for i, t in enumerate(ts):
        _put(out, flick() * (P['last'] if i == len(ts) - 1 and len(ts) > 1 else 1.0), t)
    return out


def e_swap(rng, P, d, p, b, L):
    """Card swap "click-clack": two noise clicks, the second gap s later and second_db quieter. Each click is a few noise bands
    (each normalised to the same RMS, then weighted by w1 / w2), decaying with tau; the first also gets a damped sine 'body' at body_f.
    bright shifts the bands up, len stretches the gap."""
    k = 2 ** (0.25 * b)
    out = np.zeros(len(_t(P['gap'] * L + 0.06)))

    def click(w, body):
        u = _t(0.03)
        x = np.zeros(len(u))
        for (lo, hi), a in zip(P['bands'], w):
            y = _band(rng.standard_normal(len(u)), lo * p * k, hi * p * k)
            x += a * y / (np.sqrt(np.mean(y ** 2)) + 1e-12)
        x *= np.exp(-u / P['tau'])
        x /= np.max(np.abs(x)) + 1e-9
        if body:
            x += body * np.sin(2 * np.pi * P['body_f'] * p * (1 + rng.uniform(-.03, .03)) * u) * np.exp(-u / (P['tau'] * 1.2)) * _tilt(-b)
        return x * np.minimum(1, u / .0004)
    _put(out, click(P['w1'], P['body']), 0.0)
    _put(out, click(P['w2'], 0) * 10 ** (P['second_db'] / 20), P['gap'] * L)
    return out


def e_clicks(rng, P, d, p, b, L):
    """A few very short noise clicks: each hit has its own time at, level a, bands ([(lo, hi, level)] layered), decay tau (main)
    + tail ((level, tau), a slower tail); the table's order (one per table) is the band-filter steepness (default 2; 3–4 is steeper,
    needed for a dip between two band groups); pre=(s, level) is a short swell before the hit (a shutter curtain passing).
    body is a low 'body' underneath: a sine gliding from f0 to f1. Shutter click / hand clap / mouse tick.
    bright: bands shift up, > 8 kHz louder, body lighter; len: spacing and decays stretch together."""
    out = np.zeros(len(_t(d)))
    k = 2 ** (0.25 * b)

    def noise(n, bands):
        x = np.zeros(n)
        for lo, hi, a in bands:
            x += _band(rng.standard_normal(n), lo * p * k, hi * p * k, P.get('order', 2)) * a * (_tilt(b) if lo >= 8000 else 1)
        return x
    for h in P['hits']:
        at = h['at'] * L
        ta, tt = h.get('tail', (0.0, 0.01))
        u = _t(max(h['tau'], tt) * L * 9 + 0.004)
        env = np.minimum(1, u / h.get('att', 0.0005)) * (np.exp(-u / (h['tau'] * L)) + ta * np.exp(-u / (tt * L)))
        _put(out, noise(len(u), h['bands']) * env * h['a'], at)
        if h.get('pre'):
            pd, pa = h['pre'][0] * L, h['pre'][1]
            v = _t(pd)
            _put(out, noise(len(v), h['bands']) * (v / pd) ** 3 * pa * h['a'], max(0.0, at - pd))
    for bd in P.get('body', []):
        u = _t(bd['tau'] * L * 7)
        f = (bd['f1'] + (bd['f0'] - bd['f1']) * np.exp(-u / bd.get('glide', 0.03))) * p
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, u / bd.get('att', 0.002)) * np.exp(-u / (bd['tau'] * L))
        _put(out, s * bd['a'] * _tilt(-b), bd['at'] * L)
    return out


def e_puff(rng, P, d, p, b, L):
    """A small puff of band-passed noise: attack rises as (t / att) ** pw (pw 2 = swells up rather than slams in), then decays with tau. Paper flying past."""
    t = _t(d)
    k = 2 ** (0.3 * b)
    att = P['att'] * L
    env = np.where(t < att, (t / att) ** P.get('pw', 2.0), np.exp(-(t - att) / (P['tau'] * L)))
    return _band(rng.standard_normal(len(t)), P['lo'] * p * k, P['hi'] * p * k) * env


def e_train(rng, P, d, p, b, L):
    """Rapid-cut clicks: a train of identical short clicks every gap s (slight jitter), no acceleration, no crescendo, hard stop at dur.
    Each click is lo–hi noise (plus hi_amp of a little high band), decaying with tau. dur covers the rapid-cut section."""
    out = np.zeros(len(_t(d + 0.03)))
    k = 2 ** (0.3 * b)
    pos = 0.0
    while pos < d - 0.02:
        u = _t(0.025)
        c = _band(rng.standard_normal(len(u)), P['lo'] * p * k, P['hi'] * p * k) + P.get('hi_amp', 0) * _tilt(b) * _band(rng.standard_normal(len(u)), 3200 * p * k, 7000 * p * k)
        _put(out, c * np.exp(-u / P['tau']) * rng.uniform(*P.get('amp', (0.65, 1.0))), pos)
        pos += P['gap'] * L * rng.uniform(1 - P.get('jitter', 0.1), 1 + P.get('jitter', 0.1))
    i = int(d * SR)
    out[i:] *= np.exp(-np.arange(len(out) - i) / (0.003 * SR))
    return out


def e_sweep(rng, P, d, p, b, L):
    """A moving breath: the centre of band-passed noise follows path ([(s, Hz)], log interpolation), bandwidth = width=(lo, hi) × centre;
    level follows env ([(s, amplitude)], linear; two points at the same time make a step); trem=(Hz, depth) adds a little flutter.
    Filtered in 20 ms blocks. bright shifts the whole path up, len stretches time. A long entry hiss."""
    t = _t(d)
    k = 2 ** (0.25 * b)
    pt, pf = np.array([a for a, _ in P['path']]) * L, np.log([f for _, f in P['path']])
    x = rng.standard_normal(len(t))
    out = np.zeros(len(t))
    blk = int(0.02 * SR)
    lo_r, hi_r = P['width']
    for i in range(0, len(t), blk):
        c = float(np.exp(np.interp(i / SR, pt, pf))) * p * k
        seg = _band(x[max(0, i - blk):i + blk * 2], c * lo_r, c * hi_r)[blk if i else 0:][:blk]
        out[i:i + len(seg)] = seg
    env = np.interp(t, np.array([a for a, _ in P['env']]) * L, [v for _, v in P['env']])
    if P.get('trem'):
        env = env * (1 + P['trem'][1] * np.sin(2 * np.pi * P['trem'][0] * t))
    return out * env


def e_layers(rng, P, d, p, b, L):
    """For matching a specific sound closely: several layers, each a sine (kind 'tone', default) or band-passed noise (kind 'noise'), starting at `at` s.
    Frequency f: a number, or [(s, Hz)] (relative to the layer start, log interpolation); tones may have overtones h=[(multiple, amplitude)].
    Noise uses a fixed band=(lo, hi), or f + width=(lo, hi) × f to follow f (filtered in 10 ms blocks).
    Level env: ('hann', s) a smooth bump (no click at start or end), or [(s, dB)] (dB linear = exponential attack / release; silent before the
    first and after the last point). a = layer amplitude.
    Method: measure the target sound frame by frame, then fill in the layers one by one.
    bright raises / lowers layers above 4 kHz and shifts frequency up slightly; len stretches time."""
    out = np.zeros(len(_t(d)))
    k = 2 ** (0.2 * b)
    for ly in P['layers']:
        at, ev = ly.get('at', 0.0) * L, ly['env']
        if ev[0] == 'hann':
            u = _t(ev[1] * L)
            env = np.sin(np.pi * u / u[-1]) ** 2 if len(u) > 1 else u
        else:
            u = _t(ev[-1][0] * L)
            env = 10 ** (np.interp(u, [q[0] * L for q in ev], [q[1] for q in ev], left=-200, right=-200) / 20)   # silent before the first and after the last point
        fs = ly.get('f')
        if isinstance(fs, (list, tuple)):
            f = np.exp(np.interp(u, [q[0] * L for q in fs], np.log([q[1] for q in fs]))) * p * k
        else:
            f = np.full(len(u), float(fs or 0)) * p * k
        if ly.get('kind', 'tone') == 'tone':
            ph = 2 * np.pi * np.cumsum(f) / SR + rng.uniform(0, 6.28)
            s = np.sin(ph) + sum(a2 * np.sin(m * ph) for m, a2 in ly.get('h', []))
            fc = float(f.mean())
        elif 'band' in ly:
            lo, hi = ly['band']
            s = _band(rng.standard_normal(len(u)), lo * p * k, hi * p * k, ly.get('order', 2))
            fc = (lo * hi) ** 0.5 * p * k
        else:
            x, s, blk = rng.standard_normal(len(u)), np.zeros(len(u)), int(0.01 * SR)
            lo_r, hi_r = ly.get('width', (0.8, 1.25))
            for i in range(0, len(u), blk):
                seg = _band(x[max(0, i - blk):i + blk * 2], f[i] * lo_r, f[i] * hi_r, ly.get('order', 2))[blk if i else 0:][:blk]
                s[i:i + len(seg)] = seg
            fc = float(f.mean())
        _put(out, s * env * ly.get('a', 1.0) * (_tilt(b) if fc > 4000 else 1.0), at)
    return out


ENGINES = {'partials': e_partials, 'hiss': e_hiss, 'glide': e_glide, 'arp': e_arp, 'grains': e_grains, 'cluster': e_cluster, 'flutter': e_flutter,
           'clicks': e_clicks, 'tally': e_tally, 'swap': e_swap, 'puff': e_puff, 'train': e_train, 'sweep': e_sweep, 'layers': e_layers}

# ---------------- parameter tables for the synthesised sounds (change the numbers here to change the sound) ----------------
# Frequencies in Hz, times in seconds. The comment above each table says what it sounds like and when to use it.
PRESETS = {
    # A tag popping up: one main line at 7.4 kHz with a weak one above and below, gone within 40 ms
    'tik': dict(engine='partials', dur=0.08, attack=0.006,
                partials=[(7407, 1.0, 0.010), (5921, 0.20, 0.010), (11261, 0.25, 0.008)]),
    # A row of items popping up together: 4 very fast rising notes (4.8k -> 9.9k) plus a 'tsk', two high lines left as a tail
    'swick': dict(engine='arp', dur=0.38, freqs=[4780, 7385, 8290, 9862], step=0.026, tau=0.014, ring=0.03, amp0=0.35,
                  noise=(0.045, 350, 11000, 0.024, 1.5), tail=[(8311, 0.30, 0.06), (9862, 0.30, 0.06), (4177, 0.16, 0.05), (1571, 0.12, 0.05)]),
    # Glowing big text appearing: a field of sparkling grains at 4–19 kHz, densest at 0.15 s, over a soft breath
    'sparkle': dict(engine='grains', dur=0.75, n=70, f=(3600, 18500), glen=(0.010, 0.032), span=0.5, early=2.0, rise=0.12,
                    stairs=[14200, 15850, 18600], bed=dict(lo=3200, hi=16500, attack=0.12, tau=0.13, amp=0.32)),
    # A text label popping up: a sine gliding up from 580 Hz to 735 Hz, fast attack, a tiny tail
    'bub': dict(engine='glide', dur=0.24, f0=580, f1=735, glide=0.055, curve=1.4, attack=0.003, tau=0.02, tail=0.06, tau2=0.07, click=0.25),
    # Something popping out / a card shrinking into a corner: 0.1 s glide from 820 Hz to 1530 Hz, louder as it rises, stops at the top
    'chirp': dict(engine='glide', dur=0.16, f0=820, f1=1530, glide=0.1, curve=1.0, swell=True, pw=1.5, tau=0.012),
    # One thing turning into the next (a file icon becoming a drive): 6 very fast rising notes (2.4k -> 8.7k), 30 ms each
    'arp': dict(engine='arp', dur=0.4, root=2411, semis=[0, 5, 9, 12, 17, 21], step=0.03, tau=0.013, ring=0.03, amp0=0.6, echo=(0.085, 0.22)),
    # Emphasis on a line: 2.7 kHz main tone ringing 0.7 s, two high partials (7k, 13k) that vanish right after the strike
    'ting': dict(engine='partials', dur=0.9, attack=0.0015, click=0.15,
                 partials=[(2691, 1.0, 0.20), (7062, 0.8, 0.11), (13221, 0.9, 0.045), (5706, 0.04, 0.05)]),
    # An image lighting up with a glowing outline: six lines at 4.4–10.7 kHz slowly lighting up (0.14 s), shimmering slightly, then fading
    'glint': dict(engine='cluster', dur=0.95, attack=0.2, hold=0.25, tau=0.12, shimmer=0.35, air=0.05,
                  partials=[(5232, 1.0), (4371, 0.22), (7364, 0.3), (9130, 0.18), (9625, 0.3), (10745, 0.22)]),
    # Comment cards stacking faster and faster: a run of paper sounds getting denser and louder, ending on a settling tap. dur covers the riffle
    'riffle': dict(engine='flutter', dur=1.0, lo=200, hi=2800, blen=0.03, gap0=0.09, gap1=0.02, amp0=0.2, bed=0.3, tap=0.8),
    # Pencil filling a bubble on an answer sheet: a few quick back-and-forth scratches (1.6–7.2 kHz rustle, 28 ms each, spacing 50 -> 35 ms),
    # over a rustle bed that grows, ending with a light tap when the bubble is full. Synthesised from the pencil-on-paper band. dur covers the scribble (tap at t + dur − 0.06)
    'scribble': dict(engine='flutter', dur=0.3, lo=1600, hi=7200, blen=0.028, gap0=0.05, gap1=0.035, amp0=0.7, bed=0.55, tap=0.5),

    # Number flip (e.g. a year counting down): one dry tick per flip, mostly 1–2 kHz, peak 1.8 kHz, -20 dB within 4 ms, no tail;
    # dense at first, then sparser, no ding at the end. dur covers the roll; the last tick lands on the settling frame.
    # Card swap (photos, screenshots, cards replacing each other): a "click-clack" per swap, like a slide projector. The two clicks are ~86 ms apart,
    # the first lower with a bit of body, the second crisper and ~7.6 dB quieter, each -20 dB within 7 ms, no pitch, no tail. Band weights
    # (first 400–1k .34 / 1–2k .29 / 2–4k .17 / 4–8k .08 / 8k+ .12, second .02 / .36 / .27 / .17 / .17).
    # For a series, only the first card gets it
    'slide': dict(engine='swap', dur=0.14, bands=[(400, 1000), (1000, 2000), (2000, 4000), (4000, 8000), (8000, 14000)],
                  w1=[1.0, .92, .593, .46, .622], w2=[.08, 1.0, .668, .618, .626], tau=0.003, body=0.3, body_f=750, gap=0.086, second_db=-7.6),
    'tally': dict(engine='tally', dur=0.6, f=1800, tau=0.0017, h2=0.35, noise=0.6, gap0=0.05, grow=1.25, merge=0.04, last=1.26),
    # Reverse of tally: spacing starts at 0.15 s and is ×0.84 per tick, racing faster to the result; the last tick lands at t + dur.
    # tally is for a number settling, tallyup for a number shooting up
    'tallyup': dict(engine='tally', dur=1.2, f=1800, tau=0.0017, h2=0.35, noise=0.6, gap0=0.15, grow=0.84, merge=0.03, last=1.26),
    # Only the first click of slide (with a bit of wooden body), no second click. A single card pressed down, a stamp, a photo dropped on a table
    'deal': dict(engine='swap', dur=0.1, bands=[(400, 1000), (1000, 2000), (2000, 4000), (4000, 8000), (8000, 14000)],
                 w1=[1.0, .92, .593, .46, .622], w2=[.08, 1.0, .668, .618, .626], tau=0.003, body=0.3, body_f=750, gap=0.086, second_db=-90),
    # Sheets flying in one by one, a 'whsh' per sheet. 1–6 kHz noise swelling over 60 ms, released in 20 ms (centroid 3.5 kHz)
    'sheet': dict(engine='puff', dur=0.2, lo=1000, hi=6000, att=0.06, pw=2.0, tau=0.02),
    # A rapid cut every 3 frames: a flat short click every 0.08 s, mostly 1–3 kHz, no acceleration, hard stop on the last cut (centroid 1.7 kHz). dur covers the cuts
    'flick': dict(engine='train', dur=1.5, lo=800, hi=2600, hi_amp=0.08, tau=0.004, gap=0.08, jitter=0.1, amp=(0.65, 1.0)),
    # Cutting into a new scene: a bright 0.2 s breath first (centre 2.4 -> 4.8 -> 2.6 kHz, loudest), then a breath drifting to 1.7 kHz, 10 dB lower, for ~1 s, fading over the last 0.3 s (centroid 3.5 kHz)
    'airin': dict(engine='sweep', dur=1.5, path=[(0, 2400), (0.1, 4800), (0.2, 2600), (1.5, 1700)], width=(0.45, 1.6),
                  env=[(0, 0), (0.02, 1), (0.2, 1), (0.2, 0.316), (1.2, 0.316), (1.5, 0)], trem=(9, 0.2)),

    # —— Layered sounds (engine 'layers') ——
    #    Sounds with `cut`: write the cue's t at the visual hit / cut point; sfx.py shifts the sound earlier by cut seconds ——
    # Short pop: 670 Hz sine in a 20 ms hann bump, no click at either end, no overtones (smoother than a sharp attack)
    'pip': dict(engine='layers', dur=0.03, layers=[dict(f=670, env=('hann', 0.02))]),
    # Chat message popping up: a run of tiny notes on a 25 ms grid (7.58k -> 10.2k -> 1.95k -> 14k -> 1.62k -> a cluster at 16–18.6k),
    # landing on the main "ding" on the 6th step (773 -> 810 Hz, 4 ms attack, -20 dB within 30 ms then a slow release, with weak partials at
    # 1.06 / 2.27 / 6.77 / 8.15 / 9.5 kHz), two small 14–18.6 kHz sparkles after the ding, and one more at 13.1 kHz at 0.144 s.
    'notify': dict(engine='layers', dur=0.33, cut=0.138, layers=[
        dict(f=7580, at=0.0, env=[(0, -40), (0.003, 0), (0.009, -20), (0.016, -40)], a=0.70),
        dict(f=8150, at=0.0, env=[(0, -40), (0.003, 0), (0.009, -20), (0.016, -40)], a=0.09),
        dict(f=6790, at=0.0, env=[(0, -40), (0.003, 0), (0.009, -20), (0.016, -40)], a=0.03),
        dict(f=10200, at=0.016, env=[(0, -40), (0.006, 0), (0.018, -20), (0.030, -40)], a=0.32),
        dict(f=1952, at=0.041, env=('hann', 0.016), a=0.10),
        dict(f=13950, at=0.069, env=[(0, -40), (0.004, 0), (0.014, -20), (0.026, -40)], a=0.20),
        dict(f=1617, at=0.090, env=('hann', 0.022), a=0.07),
        dict(kind='noise', band=(15000, 18800), at=0.112, env=[(0, -40), (0.012, 0), (0.024, -20), (0.035, -40)], a=0.15),
        # Main "ding": peak at 0.138; a slight slow rise over the preceding 20 ms
        dict(f=[(0, 773), (0.026, 773), (0.066, 810), (0.12, 812)], at=0.112,
             env=[(0, -55), (0.012, -38), (0.018, -25), (0.022, -12), (0.026, 0), (0.034, -8.5), (0.042, -14.5), (0.054, -21.5), (0.082, -31), (0.102, -40), (0.117, -60)]),
        dict(f=8150, at=0.134, env=[(0, -40), (0.004, 0), (0.02, -13), (0.03, -16), (0.06, -20), (0.08, -30), (0.11, -45)], a=0.10),
        dict(f=6773, at=0.134, env=[(0, -40), (0.006, 0), (0.03, -8), (0.06, -14), (0.09, -26), (0.12, -45)], a=0.05),
        dict(f=9516, at=0.134, env=[(0, -40), (0.006, 0), (0.03, -12), (0.05, -25), (0.07, -45)], a=0.04),
        dict(f=2270, at=0.134, env=[(0, -40), (0.006, 0), (0.03, -10), (0.06, -18), (0.09, -40)], a=0.03),
        dict(f=1418, at=0.125, env=('hann', 0.03), a=0.04),
        dict(kind='noise', band=(2000, 4500), at=0.134, env=[(0, -40), (0.004, 0), (0.02, -12), (0.05, -22), (0.08, -40)], a=0.05),
        dict(f=1060, at=0.134, env=[(0, -40), (0.006, 0), (0.03, -10), (0.06, -18), (0.09, -40)], a=0.05),
        dict(kind='noise', band=(13000, 19000), at=0.134, env=[(0, -40), (0.004, 0), (0.02, -10), (0.05, -20), (0.08, -32)], a=0.04),
        # 0.08 s after the ding a small 15–18.6 kHz sparkle, then 13.1 kHz at 0.144 s
        dict(kind='noise', band=(15000, 18800), at=0.219, env=[(0, -40), (0.008, 0), (0.015, -3), (0.025, -18), (0.035, -40)], a=0.10),
        dict(kind='noise', band=(14000, 18800), at=0.250, env=[(0, -40), (0.008, 0), (0.025, -2), (0.035, -40)], a=0.09),
        dict(f=13100, at=0.276, env=[(0, -40), (0.006, 0), (0.020, -20), (0.035, -40)], a=0.17)]),
    # Big text dropping in: first a very light breath (1–13 kHz, 70 ms, 25 dB below the main part), a 20 ms pause,
    # then three 'whsh' getting lower, 20 ms apart: 3.3 kHz (with 7–8 kHz air) -> 2.25 kHz -> 2.19 kHz (with 3.9 kHz, loudest), -20 dB over the last 15 ms
    'swoop': dict(engine='layers', dur=0.21, cut=0.164, layers=[
        # The light breath: two bands, 1–4.5 kHz and 9–12 kHz, with a dip between, nothing above 13 kHz
        dict(kind='noise', band=(1000, 9000), at=0.0, env=[(0, -60), (0.012, -46), (0.06, -46), (0.085, -60)], order=3),
        dict(kind='noise', band=(1050, 1500), at=0.0, env=[(0, -60), (0.012, -34), (0.06, -35), (0.085, -50)], order=3),
        dict(kind='noise', band=(2000, 4500), at=0.0, env=[(0, -60), (0.012, -35), (0.06, -36), (0.085, -50)], order=3),
        dict(kind='noise', band=(9000, 12000), at=0.005, env=[(0, -60), (0.015, -39), (0.055, -39), (0.075, -55)], order=4),
        # The three 'whsh'
        dict(kind='noise', f=3300, width=(0.85, 1.18), at=0.094, env=[(0, -40), (0.01, -30), (0.02, -26), (0.026, -20), (0.031, -9), (0.036, -13), (0.043, -28)], order=3),
        dict(kind='noise', band=(4500, 6500), at=0.094, env=[(0, -45), (0.022, -32), (0.031, -22), (0.036, -26), (0.043, -40)], order=3),
        dict(kind='noise', band=(6800, 8400), at=0.094, env=[(0, -45), (0.022, -30), (0.031, -11), (0.036, -17), (0.043, -34)], order=4),
        dict(kind='noise', band=(1000, 2000), at=0.094, env=[(0, -40), (0.02, -28), (0.03, -19), (0.038, -24), (0.045, -40)], order=3),
        dict(kind='noise', f=2250, width=(0.9, 1.15), at=0.135, env=[(0, -35), (0.008, -7), (0.013, -2), (0.02, -12), (0.028, -35)], order=3),
        dict(kind='noise', band=(2600, 2850), at=0.135, env=[(0, -40), (0.01, -17), (0.02, -25), (0.028, -40)]),
        dict(kind='noise', f=2190, width=(0.88, 1.13), at=0.149, env=[(0, -35), (0.008, -4), (0.015, 0), (0.02, -10), (0.025, -19), (0.035, -23), (0.05, -32), (0.065, -50)]),
        dict(kind='noise', f=3880, width=(0.93, 1.07), at=0.149, env=[(0, -40), (0.012, -7), (0.02, -15), (0.03, -35)]),
        dict(kind='noise', f=3250, width=(0.93, 1.07), at=0.149, env=[(0, -40), (0.012, -9), (0.02, -17), (0.03, -35)]),
        dict(kind='noise', band=(1000, 2000), at=0.149, env=[(0, -40), (0.012, -12), (0.022, -22), (0.035, -40)]),
        dict(kind='noise', band=(4500, 9000), at=0.149, env=[(0, -50), (0.013, -22), (0.02, -31), (0.03, -50)], order=3),
        dict(kind='noise', band=(9000, 19000), at=0.149, env=[(0, -60), (0.013, -40), (0.02, -46), (0.03, -60)], order=4)]),
    # Blur-out and hard cut to the next shot: a reversed metal cymbal. Metal partials at 4.66 / 5.67 / 5.98 / 6.68 kHz + 4–13 kHz noise rising
    # exponentially (37 dB over 0.4 s), peaking 40 ms before the cut (7.1 / 8.5 / 10.5 kHz join near the peak); already 12 dB down on the cut frame,
    # then a metal ring 20 dB lower decays over ~0.5 s. Write the cue's t at the cut (cut = 0.45, sfx.py shifts it earlier)
    'revcut': dict(engine='layers', dur=0.95, cut=0.45, layers=[
        dict(kind='noise', band=(4000, 6500), env=[(0, -70), (0.15, -55), (0.2, -45), (0.25, -29), (0.3, -21), (0.35, -16), (0.38, -13), (0.41, -9), (0.43, -11), (0.45, -25), (0.47, -31), (0.6, -34), (0.95, -60)]),
        dict(kind='noise', band=(6500, 13000), env=[(0, -80), (0.2, -50), (0.3, -28), (0.35, -18), (0.38, -11), (0.41, -6), (0.43, -8), (0.45, -23), (0.47, -31), (0.6, -34), (0.95, -60)]),
        dict(kind='noise', band=(2000, 4500), env=[(0.2, -60), (0.3, -40), (0.38, -30), (0.41, -25), (0.43, -26), (0.45, -34), (0.5, -44), (0.7, -55)], order=3),
        dict(kind='noise', band=(13000, 19000), env=[(0.2, -64), (0.35, -35), (0.41, -18), (0.45, -30), (0.5, -40)]),
        dict(f=4664, env=[(0, -70), (0.2, -44), (0.3, -20), (0.38, -12), (0.41, -9), (0.45, -22), (0.47, -26), (0.6, -27), (0.95, -48)]),
        dict(f=5672, env=[(0, -68), (0.2, -42), (0.3, -18), (0.38, -10), (0.41, -7), (0.45, -21), (0.47, -25), (0.6, -26), (0.95, -46)]),
        dict(f=5977, env=[(0, -70), (0.2, -44), (0.3, -20), (0.38, -12), (0.41, -9), (0.45, -22), (0.47, -26), (0.6, -26), (0.95, -46)]),
        dict(f=6680, env=[(0, -68), (0.2, -42), (0.3, -18), (0.38, -10), (0.41, -7), (0.45, -21), (0.47, -26), (0.6, -27), (0.95, -48)]),
        dict(f=7102, env=[(0.3, -50), (0.37, -14), (0.41, -7), (0.45, -21), (0.5, -27), (0.95, -48)]),
        dict(f=8508, env=[(0.3, -50), (0.37, -16), (0.41, -9), (0.45, -24), (0.5, -31), (0.7, -42)]),
        dict(f=10500, env=[(0.3, -50), (0.37, -10), (0.41, -5), (0.45, -20), (0.5, -29), (0.7, -42)]),
        dict(f=8800, env=[(0.45, -40), (0.5, -28), (0.95, -48)])]),

    # —— Big-type entry sounds (used by XM.bigType / bigName / bigQuote) ——
    # Shutter "ka-cha": the "ka" is two tiny clicks (20 ms apart, the second 5–6 dB lower), energy in two groups at 6–8 kHz and 13–16 kHz
    # with a dip between, each click -10 dB within 3 ms; 213 ms later the "cha" (8 dB lower, a 30 ms swell before it, wider band), with a
    # low body gliding 125 -> 96 Hz under the "cha" (about 17 dB below the "ka")
    'kacha': dict(engine='clicks', dur=0.55, order=3, hits=[
        dict(at=0.000, a=1.00, tau=0.0011, tail=(0.13, 0.007), bands=[(6000, 8300, 1.0), (4000, 6000, 0.45), (13200, 16200, 0.6), (8300, 13000, 0.1), (1000, 4000, 0.2)]),
        dict(at=0.020, a=0.60, tau=0.0014, tail=(0.16, 0.009), bands=[(6000, 8300, 0.65), (4000, 6000, 0.3), (13200, 16200, 0.85), (8300, 13000, 0.08)]),
        dict(at=0.213, a=0.40, tau=0.0018, tail=(0.25, 0.011), pre=(0.03, 0.07), bands=[(5000, 8300, 1.0), (2000, 5000, 0.6), (13000, 16500, 0.75), (8300, 13000, 0.12), (1000, 2000, 0.4)]),
        dict(at=0.222, a=0.20, tau=0.0018, tail=(0.25, 0.011), bands=[(5000, 8300, 1.0), (2000, 5000, 0.45), (13000, 16500, 0.75)])],
        body=[dict(at=0.216, f0=125, f1=96, glide=0.03, tau=0.07, a=0.022)]),
    # "Pa" (double clap): two equally loud claps a few tens of ms apart with a small one between; mostly low-mid, falling off upward,
    # each -15 dB within about 10 ms. Tuned brighter, higher and shorter (bands ×1.2427, times ×0.85 baked in):
    # the two claps are 37 ms apart, mostly 311 Hz–3.5 kHz, half as much at 3.5–7.5 kHz, very little above 7.5 kHz
    'pa': dict(engine='clicks', dur=0.119, order=3, hits=[
        dict(at=0.000, a=0.90, tau=0.002975, tail=(0.25, 0.00935), bands=[(310.7, 1242.7, 1.1), (1242.7, 3479.6, 1.0), (3479.6, 7456.3, 0.4), (7456.3, 12427.2, 0.08)]),
        dict(at=0.017, a=0.15, tau=0.00255, tail=(0.2, 0.0068), bands=[(1242.7, 3479.6, 1.0), (3479.6, 7456.3, 0.4)]),
        dict(at=0.0374, a=1.00, tau=0.003825, tail=(0.28, 0.01105), bands=[(310.7, 1242.7, 1.1), (1242.7, 3479.6, 1.0), (3479.6, 7456.3, 0.4), (7456.3, 12427.2, 0.08)])]),
}

# Pitched synthesised sounds -> fundamental (for sfx.py to snap into the BGM key); TONAL_CHORD: extra notes (semitones) that must also fit the key
TONAL_HZ = {'bub': 735, 'ting': 2691, 'arp': 2411, 'pip': 670, 'notify': 790}
TONAL_CHORD = {'arp': [5, 9]}

# ---------------- kit catalogue ----------------
# use: what the picture is doing. band: where the sound sits ('high' ≥ 4 kHz / 'mid' / low < 350 Hz).
# talk: usable under speech? True yes; '短' in the voice band but very short, use lightly; False keep for gaps without speech.
# src: origin ('new' = synthesised here, 'legacy' = older sfx.py sound with its usage count). status: 'picked' chosen in an audition;
#   'approved' new sound that passed review; '在用' in long-standing use; '待试听' newly added, awaiting audition before use.
# Sounds removed from the kit (older cue sheets may still name them; sfx.py skips them with a note, no error)
REMOVED = {
    'tss': 'too harsh, removed from the kit; a plain shot change gets no sound by default',
}

KIT = {
    # —— Small things appearing ——
    'tik':      dict(zh='细哒', use='Small labels, small text, cards popping up one by one: one tik each', band='high', talk=True, src='new', status='approved'),
    'swick':    dict(zh='上扫唰', use='A row of things popping up together (scoreboard, several images revealed at once)', band='high', talk=True, src='new', status='approved'),
    'bub':      dict(zh='气泡啵', use='Small bubbles, icons, small windows, text labels popping up', band='mid', talk='短', src='new', status='approved'),
    'pop':      dict(zh='啵（下滑）', use='Circling, pointing out, small things popping up', band='mid', talk='短', src='legacy · 192 uses', status='在用'),
    'bloop':    dict(zh='啵↑（低）', use='Small things emerging', band='mid', talk='短', src='legacy · 21 uses', status='在用'),
    'boop':     dict(zh='啵↓', use='Things shrinking away, wrap-up', band='mid', talk='短', src='legacy · 9 uses', status='在用'),
    'swoosh':   dict(zh='短呼', use='Elements flung in. Centred at 3.5 kHz, the same band as the voice; under speech use tik instead', band='mid', talk=False, src='legacy · 113 uses', status='在用'),
    # —— Emphasis ——
    'sparkle':  dict(zh='闪亮嘶', use='Keyword big type, chapter titles appearing', band='high', talk=True, src='new', status='approved'),
    'glint':    dict(zh='亮起', use='Glowing outlines, highlight boxes lighting up, selection', band='high', talk=True, src='new', status='approved'),
    'ting':     dict(zh='金属叮', use='Emphasising a line, a punchline landing, a freeze frame', band='high', talk=True, src='new', status='approved'),
    'paper':    dict(zh='刷亮', use='Highlighter swipe, highlights', band='high', talk=True, src='legacy · 65 uses', status='在用'),
    # —— Motion ——
    'chirp':    dict(zh='上扬啾', use='Things packed away, shrinking into a corner; magnifier popping up', band='mid', talk='短', src='new', status='approved'),
    'arp':      dict(zh='上行小音阶', use='One step turning into the next: file conversion, a process completing, a transformation', band='high', talk=True, src='new', status='approved'),
    'riffle':   dict(zh='连翻', use='Cards, paper slips, comments stacking faster and faster. dur covers the whole run', band='mid', talk=False, src='new', status='approved'),
    'zip':      dict(zh='嗖↑', use='Dash, fling in; use with align:end', band='high', talk=True, src='legacy · 23 uses', status='在用'),
    'whip':     dict(zh='鞭摇', use='Wipes, fast horizontal moves', band='high', talk=True, src='legacy · 13 uses', status='在用'),
    'whoosh':   dict(zh='呼', use='Transitions, things flying past. Centred at 2.8 kHz; place between sentences', band='mid', talk=False, src='legacy · 64 uses', status='在用'),
    'riser':    dict(zh='上升', use='Before a reveal, before a chapter title flies in; use with align:end', band='high', talk=True, src='legacy · 8 uses', status='在用'),
    # —— Numbers ——
    'slide':    dict(zh='换张咔嚓', use='Swapping cards, one landing on top of another (photo cards, screenshots, evidence cards in a row): one "ka-cha", on the frame the new one appears. Only the first of a run gets it', band='mid', talk='短', src='new', status='picked'),
    'tally':    dict(zh='数字翻哒', use='Numbers rolling, counting, years flipping, level up: a run of dry ticks, dense at first then sparser, the last one on the frame the number settles, no ding. dur covers the roll', band='mid', talk='短', src='new', status='picked'),
    'tallyup':  dict(zh='翻哒·越翻越快', use='Countdowns, progress filling up, a number racing to the result: a run of dry ticks getting faster, the last one at t + dur. Use tally when the number settles', band='mid', talk='短', src='new', status='picked'),
    'countup':  dict(zh='数字滚动（旧）', use='Legacy number roll (use tally for new videos; older videos re-render unchanged): a soft rising hiss + a ding on landing', band='high', talk=True, src='legacy · 23 uses', status='在用'),
    'tick':     dict(zh='滴', use='Counting one by one, countdowns, stepping cell by cell', band='mid', talk='短', src='legacy · 76 uses', status='在用'),
    'bleep':    dict(zh='哔', use='Climbing a ranking, overtaking one place at a time (one bleep per place, pitch rising)', band='mid', talk='短', src='legacy · 21 uses', status='picked'),
    'granted':  dict(zh='叮↑', use='Pass, points gained, done (two rising notes)', band='mid', talk='短', src='legacy · 10 projects', status='在用'),
    # —— Paper, cuts, entries, messages ——
    'sheet':    dict(zh='纸唰', use="Paper or cards flying in one by one, a pile scattering (the object's own sound, not an entry sound). Only the first of a run gets it", band='mid', talk='短', src='new', status='picked'),
    'flick':    dict(zh='快切咔嗒', use='Rapid cuts of keywords / documents / screenshots every 2–3 frames (XM.wordCuts): dur covers the cuts, hard stop on the last cut', band='mid', talk='短', src='new', status='picked'),
    'airin':    dict(zh='进场长嘶', use='Big section changes, a subject slowly turning in and settling (very noticeable: a few per video, not on every shot)', band='high', talk=True, src='new', status='picked'),
    'pip':      dict(zh='短啵', use='A single small icon or dot appearing: a round 670 Hz blip with no click. Words appearing with the voice-over get no sound, as usual', band='mid', talk='短', src='new', status='picked'),
    'notify':   dict(zh='消息叮', use='Chat messages, notifications popping up (XS.phones, XM.notify messages): a run of tiny 25 ms notes ending in a ding. Set the cue t to the frame the message pops up (the ding lands there)', band='mid', talk='短', src='new', status='picked'),
    'swoop':    dict(zh='下扫咻', use='Labels, slips, a line of big type dropping from above: a light breath, then three falling swishes. Set the cue t to the landing frame', band='mid', talk='短', src='new', status='picked'),
    'revcut':   dict(zh='冲切上扬', use='Picture blurring out / a hard cut rushing into the next shot (XM.trans defocus, a dash into the cut): a reversed cymbal climbing for 0.4 s, peaking 40 ms before the cut, leaving a tail after it. Set the cue t to the cut', band='high', talk=True, src='new', status='picked'),
    'deal':     dict(zh='咔嚓·第一下', use='A single card pressed down, a stamp, a photo dropping on a table: the first hit of slide. For a stack of swaps still use slide', band='mid', talk='短', src='new', status='picked'),
    # —— Verdict / reveal / settle (no heavy or muffled hits; use this bright one) ——
    'snap':     dict(zh='啪', use='Verdicts, stamps, reveals, cards settling', band='high', talk=True, src='legacy · 17 uses', status='在用'),
    # —— Big-type entry (used by XM.bigType / bigName / bigQuote) ——
    'kacha':    dict(zh='快门咔嚓', use='Big type hard-cut entry: a single concept word slams in; also suggested for name cards and the first quote sentence. "ka" at t, "cha" at t + 0.21 s', band='high', talk=True, src='new', status='picked'),
    'pa':       dict(zh='啪（双拍）', use='Big-type lines cutting in one after another: one per line; use only for that, single words use kacha', band='mid', talk='短', src='new', status='picked'),
    # —— UI / objects ——
    'click':    dict(zh='点击', use='UI clicks, buttons', band='mid', talk='短', src='legacy · 45 uses', status='在用'),
    'typing':   dict(zh='打字', use='Text appearing letter by letter. dur covers the typing', band='mid', talk='短', src='legacy · 16 uses', status='在用'),
    'latch':    dict(zh='咔哒', use='Locking, buckling, connecting', band='mid', talk='短', src='legacy · 23 uses', status='在用'),
    'ratchet':  dict(zh='棘轮', use='Mechanical rolling that does not settle (wheels, a reading that keeps rising)', band='high', talk=True, src='legacy · 13 uses', status='在用'),
    'shutter':  dict(zh='快门', use='Taking a photo, a viewfinder snapping shut', band='high', talk=True, src='legacy', status='picked'),
    'filmfeed': dict(zh='胶片走带', use='Film advancing, film pressing. dur covers the feed', band='mid', talk=False, src='legacy', status='picked'),
    'scribble': dict(zh='涂卡沙沙', use='A pencil filling one bubble on an answer sheet: a few quick scratches + a light tap at the end. dur covers the filling', band='high', talk=False, src='new', status='待试听'),
}
# Not in the kit: heavy / muffled sounds: stamp, thud, punch, slam, sub, impact, boom, bonk, clang / trailerhit / braam (gong-like); stab
#   (no brass for "?" or hits); room / vinyl (no filler bed). They are still in sfx.py for standalone shorts, not for voiceover animation.

VARIANT = dict(pitch=1.0, bright=0.0, len=1.0, seed=0)


def _make_fn(name):
    P = PRESETS[name]

    def fn(rng, d, p, bright=0.0, len=1.0):
        return ENGINES[P['engine']](rng, P, d * (len if P['engine'] not in ('flutter', 'tally', 'swap', 'train') else 1), p, max(-1, min(1, bright)), len)
    fn.kit = True
    fn.cut = P.get('cut')                     # sounds with cut: the cue's t is the cut point (sfx.py shifts the sound earlier by cut s)
    fn.__doc__ = KIT[name]['use'] if name in KIT else 'candidate (in PRESETS, not registered in KIT yet)'
    return fn


def install(host):
    """Called by sfx.py: registers the synthesised sounds in its SOUNDS / TONAL_HZ so cues can use them by name."""
    global _host
    _host = host
    for name, P in PRESETS.items():
        host.SOUNDS[name] = (_make_fn(name), P['dur'])
    host.TONAL_HZ.update(TONAL_HZ)
    if hasattr(host, 'TONAL_CHORD'):
        host.TONAL_CHORD.update(TONAL_CHORD)


def _sfx():
    global _host
    if _host is None:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import sfx
        _host = sfx
    return _host


def render(name, pitch=1.0, bright=0.0, len=1.0, seed=0, dur=None):
    """Render one sound (peak-normalised). Legacy sounds only take pitch / seed / dur."""
    return _sfx().make(name, dur, pitch, seed, opts=dict(bright=bright, len=len))


_K = None


def _kw(x):
    """BS.1770 K-weighting (48 kHz coefficients)"""
    global _K
    if _K is None:
        _K = (np.array([[1.53512485958697, -2.69169618940638, 1.19839281085285, 1.0, -1.69065929318241, 0.73248077421585],
                        [1.0, -2.0, 1.0, 1.0, -1.99004745483398, 0.99007225036621]]))
    return sosfilt(_K, x)


_GAIN = {}
# Reference loudness for level matching: the median 100 ms loudness of the kit when this was fixed.
# Kept constant so adding sounds never shifts existing defaults (recomputing the median each time moved every default when two quiet sounds were added).
GAIN_REF = -10.2377


def loudness(name):
    """Loudness after peak normalisation (K-weighted, max over 100 ms windows, dB). Higher = 'louder'."""
    y = _kw(render(name)) ** 2
    w = int(0.1 * SR)
    if len(y) < w:
        y = np.pad(y, (0, w - len(y)))
    c = np.concatenate([[0], np.cumsum(y)])
    return float(10 * np.log10((c[w:] - c[:-w]).max() / w + 1e-12))


def gain(name, base=0.8):
    """Default gain for level matching: makes every kit sound about equally loud (relative to GAIN_REF; the loudest pulled down, the quietest up to 1).
    Candidates in PRESETS that aren't in KIT yet are handled the same way."""
    if name not in _GAIN and (name in KIT or name in PRESETS):
        _GAIN[name] = float(np.clip(base * 10 ** ((GAIN_REF - loudness(name)) / 20), 0.12, 1.0))
    return round(_GAIN.get(name, base), 3)


def cue_opts(cue, kit):
    """Called by sfx.py's mix: this video's variant + per-cue tweaks -> (pitch factor, seed offset, engine options, default gain)."""
    v = dict(VARIANT, **(kit or {}))
    name = cue['name']
    if name not in KIT and name not in PRESETS:      # candidates (in PRESETS, not yet in KIT) also take the video's variant
        return 1.0, 0, None, None
    opts = dict(bright=float(cue.get('bright', v['bright'])), len=float(cue.get('len', v['len'])))
    return float(v['pitch']), int(v['seed']), opts, gain(name)


# ---------------- command line ----------------
def _args(a):
    v = dict(VARIANT)
    for s in a:
        if '=' in s:
            k, x = s.split('=', 1)
            v[k] = int(x) if k == 'seed' else float(x)
    return v


def _wav(path, x):
    from scipy.io import wavfile
    wavfile.write(path, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))


def _spec_png(x, path, w=260, h=96):
    """Small spectrogram (only with OpenCV). Mel y-axis, 40 Hz–18 kHz."""
    try:
        import cv2
        from scipy.signal import stft
    except ImportError:
        return False
    x = np.pad(x, (int(0.05 * SR), int(0.08 * SR)))
    f, _, S = stft(x, SR, nperseg=1024, noverlap=1024 - 128, boundary=None, padded=False)
    Pw = np.abs(S) ** 2
    mel = lambda q: 2595 * np.log10(1 + q / 700)
    ed = 700 * (10 ** (np.linspace(mel(40), mel(18000), 82) / 2595) - 1)
    M = np.stack([np.clip(np.minimum((f - ed[i]) / (ed[i + 1] - ed[i]), (ed[i + 2] - f) / (ed[i + 2] - ed[i + 1])), 0, None) @ Pw for i in range(80)])
    D = 10 * np.log10(M + 1e-12)
    D = np.clip((D - (D.max() - 65)) / 65, 0, 1)
    cv2.imwrite(path, cv2.resize(cv2.applyColorMap((D[::-1] * 255).astype(np.uint8), cv2.COLORMAP_MAGMA), (w, h), interpolation=cv2.INTER_AREA))
    return True


VARIANTS_DEMO = [('default', {}), ('brighter, higher, shorter', dict(pitch=1.12, bright=0.6, len=0.85, seed=1)), ('darker, lower, longer', dict(pitch=0.89, bright=-0.6, len=1.25, seed=2))]


def export(out):
    os.makedirs(os.path.join(out, 'wav'), exist_ok=True)
    for name in KIT:
        for i, (_, v) in enumerate(VARIANTS_DEMO):
            x = render(name, **v) * 0.7
            _wav(os.path.join(out, 'wav', f'{name}-{i}.wav'), np.pad(x, (0, int(0.05 * SR))))
        _spec_png(render(name), os.path.join(out, 'wav', f'{name}.png'))
    print('exported', len(KIT), 'sounds ×', len(VARIANTS_DEMO), '->', os.path.join(out, 'wav'))


def page(out):
    export(out)
    refs = json.load(open(os.path.join(out, 'refs.json'), encoding='utf-8')) if os.path.exists(os.path.join(out, 'refs.json')) else {}
    talk = {True: 'OK under speech', '短': 'OK under speech, lightly (very short)', False: 'gaps without speech only'}
    h = ['<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voice-over sound kit audition</title>',
         '<style>:root{--bg:#111;--fg:#eee;--mut:#9a9a9a;--line:#2a2a2a;--acc:#ffd84d;--tag:#1f1f1f}@media(prefers-color-scheme:light){:root{--bg:#faf8f3;--fg:#1a1a1a;--mut:#666;--line:#ddd;--acc:#a06c00;--tag:#efece4}}',
         'body{background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,"PingFang SC",sans-serif;margin:0 auto;padding:24px 16px;max-width:1100px}',
         'h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:34px 0 4px;padding-top:14px;border-top:1px solid var(--line)}p.d{color:var(--mut);margin:0 0 10px}',
         '.s{padding:14px 0;border-bottom:1px solid var(--line)}.n{font-weight:600;font-size:17px}.n code{font:600 14px ui-monospace,Menlo,monospace;color:var(--acc);margin-left:8px}',
         '.m{color:var(--mut);font-size:13px}.tag{display:inline-block;background:var(--tag);border-radius:4px;padding:0 7px;margin-right:6px;font-size:12px}',
         '.row{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:6px}.row span{font-size:12px;color:var(--mut);min-width:0}audio{height:30px;width:210px}',
         '.ab{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}.ab figure{margin:0;width:300px;max-width:100%}.ab video{width:100%;border-radius:4px;display:block;background:#000}.ab figcaption{font-size:12px;color:var(--mut)}',
         'img.sp{height:48px;border-radius:3px;vertical-align:middle}</style>',
         '<h1>Voice-over sound kit audition</h1>',
         '<p class="d">Each sound has three takes: the default and two slight variations (the pitch / bright / len / seed knobs). Entries with two short clips compare a reference moment with the same moment using our synthesised sound, picture and voice unchanged. Heavy, muffled sounds are not in the kit.</p>']
    groups = [('Pending audition (newly added)', [n for n in KIT if KIT[n]['status'] == '待试听']),
              ('New, approved', [n for n in KIT if KIT[n]['status'] == 'approved']),
              ('Picked in an audition', [n for n in KIT if KIT[n]['status'] == 'picked']),
              ('In long-standing use', [n for n in KIT if KIT[n]['status'] == '在用'])]
    for title, names in groups:
        if not names:
            continue
        h.append(f'<h2>{title} · {len(names)}</h2>')
        for n in names:
            k = KIT[n]
            r = refs.get(n, {})
            h.append(f'<div class="s"><div class="n">{k["zh"]}<code>{n}</code> <img class="sp" src="wav/{n}.png" alt=""></div>'
                     f'<div class="m">{k["use"]}</div><div class="m"><span class="tag">{k["band"]} band</span><span class="tag">{talk[k["talk"]]}</span><span class="tag">{k["src"]}</span></div><div class="row">')
            for i, (lab, _) in enumerate(VARIANTS_DEMO):
                h.append(f'<span>{lab}</span><audio controls preload="none" src="wav/{n}-{i}.wav"></audio>')
            h.append('</div>')
            if r:
                h.append(f'<div class="m" style="margin-top:8px">Reference: {r["film"]} {r["time"]}, {r["visual"]}</div><div class="row"><span>The reference moment (isolated)</span><audio controls preload="none" src="{r["ref"]}"></audio></div>')
                if r.get('ab_a'):
                    h.append(f'<div class="ab"><figure><video controls preload="metadata" src="{r["ab_a"]}#t=1.2"></video><figcaption>Reference</figcaption></figure>'
                             f'<figure><video controls preload="metadata" src="{r["ab_b"]}#t=1.2"></video><figcaption>With our {n}</figcaption></figure></div>')
            h.append('</div>')
    open(os.path.join(out, 'audition.html'), 'w', encoding='utf-8').write('\n'.join(h))
    print('audition page ->', os.path.join(out, 'audition.html'))


def main():
    a = sys.argv[1:]
    if not a or a[0] == '--list':
        print(f'{"name":9s} {"zh":8s} {"band":3s} {"talk":5s} {"status":5s} {"gain":7s} use')
        for n, k in KIT.items():
            print(f'{n:9s} {k["zh"]:8s} {k["band"]:3s} {str(k["talk"]):5s} {k["status"]:5s} {gain(n):7.2f} {k["use"]} ({k["src"]})')
        return
    if a[0] == '--audition':
        v = _args(a[2:])
        parts = []
        for n in KIT:
            parts += [render(n, **v) * gain(n), np.zeros(int(0.45 * SR))]
        _wav(a[1], np.concatenate(parts))
        print('audition file ->', a[1], v)
        return
    if a[0] == '--export':
        return export(a[1])
    if a[0] == '--page':
        return page(a[1])
    print(__doc__)


if __name__ == '__main__':
    main()
