# Emerge · `XM.emerge`

![](../media/emerge.gif)

One continuous shot: a subject slowly emerges from the dark and out of blur, words drift past in front of it and behind it, and real depth of field lets you pull focus from the subject to a word and back.

## When to use

- A moody reveal of the thing a section is about, with a few related words floating around it.
- When the narration names several aspects one after another, focus can jump to each word as it's spoken (`hi` + `focus`).
- To end on one word in the centre: a final near word fades in and takes the focus.
- Not for anything the viewer must read closely. Most words stay soft on purpose. Not for fast, punchy beats either: everything moves slowly.

## Usage

```js
// timeline.js
const T = { s: 0.1, w1: 0.5, w2: 0.9, w3: 1.3, f1: 1.8, back: 2.7, end: 3.4 };

// scene.js
function filmFrame(g, t, box) {                 // the subject, drawn inside box = [x, y, w, h]
  const [x, y, w, h] = box, m = w * .16;
  g.fillStyle = '#F3EEE3'; g.fillRect(x, y, w, h);
  g.fillStyle = '#FB2C26'; g.fillRect(x + m, y + h * .08, w - 2 * m, h * .84);
}
const em = XM.emerge({ tone: 'ink',
  subject: { draw: filmFrame, w: 440, h: 600, x: 960, y: 840, from: 'both', at: T.s, dur: 1.2, keep: [.1, .1, .8, .8] },
  words: [
    { text: 'PIXELS', at: T.w1, x: 420, y: 300, depth: 'far' },
    { text: 'FRAMES', at: T.w2, x: 1500, y: 760, hi: [T.f1, T.back], hiColor: 'accent' },
    { text: 'TIMING', at: T.w3, x: 1420, y: 250, depth: 'far' },
    { text: 'CODE', at: T.end, x: 960, y: 540, depth: 'near', size: 240, enter: 'fade', hi: T.end + .3 },
  ],
  behind: { text: 'motion', x0: 260, x1: 1660, y: 720 },
  focus: [[T.s, 'subject'], [T.f1, 'FRAMES', 'easeInOut'], [T.back, 'subject', 'easeInOut'], [T.end + .2, 'CODE', 'easeInOut']],
  pool: { x: 960, y: 540, r: 520, at: T.s },
  hud: false });
XM.tex.use(em, { stage: 'grid', post: 'dark' });   // dark grid + vignette; on paper: { stage: 'paper', light: 'window', post: 'paper' }
XK.seq([{ shot: em, t0: 0, tin: 'cut', drift: false }]);
```

A PNG cutout works the same way: `subject: { src: 'assets/object.png', h: 560, x: 960, y: 820, at: T.s, keep: [.3, .1, .4, .4] }`.

## Options

| option | default | what it does |
|---|---|---|
| `subject` | required | `{ src \| draw(g, t, box, P), w, h, x, y, at, dur: .9, from: 'both' \| 'dark' \| 'blur' \| 'none' }`. `draw` needs `w`. |
| `subject.keep` | none | `[x, y, w, h]` (0–1 of the subject image): the area floating words must never cover, such as a face or the key part of an object. `false` ignores it. |
| `subject.*` | – | `blur0: 3.2`, `dark0: .25`, `scale0`, `rise`, `spot` (a patch of light that slowly brightens), `light`, `gray`, `grain`, `shadow` |
| `words` | none | `[{ text, at, x, y, depth: 'far' \| 'mid' \| 'near' \| number, size, fam, color, enter: 'zoom' \| 'fade', hi, hiColor, until }]` |
| `words[i].hi` | none | A time `t` or `[t0, t1]` when the word is spoken: it pulls into focus and brightens. A spoken word should be ≥ 56 px. |
| `drift` | 0 | Drift direction in degrees: 0 is horizontal, −90 is upward. Smear follows it. |
| `behind` | none | `{ text, x0, x1 \| size, y, alpha: .15 }`: a huge blurred English italic word behind the subject |
| `focus` | subject | `[[t, 'subject' \| word text \| depth, ease]]`: focus pulls |
| `aperture` | 1 | Depth-of-field strength (px of blur per depth unit), a number or keyframes |
| `defocus` | none | `[[t, px, ease]]`: extra overall blur. Whatever is in focus only gets .3× of it. |
| `pool` | none | `{ x, y, r, a: .1, at, dur }`: soft light behind the subject |
| `tone` | `'ink'` | `'ink'`, `'paper'` or `'accent'`. Texture comes from `XM.tex.use`. |
| `hud` | none | Corner labels `{ tl, bl, br }`, or `false` |

## Style

- The subject sharpens from 3.2 px blur and rises from 25 % brightness over about 1 s.
- Words fly in from .45× scale over about 1 s (expo-out) with a 22 px smear along the drift. Mid-depth words sit at 2.6 px blur, far words are softer.
- Keep the subject centred and the final word centred, with the edges softly darkened (a spotlight without a hard edge).
- Words use Noto Sans SC 900 by default and the behind word uses Playfair Display Italic. No glow and no drop shadow. A spoken word can switch to the accent colour.

## Notes

- Always set `subject.keep` so floating words never cover the important part. The protection is lifted automatically for a word while it's spoken (`hi`).
- `behind` is English only.
- Pure function of `t`: words drift from their `at` position, so place each `x, y` where the word should be when it first appears.
- Camera pushes belong in `XM.tex.use(…, { push })`. This component only handles focus and depth.
