// XM.doodle: hand-drawn doodles — brush / marker marks placed around a subject or screenshot (lightning bolt, emanata rays,
// circle, underline, arrow, spark ticks, ink splat, wave). Lines can "boil" (every few frames the whole line is slightly redrawn).
// API: XM.doodle(o) for its own shot, XM.doodle.on(shot, o) to add doodles to an existing shot, XM.doodle.layer(o) for a bare
// layer; main options: items, col, boil, jump, blink, enter. Full docs: docs/components/doodle.md
// Depends on lib.js, xk.js, xm-core.js, xm-ds.js (load them first). Canvas 2D, deterministic (randomness only via XM.rng).
//
// Design notes:
//   · Doodles are a few marks on top of a real photo / screenshot, never a full hand-drawn restyle of the frame. No glow,
//     no trails.
//   · One kind of mark and one colour per shot; no screen shake, no flashing (flashing needs an explicit unsafe:true).
//   · Strokes are not plain polylines: each stroke is a variable-width ribbon — round start, pressure thickens the middle,
//     corners slow down and pool ink, the end flicks to a point with dry-brush streaks; the same shape gets a different
//     hand wobble per seed, so no two strokes match.
//
// Rule: doodles never circle keywords. Keywords only get the highlighter (XM.mark.sweep / hiText); doodles go around the
//   subject (outside the person / object / screenshot: a bolt above a head, rays beside it, an underline under an object,
//   an arrow pointing at it). circle / underline mark the subject, not text.
//
// ─────────────────────────────────────────────────────────────── usage
// 1) On top of an existing shot (any shot that calls XM.DS.hud: big type, evidence cards, XM components…); doodles are drawn
//    just before the HUD:
//      XM.doodle.on(shot, { items:[…], col, boil, … })
// 2) Own shot: XM.doodle({ back(g,t,P), front(g,t,P), items:[…], tone, hud, … }) → { L, update, cues }
//      back draws the base (photo / video frame / screenshot) and the doodles go on top of it; front is drawn above the
//      doodles (e.g. a cut-out subject covering part of a bolt).
// 3) Layer only: const D = XM.doodle.layer({ … }); then D.draw(g, t, P) inside your draw
//
// items (required, one mark per item; content and position come from the caller, there are no default positions):
//   kind  : 'bolt' lightning | 'rays' emanata | 'circle' | 'underline' | 'arrow' | 'spark' emphasis ticks | 'splat' ink splat
//           | 'wave' | 'path' your own points
//   at    : appear time (required); out: disappear time or { at, mode:'cut'|'fade'|'erase' } (default cut)
//   x, y  : position (required; start point for arrow, not used by path); s size (px); rot angle (degrees)
//   bolt  : len (length), n (segments 3–6), w (width), dir (direction in degrees, 0 = up)
//   rays  : n, r0, r1 (inner / outer radius), dir (centre direction in degrees, 0 = up), spread (fan angle in degrees,
//           360 = full ring), w
//   circle: w, h (ellipse size — as big as the thing it surrounds), turns (default 1.12, the end overshoots the start), lw
//   underline: w (length), double (second stroke), lw; arrow: to:[x,y], bend; spark: n, len; splat: r; wave: len, amp, n;
//   path: pts:[[x,y]…], closed
//   enter : 'draw' (default: drawn in stroke order; dur default .2 + total length / 2600 s, max .6; multi-stroke marks draw
//           one stroke after another)
//           | 'cut' (the whole group appears at once)
//   style : 'brush' (strong pressure: thin start, thick middle, pointed dry-brush end; default for bolt / rays / splat)
//           | 'marker' (even width, round ends; default for circle / underline / arrow)
//   lw    : stroke width (px); col: colour (default P.accent; use one colour at a time — two at once → console.error); seed
//   ghost : { dx, dy, a }  misregistration: a second pass in the same colour, slightly offset. Default none
// Layer options:
//   col   : default colour (omitted = the stage's P.accent)
//   boil  : { rate, amp } redraws per second and control-point jitter in px. Default { rate: 7.5, amp: 1.4 } (every 4 frames at
//           30fps, a fine jitter that does not swing back and forth); { rate: 12, amp: 2.5 } gives a rougher "on twos" look;
//           false turns it off (completely still once drawn)
//   jump  : { every, amp:8, seed } the whole group jumps to a random offset (±amp px) every `every` seconds (e.g. every 4–5
//           frames); or { every, steps:[[t, dx, dy], …] } for fixed offsets. Default none
//   blink : [[t0, t1], …] the whole group is hidden during these intervals. Default none
//   unsafe: true allows more than 3 large changes in any 1 s (photosensitivity limit). Default: enforced, console.error
//   grain : ink texture (default .1), dry: dry-brush streaks at stroke ends (default .55)
// Returns: { L, update, cues, flashes } (layer returns { draw, cues, flashes, check }). cues: one 'paper' cue (highlighter
//   swipe sound) per group with enter:'draw'; pass sfxName:'scribble' (or any sound name) to use another sound.
//   enter:'cut' gets no sound by default.
// Photosensitivity check: hard cut in / out, blink and jump count as changes, sized by area (stroke length × width); more than
//   3 changes ≥ 0.6% of the screen in any 1 s → console.error (warning only with unsafe).
//   Each boil step changes ≈ Σperimeter × 2·amp; above 5% of the screen (WCAG's "large area" is about 15% of the screen,
//   tightened three times here) at more than 3 per second is also reported.
(() => {
  const { W, H } = XK;
  const DS = XM.DS;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const sm = k => k * k * (3 - 2 * k);
  const RAD = Math.PI / 180;
  const FPS = () => (window.VIDEO && VIDEO.fps) || 30;

  // Smooth 1D noise (deterministic): value noise + cosine interpolation
  const vn = (x, seed) => { const i = Math.floor(x), f = x - i, a = hash(i * 1.37 + seed * 91.7), b = hash((i + 1) * 1.37 + seed * 91.7), u = (1 - Math.cos(f * Math.PI)) / 2; return a + (b - a) * u; };

  // ============================================================ shapes: each mark → strokes (local coordinates, origin = mark anchor)
  // stroke = { pts:[[x,y]…], corner:true (polyline, sharp corners) | false (curve), style, lw, taper:[start, end] } or { fill:[[x,y]…] } or { dot:[x,y,rx,ry,rot] }
  function catmull(P, n = 10) {
    const out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let j = 0; j < n; j++) { const u = j / n, u2 = u * u, u3 = u2 * u;
        out.push([0, 1].map(k => .5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3))); }
    }
    out.push(P[P.length - 1].slice()); return out;
  }
  const rot2 = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];

  const SHAPES = {
    // bolt: one polyline advancing along the axis, swinging side to side (big swing / small swing back), uneven segment lengths; pointed at both ends (brush)
    bolt(r, o) {
      const L = o.len ?? o.s ?? 220, n = Math.round(o.n ?? 5), a = L * (o.zig ?? .17), pts = [[0, 0]];
      let y = 0, side = r() < .5 ? 1 : -1;
      const steps = [];
      for (let i = 0; i < n; i++) steps.push(.75 + r() * .5);
      const tot = steps.reduce((s, v) => s + v, 0);
      for (let i = 0; i < n; i++) {
        y -= L * steps[i] / tot;
        const big = i % 2 === 0, x = side * a * (big ? 1 : -.45) * (.75 + r() * .5) + (r() - .5) * a * .25;
        pts.push([x, y + (big ? 0 : L * .06 * r())]);
      }
      // give the whole bolt a slight bend (the arc of a wrist) instead of a straight axis
      const bend = (r() - .5) * .18 * L;
      for (const p of pts) p[0] += bend * Math.sin(Math.PI * (-p[1] / L));
      return [{ pts: rotDir(pts, o.dir), corner: true, style: 'brush', lw: o.w ?? L * .085, taper: [.12, .3] }];
    },
    // rays: strokes flicked outward (thick start on the inner ring, pointed outer end); uneven angles and lengths, slight bend
    rays(r, o) {
      const n = Math.round(o.n ?? 7), r0 = o.r0 ?? (o.s ?? 200) * .55, r1 = o.r1 ?? (o.s ?? 200), dir = (o.dir ?? 0) * RAD, spread = (o.spread ?? 150) * RAD;
      const full = spread >= Math.PI * 2 - 1e-3, out = [];
      for (let i = 0; i < n; i++) {
        const u = full ? i / n : (n === 1 ? .5 : i / (n - 1));
        const ang = dir - Math.PI / 2 + (full ? u * spread : (u - .5) * spread) + (r() - .5) * spread / n * .7;
        const a0 = r0 * (.9 + r() * .25), a1 = lerp(r0, r1, .55 + r() * .45) * (1 + (r() - .5) * .2), bend = (r() - .5) * .16 * (a1 - a0);
        const c = Math.cos(ang), s = Math.sin(ang), nx = -s, ny = c;
        const pts = [0, .5, 1].map(k => { const d = lerp(a0, a1, k), b = bend * Math.sin(Math.PI * k); return [c * d + nx * b, s * d + ny * b]; });
        out.push({ pts, corner: false, style: 'brush', lw: (o.w ?? (r1 - r0) * .16) * (.8 + r() * .4), taper: [.05, .55] });
      }
      return out;
    },
    // circle: one elliptical stroke from the top-left, counter-clockwise, slightly spiralled and tilted, ending past the start
    circle(r, o) {
      const w = o.w ?? o.s ?? 300, h = o.h ?? w * .62, turns = o.turns ?? 1.12, th0 = (200 + (r() - .5) * 30) * RAD, tilt = (o.tilt ?? (r() - .5) * 8) * RAD, N = 64;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const k = i / N, th = th0 - k * turns * Math.PI * 2, sp = 1 + (k - .5) * .1 + (vn(k * 5, o.seed || 1) - .5) * .06;
        pts.push(rot2([Math.cos(th) * w / 2 * sp, Math.sin(th) * h / 2 * sp], tilt));
      }
      return [{ pts, corner: false, style: 'marker', lw: o.lw ?? 9, taper: [.03, .12], dense: true }];
    },
    // underline: one stroke sagging slightly in the middle with an upward hook at the end; double = a shorter second stroke, offset start
    underline(r, o) {
      const w = o.w ?? o.s ?? 400, sag = w * .015 * (1 + r()), out = [];
      const line = (x0, x1, y, hook) => { const pts = [];
        for (let i = 0; i <= 8; i++) { const k = i / 8; pts.push([lerp(x0, x1, k), y + sag * Math.sin(Math.PI * k) + (r() - .5) * 1.5]); }
        if (hook) pts.push([x1 + w * .02, y - w * .025]);
        return { pts, corner: false, style: 'marker', lw: o.lw ?? 8, taper: [.04, .2] }; };
      out.push(line(-w / 2, w / 2, 0, o.hook !== false));
      if (o.double) out.push(line(-w / 2 + w * (.04 + r() * .06), w / 2 - w * (.12 + r() * .06), (o.lw ?? 8) * 2.2, false));
      return out;
    },
    // arrow: shaft in one stroke (slightly bent), head in one stroke (barb → tip → other barb, drawn continuously)
    arrow(r, o) {
      const to = o.to || [o.s ?? 200, 0], dx = to[0], dy = to[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux, b = (o.bend ?? .12) * L * (r() < .5 ? 1 : -1);
      const shaft = [0, .5, 1].map(k => [dx * k + nx * b * Math.sin(Math.PI * k), dy * k + ny * b * Math.sin(Math.PI * k)]);
      const ex = dx - ux * L * .02, ey = dy - uy * L * .02, hl = Math.min(70, L * .2), a = 28 * RAD;
      const tdx = ux * Math.cos(Math.PI) * 0, back = (s) => { const c = Math.cos(a), sn = Math.sin(a) * s; return [ex - (ux * c - uy * sn) * hl, ey - (uy * c + ux * sn) * hl]; };
      return [{ pts: shaft, corner: false, style: 'marker', lw: o.lw ?? 8, taper: [.04, .08] },
        { pts: [back(1), [ex, ey], back(-1)], corner: true, style: 'marker', lw: o.lw ?? 8, taper: [.06, .2] }];
    },
    // spark: a cluster of n short ticks (like the emphasis marks next to a "!")
    spark(r, o) { return SHAPES.rays(r, { n: o.n ?? 3, r0: (o.len ?? o.s ?? 80) * .5, r1: (o.len ?? o.s ?? 80) * 1.4, dir: o.dir ?? 0, spread: o.spread ?? 70, w: o.w ?? (o.len ?? o.s ?? 80) * .16 }); },
    // splat: an irregular ink blob + a few spikes flung outward + a few droplets
    splat(r, o) {
      const R = o.r ?? o.s ?? 90, out = [], N = 13, blob = [];
      for (let i = 0; i < N; i++) { const th = i / N * Math.PI * 2, k = .7 + r() * .45; blob.push([Math.cos(th) * R * k, Math.sin(th) * R * k * .85]); }
      out.push({ fill: catmull(blob.concat([blob[0], blob[1], blob[2]]), 6).slice(6, -12) });
      const ns = 6 + Math.floor(r() * 3);
      for (let i = 0; i < ns; i++) { const th = (i / ns + (r() - .5) * .1) * Math.PI * 2, a1 = R * (1.5 + r() * 1.1), c = Math.cos(th), s = Math.sin(th);
        out.push({ pts: [[c * R * .5, s * R * .45], [c * (R * .5 + a1) / 2 + (r() - .5) * 8, s * (R * .5 + a1) / 2 + (r() - .5) * 8], [c * a1, s * a1]], corner: false, style: 'brush', lw: R * (.26 + r() * .14), taper: [0, .7] }); }
      const nd = 4 + Math.floor(r() * 3);
      for (let i = 0; i < nd; i++) { const th = r() * Math.PI * 2, d = R * (1.7 + r() * 1.4), rr = R * (.05 + r() * .09); out.push({ dot: [Math.cos(th) * d, Math.sin(th) * d, rr * (1 + r() * .5), rr, th] }); }
      return out;
    },
    // wave: one stroke, amplitude small at the ends and large in the middle, slightly uneven period
    wave(r, o) {
      const L = o.len ?? o.s ?? 260, A = o.amp ?? L * .07, n = o.n ?? 2.3, pts = [], N = Math.ceil(n * 6);
      for (let i = 0; i <= N; i++) { const k = i / N, env = Math.pow(Math.sin(Math.PI * cl(k * 1.15)), .4); pts.push([k * L - L / 2, A * env * Math.sin(Math.PI * 2 * n * k + (vn(k * 3, o.seed || 2) - .5) * 1.2)]); }
      return [{ pts: rotDir(pts, o.dir ?? 90), corner: false, style: 'marker', lw: o.lw ?? L * .045, taper: [.06, .25] }];
    },
    path(r, o) { return [{ pts: o.pts.map(p => p.slice()), corner: !!o.corner, style: o.style || 'marker', lw: o.lw ?? 8, taper: o.taper || [.05, .2], closed: o.closed }]; },
  };
  function rotDir(pts, dirDeg) { const a = (dirDeg ?? 0) * RAD; return a ? pts.map(p => rot2(p, a)) : pts; }   // shapes point up (-y); dir rotates clockwise
  const DEF_STYLE = { bolt: 'brush', rays: 'brush', spark: 'brush', splat: 'brush', circle: 'marker', underline: 'marker', arrow: 'marker', wave: 'marker', path: 'marker' };

  // ============================================================ one stroke: variable-width ribbon
  // pts are control points; corner=true → polyline (corners only slightly rounded), otherwise Catmull-Rom. Resampled every 2px, then width per point:
  //   pressure p(u): brush starts at .3, full in the middle, flicks to ~0 at the end; marker is round-ended .85 → 1 → .75
  //   speed: slow at corners → thicker (ink pools); fast on straights → slightly thinner
  //   hand wobble: low-frequency width noise ±7%, independent high-frequency noise ±.45px on each edge (rough paper edge)
  function resample(P, corner, step = 2) {
    let src = P;
    if (!corner) src = catmull(P, 12);
    else {    // polyline: round the corners a little (one Chaikin pass, 12% cut)
      const out = [P[0]];
      for (let i = 1; i < P.length - 1; i++) { const a = P[i - 1], b = P[i], c = P[i + 1]; out.push([lerp(b[0], a[0], .12), lerp(b[1], a[1], .12)], b, [lerp(b[0], c[0], .12), lerp(b[1], c[1], .12)]); }
      out.push(P[P.length - 1]); src = catmull(out, 4);
    }
    const acc = [0];
    for (let i = 1; i < src.length; i++) acc.push(acc[i - 1] + Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]));
    const L = acc[acc.length - 1], n = Math.max(2, Math.ceil(L / step)), res = [];
    let j = 0;
    for (let i = 0; i <= n; i++) { const d = L * i / n; while (j < acc.length - 2 && acc[j + 1] < d) j++; const k = (d - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]); res.push([lerp(src[j][0], src[j + 1][0], k), lerp(src[j][1], src[j + 1][1], k)]); }
    return { pts: res, L };
  }
  function pressure(u, style, taper) {
    const [ti, to] = taper;
    if (style === 'brush') {
      const a = ti > 0 ? .3 + .7 * sm(cl(u / ti)) : 1, b = to > 0 ? Math.pow(cl((1 - u) / to), .85) : 1;
      return a * b * (1 + .06 * Math.sin(Math.PI * u));
    }
    const a = .82 + .18 * sm(cl(u / Math.max(.01, ti))), b = .7 + .3 * sm(cl((1 - u) / Math.max(.01, to)));
    return a * b;
  }
  // Returns the outline (left side + right side reversed); k = drawn fraction (0..1, the draw-on progress); round head
  function outline(S, k, seed, boilB, amp) {
    const { pts, L } = S.R, n = pts.length, m = Math.max(2, Math.ceil((n - 1) * cl(k)) + 1), lw = S.lw, sty = S.style;
    const left = [], right = [];
    // tangent + curvature per point
    for (let i = 0; i < m; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let curv = 0;
      if (i > 1 && i < n - 2) { const a2 = pts[i - 2], b2 = pts[i + 2]; const t1 = Math.atan2(p[1] - a2[1], p[0] - a2[0]), t2 = Math.atan2(b2[1] - p[1], b2[0] - p[0]); let d = Math.abs(t2 - t1); if (d > Math.PI) d = 2 * Math.PI - d; curv = d; }
      const u = i / (n - 1), d = u * L;
      let w = lw * pressure(u, sty, S.taper);
      w *= 1 + (S.corner ? .45 : .18) * cl(curv / 1.2);                              // slow at corners → ink pools
      w *= 1 + .07 * (vn(d / 38 + boilB * 3.1, seed) - .5) * 2;                        // width wobble (phase changes with boil)
      w = Math.max(.6, w);
      const e1 = (vn(d / 3.2 + boilB * 7.7, seed + 11) - .5) * .9, e2 = (vn(d / 3.2 + boilB * 5.3, seed + 23) - .5) * .9;
      left.push([p[0] - ty * (w / 2 + e1), p[1] + tx * (w / 2 + e1)]);
      right.push([p[0] + ty * (w / 2 + e2), p[1] - tx * (w / 2 + e2)]);
    }
    return { left, right, m, tip: pts[m - 1] };
  }
  // Polyline stroke (bolt, arrow head): side points at the original vertices use the miter (corners stay sharp, width does
  // not collapse); each edge is subdivided with rough-edge noise. Width takes pressure from the accumulated length.
  function outlineCorner(S, k, seed, boilB) {
    const V = S.V, n = V.length, acc = [0];
    for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(V[i][0] - V[i - 1][0], V[i][1] - V[i - 1][1]));
    const L = acc[n - 1], Lk = L * cl(k);
    const nrm = []; for (let i = 0; i < n - 1; i++) { const dx = V[i + 1][0] - V[i][0], dy = V[i + 1][1] - V[i][1], l = Math.hypot(dx, dy) || 1; nrm.push([-dy / l, dx / l]); }
    const wAt = d => { const u = d / L; let w = S.lw * pressure(u, S.style, S.taper); w *= 1 + .08 * (vn(d / 40 + boilB * 3.1, seed) - .5) * 2; return Math.max(.6, w); };
    // miter direction at a vertex
    const miter = i => { if (i === 0) return [nrm[0][0], nrm[0][1], 1]; if (i === n - 1) return [nrm[n - 2][0], nrm[n - 2][1], 1];
      let mx = nrm[i - 1][0] + nrm[i][0], my = nrm[i - 1][1] + nrm[i][1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const c = mx * nrm[i][0] + my * nrm[i][1]; return [mx, my, Math.min(2.4, 1 / Math.max(.2, c))]; };
    const left = [], right = [];
    const push = (x, y, mx, my, w, d) => { const e1 = (vn(d / 3.2 + boilB * 7.7, seed + 11) - .5) * .9, e2 = (vn(d / 3.2 + boilB * 5.3, seed + 23) - .5) * .9;
      left.push([x + mx * (w / 2 + e1), y + my * (w / 2 + e1)]); right.push([x - mx * (w / 2 + e2), y - my * (w / 2 + e2)]); };
    for (let i = 0; i < n - 1 && acc[i] < Lk; i++) {
      const [ax, ay, am] = miter(i), seg = acc[i + 1] - acc[i], steps = Math.max(1, Math.ceil(seg / 3));
      for (let j = 0; j < steps; j++) {
        const d = acc[i] + seg * j / steps; if (d > Lk) break;
        const f = j / steps, x = lerp(V[i][0], V[i + 1][0], f), y = lerp(V[i][1], V[i + 1][1], f);
        // miter direction at the vertex, then straight back to this edge's normal
        const blend = j === 0 ? 1 : 0, mx = blend ? ax * am : nrm[i][0], my = blend ? ay * am : nrm[i][1];
        push(x, y, mx, my, wAt(d), d);
      }
    }
    // end of the drawn part
    if (Lk >= L - 1e-6) { const [mx, my] = miter(n - 1); push(V[n - 1][0], V[n - 1][1], mx, my, wAt(L), L); }
    else { let i = 0; while (i < n - 2 && acc[i + 1] < Lk) i++; const f = (Lk - acc[i]) / Math.max(1e-6, acc[i + 1] - acc[i]); push(lerp(V[i][0], V[i + 1][0], f), lerp(V[i][1], V[i + 1][1], f), nrm[i][0], nrm[i][1], wAt(Lk), Lk); }
    return { left, right, m: left.length, tip: null };
  }
  function strokePath(q, S, k, seed, boilB) {
    const O = S.corner ? outlineCorner(S, k, seed, boilB) : outline(S, k, seed, boilB);
    if (O.m < 2) return null;
    q.beginPath();
    q.moveTo(O.left[0][0], O.left[0][1]);
    for (let i = 1; i < O.left.length; i++) q.lineTo(O.left[i][0], O.left[i][1]);
    // head: still drawing → round nib; finished → brush is already pointed, marker gets a round end
    const e = O.right[O.right.length - 1], s0 = O.left[O.left.length - 1];
    const hw = Math.hypot(e[0] - s0[0], e[1] - s0[1]) / 2, mx = (e[0] + s0[0]) / 2, my = (e[1] + s0[1]) / 2;
    if (hw > .8) { const a0 = Math.atan2(s0[1] - my, s0[0] - mx); q.arc(mx, my, hw, a0, a0 + Math.PI, true); }
    for (let i = O.right.length - 1; i >= 0; i--) q.lineTo(O.right[i][0], O.right[i][1]);
    // tail (stroke start): round
    const l0 = O.left[0], r0 = O.right[0], hw0 = Math.hypot(l0[0] - r0[0], l0[1] - r0[1]) / 2;
    if (hw0 > .8) { const cx = (l0[0] + r0[0]) / 2, cy = (l0[1] + r0[1]) / 2, a0 = Math.atan2(r0[1] - cy, r0[0] - cx); q.arc(cx, cy, hw0, a0, a0 + Math.PI, true); }
    q.closePath();
    return O;
  }
  // dry brush at the stroke end: cut a few thin gaps along the last part (brush only)
  function dryBrush(q, S, k, seed, amt) {
    if (S.style !== 'brush' || S.corner || amt <= 0 || k < .7) return;
    const { pts } = S.R, n = pts.length, r = XM.rng(seed * 13 + 5), lines = 2 + Math.floor(r() * 2);
    q.save(); q.globalCompositeOperation = 'destination-out'; q.lineCap = 'round';
    for (let j = 0; j < lines; j++) {
      // streaks start at one edge and eat further inward toward the end (ink running dry, bristles splitting)
      const side = r() < .5 ? -1 : 1, o0 = side * (.32 + r() * .1), o1 = side * (.05 + r() * .15), u0 = .7 + r() * .12, u1 = Math.min(cl(k), 1);
      if (u1 <= u0) continue;
      q.beginPath(); q.lineWidth = Math.max(.6, S.lw * (.035 + r() * .04)); q.globalAlpha = amt * (.6 + r() * .4);
      for (let i = Math.floor(u0 * (n - 1)); i <= Math.floor(u1 * (n - 1)); i++) {
        const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const u = i / (n - 1), off = lerp(o0, o1, cl((u - u0) / Math.max(.01, 1 - u0))), w = S.lw * pressure(u, 'brush', S.taper) * off;
        const x = p[0] - (b[1] - a[1]) / tl * w, y = p[1] + (b[0] - a[0]) / tl * w;
        if (i === Math.floor(u0 * (n - 1))) q.moveTo(x, y); else q.lineTo(x, y);
      }
      q.stroke();
    }
    q.restore();
  }

  // ============================================================ grain tile (uneven ink)
  let GRAIN = null;
  function grainTile() {
    if (GRAIN) return GRAIN;
    const c = document.createElement('canvas'); c.width = c.height = 256; const q = c.getContext('2d'), d = q.createImageData(256, 256), r = XM.rng(4242);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const lo = vn(x / 23 + vn(y / 31, 3) * 2, 7) * vn(y / 19, 9), hi = r();
      const a = cl(.55 * lo * lo + .45 * Math.pow(hi, 6));
      const p = (y * 256 + x) * 4; d.data[p] = d.data[p + 1] = d.data[p + 2] = 0; d.data[p + 3] = Math.round(255 * a);
    }
    q.putImageData(d, 0, 0); GRAIN = c; return c;
  }

  // ============================================================ layer
  function layer(o = {}) {
    const items = o.items;
    if (!Array.isArray(items) || !items.length) { console.error('XM.doodle: items is required (one mark per item: kind / at / x / y)'); return { draw() {}, cues: [], flashes: [], check: [] }; }
    const fps = FPS(), boil = o.boil === false ? null : { rate: 7.5, amp: 1.4, ...(o.boil || {}) }, jump = o.jump || null, blink = o.blink || [];
    const grainA = o.grain ?? .1, dryA = o.dry ?? .55;
    const cues = [];
    const list = items.map((it, i) => {
      if (!SHAPES[it.kind]) { console.error(`XM.doodle: item ${i + 1} has unknown kind "${it.kind}" (bolt / rays / circle / underline / arrow / spark / splat / wave / path)`); return null; }
      if (it.at == null) console.error(`XM.doodle: item ${i + 1} is missing at`);
      if (it.kind !== 'path' && (it.x == null || it.y == null)) console.error(`XM.doodle: item ${i + 1} is missing x / y`);
      if (it.kind === 'path' && !Array.isArray(it.pts)) console.error(`XM.doodle: item ${i + 1} path is missing pts`);
      const seed = it.seed ?? (i * 17 + 3), r = XM.rng(seed);
      const strokes = SHAPES[it.kind](r, { ...it, seed }).map((S, j) => {
        if (S.fill || S.dot) return S;
        const style = it.style || S.style || DEF_STYLE[it.kind];
        return { ...S, style, lw: (it.lw && S.lw === undefined) ? it.lw : S.lw, R: resample(S.pts, S.corner), V: S.pts, seed: seed * 7 + j };
      });
      const lens = strokes.map(S => S.R ? S.R.L : 40), tot = lens.reduce((a, b) => a + b, 0);
      const enter = it.enter || o.enter || 'draw', dur = it.dur ?? o.dur ?? Math.min(.6, .2 + tot / 2600);
      const outO = it.out == null ? null : (typeof it.out === 'number' ? { at: it.out, mode: 'cut' } : { mode: 'cut', ...it.out });
      // area estimate (px²): stroke length × mean width (brush averages about .55 lw)
      const area = strokes.reduce((a, S) => a + (S.R ? S.R.L * S.lw * (S.style === 'brush' ? .55 : .9) : S.fill ? 3.14 * 60 * 60 : 3.14 * S.dot[2] * S.dot[3]), 0) * ((it.s && it.kind === 'splat') ? 1 : 1);
      const perim = strokes.reduce((a, S) => a + (S.R ? S.R.L * 2 : 300), 0);
      return { it, i, seed, strokes, lens, tot, enter, dur, outO, area, perim };
    }).filter(Boolean);

    // sound: one cue per group of enter:'draw' items (items appearing at the same time form a group)
    if (o.sfx !== false) {
      const groups = new Map();
      for (const D of list) if (D.enter === 'draw') { const k = D.it.at.toFixed(2); const g0 = groups.get(k); groups.set(k, Math.max(g0 || 0, D.dur)); }
      for (const [k, d] of groups) cues.push({ t: +(+k).toFixed(3), name: o.sfxName || 'paper', gain: o.sfxGain ?? .6 });
    }

    // ---------- photosensitivity check
    const flashes = [], A_MIN = W * H * .006;
    const addEv = (t, area, why) => { if (area >= A_MIN) flashes.push({ t: +t.toFixed(3), area: Math.round(area), why }); };
    const evs = new Map();
    const bump = (t, a, why) => { const k = Math.round(t * fps); const e = evs.get(k) || { t: k / fps, a: 0, why }; e.a += a; evs.set(k, e); };
    for (const D of list) {
      if (D.enter === 'cut') bump(D.it.at, D.area, 'hard-cut in');
      if (D.outO && D.outO.mode === 'cut') bump(D.outO.at, D.area, 'hard-cut out');
    }
    const live = t => list.filter(D => t >= D.it.at && (!D.outO || t < D.outO.at)).reduce((a, D) => a + D.area, 0);
    for (const [b0, b1] of blink) { bump(b0, live(b0 - 1e-3), 'group off'); bump(b1, live(b1), 'group on'); }
    if (jump && jump.every > 0) {
      const t0 = Math.min(...list.map(D => D.it.at)), t1 = Math.max(...list.map(D => D.outO ? D.outO.at : D.it.at + 10));
      for (let t = t0 + jump.every; t < Math.min(t1, t0 + 60); t += jump.every) { const per = list.filter(D => t >= D.it.at && (!D.outO || t < D.outO.at)).reduce((a, D) => a + D.perim, 0); bump(t, per * (jump.amp ?? 8) * .6, 'group jump'); }
    }
    for (const e of evs.values()) addEv(e.t, e.a, e.why);
    flashes.sort((a, b) => a.t - b.t);
    let worst = 0, worstT = 0;
    for (let i = 0; i < flashes.length; i++) { let n = 0; for (let j = i; j < flashes.length && flashes[j].t < flashes[i].t + 1 - 1e-6; j++) n++; if (n > worst) { worst = n; worstT = flashes[i].t; } }
    const check = [];
    if (worst > 3) check.push(`XM.doodle photosensitivity: from ${worstT.toFixed(2)}s there are ${worst} large-area changes within 1 s (> 3)`);
    if (boil && boil.rate > 3) {
      const per = list.reduce((a, D) => a + D.perim, 0) * 2 * boil.amp;
      if (per > W * H * .05) check.push(`XM.doodle photosensitivity: each boil step changes about ${(per / (W * H) * 100).toFixed(1)}% of the frame, ${boil.rate} times per second (> 5% and > 3 per second)`);
    }
    for (const m of check) (o.unsafe ? console.warn : console.error)(m + (o.unsafe ? ' (unsafe:true: only for deliberately fast cuts)' : '; pass unsafe:true explicitly to allow it'));

    // colour check: only one colour at a time
    const colOf = (D, P) => D.it.col || o.col || P.accent;

    // ---------- draw
    const boilB = t => boil ? Math.floor(t * boil.rate + 1e-6) : 0;
    const jumpXY = (t) => {
      if (!jump || !(jump.every > 0)) return [0, 0];
      const t0 = Math.min(...list.map(D => D.it.at)), b = Math.floor((t - t0) / jump.every + 1e-6);
      if (b <= 0) return [0, 0];
      if (jump.steps) { let v = [0, 0]; for (const [tt, dx, dy] of jump.steps) if (t >= tt) v = [dx, dy]; return v; }
      const r = XM.rng((jump.seed ?? 5) * 31 + b), a = jump.amp ?? 8; return [(r() - .5) * 2 * a, (r() - .5) * 2 * a];
    };
    function drawItem(q, D, t, P) {
      const { it } = D;
      if (t < it.at) return;
      let k = D.enter === 'draw' ? cl((t - it.at) / D.dur) : 1, alpha = 1;
      if (D.outO && t >= D.outO.at) {
        const m = D.outO.mode, d = D.outO.dur ?? (m === 'fade' ? .25 : .22);
        if (m === 'cut') return;
        const e = cl((t - D.outO.at) / d); if (e >= 1) return;
        if (m === 'fade') alpha = 1 - sm(e);
        if (m === 'erase') k = Math.min(k, 1 - e);
      }
      if (k <= 0 || alpha <= 0) return;
      const B = boilB(t), amp = boil ? boil.amp : 0;
      // split k across the strokes in stroke order
      let rem = k * D.tot;
      q.save(); q.translate(it.x || 0, it.y || 0); if (it.rot) q.rotate(it.rot * RAD); if (it.scale) q.scale(it.scale, it.scale);
      q.globalAlpha = alpha; q.fillStyle = colOf(D, P);
      const draws = it.ghost ? [[it.ghost.dx ?? -9, it.ghost.dy ?? 9, it.ghost.a ?? .45], [0, 0, 1]] : [[0, 0, 1]];
      for (const [gx, gy, ga] of draws) {
        rem = k * D.tot; q.save(); q.translate(gx, gy); q.globalAlpha = alpha * ga;
        D.strokes.forEach((S, j) => {
          const len = D.lens[j]; if (rem <= 0) return;
          const kk = cl(rem / len); rem -= len;
          if (S.fill) { const r = XM.rng(S.fill.length * 3 + B); q.beginPath(); S.fill.forEach((p, i) => { const x = p[0] + (r() - .5) * amp, y = p[1] + (r() - .5) * amp; i ? q.lineTo(x, y) : q.moveTo(x, y); }); q.closePath(); q.fill(); return; }
          if (S.dot) { if (kk < 1) return; const [x, y, rx, ry, a] = S.dot, r = XM.rng(Math.round(x * 7 + B)); q.beginPath(); q.ellipse(x + (r() - .5) * amp, y + (r() - .5) * amp, rx, ry, a, 0, 6.2832); q.fill(); return; }
          // boil: jitter each control point and resample (same result within one boil step)
          let SS = S;
          if (amp > 0 && B) {
            const r = XM.rng(S.seed * 131 + B * 7);
            const P2 = S.pts.map(p => [p[0] + (r() - .5) * 2 * amp, p[1] + (r() - .5) * 2 * amp]);
            const key = S.seed + ':' + B;
            if (!S._bc || S._bk !== key) { S._bc = resample(P2, S.corner); S._bv = P2; S._bk = key; }
            SS = { ...S, R: S._bc, V: S._bv };
          }
          if (strokePath(q, SS, kk, S.seed, B)) q.fill();
          dryBrush(q, SS, kk, S.seed + B * 3, dryA);
        });
        q.restore();
      }
      q.restore();
    }
    let lastCols = '';
    function draw(g, t, P) {
      P = P || DS.tone('ink');
      for (const [b0, b1] of blink) if (t >= b0 && t < b1) return;
      const vis = list.filter(D => t >= D.it.at && (!D.outO || t < D.outO.at + .4));
      if (!vis.length) return;
      const cols = [...new Set(vis.map(D => colOf(D, P)))];
      if (cols.length > 1 && cols.join() !== lastCols) { console.error(`XM.doodle: at ${t.toFixed(2)}s there are ${cols.length} colours on screen (${cols.join(' / ')}); use one at a time`); lastCols = cols.join(); }
      const Lr = XM.canvas('xm-doodle-layer', W, H), q = Lr.g;
      const [jx, jy] = jumpXY(t);
      q.save(); q.translate(jx, jy);
      for (const D of vis) drawItem(q, D, t, P);
      q.restore();
      if (grainA > 0) {     // ink grain: knock out a little (inside strokes only), like marker / ink that is not perfectly even on paper
        q.save(); q.globalCompositeOperation = 'destination-out'; q.globalAlpha = grainA; q.fillStyle = q.createPattern(grainTile(), 'repeat');
        const r = XM.rng(boilB(t) + 3); q.translate(Math.floor(r() * 256), Math.floor(r() * 256)); q.fillRect(-256, -256, W + 512, H + 512); q.restore();
      }
      g.save(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.drawImage(Lr.c, 0, 0); g.restore();
    }
    return { draw, cues, flashes, check, items: list };
  }

  // ============================================================ shot / add-on
  function doodle(o = {}) {
    const P = DS.tone(o.tone || 'ink'), D = layer(o);
    const shot = XM.shot({ bg: P.bg, stage: 'flat', cam: o.cam }, () => (g, t) => {
      if (o.back) { g.save(); o.back(g, t, P); g.restore(); } else DS.stage(g, P);
      D.draw(g, t, P);
      if (o.front) { g.save(); o.front(g, t, P); g.restore(); }
      if (o.hud !== false) DS.hud(g, t, P, { tl: 'FIG', ...(o.hud || {}) });
    });
    shot.cues = D.cues; shot.flashes = D.flashes; shot.doodle = D;
    return shot;
  }
  function on(shot, o = {}) {
    if (!shot || typeof shot.update !== 'function') { console.error('XM.doodle.on: the first argument must be a shot returned by a component (with update)'); return shot; }
    const D = layer(o), up = shot.update;
    shot.update = function (t, kS) {
      const hud0 = DS.hud; let done = false;
      DS.hud = function (g, tt, P, oo) { if (!done) { done = true; D.draw(g, tt, P); } return hud0.call(this, g, tt, P, oo); };
      try { up.call(this, t, kS); } finally { DS.hud = hud0; }
      if (!done && shot.S && shot.S.g) D.draw(shot.S.g, t, DS.tone(o.tone || 'ink'));
    };
    shot.cues = (shot.cues || []).concat(D.cues); shot.flashes = (shot.flashes || []).concat(D.flashes); shot.doodle = D;
    return shot;
  }
  doodle.on = on; doodle.layer = layer; doodle.SHAPES = SHAPES;
  XM.doodle = doodle;
})();
