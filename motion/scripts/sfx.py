"""Synthesise sound effects in pure code and mix them to a cue sheet (no background music).

Usage:
  python3 sfx.py <project dir>         read build/sfx_cues.json -> write build/sfx.wav (exactly as long as the video)
  python3 sfx.py --list                list all sound names and default durations
  python3 sfx.py --audition out.wav    render every sound one after another into one file for auditioning

Cue fields: t (s) name gain (0..1, default 0.8) pan (-1..1) pitch (frequency factor, default 1) dur (s, some sounds only)
  align ('start'|'end') bright (-1..1) len (duration factor) (the last two only for sfx_kit.py sounds)
  snap (default true: pitched sounds snap to the MUSIC.key scale; without MUSIC, to window.BGM_KEY = {key, mode})
  keep (true = exempt from the "only the first of a series" rule)
The small set of effects used in voiceover videos (the kit) lives in sfx_kit.py: python3 sfx_kit.py --list. When timeline.js sets
window.SFX_KIT = {pitch, bright, len, seed}, the whole kit shifts a little (one "colour" per video) and cues without gain use the
kit's level-matched default volume; without SFX_KIT nothing changes.
Requires: numpy scipy
"""
import json
import os
import sys
import zlib

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000


def tt(d):
    return np.arange(max(1, int(d * SR))) / SR


def filt(x, kind, f, order=2):
    nyq = SR / 2 * 0.98
    f = [min(max(v, 20), nyq) for v in f] if isinstance(f, (list, tuple)) else min(max(f, 20), nyq)
    return sosfilt(butter(order, f, btype=kind, fs=SR, output='sos'), x)


def chirp(f0, f1, d, curve=30.0):
    """Sine whose frequency slides exponentially from f0 to f1 (larger curve = faster slide)"""
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t * curve)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def sweep_noise(rng, d, f0, f1, width=0.6, shape=2.0):
    """Band-passed noise whose centre frequency slides from f0 to f1 over time (block filtering)"""
    n = len(tt(d))
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 256
    zi = np.zeros((1, 2))
    for i in range(0, n, blk):
        k = (i / n) ** shape if f1 > f0 else 1 - (1 - i / n) ** shape
        fc = f0 + (f1 - f0) * k
        sos = butter(1, [fc * (1 - width / 2), fc * (1 + width / 2)], btype='bandpass', fs=SR, output='sos')
        y, zi = sosfilt(sos, x[i:i + blk], zi=zi)
        out[i:i + blk] = y
    return out


def env_ad(d, attack, decay_rate):
    t = tt(d)
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t * decay_rate)


# ---------------- sound library ----------------
# Each function: (rng, dur, pitch) -> mono np.array. SOUNDS gives the default duration.

def s_whoosh(rng, d, p):          # whoosh: something flying past, transitions. Peaks at 85%, usually with align:'end'
    t = tt(d)
    x = sweep_noise(rng, d, 300 * p, 2400 * p, 0.8, 1.5)
    k = t / d
    e = np.where(k < 0.85, (k / 0.85) ** 2, np.exp(-(k - 0.85) * 25))
    return x * e * 6


def s_swoosh(rng, d, p):          # short swoosh: a sticker / element flung in
    t = tt(d)
    x = sweep_noise(rng, d, 900 * p, 4200 * p, 0.7, 1.2)
    k = t / d
    return x * np.sin(np.pi * np.clip(k, 0, 1)) ** 1.5 * 7


def s_riser(rng, d, p):           # riser: tension before a reveal or a progress bar, with align:'end'
    t = tt(d)
    x = sweep_noise(rng, d, 500 * p, 6000 * p, 0.5, 2.0) * 5
    f = 180 * p * 2 ** (3 * t / d)
    x += 0.25 * np.sin(2 * np.pi * np.cumsum(f) / SR)
    return x * (t / d) ** 2


def s_pop(rng, d, p):             # pop: text / icon popping up
    s = chirp(1100 * p, 320 * p, d, 45) * env_ad(d, 0.002, 28)
    s[:int(0.004 * SR)] += rng.standard_normal(int(0.004 * SR)) * 0.4
    return s


def s_click(rng, d, p):           # UI click, button
    t = tt(d)
    return (np.sin(2 * np.pi * 2100 * p * t) * np.exp(-t * 180) + filt(rng.standard_normal(len(t)), 'highpass', 3000) * np.exp(-t * 400) * 0.6)


def s_tick(rng, d, p):            # tick: countdown, counting
    t = tt(d)
    return np.sin(2 * np.pi * 4200 * p * t) * np.exp(-t * 300) + np.sin(2 * np.pi * 1800 * p * t) * np.exp(-t * 200) * 0.5


def s_typing(rng, d, p):          # typing: text appearing char by char, dur covers the whole typing
    out = np.zeros(len(tt(d)))
    pos = 0.0
    while pos < d - 0.03:
        c = s_click(rng, 0.03, p * (0.8 + 0.5 * rng.random())) * (0.5 + 0.5 * rng.random())
        i = int(pos * SR)
        out[i:i + len(c)] += c[: len(out) - i]
        pos += 0.045 + 0.05 * rng.random()
    return out


def s_thud(rng, d, p):            # muffled thud landing
    t = tt(d)
    s = chirp(140 * p, 45 * p, d, 22) * np.exp(-t * 9)
    s += filt(rng.standard_normal(len(t)), 'lowpass', 900) * np.exp(-t * 60) * 0.8
    return np.tanh(s * 1.8)


def s_impact(rng, d, p):          # heavy impact: a big object slamming down
    t = tt(d)
    s = s_thud(rng, d, p) * 1.1
    s += filt(rng.standard_normal(len(t)), 'lowpass', 2400 * p) * np.exp(-t * 14) * 0.9
    s += np.sin(2 * np.pi * 42 * p * t) * np.exp(-t * 5) * 0.6
    return np.tanh(s * 1.3)


