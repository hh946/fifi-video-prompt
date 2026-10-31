// XM.globe: halftone dot globe -> close-up search -> lock on a city -> push into the dots.
// Wide shot: outlined word wall + rotating halftone globe + three orbits (solid / dashed / dotted, front and back halves
//   drawn separately, highlighted on the beat) + satellites (trails + labels) + viewfinder / WORLD.EXE tag / side
//   readouts -> hard cut to an accent close-up: vertical solid big word + crosshair + ACQUIRING... coordinate box ->
//   TARGET LOCKED box + bottom black bar LOCKED (drifting) -> camera pushes in until the dots fill the screen.
// A pure function of time driven by parameters and voiceover times; the globe orientation uses a general rotation that
//   brings any latitude / longitude under the crosshair.
// Requires lib.js (hash/clamp/lerp) -> xk.js -> xm-core.js -> this file. All Canvas 2D, no WebGL.
// Land mask: xm-assets/globe/land.js (Natural Earth 1:50m land, public domain, 1024x512 bitmap), injected as a <script>
//   relative to this file on the first XM.globe call and registered with XM.asset; the render ready chain waits for it.
//   No fetch, no getImageData (final renders run from file://). License: xm-assets/globe/LICENSE.txt.
// Docs: docs/components/globe.md
//
// -----------------------------------------------------------------------------
// XM.globe(o): for "worldwide / present in N countries / where this happens / locking onto a city (a company HQ, a data
//   centre)"
//   at       s, globe entry (rises from below + edge dots swell into a coloured ring -> expanding ring; orbits draw in
//            0.35 s, viewfinder closes in)
//   word     'WORLD'  background outlined word wall (three rows, adjacent rows scroll in opposite directions) and the
//            vertical solid big word in the close-up. English uses Unbounded Black; Chinese automatically Source Han Sans
//            (stacked upright one character at a time when vertical)
//   spin     deg/s, globe rotation (view-centre longitude decreases = continents move right, like real rotation), default 36
//   tilt     deg, axis tilt on screen (roll around the view axis), default 11.5
//   view     deg, wide-shot view-centre latitude, default 21.6 (northern hemisphere facing the viewer)
//   lon      deg, view-centre longitude after entry, default 20 (Africa / Europe centred). Spins an extra 48 deg on entry
//   orbits   true | false   three orbits + satellites (false = globe only)
//   beat     s, beat period for orbit highlights (the three orbits thicken and turn accent one frame apart, line width
//            decays x0.45 per frame), default 0.5 (120 BPM); 0 = off
//   beats    [t, ...]  highlight only at these keyword times (replaces the beat period)
//   sats     [{ label, at, orbit:'solid'|'dash'|'dot', th, speed, id }]  satellites. label is text to read (Source Han Sans
//            56 px, black tag), the tag unfolds at at; satellites keep moving along their orbit (speed in deg/s of the
//            parameter angle, default +-10), th = parameter angle at time at (deg; 0-180 = front half, in front of the
//            globe); defaults in order [dot 150], [dash 30], [solid 105]. Before at a satellite may be behind the globe and
//            come around just as its tag opens. At most 3 stay readable
//   title    { text, sub, at, to, dec, suf, tag }  black readout plate bottom-left (text to read): text is big (Chinese
//            96 px), or give to and a number rolls from 0 to to (Unbounded 130 px, suf e.g. ' countries'); sub one line
//            56 px; tag tiny header. Use it for "covers 180 countries"
//   tag      { en, zh }  EXE tag at the viewfinder's top-left (decoration), default { en: word+'.EXE' ('GLOBE.EXE' for a
//            Chinese word), zh: Chinese for "global" }
//   close    { at, bg:'accent', word }  hard cut to the close-up at at (accent background, white dot globe, vertical big
//            word, crosshair starts searching). close.at <= at starts the whole shot in the close-up
//   lock     { at, lat, lon, label:'San Francisco', sub:'Headquarters', zoom, word:'LOCKED', color:'accent2' }
//            at: lock (crosshair tightens, box becomes TARGET LOCKED + solid indicator, bottom black bar LOCKED wipes in
//            and drifts slowly, label / sub wipe out to the right of the bar in turn); between close.at and lock.at the
//            globe turns in two moves (expoOut) to bring (lat, lon) under the crosshair. label >= 56 px (auto 56-96), sub
//            56 px; coordinates only in the small box.
//            zoom: s | true (= at+1.2) | omitted (no push). The camera pushes about 56x centred on the target and turns
//            12 deg, the black bar falls away, ending in huge full-screen dots (follow with a cut)
//            Without close, close.at = lock.at - 1.1 automatically
//   hit      false (default, calm) | true (fast pacing: 0.2 s entry, full-speed wall, crosshair jumps every frame,
//            inverted frame on lock, 0.3 s push, LOCKED drifts at 180 px/s)
//   wall     word wall speed multiplier, default 0.5 calm / 1 hit (two rows at about 280 / 600 px/s); 0 = static
//   hud      { tl, bl } | false   tiny corner HUD text
//   bg       wide-shot background, default 'bg' (off-white under the paper theme; dark background + accent dots under
//            night, switching to accent2 automatically if the accent is too dark)
//   color    dot / word wall colour, default 'accent'
//   cam      as in XM.shot
// Returns XM.shot's { L, update }, ready for XK.seq. Colours are resolved at build time, so it can be wrapped in
//   XK.tone('paper', () => ...).
// Rules: text is flat solid colour; HUD / coordinates / side readouts are decorative tiny text; only title,
//   sats[].label and lock.label / sub are meant to be read.
// -----------------------------------------------------------------------------
(() => {
  const { W, H } = XM;
  const D2R = Math.PI / 180;
  const c01 = k => k < 0 ? 0 : k > 1 ? 1 : k;

  // ---------- land mask (.js data injected on demand) ----------
  const SELF = (document.currentScript && document.currentScript.src) || '';
  const LAND_URL = SELF.replace(/[^/]*$/, '') + 'xm-assets/globe/land.js';
  let MASK = null, LOADING = null;
  function decode() {
    if (MASK || !window.XM_LAND) return;
    const { w, h, bits } = window.XM_LAND, bin = atob(bits), a = new Uint8Array(w * h);
    for (let i = 0; i < bin.length; i++) { const b = bin.charCodeAt(i), j = i * 8; for (let k = 0; k < 8 && j + k < a.length; k++) a[j + k] = (b >> (7 - k)) & 1; }
    MASK = { w, h, a };
  }
  function loadLand() {
    if (LOADING) return LOADING;
    if (window.XM_LAND) { decode(); return (LOADING = Promise.resolve()); }
    LOADING = XM.asset(new Promise(res => {
      const s = document.createElement('script'); s.src = LAND_URL;
      s.onload = () => { decode(); res(); };
      s.onerror = () => { console.error('XM.globe: failed to load land data: ' + LAND_URL); res(); };
      document.head.appendChild(s);
    }));
    return LOADING;
  }
  function land(lat, lon) {                      // bilinear 0..1
    if (!MASK) return 0;
    const { w, h, a } = MASK;
    let x = (lon + 180) / 360 * w - .5, y = (90 - lat) / 180 * h - .5;
    x = ((x % w) + w) % w; y = clamp(y, 0, h - 1.001);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = (x0 + 1) % w, fx = x - x0, fy = y - y0;
    return (a[y0 * w + x0] * (1 - fx) + a[y0 * w + x1] * fx) * (1 - fy) + (a[(y0 + 1) * w + x0] * (1 - fx) + a[(y0 + 1) * w + x1] * fx) * fy;
  }

  // ---------- colours (resolved at build time) ----------
  const CC = document.createElement('canvas').getContext('2d');
  function rgbOf(c) {
    const s = XK.col(c) || c || '#000'; CC.fillStyle = '#000'; CC.fillStyle = s; const v = CC.fillStyle;
    if (v[0] === '#') return [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16));
    const m = v.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]];
  }
  const hex = c => '#' + rgbOf(c).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const lum = c => rgbOf(c).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const rgba = (c, a) => { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };
  const LIGHT = '#ECECE9', DARK = '#0D0F13';

  // ---------- rotation: screen (x right, y up, z toward viewer) -> globe coords; view centre = (lat, lon) ----------
  const mul3 = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const Rx = a => { a *= D2R; const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
  const Ry = b => { b *= D2R; const c = Math.cos(b), s = Math.sin(b); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
  const Rz = r => { r *= D2R; const c = Math.cos(r), s = Math.sin(r); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
  function toZ(p) {                               // minimal rotation taking unit vector p to (0,0,1) (Rodrigues)
    const s = Math.hypot(p[0], p[1]); if (s < 1e-9) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const k = [p[1] / s, -p[0] / s, 0], c = p[2];
    const K = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]];
    return [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? c : 0) + s * K[i][j] + (1 - c) * k[i] * k[j]));
  }
  // with anchor: (lat, lon) lands on the screen point anchor (unit-sphere coords) instead of the disc centre
  const view = (lat, lon, roll, A) => { const M = mul3(mul3(Ry(lon), Rx(lat)), Rz(roll)); return A ? mul3(M, A) : M; };

  // ---------- halftone globe: screen-space square dot grid (rotated 15 deg), each grid point back-projected onto the sphere to look up land ----------
  // o: { cx, cy, R, M, k (grid spacing / R), col, oc/gc/lc (dot radius factors for ocean / graticule / land), rLand, gridW, rhoFn }
  function dots(g, o) {
    const { cx, cy, R, M } = o, s = o.k * R;
    const a = 15 * D2R, ca = Math.cos(a), sa = Math.sin(a);
    const T = g.getTransform(), IM = T.inverse();
    let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
    for (const [X0, Y0] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const X = IM.a * X0 + IM.c * Y0 + IM.e - cx, Y = IM.b * X0 + IM.d * Y0 + IM.f - cy;
      const u = (X * ca + Y * sa) / s, v = (-X * sa + Y * ca) / s;
      umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    }
    const lim = R / s + 1;
    umin = Math.max(umin, -lim); vmin = Math.max(vmin, -lim); umax = Math.min(umax, lim); vmax = Math.min(vmax, lim);
    const oc = o.oc || [0.29, 0.08, -0.055, -0.08, -0.05], gc = o.gc || [0.39, 0.046, -0.023, -0.11, 0], lc = o.lc || [0.576, 0.062, -0.042, -0.12, 0.068];
    const rL = o.rLand ?? 0.55, G = 30, hw = o.gridW ?? 1.7, minR = 0.4 / Math.hypot(T.a, T.b);
    g.fillStyle = o.col; g.beginPath();
    for (let U = Math.ceil(umin - 1); U <= Math.floor(umax + 1); U++) for (let V = Math.ceil(vmin - 1); V <= Math.floor(vmax + 1); V++) {
      const dx = s * (U * ca - V * sa), dy = s * (U * sa + V * ca);
      const nx = dx / R, ny = -dy / R, r2 = nx * nx + ny * ny;
      if (r2 >= 1) continue;
      const nz = Math.sqrt(1 - r2);
      const ex = M[0][0] * nx + M[0][1] * ny + M[0][2] * nz, ey = M[1][0] * nx + M[1][1] * ny + M[1][2] * nz, ez = M[2][0] * nx + M[2][1] * ny + M[2][2] * nz;
      const lat = Math.asin(clamp(ey, -1, 1)) / D2R, lon = Math.atan2(ex, ez) / D2R;
      let rho;
      if (land(lat, lon) > 0.5) rho = lc[0] + lc[1] * nx + lc[2] * ny + lc[3] * nz + lc[4] * nz * nz + (rL - 0.55);
      else {
        const dlat = Math.abs(((lat % G) + G * 1.5) % G - G / 2), dlon = Math.abs(((lon % G) + G * 1.5) % G - G / 2) * Math.cos(lat * D2R);
        const c = Math.min(dlat, dlon) < hw ? gc : oc;
        rho = clamp(c[0] + c[1] * nx + c[2] * ny + c[3] * nz + c[4] * nz * nz + (hash(U * 131.7 + V * 17.3) - .5) * 0.05, 0.07, 0.45);
      }
      if (o.rhoFn) rho = o.rhoFn(rho, nx, ny);
      const r = rho * s; if (r < minR) continue;
      g.moveTo(cx + dx + r, cy + dy); g.arc(cx + dx, cy + dy, r, 0, 6.2832);
    }
    g.fill();
  }

  // ---------- orbits / satellites (unit = globe radius; the lower half is in front of the globe) ----------
  const ORB = { solid: [1.1724, 0.3471, 19.53], dash: [1.3631, 0.2948, -13.7], dot: [1.6019, 0.2259, 6.9] };
  const ORBS = ['solid', 'dash', 'dot'];
  function orbPt(cx, cy, R, n, th) {
    const [a, b, ang] = ORB[n], A = ang * D2R, u = a * Math.cos(th), w = b * Math.sin(th);
    return [cx + R * (u * Math.cos(A) - w * Math.sin(A)), cy + R * (u * Math.sin(A) + w * Math.cos(A))];
  }
  // one orbit segment: parameter angle t0..t1 (radians); side +1 front half only / -1 back half / 0 all; hb highlight 0..1; k line width scale
  function drawOrbit(g, cx, cy, R, n, t0, t1, side, hb, col, k = 1) {
    const [a, b, ang] = ORB[n], A = ang * D2R;
    const ok = th => side === 0 || Math.sign(Math.sin(th)) === side;
    g.setLineDash([]); g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'butt';
    if (n === 'solid') {
      g.lineWidth = lerp(2.4, 8, hb) * k;
      const segs = side === 0 ? [[t0, t1]] : side > 0 ? [[Math.max(t0, 0), Math.min(t1, Math.PI)], [Math.max(t0, 2 * Math.PI), Math.min(t1, 3 * Math.PI)], [Math.max(t0, -2 * Math.PI), Math.min(t1, -Math.PI)]]
        : [[Math.max(t0, Math.PI), Math.min(t1, 2 * Math.PI)], [Math.max(t0, -Math.PI), Math.min(t1, 0)], [Math.max(t0, 3 * Math.PI), Math.min(t1, 4 * Math.PI)]];
      for (const [u, v] of segs) if (v > u) { g.beginPath(); g.ellipse(cx, cy, a * R, b * R, A, u, v); g.stroke(); }
    } else if (n === 'dash') {
      g.lineWidth = lerp(4.2, 8, hb) * k; const N = 30, d = 2 * Math.PI / N;          // 30 dashes, duty 0.55
      for (let j = Math.floor(t0 / d) - 1; (j + 0.17) * d < t1; j++) {
        const u = Math.max(t0, (j + 0.17) * d), v = Math.min(t1, (j + 0.72) * d);
        if (v <= u || !ok((u + v) / 2)) continue;
        g.beginPath(); g.ellipse(cx, cy, a * R, b * R, A, u, v); g.stroke();
      }
    } else {
      const N = 100, d = 2 * Math.PI / N; g.beginPath();                               // 100 dots, larger when near
      for (let j = Math.ceil(t0 / d - 0.44); (j + 0.44) * d <= t1; j++) {
        const th = (j + 0.44) * d; if (!ok(th)) continue;
        const [x, y] = orbPt(cx, cy, R, n, th), r = (3.6 + 1.0 * Math.cos(th) + 0.9 * Math.sin(th)) * lerp(1, 1.9, hb) * k;
        g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.2832);
      }
      g.fill();
    }
  }
  function corners(g, x0, y0, x1, y1, L, lw, col) {
    g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'butt'; g.setLineDash([]); g.beginPath();
    for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { g.moveTo(px, py + sy * L); g.lineTo(px, py); g.lineTo(px + sx * L, py); }
    g.stroke();
  }
  function vignette(g, k = 1) {                   // elliptical vignette: about x0.88 at the corners
    g.save(); g.translate(W / 2, H / 2); g.scale(1, H / W);
    const gr = g.createRadialGradient(0, 0, 0.75 * W / 2, 0, 0, 1.45 * W / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${.13 * k})`);
    g.fillStyle = gr; g.fillRect(-W, -W, 2 * W, 2 * W); g.restore();
  }
  const mono = (g, s, x, y, size, col, o = {}) => XM.txt(g, s, x, y, { fam: 'mono', size, w: o.w ?? 700, col, ls: o.ls ?? 0, align: o.align, alpha: o.alpha });
  const fmtN = (v, dec = 0) => { const s = v.toFixed(dec), [i, f] = s.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); };
  const isCJK = s => /[⺀-鿿]/.test(s);
  const fmtLat = v => `${Math.abs(v).toFixed(4)}°${v >= 0 ? 'N' : 'S'}`;
  const fmtLon = v => `${Math.abs(v).toFixed(4)}°${v >= 0 ? 'E' : 'W'}`;

  // beat highlight: from the latest beat tb, the three orbits in turn (1, 2, 3 frames later) thicken and turn accent for 1 frame, line width x0.45 per frame
  function beatOf(P, t) {
    if (P.beats) { let tb = null; for (const b of P.beats) if (b <= t) tb = b; return tb; }
    if (!(P.beat > 0)) return null;
    const t0 = P.at + .1; if (t < t0) return null;
    return t0 + Math.floor((t - t0) / P.beat) * P.beat;
  }
  function orbHi(P, t, i) {
    const tb = beatOf(P, t); if (tb == null) return [0, false];
    const age = (t - tb) * 30 - (i + 1);
    return age < 0 ? [0, false] : [Math.pow(0.45, age), age < 1];
  }

  // black label tag: header (tiny text) + big text; clip 0..1 wipes it open from the left
  function plate(g, x, y, P, o, clip) {
    if (clip <= 0) return;
    const pad = 22, hs = o.hs || 16, ms = o.ms || 56;
    const fam = o.fam || 'zh';
    const wm = XM.measure(g, o.measure || o.main, { fam, size: ms, w: o.mw ?? 800 }), wh = XM.measure(g, o.head, { fam: 'mono', size: hs, w: 700, ls: 1.6 });
    const ws = o.sub ? XM.measure(g, o.sub, { fam: 'zh', size: o.ss || 56, w: 600 }) : 0;
    const bw = Math.max(wm, wh + 26, ws) + pad * 2;
    const bh = pad + hs + 14 + ms * .92 + (o.sub ? 16 + (o.ss || 56) * .95 : 0) + pad * .8;
    const X = o.right ? x - bw : x, Y = o.bottom ? y - bh : y;
    g.save(); g.beginPath(); g.rect(X, Y, bw * clip, bh); g.clip();
    g.fillStyle = P.ink; g.fillRect(X, Y, bw, bh);
    g.fillStyle = P.dot; g.fillRect(X + pad, Y + pad + 2, 12, 12);
    mono(g, o.head, X + pad + 22, Y + pad + hs * .85, hs, P.paper, { ls: 1.6 });
    XM.txt(g, o.main, X + pad, Y + pad + hs + 14 + ms * .8, { fam, size: ms, w: o.mw ?? 800, col: P.paper });
    if (o.sub) XM.txt(g, o.sub, X + pad, Y + pad + hs + 14 + ms * .92 + 16 + (o.ss || 56) * .8, { fam: 'zh', size: o.ss || 56, w: 600, col: P.paper });
    g.restore();
    return [X, Y, bw, bh];
  }

  // ---------- wide shot: outlined word wall + globe + orbits + satellites + viewfinder ----------
  function wallRows(g, t, P, z) {
    if (!P.wallOn) return;
    const size = 333, ls = -4, str = P.word + ' ';
    const per = XM.measure(g, str, { fam: 'unb', size, w: 900, ls });
    g.save(); g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-W / 2, -H / 2);
    const x0 = W / 2 - W / 2 / z - 20, x1 = W / 2 + W / 2 / z + 20;
    [[255, 1226, -280], [643, 912, 600], [1030, 1226, -280]].forEach(([y, o0, v]) => {
      const o = o0 + v * P.wall * (t - P.at);
      for (let x = x0 - (((o + x0) % per) + per) % per; x < x1; x += per)
        XM.txt(g, str, x, y, { fam: 'unb', size, w: 900, ls, col: P.dot, stroke: 1.8 / z });
    });
    g.restore();
  }
  function farPhase(g, t, P) {
    const e = t - P.at;
    g.fillStyle = P.paper; g.fillRect(0, 0, W, H);
    const Rb = P.R * (0.93 + 0.07 * XM.smooth(c01(e / 1.2)));
    const kE = XM.expoOut(c01(e / P.entDur));
    const cx = 960, cy = 540 + 205 * (1 - kE), R = Rb * (1 + .18 * (1 - kE));
    wallRows(g, t, P, Rb / 448.5);
    if (e < 0) { vignette(g); return; }
    const lon = P.lon + 48 * (1 - XM.expoOut(c01(e / .45))) - P.spin * e;
    const M = view(P.view, lon, P.tilt);
    // entry ring: thin grey ring + thick accent ring
    { const u = (e - .03) / (P.entDur * 1.6);
      if (u > 0 && u < 1) { g.strokeStyle = rgba(P.ink, .85 * (1 - u)); g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy, R * (1.14 + .3 * XM.expoOut(u)), 0, 6.2832); g.stroke(); }
      const v = (e - .03) / (P.entDur * 3);
      if (v > 0 && v < 1) { g.strokeStyle = P.dot; g.lineWidth = 20 * Math.pow(1 - v, 1.4) + .5; g.beginPath(); g.arc(cx, cy, R * (1.24 + .93 * XM.expoOut(v)), 0, 6.2832); g.stroke(); } }
    const span = i => Math.PI * XM.expoOut(c01((e - .04 - i * .035) / P.orbDur));
    const C0 = [157, 177, 196].map(d => d * D2R);
    const orbit = side => { if (!P.orbits) return; ORBS.forEach((n, i) => { const s = span(i); if (s <= .001) return; const [hb, hi] = orbHi(P, t, i);
      drawOrbit(g, cx, cy, R, n, s >= Math.PI - 1e-3 ? -Math.PI : C0[i] - s, s >= Math.PI - 1e-3 ? Math.PI * 1.0001 : C0[i] + s, side, hb, hi ? P.dot : P.ink); }); };
    orbit(-1);
    g.fillStyle = P.paper; g.beginPath(); g.arc(cx, cy, R * 1.014, 0, 6.2832); g.fill();
    const sw = 1 - c01(e / (P.entDur * .5));       // first frames of entry: edge dots swell into a solid ring
    dots(g, { cx, cy, R, M, k: .027, col: P.dot, rLand: .55,
      rhoFn: sw > 0 ? (rho, nx, ny) => { const d = Math.hypot(nx, ny), k = c01((d - .68) / .11); return lerp(rho, .75, sw * k * k * (3 - 2 * k)); } : null });
    if (sw > 0) { g.save(); g.globalAlpha = sw; g.strokeStyle = P.dot; g.lineWidth = R * .2; g.beginPath(); g.arc(cx, cy, R * .9, 0, 6.2832); g.stroke(); g.restore(); }
    g.strokeStyle = P.ink; g.lineWidth = 2.8; g.beginPath(); g.arc(cx, cy, R * 1.014, 0, 6.2832); g.stroke();
    orbit(1);
    if (P.orbits) sats(g, t, P, cx, cy, R, e);
    // viewfinder + EXE tag + side readouts (decoration)
    const hb = lerp(1.073 * R, 1.45 * R, 1 - XM.expoOut(c01(e / (P.entDur * .7))));
    const bx0 = cx - hb, by0 = cy - hb;
    corners(g, bx0, by0, cx + hb, cy + hb, 51, 3, P.ink);
    if (e >= P.entDur * .5) exeTag(g, t, P, bx0 + 18, by0 + 15, e);
    if (e >= P.entDur * .7) sideText(g, t, P, lon, c01((e - P.entDur * .7) / .1) * .55 + .45);
    if (P.title) titlePlate(g, t, P);
    vignette(g);
    if (P.hud) XM.FX.hud(g, t, { tl: P.hud.tl, bl: P.hud.bl, color: P.hudCol, a: .8 });
  }
  function exeTag(g, t, P, x, y, e) {
    const v = Math.min(.998, .758 + .24 * XM.expoOut(c01((e - P.entDur * .5) / .35)));
    const s1 = P.tag.en, w1 = XM.measure(g, s1, { fam: 'mono', size: 22, w: 800, ls: 2.2 });
    const bw = w1 + 120;
    g.fillStyle = P.ink; g.fillRect(x, y, bw, 34);
    mono(g, s1, x + 12, y + 25, 22, P.paper, { w: 800, ls: 2.2 });
    mono(g, v.toFixed(3), x + 24 + w1, y + 25, 22, P.paper, { w: 800, ls: 2.2 });
    if (P.tag.zh && e >= P.entDur * .75) {
      const wz = XM.measure(g, P.tag.zh, { fam: 'zh', size: 21, w: 700 });
      g.fillStyle = P.dot; g.fillRect(x + bw, y, wz + 26, 34);
      XM.txt(g, P.tag.zh, x + bw + 13, y + 26, { fam: 'zh', size: 21, w: 700, col: P.dotInk });
    }
  }
  function sideText(g, t, P, lon, a) {
    g.save(); g.globalAlpha *= a;
    const c = P.ink, L0 = 110, R0 = W - 300;
    mono(g, 'ORBIT A / B / C', L0, 394, 15, c, { w: 800, ls: 1.8 });
    mono(g, 'HALFTONE 11PX', L0, 419, 15, c, { w: 500, ls: 1.8 });
    mono(g, 'GRID ROT 15°', L0, 444, 15, c, { w: 500, ls: 1.8 });
    g.save(); g.translate(L0 + 2, 480); g.transform(1, 0, -0.2, 1, 0, 0); XM.txt(g, P.tag.side, 0, 0, { fam: 'zh', size: 20, w: 700, col: P.dot }); g.restore();
    const spin = Math.round(1674 + 40 * Math.sin((t - P.at) * 10.5));
    const V = ['23.44°', `${spin}KM/H`, `${((-lon % 360) + 360) % 360 | 0}.${Math.floor((((-lon % 360) + 360) % 360 % 1) * 10)}°`, `${(8.107 + .042 * (t - P.at)).toFixed(3)}B`];
    ['AXIS', 'SPIN', 'LON', 'NODES', 'SYNC'].forEach((k, i) => {
      const y = 387 + i * 24.7;
      mono(g, k, R0, y, 15, c, { w: 800, ls: 1.8 });
      if (i < 4) mono(g, V[i], R0 + 74, y, 15, c, { w: 500, ls: 1.8 });
    });
    const nb = Math.min(7, 1 + Math.floor((t - P.at - P.entDur) * 7.5));
    g.fillStyle = c; for (let i = 0; i < nb; i++) g.fillRect(R0 + 74 + i * 10.6, 477, 9.2, 9.2);
    g.restore();
  }
  function sats(g, t, P, cx, cy, R, e) {
    if (e < P.entDur * .8) return;
    P.sats.forEach((s, i) => {
      const th = (s.th + s.speed * (t - s.at)) * D2R, [x, y] = orbPt(cx, cy, R, s.orbit, th);
      if (!(Math.sin(th) > 0 || Math.hypot(x - cx, y - cy) > R * 1.02)) return;
      const [a, b, ang] = ORB[s.orbit], back = -Math.sign(s.speed || 1) * 20 * D2R;
      g.strokeStyle = P.ink; g.lineWidth = 4.2; g.setLineDash([]); g.lineCap = 'round'; g.beginPath();
      g.ellipse(cx, cy, a * R, b * R, ang * D2R, Math.min(th, th + back), Math.max(th, th + back)); g.stroke(); g.lineCap = 'butt';
      const ms = 30.7 + 4.3 * Math.sin(th), mi = ms * .42;
      g.strokeStyle = P.ink; g.lineWidth = 1.8; g.strokeRect(x - ms / 2, y - ms / 2, ms, ms);
      g.fillStyle = P.ink; g.fillRect(x - mi / 2, y - mi / 2, mi, mi);
      if (s.label && t >= s.at) {
        const km = Math.round(430 + 70 * Math.sin(th * 1.3 + i));
        const o = { head: `SAT-${s.id} · ${km}KM`, main: s.label };
        // measure first, choose top-right or top-left, clamp inside the safe margin
        const wb = Math.max(XM.measure(g, s.label, { fam: 'zh', size: 56, w: 800 }), XM.measure(g, o.head, { fam: 'mono', size: 16, w: 700, ls: 1.6 }) + 26) + 44;
        const hb = 22 + 16 + 14 + 56 * .92 + 22 * .8;
        let bx = x + 26; if (bx + wb > W - 110) bx = x - 26 - wb;
        bx = clamp(bx, 110, W - 110 - wb);
        const by = clamp(y - 30 - hb, 100, H - 100 - hb);
        g.strokeStyle = P.ink; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(bx < x ? bx + wb : bx, by + hb); g.stroke();
        plate(g, bx, by, P, o, XM.expoOut(c01((t - s.at) / .18)));
      }
    });
  }
  function titlePlate(g, t, P) {
    const T = P.title, u = t - T.at; if (u < 0) return;
    const num = T.to != null;
    const val = num ? fmtN(T.to * XM.expoOut(c01((u - .05) / .9)), T.dec || 0) : T.text;
    const meas = num ? fmtN(T.to, T.dec || 0) + (T.suf || '') : T.text;
    plate(g, 110, H - 110, P, { head: T.tag || 'GLOBAL / COUNT', main: val + (num ? (T.suf || '') : ''), measure: meas, fam: num ? 'unb' : 'zh', mw: num ? 900 : 800,
      ms: num ? 130 : 96, sub: T.sub, ss: 56, bottom: true, hs: 18 }, XM.expoOut(c01(u / .22)));
  }

  // ---------- close-up: accent background + vertical big word + crosshair search -> lock -> push ----------
  const CG = [1244.4, 617.3, 631.5], CA = [983, 401];     // globe in the scene (centre, radius) and crosshair anchor
  const AOFF = (() => { const nx = (CA[0] - CG[0]) / CG[2], ny = -(CA[1] - CG[1]) / CG[2]; return toZ([nx, ny, Math.sqrt(1 - nx * nx - ny * ny)]); })();
  function vWord(g, P, col, reveal) {
    g.save();
    if (reveal < 1) { g.beginPath(); g.rect(-50, 1200 - 1300 * reveal, 400, 1300 * reveal); g.clip(); }
    if (isCJK(P.cword)) {
      let y = 1150; for (const ch of P.cword) { XM.txt(g, ch, 118, y, { fam: 'zh', size: 230, w: 900, col, align: 'center' }); y -= 240; }
    } else { g.translate(211, 1168.7); g.rotate(-Math.PI / 2); XM.txt(g, P.cword, 0, 0, { fam: 'unb', size: 253.5, w: 900, col, ls: 4.4 }); }
    g.restore();
  }
  function infoBox(g, x, y, sc, P, title, l2, l3, ind, clip) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    const w1 = 37 + XM.measure(g, title, { fam: 'mono', size: 35, w: 800, ls: 3.75 }), w2 = XM.measure(g, l2, { fam: 'mono', size: 27, w: 500, ls: 2.4 }), w3 = XM.measure(g, l3, { fam: 'mono', size: 19, w: 500, ls: 1.9 });
    const bw = 21 + Math.max(w1, w2, w3) + 27;
    if (clip != null) { g.beginPath(); g.rect(0, 0, bw * clip, 139); g.clip(); }
    g.fillStyle = DARK; g.fillRect(0, 0, bw, 139);
    if (ind) { g.fillStyle = P.ind; g.fillRect(21, 24, 22, 22); } else { g.strokeStyle = LIGHT; g.lineWidth = 3; g.strokeRect(22.5, 25.5, 19, 19); }
    mono(g, title, 58, 48, 35, LIGHT, { w: 800, ls: 3.75 });
    mono(g, l2, 21, 87, 27, LIGHT, { w: 500, ls: 2.4 });
    mono(g, l3, 21, 117, 19, LIGHT, { w: 500, ls: 1.9 });
    g.restore();
  }
  function hunt(P, t) {                            // crosshair search offset: calm mode wanders smoothly at 6 Hz, hit mode jumps every frame
    const f = P.hit ? Math.floor(t * 30) : t * 6, i = Math.floor(f), k = P.hit ? 0 : XM.smooth(f - i);
    const n = s => lerp(hash(i * 7.1 + s) - .5, hash((i + 1) * 7.1 + s) - .5, k) * 2;
    return [n(1.3) * 24, n(5.7) * 18];
  }
  function closePhase(g, t, P) {
    const C = P.close.at, c = t - C, L = P.lock, u = L ? t - L.at : -1, locked = !!L && u >= 0;
    const inv = P.hit && locked && u < 1 / 30;
    const bg = inv ? DARK : P.cbg, ink = inv ? LIGHT : P.cink;
    // camera: settles 0.1 s after the cut -> slow push; pulls back 7% on lock; the push scales about 56x around the target and turns 12 deg
    const Zacq = tt => 1.015 - .035 * XM.expoOut(c01((tt - C) / .1)) + .12 * (1 - Math.exp(-Math.max(0, tt - C) / 1.2));
// pull-back after lock: hit mode snaps back 7% in 0.12 s; calm mode keeps the slow push going and shrinks 10% over a
// 1.4 s smoothstep, with continuous speed at both ends (no sudden scale-down behind the lock banner)
    let Z = !locked ? Zacq(t) : P.hit ? Zacq(L.at) * (1 - .07 * XM.expoOut(c01(u / .12))) : Zacq(t) * (1 - .10 * XM.smooth(c01(u / 1.4)));
    let phi = 0, ax = CA[0], ay = CA[1], v = -1, Zr = 1;
    if (L && L.zoom != null && t >= L.zoom) {
      v = (t - L.zoom) / P.pushDur; const w = Math.min(v, 1);
      Zr = Math.exp(Math.log(56) * Math.pow(w, 1.65) + Math.max(0, v - 1) * P.pushDur * .15); Z *= Zr;
      phi = 12.1 * Math.pow(w, 1.9); const k = XM.smooth(w); ax = lerp(CA[0], 987, k); ay = lerp(CA[1], 572, k);
    }
    const cam = new DOMMatrix().translate(ax, ay).rotate(phi).scale(Z).translate(-CA[0], -CA[1]);
    // globe orientation: target lat / lon locked under the crosshair anchor; during the search it turns in two moves (expoOut)
    let lat, lon;
    if (L) {
      const dA = Math.max(.3, L.at - C);
      const k = locked ? 1 : .62 * XM.expoOut(c01(c / (.3 * dA))) + .38 * XM.expoOut(c01((c - .5 * dA) / (.45 * dA)));
      lat = L.lat; lon = L.lon + P.swing * (1 - k);
    } else { lat = P.view; lon = P.lon - P.spin * (c + 1); }
    const M = view(lat, lon, P.tilt, AOFF);
    const [cx, cy, R] = CG;

    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const showWord = v < .08;
    g.save(); g.setTransform(cam);
    if (showWord) vWord(g, P, ink, XM.expoOut(c01((c - 1 / 30) / .12)));
    if (v < .15 && c >= 1 / 30) {
      g.save(); g.globalAlpha = v > 0 ? .3 : 1;
      mono(g, P.tag.en.replace(/^[^.]*/, '') + ' / RUNNING', 265, 207, 19, ink, { w: 800, ls: 2.1 });
      mono(g, `PID ${String(P.pid).padStart(4, '0')} · MEM 8.1B`, 265, 230, 16, ink, { w: 500, ls: 1.4 });
      g.restore();
    }
    const ok = R / 450;
    if (P.orbits) ORBS.forEach((n, i) => drawOrbit(g, cx, cy, R, n, -Math.PI, Math.PI * 1.0001, -1, orbHi(P, t, i)[0], ink, ok));
    g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R * 1.01, 0, 6.2832); g.fill();
    dots(g, { cx, cy, R, M, k: .0262, col: ink, oc: [0.29, 0.077, -0.055, -0.09, -0.04], gc: [0.36, 0.03, -0.045, 0, 0], rLand: .555 });
    g.strokeStyle = ink; g.lineWidth = 2.6; g.beginPath(); g.arc(cx, cy, R * 1.01, 0, 6.2832); g.stroke();
    if (P.orbits) {
      ORBS.forEach((n, i) => drawOrbit(g, cx, cy, R, n, -Math.PI, Math.PI * 1.0001, 1, orbHi(P, t, i)[0], ink, ok));
      P.sats.forEach(s => {
        const th = (s.th + s.speed * (t - s.at)) * D2R, [x, y] = orbPt(cx, cy, R, s.orbit, th);
        if (!(Math.sin(th) > 0 || Math.hypot(x - cx, y - cy) > R * 1.02)) return;
        const ms = (30.7 + 4.3 * Math.sin(th)) * ok * .75, mi = ms * .42;
        g.strokeStyle = ink; g.lineWidth = 1.8; g.strokeRect(x - ms / 2, y - ms / 2, ms, ms);
        g.fillStyle = ink; g.fillRect(x - mi / 2, y - mi / 2, mi, mi);
      });
    }
    g.restore();

    // viewfinder during the push (scales and rotates with the target)
    if (v >= 0 && Zr < 14) { g.save(); g.translate(ax, ay); g.rotate(phi * D2R); const h = 48 * Zr; corners(g, -h, -h, h, h, .54 * h, 4.4 * Zr, ink); g.restore(); }
    // crosshair: full-screen cross lines + centre square + dashed circle + corner brackets
    if (v < 0) {
      const [hx, hy] = locked ? [0, 0] : hunt(P, t);
      const x = CA[0] + hx, y = CA[1] + hy;
      const h = locked ? (inv ? 149 : 48 + 30 * (1 - XM.expoOut(c01(u / .15)))) : 52 + 135 * (1 - XM.expoOut(c01(c / .1))) + 4 * c01(c / .5);
      g.save(); g.strokeStyle = ink; g.fillStyle = ink;
      if (c >= 1 / 30) { g.globalAlpha = .85; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.globalAlpha = 1; g.fillRect(x - 5, y - 5, 10, 10); }
      g.globalAlpha = .6; g.lineWidth = 1.5; g.setLineDash([6, 7]); g.beginPath(); g.arc(x, y, 1.78 * h, 0, 6.2832); g.stroke(); g.setLineDash([]);
      g.globalAlpha = 1; corners(g, x - h, y - h, x + h, y + h, .54 * h, 4, ink);
      g.restore();
    }
    const tplus = `T+${Math.max(0, t - P.at).toFixed(3)}S · ZOOM ×${(Z / .98).toFixed(1)}`;
    if (!locked && c >= .1) {
      const fr = Math.floor(t * 30), l2 = `${(hash(fr * 3.1) * 89).toFixed(4)} · ${(hash(fr * 5.7 + 2) * 179).toFixed(4)}`;
      infoBox(g, CA[0] + 93 + 22 * c, CA[1] + 101 + 15 * c, 1, P, 'ACQUIRING…', l2, tplus, false, c < .2 ? XM.expoOut((c - .1) / .1) : null);
    }
    if (locked) {
      if (!P.lk) P.lk = layoutLock(P);
      // black bar LOCKED + label / sub to its right
      const y0 = P.bandY + (v > 0 ? 300 * Math.pow(Math.min(v, 1) / .5, 2.5) : 0);
      if (y0 < H) {
        const x1 = P.hit ? W : W * XM.expoOut(c01(u / .12));
        g.save(); g.beginPath(); g.rect(0, y0, x1, 234); g.clip();
        g.fillStyle = DARK; g.fillRect(0, y0, W, 234);
        const lx = 130 + Math.min(P.lk.drift * u, P.lk.maxDrift);
        XM.txt(g, P.lk.word, lx, y0 + 117 + P.lk.size * .35 + 12, { fam: 'unb', size: P.lk.size, w: 900, col: LIGHT, ls: -4 * P.lk.size / 213 });
        const ku = c01((u - .05) / .18), ks = c01((u - .2) / .18);
        if (ku > 0) { g.save(); g.beginPath(); g.rect(P.lk.lx, y0, (W - P.lk.lx) * XM.expoOut(ku), 234); g.clip();
          XM.txt(g, P.lk.label, P.lk.lx, y0 + (P.lk.sub ? 26 + P.lk.ls * .86 : 117 + P.lk.ls * .36), { fam: 'zh', size: P.lk.ls, w: 900, col: LIGHT }); g.restore(); }
        if (ks > 0 && P.lk.sub) { g.save(); g.beginPath(); g.rect(P.lk.lx, y0, (W - P.lk.lx) * XM.expoOut(ks), 234); g.clip();
          XM.txt(g, P.lk.sub, P.lk.lx, y0 + 26 + P.lk.ls * .86 + 22 + 56 * .86, { fam: 'zh', size: 56, w: 600, col: LIGHT }); g.restore(); }
        g.restore();
      }
      // TARGET LOCKED box: last coordinate digits jump into place
      if (v < .62) {
        const kk = XM.expoOut(c01(u / .15)), lonS = L.lon - (1 - kk) * .67 * Math.sign(L.lon || 1), latS = L.lat;
        const sc = P.hit ? (u < 1 / 30 ? 1.26 : u < 2 / 30 ? 1.08 : u < 3 / 30 ? 1.025 : 1) : 1 + .12 * (1 - XM.expoOut(c01(u / .15)));
        const pv = v > 0 ? XM.expoIn(c01(v / .55)) : 0;
        infoBox(g, CA[0] + 91 + 90 * pv, CA[1] + 97 + 190 * pv, sc, P, 'TARGET LOCKED', `${fmtLat(latS)} · ${fmtLon(lonS)}`, tplus, P.hit ? Math.floor(u * 30) % 3 !== 2 : true,
          v > .45 ? 1 - (v - .45) / .17 : null);
      }
    }
    vignette(g);
    if (P.hud) {
      XM.FX.hud(g, t, { tl: P.hud.tl, bl: P.hud.cbl, color: ink, a: .8 });
      if (showWord) {                               // HUD over the vertical big word switches to the background colour so it stays readable
        const Lh = XM.canvas('xm-globe-hud');
        XM.FX.hud(Lh.g, t, { tl: P.hud.tl, bl: P.hud.cbl, color: bg, a: 1 });
        Lh.g.globalCompositeOperation = 'destination-in'; Lh.g.setTransform(cam); vWord(Lh.g, P, '#000', 1);
        Lh.g.setTransform(1, 0, 0, 1, 0, 0); Lh.g.globalCompositeOperation = 'source-over';
        g.drawImage(Lh.c, 0, 0);
      }
    }
  }

// black bar layout (measured the first time it is drawn at lock, when fonts are loaded): LOCKED 213 px (Unbounded Black)
// + label to the right (56-96 px) / sub (56 px). If it does not fit, shrink LOCKED first (>= 150), then label (>= 56)
  function layoutLock(P) {
    const lock = P.lock, g = CC, hit = P.hit;
    const lw = s => XM.measure(g, lock.word || 'LOCKED', { fam: 'unb', size: s, w: 900, ls: -4 * s / 213 });
    const lbW = s => Math.max(XM.measure(g, lock.label || '', { fam: 'zh', size: s, w: 900 }), lock.sub ? XM.measure(g, lock.sub, { fam: 'zh', size: 56, w: 600 }) : 0);
    const drift = hit ? 180 : 40, maxDrift = hit ? 180 : 60, right = W - 120;
    let size = 213, ls = lock.sub ? 92 : 112;
    while (size > 150 && 130 + maxDrift + lw(size) + 60 + lbW(ls) > right) size -= 4;
    while (ls > 56 && 130 + maxDrift + lw(size) + 60 + lbW(ls) > right) ls -= 2;
    return { word: lock.word || 'LOCKED', size, ls, drift, maxDrift, label: lock.label || '', sub: lock.sub || '', lx: Math.min(right - lbW(ls), 130 + maxDrift + lw(size) + 60) };
  }

  // ---------- assembly ----------
  let UID = 0;
  function globe(o = {}) {
    loadLand();
    const at = o.at ?? 0, hit = !!o.hit;
    const word = o.word || 'WORLD';
    const paper = hex(o.bg || 'bg');
    const ink = contrast(hex('text'), paper) >= 3 ? hex('text') : (lum(paper) > .2 ? DARK : LIGHT);
    let dot = hex(o.color || 'accent');
    if (contrast(dot, paper) < 1.9) dot = contrast(hex('accent2'), paper) >= 1.9 ? hex('accent2') : ink;
    const dotInk = contrast(LIGHT, dot) > contrast(DARK, dot) ? LIGHT : DARK;
    const lock = o.lock ? { lat: 37.7749, lon: -122.4194, label: '', ...o.lock } : null;
    if (lock && lock.zoom === true) lock.zoom = lock.at + 1.2;
    if (lock && lock.zoom === false) lock.zoom = null;
    const close = o.close ? { ...o.close } : lock ? { at: lock.at - 1.1 } : null;
    const cbg = close ? hex(close.bg || 'accent') : paper;
    const sats = (o.orbits === false ? [] : (o.sats || [])).slice(0, 3).map((s, i) => ({
      orbit: s.orbit || ['dot', 'dash', 'solid'][i % 3], th: s.th ?? [150, 30, 105][i % 3], speed: s.speed ?? (i % 2 ? -10 : 10),
      id: s.id || String(i + 1).padStart(2, '0'), at: s.at ?? at + 1 + i * .8, label: s.label || '' }));
    const P = {
      at, hit, word, paper, ink, dot, dotInk, sats,
      R: o.size || 456, spin: o.spin ?? 36, tilt: o.tilt ?? 11.5, view: o.view ?? 21.6, lon: o.lon ?? 20,
      orbits: o.orbits !== false, beat: o.beat ?? .5, beats: o.beats || null,
      wall: o.wall ?? (hit ? 1 : .5), wallOn: o.wall !== 0 && o.wall !== false,
      entDur: hit ? .2 : .32, orbDur: hit ? .12 : .35, pushDur: hit ? .3 : .45, swing: o.swing ?? 100,
      title: o.title ? { ...o.title, at: o.title.at ?? at + .8 } : null,
      tag: { en: (o.tag && o.tag.en) || ((/^[\x20-\x7e]+$/.test(word) ? word : 'GLOBE') + '.EXE'), zh: o.tag && 'zh' in o.tag ? o.tag.zh : 'GLOBAL', side: (o.tag && o.tag.side) || 'EARTH · ONLINE' },
      hud: o.hud === false ? null : { tl: (o.hud && o.hud.tl) || 'FIG.05  GLOBE', bl: (o.hud && o.hud.bl) || 'ORBIT / LIVE', cbl: (o.hud && (o.hud.cbl || o.hud.bl)) || 'TARGET / ACQUIRE' },
      hudCol: hex('mute'), close, lock: lock, cbg, cink: contrast(LIGHT, cbg) >= contrast(DARK, cbg) ? LIGHT : DARK,
      cword: (close && close.word) || word, ind: hex((lock && lock.color) || 'accent2'), bandY: 742, pid: 1 + (UID++),
    };
    if (contrast(P.ind, DARK) < 3) P.ind = LIGHT;
    return XM.shot({ bg: o.bg || 'bg', stage: o.stage || 'flat', cam: o.cam }, () => (g, t) => {
      if (close && t >= close.at) closePhase(g, t, P); else farPhase(g, t, P);
    });
  }

  Object.assign(XM, { globe });
})();
