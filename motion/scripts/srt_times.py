# Take a range of SRT cues by index (sorted by time, so cues appended out of order at the end of the file are included),
# print their times relative to the range start, and estimate when each keyword is spoken by splitting each cue's
# duration evenly over its spoken units.
# Usage: python3 srt_times.py <srt> <first index> <last index> [keyword ...]
import re, sys
def sec(x):
    h, m, r = x.split(':'); a, b = r.split(','); return int(h) * 3600 + int(m) * 60 + int(a) + int(b) / 1000
def units(s):   # spoken units: 1 per CJK character; English words ~ syllable count; digits one each
    u = []
    for m in re.finditer(r'[A-Za-z]+|\d|[一-鿿]|.', s):
        w = m.group()
        if re.match(r'[A-Za-z]+', w): u += [(m.start(), m.end())] * max(1, len(re.findall(r'[aeiouy]+', w.lower())))
        elif w.strip() and w not in '，。、！？,.': u.append((m.start(), m.end()))
    return u
srt, a, z = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); keys = sys.argv[4:]
rows = []
for b in re.split(r'\n\s*\n', open(srt, encoding='utf-8').read().strip()):
    l = b.split('\n'); s0, s1 = l[1].split(' --> '); rows.append((int(l[0]), sec(s0), sec(s1), ''.join(l[2:])))
seg = [r for r in rows if a <= r[0] <= z]; t0 = min(r[1] for r in seg); t1 = max(r[2] for r in seg)
print(f'Cues #{a}-#{z}: {t0:.3f}–{t1:.3f}s, duration {t1 - t0:.3f}s, {round((t1 - t0) * 30)} frames')
for i, s, e, txt in sorted(seg, key=lambda r: r[1]):
    u = units(txt); per = (e - s) / max(1, len(u))
    hits = []
    for k in keys:
        p = txt.find(k)
        if p >= 0:
            idx = next(j for j, (st, en) in enumerate(u) if st >= p)
            hits.append(f'"{k}" {s - t0 + idx * per:.2f}')
    print(f'#{i:3d} {s - t0:7.3f}–{e - t0:7.3f}  {txt}   ' + ' '.join(hits))