def s_boom(rng, d, p):            # boom: an opening blast, shatter zoom
    t = tt(d)
    s = s_impact(rng, d, p)
    s += filt(rng.standard_normal(len(t)), 'lowpass', 500) * np.exp(-t * 2.8) * 1.2
    s += filt(rng.standard_normal(len(t)), 'bandpass', [2500, 9000]) * np.exp(-t * 6) * 0.35
    return np.tanh(s * 1.2)


def s_hit(rng, d, p):             # hit: freeze frame, emphasis, comic punch
    t = tt(d)
    n = filt(rng.standard_normal(len(t)), 'bandpass', [1200 * p, 8000]) * np.exp(-t * 18)
    tone = np.sin(2 * np.pi * 190 * p * t) * np.exp(-t * 30) * 0.8
    return np.tanh((n * 1.5 + tone) * 1.4)


def s_stamp(rng, d, p):           # stamp: muffled hit + paper slap
    t = tt(d)
    s = chirp(160 * p, 60 * p, d, 30) * np.exp(-t * 16) * 0.9
    s += filt(rng.standard_normal(len(t)), 'bandpass', [700, 5000]) * np.exp(-t * 45) * 1.2
    return np.tanh(s * 1.6)


def s_bonk(rng, d, p):            # bonk: cartoon head bonk, wooden block
    t = tt(d)
    f = 560 * p * (1 - 0.25 * (1 - np.exp(-t * 20)))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22)
    s += np.sin(2 * np.pi * np.cumsum(f * 2.4) / SR) * np.exp(-t * 40) * 0.5
    s[:int(0.003 * SR)] += rng.standard_normal(int(0.003 * SR)) * 0.5
    return s


