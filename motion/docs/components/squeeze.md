# Flower squeeze · `XM.squeeze`

![](../media/squeeze.gif)

One white hero flower lights up, dark flowers flood in around it and pack into glowing cells, the field tightens, and the hero is squeezed down to a small wedge.

## When to use

- "More and more crowd into the same spot, and one specific thing gets squeezed": one job and twice the applicants, one market and a flood of lookalike products, one feed and your post buried.
- As a section cover or the landing of a point, with the numbers on the side (`draw`) or in the shots before and after.
- Not as an opener: the first half second is nearly empty and filling takes seconds.
- Not without a concrete hero (then it is just decoration), not for a bare number, and not twice in one video.

## Usage

```js
// timeline.js
const T = { hero: 0, crowd: .1, flood: .5, full: 2.0, heat: 1.4, heatFull: 3.0, squeeze: 3.0, peak: 4.0, text: .8 };

// scene.js
XK.theme('night', { accent: '#FB2C26', accent2: '#FFD84A' });

const SH = {};
SH.field = XM.squeeze({
  box: { x: 330, y: 150, w: 680, h: 780 },
  hero: { at: T.hero, x: .5, y: .5, r: 110, from: [.5, .85] },
  crowd: { at: T.crowd, flood: T.flood, full: T.full },
  heat: { at: T.heat, full: T.heatFull },
  squeeze: [{ at: T.squeeze, peak: T.peak }],
  draw(g, t, P) {   // your own text, drawn above the field
    if (t < T.text) return;
    XM.txt(g, '29', 1150, 560, { fam: 'unb', size: 280, w: 900, col: 'text' });
    XM.txt(g, 'COMPONENTS', 1156, 680, { fam: 'grot', size: 72, w: 800, col: 'text' });
  },
  hud: false,
});

XK.seq([{ shot: SH.field, t0: 0, tin: 'cut', drift: false }]);
window.SFX_CUES.push(...SH.field.cues);   // the snap at peak
```

Render on the GPU (see Notes):

```bash
CHROME_ARGS='--use-angle=metal --enable-gpu --ignore-gpu-blocklist' node scripts/render_frames.js my-video --workers 2
```

## Options

| option | default | what it does |
|---|---|---|
| `hero` | required | `{ at, x, y, r, from }` when the hero lights up, final position (0–1 inside `box`), petal radius px (keep ≥ 80), where it grows from |
| `crowd` | required | `{ at, flood, full }` first peers → flood starts (put it on "more") → field full |
| `heat` | — | `{ at, full }` the field tightens: flowers jostle, small ones get pushed out |
| `squeeze` | — | `[{ at, peak, release, dir, depth }]` hero shrinks from `at` to `peak`; `release` grows it back; `depth` 0–1 (default 1) |
| `box` | `700×800` at `250,140` | field area; the fade extends ~200 px beyond it |
| `tag` | — | `{ text, at }` name plate top-left of the field |
| `notes` | — | `[string]` small mono notes under the tag |
| `draw` | — | `(g, t, P, api) => {}` your layer above the field; `api.hero(t)` gives the hero's position and size for callouts |
| `edge` | `'fade'` | irregular round fade, or `{ start, wobble, rx, ry, pad }`; `'box'` = thin rectangular frame |
| `backdrop` | all on | `{ mist, mid, near }` soft mist and blurred flower shadows; `false` = plain stage |
| `colors` | theme | `{ accent, hero }` glow color, hero petal color |
| `scale`, `seed` | `1`, fixed | flower size, layout |
| `hud` | — | corner text, as in other components |

The shot returns `{ L, update, cues, times, hero(t), box }`. There is no default text and no default timing.

## Style

A fixed camera on a dark stage. The flowers are drawn per pixel by a shader; light leaks only through the gaps between packed cells, forming a glowing net. One light color (the accent) plus white: pressure is shown by motion, not by a second color. The field fades out in an irregular circle with no visible frame. Pairs well with a side column of one number and one line of text, and with evidence shots before and after.

## Notes

- Needs the GPU: run with `CHROME_ARGS='--use-angle=metal --enable-gpu --ignore-gpu-blocklist'` (use the ANGLE backend for your OS) and at most 2 workers. Software rendering is tens of times slower. About 0.25 s per frame on GPU.
- `hero.at` and `crowd` are required; missing them logs an error that the render check catches.
- Keep side text at least 180 px right of `box`, the fade spreads past it.
- Leave `heat.color` unset: a second glow color looks muddy.
- Don't scale the hero yourself; change `squeeze[].depth`, or the cells stop touching it.
- Text budget: one tag or one callout, one number and one line. No per-flower labels, no full sentences.
