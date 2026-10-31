// XM.numberRoll: number roll. One (or several) large numbers flip through a sequence, slowing down until they land on the
// target value; optional perspective tilt that pulls back and straightens, and a worn, printed letter surface.
// API: XM.numberRoll(o) -> shot { L, update, cues, api }; main options: rolls (values, at, land, slow, step), view, wear, exit.
// Docs: docs/components/roll.md.
// Requires lib.js, xk.js, xm-core.js, xm-ds.js, xm-tex.js (loaded before this file). Canvas 2D (XM.shot); deterministic (no Math.random / Date).
//
// How it works:
//   · Numbers are drawn on a "plane"; DS.stage is drawn on the same plane, so the stage rotates and scales with the numbers.
//     XM.tex.use(shot, { stage:'grid' }) gives a dark grid sheet; 'paper' + window light works too.
//   · view: a camera curve from -> to. Slow creep, a sharp pull-back + straighten at knee, then exponential slow-down with tau.
//   · values + at / land + slow (last interval / first interval); value changes snap to whole frames.
//   · Font: high-contrast narrow italic serif (PlayIt / NumIt with lining figures). wear blurs the glyph alpha and thresholds it
//     with two noise octaves for rough edges, plus clustered bright specks on the face.
//   · align:'left' + anchor:'final': the landed value is centered on (x, y); the other values share its left edge.
//   · dof: when the camera is close, both sides go out of focus (none once zoom is below 1.3x).
//   · sheet: soft falloff on the plane (a sheet with bright center and darker edges), on by default on dark stages.
//   · exit:{ kind:'rise' } scrolls the whole plane up, accelerating and blurring ('blur' / 'fade' also available; omit to hold).
//   Style rules: numbers never glow and have no drop shadow; chromatic fringing is not done here (use XM.tex post chroma, edges
//   only, very weak); number color comes from the design system (P.fg / accent).
//
// General purpose (not just years): values can be any sequence (years, prices, percentages, counts, ranks, decimals), counting down
//   or up; prefix / suffix (currency, %, unit words); per-step transition `step`: 'cut' | 'blur' (cut + blur) | 'roll' (per digit,
//   odometer-style, vertical motion blur when fast) | 'flip' (whole block flips over); view optional; several groups per screen
//   (rolls), auto row / column layout or explicit positions; optional color change on landing (final).
//
// ─────────────────────────────────────────────────────────────────────────────
// XM.numberRoll(o) -> { L, update, cues, api }
//   A framework: which numbers, from what to what, how many groups, where, and when they flip / land are chosen per video. No default numbers.
//   rolls  : [roll, …] (required; with a single group you can put the roll fields directly on o). Each roll:
//     values : required. [2026, 2025, …] | ['¥9.9', …] (strings drawn as-is) | { from, to, step } (arithmetic) | { from, to, n, ease:'out'|'in'|'linear', pow, round }
//              (n values; default ease 'out' takes smaller steps near the target — combined with slow this reads as "slowing down")
//     at     : required. Time the flipping starts (absolute seconds). The first value is on screen from enter.at (default at − 0.4 s); at switches to the second value
//     land   : required (or give times). Time the last value appears (lands)
//     times  : optional, the time of each value (overrides the automatic at / land / slow spacing; the first entry is when the first value appears)
//     slow   : how much it slows = last interval / first interval (default 1.5; > 1 slows down, < 1 speeds up, 1 = constant). Intervals form a geometric series
//              snapped to whole frames; if several values fall in one frame only the last is shown ("at most one change per frame")
//     step   : how each step changes: 'cut' (default) | 'blur' (new value resolves from blur, old one blurs out) | 'roll' (per digit, up when increasing,
//              down when decreasing; force with dir 'up' / 'down') | 'flip' (whole block flips around the horizontal axis)
//     stepDur: max duration of each step animation (s; default roll .22 / flip .3 / blur .16); actual = min(stepDur, interval x .85)
//     settle : duration of the final (landing) step (s; default roll .5 / flip .42 / blur .32; none for cut); quintOut, stops without overshoot
//     fmt    : number format { dec: decimals, sep: thousands separator (',' or '', default ''), pad: zero-pad to n digits, minus:'-' }
//     prefix / suffix : string or { text, scale:.6 (relative to number size), fam, w, gap:.06 (em), raise:0 (em, upward shift) }.
//              CJK prefix / suffix use SerifSC 900 automatically; ¥ % $ + use the number font. They don't flip; they move with the number
//     x, y   : position (plane coordinates = screen coordinates when the plane isn't tilted). y = numeral cap midline. Omit to auto-place by layout
//     align  : 'left' | 'right' | 'center' (default center). x is the aligned edge (left = left edge, right = right edge); with anchor:'final' x is the center of the landed value
//     size   : number font size (px, not ink height). Default: fit the widest value into its slot (at least 150 px margin)
//     tabular: equal-width digits (default on for roll / flip, off for cut / blur): every digit takes the same cell, so digits don't jump while rolling
//     col    : color ('fg' default | 'accent' | '#hex'); final:{ col, dur:.3 } cross-fades to another color (e.g. accent) on landing
//     enter  : how the first value appears { at (default at − .4), kind:'cut'|'fade'|'blur', dur:.4 }
//     label  : optional small label { text (required), pos:'above'|'below'|'left', x, size:68, fam:'zh', w:800, col:'fg'|'mute'|…, gap, at }.
//              Says what this number is (e.g. human / AI, last year / this year); it's not a subtitle; must be readable, >= 56 px
//     sound  : default one countup cue per group (t = flip start, dur = until landing, with a "ding" on landing); false = none; { gain } changes volume
//   layout : 'row' (default, groups side by side) | 'column' (stacked). Only used for rolls without x / y
//   font   : number font { fam:'NumIt' (default = DM Serif Display Italic, single weight) | 'PlayItNum' (Playfair lining figures, more ornate) | 'SerifSC' | 'Grot' | …,
//            w (NumIt 400, others 600), sq:.95 (horizontal squeeze), track:-.06 (em), sk:.05 (extra slant) }
//            Use only fonts the skeleton already loads (SerifSC / HeiSC / Grot / Mono / StixIt) and PlayIt. SerifSC 900 with sq .8 gives heavy condensed serif numbers
//   wear   : 0..1 (default .6). 0 = clean glyphs; rough edges and face specks scale with font size (large and small numbers look the same)
//   view   : perspective tilt + pull back and straighten; false / omitted = static plane.
//            { from:{ zoom:2.35, angle:16.9, x:-140, y:-55 }, to:{ zoom:1, angle:0, x:0, y:0 }, at (default = first group's enter.at), knee (default at + .6 x (land − at)),
//              tau:.37 (time constant of the slow-down after the pull, s), creep:.07, sharp:.075, mid:.5 (fraction done at knee), angleExp:1.3 }
//            x / y = offset of the plane center on screen (px); zoom is relative to `to`. Curve: slow creep from at to knee then a sharp pull, exponential slow-down after knee, no hard start or stop
//   dof    : side depth of field when close { px:7, r0:300, r1:760, z0:1.3, z1:1.7 } (screen coords, along the plane's x axis; none at zoom <= z0, full at >= z1); false = off. Only with view
//   sheet  : soft falloff on the plane ("a sheet with edges", bright center fading back to the stage color) { rx:740, ry:490, x:0, y:0, floor:.15, pow:1.4 }; default on for dark stages, off for light; false = off
//   exit   : ending { at, dur, kind:'rise' (whole plane scrolls up, accelerating and blurring) | 'blur' (blurs away) | 'fade' }; omitted = hold (give the landed value time to be read)
//   draw   : optional (g, t, api) => {} draws your own things in plane coordinates after the numbers (thin lines, marks); api.box(i) is the current value box of group i
//   tone   : 'ink' (default) | 'paper' | 'accent'; hud: corner text for XM.DS.hud (written by the caller, none by default); false = off
//   seed   : wear noise seed
// Texture: the component's own background goes through XM.DS.stage (drawn on the plane); window light / post / push via XM.tex.use(shot, { stage, light, post, push }).
// Sound cues: one countup (XM.DS.SFX.count) per group, nothing else.
(() => {
  const { W, H } = XK;
  const DS = XM.DS, SFX = DS.SFX;
  const CX = W / 2, CY = H / 2;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const sstep = (a, b, x) => { const k = cl((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const quintOut = k => 1 - Math.pow(1 - k, 5);
  const easeIO = k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const fps = () => (window.VIDEO && VIDEO.fps) || 30;
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  const rgbOf = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (m) return m[1].split(',').slice(0, 3).map(s => parseFloat(s));
    let h = String(c).replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
  const hexOf = a => '#' + a.map(v => Math.round(cl(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, k) => { const A = rgbOf(a), B = rgbOf(b); return hexOf(A.map((v, i) => lerp(v, B[i], k))); };
  const lumOf = c => { const [r, g, b] = rgbOf(c); return (r * .2126 + g * .7152 + b * .0722) / 255; };

  // ---------- noise (deterministic) ----------
  const hash2 = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  function vn2(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), s1 = s * 17.31, s2 = s * 9.17;
    const a = hash2(xi + s1, yi - s2), b = hash2(xi + 1 + s1, yi - s2), c = hash2(xi + s1, yi + 1 - s2), d = hash2(xi + 1 + s1, yi + 1 - s2);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function boxBlur(a, w, h, r) {      // in-place box blur (horizontal + vertical), edges clamped
    const t = new Float32Array(a.length), n = 2 * r + 1;
    for (let y = 0; y < h; y++) { const o = y * w; let s = 0; for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { t[o + x] = s / n; s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = s / n; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  }

  // ---------- number fonts ----------
  // Default NumIt = DM Serif Display Italic (OFL, single weight 400): its "2" has a pointed teardrop head and a flat base; plain, not ornate.
  // PlayItNum = PlayIt (Playfair Display Italic) registered a second time with lnum lining figures (its default figures are old-style: 3 4 5 7 9 descend);
  // its "2" has a curled tail, more ornate — use it when you want something fancier.
  // The font files are not modified (OFL reserved font names); OpenType features are only switched on in the FontFace.
  const NUMF = 'NumIt';
  const NUM_FACES = {
    NumIt: { url: 'explainer/xm-assets/fonts/DMSerifDisplay-Italic.ttf', desc: { weight: '400' } },
    PlayItNum: { url: 'explainer/xm-assets/fonts/PlayfairDisplay-Italic-wght.ttf', desc: { weight: '400 900', featureSettings: '"lnum" 1' } },
  };
  const numFontReq = {};
  function ensureNumFont(fam) {
    const spec = NUM_FACES[fam]; if (!spec) return Promise.resolve();
    if (numFontReq[fam]) return numFontReq[fam];
    try {
      const f = new FontFace(fam, `url('${spec.url}')`, spec.desc);
      document.fonts.add(f);
      numFontReq[fam] = XM.asset(f.load().catch(() => console.error('XM.numberRoll: failed to load number font ' + spec.url)));
    } catch (e) { console.error('XM.numberRoll: failed to register number font ' + e); numFontReq[fam] = Promise.resolve(); }
    return numFontReq[fam];
  }

  // ---------- glyph sprites (one per char, wear baked in; each char has 2 wear variants by position so "11" doesn't look duplicated) ----------
  const SPR = new Map();
  let PROBE = null;
  const probe = () => { if (!PROBE) PROBE = document.createElement('canvas').getContext('2d'); return PROBE; };
  const fontStr = (F, fs) => `${F.w} ${fs}px "${F.fam}"`;
  function metrics(ch, F, fs) {
    const p = probe(); p.font = fontStr(F, fs); const m = p.measureText(ch);
    return { adv: m.width, l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent };
  }
  // Wear (scaled by font size): edge threshold jittered by two noise octaves, clustered bright specks on the face, low-frequency brightness variation ±3%
  function weather(q, w, h, fs, wear, v, seed, face, spot) {
    const img = q.getImageData(0, 0, w, h), d = img.data, N = w * h, e = fs / 900;
    const A = new Float32Array(N); for (let p = 0; p < N; p++) A[p] = d[p * 4 + 3] / 255;
    boxBlur(A, w, h, Math.max(1, Math.round(5 * e))); boxBlur(A, w, h, Math.max(1, Math.round(4 * e)));
    const F = rgbOf(face), S = rgbOf(spot), so = v * 41.3 + seed * 13.7;
    const amp = .4 * wear, base = .5 + .1 * wear, spA = Math.min(1, wear * 1.25);
    const i1 = 1 / (6.5 * e), i2 = 1 / (38 * e), i3 = 1 / (55 * e), i4 = 1 / (2.6 * e), i5 = 1 / (140 * e);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x, a = A[p];
      if (a <= .02) { d[p * 4 + 3] = 0; continue; }
      const nz = .62 * vn2(x * i1 + so, y * i1, 3) + .38 * vn2(x * i2 + so, y * i2, 5);
      const th = base + amp * (nz - .5), al = sstep(th - .06, th + .06, a);
      if (al <= 0) { d[p * 4 + 3] = 0; continue; }
      const white = spA * sstep(.58, .8, vn2(x * i3 + so, y * i3, 11)) * sstep(.62, .85, vn2(x * i4 + so, y * i4, 13));
      const lv = 1 + .06 * (vn2(x * i5 + so, y * i5, 23) - .5);
      d[p * 4] = lerp(F[0] * lv, S[0], white); d[p * 4 + 1] = lerp(F[1] * lv, S[1], white); d[p * 4 + 2] = lerp(F[2] * lv, S[2], white);
      d[p * 4 + 3] = Math.round(255 * al);
    }
    q.putImageData(img, 0, 0);
  }
  function glyph(ch, F, fs, wear, v, seed, face, spot) {
    const key = [ch, F.fam, F.w, fs, wear.toFixed(2), v, seed, face, spot].join('|');
    if (SPR.has(key)) return SPR.get(key);
    const m = metrics(ch, F, fs);
    let out;
    if (!ch.trim()) out = { c: null, ox: 0, oy: 0, adv: m.adv };
    else {
      const L = Math.ceil(m.l), R = Math.ceil(m.r), A = Math.ceil(m.a), D = Math.ceil(m.d), pad = Math.ceil(fs * .03) + 6;
      const w = Math.max(1, L + R + 2 * pad), h = Math.max(1, A + D + 2 * pad);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const q = c.getContext('2d', { willReadFrequently: wear > 0 });
      q.font = fontStr(F, fs); q.textBaseline = 'alphabetic'; q.fillStyle = wear > 0 ? '#fff' : face; q.fillText(ch, pad + L, pad + A);
      if (wear > 0) weather(q, w, h, fs, wear, v, seed, face, spot);
      out = { c, ox: pad + L, oy: pad + A, adv: m.adv };
    }
    XM.note(F.fam, ch);
    SPR.set(key, out); return out;
  }

  // ---------- values / timing ----------
  function genValues(V) {
    if (Array.isArray(V)) return V.slice();
    if (V && isFinite(V.from) && isFinite(V.to)) {
      if (V.n) {
        const n = Math.max(2, V.n | 0), p = V.pow ?? 2.2;
        const E = typeof V.ease === 'function' ? V.ease : V.ease === 'linear' ? k => k : V.ease === 'in' ? k => Math.pow(k, p) : k => 1 - Math.pow(1 - k, p);
        const r = V.round ?? (Number.isInteger(V.from) && Number.isInteger(V.to) ? 1 : 0), out = [];
        for (let i = 0; i < n; i++) { let v = V.from + (V.to - V.from) * E(i / (n - 1)); if (r > 0) v = Math.round(v / r) * r; v = +v.toFixed(8); if (!out.length || out[out.length - 1] !== v) out.push(v); }
        if (out[out.length - 1] !== V.to) out.push(V.to);
        return out;
      }
      const st = Math.abs(V.step ?? 1) * Math.sign(V.to - V.from || 1), out = [];
      for (let v = V.from, i = 0; i < 2000 && (st > 0 ? v <= V.to + 1e-9 : v >= V.to - 1e-9); v = +(v + st).toFixed(8), i++) out.push(v);
      if (out[out.length - 1] !== V.to) out.push(V.to);
      return out;
    }
    return null;
  }
  function fmtVal(v, F = {}) {
    if (typeof v === 'string') return v;
    let s = Math.abs(v).toFixed(F.dec ?? 0), [i, f] = s.split('.');
    if (F.pad) i = i.padStart(F.pad, '0');
    if (F.sep) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, F.sep);
    return (v < 0 ? (F.minus ?? '-') : '') + i + (f ? (F.point ?? '.') + f : '');
  }
  // Slowing down: intervals form a geometric series, last / first = slow. Hard-switch steps (cut / blur / flip) snap to whole frames and keep only
  // the last value when several fall in one frame; roll is not snapped (rolling is continuous, frames between steps are what show the motion)
  function genTimes(R, vals) {
    const n = vals.length, fr = fps();
    let T;
    if (R.times) { if (R.times.length !== n) console.error(`XM.numberRoll: times has ${R.times.length} entries but values has ${n}`); T = R.times.slice(0, n); while (T.length < n) T.push(T[T.length - 1] + 1 / fr); }
    else {
      // value 0 is shown from enterAt; value 1 switches in at `at`; the m = n − 2 intervals between values 1 … n−1 form a geometric series and the last lands on `land`
      T = [R.enterAt];
      const m = n - 2;
      if (m === 0) T.push(R.land);
      else if (m > 0) {
        const slow = Math.max(.05, R.slow ?? 1.5), r = m > 1 ? Math.pow(slow, 1 / (m - 1)) : 1, span = Math.max(1 / fr, R.land - R.at);
        const d0 = Math.abs(r - 1) < 1e-6 ? span / m : span * (r - 1) / (Math.pow(r, m) - 1);
        let t = R.at; for (let i = 1; i < n; i++) { T.push(t); t += d0 * Math.pow(r, i - 1); }
        T[n - 1] = R.land;
      }
    }
    if (R.step === 'roll') return vals.map((v, i) => ({ v, t: T[i] }));
    const out = [];
    vals.forEach((v, i) => {
      const f = Math.round(T[i] * fr);
      if (out.length && f <= out[out.length - 1].f) { if (out.length === 1) out.push({ v, f: out[0].f + 1 }); else out[out.length - 1] = { v, f: out[out.length - 1].f }; }
      else out.push({ v, f });
    });
    return out.map(o => ({ v: o.v, t: o.f / fr }));
  }

  // ---------- camera curve: slow creep -> sharp pull at knee -> exponential slow-down ----------
  // p(t) 0 -> 1. Before knee: mid x (creep·u + (1−creep)·E(u)), E(u) = normalized exp((u−1)/sharp); after knee: 1 − (1 − mid)·exp(−(t − knee)/tau).
  // Velocity is discontinuous at knee (an intentional abrupt change); a ±2-frame box average smooths the corner so it doesn't jolt.
  function viewCurve(V) {
    const { at, knee, tau, creep, sharp, mid } = V, ex = Math.exp(-1 / sharp);
    const raw = t => {
      if (t <= at) return 0;
      if (t < knee) { const u = (t - at) / Math.max(1e-3, knee - at), E = (Math.exp((u - 1) / sharp) - ex) / (1 - ex); return mid * (creep * u + (1 - creep) * E); }
      return 1 - (1 - mid) * Math.exp(-(t - knee) / tau);
    };
    const h = 1 / fps();
    return t => (raw(t - 2 * h) + raw(t - h) + raw(t) + raw(t + h) + raw(t + 2 * h)) / 5;
  }

  function numberRoll(o = {}) {
    const P = DS.tone(o.tone || 'ink');
    const C = c => (c == null ? null : c === 'fg' ? P.fg : c === 'accent' ? P.accent : c === 'mute' ? P.mute : c === 'mark' ? P.mark : c === 'bg' ? P.bg : c[0] === '#' || c.startsWith('rgb') ? c : XK.col(c));
    const famIn = (o.font && o.font.fam) || NUMF, isNum = famIn === NUMF;   // NumIt has its own tuned defaults; other fonts use the generic ones
    const F = { fam: famIn, w: isNum ? 400 : 600, sq: isNum ? .95 : 1, track: isNum ? -.06 : -.04, sk: isNum ? .05 : 0, ...(o.font || {}) };
    ensureNumFont(F.fam);
    const wear = cl(o.wear ?? .6), seed = o.seed ?? 7;
    const dark = lumOf(P.bg) < .4;
    const ROLL_KEYS = ['values', 'at', 'land', 'times', 'slow', 'step', 'stepDur', 'settle', 'fmt', 'prefix', 'suffix', 'x', 'y', 'align', 'anchor', 'size', 'tabular', 'col', 'final', 'enter', 'label', 'sound', 'dir'];
    let rollsIn = o.rolls;
    if (!rollsIn) { const r = {}; ROLL_KEYS.forEach(k => { if (o[k] !== undefined) r[k] = o[k]; }); rollsIn = [r]; }
    if (!Array.isArray(rollsIn) || !rollsIn.length) { console.error('XM.numberRoll: rolls must be an array (or put values / at / land directly in the options)'); rollsIn = []; }

    const cues = [];
    const R = rollsIn.map((r, ri) => {
      const vals = genValues(r.values);
      if (!vals || !vals.length) console.error(`XM.numberRoll: roll ${ri + 1} has no values ([…] or { from, to, step } / { from, to, n })`);
      if (!isFinite(r.at)) console.error(`XM.numberRoll: roll ${ri + 1} has no at (when it starts rolling)`);
      if (!r.times && !isFinite(r.land)) console.error(`XM.numberRoll: roll ${ri + 1} has no land (when it settles) or times`);
      const step = r.step || 'cut';
      if (!['cut', 'blur', 'roll', 'flip'].includes(step)) console.error('XM.numberRoll: step must be cut / blur / roll / flip, got ' + step);
      const at = isFinite(r.at) ? r.at : 0, land = isFinite(r.land) ? r.land : at + 2;
      const en = { kind: 'cut', dur: .4, ...(r.enter || {}) }; en.at = en.at ?? (r.times ? r.times[0] : at - .4);
      const S = { ...r, i: ri, step, at, land, enterAt: en.at, enter: en, align: r.align || 'center', fmt: r.fmt || {} };
      const seq = genTimes(S, vals || [0]);
      S.vals = seq.map(s => fmtVal(s.v, S.fmt)); S.T = seq.map(s => s.t); S.raw = seq.map(s => s.v);
      S.land = S.T[S.T.length - 1];
      const DUR = { roll: .22, flip: .3, blur: .16, cut: 0 }[step] ?? 0, SET = { roll: .5, flip: .42, blur: .32, cut: 0 }[step] ?? 0;
      S.D = S.T.map((t, i) => { if (i === 0) return 0; if (step === 'cut') return 0; if (i === S.T.length - 1) return r.settle ?? SET;
        return Math.min(r.stepDur ?? DUR, (S.T[i + 1] - t) * .85); });
      S.tab = r.tabular ?? (step === 'roll' || step === 'flip');
      S.col = C(r.col || 'fg'); S.fin = r.final ? { dur: .3, ...r.final, col: C(r.final.col || 'accent') } : null;
      const aff = (a, isPre) => { if (a == null || a === '') return null; const A = typeof a === 'string' ? { text: a } : { ...a }; if (!A.text) return null;
        const zh = CJK.test(A.text); A.F = { fam: A.fam || (zh ? 'SerifSC' : F.fam), w: A.w || (zh ? 900 : F.w), sq: A.sq ?? (zh ? F.sq : F.sq) };
        A.scale = A.scale ?? (zh ? .42 : .6); A.gap = A.gap ?? (zh ? .08 : .05); A.raise = A.raise ?? 0; A.pre = isPre; return A; };
      S.pre = aff(r.prefix, true); S.suf = aff(r.suffix, false);
      if (r.label) { if (!r.label.text) console.error(`XM.numberRoll: roll ${ri + 1} label has no text`); S.label = { pos: 'above', size: 68, fam: 'zh', w: 800, col: 'fg', ...r.label }; }
      if (r.sound !== false && S.T.length > 1) { const sg = typeof r.sound === 'object' ? r.sound : {}; const t0 = S.T[1];
        cues.push({ t: +t0.toFixed(3), name: SFX.count, gain: sg.gain ?? .5, dur: +Math.max(.2, S.land - t0).toFixed(3) }); }
      return S;
    });

    // ---------- layout (computed on the first draw after fonts load, then cached) ----------
    let LAID = false;
    const mul = 900;     // reference font size for measuring
    function cellsOf(S, str) {          // cells of one value: [{ ch, x (left, em), w (em), gx (glyph offset inside the cell, em) }], total width in em
      const cells = []; let x = 0;
      const dig = S.tab ? S.digW : 0;
      for (const ch of str) {
        const m = metrics(ch, F, mul), adv = m.adv / mul * F.sq;
        const isD = /\d/.test(ch), w = S.tab && isD ? dig : adv;
        cells.push({ ch, x, w, gx: (w - adv) / 2 }); x += w + F.track;
      }
      return { cells, w: Math.max(0, x - F.track) };
    }
    function affW(A) { if (!A) return 0; let w = 0; for (const ch of A.text) w += metrics(ch, A.F, mul).adv / mul * A.F.sq; return w * A.scale + A.gap; }
    function layout() {
      if (LAID) return; LAID = true;
      const capM = metrics('0', F, mul); const capH = capM.a / mul;          // numeral cap height (em)
      R.forEach(S => {
        S.digW = Math.max(...'0123456789'.split('').map(d => metrics(d, F, mul).adv)) / mul * F.sq;
        S.lays = S.vals.map(v => cellsOf(S, v));
        S.capH = capH; S.preW = affW(S.pre); S.sufW = affW(S.suf);
        S.maxW = Math.max(...S.lays.map(l => l.w)) + S.preW + S.sufW;
        S.finW = S.lays[S.lays.length - 1].w + S.preW + S.sufW;
      });
      // automatic position / font size
      const n = R.length, lay = o.layout || 'row', M = DS.SAFE + 40, gap = 120;
      R.forEach((S, i) => {
        const slotW = lay === 'row' ? (W - 2 * M - gap * (n - 1)) / n : W - 2 * M, slotH = lay === 'row' ? H - 2 * M - 140 : (H - 2 * M - 60 * (n - 1)) / n - (S.label ? S.label.size * 1.4 : 0);
        if (!S.size) S.size = Math.min(slotW / Math.max(.5, S.maxW), slotH / Math.max(.3, capH * 1.25), 560);
        const cx = lay === 'row' ? M + slotW * (i + .5) + gap * i : CX, cy = lay === 'row' ? CY + (S.label && S.label.pos === 'above' ? S.label.size * .6 : 0) : M + (i + .5) * (H - 2 * M) / n;
        if (S.x == null) { S.x = S.align === 'left' ? cx - S.finW * S.size / 2 : S.align === 'right' ? cx + S.finW * S.size / 2 : cx; S.anchor = 'edge'; }
        if (S.y == null) S.y = cy;
        if (S.anchor === 'final') {     // x is the center of the landed value -> convert to the aligned edge
          S.x = S.align === 'left' ? S.x - S.finW * S.size / 2 : S.align === 'right' ? S.x + S.finW * S.size / 2 : S.x; S.anchor = 'edge'; }
        if (S.size * capH < 100 * .7) console.warn(`XM.numberRoll: roll ${i + 1} digits are only ${Math.round(S.size * capH)} px tall (key numbers need a font size ≥ 100 px)`);
      });
      // sprite font size: the largest size it will be drawn on screen (view zoom included), max 1100
      const zMax = V ? Math.max(V.from.zoom, V.to.zoom) : 1;
      R.forEach(S => { S.fs = Math.round(cl(Math.ceil(S.size * zMax * 1.08 / 50) * 50, 100, 1100)); });
    }

    // ---------- colors (wear specks: brighter on light text, stage color showing through on dark text) ----------
    const faceSpot = col => (lumOf(col) > .5 ? [mix(col, P.bg, .1), mix(col, '#ffffff', .75)] : [col, mix(col, P.bg, .55)]);

    // ---------- view (perspective tilt + pull back and straighten) ----------
    const V = o.view ? (() => {
      const v = o.view, from = { zoom: 2.35, angle: 16.9, x: -140, y: -55, ...(v.from || {}) }, to = { zoom: 1, angle: 0, x: 0, y: 0, ...(v.to || {}) };
      const R0 = R[0] || { enterAt: 0, at: 0, land: 2 };
      const at = v.at ?? R0.enterAt, knee = v.knee ?? (R0.at + .6 * (R0.land - R0.at));
      const out = { from, to, at, knee, tau: v.tau ?? .37, creep: v.creep ?? .07, sharp: v.sharp ?? .075, mid: v.mid ?? .5, angleExp: v.angleExp ?? 1.3 };
      out.p = viewCurve(out); return out;
    })() : null;
    function camAt(t) {
      if (!V) return { s: 1, th: 0, x: 0, y: 0, p: 1 };
      const p = cl(V.p(t)), q = 1 - p;
      return { s: V.to.zoom * Math.pow(V.from.zoom / V.to.zoom, q), th: lerp(V.to.angle, V.from.angle, Math.pow(q, V.angleExp)), x: lerp(V.from.x, V.to.x, p), y: lerp(V.from.y, V.to.y, p), p };
    }
    const DOF = o.dof === false || !V ? null : { px: 7, r0: 300, r1: 760, z0: 1.3, z1: 1.7, ...(o.dof || {}) };
    const SHEET = (o.sheet ?? dark) ? { rx: 740, ry: 490, x: 0, y: 0, floor: .15, pow: 1.4, ...(typeof o.sheet === 'object' ? o.sheet : {}) } : null;
    const EXIT = o.exit ? { kind: 'rise', dur: .9, ...o.exit } : null;
    if (EXIT && !isFinite(EXIT.at)) console.error('XM.numberRoll: exit needs at');
    const exitK = t => (EXIT ? cl((t - EXIT.at) / EXIT.dur) : 0);

    // ---------- draw one value ----------
    // In plane coordinates: x0 = left edge of the string, base = baseline. o2 = { alpha, blur, sy (vertical scale around the cap midline), col, dy (vertical offset), only:Set(positions) }
    function drawAff(g, S, A, x, base, col, alpha) {
      const k = S.size * A.scale / S.fs; let xx = x;
      const [face, spot] = faceSpot(col);
      for (const ch of A.text) {
        const gl = glyph(ch, A.F, S.fs, wear, 0, seed + 3, face, spot);
        if (gl.c) { g.save(); g.globalAlpha *= alpha; g.translate(xx, base - A.raise * S.size); g.scale(k * A.F.sq, k); g.drawImage(gl.c, -gl.ox, -gl.oy); g.restore(); }
        xx += gl.adv * k * A.F.sq;
      }
    }
    function drawCell(g, S, cell, x0, base, col, alpha, vi, dy = 0, sy = 1) {
      if (alpha <= .003 || !cell.ch.trim()) return;
      const [face, spot] = faceSpot(col), gl = glyph(cell.ch, F, S.fs, wear, vi % 2, seed, face, spot), k = S.size / S.fs;
      if (!gl.c) return;
      const mid = base - S.capH * S.size / 2;
      g.save(); g.globalAlpha *= alpha;
      g.translate(x0 + (cell.x + cell.gx) * S.size, mid + dy); if (sy !== 1) g.scale(1, sy); g.translate(0, S.capH * S.size / 2);
      if (F.sk) g.transform(1, 0, -F.sk, 1, 0, 0);
      g.scale(k * F.sq, k); g.drawImage(gl.c, -gl.ox, -gl.oy); g.restore();
    }
    // left edge of the string (derived from the aligned edge); lay = this value's cells
    const startX = (S, lay) => (S.align === 'left' ? S.x + S.preW * S.size : S.align === 'right' ? S.x - (lay.w + S.sufW) * S.size : S.x - (lay.w + S.preW + S.sufW) * S.size / 2 + S.preW * S.size);
    function drawValue(g, S, vi, o2) {
      const lay = S.lays[vi], x0 = o2.x0 ?? startX(S, lay), base = S.y + S.capH * S.size / 2, col = o2.col || S.col, a = o2.alpha ?? 1;
      const blur = o2.blur || 0;
      if (blur > .25) g.filter = `blur(${blur.toFixed(2)}px)`;
      lay.cells.forEach((c, j) => drawCell(g, S, c, x0, base, col, a, j, o2.dy || 0, o2.sy ?? 1));
      if (S.pre) drawAff(g, S, S.pre, x0 - S.preW * S.size, base, col, a);
      if (S.suf) drawAff(g, S, S.suf, x0 + (lay.w + S.suf.gap) * S.size, base, col, a);
      if (blur > .25) g.filter = 'none';
    }
    // Per-digit roll: digits are matched from the aligned edge (right / center count from the right, left from the left). Unchanged digits stay;
    // changed digits roll the old one out and the new one in, visible only inside the numeral band (clipped above and below, fading with distance).
    // When fast, copies across the shutter (half a frame) are summed with 'lighter' in an offscreen layer = vertical motion blur
    function drawRoll(g, S, i, k, kPrev, col) {
      const A = S.lays[i - 1], B = S.lays[i], fromRight = S.align !== 'left', last = i === S.T.length - 1;
      const E = last ? quintOut : (S.D[i] < .12 ? (x => x) : easeIO), ek = E(k), ekp = E(kPrev);
      const n = Math.max(A.cells.length, B.cells.length);
      const xa = startX(S, A), xb = startX(S, B), x0 = lerp(xa, xb, ek), base = S.y + S.capH * S.size / 2;
      const up = S.dir === 'down' ? -1 : S.dir === 'up' ? 1 : (typeof S.raw[i] === 'number' && typeof S.raw[i - 1] === 'number' ? (S.raw[i] >= S.raw[i - 1] ? 1 : -1) : 1);
      const h = S.capH * S.size * 1.12;            // line pitch of one cell
      const clipT = base - S.capH * S.size * 1.06, clipB = base + S.size * .05;
      const mv = [];
      for (let p = 0; p < n; p++) {
        const ca = fromRight ? A.cells[A.cells.length - 1 - p] : A.cells[p], cb = fromRight ? B.cells[B.cells.length - 1 - p] : B.cells[p];
        const ia = fromRight ? A.cells.length - 1 - p : p, ib = fromRight ? B.cells.length - 1 - p : p;
        const pxA = ca ? xa + ca.x * S.size : 0, pxB = cb ? xb + cb.x * S.size : 0, px = ca && cb ? lerp(pxA, pxB, ek) : ca ? pxA : pxB;
        if (ca && cb && ca.ch === cb.ch) { drawCell(g, S, { ...cb, x: 0 }, px, base, col, 1, ib); continue; }
        mv.push({ ca, cb, px, ia, ib });
      }
      if (mv.length) {
        const Lr = XM.canvas('xm-roll-mb'), q = Lr.g;
        q.save(); q.setTransform(g.getTransform()); q.beginPath(); q.rect(-1e4, clipT, 3e4, clipB - clipT); q.clip();
        q.globalCompositeOperation = 'lighter';
        const dist = Math.abs(ek - ekp) * h, ns = Math.max(1, Math.min(40, Math.ceil(dist / 2.5)));
        const fall = dy => { const u = Math.min(1, Math.abs(dy) / h); return Math.cos(u * Math.PI / 2) ** 1.5; };
        for (let s = 0; s < ns; s++) {
          const kk = ns === 1 ? ek : lerp(ekp, ek, (s + .5) / ns);
          for (const m of mv) {
            if (m.ca) { const dy = -up * kk * h; drawCell(q, S, { ...m.ca, x: 0 }, m.px, base, col, fall(dy) / ns, m.ia, dy); }
            if (m.cb) { const dy = up * (1 - kk) * h; drawCell(q, S, { ...m.cb, x: 0 }, m.px, base, col, fall(dy) / ns, m.ib, dy); }
          }
        }
        q.restore();
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(Lr.c, 0, 0); g.restore();
      }
      if (S.pre) drawAff(g, S, S.pre, x0 - S.preW * S.size, base, col, 1);
      if (S.suf) drawAff(g, S, S.suf, x0 + (lerp(A.w, B.w, ek) + S.suf.gap) * S.size, base, col, 1);
    }
    function stateOf(S, t) {
      let i = -1; for (let j = 0; j < S.T.length; j++) { if (S.T[j] <= t + 1e-6) i = j; else break; }
      if (i < 0) return null;
      const d = S.D[i], k = d > 0 ? cl((t - S.T[i]) / d) : 1, kPrev = d > 0 ? cl((t - .5 / fps() - S.T[i]) / d) : 1;
      return { i, k, kPrev };
    }
    function drawRollGroup(g, S, t, colOverride) {
      const st = stateOf(S, t); if (!st) return;
      const { i, k, kPrev } = st, col = colOverride || S.col;
      // first value appearing
      if (i === 0) {
        const e = S.enter, ke = e.kind === 'cut' ? 1 : cl((t - e.at) / e.dur), ee = quintOut(ke);
        drawValue(g, S, 0, { alpha: e.kind === 'cut' ? 1 : ee, blur: e.kind === 'blur' ? 8 * (1 - ee) : 0, col });
        return;
      }
      if (S.step === 'cut' || k >= 1) { drawValue(g, S, i, { col }); return; }
      if (S.step === 'blur') {
        const e = i === S.T.length - 1 ? quintOut(k) : easeIO(k);
        drawValue(g, S, i - 1, { alpha: 1 - e, blur: 6 * e, col }); drawValue(g, S, i, { alpha: e, blur: 6 * (1 - e), col }); return;
      }
      if (S.step === 'flip') {           // whole block flips around the horizontal axis: old value squashes in the first half, new value opens in the second; slightly darker edge-on
        const e = i === S.T.length - 1 ? quintOut(k) : easeIO(k), sy = Math.cos(Math.PI * e);
        drawValue(g, S, e < .5 ? i - 1 : i, { sy: Math.max(.02, Math.abs(sy)), alpha: .55 + .45 * Math.abs(sy), col }); return;
      }
      drawRoll(g, S, i, k, kPrev, col);
    }
    function drawLabel(g, S, t) {
      const L = S.label; if (!L) return;
      const at = L.at ?? S.enterAt, a = DS.in(t, at, .4); if (a <= 0) return;
      const lay = S.lays[S.lays.length - 1], x0 = startX(S, lay) - S.preW * S.size, x1 = x0 + S.finW * S.size;
      const top = S.y - S.capH * S.size / 2, bot = S.y + S.capH * S.size / 2, gap = L.gap ?? L.size * .55;
      let x, y, align;
      if (L.pos === 'left') { x = L.x ?? DS.SAFE + 40; y = S.y + L.size * .36; align = 'left'; }
      else { align = S.align; x = L.x ?? (align === 'left' ? x0 : align === 'right' ? S.x : (x0 + x1) / 2); y = L.pos === 'below' ? bot + gap + L.size * .8 : top - gap; }
      XM.txt(g, L.text, x, y, { fam: L.fam, size: L.size, w: L.w, col: C(L.col), align, alpha: a });
    }
    function box(i, t) {
      const S = R[i]; if (!S || !LAID) return null; const st = stateOf(S, t) || { i: 0 }, lay = S.lays[st.i], x0 = startX(S, lay) - S.preW * S.size;
      return { x0, x1: x0 + (lay.w + S.preW + S.sufW) * S.size, y0: S.y - S.capH * S.size / 2, y1: S.y + S.capH * S.size / 2, size: S.size, value: S.vals[st.i] };
    }

    // ---------- soft falloff on the plane (a sheet with edges) ----------
    function sheet(g) {
      if (!SHEET) return;
      const [r, gg, b] = rgbOf(P.bg);
      g.save(); g.translate(CX + SHEET.x, CY + SHEET.y); g.scale(SHEET.rx, SHEET.ry);
      const RR = 1.6, gr = g.createRadialGradient(0, 0, 0, 0, 0, RR);      // r <= 1: soft falloff down to floor; 1 -> 1.6: back to the full stage color (the plane's edge is never visible)
      for (let i = 0; i <= 16; i++) { const k = i / 16 * RR, vis = k <= 1 ? SHEET.floor + (1 - SHEET.floor) * Math.pow(1 - sstep(0, 1, k), SHEET.pow) : SHEET.floor * (1 - sstep(1, RR, k)); gr.addColorStop(i / 16, `rgba(${r},${gg},${b},${(1 - vis).toFixed(4)})`); }
      g.fillStyle = gr; g.fillRect(-6, -6, 12, 12); g.restore();
    }
    // ---------- side depth of field (screen space, along the plane's x axis) ----------
    function dof(g, c) {
      if (!DOF) return;
      const w = sstep(DOF.z0, DOF.z1, c.s); if (w <= .02) return;
      const src = XM.canvas('xm-roll-dofS'); src.g.drawImage(g.canvas, 0, 0);
      const B = XM.canvas('xm-roll-dofB'); XM.tex.blurClamp(B.g, src.c, DOF.px * w);
      const a = c.th * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), r0 = DOF.r0, r1 = DOF.r1, cx = CX + c.x, cy = CY + c.y;
      const gr = B.g.createLinearGradient(cx - dx * r1, cy - dy * r1, cx + dx * r1, cy + dy * r1);
      for (let i = 0; i <= 20; i++) { const u = i / 20, d = Math.abs(u * 2 - 1) * r1, v = sstep(r0, r1, d); gr.addColorStop(u, `rgba(0,0,0,${v.toFixed(4)})`); }
      B.g.globalCompositeOperation = 'destination-in'; B.g.fillStyle = gr; B.g.fillRect(0, 0, W, H);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(B.c, 0, 0); g.restore();
    }

    // ---------- one frame ----------
    let exitDist = null;
    function frame(g, t) {
      layout();
      const c = camAt(t), ke = exitK(t);
      api.now = c;                           // this frame's camera (read api.now.s in a scene to keep grid line width constant on screen)
      let dyE = 0;
      if (EXIT && EXIT.kind === 'rise' && ke > 0) {
        if (exitDist == null) {      // travel until the content's bottom edge just leaves the top of the frame (screen space, camera at the end of the exit)
          const ce = camAt(EXIT.at + EXIT.dur), bot = Math.max(...R.map(S => S.y + S.capH * S.size / 2 + (S.label && S.label.pos === 'below' ? S.label.size * 1.6 : 0)));
          exitDist = CY + ce.y + (bot - CY) * ce.s; }
        const dE = EXIT.dist ?? exitDist;
        dyE = -dE * (.1 * ke + .9 * Math.pow(ke, 5));       // starts at a few px per frame and accelerates
      }
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = P.bg; g.fillRect(0, 0, W, H);
      const a = c.th * Math.PI / 180, cs = Math.cos(a) * c.s, sn = Math.sin(a) * c.s, ex = CX + c.x, ey = CY + c.y + dyE;
      g.setTransform(cs, sn, -sn, cs, ex - (cs * CX - sn * CY), ey - (sn * CX + cs * CY));
      DS.stage(g, P);                        // stage material is drawn on the plane: XM.tex.use(…, { stage:'grid' | 'paper' | … }) rotates and scales with it
      sheet(g);
      R.forEach(S => {
        drawLabel(g, S, t);
        let col = S.col;
        if (S.fin && t >= S.land) { const kc = cl((t - S.land) / S.fin.dur); drawRollGroup(g, S, t, col); if (kc > 0) { g.save(); g.globalAlpha *= kc; drawRollGroup(g, S, t, S.fin.col); g.restore(); } return; }
        drawRollGroup(g, S, t, col);
      });
      if (o.draw) { g.save(); o.draw(g, t, api); g.restore(); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      dof(g, c);
      // exit blur: rise blurs over its last 35% (up to 6 px); blur / fade act over the whole exit
      if (EXIT && ke > 0) {
        const px = EXIT.kind === 'rise' ? 6 * Math.pow(cl((ke - .65) / .35), 1.5) : EXIT.kind === 'blur' ? 10 * quintOut(ke) : 0;
        const fade = EXIT.kind === 'rise' ? 0 : EXIT.kind === 'blur' ? sstep(.3, 1, ke) : ke;
        if (px > .25) { const S = XM.canvas('xm-roll-exitS'); S.g.drawImage(g.canvas, 0, 0); g.fillStyle = P.bg; g.fillRect(0, 0, W, H); XM.tex.blurClamp(g, S.c, px); }
        if (fade > 0) { g.globalAlpha = fade; g.fillStyle = P.bg; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
      }
    }

    const api = { P, now: { s: 1, th: 0, x: 0, y: 0, p: 1 }, box: (i, t) => box(i, t ?? 0), cam: camAt, rolls: R, land: R.map(S => S.land), times: R.map(S => S.T.slice()) };
    const shot = XM.shot({ bg: P.bg, stage: 'flat' }, () => (g, t) => {
      frame(g, t);
      if (o.hud !== false) DS.hud(g, t, P, { ...(o.hud || {}) });
    });
    shot.cues = cues; shot.api = api;
    return shot;
  }

  Object.assign(XM, { numberRoll });
})();