def s_boing(rng, d, p):           # boing: spring, rebound, comic double take
    t = tt(d)
    f = 220 * p * (1 + 0.35 * np.sin(2 * np.pi * 11 * t) * np.exp(-t * 3)) * (1 - 0.3 * t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(d, 0.005, 4)


def s_clang(rng, d, p):           # metal clang: wrench, ironware
    t = tt(d)
    s = np.zeros(len(t))
    for f, a, dc in [(412, 1, 3), (1043, .8, 4), (1577, .6, 5), (2331, .5, 6), (3187, .4, 8), (4420, .3, 10)]:
        s += a * np.sin(2 * np.pi * f * p * t) * np.exp(-t * dc)
    s += rng.standard_normal(len(t)) * np.exp(-t * 60) * 1.5
    return s / 3


def s_stick(rng, d, p):           # drumstick clicks: count-in 4-3-2-1
    t = tt(d)
    s = (np.sin(2 * np.pi * 2300 * p * t) + 0.6 * np.sin(2 * np.pi * 3710 * p * t)) * np.exp(-t * 70)
    s += filt(rng.standard_normal(len(t)), 'bandpass', [2000, 6000]) * np.exp(-t * 120)
    return s


def s_snip(rng, d, p):            # snip: scissors, cutting
    out = np.zeros(len(tt(d)))
    for k, off in enumerate((0.0, 0.055)):
        c = s_click(rng, 0.05, p * (1.4 if k else 1.1))
        c += filt(rng.standard_normal(len(c)), 'highpass', 5000) * np.exp(-tt(0.05) * 90) * 0.8
        i = int(off * SR)
        out[i:i + len(c)] += c[: len(out) - i]
    return out


def s_glitch(rng, d, p):          # digital glitch: black-frame flicker, signal loss
    t = tt(d)
    seg = max(1, int(0.012 * SR))
    s = np.zeros(len(t))
    for i in range(0, len(t), seg):
        kind = rng.integers(3)
        n = min(seg, len(t) - i)
        if kind == 0:
            s[i:i + n] = np.sign(np.sin(2 * np.pi * rng.uniform(200, 2000) * p * t[:n]))
        elif kind == 1:
            s[i:i + n] = np.round(rng.standard_normal(n) * 2) / 2
    return s * 0.5 * np.exp(-t / d * 1.5)


def s_buzz(rng, d, p):            # electric hum + crackle: plugging in, a broken lamp
    t = tt(d)
    hum = sum(np.sin(2 * np.pi * 60 * p * h * t) / h for h in range(1, 12)) * 0.4
    crack = filt((rng.random(len(t)) < 0.0015) * rng.standard_normal(len(t)) * 2.5, 'highpass', 1500)
    fade = np.clip(np.minimum(t / 0.02, (d - t) / 0.1), 0, 1)
    return (hum + crack) * fade


def s_ding(rng, d, p):            # ding: done, reveal, signature
    t = tt(d)
    s = np.zeros(len(t))
    for r, a, dc in [(1, 1, 3), (2.76, .5, 5), (5.4, .25, 8), (8.9, .12, 12)]:
        s += a * np.sin(2 * np.pi * 1320 * p * r * t) * np.exp(-t * dc)
    return s * np.minimum(1, t / 0.002) * 0.6


def s_error(rng, d, p):           # error: low two-tone buzz
    t = tt(d)
    s = np.sign(np.sin(2 * np.pi * 110 * p * t)) * 0.5 + np.sign(np.sin(2 * np.pi * 116.5 * p * t)) * 0.5
    s = filt(s, 'lowpass', 2500)
    return s * np.clip(np.minimum(t / 0.005, (d - t) / 0.02), 0, 1) * 0.6


def s_tear(rng, d, p):            # paper tear
    t = tt(d)
    grain = (rng.random(len(t)) < 0.02) * rng.standard_normal(len(t))
    x = filt(grain + rng.standard_normal(len(t)) * 0.15, 'bandpass', [900 * p, 7000])
    return x * np.sin(np.pi * t / d) ** 0.7 * 2.5


def s_paper(rng, d, p):           # paper crumple / rustle
    t = tt(d)
    bursts = np.zeros(len(t))
    for _ in range(int(d * 25)):
        i = rng.integers(len(t))
        n = min(int(SR * rng.uniform(0.005, 0.03)), len(t) - i)
        bursts[i:i + n] += rng.standard_normal(n) * np.exp(-np.arange(n) / (n / 3))
    return filt(bursts, 'bandpass', [1500 * p, 9000]) * 1.2


def s_cymbal(rng, d, p):          # cymbal: climax accent (a single hit, not music)
    t = tt(d)
    n = filt(rng.standard_normal(len(t)), 'highpass', 3500 * p) + filt(rng.standard_normal(len(t)), 'bandpass', [5000, 9000]) * 0.6
    return n * np.exp(-t * 2.2) * (1 - np.exp(-t * 400)) * 0.8


def s_room(rng, d, p):            # room tone: very low room noise so effects aren't separated by dead silence (not music)
    t = tt(d)
    x = filt(rng.standard_normal(len(t)), 'lowpass', 900) * 0.12 + filt(rng.standard_normal(len(t)), 'bandpass', [2000, 6000]) * 0.01
    return x * np.clip(np.minimum(t / 0.3, (d - t) / 0.3), 0, 1)


def s_vinyl(rng, d, p):           # vinyl crackle: retro texture bed (not music)
    t = tt(d)
    crack = filt((rng.random(len(t)) < 0.0008) * rng.standard_normal(len(t)) * 3, 'highpass', 1200)
    hiss = filt(rng.standard_normal(len(t)), 'bandpass', [3000, 9000]) * 0.03
    return (crack + hiss) * np.clip(np.minimum(t / 0.3, (d - t) / 0.3), 0, 1)


def s_sub(rng, d, p):             # sub drop: under big text / a landing, for a "chest thump" of weight
    t = tt(d)
    s = chirp(95 * p, 36 * p, d, 7) * np.exp(-t * 3.2) * np.minimum(1, t / 0.004)
    return np.tanh(s * 2.0)


def s_slam(rng, d, p):            # slam: full impact of big text / a stamp slamming down (low end + crack + tail), the main hit at the loudest intensity
    t = tt(d)
    s = s_sub(rng, d, p) * 0.9 + s_impact(rng, d, p) * 0.8
    crack = filt(rng.standard_normal(len(t)), 'bandpass', [1500 * p, 9000]) * np.exp(-t * 30) * 1.2
    tail = filt(rng.standard_normal(len(t)), 'highpass', 4000) * np.exp(-t * 5) * 0.25 * (1 - np.exp(-t * 300))
    return np.tanh((s + crack + tail) * 1.3)


def s_whip(rng, d, p):            # whip: fast pan / transition, stronger than swoosh, peaks at the end (align:'end')
    t = tt(d)
    x = sweep_noise(rng, d, 600 * p, 7000 * p, 0.9, 3.0) * 8
    return x * (t / d) ** 3


def s_crack(rng, d, p):           # glass crack: one sharp crack + fine cracking (hitting a screen, spreading cracks)
    t = tt(d)
    snap = filt(rng.standard_normal(len(t)), 'highpass', 3500 * p) * np.exp(-t * 90)
    creak = np.zeros(len(t))
    for k in range(14):
        t0 = 0.01 + rng.random() * d * 0.6
        m = t >= t0
        creak[m] += filt(rng.standard_normal(m.sum()), 'bandpass', [2500, 9000]) * np.exp(-(t[m] - t0) * 160) * (0.8 - k * 0.04)
    ring = sum(np.sin(2 * np.pi * f * p * t) * np.exp(-t * 30) for f in (3100, 4700, 6200)) * 0.15
    return snap + creak * 0.6 + ring


def s_shatter(rng, d, p):         # glass shatter: a loud burst + a cascade of tinkling shards
    t = tt(d)
    burst = filt(rng.standard_normal(len(t)), 'highpass', 2000) * np.exp(-t * 18) + np.sin(2 * np.pi * 90 * t) * np.exp(-t * 12) * 0.6
    tinkle = np.zeros(len(t))
    for k in range(40):
        t0 = 0.03 + (rng.random() ** 1.6) * d * 0.85
        m = t >= t0
        f = rng.uniform(2800, 7800) * p
        tinkle[m] += np.sin(2 * np.pi * f * (t[m] - t0)) * np.exp(-(t[m] - t0) * rng.uniform(25, 60)) * rng.uniform(0.2, 0.6)
    return burst + tinkle * 0.5


def s_projector(rng, d, p):       # old projector: 24 fps clatter + motor hum (dur covers the whole section)
    t = tt(d)
    hum = (np.sin(2 * np.pi * 110 * p * t) * 0.25 + np.sin(2 * np.pi * 220 * p * t) * 0.1) * (1 + 0.2 * np.sin(2 * np.pi * 3 * t))
    clk = np.zeros(len(t))
    for k in range(int(d * 24)):
        i0 = int((k / 24 + (rng.random() - .5) * 0.004) * SR)
        n = int(0.006 * SR)
        if i0 + n < len(t):
            clk[i0:i0 + n] += filt(rng.standard_normal(n), 'bandpass', [1500, 5000]) * np.exp(-np.arange(n) / SR * 900) * (0.7 + 0.3 * (k % 2))
    return (hum * 0.4 + clk) * np.minimum(1, t / 0.15) * np.clip((d - t) / 0.15, 0, 1)


def _square(f, t):
    ph = np.cumsum(f * np.ones(len(t))) / SR if np.isscalar(f) else np.cumsum(f) / SR
    return np.where(ph % 1 < 0.5, 1.0, -1.0)


def s_laser(rng, d, p):           # 8-bit laser: pew, a square wave sliding down (mini-game shot)
    t = tt(d)
    f = 300 * p + 1600 * p * np.exp(-t * 22)
    return _square(f, t) * np.exp(-t * 14) * 0.6


def s_blip(rng, d, p):            # 8-bit blip: two short square-wave notes (score, select, count)
    t = tt(d)
    f = np.where(t < d / 2, 988 * p, 1319 * p)
    return _square(f, t) * env_ad(d, 0.002, 12) * 0.5


def s_explode8(rng, d, p):        # 8-bit explosion: downsampled noise + downward slide (mini-game hit)
    t = tt(d)
    step = max(1, int(SR / (5000 * p)))
    n = np.repeat(rng.standard_normal(len(t) // step + 1), step)[:len(t)]
    n = np.round(n * 3) / 3
    return n * np.exp(-t * 7) + _square(160 * p * np.exp(-t * 4), t) * np.exp(-t * 10) * 0.4



def s_jump8(rng, d, p):           # 8-bit jump: square wave pitch sliding up fast
    t = tt(d)
    return _square(220 * p + 900 * p * (t / d) ** 0.6, t) * np.exp(-t * 6) * 0.5


def s_bump8(rng, d, p):           # 8-bit brick bump: one low square note + a little noise
    t = tt(d)
    step = max(1, int(SR / 3000))
    n = np.repeat(rng.standard_normal(len(t) // step + 1), step)[:len(t)]
    return (_square(180 * p * np.exp(-t * 6), t) * 0.6 + n * 0.3) * np.exp(-t * 18)


def s_power8(rng, d, p):          # 8-bit power-up / pickup: rising square-wave arpeggio
    t = tt(d)
    notes = np.array([523, 659, 784, 1047, 1319, 1568]) * p
    f = notes[np.minimum((t / d * len(notes)).astype(int), len(notes) - 1)]
    return _square(f, t) * env_ad(d, 0.002, 2.5) * 0.45


def s_gameover8(rng, d, p):       # 8-bit game over: four notes stepping down, the last one held
    t = tt(d)
    notes = np.array([494, 466, 440, 330]) * p
    idx = np.minimum((t / (d * 0.22)).astype(int), 3)
    return _square(notes[idx] * (1 - 0.03 * np.sin(2 * np.pi * 7 * t) * (idx == 3)), t) * np.exp(-t * 1.2) * 0.45



def s_pour(rng, d, p):            # pouring liquid: band-passed noise + bubbling flutter, dur covers the pour
    t = tt(d)
    n = filt(rng.standard_normal(len(t)), 'bandpass', [600 * p, 2600 * p])
    am = 0.55 + 0.45 * np.abs(filt(rng.standard_normal(len(t)), 'lowpass', 28))
    am = am / (np.max(am) or 1)
    fade = np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.15)
    return n * am * fade * 0.8


def s_gloop(rng, d, p):           # gloop: low liquid bubble, pitch falling + a little wet resonance
    t = tt(d)
    f = 260 * p * np.exp(-t * 9) + 90 * p
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    wet = filt(rng.standard_normal(len(t)), 'bandpass', [400, 1400]) * np.exp(-t * 30) * 0.3
    return body + wet


def s_slurp(rng, d, p):           # straw slurp at the bottom: band-passed noise + irregular gurgling flutter
    t = tt(d)
    n = filt(rng.standard_normal(len(t)), 'bandpass', [900 * p, 4200 * p])
    gurgle = 0.35 + 0.65 * (np.sin(2 * np.pi * (18 + 9 * np.sin(2 * np.pi * 1.3 * t)) * t) > 0.2)
    fade = np.minimum(1, t / 0.08) * np.minimum(1, (d - t) / 0.2)
    return n * gurgle * fade * 0.8


def s_seal(rng, d, p):            # sealer: a click + the hiss of heat sealing
    t = tt(d)
    click = filt(rng.standard_normal(len(t)), 'bandpass', [1500, 6000]) * np.exp(-t * 90) * 1.2
    thump = np.sin(2 * np.pi * 110 * p * t) * np.exp(-t * 25) * 0.7
    hiss = filt(rng.standard_normal(len(t)), 'highpass', 4000) * np.exp(-np.maximum(t - 0.08, 0) * 5) * (t > 0.06) * 0.45
    return click + thump + hiss


def s_squirt(rng, d, p):          # squirt: a jet of liquid + splash
    t = tt(d)
    burst = filt(rng.standard_normal(len(t)), 'bandpass', [500 * p, 3500 * p]) * np.exp(-t * 6)
    sweep = np.sin(2 * np.pi * np.cumsum(500 * p * np.exp(-t * 5) + 120) / SR) * np.exp(-t * 10) * 0.4
    return burst + sweep



def s_alarm(rng, d, p):           # alarm clock: groups of four short square beeps, dur covers the whole section, pitch sets the note
    t = tt(d)
    ph = (t % 0.5)
    on = ((ph < 0.32) & ((ph % 0.08) < 0.05)).astype(float)
    f = 2100 * p
    tone = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * 2 * t) * 0.2
    return filt(tone * on, 'lowpass', 7000) * np.minimum(1, (d - t) / 0.03) * 0.6


def s_caw(rng, d, p):             # crow caw: a hoarse "caw", band-passed noise + falling pitch
    t = tt(d)
    f0 = 900 * p * np.exp(-t * 2.5) + 420 * p
    voice = np.sign(np.sin(2 * np.pi * np.cumsum(f0) / SR)) * 0.4
    rasp = filt(rng.standard_normal(len(t)), 'bandpass', [700 * p, 2400 * p]) * 0.6
    return filt(voice + rasp, 'bandpass', [500, 3000]) * env_ad(d, 0.01, 3)


def s_squeak(rng, d, p):          # squeak: a short cartoon squeak, pitch up then down
    t = tt(d)
    f = 900 * p + 700 * p * np.sin(np.pi * np.clip(t / d, 0, 1))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(d, 0.005, 6) * 0.7


# ---- Movie-trailer accents: chapter titles, the "impact" before or after a pause ----
def _verb(rng, x, secs=2.4, lp=3200, wet=0.55):
    """Simple reverb: exponentially decaying noise as the impulse response, convolved for a hall tail (same length, tail fades within dur)"""
    from scipy.signal import fftconvolve
    t = tt(secs)
    ir = filt(rng.standard_normal(len(t)), 'lowpass', lp) * np.exp(-t * 6.9 / secs)
    ir[:int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))   # pre-delay
    w = fftconvolve(x, ir)[:len(x)]
    w /= (np.max(np.abs(w)) or 1)
    return x / (np.max(np.abs(x)) or 1) + w * wet


def _sweep_lp(x, f0, f1, curve):
    """Time-varying low-pass: cutoff slides exponentially from f0 to f1 (block filtering)"""
    n, blk, out, zi = len(x), 512, np.zeros(len(x)), np.zeros((1, 2))
    for i in range(0, n, blk):
        fc = f1 + (f0 - f1) * np.exp(-(i / SR) * curve)
        y, zi = sosfilt(butter(2, min(fc, SR / 2 * 0.95), btype='lowpass', fs=SR, output='sos'), x[i:i + blk], zi=zi)
        out[i:i + blk] = y
    return out


def s_braam(rng, d, p):           # trailer brass braam: a long low blast after a chapter title lands, heavy low end, built-in hall tail
    from scipy.signal import sawtooth
    t = tt(d)
    f0 = 55 * p
    x = sum(sawtooth(2 * np.pi * f * t + rng.random() * 6) * a for f, a in
            ((f0, 1), (f0 * 1.006, .8), (f0 * .994, .8), (f0 * 2, .55), (f0 * 2.004, .45), (f0 * 3, .3), (f0 * 1.498 * 2, .25)))
    x = _sweep_lp(x, 2600 * p, 380 * p, 2.2)                     # bright at the start, then closes down
    x = np.tanh(x * 1.8) + np.sin(2 * np.pi * f0 / 2 * t) * 0.7      # saturation + sine an octave below for weight
    x *= np.minimum(1, t / 0.035) * np.exp(-t * 1.25)
    return _verb(rng, x, 2.8, 2400, 0.45)


def s_trailerhit(rng, d, p):      # cinematic hit: sub drop + metal impact + hall tail, more "film" and heavier than slam
    t = tt(d)
    sub = chirp(78 * p, 27 * p, d, 5) * np.exp(-t * 2.4) * np.minimum(1, t / 0.003)
    body = filt(rng.standard_normal(len(t)), 'lowpass', 2600 * p) * np.exp(-t * 16)
    snap = filt(rng.standard_normal(len(t)), 'bandpass', [1800, 9000]) * np.exp(-t * 55) * 0.8
    metal = sum(np.sin(2 * np.pi * f * p * t + rng.random() * 6) * np.exp(-t * r) for f, r in
                ((173, 3.2), (261, 3.8), (389, 4.5), (587, 5.5), (941, 7))) * 0.22
    x = np.tanh((sub * 1.6 + body + snap + metal) * 1.5)
    return _verb(rng, x, 2.6, 3000, 0.6)


def s_rumble(rng, d, p):          # low rumble bed: "the air is shaking" under a pause, dur covers it, fades in and out automatically
    t = tt(d)
    brown = np.cumsum(rng.standard_normal(len(t)))
    brown = filt(brown - filt(brown, 'lowpass', 8), 'lowpass', 140 * p)
    tone = np.sin(2 * np.pi * 36 * p * t) + np.sin(2 * np.pi * 38.5 * p * t) * .7
    k = t / d
    e = np.clip(np.minimum(k / 0.25, (1 - k) / 0.2), 0, 1) ** 1.5
    return (brown / (np.max(np.abs(brown)) or 1) + tone * 0.35) * e


def s_suck(rng, d, p):            # reverse suck: reversed cymbal + reversed hit tail, swelling until cut off at the impact, with align:'end'
    t = tt(d)
    hit = filt(rng.standard_normal(len(t)), 'bandpass', [900 * p, 11000]) * np.exp(-t * 4.5)
    low = chirp(90 * p, 40 * p, d, 3) * np.exp(-t * 3) * 0.6
    x = _verb(rng, hit + low, 1.6, 7000, 0.8)[::-1]
    return x * (t / d) ** 1.6


# ---- Bright, playful intro sounds: pitched, short, dry, no long metallic tail ----
def s_bleep(rng, d, p):           # bleep: clean pitched beep (880 Hz × pitch); several with different pitches make an arpeggio
    t = tt(d)
    f = 880 * p
    x = np.sin(2 * np.pi * f * t) * 0.7 + np.sign(np.sin(2 * np.pi * f * t)) * 0.15
    return filt(x, 'lowpass', 6000) * np.minimum(1, t / 0.003) * np.exp(-t * 22)


def s_punch(rng, d, p):           # bright punch: short kick + triple clap, drier and brighter than slam, not muffled
    t = tt(d)
    kick = chirp(170 * p, 50 * p, d, 28) * np.exp(-t * 11)
    click = filt(rng.standard_normal(len(t)), 'highpass', 2500) * np.exp(-t * 400) * 0.6
    clap = np.zeros(len(t))
    for o in (0.0, 0.009, 0.018):
        m = t >= o
        clap[m] += filt(rng.standard_normal(m.sum()), 'bandpass', [1100, 5200]) * np.exp(-(t[m] - o) * 38)
    return np.tanh((kick * 1.4 + click + clap * 0.7) * 1.4)


def s_snap(rng, d, p):            # snap: crisp clap / finger snap, stamps, cards settling
    t = tt(d)
    x = np.zeros(len(t))
    for o in (0.0, 0.007, 0.014):
        m = t >= o
        x[m] += filt(rng.standard_normal(m.sum()), 'bandpass', [1500 * p, 7000]) * np.exp(-(t[m] - o) * 45)
    return x + np.sin(2 * np.pi * 320 * p * t) * np.exp(-t * 60) * 0.3


def s_zip(rng, d, p):             # zip: fast upward zipper slide, dash / fling in, with align:'end'
    t = tt(d)
    k = t / d
    f = 280 * p * (12 ** (k ** 1.4))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5
    air = sweep_noise(rng, d, 800 * p, 7000 * p, 0.6, 1.4) * 4
    return (tone + air) * k ** 1.5


def s_scratch(rng, d, p):         # record scratch: back-and-forth "wikka", a hard brake before a freeze frame / "it gets worse"
    t = tt(d)
    rate = np.abs(np.sin(2 * np.pi * 5.5 * t / (d / 0.35)))           # scratch speed: back and forth
    f = (160 + 1100 * rate) * p
    from scipy.signal import sawtooth
    tone = sawtooth(2 * np.pi * np.cumsum(f) / SR) * 0.35
    n = rng.standard_normal(len(t)) * (0.3 + rate)
    x = filt(tone + n * 0.5, 'bandpass', [300, 4000])
    return x * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.4


def s_granted(rng, d, p):         # granted: two-note rising synth chime ("access granted / passed"), short, bright, not a bell
    t = tt(d)
    out = np.zeros(len(t))
    for t0, f in ((0.0, 659 * p), (0.09, 988 * p)):
        m = t >= t0
        u = t[m] - t0
        v = np.sign(np.sin(2 * np.pi * f * u)) * 0.35 + np.sin(2 * np.pi * f * u) * 0.6
        out[m] += filt(v, 'lowpass', 4500) * np.minimum(1, u / 0.003) * np.exp(-u * (14 if t0 == 0 else 7))
    return out


def s_stab(rng, d, p):            # brass stab: one short bright major chord "da!", an accent for big text, no long tail
    from scipy.signal import sawtooth
    t = tt(d)
    f0 = 196 * p
    x = sum(sawtooth(2 * np.pi * f * t + rng.random() * 6) * a for f, a in
            ((f0, 1), (f0 * 1.004, .7), (f0 * 1.26, .7), (f0 * 1.5, .7), (f0 * 2, .5), (f0 * 2.52, .3)))
    x = _sweep_lp(x, 6000 * p, 900 * p, 9)
    return np.tanh(x * 1.2) * np.minimum(1, t / 0.004) * np.exp(-t * 6.5)


def s_bloop(rng, d, p):           # bloop: cartoon bubble, rising pitch, something small popping up
    t = tt(d)
    f = 320 * p * (3 ** (t / d))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.004) * np.exp(-t * 16)


def s_boop(rng, d, p):            # boop: falling pitch, something shrinking away / an ending
    t = tt(d)
    f = 900 * p * (0.2 ** (t / d))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.004) * np.exp(-t * 7)


