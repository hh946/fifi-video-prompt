// XM.paperPile: a pile of printed paper with a big word stamped on top.
//   Sheets of paper (real screenshots / document images, or typeset documents) fly in at angles and settle overlapping
//   each other; the pile can be dimmed, then a small year / number and a large translucent accent-coloured word are
//   stamped over it. API: XM.paperPile(o) -> shot { L, update, cues, subs, times, api }; main options: papers, pile,
//   words, small, dim, under, cam, print, tone, hud, sfx. Docs: docs/components/pile.md
// Depends on: lib.js -> xk.js -> xm-core.js -> xm-ds.js -> xm-tex.js (texture layer). Canvas 2D (XM.shot), deterministic
//   (randomness only via XM.rng(seed)).
//
// This is a frame: what is on the paper, how many sheets, how they scatter, what lies underneath and which words go on top
// are all chosen per shot. There is no default text, paper or background; missing required options log console.error.
//
// XM.paperPile(o) -> { L, update, cues, subs, times, api }
//   papers (required, >= 1): [{ … }], array order = stacking order (later sheets lie on top; override with z)
//     image sheet: { src, crop:[x,y,w,h], w (drawn width px), margin (white paper border px, default 0), gray (desaturate 0..1), contrast (default 1) }
//       -- the image is multiplied onto the paper colour (white becomes paper), then a faint paper grain is laid over it
//     document sheet: { doc:{ w, h, lines, size:22, lh (line height, default 1.62×size), pad:[left, top], fam:'HeiSC', ink, inkBold } }
//       one entry per line: 'string' (stacked downward from pad) or { x, y (line centre, paper coords), pre (right-aligned, ends at x), text, post, size };
//       **…** inside text is bold. You supply the text; there is no default
//     placement (auto from pile.mode if omitted): x, y (sheet centre, screen px), rot (degrees)
//     entry (auto from pile.mode if omitted): at (start time), dur (s), pow (power ease-out exponent, 2.8–3.3 looks natural), show (not drawn before this, default = at),
//       from:{ dx, dy (start offset from rest position, px), rot (extra start rotation, deg), s (start scale, used by drop), a (start opacity), blur (start blur px, drop default 7),
//              pivot:[x,y] (rotation pivot, default sheet centre) }
//       motion: remaining fraction g = ((te − t)/(te − at))^pow, te = at + dur; rotation = from.rot·g, offset = from·g, scale = 1 + (from.s − 1)·g
//       (this curve shape matches how a tossed sheet decelerates and settles)
//     z, paper (paper colour)
//   pile: { mode, at, stagger, accel, seed, center:[x,y], spread, from, w, maxRot, angle, radius }
//     mode  : 'scatter' (default: a casual pile, each sheet flies in from off-screen and settles with a power ease-out)
//             | 'drop' (sheets fall one by one toward the camera and pile up: start scaled 1.3× + fade in + shadow moving from far to near; gaps shrink by accel)
//             | 'fan' (the stack slides in as one, then fans out around a pivot below it)
//     at    : time the first sheet starts moving (absolute seconds; required unless every sheet has its own at)
//     stagger / accel: gap between sheets (scatter .2 / drop .5 / fan .08 s); accel = factor applied to each successive gap (drop default .82: faster and faster)
//     center / spread: centre and spread (0..1) of automatic placement; from: where scatter sheets fly in from: 'auto' (outward from centre) | 'left' | 'right' | 'top' | 'bottom' | angle
//     w     : default width of image sheets in auto layout (scatter .62W / drop .46W / fan .3W); maxRot: auto rotation limit (scatter 22° / drop 13°);
//     angle / radius: total fan angle (default 44°) and fan radius (default 1.5 × sheet height)
//   under : what lies under the pile (optional, e.g. the previous shot's subject and label): { draw(g, t, P) } or { src, x, y, w, h, gray }
//   cam   : slow camera move (moves only the background + pile, not the words or HUD): { keys:[[t, s, x, y, rot, ease], …] } or { t0, t1, from:{s,x,y,rot}, to:{…}, ease }
//   dim   : dim-in (optional): { at, dur (default 32 frames ≈ 1.07 s), ease:'quadOut', from:'paper' (post preset to fade from toward the
//           post set by XM.tex.use; null = from no post), under:.18 (extra darkening of background + under), pile:0 (extra darkening of the pile) }
//           The darkening + vignette itself comes from the texture layer: XM.tex.use(shot, { post:'deep' }). This component only fades into it
//           and keeps the background a little darker than the paper
//   print : { soft:.4 (slight blur over the whole pile in px, so printed text is not sharper than real print), tex:.05 (paper grain), shadow:[{dx,dy,blur,a,grow}] (sheet shadows, default two layers) }
//   words : the big conclusion word stamped on top (optional, but it is the point of this component):
//     { text (required; '\n' = new line / new column), at (required), font:'song' (Source Han Serif weight 900, squeezed narrow) | 'brush' (Ma Shan Zheng brush),
//       dir:'h' (horizontal, default) | 'v' (vertical, columns right to left), box:[x,y,w,h] (area the text fills; horizontal default is almost full width and 60% height, vertical default is a column on the right),
//       size / squeeze (fixed values instead of fitting box), ls (letter spacing px), rot (tilt the whole block, deg), colShift (vertical: shift each next column down by this many character heights),
//       color (default 'accent'), alpha (opacity at the most solid point, default .42), fade (opacity profile: default "light top, solid middle, fading bottom";
//       'flat' = uniform; or [[position 0..1, factor], …]) -- horizontal runs top to bottom along the text height; vertical runs across each column
//       (left to right, default FADE_V: lighter edges, solid middle, never zero; fading along the column would make the last character vanish),
//       enter:'sweep' (each character goes from blurred to sharp: 2.7 frames apart, 4 frames to full, starts 6 px blurred) | 'wipe' (each character wiped on in writing direction, brush default) | 'cut',
//       per / dur / blur / ease, out (exit time, .25 s fade), subtitle:'keep'|'drop' }
//     No drop shadow or glow on the words; trailing full stops are removed; size must be >= 56 px
//   small : small year / number (optional): { text, at, x, y (centre), size (default 200), fam (default 'NumIt' = DM Serif Display Italic, same face as the number flip; for Playfair use 'PlayIt' + w 400–900), w (default 400), color (default picked for contrast with the paper: ink on light paper),
//       rot, squeeze, per / dur / blur (default: 3.6 frames apart, 3.5 frames to full, starts 9 px blurred), over:true (drawn above the big word) }
//   tone  : stage 'paper' (default) | 'ink' | 'accent'; drawn by XM.DS.stage, so XM.tex.use(shot, { stage:'paper' }) etc. can change the material
//   hud   : { tl, bl, br } (required; you write the corner text)
//   sfx   : false = none | { pile, words, gain } (sound names or false). Defaults: scatter 'sheet', drop / fan 'riffle' (dur covers the whole pile-up), big word 'sparkle'
//   draw  : (g, t, P, api) extra drawing of your own (after the post pass, before the stamped words)
//
// Draw order: stage (material) -> [cam] under -> background dim -> pile (shadows + paper, soft blur, dim) -> [/cam] -> texture flush (push-in / window light / post, dim fade)
//          -> stamped words (big word + small text, above the post pass, so they are not darkened) -> HUD
// Usage:
//   const s = XM.paperPile({ … });
//   XM.tex.use(s, { post:'deep' });                 // dim + heavy vignette
//   XK.seq([{ shot: s, t0: T.x, drift: false }]);  window.SFX_CUES.push(...s.cues);
(() => {
  const { W, H } = XK;
  const DS = XM.DS, RAD = Math.PI / 180;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fps = () => (window.VIDEO && VIDEO.fps) || 30;
  const EZ = {
    linear: k => k, smooth: k => k * k * (3 - 2 * k), quadIn: k => k * k, quadOut: k => 1 - (1 - k) * (1 - k),
    cubicOut: k => 1 - Math.pow(1 - k, 3), quartOut: k => 1 - Math.pow(1 - k, 4), easeInOut: k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    expoOut: XM.expoOut, smoother: k => k * k * k * (k * (6 * k - 15) + 10),
  };
  const ez = e => (typeof e === 'function' ? e : EZ[e] || (XM.tex && XM.tex.ease(e)) || EZ.linear);

  // ---------- Default motion feel per mode ----------
  const MODE = {
    scatter: { dur: 3.3, pow: 3.2, stagger: .2, accel: 1, maxRot: 22, w: .62 },     // flight ≈ 2.5–3.3 s, exponent 2.8–3.3 reads as a natural toss
    drop: { dur: .6, pow: 3, stagger: .5, accel: .82, maxRot: 13, w: .46, lift: .3, fade: .16, blur: 7 },
    fan: { dur: .9, pow: 3, stagger: .08, accel: 1, maxRot: 0, w: .3, angle: 44 },
  };
  const SHADOW = [{ dx: 14, dy: 16, blur: 22, a: .55, grow: 6 }, { dx: 3, dy: 4, blur: 4, a: .35, grow: 0 }];   // soft shadow to the lower right of each sheet
  // Opacity profile of horizontal big words: [position 0..1 (top of ink -> bottom of ink), factor relative to peak]
  const FADE = [[0, .357], [.06, .381], [.2, .452], [.34, .786], [.48, 1], [.62, .857], [.76, .571], [.85, .31], [.92, .119], [1, 0]];
  // Profile across a vertical column: lighter edges, solid middle, edges never reach zero so every stroke stays visible
  const FADE_V = [[0, .5], [.22, .8], [.5, 1], [.78, .8], [1, .5]];
  const WORDS = { alpha: .42, sweep: { per: 2.7 / 30, dur: 4 / 30, blur: 6, ease: 'quadOut' }, wipe: { per: .16, dur: .26, ease: 'smooth', soft: .35 } };
  const SMALL = { size: 200, fam: 'NumIt', w: 400, per: 3.6 / 30, dur: 3.5 / 30, blur: 9, ease: 'quadOut' };
  const FONT = { song: { fam: 'SerifSC', w: 900, sq: [.3, 1], sqDef: .5 }, brush: { fam: 'Brush', w: 400, sq: [.55, 1.1], sqDef: .9 } };
  const STOP = /[。．.]/g;          // big words never end with a full stop

  let UID = 0;
  // ---------- Paper grain (print texture, deterministic) ----------
  const GRAIN = new Map();
  function grainTile(seed) {
    if (GRAIN.has(seed)) return GRAIN.get(seed);
    const c = document.createElement('canvas'); c.width = c.height = 256; const q = c.getContext('2d'), d = q.createImageData(256, 256), r = XM.rng(seed * 7 + 3);
    let row = 0;
    for (let y = 0; y < 256; y++) { row = row * .7 + (r() - .5) * 12;                    // horizontal fibres: slight brightness drift per row
      for (let x = 0; x < 256; x++) { const v = 128 + (r() - .5) * 46 + row; const p = (y * 256 + x) * 4; d.data[p] = d.data[p + 1] = d.data[p + 2] = v; d.data[p + 3] = 255; } }
    q.putImageData(d, 0, 0); GRAIN.set(seed, c); return c;
  }
  const rgb = h => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
  const mixHex = (a, b, k) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], k)).toString(16).padStart(2, '0')).join(''); };
  const rgba = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a.toFixed(4)})`; };

  function paperOf(o = {}) {
    const P = { ...DS.tone(o.tone || 'paper') };
    const errs = m => console.error('XM.paperPile: ' + m);
    const id = ++UID, seed = (o.pile && o.pile.seed) ?? 7;
    const papers = Array.isArray(o.papers) ? o.papers : [];
    if (!papers.length) errs('papers is required (the sheets in the pile: real screenshots { src, crop, w } or printed documents { doc:{ w, h, lines } }), set by the video\'s script; there are no default sheets');
    const pile = { mode: 'scatter', ...(o.pile || {}) };
    const M = MODE[pile.mode];
    if (!M) errs(`pile.mode must be scatter / drop / fan, got ${pile.mode}`);
    const MD = M || MODE.scatter;
    if (pile.at == null && papers.some(p => p.at == null)) errs('pile.at (when the first sheet starts moving) is required, or give each sheet its own at');
    const paperCol = o.paper || mixHex(P.paper, '#ffffff', .35);
    const print = { soft: .4, tex: .05, shadow: SHADOW, ...(o.print || {}) };

    // ---------- Sheet canvases (built once per sheet) ----------
    const R = papers.map(p => (p.src ? XM.image(p.src) : null));
    papers.forEach((p, i) => { if (!p.src && !p.doc) errs(`papers[${i}] needs src (an image) or doc (a printed document)`);
      if (p.doc && (!p.doc.w || !p.doc.h)) errs(`papers[${i}].doc needs w and h (sheet size in px)`);
      if (p.doc && !(p.doc.lines && p.doc.lines.length)) errs(`papers[${i}].doc.lines (the text on the sheet) is required; there is no default text`); });
    const CV = [];
    function sizeOf(i) {           // drawn width / height of a sheet (before res)
      const p = papers[i];
      if (p.doc) return [p.doc.w, p.doc.h];
      const r = R[i], iw = r && r.ok ? r.img.naturalWidth : 1600, ih = r && r.ok ? r.img.naturalHeight : 1000;
      const cr = p.crop || [0, 0, iw, ih], w = p.w || MD.w * W, m = p.margin || 0;
      return [w + 2 * m, (w * cr[3]) / cr[2] + 2 * m];
    }
    function canvasOf(i) {
      if (CV[i]) return CV[i];
      const p = papers[i];
      if (p.src && !(R[i] && R[i].ok)) return null;
      const [w, h] = sizeOf(i), res = p.res ?? (p.doc ? 1 : 1.25);
      const c = document.createElement('canvas'); c.width = Math.ceil(w * res); c.height = Math.ceil(h * res);
      const q = c.getContext('2d'); q.scale(res, res);
      const pc = p.paper || paperCol;
      q.fillStyle = pc; q.fillRect(0, 0, w, h);
      if (p.src) {
        const img = R[i].img, iw = img.naturalWidth, ih = img.naturalHeight, cr = p.crop || [0, 0, iw, ih], m = p.margin || 0;
        q.save(); q.filter = `grayscale(${p.gray ?? 0}) contrast(${p.contrast ?? 1})`; q.globalCompositeOperation = 'multiply'; q.imageSmoothingQuality = 'high';
        q.drawImage(img, cr[0], cr[1], cr[2], cr[3], m, m, w - 2 * m, h - 2 * m); q.restore();
        q.save(); q.globalCompositeOperation = 'screen'; q.fillStyle = rgba('#ffffff', p.lift ?? .05); q.fillRect(0, 0, w, h); q.restore();   // printed black is never pure black
      } else docText(q, p.doc);
      if (print.tex > 0) { q.save(); q.globalCompositeOperation = 'overlay'; q.globalAlpha = print.tex; q.fillStyle = q.createPattern(grainTile(seed + i), 'repeat'); q.fillRect(0, 0, w, h); q.restore(); }
      CV[i] = { c, w, h };
      return CV[i];
    }
    function docText(q, d) {
      const size = d.size || 22, lh = d.lh || size * 1.62, fam = d.fam || 'HeiSC', ink = d.ink || '#2b2b2b', inkB = d.inkBold || '#161616';
      const pad = d.pad || [size * 2.6, size * 2.6];
      q.textBaseline = 'middle'; q.letterSpacing = '0px';
      const runs = s => String(s || '').split('**').map((t, k) => [t, k % 2 === 1]).filter(r => r[0]);
      const put = (s, x, y, sz, bold) => { q.font = `${bold ? 700 : 400} ${sz}px ${fam}`; q.fillStyle = bold ? inkB : ink; q.fillText(s, x, y); XM.note(fam, s); return q.measureText(s).width; };
      d.lines.forEach((L, k) => {
        if (typeof L === 'string') { let x = pad[0]; const y = pad[1] + k * lh; for (const [s, b] of runs(L)) x += put(s, x, y, size, b); return; }
        const sz = L.size || size; let x = L.x;
        if (L.pre) { q.font = `400 ${sz}px ${fam}`; put(L.pre, L.x - q.measureText(L.pre).width, L.y, sz, false); }
        for (const [s, b] of runs(L.text)) x += put(s, x, L.y, sz, b);
        if (L.post) put(L.post, x, L.y, sz, false);
      });
    }

    // ---------- Rest positions + entry (auto parts derived from seed, computed once) ----------
    const rr = XM.rng(seed * 13 + 1), n = papers.length;
    const center = pile.center || [W / 2, H / 2], spread = pile.spread ?? (pile.mode === 'drop' ? .5 : 1);
    const maxRot = pile.maxRot ?? MD.maxRot;
    const T = [];       // auto start time of each sheet
    { let t = pile.at ?? 0, gap = pile.stagger ?? MD.stagger; for (let i = 0; i < n; i++) { T.push(t); t += gap; gap *= pile.accel ?? MD.accel; } }
    const fromDir = (x, y) => {
      const f = pile.from ?? 'auto';
      if (typeof f === 'number') return [Math.cos(f * RAD), Math.sin(f * RAD)];
      const D = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[f];
      if (D) return D;
      const dx = x - W / 2, dy = y - H / 2, l = Math.hypot(dx, dy);
      if (l < 60) { const a = rr() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; }
      return [dx / l, dy / l];
    };
    const fanR = pile.radius, fanA = pile.angle ?? MODE.fan.angle;
    const S = papers.map((p, i) => {
      const [w, h] = sizeOf(i);
      let x = p.x, y = p.y, rot = p.rot;
      const j1 = rr(), j2 = rr(), j3 = rr(), j4 = rr(), j5 = rr();
      let from = { ...(p.from || {}) }, deck = null;
      if (pile.mode === 'drop') {
        if (x == null) x = center[0] + (j1 - .5) * 2 * spread * W * .2;
        if (y == null) y = center[1] + (j2 - .5) * 2 * spread * H * .16;
        if (rot == null) rot = (i % 2 ? 1 : -1) * (3 + j3 * (maxRot - 3));
        from = { s: 1 + MD.lift, a: 0, blur: MD.blur, dx: (j4 - .5) * 120, dy: -40 - j5 * 60, rot: (j4 - .5) * 12, ...from };
      } else if (pile.mode === 'fan') {
        const R0 = fanR ?? h * 1.5, k = n > 1 ? i / (n - 1) : .5, a = (k - .5) * fanA + (j3 - .5) * 2;
        const piv = [center[0], center[1] + R0];
        if (rot == null) rot = a;
        if (x == null) x = piv[0] + Math.sin(rot * RAD) * R0;
        if (y == null) y = piv[1] - Math.cos(rot * RAD) * R0;
        from = { rot: -rot, pivot: piv, ...from };
        deck = { at: pile.at ?? 0, dur: .6, dy: H * .85, rot: -6 };
      } else {
        if (x == null || y == null) {      // golden-angle spiral so the sheets cover the frame
          const r = spread * Math.sqrt((i + .5) / n), th = i * 2.39996 + seed;
          x = x ?? center[0] + Math.cos(th) * r * W * .42; y = y ?? center[1] + Math.sin(th) * r * H * .4;
        }
        if (rot == null) rot = (j3 * 2 - 1) * maxRot;
        const [ux, uy] = fromDir(x, y), D = Math.hypot(W, H) * 1.05 + Math.max(w, h) * .5;
        from = { dx: ux * D, dy: uy * D, rot: (j4 < .5 ? -1 : 1) * (22 + j5 * 16), ...from };
      }
      const at = p.at ?? T[i], dur = p.dur ?? MD.dur;
      return { i, w, h, x, y, rot, from, at, dur, pow: p.pow ?? MD.pow, show: p.show ?? (deck ? deck.at : at), z: p.z ?? i, deck };
    });
    if (pile.mode === 'fan') S.forEach((s, i) => { if (papers[i].at == null) s.at = (pile.at ?? 0) + .45 + i * (pile.stagger ?? MODE.fan.stagger); });

    // Pose of a sheet at t: { m (DOMMatrix: sheet-centre coords -> screen), a, h (height above the table 0..1, for the shadow) } or null (not shown yet)
    function pose(s, t) {
      if (t < s.show) return null;
      const k = cl((s.at + s.dur - t) / s.dur), g = Math.pow(k, s.pow), F = s.from;
      const piv = F.pivot || [s.x, s.y], sc = 1 + ((F.s ?? 1) - 1) * g;
      let m = new DOMMatrix();
      if (s.deck) { const kd = ez('expoOut')(cl((t - s.deck.at) / s.deck.dur)); const c = [center[0], center[1] + H * .3];
        m = m.translate(0, s.deck.dy * (1 - kd)).translate(c[0], c[1]).rotate(s.deck.rot * (1 - kd)).translate(-c[0], -c[1]); }
      m = m.translate((F.dx || 0) * g, (F.dy || 0) * g).translate(piv[0], piv[1]).rotate((F.rot || 0) * g).scale(sc).translate(-piv[0], -piv[1]);
      m = m.translate(s.x, s.y).rotate(s.rot);
      const u = 1 - k, a = F.a != null ? lerp(F.a, 1, ez('smooth')(cl(u / (MD.fade || .3)))) : 1;
      return { m, a, h: F.s && F.s !== 1 ? (sc - 1) / (F.s - 1) : 0, blur: (F.blur || 0) * g };
    }

    // ---------- Slow camera move (background + pile only) ----------
    function camAt(t) {
      const C = o.cam; if (!C) return null;
      let s, x, y, r;
      if (C.keys) { const K = C.keys, f = col => { if (t <= K[0][0]) return K[0][col] ?? 0;
          for (let i = 1; i < K.length; i++) if (t < K[i][0]) { const e = K[i].find((v, j) => j > 0 && typeof v !== 'number'); return lerp(K[i - 1][col] ?? 0, K[i][col] ?? 0, ez(e || 'easeInOut')((t - K[i - 1][0]) / (K[i][0] - K[i - 1][0]))); }
          return K[K.length - 1][col] ?? 0; };
        s = f(1) || 1; x = f(2); y = f(3); r = f(4); }
      else { const a = C.from || {}, b = C.to || {}, k = ez(C.ease || 'easeInOut')(cl((t - (C.t0 ?? 0)) / Math.max(.01, (C.t1 ?? 1) - (C.t0 ?? 0))));
        s = lerp(a.s ?? 1, b.s ?? 1, k); x = lerp(a.x ?? 0, b.x ?? 0, k); y = lerp(a.y ?? 0, b.y ?? 0, k); r = lerp(a.rot ?? 0, b.rot ?? 0, k); }
      const cx = C.cx ?? W / 2, cy = C.cy ?? H / 2;
      return new DOMMatrix().translate(cx + x, cy + y).rotate(r).scale(s).translate(-cx, -cy);
    }

    // ---------- Dim fade (blend the post set by XM.tex.use from dim.from toward it) ----------
    const AMT = new Set(['a', 'px', 'k', 'amp']);
    function blend(a, b, k) {
      if (typeof a === 'number' || typeof b === 'number') { const x = typeof a === 'number' ? a : 0, y = typeof b === 'number' ? b : 0; return lerp(x, y, k); }
      const out = {};
      for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
        const va = a ? a[key] : undefined, vb = b ? b[key] : undefined;
        if (va && typeof va === 'object' || vb && typeof vb === 'object') out[key] = blend(va || (typeof vb === 'object' ? zero(vb) : {}), vb || zero(va), k);
        else if (typeof va === 'number' && typeof vb === 'number') out[key] = lerp(va, vb, k);
        else if (typeof vb === 'number') out[key] = AMT.has(key) ? lerp(0, vb, k) : vb;
        else if (typeof va === 'number') out[key] = AMT.has(key) ? lerp(va, 0, k) : va;
        else out[key] = vb ?? va;
      }
      return out;
    }
    function zero(v) { if (!v || typeof v !== 'object') return 0; const z = {}; for (const k of Object.keys(v)) z[k] = typeof v[k] === 'number' ? (AMT.has(k) ? 0 : v[k]) : zero(v[k]); return z; }
    const preset = p => (typeof p === 'string' ? (XM.tex && XM.tex.POST[p]) || null : p || null);
    const dim = o.dim ? { dur: 32 / 30, ease: 'quadOut', from: 'paper', under: .18, pile: 0, ...o.dim } : null;
    if (dim && dim.at == null) errs('dim.at (when dimming starts) is required');
    const dimK = t => (dim ? ez(dim.ease)(cl((t - dim.at) / dim.dur)) : 1);
    let lookRef = null, postT = null;

    // ---------- Stamped big word ----------
    const Wd = o.words || null;
    if (Wd && !Wd.text) errs('words.text (the conclusion word over the pile) is required, set by the video\'s script; there is no default text');
    if (Wd && Wd.at == null) errs('words.at (when the big word appears) is required');
    const wf = Wd ? FONT[Wd.font || 'song'] : null;
    if (Wd && !wf) errs(`words.font must be song / brush, got ${Wd.font}`);
    const wdir = Wd ? (Wd.dir || 'h') : 'h';
    const wLines = Wd && Wd.text ? String(Wd.text).replace(STOP, '').split('\n').map(s => s.trim()).filter(Boolean) : [];
    let WL = null;
    function layoutWords(g) {
      if (WL) return WL;
      const F = wf || FONT.song, fam = F.fam, wt = F.w, ls = Wd.ls ?? 0;
      g.save(); g.letterSpacing = '0px'; g.font = `${wt} 100px ${fam}`;
      const adv = s => [...s].map(ch => g.measureText(ch).width / 100);
      const inkOf = s => { const m = g.measureText(s); return [m.actualBoundingBoxAscent / 100, m.actualBoundingBoxDescent / 100]; };
      const out = { fam, wt, rows: [] };
      if (wdir === 'h') {
        const box = Wd.box || [W * .03, H * .21, W * .94, H * .6];
        const ink = wLines.map(inkOf), A = wLines.map(adv), gap = Wd.gap ?? .08;
        const hSum = ink.reduce((v, [a, d]) => v + a + d, 0) + gap * (wLines.length - 1);
        let size = Wd.size || box[3] / hSum;
        let sq = Wd.squeeze ?? Math.min(...wLines.map((_, i) => (box[2] - ls * (A[i].length - 1)) / (A[i].reduce((v, x) => v + x, 0) * size)));
        if (Wd.squeeze == null) { if (sq < F.sq[0]) { size *= sq / F.sq[0]; sq = F.sq[0]; } sq = Math.min(sq, F.sq[1]); }
        const totH = ink.reduce((v, [a, d]) => v + (a + d) * size, 0) + gap * size * (wLines.length - 1);
        let y = box[1] + (box[3] - totH) / 2;
        wLines.forEach((s, i) => {
          const [a, d] = ink[i], base = y + a * size, w = (A[i].reduce((v, x) => v + x, 0) * size) * sq + ls * (A[i].length - 1);
          let x = box[0] + (box[2] - w) / 2; const chars = [];
          [...s].forEach((ch, j) => { chars.push({ ch, x, y: base }); x += A[i][j] * size * sq + ls; });
          out.rows.push({ chars, x0: box[0] + (box[2] - w) / 2, x1: box[0] + (box[2] + w) / 2, y0: base - a * size, y1: base + d * size });
          y += (a + d) * size + gap * size;
        });
        out.size = size; out.sq = sq; out.box = box;
      } else {
        const box = Wd.box || [W * .62, H * .1, W * .26, H * .8];
        const nc = wLines.length, maxN = Math.max(...wLines.map(s => [...s].length)), lsV = Wd.lsV ?? -.04, cg = Wd.colGap ?? .12;
        const shift = Wd.colShift ?? 0;
        const sq = Wd.squeeze ?? F.sqDef;
        const size = Wd.size || Math.min(box[3] / ((maxN + shift * (nc - 1)) * (1 + lsV)), box[2] / (nc * sq + (nc - 1) * cg));
        const colW = size * sq, totW = nc * colW + (nc - 1) * cg * size;
        const totH = (maxN + shift * (nc - 1)) * size * (1 + lsV);
        const x0 = box[0] + (box[2] - totW) / 2, y0 = box[1] + (box[3] - totH) / 2;
        wLines.forEach((s, c) => {        // columns run right to left
          const cx = x0 + totW - colW / 2 - c * (colW + cg * size), chars = [];
          let y = y0 + c * shift * size * (1 + lsV); const top = y;
          for (const ch of s) { const m = g.measureText(ch); const [a, d] = [m.actualBoundingBoxAscent / 100 * size, m.actualBoundingBoxDescent / 100 * size];
            const w = m.width / 100 * size * sq; chars.push({ ch, x: cx - w / 2, y: y + size * (1 + lsV) / 2 + (a - d) / 2 }); y += size * (1 + lsV); }
          out.rows.push({ chars, x0: cx - colW / 2, x1: cx + colW / 2, y0: top, y1: y });
        });
        out.size = size; out.sq = sq; out.box = box;
      }
      // centre of the whole block (pivot for rot)
      const xs = out.rows.flatMap(r => [r.x0, r.x1]), ys = out.rows.flatMap(r => [r.y0, r.y1]);
      out.c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
      g.restore();
      if (out.size < 56) console.warn(`XM.paperPile: big word size ${out.size.toFixed(0)} px < 56, unreadable in a portrait window`);
      WL = out; return WL;
    }
    const fadeStops = () => (Wd.fade === 'flat' ? [[0, 1], [1, 1]] : Array.isArray(Wd.fade) ? Wd.fade : wdir === 'v' ? FADE_V : FADE);
    function drawWords(g, t) {
      if (!Wd || !Wd.text || t < Wd.at) return;
      const Lw = layoutWords(g), col = Wd.color === 'accent' || !Wd.color ? P.accent : Wd.color === 'fg' ? P.fg : XK.col(Wd.color);
      const enter = Wd.enter || (Wd.font === 'brush' ? 'wipe' : 'sweep'), E = { ...(WORDS[enter] || {}), ...Wd };
      const outK = Wd.out != null ? 1 - ez('smooth')(cl((t - Wd.out) / .25)) : 1;
      if (outK <= 0) return;
      const Lc = XM.canvas('pile-words:' + id), q = Lc.g, Mk = XM.canvas('pile-wmask:' + id), mq = Mk.g;
      const rot = (Wd.rot || 0) * RAD, [cx, cy] = Lw.c;
      const xf = c => { c.translate(cx, cy); c.rotate(rot); c.translate(-cx, -cy); };
      q.save(); xf(q); q.font = `${Lw.wt} ${Lw.size}px ${Lw.fam}`; q.letterSpacing = '0px'; q.textBaseline = 'alphabetic'; q.fillStyle = col;
      let idx = 0;
      for (const r of Lw.rows) for (const c of r.chars) {
        const i = idx++, k = enter === 'cut' ? 1 : cl((t - Wd.at - i * E.per) / E.dur);
        if (k <= 0) continue;
        const e = ez(E.ease)(k);
        if (enter === 'wipe' && e < 1) {          // wipe in writing direction: top to bottom for vertical, left to right for horizontal, with a soft edge
          const T2 = XM.canvas('pile-wipe:' + id), tq = T2.g, sz = Lw.size;
          tq.save(); tq.setTransform(q.getTransform()); tq.font = q.font; tq.textBaseline = 'alphabetic'; tq.fillStyle = col;
          tq.translate(c.x, c.y); tq.scale(Lw.sq, 1); tq.fillText(c.ch, 0, 0);
          const soft = E.soft ?? .35, gr = wdir === 'v' ? tq.createLinearGradient(0, -sz * .95, 0, sz * .2) : tq.createLinearGradient(-sz * .05, 0, sz * 1.05, 0);
          const p = e * (1 + soft);
          gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(cl(p - soft), 'rgba(0,0,0,1)'); gr.addColorStop(cl(p), 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          tq.globalCompositeOperation = 'destination-in'; tq.fillStyle = gr; tq.fillRect(-sz, -sz * 1.5, sz * 3, sz * 3); tq.restore();
          q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.drawImage(T2.c, 0, 0); q.restore();
          continue;
        }
        const b = enter === 'sweep' ? (E.blur ?? 6) * (1 - e) : 0;
        q.save(); q.globalAlpha = enter === 'sweep' ? e : 1; if (b > .25) q.filter = `blur(${b.toFixed(2)}px)`;
        q.translate(c.x, c.y); q.scale(Lw.sq, 1); q.fillText(c.ch, 0, 0); q.restore();
      }
      q.restore();
      XM.note(Lw.fam, wLines.join(''));
      // Opacity profile: along the text height for horizontal (light top, solid middle, fading bottom), across each column for vertical
      const st = fadeStops(), A = (Wd.alpha ?? WORDS.alpha) * outK;
      mq.save(); xf(mq);
      for (const r of Lw.rows) {
        const gr = wdir === 'h' ? mq.createLinearGradient(0, r.y0, 0, r.y1) : mq.createLinearGradient(r.x0, 0, r.x1, 0);
        for (const [p, v] of st) gr.addColorStop(cl(p), `rgba(0,0,0,${cl(v * A).toFixed(4)})`);
        mq.fillStyle = gr;
        const pad = Lw.size * .3;
        if (wdir === 'h') mq.fillRect(r.x0 - pad, r.y0 - .001, r.x1 - r.x0 + 2 * pad, r.y1 - r.y0 + .002);
        else mq.fillRect(r.x0 - .001, r.y0 - pad, r.x1 - r.x0 + .002, r.y1 - r.y0 + 2 * pad);
      }
      mq.restore();
      q.save(); q.globalCompositeOperation = 'destination-in'; q.drawImage(Mk.c, 0, 0); q.restore();
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.drawImage(Lc.c, 0, 0); g.restore();
    }

    const Sm = o.small || null;
    // The small-text font (default NumIt) is first used at draw time: register the load as an asset so the first frame does not fall back to a system serif
    if (Sm && document.fonts) XM.asset(document.fonts.load(`${Sm.w ?? SMALL.w} 100px ${Sm.fam || SMALL.fam}`, String(Sm.text || '0')).catch(() => console.error('XM.paperPile: failed to load the small font')));
    // Default small-text colour: whichever of ink / off-white reads best on the paper colour. There is no glow, so light paper gets ink
    const smallCol = Sm && Sm.color ? (Sm.color === 'accent' ? P.accent : XK.col(Sm.color)) : DS.pick(paperCol, [DS.INK, '#f4f1ea'], 4.5);   // ink by default on light paper
    if (Sm && (!Sm.text || Sm.at == null)) errs('small needs text (a year / number) and at');
    function drawSmall(g, t) {
      if (!Sm || !Sm.text || t < Sm.at) return;
      const E = { ...SMALL, ...Sm }, size = E.size, chars = [...String(Sm.text)];
      if (size < 56) console.warn('XM.paperPile: small size < 56');
      g.save(); g.letterSpacing = '0px'; g.font = `${E.w} ${size}px ${E.fam}`; XM.note(E.fam, String(Sm.text)); g.textBaseline = 'alphabetic';
      const sq = E.squeeze ?? 1, adv = chars.map(ch => g.measureText(ch).width * sq), tw = adv.reduce((v, x) => v + x, 0);
      const m = g.measureText(Sm.text), a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent;
      const cx = Sm.x ?? W / 2, cy = Sm.y ?? H * .5;
      g.translate(cx, cy); if (Sm.rot) g.rotate(Sm.rot * RAD);
      let x = -tw / 2; const base = (a - d) / 2;
      const outK = Sm.out != null ? 1 - ez('smooth')(cl((t - Sm.out) / .25)) : 1;
      g.fillStyle = smallCol;
      chars.forEach((ch, i) => {
        const k = cl((t - Sm.at - i * E.per) / E.dur), e = ez(E.ease)(k);
        if (k > 0 && outK > 0) { g.save(); g.globalAlpha = e * outK; const b = E.blur * (1 - e); if (b > .25) g.filter = `blur(${b.toFixed(2)}px)`;
          g.translate(x, base); g.scale(sq, 1); g.fillText(ch, 0, 0); g.restore(); }
        x += adv[i];
      });
      g.restore();
    }

    // ---------- What lies under the pile ----------
    const Ui = o.under && o.under.src ? XM.image(o.under.src) : null;
    function drawUnder(g, t) {
      const U = o.under; if (!U) return;
      if (U.draw) { g.save(); U.draw(g, t, P); g.restore(); return; }
      if (Ui && Ui.ok) { const img = Ui.img, w = U.w || W, h = U.h || w * img.naturalHeight / img.naturalWidth;
        g.save(); if (U.gray) g.filter = `grayscale(${U.gray})`; g.drawImage(img, U.x ?? (W - w) / 2, U.y ?? (H - h) / 2, w, h); g.restore(); }
    }

    // ---------- The pile ----------
    const order = S.slice().sort((a, b) => a.z - b.z);
    function drawPile(q, t) {
      for (const s of order) {
        const ps = pose(s, t); if (!ps) continue;
        const pc = canvasOf(s.i); if (!pc) continue;
        const { m, a, h } = ps, w = pc.w, hh = pc.h;
        q.save(); q.globalAlpha = a;
        for (const sh of print.shadow) {      // sheet shadow (fixed screen direction, light from top left); the higher above the table, the farther, softer and fainter
          const k = 1 + 4 * h;
          q.save(); q.translate(sh.dx * k, sh.dy * k); q.setTransform(q.getTransform().multiply(m));
          q.globalAlpha = a * sh.a * (1 - .45 * h); q.filter = `blur(${(sh.blur * (1 + 1.6 * h)).toFixed(1)}px)`; q.fillStyle = '#000';
          q.fillRect(-w / 2 - sh.grow, -hh / 2 - sh.grow, w + 2 * sh.grow, hh + 2 * sh.grow); q.restore();
        }
        q.setTransform(q.getTransform().multiply(m)); q.imageSmoothingQuality = 'high';
        if (ps.blur > .3) q.filter = `blur(${ps.blur.toFixed(2)}px)`;          // sheets still in the air (close to the camera) are blurred and sharpen as they land
        q.drawImage(pc.c, -w / 2, -hh / 2, w, hh);
        q.restore();
      }
    }

    // ---------- Sound ----------
    const cues = [];
    if (o.sfx !== false) {
      const sf = o.sfx || {}, gain = sf.gain != null ? { gain: sf.gain } : {};
      const nm = sf.pile ?? (pile.mode === 'scatter' ? 'sheet' : 'riffle');   // scatter: a paper swish
      if (nm && S.length) { const t0 = Math.min(...S.map(s => s.at)), t1 = Math.max(...S.map(s => s.at + s.dur * .6));
        cues.push({ t: +t0.toFixed(3), name: nm, ...(nm === 'riffle' ? { dur: +Math.max(.4, t1 - t0).toFixed(3) } : {}), ...gain }); }
      const wn = sf.words ?? 'sparkle';
      if (wn && Wd && Wd.at != null) cues.push({ t: +Wd.at.toFixed(3), name: wn, ...gain });
    }
    const subs = Wd && Wd.text ? [{ from: +Wd.at.toFixed(3), to: Wd.out != null ? +Wd.out.toFixed(3) : null, text: wLines.join(''), mode: Wd.subtitle || 'keep' }] : [];
    if (!o.hud) errs('hud (corner HUD tl / bl / br) is required; there are no default words');

    const api = { P, n: S.length, pose: (i, t) => pose(S[i], t), rest: i => ({ x: S[i].x, y: S[i].y, rot: S[i].rot, w: S[i].w, h: S[i].h }), cam: camAt, words: () => WL, dimK };
    const shot = XM.shot({ bg: P.bg, stage: 'flat' }, Sh => (g, t) => {
      const cam = camAt(t);
      g.save(); if (cam) g.setTransform(g.getTransform().multiply(cam));
      DS.stage(g, P);
      drawUnder(g, t);
      g.restore();
      const kd = dimK(t);
      if (dim && dim.under > 0 && kd > 0) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply'; const v = Math.round(255 * (1 - dim.under * kd)); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, W, H); g.restore(); }
      const PL = XM.canvas('pile:' + id), pq = PL.g;
      pq.save(); if (cam) pq.setTransform(cam); drawPile(pq, t); pq.restore();
      if (print.soft > 0) { const B = XM.canvas('pile-soft:' + id); XM.tex.blurClamp(B.g, PL.c, print.soft); pq.clearRect(0, 0, W, H); pq.drawImage(B.c, 0, 0); }
      if (dim && dim.pile > 0 && kd > 0) { pq.save(); pq.globalCompositeOperation = 'source-atop'; pq.fillStyle = `rgba(0,0,0,${(dim.pile * kd).toFixed(4)})`; pq.fillRect(0, 0, W, H); pq.restore(); }
      g.drawImage(PL.c, 0, 0);
      // Texture layer: fade the post from dim.from toward the one set by use, flush it, then draw the stamped words above the post pass
      const look = Sh.L.look;
      if (look && dim) {
        if (lookRef !== look) { lookRef = look; postT = preset(look.post); }
        if (postT) look.post = kd >= 1 ? postT : blend(preset(dim.from) || {}, postT, kd);
      }
      if (XM.tex) XM.tex.flush(g, P);
      if (o.draw) { g.save(); o.draw(g, t, P, api); g.restore(); }
      const smallOver = !Sm || Sm.over !== false;
      if (!smallOver) drawSmall(g, t);
      drawWords(g, t);
      if (smallOver) drawSmall(g, t);
      DS.hud(g, t, P, { ...(o.hud || {}) });
    });
    shot.cues = cues; shot.subs = subs;
    shot.times = { pile: S.map(s => [s.at, s.at + s.dur]), words: Wd ? Wd.at : null, small: Sm ? Sm.at : null };
    shot.api = api;
    return shot;
  }

  XM.paperPile = paperOf;
  XM.paperPile.DEF = { MODE, SHADOW, FADE, FADE_V, WORDS, SMALL };
})();
