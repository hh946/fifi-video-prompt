// XM.popups / XM.loading: retro window barrage and loading counter. On a dotted-paper desktop, retro system windows pop
// up one after another (blue marquee -> inverted small box -> normal window), the whole desk slightly in perspective and
// slowly pushing in; every window has live content; a cursor flies in and clicks buttons. XM.loading pops a large accent
// LOADING window with an odometer counter 000 -> 99 that flips to a white "100% complete" panel.
// Docs: docs/components/popups.md
//
// How it works: each window is drawn on its own offscreen <canvas> (2x supersampled) and mapped into the shot with a CSS
//   matrix3d (four-corner homography projected from the desk plane). This uses no WebGL context, and windows are not
//   clipped when transitions / drift push them past the frame. The dotted desk is drawn each frame with the same
//   projection. Only kind:'star' uses the shared renderer XM.gl() to render a chrome star.
//
// -----------------------------------------------------------------------------
// XM.popups(o): window barrage (fits lines like "information overload", "notifications one after another", "your screen
//   fills with pop-ups", "an agent opens a pile of windows at once")
//   at      shot start (absolute s); windows without at pop one every 0.5 s starting at at+0.25
//   wins    [{ at, title, kind, data, x, y, w, h, tilt, style, out }] (later windows sit on top of earlier ones)
//     at     pop time (absolute s): 2 frames of blue marquee -> 1 frame inverted small box -> normal (frame counts fixed)
//     title  small title-bar text (decoration; monospace English looks best, Chinese works too). Default by kind:
//            MAIN.EXE / UPDATE.EXE / INSTALL.EXE ...
//     x,y    window top-left on the untilted desk in design px (1920x1080); omitted = auto-stacked into 10 built-in slots
//     w,h    window size; default by kind, widened automatically if the content does not fit
//     tilt   in-plane rotation of the window (degrees), default random +-1.5
//     style  'dark' (ink black) | 'light' (off-white) | 'accent' (accent body + black title bar) | 'lightA' (off-white
//            body + accent title bar); default by kind
//     out    close time (one inverted frame, then gone); omitted = stays
//     kind + data (text meant to be read is >= 56 px; small text is HUD decoration):
//       'big'      main window with a big word: { word (auto-shrunk to fit, max 150 px), prompt (small command line), ver,
//                  lines:[small lines], bar(0..1), barLabel }
//       'text'     notification / update: { kicker (small), text (main copy, 60 px), note (small), buttons:['Later','Update
//                  now'] (last one is the primary button), press (absolute s when the primary button is pressed) }
//       'progress' install progress: { label, files:[small paths cycling], to:100, dur:1.6 (s, expo ease-out),
//                  keys:[[t,v]] (absolute s, replaces dur) }
//       'wave'     audio waveform: { label, meta, time:[start s, total s] }
//       'chat'     assistant typing: { name (small), q (big question typed out, max two lines), a (small input box text),
//                  per:0.045 (s per character) }
//       'alert'    error dialog: { code (small), text (big, 56 px), msg (small), buttons:['Ignore','OK'], press }
//       'term'     terminal log: { lines:['...' or [address, action, info]], per:0.07 (s per line), hi (highlighted line) }
//       'counter'  rolling number: { from:2099, to:2026, dur:0.7, label (small, while rolling), done (small, when settled),
//                  note, tag }
//       'star'     chrome four-pointed star (three.js): { label, mat }
//       'scan'     halftone sphere + scan line: { label }        'radar' radar sweep: { label }
//   cursor  [[t, x, y, 'click'?] | [t, { win: index, at:'button'|'center' }, 'click'?]]: cursor flies in (ease-out between
//           points); at 'click' the cursor presses and presses the primary button of the window under it (turns accent
//           for 0.12 s). The {win} form follows perspective and push-in, so prefer it.
//   desk    'paper' (off-white dotted paper) | 'dark' (dark dotted), default 'paper'; readable under all three XK themes
//   cam     { from:{rx,ry,rz,s,x,y}, to:{...} }: desk tilt (degrees), scale and offset, eased slowly over the whole shot
//           (slow push + parallax). Default from {rx:9,ry:14,rz:-3,s:.97} -> to {rx:6,ry:9,rz:-2,s:1.02}
//   color   accent colour, default 'accent' (windows, marquee, waveform, pressed buttons)
//   hud     { tl, bl, br } tiny corner text (decoration); false = off
//
// XM.loading(o): accent LOADING window + odometer counter (fits "progress", "loading", "training to 99%", "how much is
//   left", "done")
//   at      time the window pops in (one marquee frame, one frame at 0.82x size, then full size)
//   title   big top text, typed out (>= 86 px; Chinese or English), default 'LOADING'
//   label   small status label (box to the right of the number), default 'LOADING'; wait = label shown after the last
//           key frame, default 'WAIT...'
//   sub     big bottom-left text (65 px), e.g. 'Training round 3'
//   to      final value, default 100; digit count = String(to).length, leading zeros drawn as outlines; unit, default '%'
//   keys    [[t, value]] (absolute s): piecewise ease-out; default [[at+.1,0],[at+.9,80],[at+1.5,99]]. Fast changes get
//           up / down ghosting on the last digit, slow ones roll like a real odometer
//   done    { at, text, sub, tag:'COMPLETE', cta }: at `at` the number jumps to `to`, the window flips to white with accent
//           digits, the title retypes as text and the bottom-left text becomes sub
//   glitch  false (default) | true (one hit before and after the last key frame) | { at:[t...] }: RGB slice glitch on
//           the number, 1 frame each
//   winTitle small title-bar text, default 'LOADING.EXE'; meta: three small lines at top right; pile: windows stacked
//           behind (same as popups wins, default 5 decorative windows)
//   desk / color / hud as above
//
// Pairing: follow popups with loading using tin:'cut' (same dotted desk, reads as one continuous shot); you can pass the
//   same wins to loading's pile.
// Suggested sounds: window pop pop / bloop (one per window), cursor click click, counter ratchet, stall tick, done
//   granted, glitch glitch.
(() => {
  const { W, H } = XM;
  const INK = '#06080A', PAP = '#EEECE6', D2R = Math.PI / 180, F30 = 1 / 30;
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  const isZh = s => CJK.test(s || '');
  const lum = c => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim()); if (!m) return .3; const n = parseInt(m[1], 16); return (.2126 * (n >> 16) + .7152 * ((n >> 8) & 255) + .0722 * (n & 255)) / 255; };
  const fr = lt => Math.floor(lt * 30 + 1e-6);

  // ---------------------------------------------------------------- text
  const mono = (g, s, x, y, size, col, o = {}) => XM.txt(g, s, x, y, { fam: 'mono', size, w: 500, col, ls: size * .12, zhW: 700, ...o });
  const bigO = (s, size, o = {}) => ({ fam: 'unb', size, w: 900, zhW: 800, ls: isZh(s) ? 0 : -size * .03, ...o });
  const big = (g, s, x, y, size, col, o = {}) => XM.txt(g, s, x, y, { ...bigO(s, size, o), col });
  const bigW = (g, s, size, o = {}) => XM.measure(g, s, bigO(s, size, o));
  function wrap(g, s, maxW, size) {             // Chinese wraps per character, English per word
    const toks = String(s).match(/[⺀-鿿　-〿＀-￯]|[^\s⺀-鿿　-〿＀-￯]+|\s+/g) || [];
    const out = []; let cur = '';
    for (const tk of toks) { const nx = cur + tk; if (cur && bigW(g, nx.trimEnd(), size) > maxW) { out.push(cur.trimEnd()); cur = tk.trimStart(); } else cur = nx; }
    if (cur.trim()) out.push(cur.trimEnd());
    return out;
  }

  // ---------------------------------------------------------------- perspective projection (desk plane -> screen)
  // The flat design-px desk rotates around the frame centre by rz -> tilts by rx (bottom edge closer) -> turns by ry (right side closer); focal length 1600.
  function mkProj(p) {
    const a = (p.rx || 0) * D2R, b = (p.ry || 0) * D2R, c = (p.rz || 0) * D2R, S = p.s ?? 1, FL = 1600;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    return (X, Y, Z = 0) => {
      const x = X - 960, y = Y - 540;
      const x1 = x * cc - y * sc, y1 = x * sc + y * cc;
      const y2 = y1 * ca - Z * sa, z2 = y1 * sa + Z * ca;
      const x3 = x1 * cb - z2 * sb, z3 = x1 * sb + z2 * cb;
      const k = FL / (FL - z3) * S;
      return [960 + (p.x || 0) + x3 * k, 540 + (p.y || 0) + y2 * k];
    };
  }
  const lerpPose = (A, B, k) => { const o = {}; for (const key of ['rx', 'ry', 'rz', 's', 'x', 'y']) o[key] = lerp(A[key] ?? (key === 's' ? 1 : 0), B[key] ?? (key === 's' ? 1 : 0), k); return o; };
  function sqToQuad(q) {           // unit square (0,0)(1,0)(1,1)(0,1) -> four corners
    const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g7 = (dx3 * dy2 - dx2 * dy3) / den, h8 = (dx1 * dy3 - dx3 * dy1) / den;
    return [x1 - x0 + g7 * x1, x3 - x0 + h8 * x3, x0, y1 - y0 + g7 * y1, y3 - y0 + h8 * y3, y0, g7, h8, 1];
  }
  const applyH = (M, u, v) => { const z = M[6] * u + M[7] * v + M[8]; return [(M[0] * u + M[1] * v + M[2]) / z, (M[3] * u + M[4] * v + M[5]) / z]; };
  function placeEl(el, q, w, h) {    // element w x h (CSS px) -> screen corners q
    const M = sqToQuad(q);
    const m = [M[0] / w, M[3] / w, 0, M[6] / w, M[1] / h, M[4] / h, 0, M[7] / h, 0, 0, 1, 0, M[2], M[5], 0, M[8]];
    el.style.transform = `matrix3d(${m.map(v => +v.toPrecision(10)).join(',')})`;
    return M;
  }
  function inQuad(q, x, y) {
    let s = 0;
    for (let i = 0; i < 4; i++) { const ax = q[i * 2], ay = q[i * 2 + 1], bx = q[(i * 2 + 2) % 8], by = q[(i * 2 + 3) % 8];
      const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax); if (c !== 0) { if (s && Math.sign(c) !== s) return false; s = Math.sign(c); } }
    return true;
  }
  const strokeQuad = (g, q, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[2], q[3]); g.lineTo(q[4], q[5]); g.lineTo(q[6], q[7]); g.closePath(); g.stroke(); };
  const scaleQuad = (q, s, dx = 0, dy = 0) => { const cx = (q[0] + q[2] + q[4] + q[6]) / 4, cy = (q[1] + q[3] + q[5] + q[7]) / 4; return q.map((v, i) => i % 2 ? cy + (v - cy) * s + dy : cx + (v - cx) * s + dx); };

  // ---------------------------------------------------------------- stage: dotted desk + window layer + marquee / cursor layer + vignette + HUD
  const MG = 150;                    // off-frame margin: XK.seq drift moves / scales the shot, so the edges must not show through
  function mkCanvas(w, h, css) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.style.cssText = 'position:absolute;left:0;top:0;' + (css || ''); return c; }
  function stage(S, o) {
    const dark = o.desk === 'dark';
    const D = { dark, base: dark ? '#0f1013' : '#EEECE6', dot: dark ? '#34373f' : '#111214' };
    S.L.setBg(D.base, 'flat');
    const root = document.createElement('div'); root.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;`;
    S.L.cam.insertBefore(root, S.L.back);
    const bg = mkCanvas(W + 2 * MG, H + 2 * MG, `left:${-MG}px;top:${-MG}px;`);
    const box = document.createElement('div'); box.style.cssText = 'position:absolute;left:0;top:0;';
    const fx = mkCanvas(W + 2 * MG, H + 2 * MG, `left:${-MG}px;top:${-MG}px;`);
    const vig = mkCanvas(480, 300, `left:${-MG}px;top:${-MG}px;width:${W + 2 * MG}px;height:${H + 2 * MG}px;mix-blend-mode:multiply;`);
    const hud = mkCanvas(W + 2 * MG, H + 2 * MG, `left:${-MG}px;top:${-MG}px;mix-blend-mode:difference;`);
    root.append(bg, box, fx, vig, hud);
    { // vignette (unchanged inside ellipse radius 0.72, darkened to about 0.89 at the corners), drawn once
      const g = vig.getContext('2d'), id = g.createImageData(480, 300), sx = 480 / (W + 2 * MG), sy = 300 / (H + 2 * MG);
      for (let y = 0; y < 300; y++) for (let x = 0; x < 480; x++) {
        const dx = ((x + .5) / sx - MG - W / 2) / (W / 2), dy = ((y + .5) / sy - MG - H / 2) / (H / 2), r = Math.hypot(dx, dy);
        const v = Math.round(255 * (1 - (dark ? .2 : .106) * Math.pow(clamp((r - .72) / .58, 0, 1), 1.3))), i = (y * 480 + x) * 4;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
      }
      g.putImageData(id, 0, 0);
    }
    const bgG = bg.getContext('2d'), fxG = fx.getContext('2d'), hudG = hud.getContext('2d');
    return {
      D, box, fxG,
      desk(proj) {                 // dots: spacing 31, diameter about 4.4, each projected
        const g = bgG; g.setTransform(1, 0, 0, 1, MG, MG); g.fillStyle = D.base; g.fillRect(-MG, -MG, W + 2 * MG, H + 2 * MG);
        g.fillStyle = D.dot; g.beginPath();
        const st = 31;
        for (let Y = -620; Y <= 1700; Y += st) for (let X = -900; X <= 2820; X += st) {
          const [x, y] = proj(X, Y); if (x < -MG - 4 || x > W + MG + 4 || y < -MG - 4 || y > H + MG + 4) continue;
          const [x2] = proj(X + st, Y), r = 2.2 * clamp(Math.abs(x2 - x) / st, .5, 1.6);
          g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.2832);
        }
        g.fill();
      },
      clearFx() { fxG.setTransform(1, 0, 0, 1, 0, 0); fxG.clearRect(0, 0, fx.width, fx.height); fxG.setTransform(1, 0, 0, 1, MG, MG); },
      hud(t, h) {
        hudG.setTransform(1, 0, 0, 1, 0, 0); hudG.clearRect(0, 0, hud.width, hud.height);
        if (h === false) return;
        hudG.setTransform(1, 0, 0, 1, MG, MG);
        XM.FX.hud(hudG, t, { tl: h.tl || 'SYS / WINDOWS', bl: h.bl, br: h.br, color: '#E8E6E0', a: 1, size: 16 });
      },
    };
  }

  // ---------------------------------------------------------------- window chrome (design px)
  function xIcon(g, x, y, s, col, lw = 2) {
    g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(x + lw / 2, y + lw / 2, s - lw, s - lw);
    const p = s * .26; g.beginPath(); g.moveTo(x + p, y + p); g.lineTo(x + s - p, y + s - p); g.moveTo(x + s - p, y + p); g.lineTo(x + p, y + s - p); g.stroke();
  }
  function hatch(g, x0, x1, y, col, n = 4, gap = 5.17, lw = 1.7) { if (x1 - x0 < 2) return; g.fillStyle = col; for (let i = 0; i < n; i++) g.fillRect(x0, y + i * gap, x1 - x0, lw); }
  function palette(style, A, AI, deskDark) {
    switch (style) {
      case 'dark': return { body: INK, bar: INK, barFg: PAP, fg: PAP, sub: '#A9A8A3', line: PAP, border: deskDark ? '#4a4e58' : null };
      case 'accent': return { body: A, bar: INK, barFg: PAP, fg: AI, sub: AI, line: INK, border: INK };
      case 'lightA': return { body: PAP, bar: A, barFg: AI, fg: INK, sub: '#2a2a2a', line: INK, border: INK };
      default: return { body: PAP, bar: PAP, barFg: INK, fg: INK, sub: '#2a2a2a', line: INK, border: INK };
    }
  }
  const INVERT = { dark: 'light', light: 'dark', accent: 'light', lightA: 'dark' };
  function chrome(g, w, h, P, title, spec) {
    const th = spec.th ?? 40, fs = 15.5, fg = P.barFg, ls = fs * .16;
    g.fillStyle = P.body; g.fillRect(0, 0, w, h);
    g.fillStyle = P.bar; g.fillRect(0, 0, w, th);
    xIcon(g, 12, (th - 21) / 2, 21, fg);
    const sqx = w - 52;
    g.strokeStyle = fg; g.lineWidth = 2; g.strokeRect(sqx + 1, th / 2 - 9.5, 19, 19); g.fillStyle = fg; g.fillRect(sqx + 30, th / 2 - 10.5, 20, 21);
    if (spec.align === 'center') {
      const tw = XM.measure(g, title, { fam: 'mono', size: fs, w: 500, ls, zhW: 700 }), cx = (w - 18) / 2 + 9;
      mono(g, title, cx - tw / 2, th / 2 + fs * .36, fs, fg, { ls });
      hatch(g, 43, cx - tw / 2 - 16, th / 2 - 8.3, fg); hatch(g, cx + tw / 2 + 12, sqx - 10, th / 2 - 8.3, fg);
    } else {
      const tw = mono(g, title, 44, th / 2 + fs * .36, fs, fg, { ls });
      if (spec.hatch) hatch(g, 44 + tw + 18, sqx - 10, th / 2 - 8.3, fg);
    }
    g.fillStyle = P.line; g.fillRect(0, th - 1, w, 3);
    if (P.border) { g.strokeStyle = P.border; g.lineWidth = 2.4; g.strokeRect(1.2, 1.2, w - 2.4, h - 2.4); }
  }
  function button(g, b, P, pressed, A, AI) {
    if (b.primary) { g.fillStyle = pressed ? A : P.fg; g.fillRect(b.x, b.y, b.w, b.h); mono(g, b.label, b.x + b.w / 2, b.y + b.h / 2 + 6.5, 17, pressed ? AI : P.body, { align: 'center' }); }
    else { g.strokeStyle = P.fg; g.lineWidth = 2; g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2); mono(g, b.label, b.x + b.w / 2, b.y + b.h / 2 + 6, 15.5, P.fg, { align: 'center' }); }
  }
  function layoutButtons(g, labels, w, y, h = 44) {
    const out = []; let x = w - 24;
    for (let i = labels.length - 1; i >= 0; i--) {
      const prim = i === labels.length - 1, bw = Math.max(prim ? 120 : 90, XM.measure(g, labels[i], { fam: 'mono', size: prim ? 17 : 15.5, w: 500, ls: 2, zhW: 700 }) + 40);
      x -= bw; out.unshift({ x, y: prim ? y : y + 3, w: bw, h: prim ? h : h - 6, label: labels[i], primary: prim }); x -= 14;
    }
    return out;
  }

  // ---------------------------------------------------------------- window contents (g in window coords; lt = seconds since shown normally; t absolute s)
  const KIND = {
    big: { w: 800, h: 460, style: 'dark', title: 'MAIN.EXE', align: 'center' },
    text: { w: 620, h: 250, style: 'lightA', title: 'UPDATE.EXE', align: 'left' },
    progress: { w: 600, h: 260, style: 'light', title: 'INSTALL.EXE', align: 'center' },
    wave: { w: 580, h: 250, style: 'lightA', title: 'AUDIO.WAV', align: 'left', th: 35 },
    chat: { w: 540, h: 300, style: 'light', title: 'ASSISTANT', align: 'center' },
    alert: { w: 640, h: 270, style: 'light', title: 'SYSTEM ALERT', align: 'center' },
    term: { w: 520, h: 230, style: 'dark', title: 'TERMINAL', align: 'center' },
    counter: { w: 480, h: 310, style: 'dark', title: 'COUNT.SYS', align: 'left', hatch: true },
    star: { w: 400, h: 440, style: 'dark', title: 'OBJECT.3DS', align: 'center' },
    scan: { w: 330, h: 300, style: 'dark', title: 'SCAN.JPG', align: 'center' },
    radar: { w: 300, h: 320, style: 'accent', title: 'RADAR.SYS', align: 'left' },
  };
  // layout(g, win): runs once after fonts load and before the first frame; widens the window, sets font sizes, places buttons
  const LAYOUT = {
    big(g, W_) { const d = W_.d, word = d.word ?? 'HELLO', need = bigW(g, word, 150) + 52;
      W_.w = Math.max(W_.w, Math.min(1180, need)); W_.wordSize = Math.min(d.size || 150, 150 * (W_.w - 52) / bigW(g, word, 150)); },
    text(g, W_) { const d = W_.d; W_.w = Math.max(W_.w, bigW(g, d.text || '', 60) + 56, d.buttons ? 420 : 0);
      W_.btns = d.buttons ? layoutButtons(g, d.buttons, W_.w, W_.h - 66) : []; },
    alert(g, W_) { const d = W_.d; W_.w = Math.max(W_.w, 124 + bigW(g, d.text || '', 56) + 30);
      W_.btns = layoutButtons(g, d.buttons || ['OK'], W_.w, W_.h - 62, 42); },
    chat(g, W_) { const d = W_.d; W_.lines = wrap(g, d.q || '', W_.w - 40, 56).slice(0, 2); W_.btns = []; },
    counter(g, W_) { const d = W_.d, n = String(Math.max(Math.abs(d.from ?? 2099), Math.abs(d.to ?? 2026))).length;
      W_.w = Math.max(W_.w, 50 + n * XM.measure(g, '0', { fam: 'unb', size: 134, w: 900 }) * .94); },
    progress(g, W_) { const d = W_.d; if (d.label) W_.w = Math.max(W_.w, XM.measure(g, d.label, { fam: 'zh', size: 30, w: 700 }) + 270); },
  };
  function valueAt(keys, t) {        // [[t,v]] piecewise ease-out
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) { const a = keys[i - 1], b = keys[i]; return lerp(a[1], b[1], easeOut((t - a[0]) / (b[0] - a[0]))); }
    return keys[keys.length - 1][1];
  }
  const DRAW = {
    big(g, w, h, lt, P, d, W_) {
      if (d.prompt) mono(g, d.prompt, 29, 81, 17.5, P.fg, { ls: 2.3 });
      if (d.ver) mono(g, d.ver, w - 28, 81, 13.5, P.sub, { align: 'right' });
      const word = d.word ?? 'HELLO', size = W_.wordSize, o = bigO(word, size, { ls: isZh(word) ? 2 : size * .031 }), base = 116 + size * .97, chars = [...word];
      let x = 22;
      for (let i = 0; i < chars.length; i++) {        // first / last character each flash inverted briefly (a tiny glitch, not a flash)
        const ch = chars[i], cw = XM.measure(g, ch, o), inv = (i === 0 && lt >= .5 && lt < .6) || (i === chars.length - 1 && lt >= 1.03 && lt < 1.13);
        if (inv) { g.fillStyle = P.fg; g.fillRect(x + 4, base - size * .8, cw - o.ls - 4, size * .84); }
        XM.txt(g, ch, x, base, { ...o, col: inv ? P.body : P.fg }); x += cw;
      }
      const rows = [];
      if (d.bar != null) rows.push({ bar: d.bar });
      for (const s of d.lines || []) rows.push({ s });
      let y = base + 72, last = -1;
      rows.forEach((r, i) => {
        if (lt < .23 + .07 * i) return; last = i;
        const yy = y + i * 24.5;
        if (r.bar != null) {
          const lab = '> ' + (d.barLabel || 'MODULES'), tw = mono(g, lab, 28, yy, 15.5, P.fg), on = Math.round(clamp(r.bar, 0, 1) * 16);
          for (let k = 0; k < 16; k++) { g.fillStyle = k < on ? P.fg : '#8a8984'; g.fillRect(28 + tw + 20 + k * 11.3, yy - 17, 9, 21); }
          mono(g, Math.round(r.bar * 100) + '%', 28 + tw + 20 + 16 * 11.3 + 14, yy, 15.5, P.fg);
        } else mono(g, r.s, 28, yy, 15.5, P.fg, { ls: 2 });
      });
      const cy = y + (last + 1) * 24.5;
      if (lt >= .23 + .07 * rows.length && cy < h - 12) { mono(g, '>', 28, cy, 15.5, P.fg); if (Math.floor(lt / .27) % 2 === 0) { g.fillStyle = P.fg; g.fillRect(50, cy - 16, 11, 19); } }
    },
    text(g, w, h, lt, P, d, W_, t, ctx) {
      if (d.kicker) mono(g, d.kicker, 27, 84, 14, P.fg);
      big(g, d.text || '', 25, 150, 60, P.fg);
      if (d.note) mono(g, d.note, 27, h - 30, 13.5, P.sub, { ls: 1 });
      for (const b of W_.btns) button(g, b, P, b.primary && ctx.pressed(W_, t), ctx.A, ctx.AI);
    },
    alert(g, w, h, lt, P, d, W_, t, ctx) {
      g.fillStyle = P.fg; g.fillRect(25, 62, 76, 76);
      g.fillStyle = P.body; g.fillRect(56.5, 75, 13, 32); g.beginPath(); g.arc(63, 120, 7.5, 0, 6.3); g.fill();
      if (d.code) mono(g, d.code, 124, 80, 16, P.fg);
      big(g, d.text || '', 122, 142, 56, P.fg);
      if (d.msg) mono(g, d.msg, 124, 176, 13.5, P.sub, { ls: 1.2 });
      for (const b of W_.btns) button(g, b, P, b.primary && ctx.pressed(W_, t), ctx.A, ctx.AI);
    },
    progress(g, w, h, lt, P, d, W_, t) {
      const v = d.keys ? valueAt(d.keys, t) : (d.to ?? 100) * XM.expoOut(clamp(lt / (d.dur || 1.6), 0, 1)), pct = Math.floor(v + 1e-6);
      if (d.label) { if (isZh(d.label)) XM.txt(g, d.label, 25, 84, { fam: 'zh', size: 30, w: 700, col: P.fg }); else mono(g, d.label, 25, 80.3, 17, P.fg, { ls: 2.9 }); }
      const files = d.files || ['/SYS/CORE.DLL', '/LIB/MODEL.BIN', '/USR/CONFIG.CFG', '/BIN/RUNTIME', '/ETC/HOSTS'];
      mono(g, 'COPY ' + files[Math.floor(lt / .083) % files.length], 25.5, 112, 12.4, P.sub, { ls: 2.1 });
      big(g, pct + '%', w - 25.5, 122, 69, P.fg, { align: 'right', ls: -2 });
      const n = Math.round((w - 50) / 21.5), x0 = 25, sw = (w - 50) / n, on = Math.round(pct / 100 * n);
      for (let k = 0; k < n; k++) {
        if (k < on) { g.fillStyle = P.fg; g.fillRect(x0 + k * sw, h - 61, sw - 4, 36); }
        else { g.strokeStyle = P.fg; g.lineWidth = 1.8; g.strokeRect(x0 + k * sw + .9, h - 60.1, sw - 5.8, 34.2); }
      }
    },
    wave(g, w, h, lt, P, d, W_, t, ctx) {
      const f = fr(lt), th = 35;
      g.fillStyle = P.fg; g.beginPath(); g.moveTo(23, th + 17); g.lineTo(32, th + 22); g.lineTo(23, th + 27); g.fill();
      mono(g, d.label || 'AUDIO.WAV', 45, th + 27, 14.5, P.fg);
      if (d.meta) mono(g, d.meta, w - 26, th + 31, 14, P.sub, { align: 'right', ls: .8 });
      const cy = th + 120, ph = f * .9, n = Math.floor((w - 48) / 9.45);
      g.fillStyle = ctx.A;
      for (let k = 0; k < n; k++) {
        const a = .45 + .55 * Math.abs(.55 * Math.sin(k * .43 + ph) + .45 * Math.sin(k * 1.21 - ph * .6));
        const hh = 16 + 40 * a * (.75 + .25 * hash(k * 3.7 + Math.floor(f / 2) * 61));
        g.fillRect(24 + k * 9.45, cy - hh / 2, 5, hh);
      }
      const px = 24 + ((w * .7 + lt * 165) % (w - 48));
      g.fillStyle = P.fg; g.fillRect(px, th + 50, 2.2, 101);
      const [t0, tot] = d.time || [13.4, 62], cs = t0 + lt, sec = Math.floor(cs), hu = Math.floor((cs - sec) * 100 + 1e-6);
      const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      mono(g, `${fmt(sec)}.${String(hu).padStart(2, '0')} / ${fmt(tot)}.00`, w - 26, h - 21, 13.5, P.sub, { align: 'right', ls: .3 });
    },
    chat(g, w, h, lt, P, d, W_, t, ctx) {
      mono(g, d.name || 'ASSISTANT — ONLINE', 20, 78, 13.5, P.sub);
      const nm = XM.measure(g, d.name || 'ASSISTANT — ONLINE', { fam: 'mono', size: 13.5, w: 500, ls: 13.5 * .12, zhW: 700 });
      g.fillStyle = P.fg; g.beginPath(); g.arc(20 + nm + 14, 73, 4.5, 0, 6.3); g.fill();
      const per = d.per || .045, L = W_.lines, tot = L.reduce((s, l) => s + [...l].length, 0), n = clamp(Math.floor(lt / per) + 1, 0, tot);
      let left = n, cx = 0, cyy = 0;
      L.forEach((line, i) => {
        const ch = [...line], k = clamp(left, 0, ch.length); left -= k;
        const s = ch.slice(0, k).join(''), y = 148 + i * 60;
        if (s) big(g, s, 18, y, 56, P.fg);
        if (k > 0 || i === 0) { cx = 18 + (s ? bigW(g, s, 56) : 0) + 4; cyy = y; }
      });
      if (n < tot) { g.fillStyle = ctx.A; g.fillRect(cx, cyy - 46, 24, 52); }
      g.strokeStyle = P.fg; g.lineWidth = 2; g.strokeRect(14, h - 52, w - 30, 38);
      if (d.a && n >= tot) { const ta = lt - tot * per - .15; if (ta >= 0) mono(g, '> ' + XM.typed(d.a, t, t - ta, .03), 26, h - 27, 15.5, P.fg); }
    },
    term(g, w, h, lt, P, d) {
      const lines = d.lines || ['LINK CORE.DLL ........ OK', 'SYNC CLOCK ........... OK', 'MOUNT /DEV/DATA ...... OK', 'INIT NEURAL.MESH ..... OK', 'WARN BUFFER 97%', 'LOAD SIGNAL.BIN ...... OK'];
      const per = d.per || .07, n = clamp(Math.floor(lt / per) + 2, 0, lines.length), rows = Math.floor((h - 62) / 20.3), first = Math.max(0, n - rows);
      for (let i = first; i < n; i++) {
        const y = 66 + (i - first) * 20.3, L = lines[i], hl = i === d.hi;
        if (hl) { g.fillStyle = P.fg; g.fillRect(10, y - 14, w - 46, 18); }
        const c = hl ? P.body : P.fg;
        if (Array.isArray(L)) { mono(g, L[0], 14, y, 12, c, { ls: .8 }); mono(g, L[1], 82, y, 12, c, { ls: .8 }); mono(g, L[2], 140, y, 12, c, { ls: .8, zhW: 500 }); }
        else mono(g, L, 14, y, 12, c, { ls: .8, zhW: 500 });
      }
    },
    counter(g, w, h, lt, P, d) {
      const from = d.from ?? 2099, to = d.to ?? 2026, dur = d.dur || .7, k = clamp(lt / dur, 0, 1), v = lerp(from, to, XM.expoOut(k)), done = k >= 1;
      if (done && lt > dur + .1) { g.strokeStyle = P.fg; g.lineWidth = 1.6; g.strokeRect(23, 62, 11, 11); mono(g, d.done || 'LOCKED', 45, 74, 15, P.fg); }
      else mono(g, '▸▸ ' + (d.label || 'SEEK'), 23, 74, 14, P.fg);
      const size = 134, n = String(Math.max(Math.abs(from), Math.abs(to))).length, cw = XM.measure(g, '0', { fam: 'unb', size, w: 900 }) * .94;
      g.save(); g.beginPath(); g.rect(0, 92, w, 170); g.clip();
      for (let i = 0; i < n; i++) {                   // odometer: each digit is a vertical strip that rolls (higher digits roll when all lower digits are 9)
        const p = Math.pow(10, n - 1 - i), base = Math.floor(v + 1e-9), dg = Math.floor(base / p) % 10;
        const roll = done ? 0 : (base % p === p - 1 ? XM.smooth(v - base) : 0), yy = 209 - roll * 150, cx = 22 + i * cw + cw / 2;
        XM.txt(g, String(dg), cx, yy, { fam: 'unb', size, w: 900, col: P.fg, align: 'center' });
        if (roll > 0) XM.txt(g, String((dg + 1) % 10), cx, yy + 150, { fam: 'unb', size, w: 900, col: P.fg, align: 'center' });
      }
      g.restore();
      mono(g, done ? (d.note || '= NOW') : `Δ ${Math.abs(v - to).toFixed(1)}`, 26, 290.5, 15, P.fg);
      if (d.tag) mono(g, d.tag, w - 24, 292, 15, P.fg, { align: 'right', ls: .3 });
    },
    star(g, w, h, lt, P, d, W_, t) {
      const s = Math.min(w - 70, h - 110);
      g.drawImage(renderStar(t), w / 2 - s / 2, 62, s, s);
      mono(g, d.label || 'STAR4.OBJ · 16 TRIS', 14, h - 19, 13, P.fg);
      mono(g, d.mat || 'MAT CHROME', w - 16, h - 19, 13, P.fg, { align: 'right' });
    },
    scan(g, w, h, lt, P, d, W_, t, ctx) {
      const f = fr(lt);
      mono(g, d.label || 'SCAN · 72 DPI', 14, 76, 13, P.fg);
      g.fillStyle = P.fg;
      const cx = w * .62, cy = h * .6, R = Math.min(w, h) * .36, st = 13;
      for (let y = cy - R; y <= cy + R; y += st) for (let x = cx - R; x <= cx + R; x += st) {
        const dx = (x - cx) / R, dy = (y - cy) / R, dd = dx * dx + dy * dy; if (dd > 1) continue;
        const lam = clamp(dx * .62 - dy * .42 + Math.sqrt(1 - dd) * .66, 0, 1);
        g.beginPath(); g.arc(x, y, .9 + 5.6 * Math.pow(lam, 1.6), 0, 6.3); g.fill();
      }
      g.fillStyle = ctx.A; g.fillRect(36, 100 + (f * 23) % (h - 110), w - 80, 2.4);
      mono(g, `${clamp(16 + f * 9, 3, 99)}%`, w - 16, h - 10, 12.5, P.fg, { align: 'right' });
    },
    radar(g, w, h, lt, P, d) {
      const f = fr(lt);
      mono(g, d.label || 'LOCATING', 12, 74, 12.5, P.fg);
      const cx = w / 2, cy = (h + 80) / 2, R = Math.min(w / 2 - 22, (h - 100) / 2), a0 = -.35 + f * .45;
      g.strokeStyle = P.fg; g.lineWidth = 1.6;
      for (const r of [R / 3, R * 2 / 3, R]) { g.beginPath(); g.arc(cx, cy, r, 0, 6.3); g.stroke(); }
      g.beginPath(); g.moveTo(cx - R - 12, cy); g.lineTo(cx + R + 12, cy); g.moveTo(cx, cy - R - 12); g.lineTo(cx, cy + R + 12); g.stroke();
      for (let i = 0; i < 24; i++) { const a = a0 - i * .03; g.globalAlpha = (1 - i / 24) * .9; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
      g.globalAlpha = .55; g.fillStyle = P.fg; g.fillRect(cx - R * .36, cy - R * .35, 9, 9); g.fillRect(cx + R * .54, cy - R * .67, 9, 9); g.globalAlpha = 1;
    },
  };

  // chrome four-pointed star: rendered in the bottom-left 512x512 viewport of the shared renderer, then copied out
  let STAR = null;
  function renderStar(t) {
    const R = XM.gl();
    if (!STAR) {
      const sc = new THREE.Scene(); sc.environment = XM.studioEnv();
      const Rr = 1, r = .26, dz = .3, pos = [], out = [];
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 2, rr = i % 2 ? r : Rr; out.push([Math.cos(a) * rr, Math.sin(a) * rr, 0]); }
      for (let i = 0; i < 8; i++) { const a = out[i], b = out[(i + 1) % 8]; pos.push(0, 0, dz, ...a, ...b, 0, 0, -dz, ...b, ...a); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd2d5ff, metalness: 1, roughness: .2, flatShading: true, envMapIntensity: 1.1 }));
      sc.add(mesh);
      const cam = new THREE.PerspectiveCamera(30, 1, .1, 50); cam.position.set(0, 0, 4.6);
      const cv = document.createElement('canvas'); cv.width = cv.height = 512;
      STAR = { sc, mesh, cam, cv, g: cv.getContext('2d') };
    }
    STAR.mesh.rotation.set(.25 + Math.sin(t * 2.1) * .15, t * 4.2 + 1.1, .18);
    R.setClearColor(0x000000, 0); R.setViewport(0, 0, 512, 512); R.setScissor(0, 0, 512, 512); R.setScissorTest(true); R.clear();
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.15;
    R.render(STAR.sc, STAR.cam);
    R.setScissorTest(false); R.setViewport(0, 0, W, H); R.toneMapping = THREE.NoToneMapping;
    STAR.g.clearRect(0, 0, 512, 512); STAR.g.drawImage(R.domElement, 0, H - 512, 512, 512, 0, 0, 512, 512);
    return STAR.cv;
  }

  // ---------------------------------------------------------------- cursor (arrow)
  function drawCursor(g, x, y, s = 1.55) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 46); g.lineTo(11, 35); g.lineTo(19, 53); g.lineTo(27, 49.5); g.lineTo(19, 32); g.lineTo(34, 32); g.closePath();
    g.fillStyle = PAP; g.fill(); g.lineJoin = 'round'; g.lineWidth = 3.2; g.strokeStyle = INK; g.stroke();
    g.restore();
  }

  // ---------------------------------------------------------------- window object
  const SLOTS = [[960, 470], [470, 330], [1450, 300], [1390, 770], [520, 790], [990, 230], [960, 850], [1640, 560], [300, 560], [1180, 540]];
  const KS = 2;                       // window texture supersampling
  function mkWin(spec, i, o, ctx) {
    const kind = KIND[spec.kind] ? spec.kind : 'text', K = KIND[kind];
    const W_ = { i, kind, d: spec.data || {}, at: spec.at ?? (o.at + .25 + i * .5), out: spec.out, title: spec.title || K.title,
      style: spec.style || K.style, w: spec.w || K.w, h: spec.h || K.h, x: spec.x, y: spec.y, btns: [],
      tilt: spec.tilt ?? (hash(i * 7.31 + 3) - .5) * 3, lift: 10 + i * 7 };
    W_.spec = { ...K, ...spec };
    W_.layout = g => {
      if (LAYOUT[kind]) LAYOUT[kind](g, W_);
      const [sx, sy] = SLOTS[i % SLOTS.length];
      if (W_.x == null) W_.x = sx - W_.w / 2 + (hash(i * 3.3) - .5) * 60;
      if (W_.y == null) W_.y = sy - W_.h / 2 + (hash(i * 5.7) - .5) * 40;
      W_.cv = mkCanvas(Math.ceil(W_.w * KS), Math.ceil(W_.h * KS), `width:${W_.w}px;height:${W_.h}px;transform-origin:0 0;display:none;`);
      W_.g = W_.cv.getContext('2d');
      ctx.box.appendChild(W_.cv);
    };
    W_.quad = (proj, sc = 1, lift = 0) => {
      const cx = W_.x + W_.w / 2, cy = W_.y + W_.h / 2, a = W_.tilt * D2R, ca = Math.cos(a), sa = Math.sin(a), q = [];
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lx = u * W_.w / 2 * sc, ly = v * W_.h / 2 * sc;
        q.push(...proj(cx + lx * ca - ly * sa, cy + lx * sa + ly * ca, W_.lift + lift)); }
      return q;
    };
    // state(t): 'hide' | 'marq' (marquee, frames 0-1) | 'pop' (inverted small box, frame 2) | 'live' | 'close' (the closing frame)
    W_.state = t => {
      if (W_.out != null && t >= W_.out) return t < W_.out + F30 ? 'close' : 'hide';
      const f = Math.floor((t - W_.at) * 30 + 1e-6);
      return f < 0 ? 'hide' : f < 2 ? 'marq' : f < 3 ? 'pop' : 'live';
    };
    W_.liveT = W_.at + 3 * F30;
    W_.render = (t, proj, opts = {}) => {
      const st = opts.force || W_.state(t);
      if (st === 'hide' || st === 'marq') { W_.cv.style.display = 'none'; W_.q = W_.quad(proj); return st; }
      const g = W_.g, w = W_.w, h = W_.h;
      g.setTransform(KS, 0, 0, KS, 0, 0); g.clearRect(0, 0, w, h);
      if (st === 'pop' || st === 'close') {
        chrome(g, w, h, palette(INVERT[W_.style], ctx.A, ctx.AI, ctx.dark), W_.title, W_.spec);
        W_.q = W_.quad(proj, st === 'pop' ? (opts.popScale || .85) : .94);
      } else {
        const P = palette(W_.style, ctx.A, ctx.AI, ctx.dark);
        chrome(g, w, h, P, W_.title, W_.spec);
        g.save(); DRAW[kind](g, w, h, Math.max(0, t - W_.liveT), P, W_.d, W_, t, ctx); g.restore();
        if (P.border) { g.strokeStyle = P.border; g.lineWidth = 2.4; g.strokeRect(1.2, 1.2, w - 2.4, h - 2.4); }
        W_.q = W_.quad(proj);
      }
      W_.M = placeEl(W_.cv, W_.q, w, h);
      W_.cv.style.display = 'block';
      return st;
    };
    W_.btnQuad = () => { const b = W_.btns.find(x => x.primary); if (!b || !W_.M) return null; const q = [];
      for (const [u, v] of [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]) q.push(...applyH(W_.M, u / W_.w, v / W_.h)); return q; };
    W_.point = (proj, at) => {
      const b = at !== 'center' && W_.btns.find(x => x.primary), q = W_.quad(proj), M = sqToQuad(q);
      return b ? applyH(M, (b.x + b.w * .55) / W_.w, (b.y + b.h * .6) / W_.h) : applyH(M, .5, .5);
    };
    return W_;
  }
  function marquee(g, W_, f, A) {    // blue marquee before popping: a bit larger than the window, offset slightly down-left, growing a little each frame
    strokeQuad(g, scaleQuad(W_.q, 1.08 + .03 * f, -30, 14), A, 2.6);
  }
  function colors(o) {
    const A = XK.col(o.color || 'accent'), AI = lum(A) > .55 ? INK : PAP;
    return { A, AI, dark: o.desk === 'dark' };
  }

  // ================================================================ XM.popups
  function popups(o = {}) {
    o = { at: 0, wins: [], desk: 'paper', ...o };
    const C = colors(o);
    const from = { rx: 9, ry: 14, rz: -3, s: .97, x: 0, y: 0, ...(o.cam && o.cam.from) }, to = { rx: 6, ry: 9, rz: -2, s: 1.02, x: -10, y: 0, ...(o.cam && o.cam.to) };
    return XM.shot({ bg: 'bg', stage: 'flat' }, S => {
      const ST = stage(S, o);
      const ctx = { ...C, box: ST.box, pressed: null };
      const wins = o.wins.map((w, i) => mkWin(w, i, o, ctx));
      const cur = (o.cursor || []).map(k => ({ t: k[0], p: typeof k[1] === 'object' ? k[1] : null, x: k[1], y: k[2], click: k.includes('click') }));
      let ready = false, proj = null;
      const pointOf = (k, pr) => k.p ? wins[k.p.win].point(pr, k.p.at) : [k.x, k.y];
      ctx.pressed = (W_, t) => {
        if (W_.d.press != null && t >= W_.d.press && t < W_.d.press + .12) return true;
        for (const k of cur) if (k.click && t >= k.t && t < k.t + .12) {
          const [x, y] = pointOf(k, proj);
          const top = wins.filter(w => w.state(k.t) === 'live' && inQuad(w.q, x, y)).pop();     // only the topmost window receives the click
          const bq = top === W_ && W_.btnQuad();
          if (bq && inQuad(bq, x, y)) return true;
        }
        return false;
      };
      return (g, t, kS) => {
        if (!ready) { for (const w of wins) w.layout(g); ready = true; }
        proj = mkProj(lerpPose(from, to, XM.smooth(kS ?? 0)));
        ST.desk(proj); ST.clearFx();
        for (const w of wins) w.q = w.quad(proj), w.M = sqToQuad(w.q);       // lay out corners first (needed for button hit tests)
        for (const w of wins) w.render(t, proj);
        for (const w of wins) { const f = Math.floor((t - w.at) * 30 + 1e-6); if (f >= 0 && f < 3) marquee(ST.fxG, w, f, C.A); }
        // cursor
        if (cur.length && t >= cur[0].t) {
          let i = cur.length - 1; while (i > 0 && t < cur[i].t) i--;
          const a = cur[i], b = cur[i + 1];
          let [x, y] = pointOf(a, proj);
          if (b) { const [bx, by] = pointOf(b, proj), k = 1 - Math.pow(1 - clamp((t - a.t) / (b.t - a.t), 0, 1), 3); x = lerp(x, bx, k); y = lerp(y, by, k); }
          const down = cur.some(k => k.click && t >= k.t && t < k.t + .1);
          drawCursor(ST.fxG, x, y, down ? 1.4 : 1.55);
        }
        ST.hud(t, o.hud === false ? false : { tl: `${wins.filter(w => w.state(t) === 'live').length} WINDOWS`, ...(o.hud || {}) });
      };
    });
  }

  // ================================================================ XM.loading
  const LW = 1530, LH = 799;
  function loading(o = {}) {
    o = { at: 0, title: 'LOADING', label: 'LOADING', wait: 'WAIT...', to: 100, unit: '%', desk: 'paper', winTitle: 'LOADING.EXE', ...o };
    const C = colors(o), at = o.at, to = o.to, nd = String(to).length;
    const keys = o.keys || [[at + .1, 0], [at + .9, to * .8], [at + 1.5, to * .99]];
    const lastK = keys[keys.length - 1][0], done = o.done ? { tag: 'COMPLETE', ...o.done } : null;
    const gl = o.glitch === true ? [lastK - .25, lastK + .1] : (o.glitch && o.glitch.at) || [];
    const meta = o.meta || ['FILE 01/01', 'BLOCK 0X7E3A', 'STREAM 4 / 4'];
    const pileSpec = o.pile || [{ kind: 'term', x: 330, y: 60, w: 560, h: 240 }, { kind: 'wave', x: 1120, y: 70, w: 600, h: 250 }, { kind: 'scan', x: 1590, y: 520 },
      { kind: 'radar', x: 60, y: 470 }, { kind: 'term', title: 'LOG.TXT', x: 760, y: 800, w: 600, h: 230 }];
    const val = t => (done && t >= done.at) ? to : Math.min(valueAt(keys, t), done ? to * .999 : to);
    return XM.shot({ bg: 'bg', stage: 'flat' }, S => {
      const ST = stage(S, o);
      const ctx = { ...C, box: ST.box, pressed: () => false };
      const pile = pileSpec.map((w, i) => mkWin({ ...w, at: w.at ?? -99 }, i, { at: -99 }, ctx));
      const LC = mkCanvas(Math.ceil(LW * 1.25), Math.ceil(LH * 1.25), `width:${LW}px;height:${LH}px;transform-origin:0 0;display:none;`);
      const lg = LC.getContext('2d');
      let ready = false;
      const DIG = { size: 352, y: 521, cx: i => 1085 - (nd - 1 - i) * 332 };
      function digits(g, v, f, ready_, prevV) {
        const col = ready_ ? C.A : C.AI, n = Math.floor(v + 1e-6), s = String(n).padStart(nd, '0'), ps = String(Math.floor(prevV + 1e-6)).padStart(nd, '0');
        const lead = s.search(/[1-9]/), fast = Math.abs(v - prevV) * 30 > 12;
        for (let i = 0; i < nd; i++) {
          const outline = !ready_ && i < nd - 1 && (lead < 0 || i < lead), cx = DIG.cx(i), o2 = { fam: 'unb', size: DIG.size, w: 900, col, align: 'center' };
          if (outline) { XM.txt(g, s[i], cx, DIG.y, { ...o2, stroke: 3 }); continue; }
          if (ready_) { XM.txt(g, s[i], cx, DIG.y, o2); continue; }
          g.save(); g.beginPath(); g.rect(cx - 170, DIG.y - 330, 340, 392); g.clip();
          if (fast) {                                  // fast: jump per frame, last digit gets up / down ghosting when it changes (odometer smear)
            if (s[i] !== ps[i] && i === nd - 1) { g.globalAlpha = .28; XM.txt(g, s[i], cx, DIG.y - 105, o2); XM.txt(g, s[i], cx, DIG.y + 95, o2); g.globalAlpha = 1; }
            XM.txt(g, s[i], cx, DIG.y, o2);
          } else {                                     // slow: real rolling odometer
            const p = Math.pow(10, nd - 1 - i), roll = (n % p === p - 1 && v < to) ? XM.smooth(v - n) : 0, dg = +s[i], yy = DIG.y - roll * 300;
            XM.txt(g, String(dg), cx, yy, o2); if (roll > 0) XM.txt(g, String((dg + 1) % 10), cx, yy + 300, o2);
          }
          g.restore();
        }
      }
      function drawLoad(t) {
        const g = lg, f = fr(t - at), ready_ = done && t >= done.at, fd = ready_ ? fr(t - done.at) : -1;
        const v = val(t), pv = val(t - F30), A = C.A, AI = C.AI;
        g.setTransform(1.25, 0, 0, 1.25, 0, 0); g.clearRect(0, 0, LW, LH);
        g.fillStyle = A; g.fillRect(0, 10, LW, LH - 10);
        g.fillStyle = INK; g.fillRect(0, 10, LW, 45);
        xIcon(g, 8, 22, 20, PAP);
        mono(g, o.winTitle, 38, 39.5, 18, PAP, { ls: 1.5 });
        g.strokeStyle = PAP; g.lineWidth = 2; g.strokeRect(LW - 61, 23, 19, 19); g.fillStyle = PAP; g.fillRect(LW - 32, 22, 20, 21);
        g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(1.5, 11.5, LW - 3, LH - 13);
        // title typed out (the last character shows only its top half)
        const head = ready_ ? (done.text || o.title) : o.title, hs = Math.min(86, 86 * 1180 / Math.max(1, bigW(g, head, 86))), chars = [...head];
        const nch = ready_ ? Math.min(chars.length, (fd + 1) * (isZh(head) ? 1 : 4)) : Math.min(chars.length, (f + 1) * (isZh(head) ? 1 : 3));
        const shown = chars.slice(0, nch).join('');
        if (shown) big(g, shown, 43.3, 161, hs, AI);
        if (nch < chars.length) { const cx = 43.3 + (shown ? bigW(g, shown, hs) : 0); g.save(); g.beginPath(); g.rect(cx, 161 - hs, hs * 1.2, hs * .45); g.clip(); big(g, chars[nch], cx, 161, hs, AI); g.restore(); }
        if (f >= 2) {   // thin rainbow line (effect line, not text)
          const x1 = 48 + (1480 - 48) * clamp((f - 1) / 4, 0, 1), gr = g.createLinearGradient(48, 0, 1480, 0);
          gr.addColorStop(0, '#E8E6FF'); gr.addColorStop(.42, '#FF9AD5'); gr.addColorStop(.6, '#9FE6FF'); gr.addColorStop(1, '#E8E6FF');
          g.fillStyle = gr; g.fillRect(48, 187, x1 - 48, 3);
        }
        if (f >= 3) meta.forEach((s, i) => mono(g, i === 0 && ready_ ? s + ' · OK' : s, 1482, 99 + i * 22, 13, AI, { align: 'right', ls: 2.8 }));
        if (ready_) { g.fillStyle = AI === INK ? INK : PAP; g.fillRect(48, 208, 1435, 360); }   // with a light accent the done panel uses ink black so the digits stay readable
        // number (optional glitch)
        const gli = gl.some(x => t >= x && t < x + F30);
        if (gli) {
          const d = 7, n = 22;
          for (let k = 0; k < n; k++) {
            const y0 = 225 + k * (330 / n), dx = (hash(k * 7.3 + f) - .5) * 48;
            g.save(); g.beginPath(); g.rect(0, y0, LW, 330 / n + .5); g.clip();
            for (const [c, ox] of [['#FF3B6B', -d], ['#3DF2A0', d], ['#FFE45C', d * .4]]) {
              g.save(); g.translate(dx + ox, 0); const s = String(Math.floor(v)).padStart(nd, '0'), lead = s.search(/[1-9]/);
              for (let i = 0; i < nd; i++) XM.txt(g, s[i], DIG.cx(i), DIG.y, { fam: 'unb', size: DIG.size, w: 900, col: c, align: 'center',
                stroke: !ready_ && i < nd - 1 && (lead < 0 || i < lead) ? 3 : 0 }); g.restore(); }
            g.translate(dx, 0); digits(g, v, f, ready_, pv); g.restore();
          }
        } else digits(g, v, f, ready_, pv);
        // unit + status label
        const ux = DIG.cx(nd - 1) + 177;
        XM.txt(g, o.unit, ux, 392, { ...bigO(o.unit, 160), col: ready_ ? A : AI, stroke: 3.2 });
        const tag = ready_ ? done.tag : (t > lastK + .1 && v < to ? o.wait : o.label), tw = XM.measure(g, tag, { fam: 'mono', size: 15, w: 500, ls: 1.8, zhW: 700 }) + 44;
        if (ready_) { g.fillStyle = A; g.fillRect(ux + 2, 429, tw, 40); mono(g, tag, ux + 2 + tw / 2, 456, 15, AI, { align: 'center' }); }
        else { g.strokeStyle = AI; g.lineWidth = 2.4; g.strokeRect(ux + 2, 429, tw, 40); mono(g, tag, ux + 2 + tw / 2, 456, 15, AI, { align: 'center' }); }
        // segmented progress bar (next segment blinks while stalled)
        const p = v / to, segs = 44, sw = (1487 - 48) / segs, on = Math.round(p * segs);
        if (fd === 0) { g.fillStyle = PAP; g.fillRect(48, 568, 1435, 8); g.fillRect(43, 586, 1445, 48); }
        else for (let k = 0; k < segs; k++) {
          const blink = !ready_ && k === on && t > lastK + .1 && Math.floor((t - lastK) / .25) % 2 === 0;
          if (k < on || blink) { g.fillStyle = AI; g.fillRect(48 + k * sw, 586, sw - 5, 54); }
          else { g.strokeStyle = AI; g.lineWidth = 2.4; g.strokeRect(48 + k * sw + 1.2, 587.2, sw - 7.4, 51.6); }
        }
        // bottom-left big text + small barcode, tiny text bottom-right
        const sub = ready_ ? (done.sub ?? o.sub) : o.sub;
        if (sub && f >= 4) {
          g.save(); g.translate(47, 0); g.scale(.8, 1); XM.txt(g, sub, 0, 736, { fam: 'zh', size: 65, w: 700, col: AI }); g.restore();
          if (f >= 5) { const bx = 47 + XM.measure(g, sub, { fam: 'zh', size: 65, w: 700 }) * .8 + 26; if (bx + 174 < 1150) XM.FX.barcode(g, bx, 688, 174, 45, AI, 77); }
        }
        if (f >= 6) {
          const end = done ? done.at : lastK, eta = Math.max(0, end - t).toFixed(2), rate = Math.abs(v - pv) * 30;
          const blocks = Math.round(clamp(p, 0, 1) * 4096);
          mono(g, `ETA ${ready_ ? '0.00' : eta} S`, 1482, 689, 14, AI, { align: 'right', ls: 2.6 });
          mono(g, `RATE ${rate.toFixed(1)} /S`, 1482, 712, 14, AI, { align: 'right', ls: 2.6 });
          mono(g, `BLOCKS ${blocks}/4096`, 1482, 735, 14, AI, { align: 'right', ls: 2.6 });
          if (ready_ && done.cta) mono(g, '→ ' + done.cta, 1482, 772, 14, AI, { align: 'right', ls: 2.6 });
        }
      }
      return (g, t, kS) => {
        if (!ready) { for (const w of pile) w.layout(g); ST.box.appendChild(LC); ready = true; }
        const k = XM.smooth(kS ?? 0);
        const pp = mkProj({ rx: 7, ry: 10, rz: -2.4, s: lerp(.9, .87, k), x: 0, y: 6 });
        ST.desk(pp); ST.clearFx();
        for (const w of pile) w.render(t, pp, { force: 'live' });
        // big window: less tilted than the desk (easier to read), slowly straightening further
        const lp = mkProj({ rx: lerp(3.2, 2, k), ry: lerp(4.5, 2.5, k), rz: lerp(-1.4, -.7, k), s: lerp(.965, .99, k), x: 0, y: 12 });
        const f = fr(t - at);
        const quad = sc => { const q = []; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) q.push(...lp(960 + u * LW / 2 * sc, 540 + v * LH / 2 * sc, 0)); return q; };
        if (t < at) LC.style.display = 'none';
        else {
          if (f <= 2) strokeQuad(ST.fxG, scaleQuad(quad(1), 1.05 + .02 * f, -18, 10), C.A, 3);
          if (f === 0) LC.style.display = 'none';
          else { drawLoad(t); placeEl(LC, quad(f === 1 ? .82 : 1), LW, LH); LC.style.display = 'block'; }
        }
        ST.hud(t, o.hud === false ? false : { tl: 'SYS / LOAD', ...(o.hud || {}) });
      };
    });
  }

  Object.assign(XM, { popups, loading });
})();
