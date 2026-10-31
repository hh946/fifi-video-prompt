"""Mix a background song under the sound effects: build/sfx.wav + song -> build/mix.wav (mux.py picks mix.wav up).

Usage:
  python3 music.py <project dir> [--file song.mp3]
  The song comes from --file, or from MUSIC.file in timeline.js:
    window.MUSIC = { file: 'assets/song.mp3', gain: 1, sfxGain: 0.3, sfxHP: 200, offset: 0 }
  gain = song volume; sfxGain = effects volume on top; sfxHP = high-pass on the effects (Hz) so they don't fight
  the song's kick / bass / vocals; offset = where in the song to start (s).
  No music: removes an old mix.wav and exits (mux.py then uses sfx.wav).
Needs: numpy, scipy, ffmpeg.
"""
import json
import os
import subprocess
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000


def highpass(x, f):
    return sosfilt(butter(2, f, btype='highpass', fs=SR, output='sos'), x)


def mix_song(proj, spec, dur, mixp):
    src = spec['file'] if os.path.isabs(spec['file']) else os.path.join(proj, spec['file'])
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(spec.get('offset', 0)), '-i', src, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    song = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
    n = int(round(dur * SR))
    song = np.pad(song, ((0, max(0, n - len(song))), (0, 0)))[:n] * spec.get('gain', 1.0)
    wavfile.write(os.path.join(proj, 'build', 'music.wav'), SR, (np.clip(song, -1, 1) * 32767).astype(np.int16))
    _, sfx = wavfile.read(os.path.join(proj, 'build', 'sfx.wav'))
    sfx = sfx.astype(np.float64) / 32768.0
    if sfx.ndim == 1:
        sfx = np.stack([sfx, sfx], 1)
    sfx = sfx[:n]
    if spec.get('sfxHP', 200):
        sfx = highpass(sfx.T, spec.get('sfxHP', 200)).T
    mix = song[:len(sfx)] + sfx * spec.get('sfxGain', 0.3)
    pk = np.max(np.abs(mix))
    if pk > 0.98:
        mix *= 0.98 / pk                                # only turn down, never up: the song keeps its loudness
    wavfile.write(mixp, SR, (mix * 32767).astype(np.int16))
    print(f'music {os.path.basename(src)} ({len(song) / SR:.2f}s) + sfx x{spec.get("sfxGain", 0.3)} (high-pass {spec.get("sfxHP", 200)} Hz) -> build/mix.wav')


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(2)
    proj = os.path.abspath(a[0])
    data = json.load(open(os.path.join(proj, 'build', 'sfx_cues.json'), encoding='utf-8'))
    spec = dict(data.get('music') or {})
    if '--file' in a:
        spec['file'] = a[a.index('--file') + 1]
    mixp = os.path.join(proj, 'build', 'mix.wav')
    if not spec.get('file'):
        if os.path.exists(mixp):
            os.remove(mixp)
        print('no music: sound effects only')
        return
    mix_song(proj, spec, float(data['video']['duration']), mixp)


if __name__ == '__main__':
    main()