def s_ratchet(rng, d, p):         # ratchet: a run of fine mechanical clicks (a dial, unscrewing), dur covers it
    t = tt(d)
    out = np.zeros(len(t))
    pos = 0.0
    while pos < d - 0.02:
        m = t >= pos
        u = t[m] - pos
        out[m] += (filt(rng.standard_normal(m.sum()), 'highpass', 2500) * np.exp(-u * 500) + np.sin(2 * np.pi * 1900 * p * u) * np.exp(-u * 300) * 0.4)
        pos += 0.03 + 0.012 * rng.random()
    return out


def s_latch(rng, d, p):           # latch: a lock bolt / door catch, two crisp mechanical clicks + a touch of low end, no reverb
    t = tt(d)
    out = np.zeros(len(t))
    for o, g in ((0.0, 1.0), (0.055, 0.8)):
        m = t >= o
        u = t[m] - o
        out[m] += filt(rng.standard_normal(m.sum()), 'bandpass', [1800, 8000]) * np.exp(-u * 260) * g
    return out + chirp(120 * p, 60 * p, d, 30) * np.exp(-t * 22) * 0.6


def s_countup(rng, d, p):         # number roll / level up: a very light rising hiss while rolling, a soft "ding" when it lands (E6 × pitch, snaps to the key); t = roll starts, dur = until it settles
    n = int(d * SR); u = np.arange(n) / SR; x = rng.standard_normal(n); q = u / max(d, 1e-3)
    sw = (filt(x, 'highpass', 5000) * (1 - q) + filt(x, 'highpass', 9000) * q) * q ** 1.5 * 0.35
    out = np.zeros(int((d + 0.5) * SR)); out[:n] += sw
    f = 1318.5 * p; v = tt(0.4)
    ding = (np.sin(2 * np.pi * f * v) + 0.25 * np.sin(2 * np.pi * 2.01 * f * v) + 0.08 * np.sin(2 * np.pi * 3.02 * f * v)) * np.minimum(1, v / 0.0015) * np.exp(-v * 16)
    i = int(d * SR); out[i:i + len(ding)] += ding[:len(out) - i]
    return out


