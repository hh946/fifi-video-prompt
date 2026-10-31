// XM.tex: texture layer for any shot - stage materials (paper / grid / wash), soft diagonal window light, post effects
// (edge blur, chroma fringe, vignette, screen pattern, grain) and a slow in-canvas camera push, plus small helpers for
// components (per-character reveal, clamp-to-edge blur, grounded soft shadow, gradient, focus pull, free text line).
// Requires lib.js, xk.js, xm-core.js, xm-ds.js (load after them and before all components). Canvas 2D, deterministic
// (no Math.random).
// Docs: docs/components/tex.md
//
// Texture is not a per-video style switch: any component can use it. Colours come from the design system (off-white /
// ink / the accent); text gets no shadow and no glow.
//
// Usage (the same for every component built on XM.shot - XS evidence shots, XM motion components, big type):
//   const s = XM.bigType({ ... });
//   XM.tex.use(s, { light:'window', post:'paper', push:{ to:1.05 } });     // add texture to this shot
//   XK.seq([{ shot: s, t0: T.x, drift: false }]);                           // with push, set drift: false (push does the camera move)
//
// Three parts, all optional:
//   stage : stage material replacing the flat background drawn by XM.DS.stage (only affects components that call
//           DS.stage: XS evidence, big type, the squeeze field; other components draw their own background - call
//           XM.tex.paper / grid / wash in their draw instead). The colour is always the shot's stage colour (P.bg)
//           'paper'  paper grain + optional smudges { tex:.035, stains:0..1, seed }
//           'grid'   fine grid on a dark stage + vertical scratches + mottling { grid:128, line, lw:2.4, lineBlur:.8,
//                    map:(x,y)=>[x,y], scratches:1, mottle:.18, seed }
//           'wash'   radial gradient of the stage colour: one brighter spot, darker corners (good for a full-screen accent
//                    background) { hot:[x,y], lift:.14, deep:.5 }
//   light : diagonal window light - a few very soft diagonal dark bands over the whole picture (text and subject are
//           swept by the same light, as if on the same sheet of paper).
//           'window' or { angle:-30, dark:.3, soft:45, scale:1, bands:[[position px, width px, darkening], ...], seed, drift:0 }
//           Light stages darken (multiply); dark stages get faint light bands instead (screen, strength x .35)
//   post  : post effects (screen space, before the HUD, so the HUD always stays sharp):
//           { edge:{px, r0, r1, asp} edge blur, chroma:k|{k,cx,cy} thin colour fringe at the frame edges, vig:{a, r0, pow,
//             asp} vignette, screen:{period:11.13, amp:8.5, pow:2.5, line:.1, mask} screen pattern (mask = layer kept free
//             of the pattern, a canvas or a function returning one), grain:{a, scale} grain, fringe:{k, blur, a} warm /
//             cool soft edges on both sides of bright strokes on dark backgrounds (off by default) }
//           Presets by name: 'paper' | 'deep' | 'dark' | 'web' | 'screen' (see POST), or { ...XM.tex.POST.paper, vig:{ a:.3 } }
//   push  : slow camera push (done inside the canvas: content scales, light / post / HUD do not move).
//           { to:1.05, from:1, t0, t1 (default: the whole time the shot is on screen), ease:'easeInOut', x, y (final
//           offset px), cx, cy (scale centre) }
//           or { keys:[[t, s, x, y, ease], ...] } (ease on the arriving key). s must be >= 1 (< 1 would show the edges;
//           clamped to 1)
//
// Helpers for new components:
//   XM.tex.paper / grid / wash(g, t, P, o), XM.tex.window(g, t, P, o), XM.tex.post(g, t, o)
//   XM.tex.reveal(t, t0, i, o) -> { a, blur, k }: per-character reveal of character i (start almost together, finish one
//     after another; see the function header)
//   XM.tex.blurClamp(g, src, px): full-frame blur without a transparent border (use it for every full-frame blur)
//   XM.tex.shadow(g, img, x, y, w, h, o): grounded soft shadow from the subject's silhouette; o.avoid(x, y) -> 0..1 fades it
//     where it is close to text (shadows near text should stay light)
//   XM.tex.grad(g, col, y0, y1, k): vertical gradient for big text (light top, dark bottom; off by default since text is
//     flat solid colour; k default .35, up to about .6 for a strong look)
//   XM.tex.focus(t, keys) -> px: blur amount for focus pulls in either direction, keys [[t, px, ease], ...]
//   XM.tex.text(g, t, o): a freely placed line of text, revealed per character / slid in / cut, with optional slant,
//     condensing and enlarged characters (see the function header)
(() => {
  const { W, H } = XK;
  const RAD = Math.PI / 180;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fps = () => (window.VIDEO && VIDEO.fps) || 30;
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const smooth = k => k * k * (3 - 2 * k);
  const vnoise = x => { const i = Math.floor(x), f = x - i; return lerp(hash(i), hash(i + 1), smooth(f)); };
  const rng = XM.rng;
  const EASE = {
    linear: k => k, smooth,
    easeIn: k => k * k * k, easeOut: k => 1 - Math.pow(1 - k, 3), easeInOut: k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    quadIn: k => k * k, quadOut: k => 1 - (1 - k) * (1 - k), quartOut: k => 1 - Math.pow(1 - k, 4), quintOut: k => 1 - Math.pow(1 - k, 5),
    expoOut: XM.expoOut, expoIn: XM.expoIn, expoInOut: XM.expoInOut,
  };
  const ez = e => (typeof e === 'function' ? e : EASE[e] || EASE.linear);
  const layer = (key, w = W, h = H, clear = true) => XM.canvas('tex:' + key, w, h, clear);
  const CACHED = new Map();
  function cached(key, w, h, draw) {
    if (!CACHED.has(key)) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), c); CACHED.set(key, c); }
    return CACHED.get(key);
  }
  const rgbOf = h => { const m = String(h).match(/rgba?\(([^)]+)\)/); if (m) return m[1].split(',').slice(0, 3).map(s => parseFloat(s));
    h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
  const hexOf = a => '#' + a.map(v => Math.round(cl(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const lumOf = c => { const [r, g, b] = rgbOf(c); return (r * .2126 + g * .7152 + b * .0722) / 255; };
  const shade = (c, k) => hexOf(rgbOf(c).map(v => (k >= 0 ? v + (255 - v) * k : v * (1 + k))));   // k>0 lightens, k<0 darkens

  // ---------- full-frame blur (extend the edges outward first, then blur; no semi-transparent border) ----------
  function blurClamp(q, src, px, extra = '') {
    const w = src.width, h = src.height, m = Math.max(128, Math.ceil(px * 3) + 4);
    const P = layer('blurClamp', w + 2 * m, h + 2 * m), p = P.g;
    p.imageSmoothingEnabled = false;
    p.drawImage(src, m, m);
    p.drawImage(src, 0, 0, w, 1, m, 0, w, m); p.drawImage(src, 0, h - 1, w, 1, m, h + m, w, m);
    p.drawImage(src, 0, 0, 1, h, 0, m, m, h); p.drawImage(src, w - 1, 0, 1, h, w + m, m, m, h);
    p.drawImage(src, 0, 0, 1, 1, 0, 0, m, m); p.drawImage(src, w - 1, 0, 1, 1, w + m, 0, m, m);
    p.drawImage(src, 0, h - 1, 1, 1, 0, h + m, m, m); p.drawImage(src, w - 1, h - 1, 1, 1, w + m, h + m, m, m);
    p.imageSmoothingEnabled = true;
    q.save(); q.filter = `blur(${px.toFixed(2)}px) ${extra}`.trim(); q.drawImage(P.c, -m, -m); q.restore();
  }
  const snapshot = (g, key) => { const S = layer(key, g.canvas.width, g.canvas.height); S.g.drawImage(g.canvas, 0, 0); return S.c; };

  // ---------- keyframes ----------
  function kf(t, keys, col = 1) {     // keys [[t, v..., ease]], ease on the arriving key (string or function, last element)
    const E = k => k.find((v, i) => i > 0 && (typeof v === 'function' || typeof v === 'string'));
    if (t <= keys[0][0]) return keys[0][col];
    for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) { const a = keys[i - 1], b = keys[i];
      const va = typeof a[col] === 'number' ? a[col] : 0, vb = typeof b[col] === 'number' ? b[col] : va;
      return lerp(va, vb, ez(E(b))(cl((t - a[0]) / (b[0] - a[0])))); }
    const z = keys[keys.length - 1][col]; return typeof z === 'number' ? z : 0;
  }
  const focus = (t, keys) => kf(t, keys, 1);

  // ---------- stage materials ----------
  const PAD = 260;   // extra margin outside the frame (no edges showing when pushed or tilted)
  function paperTex(seed) {
    return cached('paperTex:' + seed, 512, 512, q => {
      const d = q.createImageData(512, 512), r = rng(seed + 101);
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
        const v = 128 + (r() - .5) * 40 + (vnoise(x * .05 + y * .003) - .5) * 30;     // fine grain + horizontal fibres
        const p = (y * 512 + x) * 4; d.data[p] = d.data[p + 1] = d.data[p + 2] = v; d.data[p + 3] = 255;
      }
      q.putImageData(d, 0, 0);
    });
  }
  function stainLayer(seed) {      // smudge / fingerprint-like stains, 150-260 px each
    const w = W + 2 * PAD, h = H + 2 * PAD;
    return cached('stain:' + seed, w, h, q => {
      const r = rng(seed * 31 + 7);
      for (let s = 0; s < 9; s++) {
        const S = 260 + Math.floor(r() * 140), tile = document.createElement('canvas'); tile.width = tile.height = S;
        const tg = tile.getContext('2d'), d = tg.createImageData(S, S), ph = r() * 50, el = .55 + r() * .35;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const u = (x - S / 2) / (S / 2), v = (y - S / 2) / (S / 2) / el, rr = Math.hypot(u, v);
          const wx = vnoise(x * .031 + ph) + vnoise(y * .027 + ph * 2), wy = vnoise(y * .029 + ph * 3) + vnoise(x * .033 + ph * 4);
          const ridge = .5 + .5 * Math.sin((u + .35 * wx) * S * .55 * Math.cos(wy * 1.7) + (v + .35 * wy) * S * .55 * Math.sin(wy * 1.7 + .6) + wx * 9);
          const edge = 1 - cl((rr - .35 - .3 * vnoise(Math.atan2(v, u) * 2.5 + ph)) / .4);
          const blot = cl(.25 + 1.4 * vnoise(x * .03 + ph * 7 + vnoise(y * .035) * 3) * vnoise(y * .028 + ph * 5));
          const a = cl(edge) * (.35 + .65 * ridge) * blot * .75;
          const p = (y * S + x) * 4; d.data[p] = d.data[p + 1] = d.data[p + 2] = 70; d.data[p + 3] = Math.round(255 * cl(a));
        }
        tg.putImageData(d, 0, 0);
        q.save(); q.translate(PAD + r() * W, PAD + r() * H); q.rotate(r() * Math.PI); const sc = .8 + r() * .6; q.scale(sc, sc);
        q.filter = 'blur(2.4px)'; q.globalAlpha = .22 + r() * .2; q.drawImage(tile, -S / 2, -S / 2); q.restore();
      }
    });
  }
  // paper: stage colour + fine paper grain (overlay) + optional smudges
  function paper(g, t, P, o = {}) {
    const seed = o.seed ?? 1, A0 = g.globalAlpha;
    g.save(); g.fillStyle = P.bg; g.fillRect(-PAD, -PAD, W + 2 * PAD, H + 2 * PAD);
    const tex = o.tex ?? .035;
    if (tex > 0) { g.globalCompositeOperation = 'overlay'; g.globalAlpha = A0 * tex * (lumOf(P.bg) < .4 ? 1.6 : 1); g.fillStyle = g.createPattern(paperTex(seed), 'repeat'); g.fillRect(-PAD, -PAD, W + 2 * PAD, H + 2 * PAD); }
    if ((o.stains ?? 0) > 0) { g.globalCompositeOperation = lumOf(P.bg) < .4 ? 'screen' : 'source-over'; g.globalAlpha = A0 * o.stains * (lumOf(P.bg) < .4 ? .35 : 1); g.drawImage(stainLayer(seed), -PAD + (o.ox || 0), -PAD + (o.oy || 0)); }
    g.restore();
  }
  function scratchLayer(seed, light) {
    return cached('scratch:' + seed + ':' + light, W, H, q => {
      const r = rng(seed * 13 + 5), c = light ? '210,210,210' : '40,40,40';
      q.lineCap = 'round';
      for (let i = 0; i < 26; i++) {           // long vertical scratches, biased toward the left and right sides
        const side = r() < .5 ? r() * .3 : .7 + r() * .3, x = side * W, y0 = r() * H * .6 - 100, len = 120 + r() * 700;
        q.strokeStyle = `rgba(${c},${.12 + r() * .35})`; q.lineWidth = .8 + r() * 1.4;
        q.beginPath(); q.moveTo(x, y0); for (let y = y0; y < y0 + len; y += 18) q.lineTo(x + (vnoise(y * .01 + i * 9) - .5) * 10, y); q.stroke();
      }
      for (let i = 0; i < 70; i++) {           // short specks
        const x = r() * W, y = r() * H, l = 4 + r() * 26, a = r() * Math.PI;
        q.strokeStyle = `rgba(${c},${.08 + r() * .3})`; q.lineWidth = .6 + r();
        q.beginPath(); q.moveTo(x, y); q.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); q.stroke();
      }
    });
  }
  function mottle(seed) {
    return cached('mottle:' + seed, 480, 270, q => {
      const d = q.createImageData(480, 270), r = rng(seed + 55);
      for (let y = 0; y < 270; y++) for (let x = 0; x < 480; x++) {
        const v = 128 + (vnoise(x * .04 + vnoise(y * .05) * 4) - .5) * 70 + (r() - .5) * 50;
        const p = (y * 480 + x) * 4; d.data[p] = d.data[p + 1] = d.data[p + 2] = v; d.data[p + 3] = 255;
      }
      q.putImageData(d, 0, 0);
    });
  }
  // grid: stage colour + fine grid (spacing 128, lines about 25 levels brighter / darker than the base, slightly soft) + mottling + vertical scratches (screen space, like a film surface)
  function grid(g, t, P, o = {}) {
    const gs = o.grid ?? 128, seed = o.seed ?? 3, A0 = g.globalAlpha, dark = lumOf(P.bg) < .4;
    g.save();
    g.fillStyle = P.bg; g.fillRect(-PAD, -PAD, W + 2 * PAD, H + 2 * PAD);
    const mt = o.mottle ?? .18;
    if (mt > 0) { g.globalCompositeOperation = 'overlay'; g.globalAlpha = A0 * mt; g.drawImage(mottle(seed), -PAD, -PAD, W + 2 * PAD, H + 2 * PAD); g.globalAlpha = A0; g.globalCompositeOperation = 'source-over'; }
    g.strokeStyle = o.line ?? (dark ? 'rgba(150,150,150,.28)' : 'rgba(20,20,20,.16)'); g.lineWidth = o.lw ?? 2.4;
    if ((o.lineBlur ?? .8) > 0) g.filter = `blur(${o.lineBlur ?? .8}px)`;
    const map = o.map, ox = o.ox ?? 0, oy = o.oy ?? 0, x0 = -PAD - gs * 2, x1 = W + PAD + gs * 2, y0 = -PAD - gs * 2, y1 = H + PAD + gs * 2;
    g.beginPath();
    const seg = (ax, ay, bx, by) => { if (!map) { g.moveTo(ax, ay); g.lineTo(bx, by); return; }
      for (let i = 0; i <= 24; i++) { const [px, py] = map(lerp(ax, bx, i / 24), lerp(ay, by, i / 24)); i ? g.lineTo(px, py) : g.moveTo(px, py); } };
    for (let x = x0 + (((ox - x0) % gs) + gs) % gs; x <= x1; x += gs) seg(x, y0, x, y1);
    for (let y = y0 + (((oy - y0) % gs) + gs) % gs; y <= y1; y += gs) seg(x0, y, x1, y);
    g.stroke(); g.filter = 'none';
    const sc = o.scratches ?? 1;
    if (sc > 0) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = A0 * sc; g.drawImage(scratchLayer(seed, dark), 0, 0); }
    g.restore();
  }
  // wash: radial gradient of the stage colour (one brighter spot, darker corners), e.g. a full-screen accent background
  function wash(g, t, P, o = {}) {
    const [hx, hy] = o.hot || [W * .62, H * .36], c = P.bg;
    g.save();
    const r = g.createRadialGradient(hx, hy, 0, hx, hy, Math.hypot(W, H) * .78);
    r.addColorStop(0, shade(c, o.lift ?? .14)); r.addColorStop(.45, c); r.addColorStop(1, shade(c, -(o.deep ?? .5)));
    g.fillStyle = r; g.fillRect(-PAD, -PAD, W + 2 * PAD, H + 2 * PAD);
    g.restore();
  }

  // ---------- diagonal window light ----------
  // Defaults: bands at 150-153 deg (rising about 30 deg from bottom-left to top-right); darkest 30%; very soft edges (about 150-200 px transition); a few bands 70-300 px wide
  const WIN = { angle: -30, dark: .3, soft: 45 };
  function genBands(seed, dark, scale, D) {
    const r = rng(seed), out = []; let pos = -D + r() * 200 * scale;
    while (pos < D) { const wd = (70 + r() * 230) * scale; out.push([pos + wd / 2, wd, dark * (.55 + .45 * r())]); pos += wd + (140 + r() * 380) * scale; }
    return out;
  }
  function bandMask(o) {         // quarter-resolution band mask (white background, black bands, already feathered)
    const RES = .25, M = 760, w = Math.ceil((W + 2 * M) * RES), h = Math.ceil((H + 2 * M) * RES);
    const key = `band:${o.seed}:${o.angle}:${o.soft}:${o.scale}:${o.dark}:${JSON.stringify(o.bands || null)}`;
    const c = cached(key, w, h, q => {
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; const p = tmp.getContext('2d');
      p.fillStyle = '#fff'; p.fillRect(0, 0, w, h);
      p.scale(RES, RES); p.translate(M + W / 2, M + H / 2); p.rotate(o.angle * RAD);
      const D = Math.hypot(W, H) / 2 + M;
      for (const [pos, wd, dk] of o.bands || genBands(o.seed, o.dark, o.scale, D)) { p.fillStyle = `rgba(0,0,0,${dk})`; p.fillRect(-D * 1.6, pos - wd / 2, D * 3.2, wd); }
      q.filter = `blur(${(o.soft * RES).toFixed(2)}px)`; q.drawImage(tmp, 0, 0);
    });
    return { c, M };
  }
  function windowLight(g, t, P, o = {}) {
    o = o === true || o === 'window' ? {} : o;
    const angle = o.angle ?? WIN.angle, bo = { seed: o.seed ?? 1, angle, dark: o.dark ?? WIN.dark, soft: o.soft ?? WIN.soft, scale: o.scale ?? 1, bands: o.bands };
    const { c, M } = bandMask(bo), d = (o.drift ?? 0) * t, a = angle * RAD, dark = lumOf(P.bg) < .4;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    const x = -M - Math.sin(a) * d + (o.ox || 0), y = -M + Math.cos(a) * d + (o.oy || 0);
    if (!dark) { g.globalCompositeOperation = 'multiply'; g.drawImage(c, x, y, W + 2 * M, H + 2 * M); }
    else {     // dark stage: the same bands inverted into faint light
      const L = layer('winInv'); L.g.drawImage(c, x, y, W + 2 * M, H + 2 * M); L.g.globalCompositeOperation = 'difference'; L.g.fillStyle = '#fff'; L.g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'screen'; g.globalAlpha *= o.lift ?? .35; g.drawImage(L.c, 0, 0);
    }
    g.restore();
  }

  // ---------- post effects ----------
  function ellipseSpace(g, asp) { const s = Math.sqrt(1 + asp * asp); g.setTransform((W / 2) * s, 0, 0, ((H / 2) * s) / asp, W / 2, H / 2); }
  function radialMask(g, r0, r1, pow, asp, a = 1, color = '0,0,0') {
    g.save(); ellipseSpace(g, asp);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(r1, .001));
    for (let i = 0; i <= 16; i++) { const rho = (i / 16) * r1, k = cl((rho - r0) / Math.max(r1 - r0, 1e-3)); gr.addColorStop(i / 16, `rgba(${color},${(a * Math.pow(k, pow)).toFixed(4)})`); }
    g.fillStyle = gr; g.fillRect(-3, -3, 6, 6); g.restore();
  }
  // per-pixel post runs on a willReadFrequently CPU canvas (fewer read-backs from the main canvas, stable results)
  let _cpu = null;
  function cpuPixels(g) {
    const w = g.canvas.width, h = g.canvas.height;
    if (!_cpu || _cpu.canvas.width !== w || _cpu.canvas.height !== h) { const c = document.createElement('canvas'); c.width = w; c.height = h; _cpu = c.getContext('2d', { willReadFrequently: true }); }
    _cpu.clearRect(0, 0, w, h); _cpu.drawImage(g.canvas, 0, 0); return _cpu.getImageData(0, 0, w, h);
  }
  let _cpu2 = null;
  function cpuAlpha(c) {
    const w = c.width, h = c.height;
    if (!_cpu2 || _cpu2.canvas.width !== w || _cpu2.canvas.height !== h) { const k = document.createElement('canvas'); k.width = w; k.height = h; _cpu2 = k.getContext('2d', { willReadFrequently: true }); }
    _cpu2.clearRect(0, 0, w, h); _cpu2.drawImage(c, 0, 0); return _cpu2.getImageData(0, 0, w, h).data;
  }
  function cpuPut(g, img) {
    _cpu.putImageData(img, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'copy'; g.filter = 'none'; g.drawImage(_cpu.canvas, 0, 0); g.restore();
  }
  function boxBlur(a, w, h, r) {
    const t = new Float32Array(a.length), n = 2 * r + 1;
    for (let y = 0; y < h; y++) { let s = 0; const o = y * w; for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { t[o + x] = s / n; s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = s / n; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  }
  // warm / cool soft edges on both sides of bright strokes on dark backgrounds (10-14 px wide): R scaled up, B scaled down; only the difference is blurred and added back, the text itself stays sharp
  function fringe(g, o = {}) {
    const k = o.k ?? .0055, sig = o.blur ?? 4.5, amt = o.a ?? 1, W2 = g.canvas.width, H2 = g.canvas.height, cx = o.cx ?? W2 / 2, cy = o.cy ?? H2 / 2;
    const img = cpuPixels(g), d = img.data, hw = W2 >> 1, hh = H2 >> 1;
    const sample = (ch, x, y) => { x = Math.min(W2 - 1.001, Math.max(0, x)); y = Math.min(H2 - 1.001, Math.max(0, y)); const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = (y0 * W2 + x0) * 4 + ch;
      return (d[i] * (1 - fx) + d[i + 4] * fx) * (1 - fy) + (d[i + W2 * 4] * (1 - fx) + d[i + W2 * 4 + 4] * fx) * fy; };
    const passes = Math.max(1, Math.round(1.5 * (sig / 2) * (sig / 2)));
    for (const [ch, s] of [[0, 1 + k], [2, 1 - k]]) {
      const D = new Float32Array(hw * hh);
      for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) { let acc = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const X = 2 * x + dx, Y = 2 * y + dy; acc += sample(ch, cx + (X - cx) / s, cy + (Y - cy) / s) - d[(Y * W2 + X) * 4 + ch]; }
        D[y * hw + x] = acc / 4; }
      for (let p = 0; p < passes; p++) boxBlur(D, hw, hh, 1);
      for (let Y = 0; Y < H2; Y++) for (let X = 0; X < W2; X++) {
        const fx = Math.min(hw - 1.001, Math.max(0, X / 2 - .25)), fy = Math.min(hh - 1.001, Math.max(0, Y / 2 - .25)), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, j = y0 * hw + x0;
        const v = (D[j] * (1 - ax) + D[j + 1] * ax) * (1 - ay) + (D[j + hw] * (1 - ax) + D[j + hw + 1] * ax) * ay;
        const i = (Y * W2 + X) * 4 + ch; d[i] = d[i] + amt * v;
      }
    }
    cpuPut(g, img);
  }
  // screen pattern: fine dark line grid, period 11.13 px in x and y; strength depends on brightness (strongest on mid grey, almost none on bright paper or near black)
  const SCREEN = { period: 11.13, amp: 8.5, pow: 2.5, line: .1 };
  function screenGrid(g, o = {}) {
    const W2 = g.canvas.width, H2 = g.canvas.height, per = o.period ?? SCREEN.period, amp = o.amp ?? SCREEN.amp, pw = o.pow ?? SCREEN.pow, sg = o.line ?? SCREEN.line;
    const prof = ph => { if (!sg) return -Math.cos(2 * Math.PI * ph); const d = Math.min(ph, 1 - ph); return -Math.exp(-(d / sg) * (d / sg)); };
    let mean = 0, f1 = 0; const NS = 512; for (let i = 0; i < NS; i++) { const v = prof(i / NS); mean += v / NS; f1 += (2 / NS) * v * -Math.cos((2 * Math.PI * i) / NS); }
    const cx = new Float32Array(W2), cy = new Float32Array(H2);
    for (let x = 0; x < W2; x++) cx[x] = (prof((x / per) % 1) - mean) / f1;
    for (let y = 0; y < H2; y++) cy[y] = (prof((y / per) % 1) - mean) / f1;
    const WT = new Float32Array(256); for (let v = 0; v < 256; v++) { const b = v / 255; WT[v] = amp * Math.pow(4 * b * (1 - b), pw); }
    const mk = typeof o.mask === 'function' ? o.mask() : o.mask;
    const img = cpuPixels(g), d = img.data, M = mk ? cpuAlpha(mk) : null;
    for (let y = 0, i = 0; y < H2; y++) for (let x = 0; x < W2; x++, i += 4) {
      const l = (d[i] * 54 + d[i + 1] * 183 + d[i + 2] * 19) >> 8, dv = WT[l] * (cx[x] + cy[y]) * (M ? 1 - M[i + 3] / 255 : 1);
      d[i] += dv; d[i + 1] += dv; d[i + 2] += dv;
    }
    cpuPut(g, img);
  }
  const NOISE = [];
  function noiseTile(i) {
    if (!NOISE[i]) { const c = document.createElement('canvas'); c.width = c.height = 256; const q = c.getContext('2d'), d = q.createImageData(256, 256), r = rng(977 + i);
      for (let p = 0; p < d.data.length; p += 4) { const v = 128 + (r() - .5) * 255; d.data[p] = d.data[p + 1] = d.data[p + 2] = v; d.data[p + 3] = 255; } q.putImageData(d, 0, 0); NOISE[i] = c; }
    return NOISE[i];
  }
  function grain(g, t, a = .012, scale = 1.5, blend = 'overlay') {
    const i = Math.round(t * fps()) % 8, tile = noiseTile(i);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = blend; g.globalAlpha = a;
    g.scale(scale, scale); g.fillStyle = g.createPattern(tile, 'repeat'); g.translate(hash(i) * 256, hash(i + 9) * 256); g.fillRect(-256, -256, g.canvas.width / scale + 512, g.canvas.height / scale + 512);
    g.restore();
  }
  // presets (no halo; fringe off by default)
  const POST = {
    paper: { edge: { px: 4, r0: .55, r1: 1, asp: .8 }, chroma: .0006, vig: { a: .24, r0: .35, pow: 1.3, asp: .8 }, grain: { a: .012, scale: 1.5 } },     // paper surface
    deep: { edge: { px: 5, r0: .45, r1: 1, asp: .6 }, chroma: .0006, vig: { a: .75, r0: .05, pow: 1.1, asp: .45 }, grain: { a: .015, scale: 1.5 } },     // darkened paper stack
    screen: { edge: { px: 8, r0: .42, r1: 1, asp: .6 }, chroma: .0006, vig: { a: .28, r0: .2, pow: 1, asp: .5 }, screen: { ...SCREEN }, grain: { a: .012, scale: 1.5 } },   // screen pattern
    dark: { edge: { px: 4, r0: .6, r1: 1, asp: .7 }, vig: { a: .5, r0: .3, pow: 1.3, asp: .8 }, grain: { a: .03, scale: 1.5 } },                            // dark background (vignette .5 so text in the corners stays readable)
    web: { edge: { px: 9, r0: .38, r1: .95, asp: .5 }, chroma: { k: .0011, cx: 700 }, vig: { a: .43, r0: .2, pow: 1.3, asp: .8 }, grain: { a: .012, scale: 1.5 } },   // web page
  };
  function post(g, t, o = {}) {
    if (typeof o === 'string') { if (!POST[o]) { console.error('XM.tex: no such post preset ' + o + ' (paper / deep / screen / dark / web)'); return; } o = POST[o]; }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    if (o.edge && o.edge.px > 0) {
      const E = o.edge, src = snapshot(g, 'edgeSrc'), B = layer('edge');
      blurClamp(B.g, src, E.px);
      B.g.globalCompositeOperation = 'destination-in'; radialMask(B.g, E.r0 ?? .5, E.r1 ?? 1, E.pow ?? 1, E.asp ?? .8, 1, '0,0,0');
      g.drawImage(B.c, 0, 0);
    }
    if (o.fringe && (o.fringe.a ?? 1) > 0) fringe(g, o.fringe);
    if (o.chroma) {      // thin colour fringe: R scaled up by 1+k around (cx,cy), B down by 1-k; zero at the centre, only visible at the edges (0.3-0.9 px in final renders)
      const C = typeof o.chroma === 'number' ? { k: o.chroma } : o.chroma, k = C.k, cx = C.cx ?? W / 2, cy = C.cy ?? H / 2;
      const src = snapshot(g, 'chSrc'), out = layer('chOut'), tmp = layer('chTmp', W, H, false);
      out.g.fillStyle = '#000'; out.g.fillRect(0, 0, W, H); out.g.globalCompositeOperation = 'lighter';
      for (const [col, s] of [['#f00', 1 + k], ['#0f0', 1], ['#00f', 1 - k]]) {
        tmp.g.globalCompositeOperation = 'source-over'; tmp.g.setTransform(1, 0, 0, 1, 0, 0); tmp.g.drawImage(src, 0, 0);
        if (s !== 1) { tmp.g.setTransform(s, 0, 0, s, cx * (1 - s), cy * (1 - s)); tmp.g.drawImage(src, 0, 0); tmp.g.setTransform(1, 0, 0, 1, 0, 0); }
        tmp.g.globalCompositeOperation = 'multiply'; tmp.g.fillStyle = col; tmp.g.fillRect(0, 0, W, H);
        out.g.drawImage(tmp.c, 0, 0);
      }
      g.drawImage(out.c, 0, 0);
    }
    if (o.vig && o.vig.a > 0) { const V = o.vig; radialMask(g, V.r0 ?? .3, 1, V.pow ?? 1.3, V.asp ?? .8, V.a); }
    if (o.screen) screenGrid(g, o.screen);
    if (o.grain) { const G = typeof o.grain === 'number' ? { a: o.grain } : o.grain; grain(g, t, G.a ?? .012, G.scale ?? 1.5, G.blend || 'overlay'); }
    g.restore();
  }

  // ---------- slow camera push (inside the canvas) ----------
  function pushAt(t, p, span) {
    if (!p) return null;
    let s, x, y;
    if (p.keys) { s = kf(t, p.keys, 1); x = kf(t, p.keys, 2); y = kf(t, p.keys, 3); }
    else {
      const t0 = p.t0 ?? (span ? span[0] : 0), t1 = p.t1 ?? (span ? span[1] : t0 + 4);
      const k = ez(p.ease || 'easeInOut')(cl((t - t0) / Math.max(.01, t1 - t0)));
      s = lerp(p.from ?? 1, p.to ?? 1.05, k); x = lerp(p.x0 ?? 0, p.x ?? 0, k); y = lerp(p.y0 ?? 0, p.y ?? 0, k);
    }
    s = Math.max(1, s); const mx = (s - 1) * W / 2, my = (s - 1) * H / 2;     // never show the edges
    return { s, x: cl(x, -mx, mx), y: cl(y, -my, my), cx: p.cx ?? W / 2, cy: p.cy ?? H / 2 };
  }
  function applyPush(g, c) {
    if (!c || (c.s === 1 && !c.x && !c.y)) return;
    const src = snapshot(g, 'push');
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'copy'; g.filter = 'none'; g.imageSmoothingQuality = 'high';
    g.translate(c.cx + c.x, c.cy + c.y); g.scale(c.s, c.s); g.translate(-c.cx, -c.cy); g.drawImage(src, 0, 0); g.restore();
  }

  // ---------- hook into XM.shot ----------
  // XM.shot per frame: begin (record this frame's canvas and look) -> component draw (DS.stage swaps in the material; flush before DS.hud) -> end (flush here for components that never call hud)
  let CUR = null;
  function begin(g, t, L) {
    const look = L && L.look; if (!look) { CUR = null; return; }
    CUR = { g, t, look, span: L.lookShot && L.lookShot.span, done: false };
  }
  function stageHook(g, P) {     // called by XM.DS.stage: draws the material if there is one and returns true
    if (!CUR || CUR.g !== g || !CUR.look.stage) return false;
    const S = CUR.look.stage, kind = typeof S === 'string' ? S : S.kind, o = typeof S === 'string' ? {} : S;
    const fn = { paper, grid, wash }[kind];
    if (!fn) { console.error('XM.tex: stage must be paper / grid / wash, got ' + kind); return false; }
    fn(g, CUR.t, P, o); return true;
  }
  function flush(g, P) {         // called before XM.DS.hud: push -> window light -> post (once)
    if (!CUR || CUR.g !== g || CUR.done) return;
    CUR.done = true;
    const { look, t } = CUR, Pc = P || XM.DS.tone(look.tone || 'ink');
    applyPush(g, pushAt(t, look.push, CUR.span));
    if (look.light) windowLight(g, t, look.lightOn ? XM.DS.tone(look.lightOn) : Pc, look.light);
    if (look.post) post(g, t, look.post);
  }
  function end(g) { if (CUR && CUR.g === g && !CUR.done) flush(g, null); CUR = null; }
  // add texture to a shot. shot is the return value of any component (has L)
  function use(shot, look) {
    if (!shot || !shot.L) { console.error('XM.tex.use: the first argument must be a shot returned by a component (with L)'); return shot; }
    for (const k of Object.keys(look || {})) if (!['stage', 'light', 'post', 'push', 'tone', 'lightOn'].includes(k)) console.error('XM.tex.use: unknown key ' + k + ' (stage / light / post / push)');
    shot.L.look = look; shot.L.lookShot = shot; return shot;
  }

  // ---------- helpers for components ----------
// Per-character reveal: characters appear in place (no sideways move), opacity rises as k^2, starting about 3 px blurred.
//   Characters start almost together and finish one after another, so character i starts at t0 + i*per and is fully
//   shown at t0 + first + i*gap (defaults per .03, first .1, gap .12). With dur, every character takes the same time
//   (starts per apart).
  const SWEEP = { per: .03, first: .1, gap: .12, blur: 3, ease: 'quadIn' };
  function reveal(t, t0, i, o = {}) {
    const per = o.per ?? SWEEP.per, s0 = t0 + i * per;
    const e0 = o.dur != null ? s0 + o.dur : t0 + (o.first ?? SWEEP.first) + i * (o.gap ?? SWEEP.gap);
    const k = cl((t - s0) / Math.max(.02, e0 - s0));
    if (k <= 0) return { a: 0, blur: o.blur ?? SWEEP.blur, k: 0 };
    const e = ez(o.ease || SWEEP.ease)(k);
    return { a: cl(e), blur: (o.blur ?? SWEEP.blur) * (1 - e), k };
  }
  // grounded soft shadow: the subject's silhouette squashed / sheared (shape follows the subject). avoid(x, y) -> 0..1 fades it where it is close to text (shadows near text should stay light)
  //   o: { a:.32, blur:22, sx:1, sy:.22 (vertical squash, 1 = none, i.e. just an offset soft shadow), shear:-.35 (slanted projection), dx, dy, ground (ground line y, default image bottom), avoid }
  function shadow(g, img, x, y, w, h, o = {}) {
    const S = layer('shadow'), q = S.g, gy = o.ground ?? (y + h);
    q.setTransform(g.getTransform());
    q.save(); q.filter = `brightness(0) blur(${(o.blur ?? 22).toFixed(1)}px)`;
    q.translate(x + w / 2 + (o.dx ?? 0), gy + (o.dy ?? 0)); q.transform(o.sx ?? 1, 0, o.shear ?? -.35, o.sy ?? .22, 0, 0); q.translate(-(x + w / 2), -gy);
    q.drawImage(img, x, y, w, h); q.restore(); q.setTransform(1, 0, 0, 1, 0, 0);
    if (o.avoid) {      // quarter-resolution per-pixel fade (screen space)
      const qw = W >> 2, qh = H >> 2, m = layer('shadowAvoid', qw, qh), mg = m.g, im = mg.createImageData(qw, qh);
      for (let yy = 0; yy < qh; yy++) for (let xx = 0; xx < qw; xx++) { const v = cl(o.avoid(xx * 4 + 2, yy * 4 + 2)); im.data[(yy * qw + xx) * 4 + 3] = Math.round(255 * v); }
      mg.putImageData(im, 0, 0); q.save(); q.globalCompositeOperation = 'destination-in'; q.imageSmoothingQuality = 'high'; q.drawImage(m.c, 0, 0, W, H); q.restore();
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha *= o.a ?? .32; g.drawImage(S.c, 0, 0); g.restore();
  }
  // one line of text (free placement, ignores big-type margin rules): per-character reveal / per-character slide / cut, with optional slant, condensing and enlarged characters.
  //   o: { text (required), fam:'SerifSC', w:900, size (font size px, required), squeeze:1, skew:0 (slant, tan; .2-.35 works well), ls:0 (letter spacing px),
  //        x, y (baseline), align:'left'|'center'|'right', color ('#hex', default '#111'), grad:k (vertical gradient, optional),
  //        at (start time), enter:'cut'|'sweep'|'slide', per / dur / blur (sweep defaults to SWEEP; slide defaults per .05, dur .2, blur 0),
  //        dist (slide distance px, default .3 x size), from:'left'|'right', rise (px the whole line drifts up while entering, sweep default 0),
  //        big:{ chars:'AB' or [indices...], scale:1.5 } (enlarge some characters on the same baseline), out (time it cuts out), alpha }
  //   returns { box:[x, y, w, h], xs:[left x of each character] } (for measuring / placing other things)
  const SLIDE = { per: .05, dur: .2, blur: 0, dist: .3 };
  function text(g, t, o) {
    if (!o || !o.text) { console.error('XM.tex.text: text is required, set it from the voice-over; there is no default text'); return null; }
    if (!o.size) { console.error('XM.tex.text: size (font size in px) is required'); return null; }
    const fam = o.fam || 'SerifSC', wt = o.w ?? 900, sq = o.squeeze ?? 1, sk = o.skew ?? 0, ls = o.ls || 0, chars = [...o.text], n = chars.length;
    let bigSet = new Set(); if (o.big) { const c = o.big.chars; if (Array.isArray(c)) c.forEach(i => bigSet.add(i)); else if (c) { const s0 = o.text.indexOf(c); if (s0 >= 0) for (let i = 0; i < [...c].length; i++) bigSet.add(s0 + i); } }
    const sizeOf = i => o.size * (bigSet.has(i) ? (o.big.scale ?? 1.5) : 1);
    g.save(); g.letterSpacing = '0px';
    const adv = [], asc = [], dsc = []; let tw = 0;
    for (let i = 0; i < n; i++) { g.font = `${wt} ${sizeOf(i)}px ${fam}`; const m = g.measureText(chars[i]); adv.push(m.width * sq); asc.push(m.actualBoundingBoxAscent); dsc.push(m.actualBoundingBoxDescent); tw += m.width * sq + (i < n - 1 ? ls : 0); }
    const X0 = o.x - (o.align === 'center' ? tw / 2 : o.align === 'right' ? tw : 0), Y = o.y;
    const xs = []; { let x = X0; for (let i = 0; i < n; i++) { xs.push(x); x += adv[i] + ls; } }
    const top = Y - Math.max(...asc), bot = Y + Math.max(...dsc);
    XM.note(fam, o.text);
    if (o.out != null && t >= o.out) { g.restore(); return { box: [X0, top, tw, bot - top], xs }; }
    const kind = o.enter || 'cut', at = o.at ?? 0;
    const D = kind === 'slide' ? { per: o.per ?? SLIDE.per, dur: o.dur ?? SLIDE.dur, blur: o.blur ?? SLIDE.blur, ease: o.ease || 'easeOut' } : { per: o.per, dur: o.dur, blur: o.blur, ease: o.ease };
    const dist = (o.dist ?? SLIDE.dist * o.size) * ((o.from || 'left') === 'left' ? -1 : 1);
    const riseK = o.rise ? EASE.easeOut(cl((t - at) / (o.riseDur ?? 1 / 3))) : 1, dy = (o.rise || 0) * (1 - riseK);
    const fill = o.grad ? grad(g, o.color || '#111', top, bot, o.grad) : (o.color || '#111');
    const A0 = g.globalAlpha * (o.alpha ?? 1);
    for (let i = 0; i < n; i++) {
      let a = 1, b = 0, dx = 0, smear = 0;
      if (kind === 'cut') { if (t < at) continue; }
      else {
        const r = reveal(t, at, i, D); if (r.a <= .002) continue; a = r.a; b = r.blur;
        if (kind === 'slide') { const e = ez(D.ease)(r.k); dx = dist * (1 - e); const kp = cl(r.k - 1 / fps() / D.dur * .5); smear = Math.abs(dist * (ez(D.ease)(r.k) - ez(D.ease)(kp))); }
      }
      const N = smear > 1.5 ? Math.min(8, Math.ceil(smear / 2)) : 1;
      g.font = `${wt} ${sizeOf(i)}px ${fam}`; g.textBaseline = 'alphabetic'; g.fillStyle = fill; g.filter = b > .25 ? `blur(${b.toFixed(2)}px)` : 'none';
      for (let s = 0; s < N; s++) {
        const sx = N > 1 ? smear * (s / (N - 1) - .5) * Math.sign(dist || 1) : 0;
        g.globalAlpha = A0 * a / N * (N > 1 ? 1.6 : 1); if (N > 1) g.globalAlpha = Math.min(g.globalAlpha, A0 * a);
        g.save(); g.translate(xs[i] + dx + sx, Y + dy); g.transform(sq, 0, -sk, 1, 0, 0); g.fillText(chars[i], 0, 0); g.restore();
      }
    }
    g.restore();
    return { box: [X0, top, tw + sk * (Y - top), bot - top], xs };
  }
  function grad(g, col, y0, y1, k = .35) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, lumOf(col) < .5 ? shade(col, k) : shade(col, -k * .6)); gr.addColorStop(1, col);
    return gr;
  }

  XM.tex = { use, begin, end, flush, stageHook, paper, grid, wash, window: windowLight, post, POST, SCREEN, SWEEP, WIN,
    reveal, text, SLIDE, shadow, grad, focus, kf, blurClamp, ease: ez, pushAt, shade, lum: lumOf };
})();
