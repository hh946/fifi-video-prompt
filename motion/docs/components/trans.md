# Transitions: whip, slash, defocus · `tin: 'whip' | 'slash' | 'defocus'`

![](../media/trans.gif)

Three full-frame canvas transitions you attach to a shot in `XK.seq`: a motion-blurred whip pan, a diagonal slash that opens out of an inverted frame, and a blur-out / blur-in swap.

## When to use

- **whip**: between two sentences, when the direction carries meaning ("next" goes left, "back then" goes right, "up" goes up). Two or three per video.
- **slash**: a change of tone, e.g. from a calm screenshot to a punchy conclusion. Once or twice per video.
- **defocus**: "mind goes blank", or the same idea seen from a new angle.
- Not for every cut. Plain cuts stay the default; never use the same transition twice in a row.

## Usage

Any shot built on `XM.shot` (XS evidence cards, XM components, big type) works on either side.

```js
// timeline.js
const T = { a: 0, b: 1.3, c: 2.6, d: 4.15 };

// scene.js
const block = (tone, lines) => XM.bigType({ layout: 'block', tone, lines, lead: 0, sfx: false, subtitle: 'keep', hud: false });
const SH = {
  a: block('ink',    [{ text: 'ONE', at: T.a }, { text: 'CLOCK', at: T.a, color: 'accent' }]),
  b: block('paper',  [{ text: 'EVERY', at: T.b }, { text: 'FRAME', at: T.b, color: 'accent' }]),
  c: block('ink',    [{ text: 'PURE', at: T.c }, { text: 'CODE', at: T.c, color: 'accent' }]),
  d: block('accent', [{ text: 'FIFI', at: T.d }, { text: 'VIDEO', at: T.d }]),
};
XK.seq([
  { shot: SH.a, t0: T.a, drift: false },
  { shot: SH.b, t0: T.b, drift: false, tin: 'whip',    fx: { dir: 'left' } },
  { shot: SH.c, t0: T.c, drift: false, tin: 'slash',   fx: { angle: -32, at: [960, 540] } },
  { shot: SH.d, t0: T.d, drift: false, tin: 'defocus', fx: { peak: 30 } },
]);
window.SFX_CUES.push(...XK.fxCues());   // suggested sound cues of the transitions
```

`t0` is always the first frame of the incoming shot. Each transition owns a window around it:

| tin | window | what happens at `t0` |
|---|---|---|
| `whip` | `t0 - out` → `t0 + in/fps` | first (still blurred) frame of the next shot |
| `slash` | `t0` → `t0 + din` (1.5 s) | hard cut to the inverted next shot; the band starts opening |
| `defocus` | `t0 - out` → `t0 + in` | the swap happens at peak blur |

## Options (`fx: {…}`)

| tin | option | default | what it does |
|---|---|---|---|
| whip | `dir` | `'left'` | `left` / `right` / `up` / `down`: where the picture travels |
| whip | `out` / `in` | `.4` s / `3` frames | accelerate-out time / frames for the next shot to settle (2–4) |
| whip | `dist` | `1.25` | total travel of the outgoing shot, in screen widths |
| whip | `fill` | `'wrap'` | `'wrap'` tiles the shot into the gap (seamless under blur), `'bg'` shows the background colour |
| slash | `angle` | `45.5` | band edge angle in degrees (`-30` runs bottom-left to top-right, `90` is vertical) |
| slash | `at` | `[602, 540]` | a point on the line the band opens from |
| slash | `mode` | `'open'` | `'open'` widens both ways; `'sweep'` moves one band across (`width`, `dir`) |
| slash | `ahead` | `'inv'` | what is shown where the band has not reached yet: `'inv'` (inverted next shot) or `'prev'` (plain wipe) |
| slash | `din` | `1.5` | duration in seconds |
| slash | `soft` / `fringe` | `1` / `1` | soft edge and warm/cool colour fringe strength (0 turns off) |
| defocus | `peak` | `30` | blur sigma (px) at the swap; `37` is harsher |
| defocus | `out` / `in` | `.2` / `.25` | blur-out / clear-up time in seconds |
| all | `sfx` | whip `'rushcut'`, slash `'wipe'`, defocus `false` | cue name or `false`; `gain` optional |

## Style

- Whip: exponential acceleration with real per-frame motion blur (180° shutter); the next shot arrives with the same direction and speed, so the cut reads as one continuous throw.
- Slash: hard in the middle of the frame and progressively softer toward the corners, with a thin warm/cool fringe on the band edge. Strongest from a light shot into a dark one (or the reverse): the inverted frame keeps the brightness steady, then the band reveals the real colours.
- Defocus: the whole frame blurs together with clamped edges (no transparent borders).
- HUD layers are never blurred or inverted.
- Pairs well with `XM.bigType` blocks and plain colour stages from the theme (`ink`, `paper`, `accent`).

## Notes

- Keep transition windows apart. A slash lasts 1.5 s; starting another canvas transition inside that window breaks both.
- A global photosensitivity check runs on every transition: more than 3 large brightness jumps in any 1 s raises a render error. Move flashy transitions apart or pick a softer one.
- `slash` composites per pixel on the CPU, so its frames render slower than the others.
- Unknown `fx` keys are reported with `console.error`, which fails the render check. Check spelling.
