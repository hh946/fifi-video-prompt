"""Energy check: measure motion energy and colour-block contrast of a rendered video.

Usage: python3 energy.py <video.mp4> [--level high|medium|explain|calm] [--block redblack|any]
high (punchy: intros / hooks) and medium (explanatory demo) exit with code 1 when out of range;
calm only reports the numbers. medium also has upper limits: a mid-video demo must not out-shout the intro.

Reference: a 30 s high-energy clip measures mean frame diff 14.3, ~0% dead frames, 14.9 hard hits/s,
longest still 0.7 s, 25% black + 10% red.
"""
import subprocess
import sys

import numpy as np

RULES = {  # level -> [(label, metric key, min, max)], None = no limit
    'high': [
        ('Mean frame diff', 'mean', 6.0, None),
        ('Dead frames % (still >= 0.1s)', 'still', None, 10.0),
        ('Hard hits / s', 'hits', 3.0, None),
        ('Longest still (s)', 'longest', None, 0.8),
        ('Black + red block %', 'block', 12.0, None),
    ],
    'medium': [   # Explanatory demo: no shake, jitter or breathing; motion comes from process animation and pans.
                  # Dead-frame share is the main gate; the mean-diff floor is calibrated on real demos without shake/jitter.
        ('Mean frame diff', 'mean', 1.0, 9.0),
        ('Dead frames % (still >= 0.1s)', 'still', None, 20.0),
        ('Hard hits / s', 'hits', 0.5, 6.0),
        ('Longest still (s)', 'longest', None, 1.0),
        ('Black + red block %', 'block', 6.0, None),
    ],
}
# explain level (explainer diagrams): calibrated on pure-graphics segments of tech explainer videos (block='any').
# Measured ranges: mean diff 1.3-3.3, dead frames 36-58%, longest still 1.8-3.9 s, hard hits 0.07-4.1/s.
# Diagrams need reading time, so they naturally have more dead frames than screen demos. Thresholds sit near the
# median and are stricter than the loosest segments: dead frames <= 50%, longest still <= 2.5 s.
RULES['explain'] = [
    ('Mean frame diff', 'mean', 1.2, 9.0),
    ('Dead frames % (still >= 0.1s)', 'still', None, 50.0),
    ('Hard hits / s', 'hits', 0.3, 6.0),
    ('Longest still (s)', 'longest', None, 2.5),
    ('Black + red block %', 'block', 6.0, None),
]
RULES['calm'] = RULES['medium']   # calm only reports; it borrows the medium table as a reference
NAMES = {'high': 'high', 'medium': 'medium', 'explain': 'explain', 'calm': 'calm'}


def measure(path, block='redblack', holds=()):
    b = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', 'scale=160:90', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                       capture_output=True).stdout
    f = np.frombuffer(b, np.uint8).reshape(-1, 90, 160, 3).astype(float)
    fps = float(eval(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=r_frame_rate',
                                     '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip()))
    g = f.mean(3)
    d = np.abs(np.diff(g, axis=0)).mean((1, 2))
    still = d < 0.5
    # Declared holds (freeze frames, silent build-ups) are not counted as dead frames or as the longest still
    for h in holds or ():
        still[int(h[0] * fps):int(h[1] * fps) + 1] = False
    # Only runs of >= 3 still frames (0.1 s) count: stop-motion on twos/threes holding one frame is style, not dead air
    dead = np.zeros(len(still), bool)
    run = longest = 0
    for i, x in enumerate(still):
        run = run + 1 if x else 0
        longest = max(longest, run)
        if run >= 3:
            dead[i - run + 1:i + 1] = True
    r, gc, bl = f[..., 0], f[..., 1], f[..., 2]
    red = ((r > 150) & (gc < 90) & (bl < 90)).mean()
    dark = (g < 50).mean()
    mx, mn = f.max(3), f.min(3)
    sat = ((mx - mn) / np.maximum(mx, 1) > 0.55) & (mx > 90)          # highly saturated block of any hue
    solid = sat.mean() if block == 'any' else red
    return {'mean': d.mean(), 'still': dead.mean() * 100, 'hits': np.sum(d > 8) / (len(f) / fps),
            'longest': longest / fps, 'block': (solid + dark) * 100, 'red': red * 100, 'sat': sat.mean() * 100, 'dark': dark * 100, 'd': d, 'fps': fps, 'mode': block}


def report(path, level='high', block='redblack', holds=()):
    """block: 'redblack' (black + red) | 'any' (black + any highly saturated colour)."""
    m = measure(path, block, holds)
    ok = True
    gate = level != 'calm'
    print(f'Energy ({NAMES.get(level, level)}):')
    if holds:
        dur = len(m['d']) / m['fps']
        tot = sum(h[1] - h[0] for h in holds)
        for h in holds:
            print(f'  · declared hold {h[0]:.2f}–{h[1]:.2f}s: {h[2] if len(h) > 2 else "(no reason given)"}')
        if tot > 0.08 * dur or any(len(h) < 3 or not str(h[2]).strip() for h in holds):
            print(f'  ✗ declared holds total {tot:.2f}s (limit is 8% of duration = {0.08 * dur:.2f}s), and each needs a reason')
            ok = False
    for name, key, lo, hi in RULES[level]:
        v = m[key]
        if key == 'block' and m['mode'] == 'any':
            name = 'Black + saturated block %'
        good = (lo is None or v >= lo) and (hi is None or v <= hi)
        rng = f'{lo if lo is not None else ""}–{hi if hi is not None else ""}'.replace('–', ' ~ ') if lo is not None and hi is not None else (f'>= {lo}' if lo is not None else f'<= {hi}')
        mark = ('✓' if good else '✗') if gate else '·'
        print(f'  {mark} {name}: {v:.2f} (target {rng})')
        ok &= good or not gate
    print(f'    black {m["dark"]:.1f}% / red {m["red"]:.1f}% / saturated {m["sat"]:.1f}%')
    # The flattest 1-second window: where to add an event
    w = int(m['fps'])
    if len(m['d']) > w:
        roll = np.convolve(m['d'], np.ones(w) / w, 'valid')
        i = int(np.argmin(roll))
        print(f'    flattest second: {i / m["fps"]:.2f}s–{(i + w) / m["fps"]:.2f}s (mean frame diff {roll[i]:.2f})')
    if not ok:
        print('  Energy out of range for this level: if too flat, add an event in the flattest second; if medium is over the limit, '
              'remove screen shake / white flashes / burst frames. If the level is wrong, change VIDEO.energy '
              '(high = intro, medium = mid-video demo, explain = explainer diagrams, calm = deliberately restrained)')
    return ok


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(2)
    lvl = a[a.index('--level') + 1] if '--level' in a else 'high'
    blk = a[a.index('--block') + 1] if '--block' in a else 'redblack'
    if lvl not in RULES:
        raise SystemExit(f'Unknown level {lvl}; choose high / medium / explain / calm')
    sys.exit(0 if report(a[0], lvl, blk) else 1)
