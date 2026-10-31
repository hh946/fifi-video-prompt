// XM core: the base of the XM motion-component library (Canvas 2D / three.js shots for explainer videos).
// Every component returns { L, update(t, kS) } and, like XS.*, is sequenced and transitioned by XK.seq.
// Provides: XM.asset / ready / image (asset loading), XM.rng and expo easings, canvas text (XM.txt / measure / font /
// scramble / typed), cached offscreen canvases (XM.canvas), small drawing helpers (XM.FX), the shot wrapper (XM.shot)
// and a shared three.js renderer (XM.gl / drawGL / studioEnv).
//
// Load order: vendor/three.min.js (r158, global THREE), lib.js, timeline.js, explainer/xk.js, explainer/xm-core.js, then the xm-*.js you use.
// Rules (see SKILL.md):
//   - Deterministic: no Math.random / Date / performance.now / requestAnimationFrame; use XM.rng(seed) / hash(n).
//   - Times are absolute seconds (from T); component motion is a pure function of t.
//   - Colours come from the XK theme ('accent' 'accent2' 'bg' 'text' 'mute' 'card' 'line' 'warn' 'ok' or '#hex'); never hard-code one brand colour.
//   - Assets (glyph data, map masks) are .js data files or loaded with Image(), never fetch (videos render from file://).
//     Register anything to wait for with XM.asset(promise); the render ready chain waits for XM.ready().
//   - Text is flat fill; glitch / chromatic split / glow belong to effects themselves, never to explanatory body text.
const XM = (() => {
  const { W, H } = XK;
  const col = c => XK.col(c);

  // ---------- Assets ----------
  const pending = [];
  const asset = p => { pending.push(p); return p; };
  const ready = () => Promise.all(pending);
  const IMG = new Map();
  function image(src) {          // returns { img, ok }; ok=false until loaded; also registered with ready
    if (IMG.has(src)) return IMG.get(src);
    const r = { img: new Image(), ok: false };
    r.img.src = src;
    asset(r.img.decode().then(() => { r.ok = true; }).catch(() => console.error('XM.image failed to load: ' + src)));
    IMG.set(src, r);
    return r;
  }

  // ---------- Deterministic random ----------
  function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const expoOut = k => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
  const expoIn = k => k <= 0 ? 0 : Math.pow(2, 10 * k - 10);
  const expoInOut = k => k <= 0 ? 0 : k >= 1 ? 1 : k < .5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2;
  const smooth = k => k * k * (3 - 2 * k);

  // ---------- Canvas text ----------
  // fam: 'zh' (Noto Sans SC, HeiSC) | 'serif' | 'grot' (Inter Tight) | 'mono' (DM Mono) | 'unb' (Unbounded, wide display face)
  // Mixed CJK / Latin: CJK characters automatically use HeiSC. Drawn characters are recorded in window.CANVAS_TEXT so the render check can find missing glyphs.
  const FAM = { zh: 'HeiSC', serif: 'SerifSC', grot: 'Grot', mono: 'Mono', unb: 'Unb' };
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  function note(fam, s) {
    window.CANVAS_TEXT = window.CANVAS_TEXT || {};
    const cur = window.CANVAS_TEXT[fam] || ''; let add = '';
    for (const ch of s) if (!/\s/.test(ch) && !cur.includes(ch) && !add.includes(ch)) add += ch;
    if (add) window.CANVAS_TEXT[fam] = cur + add;
  }
  function font(g, fam, size, w = 700, ls = 0) { g.font = `${w} ${size}px ${FAM[fam] || fam}`; g.letterSpacing = ls + 'px'; }
  function runs(s, fam) {
    const out = [];
    for (const ch of s) { const z = fam !== 'zh' && fam !== 'serif' && CJK.test(ch); if (out.length && out[out.length - 1].z === z) out[out.length - 1].s += ch; else out.push({ z, s: ch }); }
    return out;
  }
  function measure(g, s, o = {}) {
    const fam = o.fam || 'zh', size = o.size || 48, w = o.w ?? 700, ls = o.ls || 0;
    let tot = 0;
    for (const r of runs(s, fam)) { font(g, r.z ? 'zh' : fam, size, r.z ? Math.min(900, o.zhW ?? w) : w, ls); tot += g.measureText(r.s).width; }
    g.letterSpacing = '0px';
    return tot;
  }
  // o: { fam, size, w, col, align:'left'|'center'|'right', base, ls, stroke (line width), alpha, zhW }
  function txt(g, s, x, y, o = {}) {
    if (!s) return 0;
    const fam = o.fam || 'zh', size = o.size || 48, w = o.w ?? 700, ls = o.ls || 0;
    const total = measure(g, s, o);
    g.save();
    if (o.alpha != null) g.globalAlpha *= o.alpha;
    g.textBaseline = o.base || 'alphabetic'; g.textAlign = 'left';
    const c = col(o.col || 'text'); g.fillStyle = c; g.strokeStyle = c;
    if (o.stroke) { g.lineWidth = o.stroke; g.lineJoin = 'round'; }
    let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    for (const r of runs(s, fam)) {
      const f = r.z ? 'zh' : fam;
      font(g, f, size, r.z ? Math.min(900, o.zhW ?? w) : w, ls);
      if (o.stroke) g.strokeText(r.s, cx, y); else g.fillText(r.s, cx, y);
      note(FAM[f], r.s);
      cx += g.measureText(r.s).width;
    }
    g.letterSpacing = '0px';
    g.restore();
    return total;
  }
  // Scramble decode: from at, over dur seconds, characters lock left to right; unlocked ones change to a random glyph every 2 frames
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';
  function scramble(s, t, at, dur = .5, seed = 1) {
    if (t < at) return '';
    const k = Math.min(1, (t - at) / dur), n = s.length, fixed = Math.floor(k * n), f = Math.floor(t * 15);
    let out = s.slice(0, fixed);
    for (let i = fixed; i < Math.min(n, fixed + 6); i++) out += s[i] === ' ' ? ' ' : GLYPHS[Math.floor(hash(seed * 31 + i * 7 + f) * GLYPHS.length)];
    return out;
  }
  // Typing: one character every per seconds from at; returns the typed part
  const typed = (s, t, at, per = .04) => t < at ? '' : [...s].slice(0, Math.floor((t - at) / per) + 1).join('');

  // ---------- Offscreen canvases (cached by key, reused every frame; clear=false keeps content, for textures drawn once) ----------
  const LAYERS = new Map();
  function canvas(key, w = W, h = H, clear = true) {
    let L = LAYERS.get(key);
    if (!L || L.c.width !== w || L.c.height !== h) { const c = document.createElement('canvas'); c.width = w; c.height = h; L = { c, g: c.getContext('2d'), fresh: true }; LAYERS.set(key, L); }
    else L.fresh = false;
    if (clear) { L.g.setTransform(1, 0, 0, 1, 0, 0); L.g.globalAlpha = 1; L.g.globalCompositeOperation = 'source-over'; L.g.filter = 'none'; L.g.clearRect(0, 0, w, h); }
    return L;
  }

  // ---------- Small drawing helpers ----------
  const FX = {
    // Halftone dot disc: fn(d 0..1, x, y) returns a radius multiplier (default: large in the centre, small at the edge)
    halftone(g, cx, cy, R, color, step = 22, maxr = 8, fn = null) {
      g.fillStyle = col(color); g.beginPath();
      for (let y = Math.floor((cy - R) / step) * step; y <= cy + R; y += step) for (let x = Math.floor((cx - R) / step) * step; x <= cx + R; x += step) {
        const d = Math.hypot(x - cx, y - cy) / R; if (d >= 1) continue;
        const r = maxr * (fn ? fn(d, x, y) : Math.pow(1 - d, .7)); if (r < .5) continue;
        g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.2832);
      }
      g.fill();
    },
    // Barcode (deterministic)
    barcode(g, x, y, w, h, color, seed = 1) {
      g.fillStyle = col(color); let xx = x, i = 0;
      while (xx < x + w) { const bw = 1 + Math.floor(hash(seed + i) * 4); if (i % 2 === 0) g.fillRect(xx, y, Math.min(bw * 1.5, x + w - xx), h); xx += bw * 1.5; i++; }
    },
    // Four-corner viewfinder brackets
    bracket(g, x, y, w, h, len, color, lw = 2) {
      g.strokeStyle = col(color); g.lineWidth = lw; g.beginPath();
      for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { g.moveTo(px, py + sy * len); g.lineTo(px, py); g.lineTo(px + sx * len, py); }
      g.stroke();
    },
    // Four-point star; smaller pinch = sharper points
    star4(g, x, y, r, color, pinch = .18, rot = 0) {
      g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = col(color); g.beginPath();
      g.moveTo(0, -r); g.quadraticCurveTo(r * pinch, -r * pinch, r, 0); g.quadraticCurveTo(r * pinch, r * pinch, 0, r);
      g.quadraticCurveTo(-r * pinch, r * pinch, -r, 0); g.quadraticCurveTo(-r * pinch, -r * pinch, 0, -r); g.fill(); g.restore();
    },
    // Crosshair
    cross(g, x, y, r, color, lw = 2, gap = 6) {
      g.strokeStyle = col(color); g.lineWidth = lw; g.beginPath();
      g.moveTo(x - r, y); g.lineTo(x - gap, y); g.moveTo(x + gap, y); g.lineTo(x + r, y);
      g.moveTo(x, y - r); g.lineTo(x, y - gap); g.moveTo(x, y + gap); g.lineTo(x, y + r); g.stroke();
    },
    // Top-right timecode mm:ss:ff (60 ticks per second). When a clip is part of a longer video set window.HUD_T0 in timeline.js to the clip's start time in that video, so the timecode continues instead of restarting
    timecode(t) { const tc = Math.max(0, t + (window.HUD_T0 || 0)), ss = Math.floor(tc), ff = Math.floor((tc % 1) * 60);
      return `${String(Math.floor(ss / 60)).padStart(2, '0')}:${String(ss % 60).padStart(2, '0')}:${String(ff).padStart(2, '0')}`; },
    // Four-corner HUD micro-text (adds a sense of precision; metadata only, never content to read)
    // o: { tl, tr, bl, br (strings; tr defaults to the timecode), color, a, size, inset }
    // inset defaults to 110: XK.seq's automatic drift moves / scales the shot by about 9%, which would push 40 px-from-edge text off screen; with drift:false, 40 works.
    hud(g, t, o = {}) {
      const c = o.color || 'mute', a = o.a ?? .85, s = o.size || 16, m = o.inset ?? 110, top = m * .62 + 18, bot = H - m * .62 - 8;
      g.save(); g.globalAlpha *= a;
      if (o.tl !== false) { g.fillStyle = col(c); g.beginPath(); g.arc(m + 4, top - 6, 4.5, 0, 6.3); g.fill(); txt(g, o.tl || 'FIG.01', m + 22, top, { fam: 'mono', size: s, w: 500, col: c, ls: 1.6 }); }
      if (o.tr !== false) txt(g, o.tr || FX.timecode(t), W - m, top, { fam: 'mono', size: s, w: 500, col: c, ls: 1.6, align: 'right' });
      if (o.bl) txt(g, o.bl, m, bot, { fam: 'mono', size: s, w: 500, col: c, ls: 1.6 });
      if (o.br) txt(g, o.br, W - m, bot, { fam: 'mono', size: s, w: 500, col: c, ls: 1.6, align: 'right' });
      g.restore();
    },
    // Mechanical counter (odometer): each digit rolls vertically on its own; value may be fractional
    odometer(g, value, x, y, o = {}) {
      const digits = o.digits || 3, size = o.size || 200, fam = o.fam || 'unb', w = o.w ?? 900, c = o.col || 'text';
      const cw = measure(g, '0', { fam, size, w }) * (o.squeeze || 1);
      const v = Math.max(0, value), base = Math.floor(v), frac = v - base;
      g.save(); g.beginPath(); g.rect(x - 4, y - size * .82, cw * digits + 8, size * .95); g.clip();
      for (let i = 0; i < digits; i++) {
        const p = Math.pow(10, digits - 1 - i), d = Math.floor(base / p) % 10;
        const roll = (base % p === p - 1) ? smooth(frac) : 0;            // this digit rolls along when the lower digit carries
        const yy = y - roll * size * .92;
        txt(g, String(d), x + i * cw + cw / 2, yy, { fam, size, w, col: c, align: 'center' });
        txt(g, String((d + 1) % 10), x + i * cw + cw / 2, yy + size * .92, { fam, size, w, col: c, align: 'center' });
      }
      g.restore();
      return cw * digits;
    },
    // Rows of big words behind content (solid / outline alternating, scrolling horizontally)
    // o: { word, size, y0, gap, rows, speed (px/s, sign alternates per row), solid:[bool...], color, sw, alpha }
    wordRows(g, t, o) {
      const size = o.size || 300, gap = o.gap ?? size * .92, rows = o.rows || 3, str = (o.word || 'WORD') + (o.sep ?? '  ');
      const wd = measure(g, str, { fam: o.fam || 'unb', size, w: 900, ls: -size * .03 });
      for (let r = 0; r < rows; r++) {
        const y = (o.y0 ?? 360) + r * gap, sp = (o.speed ?? 60) * (r % 2 ? -1 : 1), off = ((t * sp) % wd + wd) % wd;
        const solid = o.solid ? o.solid[r % o.solid.length] : r % 2 === 1;
        for (let x = -off - wd; x < W + wd; x += wd)
          txt(g, str, x, y, { fam: o.fam || 'unb', size, w: 900, ls: -size * .03, col: o.color || 'text', stroke: solid ? 0 : (o.sw || 3), alpha: o.alpha ?? 1 });
      }
    },
    // Speed lines (in one direction)
    speedLines(g, t, o = {}) {
      const n = o.n || 24, c = o.color || 'text', R = rng(o.seed || 7);
      g.save(); g.globalAlpha *= o.alpha ?? .5; g.fillStyle = col(c);
      for (let i = 0; i < n; i++) { const y = R() * H, len = 120 + R() * 600, sp = 1800 + R() * 2600, x = W - ((t * sp + R() * W * 2) % (W * 2 + len)); g.fillRect(x, y, len, 1 + R() * 3); }
      g.restore();
    },
    // ECG / waveform line
    ecg(g, x, y, w, t, o = {}) {
      g.save(); g.strokeStyle = col(o.color || 'text'); g.lineWidth = o.lw || 2; g.beginPath();
      const beat = o.beat || .5, amp = o.amp || 26;
      for (let i = 0; i <= w; i += 3) {
        const ph = ((i / w) * 3 - t / beat) % 1, p = (ph + 1) % 1;
        const v = p > .45 && p < .5 ? -amp * Math.sin((p - .45) / .05 * Math.PI) : p > .5 && p < .55 ? amp * .4 * Math.sin((p - .5) / .05 * Math.PI) : 0;
        if (i === 0) g.moveTo(x + i, y + v); else g.lineTo(x + i, y + v);
      }
      g.stroke(); g.restore();
    },
    // Glitch: draw src (a canvas) onto g with horizontal slices offset; seed changes every 2 frames so it jumps
    glitch(g, src, t, o = {}) {
      const R = rng((o.seed || 3) * 97 + Math.floor(t * 15)), n = o.slices || 9, amt = o.amt ?? 80;
      g.drawImage(src, 0, 0);
      for (let i = 0; i < n; i++) {
        const y = Math.floor(R() * H), h = 8 + Math.floor(R() * 90), dx = (R() - .5) * 2 * amt;
        g.drawImage(src, 0, y, W, h, dx, y, W, h);
      }
    },
    // RGB split: offset the red / blue channels of src by dx
    rgbSplit(g, src, dx = 8) {
      const L = canvas('xm-rgb');
      L.g.drawImage(src, 0, 0);
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const [c, x] of [['#ff0000', -dx], ['#00ff00', 0], ['#0000ff', dx]]) {
        const T = canvas('xm-rgb-' + c); T.g.drawImage(L.c, 0, 0); T.g.globalCompositeOperation = 'multiply'; T.g.fillStyle = c; T.g.fillRect(0, 0, W, H);
        T.g.globalCompositeOperation = 'destination-in'; T.g.drawImage(L.c, 0, 0); g.drawImage(T.c, x, 0);
      }
      g.restore();
    },
    // Radial zoom blur (tunnel / push-in feel): stack n copies of src at different scales
    zoomBlur(g, src, cx, cy, amt = .06, n = 8) {
      g.save();
      for (let i = 0; i < n; i++) { const s = 1 + amt * i / (n - 1); g.globalAlpha = 1 / (i + 1);
        g.setTransform(s, 0, 0, s, cx * (1 - s), cy * (1 - s)); g.drawImage(src, 0, 0); }
      g.restore();
    },
  };

  // ---------- Shot wrapper ----------
  // XM.shot({ bg, stage, word, svg, cam }, S => draw(g, t, kS)): makes an XK shot layer with a full-screen canvas (below the back SVG).
  // build receives S = { L, cv, g, o } and returns the per-frame draw; SVG bits (XS.stamp etc.) can go on S.L.front with their update pushed to S.after.
  function shot(o, build) {
    const L = XK.layer({ bg: o.bg || 'bg', stage: o.stage || 'flat', word: o.word, wordColor: o.wordColor });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.style.cssText = 'position:absolute;left:0;top:0;';
    L.cam.insertBefore(cv, L.back);
    const g = cv.getContext('2d');
    const S = { L, cv, g, o, after: [] };
    const draw = build(S);
    return {
      L, S,
      update(t, kS) {
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.clearRect(0, 0, W, H);
        if (XM.tex) XM.tex.begin(g, t, L);          // texture layer (xm-tex.js): active only when XM.tex.use(shot, {...}) was set
        g.save(); draw(g, t, kS); g.restore();
        if (XM.tex) XM.tex.end(g);
        for (const f of S.after) f(t, kS);
        if (o.cam) { const [fx, fy, s] = XK.camKf(o.cam, t); L.camAt(fx, fy, s); }
      },
    };
  }

  // ---------- three.js (one shared offscreen WebGL renderer, copied back into the canvas, so shots do not each need a WebGL context) ----------
  let R3 = null;
  function gl() {
    if (!R3) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      r.setPixelRatio(1); r.setSize(W, H, false); r.outputColorSpace = THREE.SRGBColorSpace;
      R3 = r;
    }
    return R3;
  }
  // Render scene into the shared canvas and draw it into g; o: { tone:true (ACES), exposure, x, y, w, h (placement), alpha }
  function drawGL(g, scene, camera, o = {}) {
    const r = gl();
    r.toneMapping = o.tone ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping; r.toneMappingExposure = o.exposure || 1;
    r.setClearColor(0x000000, 0); r.clear(); r.render(scene, camera);
    g.save(); if (o.alpha != null) g.globalAlpha *= o.alpha;
    g.drawImage(r.domElement, o.x || 0, o.y || 0, o.w || W, o.h || H); g.restore();
  }
  // Procedural studio environment (what makes chrome / glass look good): equirectangular map of horizontal light bands -> PMREM.
  // bands: [[position 0..1 (top->bottom), '#hex', intensity]]; default: white / pale violet / dark-blue horizon / accent-coloured floor
  const ENVS = new Map();
  function studioEnv(key = 'chrome', bands = null) {
    if (ENVS.has(key)) return ENVS.get(key);
    const B = bands || [[0, '#ffffff', 1.6], [.18, '#e9e4ff', 1.3], [.36, '#b9b0ff', 1.0], [.47, '#ffffff', 2.4], [.5, '#0a0d24', .2], [.58, '#05060c', .1],
      [.66, col('accent'), 1.0], [.8, '#2b2f7a', .6], [1, '#0d0f20', .3]];
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 512);
    for (const [p, h] of B) gr.addColorStop(p, h);
    x.fillStyle = gr; x.fillRect(0, 0, 1024, 512);
    for (const [p, h, k] of B) if (k > 1.5) { x.globalAlpha = .9; x.fillStyle = '#ffffff'; x.fillRect(0, p * 512 - 6, 1024, 12); }   // bright stripe = softbox
    const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(gl());
    const env = pm.fromEquirectangular(tex).texture;
    ENVS.set(key, env);
    return env;
  }

  return { W, H, col, asset, ready, image, rng, expoOut, expoIn, expoInOut, smooth, FAM, font, txt, measure, note, scramble, typed, canvas, FX, shot, gl, drawGL, studioEnv };
})();
