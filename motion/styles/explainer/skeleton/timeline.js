// The only source of time. Shots, sound effects and music all read their times from here.
const VIDEO = { width: 1920, height: 1080, fps: 30, duration: 10, energy: 'explain', blockColor: 'any' };

// Every moment in the video, in seconds. scene.js only ever refers to T.xxx.
const T = {
  // intro: 0,
  // title: 1.2,
};

// Sound effects: [t, name, { gain, align, dur, bright, len }]. List names with `python3 scripts/sfx_kit.py --list`;
// what picture gets which sound is in sfx-kit/README.md. Most components also return their own cues (shot.cues).
window.SFX_KIT = { pitch: 1.0, bright: 0.0, len: 1.0, seed: 0 };   // one "tint" for the whole set: pitch 0.85-1.2, bright -1..1, len 0.7-1.4, seed int
const SFX = [];

// Signature. Remove the whole block (and the watermark() call in render.js) if you don't want one.
// tone: 'dark' on dark backgrounds, 'light' on light ones (set end.tone to 'light' if your last shot is on paper).
const WATERMARK = {
  text: 'made with fifi-video',
  open: { out: 3, tone: 'dark' },
  end: { in: VIDEO.duration - 2, out: null, tone: 'dark', at: 'corner' },
};

// Background music (optional): an audio file inside the project. Or pass it at build time: build.sh <dir> --music song.mp3
// gain = song volume, sfxGain = effects volume on top of it, sfxHP = high-pass on the effects (Hz), offset = start point in the song (s).
window.MUSIC = null;   // e.g. { file: 'assets/song.mp3', gain: 1, sfxGain: 0.3, sfxHP: 200, offset: 0 }

window.MUTE = [];
window.VIDEO = VIDEO;
window.SFX_CUES = SFX.map(([t, name, o]) => ({ t, name, ...(o || {}) }));
window.SUB_GAPS = [];
