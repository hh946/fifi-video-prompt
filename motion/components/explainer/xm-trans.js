// XK canvas transitions: slash (diagonal band with inversion) / defocus (blur through the cut) / whip (whip pan).
// Requires lib.js, xk.js (canvas transition mechanism XK.fx), xm-core.js, xm-ds.js, xm-tex.js (full-frame blur via
//   XM.tex.blurClamp; without it this file's own copy of the same method is used).
// Docs: docs/components/trans.md
//
// Usage: all are XK.seq tin values, options go in fx:{...}; t0 = first frame where the next shot appears.
//   XK.seq([
//     { shot: SH.a, t0: T.a },
//     { shot: SH.b, t0: T.b, tin: 'slash', fx: { angle: 45.5, at: [602, 540] } },       // these are the defaults
//     { shot: SH.c, t0: T.c, tin: 'defocus', fx: { peak: 30 } },                         // this is the default
//   ]);
//   window.SFX_CUES.push(...XK.fxCues());     // suggested transition sounds (slash: one whip by default; defocus: none)
// Works between any shots made with XM.shot (XS evidence, XM components, big type...). The HUD is never inverted or
// blurred during the transition (see the canvas transition section of xk.js).
//
// ───────────────────────────── slash: diagonal band with inversion ─────────────────────────────
// Default look: at t0 a hard cut to the inverted next shot (e.g. white background), then a band opens from a line
//   x = 71.3 + 0.983*y (45.5 deg) toward both sides; inside the band is the next shot itself (inverted + normal sum to 255).
//   The band edges leave the frame at different times; once swept, the whole frame is the next shot.
//   Opening speed starts fast and keeps decelerating; half-width p(tau) = 1 - (1 - tau)^1.654 * e^(-0.618 tau), tau = 0..1
//   over din (fit error at most 13 px over 1834).
//   Band edges: hard in the middle of the frame (sigma 1.6), softer toward the frame edges (top centre sigma ~8, corners
//   ~17-20); the R / B masks are offset slightly along the band normal (up to ~10 px total where sigma is large), so the
//   right edge's dark side looks warm (orange) and the left edge's dark side cool (blue-white). Only the mask edge is
//   soft; the image content is not blurred.
//   The softness is a screen-space model independent of angle (SOFT, fitted to 1639 edge profiles), so any angle or
//   position still gets "hard centre, soft edges".
// Options (fx:{...}, all optional):
//   angle  : band edge angle (degrees, positive = rotating down from horizontal). 45.5 (default) = top-left to
//            bottom-right; -30 = bottom-left to top-right; 90 = vertical band
//   at     : [x, y] open mode: a point on the line the band opens from. Default [602, 540] (left of centre: the left edge
//            leaves the frame first, the right edge slowly eats the top-right corner)
//   mode   : 'open' (default: opens from a line to both sides until it covers everything) | 'sweep' (a band travels
//            from one side of the frame to the other)
//   ahead  : what shows where the band has not reached yet: 'inv' (default) inverted next shot (after the sweep the frame
//            becomes the next shot, "un-inverted") | 'prev' previous shot (plain diagonal wipe)
//   band   : what shows inside the band: 'next' (default) next shot | 'inv' inverted next shot ("only the band is
//            inverted") | 'prevInv' inverted previous shot
//   width  : sweep-mode band width (perpendicular to the edge, px, default 520); Infinity = one-sided diagonal wipe
//            (behind the band is the band's content)
//   dir    : sweep direction: 1 = along normal n = (sin a, -cos a) (up-right at angle 45), -1 = reverse.
//            In sweep mode the area already swept is always the next shot itself
//   din    : duration (s), default 1.5. curve: [a, b] or tau => p, default [1.654, .618]
//   soft   : edge softness. 1 (default) | number = multiplier on the edge softening (0 = 1.6 px hard edge everywhere) |
//            { base, amp, r0, r1, tail, cx, cy, hx, hyT, hyB, q } to override model parameters
//   fringe : colour fringe strength, 1 (default: R / B offset by min(10, .7*(sigma - base)) px total) | 0 off
//   sfx    : 'wipe' (default, = XM.DS.SFX.wipe -> whip, at t0) | sound name | false; gain optional
// HUD: with ahead:'inv' the next shot is on screen from t0, so its HUD is used; with ahead:'prev' / sweep the HUD
//   switches to the next shot when the band passes the frame centre.
//
// ───────────────────────────── defocus: blur through the cut ─────────────────────────────
// The previous shot blurs out, the cut happens inside the blur, and the next shot sharpens back. Both ramps are close to
//   linear. The whole frame is blurred together (text, people, background, evidence cards), so one curve is used: peak
//   gaussian sigma 30 px at the cut frame, blur out over .2 s, sharpen over .25 s (use peak:37 for a stronger effect).
//   Full-frame blur uses clamp-to-edge (XM.tex.blurClamp), so no semi-transparent border appears.
// Options (fx:{...}): peak (sigma at the cut frame, default 30), out (blur-out time, default .2), in (sharpen time,
//   default .25), ease ('linear' default | 'smooth' | 'quadIn' | 'quadOut', used for both ramps), sfx (default false;
//   for a light sound use 'transition' -> whoosh, gain <= .4 suggested)
// Window = [t0 - out, t0 + in): t0 = first (still blurred) frame of the next shot; the previous shot starts blurring at
//   t0 - out.
(() => {
  const { W, H } = XK;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = k => k * k * (3 - 2 * k);
  const EASE = { linear: k => k, smooth, quadIn: k => k * k, quadOut: k => 1 - (1 - k) * (1 - k) };
  const err = m => console.error('XK transition: ' + m);

  // ---------- full-frame blur (clamp-to-edge): prefers XM.tex.blurClamp ----------
  let PADC = null;
  function blurClamp(q, src, px) {
    if (XM.tex && XM.tex.blurClamp) return XM.tex.blurClamp(q, src, px);
    const w = src.width, h = src.height, m = Math.max(128, Math.ceil(px * 3) + 4);
    if (!PADC || PADC.width !== w + 2 * m) { PADC = document.createElement('canvas'); PADC.width = w + 2 * m; PADC.height = h + 2 * m; }
    const p = PADC.getContext('2d'); p.imageSmoothingEnabled = false; p.clearRect(0, 0, PADC.width, PADC.height);
    p.drawImage(src, m, m);
    p.drawImage(src, 0, 0, w, 1, m, 0, w, m); p.drawImage(src, 0, h - 1, w, 1, m, h + m, w, m);
    p.drawImage(src, 0, 0, 1, h, 0, m, m, h); p.drawImage(src, w - 1, 0, 1, h, w + m, m, m, h);
    p.drawImage(src, 0, 0, 1, 1, 0, 0, m, m); p.drawImage(src, w - 1, 0, 1, 1, w + m, 0, m, m);
    p.drawImage(src, 0, h - 1, 1, 1, 0, h + m, m, m); p.drawImage(src, w - 1, h - 1, 1, 1, w + m, h + m, m, m);
    q.save(); q.filter = `blur(${px.toFixed(2)}px)`; q.drawImage(PADC, -m, -m); q.restore();
  }

  // ---------- standard normal CDF Phi (lookup table) ----------
  const PN = 4096, PZ = 6, PHI = new Float32Array(PN + 1);
  { const erf = z => { const t = 1 / (1 + .3275911 * Math.abs(z)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-z * z); return z >= 0 ? y : -y; };
    for (let i = 0; i <= PN; i++) PHI[i] = .5 * (1 + erf((-PZ + 2 * PZ * i / PN) / Math.SQRT2)); }
  const phi = z => { const f = (z + PZ) * (PN / (2 * PZ)); return f <= 0 ? 0 : f >= PN ? 1 : PHI[f | 0]; };

  // =====================================================================================================
  // slash
  // =====================================================================================================
  // edge softness model (fitted to 1639 edge profiles, median log residual .085):
  //   rho = rounded-rectangle norm ((|x - cx|/hx)^q + (|y - cy|/hy)^q)^(1/q) (hy differs above / below), sigma = base + amp*smoothstep(r0, r1, rho) + tail*max(0, rho - r1)
  const SOFT = { base: 1.1, amp: 14.58, r0: .643, r1: 1.033, tail: 4.18, cx: 954, cy: 492, hx: 992, hyT: 527, hyB: 683, q: 1.884 };
  const SLASH = { angle: 45.47, at: [602, 540], mode: 'open', ahead: 'inv', band: 'next', width: 520, dir: 1, din: 1.5,
    curve: [1.654, .618], soft: 1, fringe: 1, sfx: 'wipe', gain: null };
  const SRC = ['next', 'inv', 'prev', 'prevInv'];
  const MAPS = new Map();
  function softMaps(o) {       // 1/sigma (S) and per-channel offset V for the whole frame, cached by parameters (they do not change per frame, so no flicker)
    const P = { ...SOFT, ...(typeof o.soft === 'object' ? o.soft : {}) }, mul = typeof o.soft === 'number' ? o.soft : 1, fr = o.fringe === false ? 0 : +o.fringe || 0;
    const key = JSON.stringify([P, mul, fr]);
    if (MAPS.has(key)) return MAPS.get(key);
    const S = new Float32Array(W * H), V = new Float32Array(W * H), M = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const hy = y + .5 < P.cy ? P.hyT : P.hyB, ay = Math.pow(Math.abs((y + .5 - P.cy) / hy), P.q);
      for (let x = 0; x < W; x++) {
        const rho = Math.pow(Math.pow(Math.abs((x + .5 - P.cx) / P.hx), P.q) + ay, 1 / P.q);
        const k = cl((rho - P.r0) / (P.r1 - P.r0)), extra = mul * (P.amp * smooth(k) + P.tail * Math.max(0, rho - P.r1));
        const sg = Math.max(.6, P.base + extra), i = y * W + x, v = fr * Math.min(5, .35 * extra);
        S[i] = 1 / sg; V[i] = v; M[i] = 4.2 * sg + v;      // M: beyond this distance from the band edge the mask is exactly 0 / 1 (skips Phi)
      }
    }
    const r = { S, V, M }; MAPS.set(key, r); return r;
  }
  function prepSlash(it) {
    const o = { ...SLASH, ...(it.fx || {}) };
    for (const k of Object.keys(it.fx || {})) if (!(k in SLASH) && k !== 'cut') err(`slash: unknown option ${k} (angle / at / mode / ahead / band / width / dir / din / curve / soft / fringe / sfx / gain)`);
    if (!['open', 'sweep'].includes(o.mode)) { err(`slash.mode must be open / sweep, got ${o.mode}`); o.mode = 'open'; }
    if (!SRC.includes(o.ahead)) { err(`slash.ahead must be ${SRC.join(' / ')}, got ${o.ahead}`); o.ahead = 'inv'; }
    if (!SRC.includes(o.band)) { err(`slash.band must be ${SRC.join(' / ')}, got ${o.band}`); o.band = 'next'; }
    const a = o.angle * Math.PI / 180; o.nx = Math.sin(a); o.ny = -Math.cos(a);
    if (o.mode === 'sweep') { const s = o.dir < 0 ? -1 : 1; o.nx *= s; o.ny *= s; }      // sweep: the u axis is the direction of travel
    o.ax = o.at[0]; o.ay = o.at[1];
    const us = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => (x - o.ax) * o.nx + (y - o.ay) * o.ny);
    o.umin = Math.min(...us); o.umax = Math.max(...us); o.dmax = Math.max(-o.umin, o.umax);
    o.uc = (W / 2 - o.ax) * o.nx + (H / 2 - o.ay) * o.ny;
    o.p = typeof o.curve === 'function' ? o.curve : (([ca, cb]) => tau => tau >= 1 ? 1 : 1 - Math.pow(1 - tau, ca) * Math.exp(-cb * tau))(o.curve);
    o.needA = [o.ahead, o.band].some(s => s === 'prev' || s === 'prevInv');
    return o;
  }
  // band geometry (u coordinate): open -> [-h, h]; sweep -> leading edge L, trailing edge L - width
  function geom(o, k) {
    const p = o.p(cl(k));
    if (o.mode === 'open') return { lo: -p * o.dmax, hi: p * o.dmax };
    const w = Number.isFinite(o.width) ? o.width : 0, hi = o.umin + p * (o.umax - o.umin + w);
    return { lo: Number.isFinite(o.width) ? hi - o.width : -Infinity, hi };
  }
  let ZERO = null;
  function drawSlash(g, A, B, k, it) {
    const o = it.fxo, { S, V, M } = softMaps(o), { lo, hi } = geom(o, k);
    const img = B.g.getImageData(0, 0, W, H), d = img.data;
    let a = null;
    if (o.needA) a = A ? A.g.getImageData(0, 0, W, H).data : (ZERO || (ZERO = new Uint8ClampedArray(W * H * 4)));
    // source for each region: [array, inverted?]
    const pick = s => s === 'next' ? [d, 0] : s === 'inv' ? [d, 1] : s === 'prev' ? [a, 0] : [a, 1];
    const [bA, bI] = pick(o.band), [hA, hI] = pick(o.ahead);   // inside band / ahead of band
    const open = o.mode === 'open', fin = smooth(cl((k - .9) / .1));   // last 10%: remaining corners fade into the next shot (no jump on the final frame)
    const nx = o.nx, ny = o.ny;
    const ch = new Float32Array(3), src = new Float32Array(3);
    for (let y = 0, i = 0; y < H; y++) {
      let u = (.5 - o.ax) * nx + (y + .5 - o.ay) * ny;
      for (let x = 0; x < W; x++, i++, u += nx) {
        const p4 = i * 4, mg = M[i];
        // masks for the three regions: inside band mb, ahead mh, behind (sweep only, = next shot) mt
        if (open) {
          if (u > lo + mg && u < hi - mg) { for (let c = 0; c < 3; c++) ch[c] = bI ? 255 - bA[p4 + c] : bA[p4 + c]; }
          else if (u < lo - mg || u > hi + mg) { for (let c = 0; c < 3; c++) ch[c] = hI ? 255 - hA[p4 + c] : hA[p4 + c]; }
          else {
            const s = S[i], v = V[i];
            for (let c = 0; c < 3; c++) {
              const uu = c === 0 ? u + v : c === 2 ? u - v : u, mb = Math.max(0, phi((uu - lo) * s) - phi((uu - hi) * s));   // box convolved with gaussian: zero width = invisible
              const vb = bI ? 255 - bA[p4 + c] : bA[p4 + c], vh = hI ? 255 - hA[p4 + c] : hA[p4 + c];
              ch[c] = mb * vb + (1 - mb) * vh;
            }
          }
        } else {
          if (u > hi + mg) { for (let c = 0; c < 3; c++) ch[c] = hI ? 255 - hA[p4 + c] : hA[p4 + c]; }
          else if (u < lo - mg) { for (let c = 0; c < 3; c++) ch[c] = d[p4 + c]; }
          else if (u > lo + mg && u < hi - mg) { for (let c = 0; c < 3; c++) ch[c] = bI ? 255 - bA[p4 + c] : bA[p4 + c]; }
          else {
            const s = S[i], v = V[i];
            for (let c = 0; c < 3; c++) {
              const uu = c === 0 ? u + v : c === 2 ? u - v : u;
              const mh = phi((uu - hi) * s), mt = lo === -Infinity ? 0 : 1 - phi((uu - lo) * s), mb = Math.max(0, 1 - mh - mt);
              const vb = bI ? 255 - bA[p4 + c] : bA[p4 + c], vh = hI ? 255 - hA[p4 + c] : hA[p4 + c];
              ch[c] = mb * vb + mh * vh + mt * d[p4 + c];
            }
          }
        }
        if (fin > 0) for (let c = 0; c < 3; c++) ch[c] += (d[p4 + c] - ch[c]) * fin;
        d[p4] = ch[0]; d[p4 + 1] = ch[1]; d[p4 + 2] = ch[2]; d[p4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  XK.fx('slash', {
    din: SLASH.din, cut: 0, cpu: true,
    prep: prepSlash,
    draw: drawSlash,
    holdPrev: it => (it.fxo.needA ? it.din : 0),
    hud(k, it) {
      const o = it.fxo; if (!o.needA) return 1;
      const { lo, hi } = geom(o, k);
      return o.mode === 'open' ? (Math.abs(o.uc) < hi ? 1 : 0) : (o.uc < hi ? 1 : 0);
    },
    cues(it) {
      const o = it.fxo; if (o.sfx === false) return [];
      const name = (XM.DS && XM.DS.SFX && XM.DS.SFX[o.sfx]) || o.sfx;
      return [{ t: it.t0, name, ...(o.gain != null ? { gain: o.gain } : {}) }];
    },
  });

  // =====================================================================================================
  // defocus
  // =====================================================================================================
  const DEFOCUS = { peak: 30, out: .2, in: .25, ease: 'linear', sfx: false, gain: null };
  function prepDefocus(it) {
    const o = { ...DEFOCUS, ...(it.fx || {}) };
    for (const k of Object.keys(it.fx || {})) if (!(k in DEFOCUS)) err(`defocus: unknown option ${k} (peak / out / in / ease / sfx / gain)`);
    if (!EASE[o.ease]) { err(`defocus.ease must be ${Object.keys(EASE).join(' / ')}, got ${o.ease}`); o.ease = 'linear'; }
    o.din = o.out + o.in; o.cut = o.out;
    return o;
  }
  XK.fx('defocus', {
    din: DEFOCUS.out + DEFOCUS.in, cut: DEFOCUS.out, cpu: false,
    prep: prepDefocus,
    draw(g, A, B, k, it, t) {
      const o = it.fxo, E = EASE[o.ease];
      let tt = t - it.t0; if (Math.abs(tt) < 1e-6) tt = 0;
      const before = tt < 0, S = before ? A : B;
      const px = before ? o.peak * E(cl(1 + tt / o.out)) : o.peak * E(cl(1 - tt / o.in));
      if (!S) { g.fillStyle = XK.TH.bg; g.fillRect(0, 0, W, H); return; }
      if (px < .3) g.drawImage(S.c, 0, 0); else blurClamp(g, S.c, px);
    },
    cues(it) {
      const o = it.fxo; if (!o.sfx) return [];
      const name = (XM.DS && XM.DS.SFX && XM.DS.SFX[o.sfx]) || o.sfx;
      return [{ t: it.t0 - o.out, name, gain: o.gain ?? .35 }];
    },
  });

// =====================================================================================================
// whip: whip pan
// Canvas transition; t0 = first frame of the next shot (still motion-blurred). The whip-out consumes the tail of the
//   previous shot (window starts at t0 - out).
// Photosensitivity: xk.js checks all transitions together (at most 3 big brightness jumps in any 1 s; over the limit
//   logs console.error; unsafe:true downgrades it to a warning).
// =====================================================================================================
  const FPS = () => (window.VIDEO && VIDEO.fps) || 30;
  const fidx = (it, t) => Math.max(0, Math.floor((t - (it.t0 - (it.cut || 0))) * FPS() + 1e-3));
  const sfxName = n => (XM.DS && XM.DS.SFX && n in XM.DS.SFX) ? XM.DS.SFX[n] : n;
  const rs = g => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; };
  const WK = {};
  function wk(key, w, h, cpu) {            // work canvas (reused by key, rebuilt only when the size changes)
    let c = WK[key];
    if (!c || c.c.width !== w || c.c.height !== h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; c = WK[key] = { c: cv, g: cv.getContext('2d', cpu ? { willReadFrequently: true } : undefined) }; }
    rs(c.g); return c;
  }
  function checkKeys(name, o, D) { for (const k of Object.keys(o || {})) if (!(k in D)) err(`${name}: unknown option ${k} (${Object.keys(D).join(' / ')})`); }
  // Direction: all per-pixel work happens in "work coordinates", where motion is always +y (down). Horizontal directions are transposed, reversed ones flipped.
  const DIRS = { down: [0, 0], up: [0, 1], right: [1, 0], left: [1, 1] };
  function orient(dir) {
    const [hz, fl] = DIRS[dir];
    const to = hz ? (fl ? [0, -1, 1, 0, 0, W] : [0, 1, 1, 0, 0, 0]) : (fl ? [1, 0, 0, -1, 0, H] : [1, 0, 0, 1, 0, 0]);
    const back = hz ? (fl ? [0, 1, -1, 0, W, 0] : [0, 1, 1, 0, 0, 0]) : to;
    return { hz, fl, w: hz ? H : W, h: hz ? W : H, to, back };
  }
  function toWork(src, O, key) { const K = wk(key, O.w, O.h); K.g.setTransform(...O.to); K.g.drawImage(src, 0, 0); rs(K.g); return K; }
  function fromWork(g, K, O, filter) { g.save(); g.setTransform(...O.back); if (filter) g.filter = filter; g.drawImage(K.c, 0, 0); g.restore(); }
  // blur along work-space y by about px: repeatedly halve down to 2/px resolution, then scale back up (~ triangle kernel, edges clamped). Much faster than per-row convolution and leaves no transparent border.
  function axisBlur(K, px, key) {
    if (!(px >= 2)) return K;
    const w = K.c.width, h = K.c.height, target = Math.max(2, Math.round(h * 2 / px));
    let cur = K.c, ch = h, i = 0;
    while (ch > target) { const nh = Math.max(target, Math.round(ch / 2)), T = wk(`${key}h${i++}`, w, nh); T.g.drawImage(cur, 0, 0, w, ch, 0, 0, w, nh); cur = T.c; ch = nh; }
    const O = wk(key + 'o', w, h); O.g.drawImage(cur, 0, 0, w, ch, 0, 0, w, h); return O;
  }
// =====================================================================================================
// whip
// =====================================================================================================
// Default motion: the previous shot accelerates exponentially from rest (per-frame displacement grows x1.32 per
//   reference frame, from ~24 px to ~920 px), horizontal motion blur = 0.5 x per-frame displacement (180 deg shutter);
//   then a hard cut to the next shot, which enters already blurred in the same direction (~360 / 160 / 60 px) and
//   decelerates to sharp within 3 frames. Same direction throughout, so it reads as one continuous whip.
// The whole frame snapshot is whipped (not one strip of the shot): the previous shot accelerates off-screen along dir,
//   and the gap is filled by the shot itself (fill:'wrap'; the blur hides the seam); the next shot comes in from the
//   opposite side with speed, speed x decay per frame, blur shortening with it, settled after in frames. Not a DOM
//   slide with easing because the motion blur needs a full-frame redraw every frame.
// Direction carries meaning: e.g. left for "next", right for "going back". Use 2-3 per video, never the same transition
//   twice in a row, and place it between sentences.
// Options (fx:{...}):
//   dir    : 'left' (default: the image moves left) | 'right' | 'up' | 'down'
//   out    : time for the previous shot to whip out (s), default .4
//   in     : frames for the next shot to settle from blur, default 3 (2-4)
//   dist   : total displacement of the whip-out (multiple of frame width / height), default 1.25
//   ratio  : speed multiplier per reference frame (1/23.976 s), default 1.32; converted to the video fps
//   shutter: motion blur = per-frame displacement x shutter, default .5 (180 deg shutter); maxBlur cap in px, default 520
//   carry  : next shot's first-frame speed = previous shot's final speed x carry, default .8; decay per-frame
//            multiplier, default .42
//   fill   : 'wrap' (default: off-screen gap filled by the shot itself) | 'bg' (show background colour; bg sets the colour)
//   sfx    : 'rushcut' (default -> revcut, cut point = t0) | 'dash' (zip, end aligned to t0) | sound name | false; gain
//   unsafe : only warn when the photosensitivity check fails
// Timing: window = [t0 - out, t0 + in/fps); t0 = first (blurred) frame of the next shot.
  const WHIP = { dir: 'left', out: .4, in: 3, dist: 1.25, ratio: 1.32, shutter: .5, maxBlur: 520, carry: .8, decay: .42, fill: 'wrap', bg: null,
    sfx: 'rushcut', gain: null, unsafe: false };
  function prepWhip(it) {
    const o = { ...WHIP, ...(it.fx || {}) };
    checkKeys('whip', it.fx, WHIP);
    if (!DIRS[o.dir]) { err(`whip.dir must be left / right / up / down, got ${o.dir}`); o.dir = 'left'; }
    if (!['wrap', 'bg'].includes(o.fill)) { err(`whip.fill must be wrap / bg, got ${o.fill}`); o.fill = 'wrap'; }
    const fps = FPS();
    o.O = orient(o.dir); o.N = Math.max(2, Math.round(o.out * fps)); o.M = Math.max(1, Math.min(6, Math.round(o.in)));
    if (o.in < 2 || o.in > 4) console.warn(`XK whip: in should be 2–4 frames, got ${o.in}`);
    const L = o.O.h, r = Math.pow(o.ratio, 23.976 / fps), D = o.dist * L, den = Math.pow(r, o.N) - 1;
    o.pos = n => D * (Math.pow(r, n) - 1) / den;
    const vEnd = o.pos(o.N) - o.pos(o.N - 1), v = j => vEnd * o.carry * Math.pow(o.decay, j);
    o.vin = [...Array(o.M)].map((_, j) => v(j));
    o.off = [...Array(o.M)].map((_, j) => { let s = 0; for (let m = j + 1; m <= o.M; m++) s += v(m); return s; });
    o.din = (o.N + o.M) / fps; o.cut = o.N / fps;
    return o;
  }
  function whipFrame(g, src, o, pos, blur) {
    const O = o.O, L = O.h, K = toWork(src, O, 'wh-src'), T = wk('wh-t', O.w, L);
    if (o.fill === 'bg') { T.g.fillStyle = XK.col(o.bg || 'bg'); T.g.fillRect(0, 0, O.w, L); T.g.drawImage(K.c, 0, pos); }
    else { const p = ((pos % L) + L) % L; T.g.drawImage(K.c, 0, p); T.g.drawImage(K.c, 0, p - L); }
    fromWork(g, axisBlur(T, Math.min(o.maxBlur, blur), 'wh-b'), O);
  }
  function drawWhip(g, A, B, k, it, t) {
    const o = it.fxo, i = fidx(it, t);
    if (i < o.N) {                                     // whip out: frame i at pos(i + 1), blur = this frame's displacement x shutter
      const S = A || B; if (!S) { g.fillStyle = XK.TH.bg; g.fillRect(0, 0, W, H); return; }
      whipFrame(g, S.c, o, o.pos(i + 1), o.shutter * (o.pos(i + 1) - o.pos(i)));
    } else {                                           // blur in: enters from the opposite side with speed
      const j = Math.min(o.M - 1, i - o.N);
      whipFrame(g, B.c, o, -o.off[j], o.shutter * o.vin[j]);
    }
  }
  XK.fx('whip', {
    din: 15 / 30, cut: 12 / 30, cpu: false,
    prep: prepWhip, draw: drawWhip,
    snapT: (it, t) => [t, Math.max(t, it.t0)],
    cues(it) {
      const o = it.fxo; if (o.sfx === false) return [];
      const name = sfxName(o.sfx);
      return [{ t: it.t0, name, ...(name === 'revcut' ? {} : { align: 'end' }), ...(o.gain != null ? { gain: o.gain } : {}) }];
    },
  });

  XM.trans = { SLASH, SOFT, DEFOCUS, softMaps, prepSlash, WHIP, axisBlur, orient };
})();
