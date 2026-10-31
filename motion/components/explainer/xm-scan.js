// XM.scanEye: iris scan / identity match.
//   A halftone eye opens from a thin line, glances around while HUD labels type in, then the camera pushes in and locks:
//   a big match readout counts up, a progress bar fills and a rainbow tick ring closes around the iris. Optional macro cut
//   into a full-screen iris close-up. API: XM.scanEye(o) -> shot { L, update }; main options: at, open, title, labels,
//   match, subject, macro, gaze, size, hit, hud, color, ink. Docs: docs/components/scan.md
// The timing is a pure function of voice-over time points; all colours come from the XK theme (iris = accent); every text and number is a parameter.
// Depends on: lib.js (hash/clamp/lerp/prog) -> xk.js -> xm-core.js -> this file. Canvas 2D only, no WebGL.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// XM.scanEye(o) -> { L, update }
//   Fits lines like: "how AI recognises you", "face / iris unlock", "97% recognition accuracy", "confidence", "you are always being watched / scanned"
//   Picture: a horizontal line opens into an almond-shaped halftone eye (45° dot-grid sclera, fibrous iris, nine-blade aperture, nine-sided pupil
//         with a rainbow outline, four-point star glint, halftone shadow from the upper lid); the eye glances left / right -> frame brackets,
//         tick ring, outline arcs, ECG lines and two callouts type in (01 / 02) -> push-in and lock, the match number counts from 0 to the target,
//         18-cell progress bar -> subject block (04) -> optional macro cut (full-screen iris fibres + huge readout) -> lock: "identified" + rainbow tick ring closes in.
//
//   o.at        seconds, shot start: a horizontal line draws out from the centre (the "closed eye"). Default 0
//   o.open      { at }  time the eye opens (0.3 s to open; 0.1 s in hit mode). Default at + 0.15
//   o.title     string | { zh, en }  title at the top (zh 36px, default is Chinese for "retinal handshake", + English micro text "RETINAL HANDSHAKE — SCAN SEARCHING/TRACKING/CONFIRMED", state switches automatically).
//               It is a page header, not text the viewer must read; false hides it
//   o.labels    { a, b }  two callouts (text to read, 56px): a top left pointing at the iris, b top right pointing at the pupil.
//               Each is a string or { text, en, sub, at }: en = English micro text (default IRIS / PUPIL), sub = micro line below (b defaults to the live pupil diameter),
//               at = appear time (default a = 50% and b = 75% of the way from open to lock-on); labels:false hides them
//   o.match     { keys:[[t, value], …], label (default Chinese "match"), en:'MATCH', dec:1, suf:'%', size:150, at, lock:{ at, text (default Chinese "identified"), color:'ok' } }
//               keys: readout keyframes (easeInOut between them), hidden before the first key; default [[open+1.0, 0.7], [open+1.6, 97.2]]
//               at: start of push-in / lock-on (TRACKING), default keys[0][0] − 0.07
//               lock: lock time (CONFIRMED): the bar fills, the label is replaced by "■ <lock.text>" typed in (56px; the old label moves to the micro line above),
//               and a rainbow tick ring closes around the iris; default last key + 0.12
//               match:false = eye and callouts only
//   o.subject   { at, name, sub, en:'SUBJECT' }  subject block bottom left: name is text to read (56px, e.g. "you", "user #0427"), sub is micro text next to the barcode ('\n' = new line).
//               Hidden by default; at defaults to TRACKING + 0.3
//   o.macro     { at, dur:0.8 }  optional macro cut (hard cut to a full-screen iris-fibre close-up + 360px readout + 24-cell bar), hard cut back to the eye after dur.
//               The readout keeps counting with the same keys; after lock the chip shows lock.text
//   o.gaze      [[t, dx, dy], …]  eye glance keyframes (dx/dy in units of half the eye width, around ±0.15); default: three automatic glances (left -> right -> up-centre),
//               back to centre, then micro-saccades after lock
//   o.size      eye scale, default 1 (after lock the eye is ~1840px wide, filling the frame)
//   o.hit       false (default, explainer pace: open 0.3 s, glances 0.14 s, push-in 0.45 s expoOut without overshoot, smooth scan bars)
//               | true (fast pace: open in 3 frames, glances in 1–2 frames, push-in with 4% overshoot, single-frame scan-bar flashes). Use for cold-open hooks
//   o.hud       { tl, bl, br } corner micro text (XM.FX.hud), default { tl:'SCAN/01 — BIOMETRIC', bl:'00 SIGNAL' } (bottom right is taken by the readout, leave br empty); false hides it
//   o.color     iris colour, default 'accent' (sclera dots, aperture and iris texture all derive from it); o.ink readout and HUD colour, default 'text'
//   o.bg / o.cam  same as XM.shot
//
// Tip: the layout fills the frame and the HUD hugs the edges; XK.seq's default drift (up to 9% + 100px pan) pushes the side callouts off screen.
//      The example uses drift:{ s0:0, s1:.04, x:0, y:0 }. Keep text to read >= 150px from the frame edges.
// Style: text is flat solid colour; the rainbow outlines and glowing collarette belong to the eye only (the effect), never to the callouts or readouts.
// ─────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  const W = XM.W, H = XM.H, TAU = Math.PI * 2, D2R = Math.PI / 180;

  // ---------- Colours (resolved when the shot is built) ----------
  function rgb(c) {
    const s = String(XK.col(c) || c || '#000').trim();
    if (s[0] === '#') { let h = s.slice(1); if (h.length === 3) h = [...h].map(x => x + x).join(''); const n = parseInt(h.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
  }
  const css = (a, al = 1) => al >= 1 ? `rgb(${a.map(Math.round).join(',')})` : `rgba(${a.map(Math.round).join(',')},${+al.toFixed(3)})`;
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const mulc = (a, k) => a.map(v => clamp(v * k, 0, 255));
  const lum = a => (.2126 * a[0] + .7152 * a[1] + .0722 * a[2]) / 255;
  const WHITE = [255, 255, 255];
  const expoOut = XM.expoOut, ease = easeInOut;

  // =====================================================================================
  // Eye geometry: almond shape from two cubic Béziers; local coords with the corners at (±1,0), unit = half eye width A
  // =====================================================================================
  const SH = { th: .475, bh: .47, tk: .5, bk: .35 };
  const DOT = 0.0116;                                            // halftone dot pitch / A (grid rotated 45°)
  function bez(p0, p1, p2, p3, s) { const m = 1 - s; return m * m * m * p0 + 3 * s * m * m * p1 + 3 * s * s * m * p2 + s * s * s * p3; }
  const HT = [], HB = [];
  (() => {
    const N = 400, tu = [], tv = [], bu = [], bv = [];
    for (let i = 0; i <= N; i++) { const s = i / N; tu.push(bez(-1, -SH.tk, SH.tk, 1, s)); tv.push(-bez(0, -SH.th, -SH.th, 0, s)); bu.push(bez(-1, -SH.bk, SH.bk, 1, s)); bv.push(bez(0, SH.bh, SH.bh, 0, s)); }
    const res = (us, vs, out) => { let j = 0; for (let i = 0; i <= 200; i++) { const u = -1 + i / 100; while (j < N - 1 && us[j + 1] < u) j++; const k = clamp((u - us[j]) / (us[j + 1] - us[j] || 1), 0, 1); out.push(vs[j] + (vs[j + 1] - vs[j]) * k); } };
    res(tu, tv, HT); res(bu, bv, HB);
  })();
  const hAt = (T, u) => { const x = clamp((u + 1) * 100, 0, 200), i = Math.min(199, Math.floor(x)); return T[i] + (T[i + 1] - T[i]) * (x - i); };
  function almondPath(g, A, open) {
    g.beginPath(); g.moveTo(-A, 0);
    g.bezierCurveTo(-SH.tk * A, -SH.th * A * open, SH.tk * A, -SH.th * A * open, A, 0);
    g.bezierCurveTo(SH.bk * A, SH.bh * A * open, -SH.bk * A, SH.bh * A * open, -A, 0);
    g.closePath();
  }
  // Halftone model: coverage -> dot radius (area of circle ∩ grid cell); sclera coverage = horizontal (denser toward the corners) × vertical (denser toward the lids)
  const COV = [];
  (() => { for (let i = 0; i <= 200; i++) { const r = i / 200 * 0.75; let n = 0; const M = 60; for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) { const dx = (x + .5) / M - .5, dy = (y + .5) / M - .5; if (dx * dx + dy * dy <= r * r) n++; } COV.push([r, n / M / M]); } })();
  function radOfCov(c) { if (c <= 0) return 0; for (let i = 1; i < COV.length; i++) if (COV[i][1] >= c) { const [r0, c0] = COV[i - 1], [r1, c1] = COV[i]; return r0 + (r1 - r0) * (c - c0) / (c1 - c0 || 1); } return 0.75; }
  const RC = []; for (let i = 0; i <= 100; i++) RC.push(radOfCov(i / 100));
  const radC = c => { const x = clamp(c, 0, 1) * 100, i = Math.min(99, Math.floor(x)); return RC[i] + (RC[i + 1] - RC[i]) * (x - i); };
  const FU = [[0, .1], [.25, .1], [.35, .115], [.45, .17], [.55, .27], [.65, .42], [.75, .59], [.85, .8], [.95, .92], [1.05, .97]];
  const fU = u => { u = Math.abs(u); for (let i = 1; i < FU.length; i++) if (u <= FU[i][0]) { const [a0, c0] = FU[i - 1], [a1, c1] = FU[i]; return c0 + (c1 - c0) * (u - a0) / (a1 - a0); } return .97; };
  const gQ = q => q < 0 ? .33 * Math.pow(clamp((-q - .35) / .35, 0, 1.6), 1.5) : .12 * Math.pow(clamp((q - .4) / .3, 0, 1.8), 1.5);
  const sclCov = (u, v) => { const h = v < 0 ? hAt(HT, u) : hAt(HB, u); const q = v / Math.max(h, 1e-3); return 1 - (1 - fU(u)) * (1 - Math.min(.9, gQ(q))); };

  // ---------- Iris texture (generated once per accent colour; radius RT = outer edge of the limbus) ----------
  const RT = 1024, IRIS = new Map();
  function irisTex(A) {
    const key = A.join(','); if (IRIS.has(key)) return IRIS.get(key);
    const c = document.createElement('canvas'); c.width = c.height = RT * 2; const g = c.getContext('2d');
    g.translate(RT, RT);
    const R = RT, rnd = XM.rng(4242);
    const stops = [[0, .78], [.53, .78], [.56, .82], [.62, .87], [.68, .9], [.74, .89], [.79, .83], [.83, .75], [.87, .63], [.9, .53], [.912, .51]];
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    for (const [s, k] of stops) gr.addColorStop(s, css(mulc(A, k)));
    gr.addColorStop(.913, 'rgb(14,15,20)'); gr.addColorStop(.96, 'rgb(20,20,25)'); gr.addColorStop(.995, 'rgb(28,28,33)'); gr.addColorStop(1, 'rgba(28,28,33,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill();
    // Fibres: each layer is drawn to a scratch canvas, then blurred into the iris ring (.53–.912)
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = RT * 2; const q = tmp.getContext('2d');
    const ray = (a, r0, r1, w) => { q.lineWidth = w; q.beginPath(); q.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); q.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); q.stroke(); };
    const flush = blur => {
      g.save(); g.beginPath(); g.arc(0, 0, R * .912, 0, TAU); g.arc(0, 0, R * .53, 0, TAU, true); g.clip('evenodd');
      g.filter = `blur(${blur}px)`; g.drawImage(tmp, -RT, -RT); g.filter = 'none'; g.restore();
      q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, RT * 2, RT * 2);
    };
    const S = RT / 1500;
    q.setTransform(1, 0, 0, 1, RT, RT); q.lineCap = 'round';
    for (let i = 0; i < 700; i++) {          // wide dark streaks
      const a = rnd() * TAU, r0 = R * (.56 + rnd() * .3), len = R * (.05 + rnd() * .2);
      q.strokeStyle = css(mulc(A, .36 + rnd() * .2), .25 + rnd() * .35); ray(a, r0, r0 + len, (8 + rnd() * 22) * S);
    }
    for (let i = 0; i < 900; i++) {          // wide light streaks
      const a = rnd() * TAU, r0 = R * (.56 + rnd() * .22), len = R * (.05 + rnd() * .22);
      q.strokeStyle = css(mix(A, WHITE, .1 + rnd() * .16), .12 + rnd() * .25); ray(a, r0, r0 + len, (6 + rnd() * 18) * S);
    }
    flush(6 * S);
    q.setTransform(1, 0, 0, 1, RT, RT);
    for (let i = 0; i < 80; i++) {           // dark spots (crypts), stretched radially
      const a = rnd() * TAU, r0 = R * (.63 + rnd() * .22), len = R * (.05 + rnd() * .09), w = R * (.014 + rnd() * .022);
      q.save(); q.rotate(a); q.fillStyle = css(mulc(A, .36 + rnd() * .12), .6 + rnd() * .35);
      q.beginPath(); q.ellipse(r0 + len / 2, 0, len / 2, w / 2, 0, 0, 7); q.fill(); q.restore();
    }
    flush(12 * S);
    q.setTransform(1, 0, 0, 1, RT, RT); q.lineCap = 'round';
    for (let i = 0; i < 420; i++) {          // thin light streaks (like radial motion blur)
      const a = rnd() * TAU, r0 = R * (.56 + rnd() * .26), len = R * (.03 + rnd() * .2);
      q.strokeStyle = css(mix(A, WHITE, .42 + rnd() * .4), .15 + rnd() * .45); ray(a, r0, r0 + len, (1.5 + rnd() * 4) * S);
    }
    flush(2 * S);
    // fine radial lines on the dark limbal ring
    g.save(); g.beginPath(); g.arc(0, 0, R * .995, 0, TAU); g.arc(0, 0, R * .915, 0, TAU, true); g.clip();
    for (let i = 0; i < 900; i++) { const a = rnd() * TAU; g.strokeStyle = `rgba(70,70,80,${.03 + rnd() * .06})`; g.lineWidth = 1 + rnd() * 3; g.beginPath(); g.moveTo(Math.cos(a) * R * .915, Math.sin(a) * R * .915); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.stroke(); }
    g.restore();
    // Collarette: jagged waveform ring along the outer edge of the aperture disc (spikes outward, glowing)
    const N = 1080, pts = [];
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU;
      const n = Math.sin(a * 41 + 1.3) * .35 + Math.sin(a * 97 + .4) * .25 + Math.sin(a * 17 + 2.1) * .4 + (hash(i * 3.1) - .5) * .8;
      const spike = Math.pow(hash(Math.floor(i / 4) * 7.7), 5) * 3.2 * (hash(i * .7) * .6 + .4);
      pts.push([a, R * (.548 + .008 * (n + .8) + .022 * spike)]);
    }
    g.save();
    g.beginPath(); pts.forEach(([a, r], i) => i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r)); g.closePath();
    g.fillStyle = css(mix(A, WHITE, .42), .28); g.fill();
    g.shadowColor = css(mix(A, WHITE, .6), .9); g.shadowBlur = 18 * S;
    g.strokeStyle = css(mix(A, WHITE, .72), .95); g.lineWidth = 5 * S; g.lineJoin = 'round'; g.stroke();
    g.restore();
    IRIS.set(key, c); return c;
  }

  // Thin-film rainbow (two cycles around) and the rainbow rim gradient. These are colours of the effect itself and do not follow the theme
  const IRI = [[-30, [232, 168, 200]], [-15, [214, 206, 156]], [5, [185, 232, 172]], [35, [140, 224, 236]], [80, [130, 170, 250]], [120, [185, 120, 220]], [150, [232, 168, 200]]];
  function iriGrad(g, x, y, off = 0) {
    const gr = g.createConicGradient((-30 + off) * D2R, x, y);
    for (let k = 0; k < 2; k++) for (const [a, c] of IRI) gr.addColorStop(clamp(((a + 30) / 360) + k * .5, 0, 1), `rgb(${c})`);
    return gr;
  }
  function rimGrad(g, cx, cy, rot = 0) {
    const cg = g.createConicGradient(rot, cx, cy);
    for (const [k, c] of [[0, '#f3d79a'], [.08, '#e9b7c9'], [.16, '#c7a2ee'], [.27, '#a9a8f2'], [.36, '#c79be8'], [.42, '#f08ac0'], [.5, '#f4e27c'], [.58, '#b9ef8d'], [.66, '#7fe6cf'], [.75, '#78dfd6'], [.85, '#8be8c6'], [.94, '#d8ec8c'], [1, '#f3d79a']]) cg.addColorStop(k, c);
    return cg;
  }
  const TICKS = (() => { const r = XM.rng(919), out = []; for (let i = 0; i < 72; i++) out.push({ a: i / 72 * TAU + (r() - .5) * .02, big: r() < .07, len: r() }); return out; })();

  // ---------- Eye drawing ----------
  function e2s(s, u, v) { const c = Math.cos(s.rot), sn = Math.sin(s.rot); return [s.ex + s.A * (u * c - v * sn), s.ey + s.A * (u * sn + v * c)]; }
  function drawEye(g, s, P) {
    const { ex, ey, A, rot, open } = s;
    g.save();
    g.translate(ex, ey); g.rotate(rot);
    almondPath(g, A, open); g.clip();
    g.fillStyle = P.scl; g.fillRect(-A - 4, -A, 2 * A + 8, 2 * A);
    const p = DOT * A, yH = Math.max(SH.th, SH.bh) * .75 * A * open;
    const inv = (sx, sy) => { const dx = sx - ex, dy = sy - ey, c = Math.cos(-rot), sn = Math.sin(-rot); return [dx * c - dy * sn, dx * sn + dy * c]; };
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    for (const [sx, sy] of [[0, 0], [W, 0], [0, H], [W, H]]) { const [lx, ly] = inv(sx, sy); mnx = Math.min(mnx, lx); mxx = Math.max(mxx, lx); mny = Math.min(mny, ly); mxy = Math.max(mxy, ly); }
    g.fillStyle = P.dot; g.beginPath();
    const pd = p / Math.SQRT2, cx0 = Math.max(mnx, -A) - p, cx1 = Math.min(mxx, A) + p, cy0 = Math.max(mny, -yH) - p, cy1 = Math.min(mxy, yH) + p;
    for (let yy = Math.floor(cy0 / pd); yy <= Math.ceil(cy1 / pd); yy++) {
      const ly = yy * pd;
      for (let xx = Math.floor(cx0 / pd); xx <= Math.ceil(cx1 / pd); xx++) {
        if ((xx + yy) & 1) continue;
        const lx = xx * pd, u = lx / A, v = ly / A / Math.max(open, .05);
        if (Math.abs(u) > 1.02) continue;
        const r = radC(sclCov(u, v)) * p; if (r < .35) continue;
        g.moveTo(lx + r, ly); g.arc(lx, ly, r, 0, TAU);
      }
    }
    g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
    drawIris(g, s, P);
    g.restore();
  }
  function drawIris(g, s, P) {
    const { ix, iy, R } = s;
    g.drawImage(irisTex(P.A), ix - R, iy - R, 2 * R, 2 * R);
    // dark halftone shadow cast by the upper lid (same grid)
    g.save();
    g.beginPath(); g.arc(ix, iy, R * .995, 0, TAU); g.arc(ix, iy, R * .54, 0, TAU, true); g.clip('evenodd');
    g.translate(s.ex, s.ey); g.rotate(s.rot);
    const A = s.A, p = DOT * A, c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    const lx0 = (ix - s.ex) * c - (iy - s.ey) * sn, ly0 = (ix - s.ex) * sn + (iy - s.ey) * c;
    g.fillStyle = P.lid; g.beginPath();
    for (let j = Math.floor((ly0 - R) / p); j <= Math.ceil((ly0 + R * .2) / p); j++) for (let i = Math.floor((lx0 - R) / p); i <= Math.ceil((lx0 + R) / p); i++) {
      const lx = i * p, ly = j * p, u = lx / A;
      const top = -hAt(HT, u) * s.open * A, d = (ly - top) / R;
      const cv = Math.pow(clamp(1 - d / .38, 0, 1), 1.3) * .85; if (cv <= .02) continue;
      const r = radC(cv) * p; if (r < .35) continue;
      g.moveTo(lx + r, ly); g.arc(lx, ly, r, 0, TAU);
    }
    g.fill(); g.restore();
    // thin rainbow line on the inner limbus (slowly rotating) + a green-grey sheen at the top left
    g.save();
    g.lineWidth = Math.max(2.5, R * .011); g.strokeStyle = iriGrad(g, ix, iy, s.spin * 40);
    g.beginPath(); g.arc(ix, iy, R * .906, 0, TAU); g.stroke();
    const rg = g.createConicGradient(-Math.PI * .95, ix, iy);
    rg.addColorStop(0, 'rgba(120,170,150,0)'); rg.addColorStop(.12, 'rgba(110,150,130,.55)'); rg.addColorStop(.22, 'rgba(140,110,150,.35)'); rg.addColorStop(.32, 'rgba(120,170,150,0)'); rg.addColorStop(1, 'rgba(120,170,150,0)');
    g.strokeStyle = rg; g.lineWidth = R * .035; g.beginPath(); g.arc(ix, iy, R * .935, 0, TAU); g.stroke();
    g.restore();
    drawAperture(g, s, P);
  }
  // Nine-blade aperture: dark disc + blades (conic gradient dark -> light from each seam) + nine-sided pupil (rainbow outline)
  function apertureGeo(s) {
    const { ix, iy, R, pr, pa } = s;
    const rd = R * .535, rp = R * pr;
    const V = []; for (let k = 0; k < 9; k++) { const a = pa + k * TAU / 9; V.push([ix + Math.cos(a) * rp, iy + Math.sin(a) * rp, a]); }
    const B = V.map(([vx, vy, a]) => {
      const d = a + 33 * D2R, dx = Math.cos(d), dy = Math.sin(d), ox = vx - ix, oy = vy - iy;
      const b = ox * dx + oy * dy, c = ox * ox + oy * oy - (rd + 3) * (rd + 3), tt = -b + Math.sqrt(Math.max(0, b * b - c));
      const ex = vx + dx * tt, ey = vy + dy * tt, nx = -Math.sin(d), ny = Math.cos(d);
      return { vx, vy, ex, ey, cx: (vx + ex) / 2 - nx * tt * .06, cy: (vy + ey) / 2 - ny * tt * .06, ea: Math.atan2(ey - iy, ex - ix) };
    });
    return { V, B, rd };
  }
  function drawAperture(g, s, P) {
    const { ix, iy, R } = s, { V, B, rd } = apertureGeo(s);
    g.save();
    g.beginPath(); g.arc(ix, iy, rd, 0, TAU); g.fillStyle = P.disc; g.fill(); g.clip();
    for (let k = 0; k < 9; k++) {
      const b0 = B[k], b1 = B[(k + 1) % 9];
      let d = b1.ea - b0.ea; while (d < 0) d += TAU; while (d > TAU) d -= TAU;
      g.beginPath(); g.moveTo(b0.vx, b0.vy); g.quadraticCurveTo(b0.cx, b0.cy, b0.ex, b0.ey);
      g.arc(ix, iy, rd + 3, b0.ea, b0.ea + d);
      g.quadraticCurveTo(b1.cx, b1.cy, b1.vx, b1.vy); g.lineTo(b0.vx, b0.vy); g.closePath();
      const gr = g.createConicGradient(V[k][2] + .02, ix, iy);
      gr.addColorStop(0, P.bladeD); gr.addColorStop(.035, P.bladeD); gr.addColorStop(.105, P.bladeB); gr.addColorStop(1, P.bladeB);
      g.fillStyle = gr; g.fill();
    }
    g.strokeStyle = P.bladeE; g.lineWidth = Math.max(1, R * .0032);
    for (const b of B) { g.beginPath(); g.moveTo(b.vx, b.vy); g.quadraticCurveTo(b.cx, b.cy, b.ex, b.ey); g.stroke(); }
    g.restore();
    g.save();
    g.strokeStyle = P.discE; g.lineWidth = Math.max(1, R * .004); g.beginPath(); g.arc(ix, iy, rd, 0, TAU); g.stroke();
    g.beginPath(); V.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
    g.fillStyle = P.pupil; g.fill();
    g.strokeStyle = iriGrad(g, ix, iy, 90 + s.spin * 60); g.lineWidth = Math.max(2.2, R * .009); g.lineJoin = 'round'; g.stroke();
    g.restore();
  }
  // Glints: four-point star + small square, fixed in eye coords (corneal reflection, does not follow the iris)
  function star(g, x, y, r, col, inner = .14) {
    g.fillStyle = col; g.beginPath();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 - Math.PI / 2, rr = k % 2 ? r * inner : r; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; k ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.closePath(); g.fill();
  }
  function drawGlints(g, s) {
    const [sx, sy] = e2s(s, -.124, -.132), [qx, qy] = e2s(s, .088, .097);
    star(g, sx, sy, s.A * .099, '#FFFFFF');
    const q = s.A * .0145; g.fillStyle = '#FFFFFF'; g.fillRect(qx - q / 2, qy - q / 2, q, q);
  }

  // ---------- Text helpers ----------
  // Chinese HUD text: synthetic italic (≈12° skew), slightly narrowed sans
  function zhI(g, s, x, y, size, col, o = {}) {
    g.save(); g.translate(x, y); g.transform(.92, 0, -.2, 1, 0, 0);
    XM.txt(g, s, 0, 0, { fam: 'zh', size, w: o.w ?? 900, col });
    g.restore();
  }
  const zW = (g, s, size) => XM.measure(g, s, { fam: 'zh', size, w: 900 }) * .92;
  const mW = (g, s, size) => XM.measure(g, s, { fam: 'mono', size, w: 500, ls: size * .12 });
  const mono = (g, s, x, y, size, col, align) => XM.txt(g, s, x, y, { fam: 'mono', size, w: 500, col, ls: size * .12, align });
  // One mixed-script label row, typed on character by character at a fixed position: parts = [{ s, k:'z'|'m', size, gap, d (start delay relative to at) }]
  function row(g, parts, x, y, t, at, col, align = 'left', per = .03) {
    const ws = parts.map(p => p.k === 'z' ? zW(g, p.s, p.size) : mW(g, p.s, p.size));
    let tot = 0; ws.forEach((w, i) => tot += w + (i ? (parts[i].gap ?? 0) : 0));
    let cx = align === 'right' ? x - tot : x;
    const x0 = cx;
    parts.forEach((p, i) => {
      if (i) cx += p.gap ?? 0;
      const n = t < at + (p.d || 0) ? 0 : Math.floor((t - at - (p.d || 0)) / per) + 1;
      const str = [...p.s].slice(0, n).join('');
      if (str) { if (p.k === 'z') zhI(g, str, cx, y, p.size, col); else mono(g, str, cx, y, p.size, col); }
      cx += ws[i];
    });
    return { x0, w: tot };
  }
  function seg(g, x0, y0, x1, y1, k = 1) { if (k <= 0) return; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); g.stroke(); }
  function marker(g, x, y, col, a = 1) { g.save(); g.globalAlpha *= a; g.lineWidth = 1.6; g.strokeStyle = col; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); g.restore(); }
  // Big readout: Unbounded Black narrowed ~9%, fixed-width cells
  function numAdv(g, c, S) { return c === '.' ? .295 * S : XM.measure(g, c, { fam: 'unb', size: S, w: 900 }) * .86; }
  function numW(g, str, S) { let w = 0; for (const c of str) w += numAdv(g, c, S); return w; }
  function drawNum(g, str, x, base, S, col) {
    let cx = x;
    for (const c of str) { g.save(); g.translate(cx, base); g.scale(.91, 1); XM.txt(g, c, 0, 0, { fam: 'unb', size: S, w: 900, col }); g.restore(); cx += numAdv(g, c, S); }
  }
  // readout + suffix (smaller, top right); returns total width
  function bigValue(g, str, suf, xRight, base, S, col, measureOnly = false) {
    const ps = S * .47, nw = numW(g, str, S), sw = suf ? XM.measure(g, suf, { fam: 'unb', size: ps, w: 900 }) : 0, tot = nw + sw + (suf ? S * .02 : 0);
    if (!measureOnly) {
      const x0 = xRight - tot; drawNum(g, str, x0, base, S, col);
      if (suf) XM.txt(g, suf, x0 + nw + S * .02, base - S * .45, { fam: 'unb', size: ps, w: 900, col });
    }
    return tot;
  }
  function barcode(g, x, y, w, h, col) {
    g.fillStyle = col; let xx = x, i = 0;
    while (xx < x + w) { const bw = 1 + Math.floor(hash(i * 1.91 + 7) * 3.2); if (i % 2 === 0) g.fillRect(xx, y, Math.min(bw, x + w - xx), h); xx += bw + (i % 2 ? 0 : 1); i++; }
  }

  // =====================================================================================
  function scanEye(o = {}) {
    const at = o.at ?? 0, hit = !!o.hit, sz = o.size ?? 1;
    const O = (o.open && o.open.at) ?? at + .15;
    const M = o.match === false ? null : (o.match || {});
    const keys = M ? (M.keys || [[O + 1.0, .7], [O + 1.6, 97.2]]).slice().sort((a, b) => a[0] - b[0]) : null;
    const TK = M ? (M.at ?? keys[0][0] - .07) : (o.trackAt ?? O + .95);
    const LK = M && M.lock !== false ? ((M.lock && M.lock.at) ?? keys[keys.length - 1][0] + .12) : Infinity;
    const lockText = M && M.lock !== false ? ((M.lock && M.lock.text) ?? 'IDENTIFIED') : '';
    const dec = M ? (M.dec ?? 1) : 1, suf = M ? (M.suf ?? '%') : '', numS = M ? (M.size ?? 150) : 150;
    const mLabel = M ? (M.label ?? 'MATCH RATE') : '', mEn = M ? (M.en ?? 'MATCH') : '';
    const lab = (v, i) => { if (!v) return null; const L = typeof v === 'string' ? { text: v } : v; return { text: L.text, en: L.en ?? (i ? 'PUPIL' : 'IRIS'), sub: L.sub, at: L.at ?? O + (TK - O) * (i ? .75 : .5) }; };
    const LB_ = o.labels === false ? {} : (o.labels || { a: 'IRIS', b: 'PUPIL' });
    const LA = lab(LB_.a, 0), LB = lab(LB_.b, 1);
    const SUB = o.subject ? { name: o.subject.name ?? 'YOU', sub: o.subject.sub ?? '', en: o.subject.en ?? 'SUBJECT', at: o.subject.at ?? TK + .3 } : null;
    const MAC = o.macro ? { at: o.macro.at, dur: o.macro.dur ?? .8 } : null;
    const title = o.title === false ? null : typeof o.title === 'object' ? { zh: o.title.zh ?? '', en: o.title.en ?? 'RETINAL HANDSHAKE' } : { zh: o.title ?? 'IRIS SCAN', en: 'RETINAL HANDSHAKE' };
    const hudO = o.hud === false ? null : { tl: 'SCAN/01 — BIOMETRIC', bl: '00 SIGNAL', ...(o.hud || {}) };

    // ---- Colours ----
    const A = rgb(o.color || 'accent'), T = rgb(o.ink || 'text'), B = rgb(o.bg || 'bg');
    const dark = lum(B) < .5;
    const P = {
      A, scl: dark ? '#F4F3F7' : '#FBFAFC', dot: css(A), lid: css(mulc(A, .3), .92),
      disc: css(mulc(A, .5)), bladeD: css(mulc(A, .42)), bladeB: css(mulc(A, .82)), bladeE: css(mix(A, WHITE, .65), .85), discE: css(mulc(A, .25), .7),
      pupil: '#07080B',
      hud: css(T, .92), hudD: css(T, .58), ink: css(T), line: css(T, .9),
      lock: css(rgb(M && M.lock && M.lock.color || 'ok')),
      light: '#EEECE6', lightD: 'rgba(238,236,230,.62)',
    };
    irisTex(A);                                   // pre-generate (about 0.3 s, once)

    // ---- Timeline ----
    const dOpen = hit ? .1 : .3, dSac = hit ? .045 : .14, dZoom = hit ? .14 : .45;
    const span = TK - O;
    const G = (o.gaze || [[O + span * .3, -.15, .012], [LA ? LA.at : O + span * .5, .13, .016], [LB ? LB.at : O + span * .75, .035, -.035], [TK, 0, 0]]).slice().sort((a, b) => a[0] - b[0]);
    if (!o.gaze) for (let i = 0; i < 8; i++) G.push([Math.max(TK, LK) + .9 + i * 1.35, (hash(i * 7.3) - .5) * .026, (hash(i * 3.1 + 2) - .5) * .016]);   // micro-saccades after lock
    const gaze = t => { let x = 0, y = 0, px = 0, py = 0; for (const [tk, dx, dy] of G) { const k = expoOut(prog(t, tk, tk + dSac)); x += (dx - px) * k; y += (dy - py) * k; px = dx; py = dy; } return [x, y]; };
    const A0 = 757 * sz, A1 = 920 * sz;
    const kTrack = t => {
      if (!hit) return expoOut(prog(t, TK, TK + dZoom));
      const d = t - TK; if (d <= 0) return 0;
      return kf([[0, 0], [.033, 1.22, easeOut], [.08, 1.24], [.14, 1.03, easeOut], [.2, 1]], d);
    };
    // Pupil: dilated at open, contracts to normal; contracts once at a glance and at lock-on then slowly relaxes (light reflex), then breathes slightly
    const dips = [LA ? LA.at : O + span * .5, TK];
    const pupilR = t => {
      const kO = expoOut(prog(t, O, O + dOpen + .1));
      let pr = lerp(.48, .356, kO) + .016 * expoOut(prog(t, TK, TK + .6));
      for (const e of dips) { if (t < e) continue; const d = t - e; pr -= .08 * (d < .06 ? d / .06 : Math.exp(-(d - .06) / .2)); }
      return pr + .005 * Math.sin(t * 2.3) * prog(t, TK + .6, TK + 1.2);
    };
    function state(t) {
      const kO = t < O ? 0 : expoOut(prog(t, O, O + dOpen)), kT = kTrack(t);
      const Ab = lerp(A0, A1, kT) * lerp(1.05, 1, kO);
      const [gx, gy] = gaze(t);
      const rr = lerp(.56, .407, kO) + (.42 - .407) * clamp(kT, 0, 1);
      const pr = pupilR(t);
      const s = { ex: 960, ey: 522, A: Ab, rot: .006 * Math.sin(t * .8), open: lerp(.06, 1, kO), R: Ab * rr, pr, spin: t, kO, kT };
      s.ix = s.ex + gx * Ab; s.iy = s.ey + gy * Ab + 4;
      s.pa = (4 + (pr - .28) * 280 + t * 3) * D2R;
      return s;
    }
    const val = t => { if (!keys || t < keys[0][0]) return null; for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], ease(prog(t, keys[i - 1][0], keys[i][0]))); return keys[keys.length - 1][1]; };
    const fmt = v => v.toFixed(dec);
    const fade = (t, a, d = .1) => clamp((t - a) / d, 0, 1);

    // ---- HUD (screen coordinates) ----
    function hudLayer(g, t, s) {
      const C = P.hud, CD = P.hudD, tracking = t >= TK, sb = state(t - (hit ? .03 : .08));   // the frame brackets trail the iris
      const kT = clamp(s.kT, 0, 1);
      g.save(); g.lineCap = 'butt';
      // ECG lines on both sides + OD (right eye) / HR (SEARCHING phase)
      const hA = fade(t, O + .17) * (1 - fade(t, TK - .05, .15));
      if (hA > 0) {
        g.save(); g.globalAlpha *= hA; g.strokeStyle = C; g.lineWidth = 1.6; g.lineJoin = 'round';
        const [lx, ly] = e2s(s, -1, 0), [rx, ry] = e2s(s, 1, 0);
        const blip = d => { const z = (((d / 620) - (t - O) * 2 + 100) % 1) * 620;
          if (z < 6) return -z * 1.5; if (z < 14) return -9; if (z < 22) return -9 - (z - 14) * 5; if (z < 32) return -49 + (z - 22) * 7.4; if (z < 40) return 25 - (z - 32) * 3.1; if (z > 70 && z < 86) return -Math.sin((z - 70) / 16 * Math.PI) * 7; return 0; };
        for (const [ox, oy, dir] of [[lx, ly, -1], [rx, ry, 1]]) {
          g.beginPath(); const len = dir < 0 ? ox : W - ox;
          for (let d = 0; d <= len; d += 2) { const x = ox + dir * d, y = oy + blip(d); d ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
        }
        g.globalAlpha *= .95;
        zhI(g, 'RIGHT EYE', 150 + mW(g, 'OD ', 15), 470, 18, C); mono(g, 'OD', 150, 470, 15, C);
        mono(g, 'HR 120 BPM', 1752, 470, 15, C, 'right');
        if (((t - O) % .5) < .25) { g.fillStyle = C; g.fillRect(1758, 459, 9, 9); } else { g.lineWidth = 1.3; g.strokeRect(1758.5, 459.5, 8, 8); }
        g.restore();
      }
      // frame corner brackets
      const fA = fade(t, O + .18, .1);
      const bx = lerp(sb.ix, 960, kT), by = lerp(sb.iy, 526, kT);
      const hw = lerp(.657 * A0, .417 * A1 * 1.045, kT), hh = lerp(.517 * A0, .417 * A1 * 1.045, kT);
      if (fA > 0) {
        g.save(); g.globalAlpha *= fA * .9; g.strokeStyle = C; g.lineWidth = 2.2;
        XM.FX.bracket(g, bx - hw, by - hh, hw * 2, hh * 2, 45, C, 2.2);
        g.restore();
        // tick ring (top and bottom sections only) + dashed inner ring; rotates slowly after lock
        const r = .523 * s.A, rot = -.022 * (1 - kT) + (t >= LK ? (t - LK) * .05 : 0);
        g.save(); g.globalAlpha *= fA * .9; g.strokeStyle = C;
        for (let k = -60; k <= 60; k++) {
          if (Math.abs(k) > 18 && Math.abs(k) < 50) continue;
          for (const side of [-1, 1]) {
            const th = (side < 0 ? -Math.PI / 2 : Math.PI / 2) + k * 2.5 * D2R + rot, long = k === 0, mid = k % 6 === 0;
            if (!long && !mid && hash(k * 3.7 + side) < .35) continue;
            const l = long ? 22 : mid ? 14 : 7; g.lineWidth = long ? 2.2 : 1.5;
            g.beginPath(); g.moveTo(bx + Math.cos(th) * r, by + Math.sin(th) * r); g.lineTo(bx + Math.cos(th) * (r - l), by + Math.sin(th) * (r - l)); g.stroke();
          }
        }
        g.setLineDash([3, 7]); g.lineWidth = 1.2; g.globalAlpha *= .8; g.lineDashOffset = -t * 12;
        g.beginPath(); g.arc(bx, by, r - 40, -Math.PI * .78 + rot, -Math.PI * .22 + rot); g.stroke();
        g.beginPath(); g.arc(bx, by, r - 40, Math.PI * .22 + rot, Math.PI * .78 + rot); g.stroke();
        g.setLineDash([]); g.restore();
        // solid arc above / dashed arc below (enlarged eye outline)
        const k1 = lerp(1.34, 1.23, kT), k2 = lerp(1.28, 1.14, kT), uE = lerp(.6, .82, kT), dr = fade(t, O + .15, .2);
        g.save(); g.globalAlpha *= fA * .85; g.strokeStyle = C; g.lineWidth = 1.6;
        g.beginPath();
        for (let i = 0; i <= 60; i++) { if (i / 60 > dr) break; const u = -uE + 2 * uE * i / 60, [x, y] = e2s(s, u * k1, -hAt(HT, u) * k1); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
        g.setLineDash([4, 6]); g.lineWidth = 1.3; g.beginPath();
        for (let i = 0; i <= 60; i++) { if (i / 60 > dr) break; const u = -.72 + 1.44 * i / 60, [x, y] = e2s(s, u * k2, hAt(HB, u) * k2); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); g.setLineDash([]); g.restore();
      }
      // expanding thin circle (once each at glance landing, push-in and lock)
      for (const tb of [O + span * .46, TK, LK]) {
        const d = t - tb, life = hit ? .14 : .42; if (d < 0 || d > life) continue;
        const k = expoOut(d / life), r = s.R * (1 + .85 * k);
        g.save(); g.globalAlpha *= .85 * (1 - clamp((d / life - .5) / .5, 0, 1)); g.strokeStyle = C; g.lineWidth = 1.6;
        g.beginPath(); g.arc(s.ix, s.iy, r, 0, TAU); g.stroke(); g.restore();
      }
      // title
      if (title && t >= O + .13) {
        const st = t < TK ? 'SCAN SEARCHING' : t < LK ? 'SCAN TRACKING' : 'SCAN CONFIRMED';
        const parts = [{ s: title.zh, k: 'z', size: 36 }, { s: (title.en ? title.en + ' — ' : '') + st, k: 'm', size: 17, gap: 16, d: .08 }].filter(p => p.s);
        const w = parts.reduce((a, p, i) => a + (p.k === 'z' ? zW(g, p.s, p.size) : mW(g, p.s, p.size)) + (i ? p.gap : 0), 0);
        row(g, parts, 960 - w / 2, 108, t, O + .13, C, 'left', .022);
      }
      // callout 01 (top left, pointing at the iris edge at −150°)
      g.strokeStyle = C; g.lineWidth = 1.6;
      if (LA && t >= LA.at) {
        const ang = -150 * D2R, mx = s.ix + Math.cos(ang) * s.R, my = s.iy + Math.sin(ang) * s.R;
        const parts = [{ s: '01', k: 'm', size: 24 }, { s: LA.text, k: 'z', size: 56, gap: 16, d: .04 }, { s: LA.en, k: 'm', size: 26, gap: 16, d: .09 }].filter(p => p.s);
        const R0 = row(g, parts, 150, 212, t, LA.at, C);
        const jx = Math.max(470, R0.x0 + R0.w + 40), jy = 236;
        seg(g, mx, my, jx, jy, expoOut(fade(t, LA.at, .12))); seg(g, jx, jy, 150, jy, fade(t, LA.at + .06, .12));
        marker(g, mx, my, C);
        const sub = LA.sub ?? 'Ø 11.8 MM · FIBERS 4096';
        if (sub) mono(g, XM.typed(sub, t, LA.at + .12, .018), 150, 268, 17, CD);
      }
      // callout 02 (top right, pointing at the pupil at −35°)
      if (LB && t >= LB.at) {
        const ang = -35 * D2R, mx = s.ix + Math.cos(ang) * s.R * s.pr, my = s.iy + Math.sin(ang) * s.R * s.pr;
        const parts = [{ s: LB.en, k: 'm', size: 26, d: .09 }, { s: LB.text, k: 'z', size: 56, gap: 16, d: .04 }, { s: '02', k: 'm', size: 24, gap: 16 }].filter(p => p.s);
        const R0 = row(g, parts, 1770, 212, t, LB.at, C, 'right');
        const jx = Math.min(1335, R0.x0 - 40), jy = 236;
        seg(g, mx, my, jx, jy, expoOut(fade(t, LB.at, .12))); seg(g, jx, jy, 1770, jy, fade(t, LB.at + .06, .12));
        marker(g, mx, my, C);
        const sub = LB.sub ?? `APERTURE 9 BLADES · Ø ${(s.pr * 9.3).toFixed(1)} MM`;
        if (sub) mono(g, XM.typed(sub, t, LB.at + .12, .018), 1770, 268, 17, CD, 'right');
      }
      // 03 match (bottom right): label row + big readout + 18-cell bar; after lock "■ <lock text>" types in on the left
      const v = val(t);
      if (M && t >= TK) {
        const locked = t >= LK, RX = 1770, LY = 796, NB = 944;
        // Before lock: "<label> 03"; at lock this becomes "■ <lock text> 03" (typed in) and the label moves to the micro line. Row width is fixed so the rainbow ring never overlaps it
        const showLock = locked && lockText, curL = showLock ? lockText : mLabel;
        const wOf = s2 => (s2 ? zW(g, s2, 56) : 0) + 16 + mW(g, '03', 24);
        const lw = Math.max(wOf(mLabel), lockText ? wOf(lockText) + 22 + 20 : 0);
        const ang = 36 * D2R, mx = s.ix + Math.cos(ang) * s.R, my = s.iy + Math.sin(ang) * s.R;
        const jx = Math.min(1395, RX - lw - 36), jy = LY + 22;
        seg(g, mx, my, jx, jy, expoOut(fade(t, TK, .12))); seg(g, jx, jy, RX, jy, fade(t, TK + .05, .12));
        marker(g, mx, my, C);
        const parts = [{ s: curL, k: 'z', size: 56, d: showLock ? 0 : .03 }, { s: '03', k: 'm', size: 24, gap: 16 }].filter(p => p.s);
        const R0 = row(g, parts, RX, LY, t, showLock ? LK : TK + .02, C, 'right', showLock ? .05 : .03);
        if (showLock) { g.save(); g.globalAlpha *= fade(t, LK, .08); g.fillStyle = P.lock; g.fillRect(R0.x0 - 42, LY - 32, 22, 22); g.restore(); }
        const micro = showLock ? `${mEn ? mEn + ' · ' : ''}${mLabel} · LOCKED` : mEn;
        if (micro) mono(g, showLock ? micro : XM.typed(micro, t, TK + .05, .03), RX, 1004, 15, CD, 'right');
        if (v != null) {
          const str = fmt(v), wv = bigValue(g, str, suf, RX, NB, numS, P.ink);
          const nOn = locked ? 18 : Math.max(1, Math.round(clamp(v, 0, 100) / 100 * 18));
          const bw = Math.max(330, wv), cw = bw / 18;
          g.strokeStyle = P.ink; g.fillStyle = P.ink; g.lineWidth = 1.4;
          for (let i = 0; i < 18; i++) { const x = RX - bw + i * cw; if (i < nOn) g.fillRect(x, 966, cw - 4, 11); else g.strokeRect(x + .7, 966.7, cw - 5.4, 9.6); }
        }
      }
      // 04 subject (bottom left)
      if (SUB && t >= SUB.at) {
        const [mx, my] = e2s(s, -.25, .3);           // inner lower lid: the leader line enters from the right of the label, never through the text
        const parts = [{ s: '04', k: 'm', size: 24 }, { s: SUB.name, k: 'z', size: 56, gap: 16, d: .04 }, { s: SUB.en, k: 'm', size: 26, gap: 16, d: .1 }].filter(p => p.s);
        const R0 = row(g, parts, 150, 796, t, SUB.at, C);
        const jx = Math.max(417, R0.x0 + R0.w + 30), jy = 818;
        g.strokeStyle = C; seg(g, mx, my, jx, jy, expoOut(fade(t, SUB.at, .12))); seg(g, jx, jy, 150, jy, fade(t, SUB.at + .05, .12));
        marker(g, mx, my, C);
        if (t >= SUB.at + .12) {
          g.save(); g.globalAlpha *= fade(t, SUB.at + .12, .08);
          barcode(g, 150, 840, 150, 34, C);
          SUB.sub.split('\n').forEach((ln, i) => mono(g, XM.typed(ln, t, SUB.at + .14 + i * .1, .02), 322, 854 + i * 22, 16, CD));
          g.restore();
        }
      }
      // bottom ECG + label (from TRACKING on)
      if (t >= TK) {
        g.save(); g.globalAlpha *= .95; g.strokeStyle = C; g.lineWidth = 1.6;
        const x0 = 600, L = 560, x1 = x0 + L * fade(t, TK, .1), px = x0 + ((t - TK) * 560) % L, Y = 975;
        g.beginPath();
        for (let x = x0; x <= x1; x += 2) {
          const z = x - px; let y = 0;
          if (z > -30 && z < -10) y = -Math.sin((z + 30) / 20 * Math.PI) * 5; else if (z >= 0 && z < 6) y = -z * 4.5; else if (z >= 6 && z < 13) y = -27 + (z - 6) * 6.5; else if (z >= 13 && z < 18) y = 18.5 - (z - 13) * 3.7; else if (z > 30 && z < 55) y = -Math.sin((z - 30) / 25 * Math.PI) * 6;
          x === x0 ? g.moveTo(x, Y + y) : g.lineTo(x, Y + y);
        }
        g.stroke(); g.fillStyle = C; for (const x of [x0, x1]) { g.beginPath(); g.arc(x, Y, 3, 0, TAU); g.fill(); }
        const w1 = mono(g, 'ECG · HR 120 BPM ', x0, Y + 28, 14, C);
        if (((t - TK) % .5) < .25) g.fillRect(x0 + w1 + 1, Y + 17, 9, 9); else { g.lineWidth = 1.3; g.strokeRect(x0 + w1 + 1.5, Y + 17.5, 8, 8); }
        zhI(g, 'HEARTBEAT', x0 + w1 + 22, Y + 29, 16, C);
        g.restore();
      }
      // pupil crosshair + thin rainbow circle
      if (t >= TK + .03) {
        g.save(); g.strokeStyle = P.light; g.fillStyle = P.light; g.lineWidth = 1.8;
        const cx = s.ix, cy = s.iy, q = s.R / 405;
        seg(g, cx - 51 * q, cy, cx - 23 * q, cy); seg(g, cx + 23 * q, cy, cx + 51 * q, cy); seg(g, cx, cy - 48 * q, cx, cy - 22 * q); seg(g, cx, cy + 22 * q, cx, cy + 48 * q);
        g.beginPath(); g.arc(cx, cy, 3.2 * q, 0, TAU); g.fill();
        if ((t >= TK + .1 && t < TK + .5) || t >= LK) {
          g.globalAlpha *= .85; g.lineWidth = 1.6; g.strokeStyle = iriGrad(g, cx, cy, 200 + t * 50);
          g.beginPath(); g.arc(cx + 4 * q, cy - 2 * q, s.R * .385, 0, TAU); g.stroke();
        }
        g.restore();
      }
      // lock: rotating rainbow tick ring closes in from outside onto the iris edge
      if (t >= LK) {
        const k = expoOut(prog(t, LK, LK + (hit ? .15 : .5))), sc = lerp(1.55, 1, k), R = s.R * sc, rot = (t - LK) * .35;
        g.save(); g.globalAlpha *= clamp(k * 1.4, 0, 1);
        g.strokeStyle = rimGrad(g, s.ix, s.iy, rot * 2); g.lineWidth = Math.max(2.5, s.R * .013);
        g.beginPath(); g.arc(s.ix, s.iy, R * 1.06, 0, TAU); g.stroke();
        g.strokeStyle = P.light; g.lineCap = 'butt';
        for (const tk of TICKS) {
          const r0 = R * (tk.big ? 1.09 : 1.1), r1 = R * (tk.big ? 1.16 : 1.13 + tk.len * .01);
          g.lineWidth = Math.max(1.2, s.R * (tk.big ? .0075 : .0035));
          const c = Math.cos(tk.a + rot), sn = Math.sin(tk.a + rot);
          g.beginPath(); g.moveTo(s.ix + c * r0, s.iy + sn * r0); g.lineTo(s.ix + c * r1, s.iy + sn * r1); g.stroke();
        }
        g.restore();
      }
      // scan bar: explainer pace sweeps smoothly twice (down -> up -> down); hit mode flashes single frames
      const [lx] = e2s(s, -1, 0), [rx] = e2s(s, 1, 0);
      const bar = (y, a, up) => {
        g.save(); g.globalAlpha *= a;
        const gr = g.createLinearGradient(0, y + (up ? 24 : -24), 0, y); gr.addColorStop(0, 'rgba(160,160,165,0)'); gr.addColorStop(1, 'rgba(160,160,165,.35)');
        g.fillStyle = gr; g.fillRect(lx, up ? y : y - 24, rx - lx, 24);
        g.fillStyle = '#F2F2F4'; g.fillRect(lx, y - 1, rx - lx, 2); g.fillRect(rx - 4, y - 4, 7, 7);
        g.restore();
      };
      if (hit) {
        for (const [k, y, a] of [[.29, 212, .35], [.32, 283, 1], [.39, 746, 1], [.82, 800, .8], [.93, 228, 1]]) { const tf = O + span * k; if (t >= tf && t < tf + 1 / 30) bar(y, a, false); }
      } else {
        const sw = [[O + .12, O + .12 + Math.min(.55, span * .45), 180, 860], [O + span * .62, O + span * .62 + Math.min(.4, span * .3), 860, 180]];
        for (const [t0, t1, y0, y1] of sw) if (t >= t0 && t < t1) { const k = ease(prog(t, t0, t1)); bar(lerp(y0, y1, k), Math.sin(Math.PI * prog(t, t0, t1)) * .95, y1 < y0); }
      }
      g.restore();
    }

    // ---- Macro cut: full-screen iris fibres + huge readout ----
    function macro(g, t) {
      const k = prog(t, MAC.at, MAC.at + MAC.dur), ke = hit ? k : easeOut(k);
      const cx = lerp(221, 351, ke), cy = lerp(645, 599, ke), R = lerp(1533, 1392, ke), rotD = lerp(20, 11.2, ke);
      g.fillStyle = P.scl; g.fillRect(0, 0, W, H);
      const p = 47, pd = p / Math.SQRT2; g.fillStyle = P.dot; g.beginPath();
      for (let yy = -2; yy <= Math.ceil(H / pd) + 2; yy++) for (let xx = Math.floor(1500 / pd); xx <= Math.ceil(W / pd) + 2; xx++) {
        if ((xx + yy) & 1) continue; const x = xx * pd, y = yy * pd, r = radC(.33 + .08 * clamp((x - 1650) / 270, 0, 1)) * p;
        g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
      }
      g.fill();
      g.fillStyle = 'rgb(9,10,13)'; g.beginPath(); g.arc(cx, cy, R * 1.07, 0, TAU); g.fill();
      g.save(); g.translate(cx, cy); g.rotate(rotD * D2R * .3); g.drawImage(irisTex(A), -R, -R, 2 * R, 2 * R); g.restore();
      g.save(); g.lineWidth = 3; g.strokeStyle = iriGrad(g, cx, cy, 40 + t * 40); g.beginPath(); g.arc(cx, cy, R * .906, 0, TAU); g.stroke(); g.restore();
      const pr = lerp(.41, .337, ke);
      drawAperture(g, { ix: cx, iy: cy, R, pr, pa: rotD * D2R, spin: t }, P);
      g.save(); g.strokeStyle = 'rgba(236,236,240,.8)'; g.lineWidth = 2; g.beginPath(); g.arc(cx + 20, cy - 10, R * .49, 0, TAU); g.stroke(); g.restore();
      // text: the macro background is the (dark) iris, so all text is light
      const L = P.light, v = val(t), locked = t >= LK;
      const tag = 'MACRO ×4.2 · FIBER SCAN · 9 BLADES', tw = mW(g, tag, 15);
      g.fillStyle = '#060708'; g.fillRect(140, 134, tw + 24, 32); mono(g, tag, 152, 156, 15, L);
      const parts = [{ s: '03', k: 'm', size: 24 }, { s: mLabel, k: 'z', size: 56, gap: 16 }, { s: mEn, k: 'm', size: 26, gap: 16 }].filter(p => p.s);
      const R0 = row(g, parts, 150, 330, t, MAC.at, L, 'left', .001);
      if (locked) { g.fillStyle = P.lock; g.fillRect(R0.x0 + R0.w + 26, 302, 22, 22); mono(g, 'LOCKED', R0.x0 + R0.w + 60, 324, 20, L); }
      if (v != null) {
        const str = fmt(v), S = 330, nw = numW(g, str, S);
        if (hit && locked && t < LK + 1 / 30) { g.fillStyle = L; g.fillRect(120, 380, nw + S * .55, 300); drawNum(g, str, 140, 650, S, '#07080B'); }
        else { drawNum(g, str, 140, 680, S, L); if (suf) XM.txt(g, suf, 140 + nw + 6, 680 - S * .45, { fam: 'unb', size: S * .44, w: 900, col: L }); }
        const on = locked ? 24 : Math.round(clamp(v, 0, 100) / 100 * 24);
        g.fillStyle = L; g.strokeStyle = L; g.lineWidth = 2;
        for (let i = 0; i < 24; i++) { const x = 150 + i * 26.1; if (i < on) g.fillRect(x, 750, 21, 18); else g.strokeRect(x + 1, 751, 19, 16); }
        // chip: VERIFYING… -> lock text (text to read: 44px)
        const chip = locked && lockText ? lockText : 'VERIFYING…', zh = locked && lockText;
        const cs = zh ? 44 : 20, cwid = zh ? zW(g, chip, cs) : mW(g, chip, cs), cx0 = 150 + 24 * 26.1 + 18;
        g.fillStyle = '#060708'; g.fillRect(cx0, zh ? 726 : 744, cwid + 28, zh ? 64 : 32);
        if (zh) zhI(g, chip, cx0 + 14, 775, cs, L); else mono(g, chip, cx0 + 14, 767, cs, L);
      }
    }

    return XM.shot({ bg: o.bg || 'bg', stage: 'flat', cam: o.cam }, S => (g, t) => {
      if (MAC && t >= MAC.at && t < MAC.at + MAC.dur) {
        macro(g, t);
        if (hudO) XM.FX.hud(g, t, { ...hudO, color: P.light, a: .8 });
        return;
      }
      const s = state(t);
      if (t < O + dOpen * .5) {                          // closed eye: a horizontal line drawn out from the centre
        const k = expoOut(prog(t, at, at + .3)), a = 1 - fade(t, O + dOpen * .3, dOpen * .2);
        g.save(); g.globalAlpha *= a; g.fillStyle = P.hud; g.fillRect(960 - 960 * k, s.ey + 4, 1920 * k, 1.8); g.restore();
      }
      if (t >= O) { drawEye(g, s, P); if (s.kO > .5) drawGlints(g, s); }
      hudLayer(g, t, s);
      if (hudO) XM.FX.hud(g, t, { ...hudO, color: 'mute', a: .85 });
    });
  }

  Object.assign(XM, { scanEye });
})();