def s_shutter(rng, d, p):         # phone shutter: two thin, crisp clicks, taking a photo / a viewfinder snapping shut
    out = np.zeros(int(0.3 * SR))
    for t0, g in ((0.0, 1.0), (0.04, 0.7)):
        m = int(0.03 * SR); v = np.arange(m) / SR
        b = filt(rng.standard_normal(m), 'highpass', 4000 * p) * np.minimum(1, v / 0.0005) * np.exp(-v * 160) * g
        i = int(t0 * SR); out[i:i + m] += b
    return out


def s_filmfeed(rng, d, p):        # film feed: sprocket clatter getting faster, ending in a "clack" + low end (pressed / settled); t = feed starts
    out = np.zeros(int((d + 0.4) * SR)); pos = 0.0
    while pos < d - 0.02:
        q = pos / d; m = int(0.012 * SR); v = np.arange(m) / SR
        b = filt(rng.standard_normal(m), 'bandpass', [1500, 6000]) * np.minimum(1, v / 0.0005) * np.exp(-v * 300) * (0.25 + 0.25 * q)
        i = int(pos * SR); out[i:i + m] += b[:len(out) - i]; pos += 0.07 - 0.045 * q
    m = int(0.06 * SR); v = np.arange(m) / SR; i = int(d * SR)
    out[i:i + m] += filt(rng.standard_normal(m), 'bandpass', [800, 5000]) * np.minimum(1, v / 0.001) * np.exp(-v * 80) * 0.9
    m = int(0.12 * SR); v = np.arange(m) / SR
    out[i:i + m] += np.sin(2 * np.pi * 110 * p * v) * np.minimum(1, v / 0.001) * np.exp(-v * 30) * 0.5
    return out

