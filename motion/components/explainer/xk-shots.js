// XS namespace base for explainer shots, plus a few small legacy helpers (stamp / ring / cursor / counter / easing).
// The evidence shots themselves live in xs-*.js (drawn with the xm-ds.js design system) and extend XS via Object.assign.
// All times are absolute seconds (from T). A shot only handles its own internal motion; transitions between shots
// belong to XK.seq / XK.play. Depends on xk.js + lib.js.
const XS = (() => {
  const { W, H, TH, col, layer, card, poseKf, camKf, text, fmtNum, later } = XK;

  // ---------- Small helpers ----------
  const pop = (t, at, d = .16) => backOut(prog(t, at, at + d), 2.2);           // pop-in 0->1 (with a little overshoot)
  const ease = (t, a, d = .3) => easeOut(prog(t, a, a + d));                  // ease-out 0->1
  const slam = (t, at, d = .1) => { const k = easeOut(prog(t, at, at + d)); return { s: lerp(1.9, 1, k), o: k }; };
  const tr = (n, x, y, s = 1, r = 0) => n.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${r}) scale(${s.toFixed(4)})`);
  const op = (n, v) => n.setAttribute('opacity', clamp(v, 0, 1).toFixed(3));
  const rr = (p, x, y, w, h, r, fill, o = {}) => el('rect', { x, y, width: w, height: h, rx: r, fill: col(fill), ...(o.stroke ? { stroke: col(o.stroke), 'stroke-width': o.sw || 3, fill: o.fillNone ? 'none' : col(fill) } : {}) }, p);
  const g = (p, o) => el('g', o || {}, p);

  // Stamp: rounded frame + text, slammed from 1.9x down to 1, slightly tilted. Returns update(t).
  function stamp(parent, o) {
    const G = g(parent);
    const pad = 34, w = o.w || (o.text.length * (o.size || 120) * .95 + pad * 2), h = (o.size || 120) * 1.35;
    rr(G, -w / 2, -h / 2, w, h, 18, 'none', { stroke: o.color || 'warn', sw: 12, fillNone: true });
    text(G, o.text, 0, 0, { size: o.size || 120, fill: o.color || 'warn', anchor: 'middle', base: 'central', weight: 900, cls: o.cls || 'grot' });
    return t => { const s = slam(t, o.at); tr(G, o.x, o.y, s.s, o.rot ?? -8); op(G, s.o * .94); };
  }
  // Highlight ring: rounded outline that opens out from its centre
  function ring(parent, o) {
    const n = rr(parent, 0, 0, o.w, o.h, o.r ?? 14, 'none', { stroke: o.color || 'accent', sw: o.sw || 5, fillNone: true });
    return t => { const k = pop(t, o.at, .2); n.setAttribute('x', o.x - o.w * k / 2); n.setAttribute('y', o.y - o.h * k / 2);
      n.setAttribute('width', Math.max(0, o.w * k)); n.setAttribute('height', Math.max(0, o.h * k)); op(n, prog(t, o.at, o.at + .05)); };
  }
  // Cursor (arrow) + click ripple. keys: [[t, x, y, 'click'?], ...]
  function cursor(parent, keys) {
    const G = g(parent);
    const rip = el('circle', { r: 0, fill: 'none', stroke: col('accent'), 'stroke-width': 4 }, G);
    const arrow = el('path', { d: 'M0,0 L0,44 L11,33 L19,52 L28,48 L20,30 L35,30 Z', fill: '#ffffff', stroke: '#111', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, G);
    const clicks = keys.filter(k => k[3] === 'click').map(k => k[0]);
    return t => {
      const xs = keys.map(k => [k[0], k[1]]), ys = keys.map(k => [k[0], k[2]]);
      const x = kf(xs, t), y = kf(ys, t);
      const c = clicks.filter(c => c <= t).pop();
      const press = c != null ? pulse(t, c, 14) : 0;
      tr(arrow, x, y, 1 - .15 * press);
      op(G, prog(t, keys[0][0] - .1, keys[0][0]));
      if (c != null && t - c < .5) { const k = (t - c) / .5; setA(rip, { cx: x, cy: y, r: 10 + 60 * easeOut(k), opacity: 1 - k }); } else rip.setAttribute('opacity', 0);
    };
  }
  // Rolling number
  function counter(node, t, a, b, from, to, f) { node.textContent = fmtNum(lerp(from, to, easeOut(prog(t, a, b))), f); }

  // Evidence shots (evidence / doc / phones / mosaic, ...) live in xs-*.js and are added with Object.assign(XS, ...).
  // Only the small legacy helpers and easing tools remain here.
  return { stamp, ring, cursor, counter, pop, ease, slam };
})();
