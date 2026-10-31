"""Mux frames/*.png + the audio track into an MP4, verify the spec, and pull QA frames from the result into a contact sheet.

Usage:
  python3 mux.py <project dir> [--out name.mp4] [--qa 2 6 10 15 ...]
Audio: build/mix.wav if it exists (sound effects + music already mixed), otherwise build/sfx.wav.
Default output: <project>/<dir name>-<W>x<H>-<fps>fps.mp4 (a trailing "样片" is stripped from the dir name);
prefer --out with a descriptive name. Default QA points: every 1/7 of the duration plus 1 s before the end.
Encoding: H.264 High / yuv420p / BT.709 / AAC 48 kHz / +faststart, which plays on all common players and platforms.
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write(r.stderr[-3000:])
        raise SystemExit(f'Command failed: {" ".join(cmd[:6])} ...')
    return r.stdout


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(2)
    proj = os.path.abspath(a[0])
    v = json.load(open(os.path.join(proj, 'build', 'sfx_cues.json'), encoding='utf-8'))['video']
    fps, dur, W, H = v['fps'], float(v['duration']), v['width'], v['height']
    out = os.path.join(proj, a[a.index('--out') + 1]) if '--out' in a else os.path.join(proj, f"{os.path.basename(proj).removesuffix('样片')}-{W}x{H}-{fps}fps.mp4")
    frames = sorted(f for f in os.listdir(os.path.join(proj, 'frames')) if f.endswith('.png'))
    need = int(dur * fps + 0.5)          # matches Math.round in render_frames.js (Python round() is banker's rounding: 1408.5 -> 1408)
    if len(frames) != need:
        raise SystemExit(f'frames/ has {len(frames)} frames, expected {need}. Run render_frames.js first')
    wav = os.path.join(proj, 'build', 'sfx.wav')
    if not os.path.exists(wav):
        raise SystemExit('Missing build/sfx.wav; run sfx.py first')
    if os.path.exists(os.path.join(proj, 'build', 'mix.wav')):   # with background music: use the pre-mixed track
        wav = os.path.join(proj, 'build', 'mix.wav')
    print('Audio: ' + os.path.relpath(wav, proj))

    run(['ffmpeg', '-y', '-v', 'error', '-framerate', str(fps), '-i', os.path.join(proj, 'frames', 'frame_%04d.png'), '-i', wav,
         '-map', '0:v', '-map', '1:a',
         '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', '16M', '-bufsize', '32M',
         '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-r', str(fps), '-g', str(fps * 2),
         # PNGs are RGB: convert to YUV with BT.709 and tag it. Otherwise ffmpeg converts with BT.601 and leaves it untagged;
         # players and browsers decode as 709 and reds / greens shift.
         '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
         '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
         '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
         '-t', f'{dur:.3f}', '-movflags', '+faststart', out])

    info = json.loads(run(['ffprobe', '-v', 'error', '-show_entries',
                           'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,nb_frames,sample_rate',
                           '-of', 'json', out]))
    vs = next(s for s in info['streams'] if s['codec_type'] == 'video')
    aus = [s for s in info['streams'] if s['codec_type'] == 'audio']
    num, den = map(int, vs['r_frame_rate'].split('/'))
    got_dur = float(info['format']['duration'])
    checks = [
        ('Resolution', f"{vs['width']}x{vs['height']}", vs['width'] == W and vs['height'] == H),
        ('Frame rate', f'{num / den:g}', abs(num / den - fps) < 0.01),
        ('Video codec', vs['codec_name'], vs['codec_name'] == 'h264'),
        ('Pixel format', vs['pix_fmt'], vs['pix_fmt'] == 'yuv420p'),
        ('Frame count', vs.get('nb_frames', '?'), str(vs.get('nb_frames')) == str(need)),
        ('Audio', aus[0]['codec_name'] + ' ' + aus[0]['sample_rate'] if aus else 'none', bool(aus) and aus[0]['codec_name'] == 'aac'),
        ('Duration', f'{got_dur:.3f}s', abs(got_dur - dur) <= 1.5 / fps),
    ]
    ok = True
    for name, val, good in checks:
        print(f'{"✓" if good else "✗"} {name}: {val}')
        ok &= good
    print(f'File: {out}  {int(info["format"]["size"]) / 1e6:.1f} MB')

    # Grab frames from the encoded MP4 (checks the final encode, not the source PNGs)
    if '--qa' in a:
        times = [float(x) for x in a[a.index('--qa') + 1:] if not x.startswith('--')]
    else:
        times = [round(dur * k / 7, 2) for k in range(1, 7)] + [round(dur - 1, 2)]
    qdir = os.path.join(proj, 'qa_final')
    os.makedirs(qdir, exist_ok=True)
    shots = []
    for t in times:
        p = os.path.join(qdir, f'check_{t:g}.png')
        run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{t}', '-i', out, '-frames:v', '1', p])
        shots.append(p)
    cols = min(4, len(shots))
    rows = -(-len(shots) // cols)
    inputs = sum((['-i', p] for p in shots), [])
    for _ in range(cols * rows - len(shots)):
        inputs += ['-f', 'lavfi', '-i', 'color=black:s=640x360:d=0.04']
    n = cols * rows
    fc = ''.join(f'[{i}:v]scale=640:360[v{i}];' for i in range(n)) + ''.join(f'[v{i}]' for i in range(n)) + \
        f'xstack=inputs={n}:layout=' + '|'.join(f'{(i % cols) * 640}_{(i // cols) * 360}' for i in range(n))
    sheet = os.path.join(qdir, 'contact.png')
    try:
        run(['ffmpeg', '-y', '-v', 'error'] + inputs + ['-filter_complex', fc, '-frames:v', '1', sheet])
        print(f'QA frames -> {qdir}; contact.png left-to-right, top-to-bottom: {", ".join(f"{t:g}s" for t in times)}')
    except SystemExit:
        print('Contact sheet failed (the video is fine); single QA frames are in', qdir)
    from energy import report
    if not report(out, v.get('energy', 'high'), v.get('blockColor', 'redblack'), v.get('holds') or ()):
        ok = False
    if not ok:
        raise SystemExit('Spec or energy check failed')


if __name__ == '__main__':
    main()