SOUNDS = {
    'bleep': (s_bleep, 0.14), 'punch': (s_punch, 0.35), 'snap': (s_snap, 0.2), 'zip': (s_zip, 0.3),
    'scratch': (s_scratch, 0.35), 'granted': (s_granted, 0.45), 'stab': (s_stab, 0.5), 'bloop': (s_bloop, 0.16),
    'boop': (s_boop, 0.32), 'ratchet': (s_ratchet, 0.4), 'countup': (s_countup, 0.8), 'shutter': (s_shutter, 0.3), 'filmfeed': (s_filmfeed, 1.5), 'latch': (s_latch, 0.3),
    'braam': (s_braam, 3.2), 'trailerhit': (s_trailerhit, 2.6), 'rumble': (s_rumble, 3.0), 'suck': (s_suck, 0.8),
    'whoosh': (s_whoosh, 0.45), 'swoosh': (s_swoosh, 0.18), 'riser': (s_riser, 1.0),
    'pop': (s_pop, 0.09), 'click': (s_click, 0.03), 'tick': (s_tick, 0.04), 'typing': (s_typing, 0.6),
    'thud': (s_thud, 0.35), 'impact': (s_impact, 0.6), 'boom': (s_boom, 1.4), 'hit': (s_hit, 0.3),
    'stamp': (s_stamp, 0.3), 'bonk': (s_bonk, 0.25), 'boing': (s_boing, 0.6), 'clang': (s_clang, 1.6),
    'stick': (s_stick, 0.12), 'snip': (s_snip, 0.12), 'glitch': (s_glitch, 0.15), 'buzz': (s_buzz, 1.0),
    'ding': (s_ding, 1.2), 'error': (s_error, 0.4), 'tear': (s_tear, 0.5), 'paper': (s_paper, 0.4),
    'cymbal': (s_cymbal, 2.2), 'room': (s_room, 5.0), 'vinyl': (s_vinyl, 5.0),
    'sub': (s_sub, 0.9), 'slam': (s_slam, 1.0), 'whip': (s_whip, 0.25),
    'crack': (s_crack, 0.5), 'shatter': (s_shatter, 1.3), 'projector': (s_projector, 1.5),
    'laser': (s_laser, 0.18), 'blip': (s_blip, 0.1), 'explode8': (s_explode8, 0.45),
    'alarm': (s_alarm, 1.0), 'caw': (s_caw, 0.6), 'squeak': (s_squeak, 0.25),
    'pour': (s_pour, 1.5), 'gloop': (s_gloop, 0.3), 'slurp': (s_slurp, 1.2), 'seal': (s_seal, 0.7), 'squirt': (s_squirt, 0.9),
    'jump8': (s_jump8, 0.22), 'bump8': (s_bump8, 0.16), 'power8': (s_power8, 0.6), 'gameover8': (s_gameover8, 1.6),
}
LEVEL = {'room': 0.05, 'vinyl': 0.12}   # room-tone sounds are pulled down after normalisation; default gain is fine


