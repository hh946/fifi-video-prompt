# Transitions: recede, leak · `tin: 'recede' | 'leak'`

![](../media/trans2.gif)

Two more canvas transitions for `XK.seq`: the previous shot shrinks into a corner and stays there as context while the next subject falls in (`recede`), and a warm light leak that washes out to one white frame to close a chapter (`leak`).

## When to use

- **recede**: "compared with before". The old evidence stays visible in the corner while the new one lands in front of it.
- **leak**: the end of a chapter or of the whole video. **At most once per video.**
- Not for ordinary cuts between sentences; use a plain cut or `whip` there. Never the same transition twice in a row.

## Usage

```js
// timeline.js
const T = { a: 0, b: 0.9, c: 3.4 };

// scene.js
const block = (tone, lines) => XM.bigType({ layout: 'block', tone, lines, lead: 0, sfx: false, subtitle: 'keep', hud: false });
// hand-drawn shot: paint the stage with XM.DS.stage so recede can split background and foreground
const plain = (tone, draw) => { const P = XM.DS.tone(tone);
  return XM.shot({ bg: P.bg, stage: 'flat' }, () => (g, t) => { XM.DS.stage(g, P); draw(g, t, P); XM.DS.hud(g, t, P); }); };
const word = (g, s, x, y, size, col) => { g.save(); g.font = `900 ${size}px Fraunces`; g.textAlign = 'right';
  g.fillStyle = col; g.fillText(s, x, y); g.restore(); XM.note('Fraunces', s); };

const SH = {
  a: block('ink', [{ text: '1,000', at: T.a }, { text: 'KEYFRAMES', at: T.a, color: 'accent' }]),
  b: plain('ink', (g) => { word(g, 'ONE', 1780, 400, 260, '#F3EEE3'); word(g, 'FUNCTION', 1780, 630, 190, '#FB2C26'); }),
  c: block('paper', [{ text: 'SHIP', at: T.c }, { text: 'IT', at: T.c, color: 'accent' }]),
};
XK.seq([
  { shot: SH.a, t0: T.a, drift: false },
  { shot: SH.b, t0: T.b, drift: false, tin: 'recede', fx: { to: 'bl', margin: 90, scale: .42, fall: { from: 'top' } } },
  { shot: SH.c, t0: T.c, drift: false, tin: 'leak',   fx: { from: 'right' } },
]);
window.SFX_CUES.push(...XK.fxCues());
```

| tin | window | what happens at `t0` |
|---|---|---|
| `recede` | `t0` → start of the next transition (`hold: 'all'`) | the previous shot starts shrinking; the next subject falls in `.3` s later |
| `leak` | `t0 - in` → `t0 + white + after` | the white frame; the light starts spreading at `t0 - in` |

## Options (`fx: {…}`)

| tin | option | default | what it does |
|---|---|---|---|
| recede | `to` / `margin` | `'bl'` / `60` | corner to recede to (`bl` `br` `tl` `tr` or `[x, y]`) and its distance from the edge |
| recede | `scale` / `recede` | `.4` / `.55` s | settled size of the old shot and how long it takes to get there |
| recede | `blur` / `dim` / `fade` | `3` / `.3` / `0` | how blurred, darkened and faded the old shot ends up |
| recede | `fall` | `{ at: .3, dur: .45, from: 'top' }` | how the next subject arrives: `from` `top` `bottom` `left` `right` `tr` `tl` `'near'` or `[dx, dy]`; `false` = no fall |
| recede | `hold` / `release` | `'all'` / `.35` | keep the old shot until the next transition, or a number of seconds after settling; fade-out time |
| recede | `sfx` | `'swap'` | cue when the subject starts falling, or `false` |
| leak | `from` | `'right'` | side the light enters from: `left` `right` `top` `bottom` |
| leak | `color` | `'warm'` | `'warm'` (#ffd3a3), `'accent'` (accent mixed with white) or `'#hex'` |
| leak | `in` / `after` | `.5` / `.45` s | spread-in time / afterglow fade on the next shot |
| leak | `white` | `1` | number of white frames |
| leak | `sfx` | `false` | silent by default; `'scene'` gives a soft air sound |

## Style

- Recede: slow-then-fast shrink with a little radial speed blur, then a very slow continued drift away; the subject lands without bounce.
- Leak: a soft band plus three soft blobs of neutral warm light, blended over the frame, brightening into one white frame and leaving a faint glow on the same side of the next shot. No saturated colour washes.
- Both work best from dark stages (`ink`); on light stages the leak is subtler and recede needs `dim: .1, fade: .25` to avoid looking grey.

## Notes

- Recede splits each shot by redrawing it: whatever is painted with `XM.DS.stage` (or wrapped in `XM.trans2.bg(g, q => …)`) is background, the rest is foreground. Most XM / XS components and `XM.bigType` do this already. A shot that can't be split is shrunk or laid underneath as a whole (with a warning).
- Keep the incoming subject clear of the corner the old shot recedes to.
- A second `leak` in one video logs an error. One white frame counts as two brightness jumps for the global photosensitivity check (max 3 per second), so don't put another hard light/dark cut within 1 s of it.
- `flashes: 2` (double flash) is refused unless you also set `unsafe: true`; avoid it.
