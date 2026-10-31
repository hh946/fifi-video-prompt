// XS.evidence / XS.doc: evidence screenshots and highlighted source quotes, built on the XM design system (xm-ds.js).
//   XS.evidence(o) puts a real screenshot in a minimal browser / phone frame and walks through it (push-in, highlighter, brackets,
//   underline, callout labels, verdict stamps). XS.doc(o) shows a quote as a specimen card (accent quote block, mono source line,
//   large serif text, highlighted phrases, optional translation / note). Docs: docs/components/xs-text.md
// This file also defines XS.phones and XS.mosaic, and replaces the same-named versions from xk-shots.js:
//   Object.assign(XS, { evidence, doc, phones, mosaic }).
// Load after lib.js, xk.js, xk-shots.js, xm-core.js, xm-ds.js. All Canvas 2D (XM.shot), deterministic.
// Real screenshots are loaded with XM.image(src) and drawn with drawImage (works under file://; screenshot pixels are never read back with getImageData,
//   except for the optional print.rough effect).
//
// Shared conventions
//   tone : 'ink'|'paper'|'accent' stage. Omitted = follow the caller (XK.tone('paper', () => XS.doc(...)) -> paper; default dark theme -> ink).
//          Legacy bg:'accent' equals tone:'accent'; other bg values are ignored.
//   at   : entry time (absolute s).
//   hud  : { tl, bl, br } | false   standard corner HUD (XM.DS.hud). br is the material category: screenshot (evidence), original text (doc), screenshot or illustrative (phones), illustrative (mosaic).
//   hit  : false (default, calm: no shake, no bounce) | true (a very short 1.04 -> 1 punch when a stamp lands / the mosaic locks).
//   cam  : XK camera keyframes [[t, fx, fy, s]] (passed to XM.shot). evidence's focus is an internal push; use one or the other.
//   Returns { L, update, cues } for XK.seq; cues are suggested sound effects per event [{t, name, gain}] (names from XM.DS.SFX);
//   add them with window.SFX_CUES.push(...shot.cues) when needed.
//   Colours: on the ink stage DS swaps an accent that is too dark for a light variant (text and thin lines only); large colour areas
//   (own chat bubbles, quote block, mosaic sweep) keep the theme accent (fillAcc) so each video stays one colour.
//
// ───────────────────────────── XS.evidence(o): evidence screenshot ─────────────────────────────
// For lines like "the changelog says...", "their announcement reads...", "a screenshot someone posted". The screenshot sits in a minimal
// browser / phone frame with corner viewfinder brackets and a category label; as the voiceover reaches each point: push in to that
// line -> highlighter / closing brackets / underline -> callout label -> verdict stamp.
//   src, iw, ih   screenshot path and its pixel size (required).
//   crop:[x,y,w,h] visible region of the screenshot (px), default the whole image.
//   dw            screenshot width on stage (default 1240). Cards taller than 800 shrink automatically (room for corner text).
//   frame         'browser' (default: 64 px thin address bar, no traffic-light dots) | 'phone' (ink phone body) | 'none' (screenshot + thin border)
//   url           address-bar URL (decoration, typed out over 0.4 s on entry). Omitted = empty address bar.
//   page          'light' (default) | 'dark': the screenshot's own brightness. Sets the bar colour, highlight blend (light multiply /
//                 dark difference) and bracket colour. Legacy chrome:'dark' equals page:'dark'.
//   pose          [[t, { x, y, s, rz, op }]] card placement keyframes (XK.poseKf). Default centred, slightly low. rx / ry / z / blur not supported (flat card).
//   focus         [[t, ix, iy, zoom]] push keyframes: screenshot pixel coords + zoom, easeInOutCubic between keys. That point moves to frame centre.
//   marks         [{ x, y, w, h, at, dur, mode, color, blend, opacity, note }] in screenshot pixels.
//                 mode 'sweep' (default, marker yellow brushed left to right) | 'box' (corner brackets closing in, XM.mark.bracket)
//                 | 'under' (accent underline drawn left to right).
//                 dur default sweep .5 / under .4. Highlights (sweep) are always marker yellow, color ignored: multiply on light pages,
//                 difference on dark pages, both read as "yellow behind dark text".
//                 box / under pick a colour with ≥ 3:1 contrast to the screenshot (color is preferred, replaced if contrast is too low).
//                 note:{ text, x, y, at, align } a label at stage coords (x, y) with a leader line from this mark (XM.mark.callout, 56 px).
//   stamps        [{ text, x, y, at, size, rot, color }] verdict stamps (XM.mark.stamp), stage coords.
//   label         small category text above the viewfinder, default: a 'screenshot' tag. out: exit time (0.25 s fade, optional).
//   Also returns toStage(ix, iy, t): screenshot pixel -> stage coords at frame t (ignores rz).
//
//   ── Old-web print look and typed translation bar (all off by default) ──
//   marks[].mode 'typeBar'  an ink bar grows left to right over English text on the screenshot (headline / key sentence); its right
//                 edge is the typing front that reveals a CJK translation (SerifSC, squeezed) char by char. The front starts slow,
//                 surges, then has a long tail. The bar begins as a 3 px vertical line (cursor).
//                 { mode:'typeBar', text (CJK, required), at (cursor appears, required), x, y, w, h (ink box of the English to cover, screenshot px, required),
//                   over (bar overhang beyond that box: number or [l,t,r,b], screenshot px; default [.03,.09,.01,.09] × h),
//                   size (CJK size, screenshot px; default from bar height), weight:600 (font weight; w is the English box width, don't mix them up),
//                   squeeze:.76 (auto down to .6 if it doesn't fit),
//                   pad:[l,t,r,b] (bar beyond the CJK ink × size; default [.28,.26,.45,.30], with ghost [.28,.40,.45,.72]),
//                   dur:1.7 (stretches the default front curve) or keys:[[s after at, 0..1, ease], ...] (your own front curve),
//                   ghost:{ text (required), size:1.7 (× CJK size), w:800, sq:.9, dx:-.75, dy:.035 (× CJK size), color, alpha }
//                   (optional: the original title in dark italic PlayIt showing through the lower half of the bar),
//                   color (text, default off-white), bar (bar colour, default ink), gain (typing volume) }
//                 The CJK text must be ≥ 56 px on screen (size × dw/crop.w × focus zoom), else console.warn. Sound: typing, lasting the typing.
//   print         old-web print look: true or { rough (rough edges: true | { amp:1, cell:3.6, amp2:.12, cell2:1.2 }, stage px at card scale 1; false = off),
//                   boil:6 (re-jitter the rough edge every 6 frames; false = static), stain:0..1 or { a, scale } (grey mottling that moves with the page),
//                   band:true | { y, h, color:'mark'|'accent'|'#hex' } (header band: ink masthead above y, then a colour band fading into the page;
//                   screenshot px, default at the crop top, h = .02 × crop width), seed }
//                 The rough edge jitters the bars too (they are on the page); edge blur + vignette come from XM.tex.use(shot, { post:'web' }).
//   enter:'cut'   hard cut in: no rise, no loading, brackets already in place (page after page while the camera keeps moving). No 3D.
//   focus keyframes take an optional 5th column ease ('linear'|'easeIn'|'easeOut'|'easeInOut'|'expoOut' or a function, at the arriving key; flat card only).
//                 Use 'linear' for dense keyframes (e.g. a per-frame camera table), otherwise per-segment easeInOut stutters.
//
// ───────────────────────────── XS.doc(o): highlighted source quote ─────────────────────────────
// For lines like "the announcement says, word for word...", "this sentence in the paper", "he posted...". A specimen-card quote:
// accent quote block on the left, mono source line on top, large serif text (SerifSC, default 76 px, min 64), key phrases highlighted
// (yellow behind, text turns ink, readable on all three stages), plus an optional translation / note label.
//   lines   : [str] the quote, one sentence per line (2–4 lines, ≤ 18 CJK chars each recommended). Font shrinks to fit 1340 px width.
//   src     : source line (mono, e.g. 'Official reply · user feedback group'). meta: small text right of the source line (date / page, optional).
//   size    : font size (default 76, auto-shrinks, min 64). cls / fam: 'serif' (default) | 'zh' (sans, for casual social-media quotes).
//   mark    : { line, from, to, find, at, dur, color } or an array. line = line index; from/to = char indices (to exclusive);
//             or find:'phrase' to use its first occurrence. dur default .5.
//   note    : { text, at, mark, x, y, align } note / translation label (XM.mark.callout, 56 px), with a leader from the bottom of highlight
//             number mark (default 0); placed below the quote by default; x / y set stage coords.
//   push    : default true: each highlight pushes in 2.5% (fixed point halfway between frame centre and the highlight, so the left side
//             never leaves frame; max 1.05) and dims the other lines to 50%; false = off.
//   trans   : { text, at } optional translation line (sans 56, mute colour) fading in under the quote. For quotes in English.
//   at      : entry (quote block wipes in -> source line types -> quote lines rise one by one, .14 s apart).
//   Legacy paper / ink / pose / sway / bgWord are ignored; note.color is ignored.
//
// ───────────────────────────── XS.phones(o): phone chat / notification ─────────────────────────────
// One large phone; the view frames only the relevant messages (lower half of the phone off frame).
//  ① real screenshot: src, iw, ih, crop:[x,y,w,h] (crop.w fills the screen width; crop.y = screenshot y at the top of the screen initially),
//     scroll:[[t, iy]] scroll keyframes (screenshot px y, easeInOutCubic), marks as in evidence (screenshot px, incl. note).
//  ② chat bubbles: msgs:[{ from:'me'|'them', text, at, name, typing, key }]
//     text = bubble text (56 px, wraps); typing: seconds of "typing..." dots before at; name = sender name (30 px, optional);
//     key:true marks the key message: 0.45 s after it lands, brackets close in and other messages dim (or focus:[{ at, i }]).
//     title / sub: header title (56 px) and subtitle (becomes the typing indicator while typing). avatar: one char in the avatar (default title's first char).
//   push   : default true: when the focus message lands the camera pushes in 4% around it, and back when focus clears (focus i:-1); false = off.
//   notes  : [{ i, text, at, side:'right'|'left', y }] labels outside the phone with a leader from message i (screenshot mode: marks[].note).
//   stamps : [{ text, x, y, at, size, rot }] verdict stamps.
//   x / w / top : phone centre x (default centred; with notes it slides left to 720 0.55 s before the first note; fixed if given),
//                 body width (default 900), screen top y (default 92).
//   screen : 'light' (default) | 'dark' screen brightness (chat mode).
//   Legacy phones:[{ x, kind:'chat'|'list', data, title }] uses only the first phone: chat data.msgs (side:'r' -> me), list data.rows
//   (title -> name, sub -> text) become msgs; focus:[{ phone, row, at }] still works (row = message index). cursor / pose / several phones are not supported.
//
// ───────────────────────────── XS.mosaic(o): tile word ─────────────────────────────
// Solid small tiles fly in from all sides and lock into a grid forming a big word, then a light sweep passes over it; no confetti.
//   text   : the word (1–4 chars best). at: start (default 0). dur: per-tile flight (default .8; tiles staggered up to .35 s).
//   size   : font size (default by char count: 2 chars 440, shrinks to width ≤ 1500). cell: tile pitch (default 24). y: word centre y (default 500).
//   font   : 'zh' (default, Source Han Sans 900) | 'unb' (Unbounded 900 for Latin). scatter: flight distance (default 900).
//   sub    : 'a sentence' or { text, at } caption under the word (64 px, default .15 s after lock). kicker: small mono text above (decoration).
//   sweep  : { at, dur } light sweep (default .45 s after lock, 1.2 s long); false = off. Lock time = at + dur + .35.
//   Legacy palette is ignored (stage colours only); bg / scatter / font / y / size / cell still work.
(() => {
  const { W, H } = XK;
  const DS = XM.DS, MK = XM.mark, SZ = DS.S, SAFE = DS.SAFE, SFX = DS.SFX;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const EO = XM.expoOut;
  const io3 = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const pr = (t, a, d) => cl((t - a) / d);
  const lin = (a, b, k) => a + (b - a) * k;

  function toneOf(o) { if (o.tone) return o.tone; if (o.bg === 'accent') return 'accent'; return XK.TH.dark ? 'ink' : 'paper'; }
  function pc(P, c, d) {
    if (c == null) return d;
    const m = { accent: P.accent, accent2: P.accent, warn: P.warn, text: P.fg, fg: P.fg, mute: P.mute, line: P.fg, bg: P.bg, mark: P.mark };
    return m[c] || XK.col(c);
  }
  // Large accent areas: theme accent + contrasting text (no light swap on the ink stage)
  function fillAcc(P) { if (P.stage !== 'ink') return [P.accent, P.onAccent]; const A = XK.col('accent'); return [A, DS.lum(A) > .55 ? DS.INK : DS.PAPER]; }
  // Line colour that must stand out on light screenshots / light phone screens: theme accent, or ink if it's too light
  function accOnLight() { const A = XK.col('accent'); return DS.lum(A) < .6 ? A : DS.INK; }
  function cueList() { const L = []; L.add = (t, name, gain = .7, x = {}) => { if (isFinite(t)) L.push({ t: +t.toFixed(3), name, gain, ...x }); }; return L; }
  function shell(o, P, build) { return XM.shot({ bg: P.bg, stage: 'flat', cam: o.cam }, build); }
  function hudOf(g, t, P, o, def) { if (o.hud === false) return; DS.hud(g, t, P, { tl: def.tl, br: def.br, ...(o.hud || {}) }); }
  const MG = () => XM.canvas('xs-text-measure', 8, 8, false).g;
  // Don't cache layouts before fonts are loaded (render.js waits for fonts, but a preview page may call one frame early)
  function lazy(fn) { let v = null; return () => { if (v) return v; const r = fn(); if (!document.fonts || document.fonts.status === 'loaded') v = r; return r; }; }
  // Keyframe interpolation (easeInOutCubic between keys): keys [[t, a, b, c...]], idx = column, def = default
  // focus keyframes ([t, ix, iy, zoom, ease]) may override a segment's easing in the 5th column; omitted = easeInOutCubic
  const EZ = { linear: k => k, easeIn: k => k * k * k, easeOut: k => 1 - Math.pow(1 - k, 3), easeInOut: io3, expoOut: EO };
  function kfv(keys, t, idx, def) {
    const v = i => keys[i][idx] ?? def;
    if (t <= keys[0][0]) return v(0);
    for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) { const e = keys[i][4], f = typeof e === 'function' ? e : (EZ[e] || io3);
      return lin(v(i - 1), v(i), f((t - keys[i - 1][0]) / Math.max(1e-6, keys[i][0] - keys[i - 1][0]))); }
    return v(keys.length - 1);
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
  // Wrapping: never split English words / numbers
  function wrap(s, o, maxW) {
    const g = MG(), toks = String(s).match(/[A-Za-z0-9.\-_/~@#%&+:']+|\s+|./gu) || [];
    const out = []; let cur = '';
    for (const tk of toks) {
      const nx = cur + tk;
      if (cur && XM.measure(g, nx.trimEnd(), o) > maxW) { out.push(cur.trimEnd()); cur = tk.trimStart(); } else cur = nx;
    }
    if (cur.trim()) out.push(cur.trimEnd());
    return out;
  }

  // ---------- Screenshot marks (shared by evidence and phones screenshot mode): drawn in a context already transformed "screenshot coords -> stage" ----------
  // map(ix, iy) -> current context coords; s: screenshot px -> context px; page 'light'|'dark'
  function drawMarks(g, t, marks, map, s, P, page, layer) {
    for (const m of marks) {
      const mode = m.mode || 'sweep', [x, y] = map(m.x, m.y), w = m.w * s, h = m.h * s;
      if (layer === 'in' && mode === 'sweep') {
        const k = io3(pr(t, m.at, m.dur || .5));
        MK.sweep(g, x - 4, y, w + 8, h, P, k, { on: page, blend: m.blend, alpha: m.opacity });      // highlights are always marker yellow; blend chosen by page brightness
        if (m.lead) { const L = leadOf(m); MK.lead(g, x - 4, y, w + 8, h, P, io3(pr(t, L.at, L.dur)), k); }   // underline first (right to left), hidden as the brush passes
      } else if (layer === 'in' && mode === 'under') {
        const k = EO(pr(t, m.at, m.dur || .4)), th = Math.max(5, (m.th || 6) * s);
        if (k > 0) { g.fillStyle = DS.pick(page === 'dark' ? '#111111' : '#ffffff', [pc(P, m.color, accOnLight()), accOnLight(), DS.MARK, DS.INK, DS.PAPER]); g.fillRect(x, y + h - th, w * k, th); }
      } else if (layer === 'over' && mode === 'box') {
        const k = DS.in(t, m.at, .45);
        MK.bracket(g, x, y, w, h, P, k, { on: page, color: pc(P, m.color, accOnLight()), pad: 12, len: Math.max(18, Math.min(34, h * .5)), lw: 5 });
      }
    }
  }
  // Lead underline: lead:true or { at, dur }; default starts .5 s before the highlight and takes .3 s (then .2 s pause before the brush)
  function leadOf(m) { const L = m.lead === true ? {} : m.lead; return { at: L.at ?? m.at - .5, dur: L.dur ?? .3 }; }
  function markCues(cues, marks) {
    for (const m of marks || []) {
      const mode = m.mode || 'sweep';
      if (mode === 'typeBar') { if (isFinite(m.at)) cues.add(m.at + 2 / 30, SFX.type, m.gain ?? .35, { dur: +tbTypeDur(m).toFixed(3) }); if (m.note) cues.add(m.note.at ?? m.at + .4, SFX.callout, .5); continue; }
      cues.add(m.at, mode === 'box' ? SFX.bracket : SFX.sweep, mode === 'box' ? .55 : .5);
      if (m.note) cues.add(m.note.at ?? m.at + .4, SFX.callout, .5);
    }
  }
  // ───────────── Old-web print look (print) + typed translation bar (marks mode:'typeBar') ─────────────
  const TBK = {
    w: 600, sq: .76, sqMin: .6, cursor: .03,
    pad: [.28, .26, .45, .30], padGhost: [.28, .40, .45, .72],   // bar beyond the CJK ink, l/t/r/b (× size): plain translation bar / bar over a headline (more at the bottom so the original title shows through)
    over: [.03, .09, .01, .09],                                    // bar beyond the English ink box it covers, per side (× box height)
    ghost: { size: 1.7, w: 800, sq: .9, dx: -.75, dy: .035, dark: .845 },   // original title: PlayIt 800, 1.7 × size, .9 wide; starts .75 size left of the bar's left edge, baseline .035 size below the bar bottom (only the top half shows)
    // Fraction of width covered by the typing front, per frame at 30 fps: crawls for ~10 frames, surges at frames 12–14 (15% of the width per frame), then a long tail
    front: [0, .0007, .003, .0072, .0127, .0201, .0286, .0409, .0556, .0759, .1027, .1412, .2013, .3089, .4564, .5544, .6199, .6687, .7074, .7386, .7652,
      .7894, .8103, .8276, .8438, .8591, .8715, .8837, .8953, .9051, .9143, .9231, .9308, .9381, .9447, .9502, .9561, .9613, .9665, .9709, .9748, .9782,
      .9813, .9851, .9874, .9903, .9925, .9951, .9966, .9987, .9998, 1],
    alpha: [[-.5, 0], [0, .3], [1, .75], [2, 1]],                  // cursor (the bar's initial vertical line) opacity: [frames after at, α]
  };
  TBK.dur = (TBK.front.length - 1) / 30;
  const hexRGB = h => { const m = String(h).match(/rgba?\(([^)]+)\)/); if (m) return m[1].split(',').slice(0, 3).map(v => Math.round(parseFloat(v)));
    h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
  const ROUGH = { amp: 1, cell: 3.6, amp2: .12, cell2: 1.2 };     // rough edge: low-frequency wave + a little fine noise (stage px at card scale 1)
  const FPS = () => (window.VIDEO && VIDEO.fps) || 30;
  function kfE(keys, t) {             // [[t, v, ease]], ease at the arriving key, default linear
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) { const e = keys[i][2], f = typeof e === 'function' ? e : (EZ[e] || EZ.linear);
      return lin(keys[i - 1][1], keys[i][1], f((t - keys[i - 1][0]) / Math.max(1e-6, keys[i][0] - keys[i - 1][0]))); }
    return keys[keys.length - 1][1];
  }
  function tbFront(m, t) {            // -> 0..1 fraction of width covered by the front
    const dt = t - m.at;
    if (m.keys) return cl(kfE(m.keys, dt));
    const f = dt * (TBK.dur / (m.dur || TBK.dur)) * 30, A = TBK.front;
    if (f <= 0) return 0; if (f >= A.length - 1) return 1;
    const i = Math.floor(f); return lin(A[i], A[i + 1], f - i);
  }
  const tbAlpha = (m, t) => cl(kfE(TBK.alpha, (t - m.at) * 30));
  function tbTypeDur(m) {             // typing sound length: from the cursor settling (at + 2 frames) to the front reaching 96% (text essentially typed)
    for (let s = 0; s < 12; s += 1 / 60) if (tbFront(m, m.at + s) >= .96) return Math.max(.2, s - 2 / 30);
    return 1;
  }
  // Displacement-noise rough edge: each pixel samples through a smooth noise displacement field (bilinear), giving photocopy-like jagged text / bar edges. Lengths are in this canvas's pixels
  function roughen(c, o, seed) {
    const w = c.width, h = c.height, g = c.getContext('2d', { willReadFrequently: true });
    let src; try { src = g.getImageData(0, 0, w, h); }
    catch (e) { if (!roughen.warned) { console.warn('XS.evidence print.rough: cannot read the screenshot pixels (the preview page was opened without --allow-file-access-from-files); skipping the rough edge'); roughen.warned = true; } return; }
    const S = src.data, out = g.createImageData(w, h), D = out.data;
    const field = (cell, sd) => {
      const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, r = XM.rng(sd), A = new Float32Array(gw * gh);
      for (let i = 0; i < A.length; i++) A[i] = r() * 2 - 1;
      return (x, y) => { const fx = x / cell, fy = y / cell, i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, p = j * gw + i;
        const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
        return (A[p] * (1 - su) + A[p + 1] * su) * (1 - sv) + (A[p + gw] * (1 - su) + A[p + gw + 1] * su) * sv; };
    };
    const fx1 = field(o.cell, seed), fy1 = field(o.cell, seed + 11), fx2 = field(o.cell2, seed + 23), fy2 = field(o.cell2, seed + 37);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sx = x + o.amp * fx1(x, y) + o.amp2 * fx2(x, y), sy = y + o.amp * fy1(x, y) + o.amp2 * fy2(x, y);
      sx = Math.min(w - 1.001, Math.max(0, sx)); sy = Math.min(h - 1.001, Math.max(0, sy));
      const x0 = sx | 0, y0 = sy | 0, ax = sx - x0, ay = sy - y0, i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4, q = (y * w + x) * 4;
      for (let ch = 0; ch < 4; ch++) D[q + ch] = (S[i00 + ch] * (1 - ax) + S[i10 + ch] * ax) * (1 - ay) + (S[i01 + ch] * (1 - ax) + S[i11 + ch] * ax) * ay;
    }
    g.putImageData(out, 0, 0);
  }
  // Cache layers: slot (which card / which bar) -> last 2 copies (the rough edge re-jitters each time). draw(g) paints onto a w×h canvas; with rough, roughen it, then copy to a normal canvas (faster GPU drawing)
  const LAYERS = new Map();
  function cachedLayer(slot, key, w, h, draw, rough, seed) {
    let S = LAYERS.get(slot); if (!S) { S = new Map(); LAYERS.set(slot, S); }
    if (S.has(key)) return S.get(key);
    const cpu = document.createElement('canvas'); cpu.width = w; cpu.height = h;
    const cg = cpu.getContext('2d', { willReadFrequently: !!rough }); draw(cg);
    let c = cpu;
    if (rough) { roughen(cpu, rough, seed); c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(cpu, 0, 0); cpu.width = cpu.height = 0; }
    if (S.size >= 2) { const k0 = S.keys().next().value, o0 = S.get(k0); if (o0 !== c) { o0.width = o0.height = 0; } S.delete(k0); }
    S.set(key, c); return c;
  }
  let SLOT = 0;
  function printOf(p) {
    if (!p) return null;
    const o = p === true ? {} : p;
    const rough = o.rough === false ? null : { ...ROUGH, ...(o.rough && typeof o.rough === 'object' ? o.rough : {}) };
    const st = typeof o.stain === 'number' ? { a: o.stain } : (o.stain || { a: 0 });
    return { rough, boil: rough && o.boil !== false ? (o.boil ?? 6) : 0, stain: { a: st.a ?? .6, scale: st.scale ?? 1 }, band: o.band ? (o.band === true ? {} : o.band) : null, seed: o.seed ?? 7 };
  }
  // Grey mottling that moves with the page (patchy, darkens up to ~20%): a low-res greyscale map multiplied onto the page
  function stainLayer(w, h, k, a, scale, seed) {     // w×h in page-layer px, k = page-layer px / card px
    const R = 3 * k, sw = Math.ceil(w / R) + 1, sh = Math.ceil(h / R) + 1, c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const q = c.getContext('2d'), d = q.createImageData(sw, sh), r = XM.rng(seed * 13 + 3);
    const grid = (cell, sd) => { cell = cell * scale / 3; const gw = Math.ceil(sw / cell) + 2, gh = Math.ceil(sh / cell) + 2, R2 = XM.rng(sd), A = new Float32Array(gw * gh); for (let i = 0; i < A.length; i++) A[i] = R2();
      return (x, y) => { const fx = x / cell, fy = y / cell, i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), p = j * gw + i;
        return (A[p] * (1 - su) + A[p + 1] * su) * (1 - sv) + (A[p + gw] * (1 - su) + A[p + gw + 1] * su) * sv; }; };
    const env = grid(320, seed + 1), n1 = grid(46, seed + 11), n2 = grid(19, seed + 12), n3 = grid(7, seed + 13);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const e = cl((env(x, y) - .42) / .3), n = .56 * n1(x, y) + .34 * n2(x, y) + .10 * n3(x, y);
      const b = cl((n - .5) / .16) * e * e, f = 1 - .22 * a * b * (.45 + .55 * r());
      const p = (y * sw + x) * 4, v = Math.round(255 * f); d.data[p] = d.data[p + 1] = d.data[p + 2] = v; d.data[p + 3] = 255;
    }
    q.putImageData(d, 0, 0); return c;
  }
  // Bar layout (screenshot px): bar [x0,y0,x1,y1], CJK size / squeeze / left edge / baseline, original title (ghost)
  function tbLayout(m) {
    const g = MG(), w = m.weight ?? TBK.w, gh = m.ghost ? { ...TBK.ghost, ...m.ghost } : null;
    const [pl, pt, pr, pb] = m.pad || (gh ? TBK.padGhost : TBK.pad);
    let ov = m.over ?? TBK.over.map(k => k * m.h); if (typeof ov === 'number') ov = [ov, ov, ov, ov];
    g.font = `${w} 100px SerifSC`; g.letterSpacing = '0px';
    const mm = g.measureText(m.text), ia = mm.actualBoundingBoxAscent / 100, id = mm.actualBoundingBoxDescent / 100, nat = mm.width / 100;
    let y0 = m.y - ov[1], y1 = m.y + m.h + ov[3];
    const size = m.size ?? (y1 - y0) / (pt + ia + id + pb);
    if (m.size != null) { const need = size * (pt + ia + id + pb), c = (y0 + y1) / 2; y0 = c - need / 2; y1 = c + need / 2; }
    const x0 = m.x - ov[0], tx = x0 + pl * size, boxR = m.x + m.w + ov[2];
    let sq = m.squeeze ?? TBK.sq;
    if (m.squeeze == null) { const room = boxR - pr * size - tx; if (room > 0 && nat * size * sq > room) sq = Math.max(TBK.sqMin, room / (nat * size)); }
    const x1 = Math.max(boxR, tx + nat * size * sq + pr * size), base = y0 + (pt + ia) * size;
    // Original title colour: marker yellow darkened by 84.5% (a dark olive), still the design system's yellow
    const darkMark = () => { const h = DS.MARK.replace('#', ''); return 'rgb(' + [0, 2, 4].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - gh.dark))).join(',') + ')'; };
    const G = gh ? { ...gh, s: gh.size * size, x: x0 + gh.dx * size, y: y1 + gh.dy * size, color: gh.color || darkMark() } : null;
    return { x0, y0, x1, y1, size, sq, tx, base, w, G, cur: TBK.cursor * size, M: Math.max(4, size * .08) };
  }
  // The bar layer (bar + original title + CJK), drawn in screenshot pixel coords, q = layer px / screenshot px
  function tbPaint(m, L, q) {
    return g => {
      g.setTransform(q, 0, 0, q, -(L.x0 - L.M) * q, -(L.y0 - L.M) * q);
      g.fillStyle = m.bar || DS.INK; g.fillRect(L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0);
      g.save(); g.beginPath(); g.rect(L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0); g.clip();
      if (L.G) { const G = L.G; XM.note('PlayIt', G.text);
        g.save(); g.globalAlpha *= G.alpha ?? 1; g.font = `${G.w} ${G.s}px PlayIt`; g.fillStyle = G.color; g.textBaseline = 'alphabetic';
        g.translate(G.x, G.y); g.scale(G.sq, 1); g.fillText(G.text, 0, 0); g.restore(); }
      XM.note('SerifSC', m.text);
      g.font = `${L.w} ${L.size}px SerifSC`; g.fillStyle = m.color || DS.PAPER; g.textBaseline = 'alphabetic';
      g.translate(L.tx, L.base); g.scale(L.sq, 1); g.fillText(m.text, 0, 0);
      g.restore();
    };
  }
  function tbCheck(m) {
    const miss = ['text', 'at', 'x', 'y', 'w', 'h'].filter(k => m[k] == null);
    if (miss.length) { console.error(`XS.evidence typeBar: missing ${miss.join(' / ')} (the translated text, the time and the box of English text to cover are set from the voice-over and the screenshot; there are no defaults)`); return false; }
    if (m.ghost && !m.ghost.text) { console.error('XS.evidence typeBar: ghost needs text (the original text showing through under the bar)'); return false; }
    return true;
  }

  function drawStamps(g, t, P, stamps) {
    for (const s of stamps || []) MK.stamp(g, s.x ?? W - 520, s.y ?? H - 260, s.text, P, DS.hit(t, s.at, .14), { size: s.size || 110, rot: s.rot ?? -7, color: pc(P, s.color, P.warn) });
  }
  function hitPunch(o, t, list) {
    if (!o.hit) return 1;
    let s = 1; for (const a of list) if (t >= a) s = Math.max(s, 1 + .04 * (1 - EO(pr(t, a, .3))));
    return s;
  }

  // Opening quote mark (hand-drawn: a dot with a tail flicking up-right; the font glyph is full-width right-aligned in CJK fonts and looks like two slashes in Latin fonts)
  function quoteMark(g, x, y, r) {
    g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    g.beginPath(); g.moveTo(x - r, y + 1);
    g.bezierCurveTo(x - r * 1.05, y - r * 1.9, x - r * .1, y - r * 2.7, x + r * 1.05, y - r * 3);
    g.lineTo(x + r * 1.05, y - r * 2.35);
    g.bezierCurveTo(x + r * .1, y - r * 2.05, x - r * .25, y - r * 1.4, x - r * .1, y - r * .95);
    g.closePath(); g.fill();
  }
  // ---------- Phone body ----------
  function phoneBody(g, x, y, w, h, r, P) {
    const body = P.stage === 'ink' ? '#202127' : '#0b0c0f';
    g.fillStyle = body;
    g.fillRect(x - 5, y + 250, 7, 96); g.fillRect(x - 5, y + 372, 7, 96); g.fillRect(x + w - 2, y + 310, 7, 150);   // side buttons
    rrect(g, x, y, w, h, r); g.fill();
    g.strokeStyle = P.stage === 'ink' ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.12)'; g.lineWidth = 2;
    rrect(g, x + 2, y + 2, w - 4, h - 4, r - 2); g.stroke();
  }

  // =====================================================================
  // XS.evidence
  // =====================================================================
  function evidence(o) {
    const P = DS.tone(toneOf(o)), cues = cueList();
    const at = o.at ?? (o.pose && o.pose[0] ? o.pose[0][0] : 0);
    const stamps = o.stamps || [];
    // One screenshot card (the main card and each card in chain): size, screenshot px -> card coords, drawing
    function makeCard(c, cat) {
      const page = c.page || o.page || (o.chrome === 'dark' ? 'dark' : 'light');
      const cr = c.crop || [0, 0, c.iw, c.ih], fr = c.frame || o.frame || 'browser';
      const bar = fr === 'browser' ? 64 : 0, bz = fr === 'phone' ? 20 : 0;
      let dw = Math.min(c.dw || o.dw || 1240, 1640), dh = cr[3] * dw / cr[2];
      const maxH = 800 - bar - bz * 2; if (dh > maxH) { dw *= maxH / dh; dh = maxH; }      // leave room above and below the card for corner text (HUD not covered by the screenshot)
      const sc = dw / cr[2], cw = dw + bz * 2, ch = dh + bar + bz * 2;
      const IMG = XM.image(c.src), marks = c.marks || [];
      const chromeC = page === 'dark' ? '#1c1d21' : '#e9e8e4', pageC = page === 'dark' ? '#0e0f11' : '#ffffff';
      const local = (ix, iy) => [-cw / 2 + bz + (ix - cr[0]) * sc, -ch / 2 + bar + bz + (iy - cr[1]) * sc];   // origin at card centre
      // ── Optional print look, typeBar and enter:'cut'. When none is set, everything below is empty and drawing is unchanged ──
      const cutC = c === o && o.enter === 'cut';
      const PR = printOf(c.print !== undefined ? c.print : o.print), slot = ++SLOT;
      const tbs = marks.filter(m => m.mode === 'typeBar' && tbCheck(m)), tbL = tbs.map(m => lazy(() => tbLayout(m)));
      const zMax = Math.max(1, ...(o.focus || []).map(f => f[3] || 1)) * Math.max(1, ...(o.pose || []).map(p => (p[1] && p[1].s) || 1));
      const Qflat = Math.min(2.2, zMax * (o.hit ? 1.04 : 1)), Qtex = Math.min(2, 4096 / Math.max(cw, ch));   // cache resolution: flat card by its closest push, 3D by texture scale
      const phaseOf = t => PR && PR.boil ? Math.floor(t * FPS() / PR.boil + 1e-6) : 0;
      const roughAt = Q => PR && PR.rough ? { amp: PR.rough.amp * Q, cell: PR.rough.cell * Q, amp2: PR.rough.amp2 * Q, cell2: PR.rough.cell2 * Q } : null;
      let stainC = null, sizeWarned = false;
      function printPage(g, t, flat, vx, vy) {          // screenshot -> mottling -> header band -> rough edge, cached per rough-edge phase
        const Q = flat ? Qtex : Qflat, w = Math.round(dw * Q), h = Math.round(dh * Q), ph = phaseOf(t);
        const lay = cachedLayer('pg' + slot, Q.toFixed(3) + ':' + ph, w, h, q => {
          q.imageSmoothingQuality = 'high'; q.drawImage(IMG.img, cr[0], cr[1], cr[2], cr[3], 0, 0, w, h);
          if (PR.stain.a > 0) { if (!stainC || stainC.Q !== Q) { stainC = stainLayer(w, h, Q, PR.stain.a, PR.stain.scale, PR.seed); stainC.Q = Q; }
            q.save(); q.globalCompositeOperation = 'multiply'; q.imageSmoothingQuality = 'high'; q.drawImage(stainC, 0, 0, stainC.width * 3 * Q, stainC.height * 3 * Q); q.restore(); }
          if (PR.band) {
            const B = PR.band, k = sc * Q, by = ((B.y ?? cr[1]) - cr[1]) * k, bh = (B.h ?? cr[2] * .02) * k;
            const col = B.color === 'accent' ? P.accent : (!B.color || B.color === 'mark') ? DS.MARK : B.color, [r, gg, b] = hexRGB(col);
            q.fillStyle = DS.INK; if (by > 0) q.fillRect(0, 0, w, by);
            const gr = q.createLinearGradient(0, by, 0, by + bh);
            gr.addColorStop(0, DS.INK); gr.addColorStop(.4, `rgb(${r},${gg},${b})`); gr.addColorStop(.63, `rgb(${r},${gg},${b})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
            q.fillStyle = gr; q.fillRect(0, by - .5, w, bh + .5);
          }
        }, roughAt(Q), PR.seed + ph * 101);
        g.drawImage(lay, vx, vy, dw, dh);
      }
      function drawBars(g, t, flat) {                   // bars: the whole bar (incl. CJK and original title) is drawn into a cache layer once; each frame only clips it at the front
        const Q = flat ? Qtex : Qflat, ph = phaseOf(t), R = roughAt(Q);
        tbs.forEach((m, i) => {
          if (t < m.at - 1 / 60) return;
          const a = tbAlpha(m, t), L = tbL[i](); if (a <= 0 || !L) return;
          if (!sizeWarned && !flat && L.size * sc * zMax < 56) { sizeWarned = true; console.warn(`XS.evidence typeBar "${m.text}": the text is about ${Math.round(L.size * sc * zMax)} px on screen, needs ≥ 56 (raise size, tighten crop or push in with focus)`); }
          const q = sc * Q, lw = Math.ceil((L.x1 - L.x0 + 2 * L.M) * q), lh = Math.ceil((L.y1 - L.y0 + 2 * L.M) * q);
          const lay = cachedLayer('tb' + slot + ':' + i, q.toFixed(4) + ':' + (R ? ph : 0), lw, lh, tbPaint(m, L, q), R, (PR ? PR.seed : 0) + 500 + i * 37 + ph * 101);
          const fx = L.x0 + L.cur + (L.x1 - L.x0 - L.cur) * tbFront(m, t), [lx, ly] = local(L.x0 - L.M, L.y0 - L.M), [rx] = local(fx, 0);
          g.save(); g.beginPath(); g.rect(lx - 1, ly - 1, rx - lx + 1, lh / Q + 2); g.clip();
          g.globalAlpha *= a; g.imageSmoothingQuality = 'high'; g.drawImage(lay, lx, ly, lw / Q, lh / Q); g.restore();
        });
      }
      // flat: drawn into a 3D paper texture (no soft shadow, no "loading" viewport)
      function body(g, t, flat) {
        if (!flat) { g.save(); g.shadowColor = P.stage === 'paper' ? 'rgba(40,30,10,.16)' : 'rgba(0,0,0,.45)'; g.shadowBlur = 70; g.shadowOffsetY = 26; }
        g.fillStyle = fr === 'phone' ? (P.stage === 'ink' ? '#202127' : '#0b0c0f') : chromeC;
        if (fr === 'phone') { rrect(g, -cw / 2, -ch / 2, cw, ch, 58); g.fill(); } else g.fillRect(-cw / 2, -ch / 2, cw, ch);
        if (!flat) g.restore();
        // Thin browser bar: two thin back/forward strokes + address bar (lock + typed URL), no traffic-light dots
        if (fr === 'browser') {
          const L = -cw / 2, T = -ch / 2, mc = page === 'dark' ? 'rgba(255,255,255,.42)' : 'rgba(0,0,0,.38)';
          g.strokeStyle = mc; g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
          g.moveTo(L + 38, T + 24); g.lineTo(L + 30, T + 32); g.lineTo(L + 38, T + 40); g.moveTo(L + 62, T + 24); g.lineTo(L + 70, T + 32); g.lineTo(L + 62, T + 40); g.stroke();
          const ax = L + 100, aw = Math.min(860, cw - 200);
          g.fillStyle = page === 'dark' ? '#2a2b30' : '#ffffff'; rrect(g, ax, T + 13, aw, 38, 6); g.fill();
          g.strokeStyle = mc; g.lineWidth = 2; g.strokeRect(ax + 18, T + 31, 12, 10); g.beginPath(); g.arc(ax + 24, T + 31, 4.5, Math.PI, 0); g.stroke();
          if (c.url) { const per = Math.min(.022, .42 / c.url.length);
            XM.txt(g, cutC ? c.url : XM.typed(c.url, t, cat + .2, per), ax + 44, T + 40, { fam: 'mono', size: 22, w: 500, col: page === 'dark' ? '#a3a5ab' : '#55575d' }); }
          g.fillStyle = mc; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-L - 34, T + 22 + i * 10, 2.2, 0, 6.3); g.fill(); }
          g.fillStyle = page === 'dark' ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.1)'; g.fillRect(L, T + bar - 1, cw, 1);
        }
        // Screenshot viewport: "loads" top to bottom
        const vx = -cw / 2 + bz, vy = -ch / 2 + bar + bz, rv = flat || cutC ? 1 : EO(pr(t, cat + .12, .6));
        g.save(); g.beginPath();
        if (fr === 'phone') g.roundRect(vx, vy, dw, dh * rv, [40, 40, rv > .97 ? 40 : 0, rv > .97 ? 40 : 0]); else g.rect(vx, vy, dw, dh * rv);
        g.clip();
        g.fillStyle = pageC; g.fillRect(vx, vy, dw, dh);
        if (IMG.ok) { if (PR) printPage(g, t, flat, vx, vy); else { g.imageSmoothingQuality = 'high'; g.drawImage(IMG.img, cr[0], cr[1], cr[2], cr[3], vx, vy, dw, dh); } }
        drawMarks(g, t, marks, local, sc, P, page, 'in');
        if (IMG.ok && tbs.length) drawBars(g, t, flat);
        g.restore();
        if (fr === 'none') { g.strokeStyle = P.line; g.lineWidth = 2; g.strokeRect(vx, vy, dw, dh); }
        drawMarks(g, t, marks, local, sc, P, page, 'over');
      }
      // Has the content changed (the 3D paper texture is redrawn only when it has)
      const key = t => (IMG.ok ? 1 : 0) + '|' + (c.url ? XM.typed(c.url, t, cat + .2, Math.min(.022, .42 / c.url.length)).length : 0) + '|' +
        marks.map(m => { const d = m.mode === 'box' ? .45 : m.mode === 'under' ? (m.dur || .4) : (m.dur || .5);
          const L = m.lead ? leadOf(m) : null; return Math.round(cl((t - m.at) / d) * 400) + (L ? '/' + Math.round(cl((t - L.at) / L.dur) * 200) : ''); }).join(',') +
        (tbs.length || PR ? '|' + tbs.map(m => t < m.at - 1 / 60 ? '-' : Math.round(tbFront(m, t) * 3000) + '/' + Math.round(tbAlpha(m, t) * 20)).join(',') + '|' + phaseOf(t) : '');
      return { page, cr, cw, ch, sc, local, marks, body, key, IMG, card: (ix, iy) => { const [lx, ly] = local(ix, iy); return [lx + cw / 2, ly + ch / 2]; } };
    }
    const C = makeCard(o, at), { cr, cw, ch, local, marks } = C;
    const cut = o.enter === 'cut';      // hard cut in: no rise, no loading, no 3D
    const use3d = !!((o.enter && !cut) || o.exit || (o.chain && o.chain.length));
    const pose = t => o.pose ? XK.poseKf(o.pose, t) : {};
    const toStage0 = (ix, iy, t) => { const p = pose(t), s = p.s ?? 1, [lx, ly] = local(ix, iy); return [(p.x ?? W / 2) + lx * s, (p.y ?? H / 2 + 4) + ly * s]; };
    let camZ = 1;
    function camera(g, t) {
      const z0 = hitPunch(o, t, stamps.map(s => s.at));
      camZ = o.focus && o.focus.length ? kfv(o.focus, t, 3, 1) : 1;
      if (!o.focus || !o.focus.length) { if (z0 !== 1) { g.translate(W / 2, H / 2); g.scale(z0, z0); g.translate(-W / 2, -H / 2); } return; }
      const fx = kfv(o.focus, t, 1, cr[0] + cr[2] / 2), fy = kfv(o.focus, t, 2, cr[1] + cr[3] / 2), z = kfv(o.focus, t, 3, 1) * z0;
      const [sx, sy] = toStage0(fx, fy, t);
      g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-sx, -sy);
    }
    if (!cut) cues.add(at, SFX.appear, .45); markCues(cues, marks); for (const s of stamps) cues.add(s.at, SFX.stamp, .8);

    // ---------- 3D paper (when enter / exit / chain is set): the card is drawn into a texture and handed to XM.paper ----------
    let PA = null, chainCards = [];
    if (use3d) {
      const p0 = pose(at), K = o.kicker;
      chainCards = (o.chain || []).map(c => ({ c, C: makeCard(c, c.at ?? 0) }));
      for (const { c, C: cc } of chainCards) { markCues(cues, cc.marks); cues.add(c.at, SFX.transition, .5); }
      const sweep = marks.find(m => (m.mode || 'sweep') === 'sweep') || marks[0];
      const tg = o.target ? C.card(...o.target) : sweep ? C.card(sweep.x - 2, sweep.y + sweep.h / 2) : [cw / 2, ch / 2];
      const tgMacro = o.target ? tg : sweep ? C.card(sweep.x + sweep.w / 2, sweep.y + sweep.h / 2) : tg;
      const enter = o.enter && !cut ? (typeof o.enter === 'string' ? { kind: o.enter } : { ...o.enter }) : null;
      const exit = o.exit ? (typeof o.exit === 'string' ? { kind: o.exit } : { ...o.exit }) : null;
      if (enter) enter.at = enter.at ?? at;
      if (exit) { exit.at = exit.at ?? o.out; if (exit.at == null) console.error('XS.evidence: exit needs at (or out)'); cues.add(exit.at, exit.kind === 'dive' ? 'zip' : exit.kind === 'slide' ? SFX.wipe : SFX.transition, .5); }
      PA = XM.paper({
        P, w: cw, h: ch, paint: (g, t) => { g.save(); g.translate(cw / 2, ch / 2); C.body(g, t, true); g.restore(); }, key: C.key,
        x: p0.x ?? (K ? W / 2 + 260 : W / 2), y: p0.y ?? H / 2 + 4, s: p0.s ?? (K ? .85 : 1),
        tilt: o.tilt, fade: o.fade, base: C.page === 'dark' ? '#1c1d21' : '#e9e8e4',
        focus: (o.focus || []).map(([t, ix, iy, z]) => [t, ...C.card(ix, iy), z]),
        enter, exit, axis: o.axis != null ? C.card(0, o.axis)[1] : sweep ? C.card(0, sweep.y + sweep.h)[1] : undefined,
        target: exit && exit.kind === 'dive' ? tg : tgMacro, foldColor: sweep && (sweep.mode || 'sweep') !== 'box' ? DS.MARK : P.fg,
        chain: chainCards.map(({ c, C: cc }) => ({ w: cc.cw, h: cc.ch, at: c.at, key: cc.key, anchor: c.anchor ? cc.card(...c.anchor) : undefined,
          paint: (g, t) => { g.save(); g.translate(cc.cw / 2, cc.ch / 2); cc.body(g, t, true); g.restore(); } })),
      });
    }
    // Year / number kicker (optional): digits drop one by one from above a mask line, fade out when the push starts
    function kicker(g, t) {
      const K = o.kicker; if (!K) return;
      const ka = K.at ?? at + .32, ko = K.out ?? (o.focus && o.focus[1] ? o.focus[1][0] - .05 : Infinity);
      const fo = 1 - pr(t, ko, .28); if (t < ka || fo <= 0) return;
      const size = K.size || 150, x0 = K.x ?? 170, base = K.y ?? 452, top = base - size * .74;
      g.save(); g.beginPath(); g.rect(0, top - 6, W, H); g.clip();
      let x = x0;
      [...String(K.text)].forEach((ch, i) => {
        const k = EO(pr(t, ka + i * .09, .38));
        XM.txt(g, ch, x, base - (1 - k) * size * .85, { fam: 'unb', size, w: 700, col: P.fg, alpha: cl(k * 1.6) * fo });
        x += XM.measure(g, ch, { fam: 'unb', size, w: 700 }) + 4;
      });
      g.restore();
    }

    const shot = shell(o, P, () => (g, t) => {
      DS.stage(g, P, { light: true });
      if (PA) {
        PA.draw(g, t);
        kicker(g, t);
        const i = PA.page(t), CC = i === 0 ? C : chainCards[i - 1].C;
        if (!PA.cut(t)) CC.marks.forEach(m => { if (!m.note) return; const n = m.note, k = DS.in(t, n.at ?? m.at + .4, .5);
          const a = PA.project(i, ...CC.card(m.x + m.w, m.y + m.h / 2)); MK.callout(g, a[0] + 10, a[1], n.x ?? W - 640, n.y ?? 860, n.text, P, k, { align: n.align, size: n.size }); });
        drawStamps(g, t, P, stamps);
        hudOf(g, t, P, o, { tl: 'FIG.EVIDENCE', br: 'SCREENSHOT' });
        return;
      }
      const p = pose(t), x = p.x ?? W / 2, y = p.y ?? H / 2 + 4, s = p.s ?? 1;
      const kIn = cut ? 1 : DS.in(t, at, .55), fade = (p.op ?? 1) * (o.out != null ? DS.out(t, o.out) : 1);
      g.save(); camera(g, t);
      g.translate(x, y + 40 * (1 - kIn)); if (p.rz) g.rotate(p.rz * Math.PI / 180); g.scale(s, s);
      g.globalAlpha *= fade;
      // Viewfinder brackets + category label (outside the card, closing in first)
      { const fa = cl(1 - (camZ - 1.04) / .14); if (fa > 0) { g.save(); g.globalAlpha *= fa; DS.frame(g, -cw / 2, -ch / 2, cw, ch, P, { kind: 'evidence', k: cut ? 1 : DS.in(t, at + .05, .6), label: o.label ?? 'SCREENSHOT' }); g.restore(); } }
      g.globalAlpha *= cl(kIn * 1.8);
      C.body(g, t, false);
      // Callout anchors: screenshot coords -> stage coords (including the push)
      const M = g.getTransform(), anchors = marks.map(m => { if (!m.note) return null; const [lx, ly] = local(m.x + m.w, m.y + m.h / 2); const q = M.transformPoint({ x: lx + 10, y: ly }); return [q.x, q.y]; });
      g.restore();
      kicker(g, t);
      marks.forEach((m, i) => { if (!m.note) return; const n = m.note, k = DS.in(t, n.at ?? m.at + .4, .5);
        MK.callout(g, anchors[i][0], anchors[i][1], n.x ?? W - 640, n.y ?? 860, n.text, P, k, { align: n.align, size: n.size }); });
      drawStamps(g, t, P, stamps);
      hudOf(g, t, P, o, { tl: 'FIG.EVIDENCE', br: 'SCREENSHOT' });
    });
    shot.cues = cues;
    // Screenshot px -> stage coords at frame t. The flat card includes the focus push and the stamp hitPunch, not just pose
    shot.toStage = (ix, iy, t) => {
      if (PA) return PA.project(0, ...C.card(ix, iy));
      const [x, y] = toStage0(ix, iy, t), z0 = hitPunch(o, t, stamps.map(s => s.at));
      if (!o.focus || !o.focus.length) return z0 === 1 ? [x, y] : [W / 2 + (x - W / 2) * z0, H / 2 + (y - H / 2) * z0];
      const fx = kfv(o.focus, t, 1, cr[0] + cr[2] / 2), fy = kfv(o.focus, t, 2, cr[1] + cr[3] / 2), z = kfv(o.focus, t, 3, 1) * z0, [sx, sy] = toStage0(fx, fy, t);
      return [W / 2 + (x - sx) * z, H / 2 + (y - sy) * z];
    };
    return shot;
  }

  // =====================================================================
  // XS.doc
  // =====================================================================
  function doc(o) {
    const P = DS.tone(toneOf(o)), cues = cueList(), at = o.at ?? 0;
    const fam = o.fam || (o.cls === 'zh' ? 'zh' : 'serif'), lines = o.lines || [];
    const marks = (Array.isArray(o.mark) ? o.mark : o.mark ? [o.mark] : []).map(m => {
      let line = m.line ?? 0, from = m.from ?? 0, to = m.to;
      if (m.find) { for (let i = 0; i < lines.length; i++) { const j = lines[i].indexOf(m.find); if (j >= 0) { line = i; from = j; to = j + m.find.length; break; } } }
      return { ...m, line, from, to: to ?? lines[line].length, at: m.at ?? at + 1, dur: m.dur ?? .5 };
    });
    const [AC, onAC] = fillAcc(P);
    const X0 = 380, MAXW = W - X0 - 200;
    const lay = lazy(() => {
      const g = MG(); let size = o.size || 76;
      const tf = s => ({ fam, size: s, w: 600 });
      const widest = Math.max(1, ...lines.map(s => XM.measure(g, s, tf(size))));
      if (widest > MAXW) size = Math.max(64, Math.floor(size * MAXW / widest));
      const lh = Math.round(size * 1.5), textH = lh * (lines.length - 1) + size;
      const transH = o.trans ? 110 : 0, noteH = o.note && o.note.y == null ? 130 : 0;
      const blockH = 120 + textH + transH + noteH;
      const top = Math.max(170, (H - blockH) / 2 + 10);
      const y0 = top + 120 + size * .9;                // first line baseline
      const bl = i => y0 + i * lh;
      const M = marks.map(m => { const s = lines[m.line];
        const x = X0 + XM.measure(g, s.slice(0, m.from), tf(size)), w = XM.measure(g, s.slice(m.from, m.to), tf(size));
        return { ...m, x, w, y: bl(m.line) - size * .9, h: size * 1.16 }; });
      const textW = Math.max(...lines.map(s => XM.measure(g, s, tf(size))));
      return { size, lh, top, bl, M, textW, bottom: bl(lines.length - 1) + size * .32 };
    });
    cues.add(at, SFX.appear, .45);
    for (const m of marks) cues.add(m.at, SFX.sweep, .55);
    if (o.note) cues.add(o.note.at, SFX.callout, .5);

    const shot = shell(o, P, () => (g, t) => {
      DS.stage(g, P);
      const Lr = lay(), { size, top, bl, M } = Lr, tf = { fam, size, w: 600 };
      // Push a little toward each highlight as it comes up (+2.5% each, max 1.05; fixed point at the highlight centre, 0.9 s expoInOut), dim lines that aren't highlighted: one focus at a time
      let cfx = W / 2, cfy = H / 2, z = 1, eDim = 0;
      if (o.push !== false) for (const m of M) { const e = XM.expoInOut(pr(t, m.at - .1, .9)); cfx = lin(cfx, (W / 2 + m.x + m.w / 2) / 2, e); cfy = lin(cfy, m.y + m.h / 2, e); z = Math.min(1.05, z + .025 * e); }
      if (o.push !== false && o.note && M.length) { const e = XM.expoInOut(pr(t, (o.note.at ?? M[o.note.mark || 0].at + .5) - .1, .9)); cfy = lin(cfy, o.note.y ?? Lr.bottom + (o.trans ? 200 : 110), .45 * e); z = Math.min(1.06, z + .01 * e); }
      if (M.length) eDim = DS.in(t, M[0].at, .4);
      g.save(); g.translate(cfx, cfy); g.scale(z, z); g.translate(-cfx, -cfy);
      // Quote block (large colour area): wipes in from the left
      const kb = DS.in(t, at, .45), bs = 132, bx = 200, by = top + 120;
      if (kb > 0) { g.fillStyle = AC; g.fillRect(bx, by, bs * kb, bs);
        g.save(); g.beginPath(); g.rect(bx, by, bs * kb, bs); g.clip(); g.fillStyle = onAC;
          for (const qx of [bx + 44, bx + 92]) quoteMark(g, qx, by + 84, 17); g.restore(); }
      // Source line + thin rule
      const kr = DS.in(t, at + .1, .6), RX = W - 200;
      g.fillStyle = P.line; g.fillRect(bx, top + 40, (RX - bx) * kr, 2);
      if (o.src) { g.fillStyle = AC; g.fillRect(bx, top + 4, 14, 14);
        XM.txt(g, XM.typed(o.src, t, at + .15, Math.min(.03, .5 / o.src.length)), bx + 30, top + 19, { fam: 'mono', size: 30, w: 500, col: P.mute, ls: 1 }); }
      XM.txt(g, o.meta || 'QUOTE / ORIGINAL', RX, top + 19, { fam: 'mono', size: 22, w: 500, col: P.mute, ls: 2, align: 'right', alpha: kr });
      // Viewfinder brackets (category: original text)
      const fx = X0 - 30, fw = Math.min(RX - fx, Lr.textW + 60), fy = top + 120 - 22, fh = Lr.bottom - fy + 18;
      DS.frame(g, fx, fy, fw, fh, P, { kind: 'evidence', k: DS.in(t, at + .2, .6), label: o.label ?? 'ORIGINAL' });
      // Quote lines rise one by one; the highlight is drawn under the text and highlighted text turns ink (readable on all three stages)
      lines.forEach((s, i) => {
        const k = DS.in(t, at + .25 + i * .14, .5); if (k <= 0) return;
        const y = bl(i) + 30 * (1 - k), ML = M.filter(m => m.line === i);
        for (const m of ML) { const km = io3(pr(t, m.at, m.dur)); if (km > 0) { g.fillStyle = DS.MARK; g.fillRect(m.x - 8, m.y + 30 * (1 - k), (m.w + 16) * km, m.h); } }
        XM.txt(g, s, X0, y, { ...tf, col: P.fg, alpha: k * (ML.length ? 1 : 1 - .5 * eDim) });
        for (const m of ML) { const km = io3(pr(t, m.at, m.dur)); if (km <= 0) continue;
          g.save(); g.beginPath(); g.rect(m.x - 8, m.y - 10, (m.w + 16) * km, m.h + 20); g.clip();
          XM.txt(g, s.slice(m.from, m.to), m.x, y, { ...tf, col: DS.INK, alpha: k }); g.restore(); }
        for (const m of ML) if (m.lead) { const L = leadOf(m); MK.lead(g, m.x - 8, m.y + 30 * (1 - k), m.w + 16, m.h, P, io3(pr(t, L.at, L.dur)), io3(pr(t, m.at, m.dur))); }
      });
      // Note label
      if (o.note && M.length) { const m = M[o.note.mark || 0], k = DS.in(t, o.note.at ?? m.at + .5, .5);
        const ax = m.x + m.w / 2, ay = m.y + m.h + 4;
        MK.callout(g, ax, ay, o.note.x ?? Math.min(ax + 60, W - 760), o.note.y ?? Lr.bottom + (o.trans ? 200 : 110), o.note.text, P, k, { align: o.note.align }); }
      // Translation (drawn after the note leader: a strip of stage colour first, so the leader seems to pass behind the translation)
      if (o.trans) { const k = DS.in(t, o.trans.at ?? at + 1, .5), ty = Lr.bottom + 92 + 20 * (1 - k), tf2 = { fam: 'zh', size: SZ.label, w: 600 };
        if (k > 0) { g.fillStyle = P.bg; g.fillRect(X0 - 16, ty - SZ.label * .9, XM.measure(g, o.trans.text, tf2) + 32, SZ.label * 1.15); }
        XM.txt(g, o.trans.text, X0, ty, { ...tf2, col: P.mute, alpha: k }); }
      // Bottom barcode (decoration)
      const kz = DS.in(t, at + .4, .5);
      if (kz > 0) { g.save(); g.globalAlpha *= kz * .8; XM.FX.barcode(g, RX - 150, H - 196, 150 * kz, 26, P.mute, 11); g.restore(); }
      g.restore();
      hudOf(g, t, P, o, { tl: 'FIG.QUOTE', br: 'ORIGINAL' });
    });
    shot.cues = cues;
    return shot;
  }

  // =====================================================================
  // XS.phones
  // =====================================================================
  function phones(o) {
    // Legacy API: phones:[{...}] uses only the first phone
    if (o.phones && o.phones.length && !o.msgs && !o.src) {
      const pd = o.phones[0], d = pd.data || {};
      o = { ...o, x: o.x ?? pd.x, title: o.title ?? pd.title, src: pd.src, iw: pd.iw, ih: pd.ih, crop: pd.crop };
      if (pd.kind === 'chat') o.msgs = (d.msgs || []).map(m => ({ from: m.side === 'r' ? 'me' : 'them', name: m.name, text: m.text, at: m.at }));
      else if (pd.kind === 'list') o.msgs = (d.rows || []).map(r => ({ from: 'them', name: r.title, text: r.sub || r.title, at: r.at }));
      if (o.focus) o.focus = o.focus.map(f => ({ at: f.at, i: f.i ?? f.row }));
    }
    const P = DS.tone(toneOf(o)), cues = cueList(), at = o.at ?? 0;
    const msgs = (o.msgs || []).map((m, i) => ({ ...m, i, at: m.at ?? at + .4 + i * .7 })), notes = o.notes || [], marks = o.marks || [];
    const PW = o.w || 900, bez = 18, R = 108, hasNote = notes.length || marks.some(m => m.note);
    // With note labels: the phone starts centred and slides left 0.55 s before the first label (fixed if x is given)
    const CX = o.x ?? W / 2, CXf = o.x ?? (hasNote ? 720 : W / 2), slideAt = Math.min(...notes.map(n => n.at), ...marks.filter(m => m.note).map(m => m.note.at ?? m.at + .4), 1e9) - .55;
    const top = o.top ?? 92, BX = CX - PW / 2, sx0 = BX + bez, sw = PW - bez * 2, SR = R - bez;
    const scrDark = o.screen === 'dark', scrC = scrDark ? '#111216' : '#f6f5f2', scrFg = scrDark ? DS.PAPER : '#111214', scrMute = scrDark ? 'rgba(236,232,223,.5)' : 'rgba(17,18,20,.48)';
    const [AC, onAC] = fillAcc(P);
    const themC = scrDark ? '#25262c' : '#e6e3dc';
    const focus = (o.focus || []).concat(msgs.filter(m => m.key).map(m => ({ at: m.at + .45, i: m.i }))).sort((a, b) => a.at - b.at);
    const IMG = o.src ? XM.image(o.src) : null, cr = o.crop || (o.src ? [0, 0, o.iw, o.ih] : null), isc = cr ? sw / cr[2] : 1;
    const FS = SZ.label, LH = Math.round(FS * 1.32), PX = 34, PY = 24, AV = 72, HEAD = 178, VB = H - 96;   // VB: lower view edge (below it the phone is off frame)

    const lay = lazy(() => {
      let y = top + HEAD + 34; const L = [];
      for (const m of msgs) {
        const me = m.from === 'me', maxW = sw * .8 - PX * 2;
        const rows = wrap(m.text, { fam: 'zh', size: FS, w: 500 }, maxW);
        const tw = Math.max(...rows.map(r => XM.measure(MG(), r, { fam: 'zh', size: FS, w: 500 })));
        const bw = tw + PX * 2, bh = rows.length * LH + PY * 2 - (LH - FS) + 8;
        const nameH = !me && m.name ? 44 : 0;
        const bx = me ? sx0 + sw - 32 - bw : sx0 + 32 + AV + 18;
        L.push({ m, me, rows, bx, by: y + nameH, bw, bh, top: y });
        y += nameH + bh + 30;
      }
      return L;
    });
    // Scrolling: push up when the bottom of the last visible item (bubble or typing dots) passes the lower view edge
    function scrollAt(t, L) {
      let cur = 0;
      for (const b of L) {
        const t0 = b.m.typing ? b.m.at - b.m.typing : b.m.at, bottomT = b.m.typing ? b.by + 110 : b.by + b.bh;
        for (const [tt, bot] of [[t0, b.m.typing ? bottomT : b.by + b.bh], [b.m.at, b.by + b.bh]]) {
          if (t < tt) return cur;
          const need = Math.max(0, bot - (VB - 20)), k = EO(pr(t, tt, .5)); cur = lin(cur, Math.max(cur, need), k);
        }
      }
      return cur;
    }
    cues.add(at, SFX.appear, .45);
    for (const m of msgs) { if (m.typing) cues.add(m.at - m.typing, SFX.type, .3); cues.add(m.at, SFX.callout, m.from === 'me' ? .4 : .5); }
    for (const f of focus) cues.add(f.at, SFX.bracket, .55);
    for (const n of notes) cues.add(n.at, SFX.callout, .5);
    markCues(cues, marks); for (const s of o.stamps || []) cues.add(s.at, SFX.stamp, .8);

    const shot = shell(o, P, () => (g, t) => {
      DS.stage(g, P, { light: !!o.src });
      const kIn = DS.in(t, at, .6), lift = 140 * (1 - kIn);
      g.save(); const z = hitPunch(o, t, (o.stamps || []).map(s => s.at)); if (z !== 1) { g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-W / 2, -H / 2); }
      const slideX = (CXf - CX) * io3(pr(t, slideAt, .6));
      // Chat mode: push in 4% (0.9 s) around the focus message when it lands, back out when focus clears
      if (!IMG && o.push !== false && focus.length) { const L0 = lay(); let pz = 0, py = H / 2;
        for (const f of focus) { if (f.i >= 0 && L0[f.i]) { const e = XM.expoInOut(pr(t, f.at - .1, .9)); pz = lin(pz, 1, e); py = lin(py, L0[f.i].by + L0[f.i].bh / 2 - scrollAt(t, L0), e); } else pz *= 1 - XM.expoInOut(pr(t, f.at, .7)); }
        const zz = 1 + .04 * pz, px = CX + slideX; g.translate(px, py); g.scale(zz, zz); g.translate(-px, -py); }
      g.translate(slideX, lift); g.globalAlpha *= cl(kIn * 1.6);
      // Phone body (lower half off frame)
      g.save(); g.shadowColor = P.stage === 'paper' ? 'rgba(40,30,10,.18)' : 'rgba(0,0,0,.5)'; g.shadowBlur = 80; g.shadowOffsetY = 30;
      phoneBody(g, BX, top - bez, PW, H * 1.6, R, P); g.restore();
      g.save(); rrect(g, sx0, top, sw, H * 1.6, SR); g.clip();
      g.fillStyle = scrC; g.fillRect(sx0, top, sw, H * 1.6);
      let focusPts = [];
      if (IMG) {
        // Screenshot mode
        const iy = o.scroll ? kfv(o.scroll, t, 1, cr[1]) : cr[1];
        const map = (ix, iyy) => [sx0 + (ix - cr[0]) * isc, top + (iyy - iy) * isc];
        if (IMG.ok) { g.imageSmoothingQuality = 'high'; const hh = (H + 400 - top) / isc; g.drawImage(IMG.img, cr[0], iy, cr[2], hh, sx0, top, sw, hh * isc); }
        drawMarks(g, t, marks, map, isc, P, scrDark ? 'dark' : 'light', 'in');
        g.restore();
        drawMarks(g, t, marks, map, isc, P, scrDark ? 'dark' : 'light', 'over');
        const M = g.getTransform();
        focusPts = marks.map(m => { if (!m.note) return null; const [x, y] = map(m.x + m.w, m.y + m.h / 2); const q = M.transformPoint({ x: Math.min(x + 10, sx0 + sw - 20), y }); return [q.x, q.y]; });
      } else {
        // Chat mode
        const L = lay(), sc = scrollAt(t, L);
        // Current focus
        // i:-1 clears focus (brackets and dimming return in 0.3 s)
        let fi = -1, fk = 0; for (const f of focus) if (t >= f.at) { if (f.i >= 0) { fi = f.i; fk = DS.in(t, f.at, .35); } else if (fi >= 0) fk = Math.min(fk, 1 - DS.in(t, f.at, .3)); if (f.i < 0 && fk <= 0) fi = -1; }
        g.save(); g.beginPath(); g.rect(sx0, top + HEAD, sw, H * 1.6); g.clip(); g.translate(0, -sc);
        for (const b of L) {
          const m = b.m, tyStart = m.typing ? m.at - m.typing : null;
          const dimA = fi >= 0 && fi !== m.i ? 1 - .66 * fk : 1;
          // Typing dots
          if (tyStart != null && t >= tyStart && t < m.at + .12) {
            const k = DS.in(t, tyStart, .3) * (1 - pr(t, m.at, .12)), y = b.by + 20 * (1 - k);
            g.save(); g.globalAlpha *= k;
            if (!b.me) { g.fillStyle = AC; g.fillRect(sx0 + 32, b.top, AV, AV); XM.txt(g, o.avatar || (o.title || 'AI')[0], sx0 + 32 + AV / 2, b.top + AV * .7, { fam: 'zh', size: 38, w: 800, col: onAC, align: 'center' }); }
            const tw = 150, th = 92; g.fillStyle = b.me ? AC : themC; rrect(g, b.bx, y, tw, th, [b.me ? 30 : 6, 30, 30, b.me ? 6 : 30]); g.fill();
            for (let j = 0; j < 3; j++) { const a = .3 + .7 * Math.max(0, Math.sin(t * 2 * Math.PI * 1.4 - j * .9));
              g.globalAlpha = k * a; g.fillStyle = b.me ? onAC : scrFg; g.beginPath(); g.arc(b.bx + 42 + j * 33, y + th / 2 - 7 * (a - .3), 9, 0, 6.3); g.fill(); }
            g.restore();
          }
          const k = DS.in(t, m.at, .38); if (k <= 0) continue;
          const dy = 30 * (1 - k);
          g.save(); g.globalAlpha *= k * dimA;
          if (!b.me) {
            g.fillStyle = AC; g.fillRect(sx0 + 32, b.top + dy, AV, AV);
            XM.txt(g, o.avatar || (o.title || 'AI')[0], sx0 + 32 + AV / 2, b.top + dy + AV * .7, { fam: 'zh', size: 38, w: 800, col: onAC, align: 'center' });
            if (m.name) XM.txt(g, m.name, b.bx + 4, b.top + dy + 30, { fam: 'zh', size: 30, w: 500, col: scrMute });
          }
          g.fillStyle = b.me ? AC : themC; rrect(g, b.bx, b.by + dy, b.bw, b.bh, [b.me ? 30 : 6, 30, 30, b.me ? 6 : 30]); g.fill();
          b.rows.forEach((r, j) => XM.txt(g, r, b.bx + PX, b.by + dy + PY + FS * .86 + j * LH, { fam: 'zh', size: FS, w: 500, col: b.me ? onAC : scrFg }));
          g.restore();
        }
        g.restore();
        // Header (fixed): status bar + title
        g.fillStyle = scrC; g.fillRect(sx0, top, sw, HEAD);
        XM.txt(g, '9:41', sx0 + 70, top + 52, { fam: 'grot', size: 28, w: 700, col: scrFg });
        g.fillStyle = scrFg; for (let j = 0; j < 4; j++) g.fillRect(sx0 + sw - 150 + j * 10, top + 50 - 8 - j * 5, 6, 8 + j * 5);
        g.strokeStyle = scrFg; g.lineWidth = 2; g.strokeRect(sx0 + sw - 96, top + 30, 44, 22); g.fillRect(sx0 + sw - 92, top + 34, 30, 14); g.fillRect(sx0 + sw - 50, top + 37, 3, 8);
        g.fillStyle = '#000'; rrect(g, CX - 62, top + 18, 124, 40, 20); g.fill();
        g.strokeStyle = scrFg; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(sx0 + 62, top + 104); g.lineTo(sx0 + 46, top + 122); g.lineTo(sx0 + 62, top + 140); g.stroke();
        if (o.title) XM.txt(g, o.title, CX, top + 128, { fam: 'zh', size: SZ.label, w: 800, col: scrFg, align: 'center' });
        const typingNow = msgs.some(m => m.typing && m.from !== 'me' && t >= m.at - m.typing && t < m.at);
        const sub = typingNow ? 'typing…' : o.sub;
        if (sub) XM.txt(g, sub, CX, top + 163, { fam: 'zh', size: 22, w: 500, col: scrMute, align: 'center' });
        g.fillStyle = scrDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; g.fillRect(sx0, top + HEAD - 1, sw, 1);
        g.restore();
        // Focus brackets (outer screen layer, not clipped)
        if (fi >= 0) { const b = L[fi]; if (b) MK.bracket(g, b.bx, b.by - sc, b.bw, b.bh, P, fk, { on: scrDark ? 'dark' : 'light', color: accOnLight(), pad: 16, len: 30, lw: 5 }); }
        const M = g.getTransform();
        focusPts = notes.map(n => { const b = L[n.i]; if (!b) return null; const right = (n.side || 'right') === 'right';
          const q = M.transformPoint({ x: right ? b.bx + b.bw + 22 : b.bx - 22, y: b.by - sc + b.bh / 2 }); return [q.x, q.y, right]; });
      }
      g.restore();
      // Labels (stage coords)
      if (IMG) marks.forEach((m, i) => { if (!m.note) return; const n = m.note, k = DS.in(t, n.at ?? m.at + .4, .5);
        MK.callout(g, focusPts[i][0], focusPts[i][1], n.x ?? CXf + PW / 2 + 70, n.y ?? focusPts[i][1] - 120, n.text, P, k, { align: n.align }); });
      else notes.forEach((n, i) => { const p = focusPts[i]; if (!p) return; const k = DS.in(t, n.at, .5);
        MK.callout(g, p[0], p[1], n.x ?? (p[2] ? CXf + PW / 2 + 70 : CXf - PW / 2 - 70), n.y ?? p[1] - 110, n.text, P, k, { align: n.align || (p[2] ? 'left' : 'right') }); });
      drawStamps(g, t, P, o.stamps);
      hudOf(g, t, P, o, { tl: 'FIG.CHAT', br: o.src ? 'SCREENSHOT' : 'ILLUSTRATIVE' });
    });
    shot.cues = cues;
    return shot;
  }

  // =====================================================================
  // XS.mosaic
  // =====================================================================
  function mosaic(o) {
    const P = DS.tone(toneOf(o)), cues = cueList(), at = o.at ?? 0, dur = o.dur || .8;
    const cell = o.cell || 24, text = String(o.text || ''), n = [...text].length || 1;
    const font = o.font === 'unb' || o.font === 'Unb' ? 'Unb' : 'HeiSC';
    const cy = o.y ?? 500, lockT = at + dur + .35;
    const sub = typeof o.sub === 'string' ? { text: o.sub } : o.sub;
    const sweep = o.sweep === false ? null : { at: (o.sweep && o.sweep.at) ?? lockT + .45, dur: (o.sweep && o.sweep.dur) || 1.2 };
    const [AC] = fillAcc(P), sweepC = P.stage === 'accent' ? P.mark : AC;
    const tiles = lazy(() => {
      let fs = o.size || ({ 1: 520, 2: 440, 3: 380, 4: 320 }[n] || 280);
      const c = XM.canvas('xs-mosaic-raster', W, H).g;
      c.font = `900 ${fs}px ${font}`; let tw = c.measureText(text).width;
      if (tw > 1500) { fs = Math.floor(fs * 1500 / tw); c.font = `900 ${fs}px ${font}`; }
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000'; c.fillText(text, W / 2, cy);
      XM.note(font, text);
      const px = c.getImageData(0, 0, W, H).data, R = XM.rng(17), out = [];
      let x0 = W, x1 = 0, y0 = H, y1 = 0;
      for (let y = cell / 2; y < H; y += cell) for (let x = cell / 2; x < W; x += cell) {
        if (px[(Math.floor(y) * W + Math.floor(x)) * 4 + 3] < 128) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        out.push({ x, y });
      }
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, sc = o.scatter || 900;
      for (const q of out) {
        const r1 = R(), r2 = R(), r3 = R(), r4 = R();
        const a = Math.atan2(q.y - my, (q.x - mx) * .7) + (r1 - .5) * 1.4, d = sc * (.55 + .45 * r2);
        q.sx = q.x + Math.cos(a) * d * 1.3; q.sy = q.y + Math.sin(a) * d * .75;
        q.dl = .35 * (.55 * (q.x - x0) / Math.max(1, x1 - x0) + .45 * r3); q.rot = (r4 - .5) * 1.6;
      }
      return { out, x0, x1, y0, y1, fs };
    });
    cues.add(at, SFX.appear, .5); cues.add(lockT - .05, SFX.reveal, .6);
    if (sub) cues.add(sub.at ?? lockT + .15, SFX.callout, .35);
    if (sweep) cues.add(sweep.at, SFX.sweep, .35);

    const shot = shell(o, P, () => (g, t) => {
      DS.stage(g, P);
      const T = tiles(), s = cell * .86, z = hitPunch(o, t, [lockT]);
      g.save(); if (z !== 1) { g.translate(W / 2, cy); g.scale(z, z); g.translate(-W / 2, -cy); }
      // Slots: faint dot grid (cells not yet filled)
      const kg = DS.in(t, at - .1, .4) * (1 - pr(t, lockT, .3));
      if (kg > 0) { g.fillStyle = P.faint; g.globalAlpha = kg; for (const q of T.out) g.fillRect(q.x - 2, q.y - 2, 4, 4); g.globalAlpha = 1; }
      let locked = 0;
      const sw0 = sweep ? (pr(t, sweep.at, sweep.dur)) : 0, span = (T.x1 - T.x0) + (T.y1 - T.y0) * .5 + 600;
      for (const q of T.out) {
        const k = pr(t, at + q.dl, dur); if (k <= 0) continue;
        const e = EO(k), x = lin(q.sx, q.x, e), y = lin(q.sy, q.y, e), done = k >= 1;
        if (done) locked++;
        let c = P.fg, a = done ? 1 : .25 + .5 * e;
        if (done) { const since = t - (at + q.dl + dur); if (since < .16) c = AC; }
        if (sweep && sw0 > 0 && sw0 < 1) { const pos = (q.x - T.x0) + (q.y - T.y0) * .5 + 300, band = sw0 * span; if (Math.abs(pos - band) < 110) c = sweepC; }
        g.globalAlpha = a; g.fillStyle = c;
        if (done) g.fillRect(x - s / 2, y - s / 2, s, s);
        else { const r = q.rot * (1 - e), ss = s * (.45 + .55 * e); g.save(); g.translate(x, y); g.rotate(r); g.fillRect(-ss / 2, -ss / 2, ss, ss); g.restore(); }
      }
      g.globalAlpha = 1;
      g.restore();
      // Kicker above (decoration) + lock counter
      const kk = DS.in(t, at, .5);
      if (o.kicker) XM.txt(g, o.kicker, T.x0 - s / 2, T.y0 - 54, { fam: 'mono', size: 24, w: 500, col: P.mute, ls: 3, alpha: kk });
      XM.txt(g, `TILES ${String(locked).padStart(4, '0')} / ${String(T.out.length).padStart(4, '0')}`, T.x1 + s / 2, T.y0 - 54, { fam: 'mono', size: 22, w: 500, col: P.mute, ls: 2, align: 'right', alpha: kk });
      DS.frame(g, T.x0 - s / 2, T.y0 - s / 2, T.x1 - T.x0 + s, T.y1 - T.y0 + s, P, { kind: 'evidence', k: DS.in(t, lockT - .1, .5) });
      if (sub && sub.text) { const k = DS.in(t, sub.at ?? lockT + .15, .5); XM.txt(g, sub.text, W / 2, T.y1 + 130 + 24 * (1 - k), { fam: 'zh', size: sub.size || 64, w: 700, col: P.fg, align: 'center', alpha: k }); }
      hudOf(g, t, P, o, { tl: 'FIG.WORD', br: 'ILLUSTRATIVE' });
    });
    shot.cues = cues;
    return shot;
  }

  Object.assign(XS, { evidence, doc, phones, mosaic });
})();