# Pitched sounds -> fundamental (Hz). When sfx_cues.json has MUSIC.key, these are pitch-snapped to the nearest note of the music's scale
# so they don't clash with the music. snap: false in a cue turns it off.
TONAL_HZ = {'countup': 1318.5, 'bleep': 880, 'ding': 1320, 'granted': 659, 'bloop': 320, 'boop': 900, 'pop': 1100, 'blip': 988, 'bonk': 560,
            'boing': 220, 'squeak': 900, 'jump8': 220, 'power8': 523, 'stab': 196}
TONAL_CHORD = {}                             # kit sounds that are a run of notes: semitones besides the root that must also fit the key (filled by sfx_kit.install)
KEY_NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
SCALE = {'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10], 'dorian': [0, 2, 3, 5, 7, 9, 10],
         'mixolydian': [0, 2, 4, 5, 7, 9, 10], 'lydian': [0, 2, 4, 6, 7, 9, 11]}


def snap_pitch(name, pitch, key, scale='minor'):
    if name not in TONAL_HZ or key not in KEY_NOTE:
        return pitch
    sc = SCALE.get(scale, SCALE['minor'])
    if name in ('stab', 'power8'):          # major triad: the root may only land on scale degrees that already carry a major triad
        ok = [d for d in sc if (d + 4) % 12 in sc and (d + 7) % 12 in sc]
    elif name == 'granted':                 # two notes rising a fifth
        ok = [d for d in sc if (d + 7) % 12 in sc]
    elif name == 'blip':                    # two notes rising a fourth
        ok = [d for d in sc if (d + 5) % 12 in sc]
    elif name in TONAL_CHORD:
        ok = [d for d in sc if all((d + o) % 12 in sc for o in TONAL_CHORD[name])] or sc
    else:
        ok = sc
    root, f = KEY_NOTE[key], TONAL_HZ[name] * pitch
    midi = 69 + 12 * np.log2(f / 440)
    best = min((m for m in range(int(midi) - 7, int(midi) + 8) if (m - root) % 12 in ok), key=lambda m: abs(m - midi))
    return 440 * 2 ** ((best - 69) / 12) / TONAL_HZ[name]


try:                                          # the kit: register the sfx_kit.py sounds in SOUNDS / TONAL_HZ
    import sfx_kit
    sfx_kit.install(sys.modules[__name__])
except ImportError:
    sfx_kit = None


def make(name, dur=None, pitch=1.0, seed=0, opts=None):
    if name not in SOUNDS:
        raise SystemExit(f'unknown sound {name!r}. Available: {", ".join(SOUNDS)}')
    fn, d0 = SOUNDS[name]
    d = float(dur) if dur else d0
    if opts and getattr(fn, 'kit', False):       # kit (sfx_kit.py) sounds take bright / len
        x = fn(np.random.default_rng(seed), d, float(pitch), **opts)
    else:
        x = fn(np.random.default_rng(seed), d, float(pitch))
    peak = np.max(np.abs(x)) or 1.0
    return x / peak * LEVEL.get(name, 1.0)


# Only the first of a series: for small-element and card-swap sounds, a cue with the same name within SERIES_WIN s of the previous one
# counts as the same series and is skipped; cues within 0.3 s of the series' first cue count as one burst (a group appearing together) and still play.
# keep: true in a cue exempts it. Only applies to videos with SFX_KIT; older videos re-render unchanged.
SERIES = {'tik', 'bub', 'swick', 'slide', 'pop', 'bloop', 'sheet', 'deal', 'pip', 'notify', 'swoop'}
SERIES_WIN = 2.0


