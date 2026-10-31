// XK canvas transitions, set 2: leak (warm light-leak exit) / recede (previous shot shrinks into the background).
// Requires lib.js, xk.js (canvas transition mechanism XK.fx; recede / leak use the F.link hook in xk.js but still run
//   without it, see below), xm-core.js, xm-ds.js, xm-tex.js (optional: full-frame blur, stage material, post effects).
//   Independent of xm-trans.js (slash / defocus / whip); load both to use both.
// Timings below are tuned against 23.976 fps reference footage ("reference frame" = 1 / 23.976 s).
// Docs: docs/components/trans.md
//
// Usage: both are XK.seq tin values, options go in fx:{...}.
//   XK.seq([
//     { shot: SH.a, t0: T.a },
//     { shot: SH.b, t0: T.b, tin: 'leak', fx: { from: 'left' } },        // t0 = the white frame (light starts at t0 - in)
//     { shot: SH.c, t0: T.c, tin: 'recede', fx: { to: 'bl' } },          // t0 = frame where the previous shot starts receding
//   ]);
//   window.SFX_CUES.push(...XK.fxCues());
// Works between any shots made with XM.shot (XS evidence, XM components, big type...). The HUD is never blurred, covered by
// the light or receded during the transition (see the canvas transition section of xk.js).
//
// ───────────────────────────── leak: warm light-leak exit ─────────────────────────────
// Light spreads in from one side of the frame (soft vertical / horizontal band + three soft blobs, screen blend), getting
//   brighter and wider -> one white frame (default 1) -> next shot, with a little afterglow on the same side that fades
//   smoothly. The light is a neutral warm white (default) or a light version of the accent, never a saturated red.
//   One flash by default (= 2 big brightness jumps; photosensitivity limit is 3 per second); a double flash needs
//   flashes: 2 + unsafe: true. At most one leak per video (a second one logs console.error; demo reels use repeat: true).
// Options (fx:{...}):
//   from     : 'left' | 'right' (default) | 'top' | 'bottom'
//   color    : 'warm' (default, neutral warm white #ffd3a3) | 'accent' (half accent, half white) | '#hex'
//   in       : time for the light to spread in (s, default .5)
//   white    : number of white frames (at the video fps, default 1); whiteColor default '#fffaf3'
//   after    : afterglow fade time (s, default .45); glow: afterglow start strength (default .7)
//   peak     : strength at the brightest point (0-1, default 1); seed: positions of the three blobs
//   flashes  : 1 (default) | 2 (double flash, needs unsafe:true); gap: frames between the two flashes (default 1)
//   repeat   : true = allow a second leak in one video (demo reels only)
//   sfx      : default false (silent); for a sound use 'scene' (airin)
// Window = [t0 - in, t0 + white + after). HUD: previous shot before t0, next shot from t0 (on white frames the HUD switches
//   to dark text automatically).
//
// ───────────────────────────── recede: previous shot becomes the background ─────────────────────────────
// The previous shot's "group" (what it draws, without the stage background) shrinks toward a corner, blurs and darkens,
//   and stays there as context; the next shot's subject (also without its stage) falls into the foreground; the next
//   shot's stage is at the bottom. How foreground and background are separated: during the transition each shot is drawn
//   again, and in that pass XM.DS.stage (and anything wrapped in XM.trans2.bg) goes to a separate background layer;
//   everything else is foreground. So:
//   - components that draw their background with XM.DS.stage (XS evidence cards, big type, most XM components) separate
//     automatically;
//   - hand-drawn shots: draw the base with XM.DS.stage(g, P), and wrap background imagery (photos, a city...) in
//     XM.trans2.bg(g, q => ...draw on q...);
//   - shots that cannot be separated (full-frame photo, no stage call): the previous shot shrinks as a whole into a corner
//     (picture-in-picture); the next shot is laid underneath as a whole with no fall-in (console.warn once).
// Options (fx:{...}):
//   to        : 'bl' (default) | 'br' | 'tl' | 'tr' | [x, y] - vanishing point to recede toward; corners keep margin
//               from the edge (default 60)
//   scale     : size when settled (default .4); recede: recede time (s, default .55); curve: progress curve (default
//               RECEDE_CURVE: slow then fast)
//   settle    : after arriving keeps drifting away to scale x settle (default .9), over settleDur (default 2 s, expoOut)
//   blur / dim / fade : blur (px, default 3), darkening (0-1, default .3), fade (0-1, default 0) when settled. Darkening
//               looks grey on light stages; use dim:.1, fade:.25 there
//   speedBlur : radial blur proportional to shrink speed while receding (rate x .6, max .35; default 1, 0 = off)
//   fall      : how the next subject falls in { at (s after t0, default .3), dur (default .45), from ('top' default |
//               'bottom' | 'left' | 'right' | 'tr' | 'tl' | 'near' | [dx, dy]), scale (start scale, default 1; 'near' 1.3),
//               origin (scale centre, default frame centre), ease (4.5 = 1 - (1 - u)^4.5), blur (motion blur = movement
//               per reference frame x blur, default .8), fade (fraction of the move used to fade in, default .12) }
//               | false (no fall; the next subject is simply there)
//   bg        : how the previous background moves { scale (pull-back target, default 1 = static), to (vanishing point,
//               default same as to), dur (default = recede), blur (max blur during the pull-back in px, default 0),
//               mix: [u0, u1] (cross-fade to the next background between progress u0 and u1, default [0, 1]) }
//               With scale != 1 the next background follows the same pull-back (from 1/scale down to 1), so the two
//               backgrounds stay aligned; the previous background is only frame-sized, and the edges revealed as it
//               shrinks show the next background. Use the same image pulled back (e.g. the same city at ~.47) as the
//               next background to make the swap seamless.
//   hold      : 'all' (default: stays until the next shot's transition starts) | seconds (stays this long after
//               settling, then fades over release s, after which it is just the next shot)
//   release   : fade-out time for the old group (default .35). With hold:'all' it only fades when the following
//               transition is not a hard cut (a cut covers it anyway)
//   sfx       : 'swap' (default, = slide, when the subject starts falling) | sound name | false
// HUD: belongs to the next shot from t0 (the old group is background now). Window = [t0, t0 + din), din computed from
//   hold (needs xk.js F.link; without F.link, hold:'all' uses the next shot's t0, which overlaps the next transition if it
//   starts early (defocus / whip out); use seconds then).
(() => {
  const { W, H } = XK;
  const ORIG = 23.976;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a, b, k) => a + (b - a) * k;
  const smooth = k => k * k * (3 - 2 * k);
  const expoOut = k => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
  const err = m => console.error('XK transition (trans2): ' + m);
  const warned = {};
  const warnOnce = (k, m) => { if (!warned[k]) { warned[k] = 1; console.warn('XK transition (trans2): ' + m); } };
  const fps = () => (window.VIDEO && window.VIDEO.fps) || 30;
  const curveOf = c => typeof c === 'function' ? c : u => {
    if (u <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) if (u < c[i][0]) { const [a, va] = c[i - 1], [b, vb] = c[i]; return va + (vb - va) * (u - a) / (b - a); }
    return c[c.length - 1][1];
  };
  const sfxName = n => (XM.DS && XM.DS.SFX && n in XM.DS.SFX) ? XM.DS.SFX[n] : n;
  function checkKeys(name, fx, DEF, extra = []) {
    for (const k of Object.keys(fx || {})) if (!(k in DEF) && !extra.includes(k)) err(`${name}: unknown option ${k} (${Object.keys(DEF).join(' / ')})`);
  }

  // ---------- offscreen canvases (reused by key, cleared on every fetch) ----------
  const CV = {};
  function cv(key) {
    let c = CV[key];
    if (!c) { const e = document.createElement('canvas'); e.width = W; e.height = H; c = CV[key] = { c: e, g: e.getContext('2d') }; }
    const g = c.g; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.clearRect(0, 0, W, H);
    return c;
  }
  const reset = g => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; };

  // ---------- radial zoom blur: two passes of n copies at geometric scales (equivalent to n^2 copies, no banding) ----------
  // opaque: fully opaque snapshots use a running average (copy i at alpha 1/(i+1), accurate); layers with transparency use lighter at 1/n each (transparent areas average too, no hard edges)
  function zoomPass(dst, src, cx, cy, span, n, opaque) {
    for (let i = 0; i < n; i++) {
      const s = Math.pow(span, n > 1 ? i / (n - 1) : 0);
      dst.setTransform(s, 0, 0, s, cx * (1 - s), cy * (1 - s));
      if (opaque) dst.globalAlpha = 1 / (i + 1); else { dst.globalCompositeOperation = 'lighter'; dst.globalAlpha = 1 / n; }
      dst.drawImage(src, 0, 0);
    }
    reset(dst);
  }
  // radial zoom blur of src around (cx, cy) with span amt, drawn onto g (uses g's current globalAlpha)
  function zoomBlur(g, src, cx, cy, amt, o = {}) {
    if (!(amt > .003)) { g.drawImage(src, 0, 0); return; }
    const n = o.n || 8, opaque = o.opaque !== false, R = Math.pow(1 + amt, n / ((n - 1) * (n + 1)));
    const A = cv('zbA'), B = cv('zbB');
    zoomPass(A.g, src, cx, cy, Math.pow(R, (n - 1) / n), n, opaque);
    zoomPass(B.g, A.c, cx, cy, Math.pow(R, n - 1), n, opaque);
    g.drawImage(B.c, 0, 0);
  }

  // =====================================================================================================
  // leak
  // =====================================================================================================
  const LEAK = { from: 'right', color: 'warm', in: .5, white: 1, whiteColor: '#fffaf3', after: .45, glow: .7, peak: 1, seed: 7,
    flashes: 1, gap: 1, unsafe: false, repeat: false, sfx: false, gain: null };
  const WARM = '#ffd3a3';
  const hexRgb = h => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
  function lightColor(o) {
    if (o.color === 'warm') return hexRgb(WARM);
    if (o.color === 'accent') return hexRgb(XK.col('accent')).map(v => Math.round(v + (255 - v) * .5));
    if (/^#/.test(o.color)) return hexRgb(o.color);
    err(`leak.color must be 'warm' / 'accent' / '#hex', got ${o.color}`); return hexRgb(WARM);
  }
  // light layer: soft band along the light direction (brightest at the edge, fading inward to front) + three soft blobs along that edge. amt 0..1, front 0..1.4 (how far across the frame the light reaches)
  function lightLayer(o, amt, front, t) {
    const L = cv('lkL'), q = L.g, [r, gg, b] = o.rgb, c = a => `rgba(${r},${gg},${b},${cl(a).toFixed(4)})`;
    const hot = a => `rgba(${Math.round(r + (255 - r) * .55)},${Math.round(gg + (255 - gg) * .55)},${Math.round(b + (255 - b) * .55)},${cl(a).toFixed(4)})`;
    const hor = o.from === 'left' || o.from === 'right', len = hor ? W : H, sgn = o.from === 'left' || o.from === 'top' ? 1 : -1;
    const x0 = o.from === 'right' ? W : 0, y0 = o.from === 'bottom' ? H : 0;
    const P = d => hor ? [x0 + sgn * d * len, 0] : [0, y0 + sgn * d * len];
    const f = Math.max(.02, front), [ax, ay] = P(0), [bx, by] = P(f + .35);
    const gr = q.createLinearGradient(ax, ay, bx, by);
    gr.addColorStop(0, hot(amt)); gr.addColorStop(cl(.12 * f / (f + .35)), c(amt * .95));
    gr.addColorStop(cl(.55 * f / (f + .35)), c(amt * .7)); gr.addColorStop(cl(f / (f + .35)), c(amt * .28)); gr.addColorStop(1, c(0));
    q.fillStyle = gr; q.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) {       // three soft blobs: positions from seed, drifting slowly along the edge
      const p = (hash(o.seed * 13 + i * 7.1) * .8 + .1) + .03 * Math.sin(t * .9 + i * 2.1), rr = (hash(o.seed * 5 + i * 3.3) * .3 + .35) * H * (.6 + f);
      const dIn = (.04 + .1 * hash(o.seed + i * 9.7)) * f, [px, py] = hor ? [x0 + sgn * dIn * len, p * H] : [p * W, y0 + sgn * dIn * len];
      const rg = q.createRadialGradient(px, py, 0, px, py, rr);
      rg.addColorStop(0, hot(amt * .7)); rg.addColorStop(.45, c(amt * .35)); rg.addColorStop(1, c(0));
      q.fillStyle = rg; q.fillRect(0, 0, W, H);
    }
    return L.c;
  }
  function screenLight(g, o, amt, front, t, lift = 0) {
    if (amt <= .002 && lift <= .002) return;
    g.save(); g.globalCompositeOperation = 'screen';
    if (amt > .002) g.drawImage(lightLayer(o, amt, front, t), 0, 0);
    if (lift > .002) { const [r, gg, b] = o.rgb; g.fillStyle = `rgba(${r},${gg},${b},${cl(lift).toFixed(4)})`; g.fillRect(0, 0, W, H); }
    g.restore();
  }
  function leakTimes(o) {          // relative to t0: white segments and the overexposed gap between double flashes (s)
    const f = 1 / fps(), w = o.white * f;
    if (o.flashes === 2) { const g = o.gap * f; return { w1: [0, w], mid: [w, w + g], w2: [w + g, 2 * w + g], end: 2 * w + g }; }
    return { w1: [0, w], mid: null, w2: null, end: w };
  }
  XK.fx('leak', {
    din: LEAK.in + .05 + LEAK.after, cut: LEAK.in, cpu: false,
    prep(it) {
      const o = { ...LEAK, ...(it.fx || {}) }; checkKeys('leak', it.fx, LEAK);
      if (!['left', 'right', 'top', 'bottom'].includes(o.from)) { err(`leak.from must be left / right / top / bottom, got ${o.from}`); o.from = 'right'; }
      o.white = Math.max(1, Math.round(o.white)); o.gap = Math.max(1, Math.round(o.gap));
      if (o.flashes !== 1 && o.flashes !== 2) { err(`leak.flashes must be 1 / 2, got ${o.flashes}`); o.flashes = 1; }
      if (o.flashes === 2 && !o.unsafe) { err('leak.flashes:2 means 4 big brightness jumps within 1 s (photosensitivity limit is 3); a double flash also requires unsafe:true'); o.flashes = 1; }
      o.rgb = lightColor(o); o.T = leakTimes(o);
      o.din = o.in + o.T.end + o.after; o.cut = o.in; return o;
    },
    link(it, SEQ) {                // at most once per video; another leak within 1 s exceeds the photosensitivity limit
      const o = it.fxo, others = SEQ.filter(x => x !== it && x.tin === 'leak');
      const earlier = others.filter(x => x.t0 < it.t0);
      if (earlier.length && !o.repeat) err(`use leak at most once per video (this is use ${earlier.length + 1}, t0 = ${it.t0.toFixed(2)}); for a demo reel that needs more, set repeat:true`);
      if (others.some(x => Math.abs(x.t0 - it.t0) < 1) && !o.unsafe) err(`another leak within 1 s (t0 = ${it.t0.toFixed(2)}): more than 3 big brightness jumps per second`);
    },
    draw(g, A, B, k, it, t) {
      const o = it.fxo, T = o.T; let tt = t - it.t0; if (Math.abs(tt) < 1e-6) tt = 0;
      const paint = S => { if (S) g.drawImage(S.c, 0, 0); else { g.fillStyle = XK.TH.bg; g.fillRect(0, 0, W, H); } };
      const inW = r => r && tt >= r[0] - 1e-6 && tt < r[1] - 1e-6;
      if (tt < 0) {                                    // light spreads in: brighter and wider, with a final full-frame lift so the cut to white is not a hard jump
        const u = cl(1 + tt / o.in), amt = o.peak * Math.pow(u, 1.3), front = .15 + 1.1 * Math.pow(u, 1.4), lift = .55 * o.peak * Math.pow(cl((u - .6) / .4), 2);
        paint(A); screenLight(g, o, amt, front, t, lift);
      } else if (inW(T.w1) || inW(T.w2)) {             // white
        g.fillStyle = o.whiteColor; g.fillRect(0, 0, W, H);
      } else if (inW(T.mid)) {                         // between double flashes: next shot overexposed
        paint(B); screenLight(g, o, o.peak, 1.2, t, .6);
      } else {                                         // afterglow: light on the same side fades smoothly
        const v = cl((tt - T.end) / o.after), amt = o.glow * Math.pow(1 - v, 1.6), front = mix(1.0, .1, Math.pow(v, .7));
        paint(B); screenLight(g, o, amt, front, t);
      }
    },
    hud: (k, it, t) => (t >= it.t0 - 1e-6 ? 1 : 0),
    cues(it) { const o = it.fxo; if (!o.sfx) return []; return [{ t: it.t0 - o.in * .5, name: sfxName(o.sfx), ...(o.gain != null ? { gain: o.gain } : { gain: .4 }) }]; },
  });

  // =====================================================================================================
  // recede
  // =====================================================================================================
  // scale progress (1 - s) / (1 - .45) over the recede: slow then fast, still moving when it arrives (settle takes over)
  const RECEDE_CURVE = [[0, 0], [.091, .027], [.182, .055], [.273, .1], [.364, .164], [.455, .245], [.545, .355], [.636, .49], [.727, .664], [.818, .773], [.909, .927], [1, 1]];
  const FALL = { at: .3, dur: .45, from: 'top', scale: null, origin: null, ease: 4.5, blur: .8, fade: .12 };
  const BGP = { scale: 1, to: null, blur: 0, mix: [0, 1], dur: null };
  const RECEDE = { to: 'bl', margin: 60, scale: .4, recede: .55, curve: RECEDE_CURVE, settle: .9, settleDur: 2, blur: 3, dim: .3, fade: 0, speedBlur: 1,
    fall: FALL, bg: BGP, hold: 'all', release: .35, sfx: 'swap', gain: null };
  const FROM = { top: [0, -.92 * H], bottom: [0, .92 * H], left: [-.8 * W, 0], right: [.8 * W, 0], tr: [.5 * W, -.6 * H], tl: [-.5 * W, -.6 * H], near: [0, 0] };

  // redraw a shot and split it into background and foreground (both in screen coords). S = xk snapshot (has M)
  let SPL = null;
  function bgPaint(g, fn) {        // XM.trans2.bg(g, q => ...): wrap hand-drawn backgrounds (photos, a city...) so recede knows they are background
    if (SPL && g === SPL.g) { const q = SPL.q; q.save(); q.setTransform(g.getTransform()); q.globalAlpha = g.globalAlpha; fn(q); q.restore(); SPL.hit = true; return; }
    g.save(); fn(g); g.restore();         // normal drawing otherwise (blend mode / alpha changes inside fn do not leak out)
  }
  const kSOf = (it, t) => cl((t - it.t0) / Math.max(.1, (it.tEnd ?? it.t0 + 5) - it.t0));
  function split(item, t, S, key) {
    const sh = item && item.shot, X = sh && sh.S;
    if (!S || !X || !X.cv) return null;
    const BG0 = cv(key + 'b0'), look = sh.L.look, st0 = XM.DS.stage, hud0 = XM.DS.hud;
    SPL = { g: X.g, q: BG0.g, hit: false, look, t };
    XM.DS.stage = function (g, P, o2) {
      if (SPL && g === SPL.g) {
        const q = SPL.q, L = SPL.look, kind = L && L.stage && (typeof L.stage === 'string' ? L.stage : L.stage.kind);
        q.save(); q.setTransform(g.getTransform());
        if (kind && XM.tex && XM.tex[kind]) XM.tex[kind](q, SPL.t, P, typeof L.stage === 'string' ? {} : L.stage); else st0.call(XM.DS, q, P, o2);
        q.restore(); SPL.hit = true; return;
      }
      return st0.apply(this, arguments);
    };
    XM.DS.hud = function (g) { if (SPL && g === SPL.g) return; return hud0.apply(this, arguments); };
    sh.L.look = null;                                   // no look layers in this pass (push / window light / post): keep the foreground clean; post is applied after compositing
    let hit = false;
    try { sh.update(t, kSOf(item, t)); hit = SPL.hit; } finally { XM.DS.stage = st0; XM.DS.hud = hud0; sh.L.look = look; SPL = null; }
    const F = cv(key + 'f'); F.g.setTransform(S.M); F.g.imageSmoothingQuality = 'high'; F.g.drawImage(X.cv, 0, 0); reset(F.g);
    let bg = null;
    if (hit) { const Bc = cv(key + 'b'); Bc.g.fillStyle = XK.TH.bg; Bc.g.fillRect(0, 0, W, H); Bc.g.setTransform(S.M); Bc.g.drawImage(BG0.c, 0, 0); reset(Bc.g); bg = Bc.c; }
    return { fg: F.c, bg, full: S.c, look };
  }
  function vanish(o) {             // vanishing point (screen coords)
    if (Array.isArray(o.to)) return o.to;
    const m = o.margin;
    return { bl: [m, H - m], br: [W - m, H - m], tl: [m, m], tr: [W - m, m] }[o.to];
  }
  function recedeScale(o, tt) {    // old group's scale at this moment
    if (tt <= 0) return 1;
    if (tt < o.recede) return 1 - (1 - o.scale) * o.cR(tt / o.recede);
    return o.scale * mix(1, o.settle, expoOut(cl((tt - o.recede) / Math.max(.01, o.settleDur))));
  }
  function motionEnd(o) { return Math.max(o.recede, o.fall ? o.fall.at + o.fall.dur : 0); }
  XK.fx('recede', {
    din: 1.2, cut: 0, cpu: false,
    prep(it) {
      const fx = it.fx || {}, o = { ...RECEDE, ...fx };
      checkKeys('recede', fx, RECEDE);
      if (fx.fall !== false) { o.fall = { ...FALL, ...(fx.fall || {}) }; checkKeys('recede.fall', fx.fall, FALL); } else o.fall = null;
      o.bg = { ...BGP, ...(fx.bg || {}) }; checkKeys('recede.bg', fx.bg, BGP);
      if (!Array.isArray(o.to) && !['bl', 'br', 'tl', 'tr'].includes(o.to)) { err(`recede.to must be bl / br / tl / tr / [x, y], got ${o.to}`); o.to = 'bl'; }
      if (o.fall) {
        const f = o.fall;
        if (typeof f.from === 'string') { if (!(f.from in FROM)) { err(`recede.fall.from must be ${Object.keys(FROM).join(' / ')} / [dx, dy], got ${f.from}`); f.from = 'top'; }
          if (f.scale == null) f.scale = f.from === 'near' ? 1.3 : 1; if (f.from === 'near' && fx.fall && fx.fall.fade == null) f.fade = .5; f.d = FROM[f.from]; }
        else { f.d = f.from; if (f.scale == null) f.scale = 1; }
        f.origin = f.origin || [W / 2, H / 2];
      }
      o.cR = curveOf(o.curve); o.F = vanish(o); o.Fbg = o.bg.to || o.F;
      if (o.hold !== 'all' && !(o.hold >= 0)) { err(`recede.hold must be 'all' / seconds, got ${o.hold}`); o.hold = 'all'; }
      // first estimate the window from the next shot's t0 (F.link tightens it using the next transition's lead time)
      const n = it.next, end = it.t1 ?? (n ? n.t0 : ((window.VIDEO && VIDEO.duration) || it.t0 + 5));
      o.din = o.hold === 'all' ? Math.max(motionEnd(o) + .05, end - it.t0) : motionEnd(o) + o.hold + o.release;
      o.cut = 0; return o;
    },
    link(it) {
      const o = it.fxo, n = it.next;
      if (o.hold === 'all') {
        const end = it.t1 ?? (n ? n.t0 - (n.cut || 0) : ((window.VIDEO && VIDEO.duration) || it.t0 + 5));
        it.din = Math.max(motionEnd(o) + .05, end - it.t0);
        o.releaseOn = !!(n && n.tin && n.tin !== 'cut');
      } else o.releaseOn = true;
    },
    holdPrev: it => it.din,
    draw(g, A, B, k, it, t) {
      const o = it.fxo; let tt = t - it.t0; if (Math.abs(tt) < 1e-6) tt = 0;
      const SB = split(it, t, B, 'rB'), SA = it.prev ? split(it.prev, t, A, 'rA') : null;
      const bOver = !SB || !SB.bg;
      if (bOver && o.fall) warnOnce('bover' + it.idx, `recede (t0 = ${it.t0.toFixed(2)}): the next shot does not paint its background with XM.DS.stage / XM.trans2.bg, so its subject cannot be separated; it is laid underneath whole, without the fall-in`);
      const kR = cl(tt / o.recede), E = o.cR(kR), kB = cl(tt / (o.bg.dur || o.recede)), EB = o.cR(kB), sBg = 1 - (1 - o.bg.scale) * EB, [bfx, bfy] = o.Fbg;
      // 1) bottom: next shot's background (whole frame if it cannot be split); with bg.scale != 1 it follows the pull-back (from 1/scale to 1)
      const base = bOver ? B.c : SB.bg, sB = o.bg.scale !== 1 ? sBg / o.bg.scale : 1;
      if (Math.abs(sB - 1) > 1e-4) { g.save(); g.setTransform(sB, 0, 0, sB, bfx * (1 - sB), bfy * (1 - sB)); g.imageSmoothingQuality = 'high'; g.drawImage(base, 0, 0); g.restore(); }
      else g.drawImage(base, 0, 0);
      // 2) previous background: pulls back (bg.scale), blurs a little on the way, cross-fades to the next background during mix
      if (SA && SA.bg) {
        const [m0, m1] = o.bg.mix, a = 1 - smooth(cl((kB - m0) / Math.max(1e-3, m1 - m0)));
        if (a > .002) {
          const s = sBg, fx = bfx, fy = bfy, bl = o.bg.blur * Math.sin(Math.PI * kB);
          const T = cv('rAbg'); T.g.setTransform(s, 0, 0, s, fx * (1 - s), fy * (1 - s)); T.g.imageSmoothingQuality = 'high'; T.g.drawImage(SA.bg, 0, 0); reset(T.g);
          g.save(); g.globalAlpha = a; if (bl > .3) g.filter = `blur(${bl.toFixed(2)}px)`; g.drawImage(T.c, 0, 0); g.restore();
        }
      }
      // 3) previous group: shrinks toward the vanishing point, radial blur by speed, blur, darken
      if (SA) {
        const src = SA.bg ? SA.fg : SA.full, s = recedeScale(o, tt), sp = recedeScale(o, tt - 1 / ORIG), [fx, fy] = o.F;
        const wEnd = it.t0 + it.din;
        let alpha = 1 - o.fade * smooth(kR);
        if (o.releaseOn && o.release > 0) alpha *= 1 - smooth(cl((t - (wEnd - o.release)) / o.release));
        if (alpha > .002) {
          const T = cv('rAg'); T.g.setTransform(s, 0, 0, s, fx * (1 - s), fy * (1 - s)); T.g.imageSmoothingQuality = 'high'; T.g.drawImage(src, 0, 0); reset(T.g);
          let L = T.c;
          const rate = sp / s - 1, amt = Math.min(.35, Math.max(0, rate) * .6) * o.speedBlur;
          if (amt > .004) { const Z = cv('rAz'); zoomBlur(Z.g, T.c, fx, fy, amt, { opaque: false }); L = Z.c; }
          const bl = o.blur * smooth(kR), dm = o.dim * smooth(kR);
          g.save(); g.globalAlpha = alpha;
          const f = []; if (bl > .25) f.push(`blur(${bl.toFixed(2)}px)`); if (dm > .005) f.push(`brightness(${(1 - dm).toFixed(3)})`);
          if (f.length) g.filter = f.join(' ');
          g.drawImage(L, 0, 0); g.restore();
        }
      }
      // 4) next shot's subject falls into the foreground
      if (!bOver) {
        const f = o.fall;
        if (!f) g.drawImage(SB.fg, 0, 0);
        else if (tt >= f.at - 1e-6) {
          const pos = uu => { const p = 1 - Math.pow(1 - cl(uu), f.ease); return { x: f.d[0] * (1 - p), y: f.d[1] * (1 - p), s: mix(f.scale, 1, p) }; };
          const u = (tt - f.at) / f.dur, P = pos(u), Q = pos(u - 1 / ORIG / f.dur);
          const a = f.fade > 0 ? smooth(cl(u / f.fade)) : 1;
          if (a > .002) {
            const [ox, oy] = f.origin, put = (q, p, dx = 0, dy = 0) => { q.setTransform(p.s, 0, 0, p.s, ox * (1 - p.s) + p.x + dx, oy * (1 - p.s) + p.y + dy); q.drawImage(SB.fg, 0, 0); };
            const vx = Q.x - P.x, vy = Q.y - P.y, vl = Math.hypot(vx, vy), len = vl * f.blur;   // movement since one reference frame ago (trail points back where it came from)
            g.save(); g.globalAlpha = a;
            if (u < 1 && len > 2) {                    // motion blur: n copies along the velocity (only while falling)
              const n = Math.min(16, Math.max(4, Math.ceil(len / 12))), M = cv('rBm'), ex = vx / vl * len, ey = vy / vl * len;
              M.g.globalCompositeOperation = 'lighter'; M.g.globalAlpha = 1 / n; M.g.imageSmoothingQuality = 'high';
              for (let i = 0; i < n; i++) put(M.g, P, ex * i / (n - 1), ey * i / (n - 1));
              reset(M.g); g.drawImage(M.c, 0, 0);
            } else { g.imageSmoothingQuality = 'high'; put(g, P); }
            g.restore();
          }
        }
      }
      // 5) next shot's post effects (skipped in the split pass), applied once after compositing
      const post = SB && SB.look && SB.look.post;
      if (post && XM.tex && XM.tex.post) XM.tex.post(g, t, post);
    },
    hud: () => 1,
    cues(it) {
      const o = it.fxo; if (!o.sfx || !o.fall) return [];
      return [{ t: it.t0 + o.fall.at + .04, name: sfxName(o.sfx), ...(o.gain != null ? { gain: o.gain } : {}) }];
    },
  });

  XM.trans2 = { LEAK, RECEDE, FALL, zoomBlur, bg: bgPaint };
})();
