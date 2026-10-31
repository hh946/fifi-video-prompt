// Signature watermark. Works for SVG and Canvas projects: it is its own SVG layer on top of the page,
// so camera shake, push-ins, dimming and flashes don't move it.
//
// Usage:
//   1. index.html loads <script src="watermark.js"></script> before render.js.
//   2. timeline.js (times only from T):
//        const WATERMARK = {
//          text: 'by your-name',                                   // what to show
//          font: 'Grot',                                           // any font family loaded in index.html
//          open: { out: T.title, tone: 'dark' },                   // bottom-right at the start: fades in 0.15-0.6 s, out over 0.1 s from `out`
//          end:  { in: T.last + .6, out: T.black, tone: 'dark', at: 'center', y: 650 },   // closing signature
//        };
//      tone: 'dark' = on a dark background (cream text); 'light' = on a light background (ink text).
//      end.at: 'center' = centered under the last line (y defaults to 650); 'corner' = same bottom-right spot as the opening.
//      end.out = when the picture goes black; the signature starts fading 0.5 s before. Omit to keep it to the last frame.
//   3. Last line of render(t): watermark(t, WATERMARK)
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const INK = { dark: '#F7EED9', light: '#161110' };
  const LOOK = {                       // pixels at 1920x1080; other sizes scale with width
    corner: { size: 34, ls: 3, a: { dark: .6, light: .5 } },
    center: { size: 34, ls: 4, a: { dark: .55, light: .45 } },
  };
  const cl = x => Math.min(1, Math.max(0, x));
  const pr = (t, a, b) => cl((t - a) / (b - a));
  const ss = (a, b, t) => { const k = pr(t, a, b); return k * k * (3 - 2 * k); };

  let svg = null, node = null, WH = null;
  function build(spec) {
    const W = (window.VIDEO && VIDEO.width) || 1920, H = (window.VIDEO && VIDEO.height) || 1080;
    svg = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({ width: W, height: H, viewBox: `0 0 ${W} ${H}` })) svg.setAttribute(k, v);
    svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:2147483647';
    node = document.createElementNS(NS, 'text');
    node.textContent = (spec && spec.text) || '';
    node.setAttribute('dominant-baseline', 'central');
    node.style.fontFamily = (spec && spec.font) || 'Grot';
    svg.appendChild(node);
    document.body.appendChild(svg);
    return [W, H];
  }

  window.watermark = function (t, spec) {
    if (!svg) WH = build(spec);
    const [W, H] = WH, k = W / 1920;
    let a = 0, at = 'corner', tone = 'dark', y = null;
    const o = spec && spec.open, e = spec && spec.end;
    if (o) {
      const v = ss(.15, .6, t) * (o.out == null ? 1 : 1 - pr(t, o.out, o.out + (o.fade || .1)));
      if (v > 0) { a = v; tone = o.tone || 'dark'; }
    }
    if (e && t >= e.in) {
      const v = ss(e.in, e.in + .8, t) * (e.out == null ? 1 : 1 - ss(e.out - .5, e.out + .1, t));
      if (v > a) { a = v; at = e.at || 'center'; tone = e.tone || 'dark'; y = e.y; }
    }
    if (a <= .002) { node.setAttribute('display', 'none'); return; }
    const L = LOOK[at];
    node.setAttribute('display', 'inline');
    node.setAttribute('fill', INK[tone]);
    node.setAttribute('opacity', (a * L.a[tone]).toFixed(3));
    node.setAttribute('font-size', L.size * k);
    node.style.letterSpacing = `${L.ls * k}px`;
    if (at === 'corner') { node.setAttribute('text-anchor', 'end'); node.setAttribute('x', W - 70 * k); node.setAttribute('y', H - 50 * k); }
    else { node.setAttribute('text-anchor', 'middle'); node.setAttribute('x', W / 2); node.setAttribute('y', (y == null ? 650 : y) * k); }
  };
})();