def series_filter(cues):
    out, first, last = [], {}, {}
    for c in sorted(cues, key=lambda c: c['t']):
        n, t = c['name'], float(c['t'])
        if n in SERIES and not c.get('keep'):
            if n in last and t - last[n] < SERIES_WIN and t - first[n] > 0.3:
                last[n] = t
                print(f'{t:7.3f}        {n} (later hit in a run, no sound)')
                continue
            if n not in last or t - last[n] >= SERIES_WIN:
                first[n] = t
            last[n] = t
        out.append(c)
    return out


def mix(video, cues, key=None, scale='minor', kit=None):
    dur = float(video['duration'])
    n = int(round(dur * SR))
    L, R = np.zeros(n), np.zeros(n)
    fps = video.get('fps', 30)
    print(f'{"time":>7} {"frame":>5}  sound')
    gone = getattr(sfx_kit, 'REMOVED', {}) if sfx_kit else {}
    for c in [c for c in cues if not c.get('name') or c['name'] in gone]:
        print(f"{float(c['t']):7.3f}        {c.get('name') or '(empty)'} ({'removed from the sound kit: ' + gone[c['name']] if c.get('name') in gone else 'no sound'}, skipped)")
    cues = [c for c in cues if c.get('name') and c['name'] not in gone]
    if kit is not None:
        cues = series_filter(cues)
    for i, c in enumerate(sorted(cues, key=lambda c: c['t'])):
        pitch = c.get('pitch', 1.0)
        kp, ks, opts, kg = sfx_kit.cue_opts(c, kit) if (kit is not None and sfx_kit) else (1.0, 0, None, None)   # kit: this video's variant
        pitch *= kp
        if key and c.get('snap', True):
            pitch = snap_pitch(c['name'], pitch, key, scale)
        s = make(c['name'], c.get('dur'), pitch, seed=zlib.crc32(f"{i}{c['name']}{c['t']}".encode()) + ks, opts=opts)
        cut = getattr(SOUNDS[c['name']][0], 'cut', None)     # kit sounds with an alignment point `cut` (revcut, notify, swoop): the cue's t is the visual hit / cut, the sound shifts itself earlier
        if c.get('align') == 'end':
            start = float(c['t']) - len(s) / SR
        elif cut and c.get('align') != 'start':
            start = float(c['t']) - cut * float((opts or {}).get('len', 1.0))
        else:
            start = float(c['t'])
        print(f'{c["t"]:7.3f} {round(c["t"] * fps):5d}  {c["name"]}{" (end-aligned)" if c.get("align") == "end" else " (hit-aligned)" if cut and c.get("align") != "start" else ""}')
        i0 = int(round(start * SR))
        if i0 < 0:
            s, i0 = s[-i0:], 0
        if i0 >= n:
            print(f'  warning: {c["name"]} @ {c["t"]}s is past the end of the video, dropped')
            continue
        s = s[: n - i0] * float(c.get('gain', kg if kg is not None else 0.8))
        pan = float(c.get('pan', 0.0))
        L[i0:i0 + len(s)] += s * np.sqrt(0.5 * (1 - pan))
        R[i0:i0 + len(s)] += s * np.sqrt(0.5 * (1 + pan))
    m = np.stack([L, R], 1)
    m = np.tanh(m * 1.2) / np.tanh(1.2)            # soft clip to avoid overload when sounds stack
    peak = np.max(np.abs(m))
    if peak > 0.89:
        m *= 0.89 / peak                            # only ever turn down: peak ≤ -1 dBFS, the noise floor is never raised
    f = int(0.01 * SR)
    m[:f] *= np.linspace(0, 1, f)[:, None]
    m[-f:] *= np.linspace(1, 0, f)[:, None]
    return m


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(2)
    if a[0] == '--list':
        src = open(__file__, encoding='utf-8').read().splitlines()
        for k, (fn, d) in SOUNDS.items():
            line = src[fn.__code__.co_firstlineno - 1] if not getattr(fn, 'kit', False) else '# [kit] ' + (fn.__doc__ or '')
            print(f'{k:8s} {d:4.2f}s  {line.split("#", 1)[1].strip() if "#" in line else ""}')
        return
    if a[0] == '--audition':
        out = a[1] if len(a) > 1 else 'sfx_audition.wav'
        parts, t, cues = [], 0.0, []
        for k, (_, d) in SOUNDS.items():
            d = min(d, 2.0)
            cues.append({'t': t, 'name': k, 'dur': d})
            t += d + 0.5
        m = mix({'duration': t, 'fps': 30}, cues)
        wavfile.write(out, SR, (m * 32767).astype(np.int16))
        print('preview file ->', out)
        return
    proj = a[0]
    data = json.load(open(os.path.join(proj, 'build', 'sfx_cues.json'), encoding='utf-8'))
    mus = data.get('music') or {}
    key, scale = (mus.get('key'), mus.get('scale', 'minor')) if not mus.get('file') else (None, 'minor')
    if not key and data.get('bgm_key'):        # a voiceover insert without its own music: use the key of the whole video's BGM (window.BGM_KEY in timeline.js)
        key, scale = data['bgm_key'].get('key'), data['bgm_key'].get('mode', 'major')
    if key:
        print(f'pitched sounds snapped to the {key} {scale} scale')
    kit = data.get('kit')                      # window.SFX_KIT from timeline.js
    if kit is not None:
        print(f'sound kit palette {kit}')
    m = mix(data['video'], data['cues'], key, scale, kit=kit)
    # True silence windows (timeline.js window.MUTE = [[start, end], ...]): hard-cut all effect tails so a freeze frame is really quiet
    for a0, b0 in data.get('mute') or []:
        i0, i1 = int(a0 * SR), int(b0 * SR)
        f = min(int(0.01 * SR), i0)
        m[i0 - f:i0] *= np.linspace(1, 0, f)[:, None] if m.ndim > 1 else np.linspace(1, 0, f)
        m[i0:i1] = 0
    out = os.path.join(proj, 'build', 'sfx.wav')
    wavfile.write(out, SR, (m * 32767).astype(np.int16))
    print(f'{out}  {len(m) / SR:.3f}s  {SR}Hz stereo')


if __name__ == '__main__':
    main()
