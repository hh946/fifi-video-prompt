# Texture layer · `XM.tex.use`

![](../media/tex.gif)

Adds a material look to any shot: paper grain with stains, a dark grid with scratches, or a radial colour wash, plus soft window light, lens finishing (edge blur, vignette, grain) and a slow push-in.

## When to use

- Full-screen statement shots: big type, concept titles, chapter cards.
- When a flat colour stage feels too clean next to filmed footage.
- Not on evidence cards, charts or screenshots: texture there reads as noise over facts.
- Add it per shot, not as a global switch.

## Usage

```js
// timeline.js
const T = { paper: 0, grid: 1.5, wash: 3.0 };

// scene.js
const block = (tone, lines) => XM.bigType({ layout: 'block', tone, lines, lead: 0, sfx: false, subtitle: 'keep', hud: false });
const SH = {
  paper: block('paper',  [{ text: 'EVERY', at: T.paper }, { text: 'FRAME', at: T.paper, color: 'accent' }]),
  grid:  block('ink',    [{ text: 'PURE', at: T.grid }, { text: 'CODE', at: T.grid, color: 'accent' }]),
  wash:  block('accent', [{ text: 'OPEN', at: T.wash }, { text: 'SOURCE', at: T.wash }]),
};
XM.tex.use(SH.paper, { stage: { kind: 'paper', stains: .6, seed: 3 }, light: { angle: -30, dark: .4, seed: 5 }, post: 'paper', push: { to: 1.05 } });
XM.tex.use(SH.grid,  { stage: { kind: 'grid', grid: 110, scratches: .4, mottle: .2, seed: 7 }, post: 'dark', push: { to: 1.05 } });
XM.tex.use(SH.wash,  { stage: { kind: 'wash', hot: [960, 420], lift: .16, deep: .5 }, post: 'deep', push: { to: 1.05 } });

XK.seq([
  { shot: SH.paper, t0: T.paper, drift: false },   // push replaces drift
  { shot: SH.grid,  t0: T.grid,  drift: false },
  { shot: SH.wash,  t0: T.wash,  drift: false },
]);
```

## Options

All four blocks are optional.

| block | value | what it does |
|---|---|---|
| `stage` | `'paper'` / `'grid'` / `'wash'` or `{ kind, … }` | replaces the flat stage colour. `paper`: grain + `stains` 0..1. `grid`: fine grid (`grid` spacing px, `line`, `lw`), vertical `scratches`, `mottle`. `wash`: radial gradient of the stage colour, `hot: [x, y]` bright spot, `lift`, `deep` corners |
| `light` | `'window'` or `{ angle: -30, dark: .3, soft: 45, seed }` | soft diagonal window shadows over the whole picture; on dark stages they become faint light streaks |
| `post` | `'paper'` / `'deep'` / `'dark'` / `'web'` / `'screen'` or an object | finishing: `edge` blur, `chroma` edge fringe, `vig` vignette, `grain`; `screen` adds a halftone screen. Extend a preset: `{ ...XM.tex.POST.paper, vig: { a: .3 } }` |
| `push` | `{ to: 1.05, from: 1, t0, t1, ease: 'easeInOut', x, y }` or `{ keys: [[t, s, x, y, ease], …] }` | slow push inside the canvas; light, post and HUD stay put. Scale never goes below 1 |

## Style

- Colours always come from the shot's own stage (cream, ink or accent); texture only adds light and grain.
- Window light multiplies on light stages and screens on dark ones, so text and subject sit "on the same sheet".
- HUD and labels are drawn after the texture and stay crisp.
- Everything moves slowly and in one direction: the push never bobs or shakes.
- Pairs well with `XM.bigType`, title cards and paper piles; use the grid on ink stages, the wash on accent stages.

## Notes

- `stage` only works on components that paint their background through `XM.DS.stage`. For your own shots call `XM.DS.stage(g, P)` in the draw function, or draw directly with `XM.tex.paper / grid / wash(g, t, P, o)`.
- Post-processing is per pixel: expect 50–150 ms more per frame.
- When `push` is set, give the shot `drift: false` so two camera moves do not stack.
- Unknown keys in the look object raise a `console.error`.
- Helpers for component authors: `XM.tex.blurClamp(g, src, px)` (full-frame blur without transparent edges), `XM.tex.shadow`, `XM.tex.text`, `XM.tex.reveal`.
