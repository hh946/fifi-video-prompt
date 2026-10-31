// XM.notify: LED push-in. One rounded-square object appears -> the camera pulls back to an n×n grid -> pushes into the
// centre tile, whose face dissolves into a full-screen LED dot wall -> the dots go dark except the ones that spell a shape.
// Good for "one -> many -> dive in and land on one conclusion". What sits on the tiles and what shape is spelled out is up to the caller.
// Depends on lib.js, xk.js, xm-core.js, xm-ds.js, xm-kit.js (load them first). Docs: docs/components/notify.md.
// Canvas 2D (XM.shot), deterministic (randomness only via XM.rng / hash); getImageData only on offscreen layers (glyph / icon -> dot map).
// Fonts: FusionPixel (pixel glyphs) and LongCang (handwritten side text), files in xm-assets/fonts/, registered in the template index.html.
//
// The whole component is one continuous shot:
//   · One camera (zoom factor Z(t) in log space). While a beat holds, it pushes in very slowly in one direction (1.5%/s slow pace, 3%/s default);
//     between beats it blends from one slow-push line to the next with smootherstep (6k⁵−15k⁴+10k³, zero velocity and acceleration at both ends),
//     so position and speed stay continuous: no hard stops, no back-and-forth (speed only crosses zero once, at the push -> pull turn).
//   · The grid's centre tile is the beat-1 icon (same object, only its size follows the camera); the other tiles fade in from the centre outwards.
//   · The wall is the centre icon's face: halfway through the push the face turns transparent, revealing dots laid out on the LED pitch
//     (the face "dissolves" into dots), and a barrel fisheye bulges in as it fills the screen.
//   · Dots are drawn per frame by position (5 defocus sprites blended by distance from centre), so zoom, bulge, fade-out and colour
//     changes are all continuous; the fastest push / pull frames get a little radial motion blur.
//   · The badge number changes in place at the pill centre (old fades out, new fades in; no vertical roll, which would show half-digits
//     at the pill edges), and the pill width eases to the new width.
//
// XM.notify(o) -> { L, update, cues }
// A frame, not fixed content: the agent decides per video what is drawn on the object and tiles, whether there is a badge / counter
// (and from what to what), whether there is side text, and what shape is spelled at the end. The name comes from "notifications",
// but it is not limited to that.
//   at     : start (absolute s; times below are pace:'slow'; the default pace is faster, see pace): a dot appears (0–0.3) -> stretches to a short bar (0.12–0.5) -> becomes the icon (0.45–0.95) -> badge (0.9); then a slow push-in
//   icon   : optional knockout on the centre tile: XM.KIT.MOTIFS name | 1–2 characters | function (g, cx, cy, s, col) => {}; omitted = plain square
//   badge  : optional corner badge: true (plain dot) | 'text' (text in the badge) | { at, text, steps:[[t,'text'],…] } (steps: switch to new text at t)
//            { at, count:{ from, to (required), slow:[…], per:.4, fast:.9, p:1.6, plus:true } }: automatic slow-then-fast counter --
//            the slow part changes every `per` seconds, the fast part accelerates geometrically with at most one change per frame (skips numbers
//            near the end), the last step shows `to+`. Numbers always swap at the pill centre (fade out / fade in), faster for shorter steps. Pair with the countup sound
//   grid   : { at, n }  pull back to an n×n grid (default at+0.55, or at+2.3 with pace:'slow', after a badge count 0.3s after it ends; n default 3, should be odd: 3 / 5 / 7); false skips this beat (icon pushes straight into the wall)
//   glyph  : optional content for the grid tiles: same three forms as icon, one value (all tiles) or an array (row-major, n×n entries incl. the centre; null = empty); omitted = shaded squares only
//   wall   : { at }  push into the centre tile and dissolve into the LED wall (default grid.at+1.3; +1.4 with pace:'slow', +0.6 with hit)
//   side   : optional handwritten text on both sides of the wall (right normal, left mirrored, decorative); omitted = none
//   doodle : optional background pattern behind beat 1: { motifs:[…] | draw(g, W, H), small, seed }, colours come from the component; omitted = flat background
//   shape  : { at, text | motif | bits, px }  (required: what to spell) all dots go dark except the shape (at defaults to 0.25s after the wall).
//            text: digits / short word (FusionPixel, one glyph pixel = one dot; best 2–3 CJK characters or ≤ 5 Latin characters / digits)
//            motif: icon name. bell / bubble / mail / heart / check are hand-made dot icons (clearest); other XM.KIT.MOTIFS names are sampled filled at 17×17 (rougher outline)
//            bits: ['..#..', '.###.', …] draw your own; px: dots per glyph pixel (default 1; 2 = denser wall)
//            Dot pitch is automatic: shape height ≈ 46% of frame height (at most 64px per dot, at least 22px)
//   colors : { accent (badge / dark-dot base / hit colour changes), lit (lit dots), off (dark dots), badge }
//   tone   : 'ink' (default) | 'paper' | 'accent'; hud / hit / cam / seed as in other XM components (you write the hud text; the component sets no default text)
//   pace   : default is fast, like a feed refreshing (icon 0.3s, pull-back 1.1s, accelerating push 0.55s, 3%/s slow push while holding, badge swap 0.2s; hit: pull-back 0.55s, push 0.6s);
//            'slow' = slower pacing (pull-back 0.9s, push 1.0s, 1.5%/s slow push), only when the voiceover line is long and needs the time
//   hit    : hook mode: same timing as default, plus two colour changes after the shape (white wall + accent shape -> accent wall + dark shape), stronger motion blur on the fastest push frames
// Beat timing (pace:'slow', at = 0): icon 0–0.95 -> pull-back 2.3–3.2 (tiles 2.45–3.05) -> push 3.7–4.7 (face dissolve 4.0–4.55, fisheye 4.1–5.0) -> fade-out 5.4–6.25 -> settle
// Sound cues: icon appears (appear), grid fades in (multi), wall fills (glow), shape settles (title).
(() => {
  const { W, H } = XK;
  const DS = XM.DS, SFX = DS.SFX, KIT = XM.KIT, INK = DS.INK, PAPER = DS.PAPER;
  const CX = W / 2, CY = H / 2, TAU = Math.PI * 2;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const EO = XM.expoOut;
  const io3 = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const sm = k => k * k * (3 - 2 * k);
  const pr = (t, a, d) => cl((t - a) / Math.max(1e-6, d));
  const lin = (a, b, k) => a + (b - a) * k;
  const rgbOf = h => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
  const mix = (a, b, k) => { const A = rgbOf(a), B = rgbOf(b); return '#' + A.map((v, i) => Math.round(lin(v, B[i], k)).toString(16).padStart(2, '0')).join(''); };
  const PIXF = 'FusionPixel', HANDF = 'LongCang';
  const fontsOK = () => !document.fonts || document.fonts.status === 'loaded';

  // What to draw on a tile / the centre icon (caller decides): XM.KIT.MOTIFS name -> line icon; other string -> text (1–2 characters best); function -> (g, cx, cy, s, col) => {}
  function drawGlyph(q, spec, cx, cy, s, col) {
    if (!spec) return;
    if (typeof spec === 'function') { q.save(); spec(q, cx, cy, s, col); q.restore(); return; }
    if (KIT.MOTIFS.includes(spec)) { KIT.motif(q, spec, cx, cy, s * .3, { col, lw: Math.max(2, s * .06), seed: 3 }); return; }
    const t = String(spec), zh = /[⺀-鿿]/.test(t), fam = zh ? 'zh' : 'unb', M = XM.measure(q, t, { fam, size: 100, w: 900 });
    const size = Math.min(s * .5, 100 * s * .62 / Math.max(1, M));
    XM.txt(q, t, cx, cy + size * .36, { fam, size, w: 900, col, align: 'center' });
  }
  // ============================================================ Icon: rounded square (28% radius) + top-right badge (with a transparent gap ring around it)
  // o = { col, inner:[[ratio, colour]…] (bright core of a defocused icon), glyph (knockout line icon), badge (badge colour), bk (badge 0..1), text (badge text), textCol }
  function icon(g, x, y, s, o = {}) {
    if (s < 1) return;
    const pad = Math.ceil((s * 1.05 + 8) / 32) * 32, L = XM.canvas('xm-notify-icon', pad * 2, pad * 2), q = L.g;
    q.save(); q.translate(pad, pad);
    q.fillStyle = o.col; q.beginPath(); q.roundRect(-s / 2, -s / 2, s, s, s * .28); q.fill();
    for (const [k, c] of o.inner || []) { q.fillStyle = c; q.beginPath(); q.roundRect(-s * k / 2, -s * k / 2, s * k, s * k, s * k * .3); q.fill(); }
    if (o.glyph) {
      q.globalCompositeOperation = 'destination-out';
      drawGlyph(q, o.glyph, 0, s * .02, s, '#000');
      q.globalCompositeOperation = 'source-over';
    }
    const bk = o.bk ?? 0;
    if (o.badge && bk > 0) {
      const bd = s * .36 * bk, gap = s * .065 * bk, tx = o.text != null && o.text !== '' ? String(o.text) : '', fs = bd * .56;
      let bw = bd;
      if (tx) bw = Math.max(bd, XM.measure(q, tx, { fam: 'unb', size: fs, w: 800 }) + bd * .62);
      const cy = -s / 2 + s * .08, x1 = s / 2 - s * .08 + bd / 2, x0 = x1 - bw;
      const pill = e => { q.beginPath(); q.roundRect(x0 - e, cy - bd / 2 - e, bw + 2 * e, bd + 2 * e, bd / 2 + e); };
      q.globalCompositeOperation = 'destination-out'; pill(gap); q.fill(); q.globalCompositeOperation = 'source-over';
      q.fillStyle = o.badge; pill(0); q.fill();
      if (tx && bk > .5) XM.txt(q, tx, (x0 + x1) / 2, cy + fs * .37, { fam: 'unb', size: fs, w: 800, col: o.textCol, align: 'center', alpha: cl((bk - .5) * 2) });
    }
    q.restore();
    g.drawImage(L.c, x - pad, y - pad);
  }

  // ============================================================ Shape -> dot map (cols × rows on/off table)
  function textBits(text) {
    const chars = [...String(text)], C = 8, n = chars.length, w = C * (14 * n + 6), h = C * 20;
    const L = XM.canvas('xm-notify-pix', w, h), g = L.g;
    g.font = `${C * 12}px ${PIXF}`; g.textBaseline = 'alphabetic'; g.fillStyle = '#000'; g.fillText(chars.join(''), C * 2, C * 15);
    XM.note(PIXF, chars.join(''));
    const d = g.getImageData(0, 0, w, h).data, NX = w / C, NY = h / C, on = [];
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) if (d[((y * C + C / 2) * w + x * C + C / 2) * 4 + 3] > 127) on.push([x, y]);
    return on;
  }
  function motifBits(name, mode) {
    const R = 7, C = 12, N = 2 * R + 3, L = XM.canvas('xm-notify-motif', N * C, N * C), g = L.g;
    KIT.motif(g, name, N * C / 2, N * C / 2, R * C, { col: '#000', lw: C * 1.3, mode: mode || 'fill', seed: 5 });
    const d = g.getImageData(0, 0, N * C, N * C).data, on = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let a = 0; for (const sy of [.2, .5, .8]) for (const sx of [.2, .5, .8]) a += d[((Math.floor((y + sy) * C)) * N * C + Math.floor((x + sx) * C)) * 4 + 3] > 100 ? 1 : 0;
      if (a >= 4) on.push([x, y]);
    }
    return on;
  }
  // Hand-made dot icons (clearer than downsampling a line icon); other names are sampled from the filled XM.KIT.motif
  const LED_ICONS = {
    bell: ['......#......', '....#####....', '...#######...', '..#########..', '..#########..', '..#########..', '..#########..', '.###########.', '.###########.', '#############', '.............', '.....###.....', '......#......'],
    bubble: ['.###########.', '#############', '#############', '###.##.##.###', '#############', '#############', '.###########.', '..###........', '..##.........', '..#..........'],
    mail: ['###############', '##...........##', '#.#.........#.#', '#..#.......#..#', '#...#.....#...#', '#....#...#....#', '#.....#.#.....#', '#......#......#', '#.............#', '###############'],
    heart: ['.###.....###.', '#####...#####', '######.######', '#############', '#############', '.###########.', '..#########..', '...#######...', '....#####....', '.....###.....', '......#......'],
    check: ['..........##', '.........###', '........###.', '#......###..', '##....###...', '###..###....', '.######.....', '..####......', '...##.......'],
  };
  function shapeBits(sh) {
    let on;
    if (!sh.bits && sh.motif && LED_ICONS[sh.motif]) sh = { ...sh, bits: LED_ICONS[sh.motif] };
    if (sh.bits) { on = []; sh.bits.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.' && c !== ' ') on.push([x, y]); })); }
    else if (sh.motif) on = motifBits(sh.motif, sh.mode);
    else on = textBits(sh.text ?? ' ');
    if (!on.length) on = [[0, 0]];
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const [x, y] of on) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const px = Math.max(1, Math.round(sh.px || 1)), cols = (x1 - x0 + 1) * px, rows = (y1 - y0 + 1) * px, set = new Set();
    for (const [x, y] of on) for (let a = 0; a < px; a++) for (let b = 0; b < px; b++) set.add(((y - y0) * px + b) * 4096 + (x - x0) * px + a);
    return { cols, rows, has: (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && set.has(y * 4096 + x) };
  }


  // ============================================================ Dots on the face (world units: icon side SG at grid zoom, centred at the origin)
  // Pitch p is the on-screen spacing once the wall fills the screen: shape height ≈ 46% of H; full-screen face is 1700px wide -> zoom ZW = 1700 / SG, world pitch pw = p / ZW.
  function faceLayout(B, SG) {
    let p = Math.min(64, (H * .46) / B.rows); if (B.cols * p > 1480) p = 1480 / B.cols; p = Math.max(22, p);
    const ZW = 1700 / SG, pw = p / ZW;
    const fit = par => { let m = Math.floor((SG - pw * .9) / pw) + 1; if ((m - par) % 2) m--; return m; };
    const NC = Math.max(B.cols, fit(B.cols % 2)), NR = Math.max(B.rows, fit(B.rows % 2)), ox = (NC - B.cols) / 2, oy = (NR - B.rows) / 2;
    const rr = SG * .28, U = [], V = [], S = [], HS = [], RW = [];
    let rmax = 1;
    for (let j = 0; j < NR; j++) for (let i = 0; i < NC; i++) {
      const u = (i - (NC - 1) / 2) * pw, v = (j - (NR - 1) / 2) * pw, ax = Math.abs(u) - (SG / 2 - rr), ay = Math.abs(v) - (SG / 2 - rr);
      if (ax > 0 && ay > 0 && Math.hypot(ax, ay) > rr - pw * .45) continue;          // no dots outside the rounded corners
      U.push(u); V.push(v); S.push(B.has(i - ox, j - oy)); HS.push(hash(i * 7.31 + j * 3.17)); const rw = Math.hypot(u, v); RW.push(rw); rmax = Math.max(rmax, rw);
    }
    return { p, pw, ZW, n: U.length, U, V, S, HS, RW, rmax };
  }
  // Dot sprites: one disc drawn at 5 defocus levels (sigma / radius), cached per colour; each frame it is rotated, radially squashed and scaled by position (blur scales with it)
  const R0 = 48, SIGR = [.03, .12, .25, .42, .62];
  const sprite = (col, lv) => {
    const sg = SIGR[lv] * R0, S = Math.ceil(2 * (R0 + 2.6 * sg)) + 2;
    return KIT.cached(`xm-notify-spr:${col}:${lv}`, S, S, q => { q.filter = `blur(${sg.toFixed(2)}px)`; q.fillStyle = col; q.beginPath(); q.arc(S / 2, S / 2, R0, 0, TAU); q.fill(); q.filter = 'none'; });
  };
  const s5 = k => { k = cl(k); return k * k * k * (k * (k * 6 - 15) + 10); };       // smootherstep: zero velocity and acceleration at both ends

  // ============================================================ XM.notify
  // Slow-then-fast badge counter. c = { from:1, to:99, slow:[2,3] (values of the slow part), per:.4 (slow step interval), fast:.9 (fast part duration), p:1.6 (fast acceleration), plus:true (last step shows to+), at }
  // Slow part: from -> each value in slow, one every `per` s. Fast part: from the last slow value a to `to`, value follows a·(to/a)^(u^p) (u = time fraction of the fast part),
  // at most one change per frame, so it skips more towards the end (13, 16, 20, 26…). Returns { steps:[[t, 'n']], first, t0, t1 }
  function countSteps(c, defAt) {
    if (c.from == null || c.to == null) console.error('XM.notify: badge.count needs from / to, set by the video\'s script');
    const from = c.from ?? 0, to = c.to ?? 0, slow = c.slow ?? [from + 1, from + 2], per = c.per ?? .4, F = c.fast ?? .9, p = c.p ?? 1.6;
    const t0 = c.at ?? defAt, out = []; let t = t0, last = from;
    for (const v of slow) { t += per; out.push([t, String(v)]); last = v; }
    const a = Math.max(1, last), lr = Math.log(to / a), FPS = 30;
    for (let f = 1; f <= Math.ceil(F * FPS); f++) {
      const u = Math.min(1, f / (F * FPS)), v = Math.floor(a * Math.exp(lr * Math.pow(u, p)) + 1e-6);
      if (v > last && v < to) { out.push([t + f / FPS, String(v)]); last = v; }
    }
    const tEnd = t + F;
    out.push([tEnd, (c.plus ?? true) ? to + '+' : String(to)]);
    return { steps: out, first: from, t0, t1: tEnd };
  }

  function notify(o = {}) {
    const tone = o.tone || (XK.TH.dark ? 'ink' : 'paper'), hit = !!o.hit, seed = o.seed ?? 4;
    const P = { ...DS.tone(tone) }, C = o.colors || {};
    const A0 = C.accent || XK.col('accent');
    const LIT = C.lit || P.fg, BADGE = C.badge || (tone === 'accent' ? P.fg : A0);
    const OFF = C.off || (tone === 'ink' ? mix(P.bg, A0, .3) : mix(P.bg, P.fg, .12));
    const ACC = tone === 'accent' ? P.fg : A0;
    const BTX = DS.contrast(BADGE, INK) >= DS.contrast(BADGE, PAPER) ? INK : PAPER;
    const DINK = tone === 'paper' ? mix(P.bg, P.fg, .1) : tone === 'accent' ? mix(P.bg, INK, .28) : mix(P.bg, P.fg, .075);
    const VIG = tone === 'paper' ? 'rgba(40,30,10,' : 'rgba(0,0,0,';

    // ---------- timing ----------
    const at = o.at ?? 0;
    // Pacing: default uses the fast (hook) timing without the colour flashes; pace:'slow' uses the slower timing
    const Q = hit || o.pace !== 'slow';
    // Slow then fast: pull-back to the grid is slow, push into the wall is fast and accelerating, ending in a short brake (PUSHC)
    const DP = hit ? .55 : Q ? 1.1 : .9, DW = hit ? .6 : Q ? .55 : 1.0, RATE = Math.log(Q ? 1.03 : 1.015);
    // Push curve: speed ∝ k^2.4·(1−k)^1.6 (late bell) -> gentle start, fastest around 60%, braking over the last 40% (about 6 frames in 0.55s), not an abrupt stop
    const PUSHC = hit || !Q ? s5 : (() => { const N = 240, c = [0]; for (let i = 1; i <= N; i++) { const k = (i - .5) / N; c.push(c[i - 1] + Math.pow(k, 2.4) * Math.pow(1 - k, 1.6)); }
      const tot = c[N]; return k => { k = cl(k) * N; const i = Math.min(N - 1, Math.floor(k)); return (c[i] + (c[i + 1] - c[i]) * (k - i)) / tot; }; })();
    const B1 = Q ? { dot: .12, line: [.03, .14], sq: [.13, .17] } : { dot: .3, line: [.12, .38], sq: [.45, .5] };
    const morphEnd = at + B1.sq[0] + B1.sq[1];
    const bOpt = o.badge == null || o.badge === false ? null : typeof o.badge === 'object' ? o.badge : { text: o.badge === true ? '' : String(o.badge) };      // badge is an optional slot: omitted = none
    const badgeAt = bOpt ? bOpt.at ?? at + (Q ? .25 : .9) : 0, ROLL = Q ? .2 : .28;
    // Badge numbers: hand-written steps, or count generates a slow-then-fast counter (slow part one by one, fast part geometric and skipping, ending at to+)
    let steps = bOpt && bOpt.steps ? bOpt.steps.slice().sort((a, b) => a[0] - b[0]) : [];
    const CNT = bOpt && bOpt.count ? countSteps(bOpt.count, badgeAt) : null;
    if (CNT) { steps = CNT.steps; if (bOpt.text == null) bOpt.text = String(CNT.first); }
    // Duration of each swap: the closer the next step, the faster the swap (at most ROLL, at least 1 frame)
    for (let i = 0; i < steps.length; i++) { const gap = i + 1 < steps.length ? steps[i + 1][0] - steps[i][0] : 1; steps[i] = [steps[i][0], steps[i][1], Math.max(1 / 30, Math.min(ROLL, gap * .85))]; }
    const grid = o.grid === false ? null : { at: (o.grid && o.grid.at) ?? (CNT ? CNT.t1 + .3 : at + (Q ? .55 : 2.3)), n: Math.max(3, ((o.grid && o.grid.n) || 3) | 1) };
    if (grid) grid.at = Math.max(grid.at, morphEnd + .05);
    const wallAt = Math.max((o.wall && o.wall.at) ?? (grid ? grid.at + (hit ? .6 : Q ? DP + .2 : 1.4) : at + (Q ? .55 : 2.3)), grid ? grid.at + DP : morphEnd + .05);
    if (!(o.shape && (o.shape.text != null || o.shape.motif || o.shape.bits))) console.error('XM.notify: shape:{ text | motif | bits } (what the dots finally form) is required, set by the video\'s script; there is no default shape');
    const SH = { ...(o.shape || {}) };
    const shapeAt = Math.max(SH.at ?? wallAt + (Q ? .75 : 1.7), wallAt + DW);
    const SPREAD = Q ? .12 : .4, OFFD = Q ? .2 : .45;
    const side = o.side == null || o.side === false ? null : String(o.side);              // handwritten side text: optional slot, omitted = none
    const DOO = typeof o.doodle === 'function' ? { draw: o.doodle, key: 'xm-notify' } : o.doodle && typeof o.doodle === 'object' ? o.doodle : null;   // beat-1 background pattern: optional slot
    const heroGlyph = typeof o.icon === 'string' || typeof o.icon === 'function' ? o.icon : o.icon && o.icon.glyph;
    // hit: four states after the shape appears ([shape dots, other dots], each [brightness, accent ratio]), start times, blend durations
    const HS = hit ? [shapeAt, shapeAt + .2, shapeAt + .4, shapeAt + .6] : null, HF = [.1, .12, .12, .18];
    const HST = [[[1, 0], [0, 0]], [[1, 1], [1, 0]], [[0, 1], [1, 1]], [[1, 0], [0, 1]]];

    const cues = []; const cue = (t, name, gain, x = {}) => { if (isFinite(t)) cues.push({ t: +t.toFixed(3), name, gain, ...x }); };
    cue(at, SFX.appear, .45);
    if (CNT) cue(CNT.t0, SFX.count, .5, { dur: +(CNT.t1 - CNT.t0).toFixed(3) });      // number rolls always get countup (dur covers the roll, the ding lands on to+)
    if (grid) cue(grid.at + DP * .3, SFX.multi, .4);
    cue(wallAt + DW * .8, SFX.glow, .4);
    cue(hit ? HS[3] : shapeAt + (Q ? .25 : .45), SFX.title, .55);

    // ---------- size / grid ----------
    const n = grid ? grid.n : 3, PG = Math.min(260, 900 / n), SG = Math.round(PG * .64), m0 = (n - 1) / 2, cIdx = (n * n - 1) >> 1;
    const ZA = 1.75;                                   // beat-1 icon zoom (icon about 290px); the grid level is 1
    const ZW = 1700 / SG;                              // full screen
    const glyphOf = idx => Array.isArray(o.glyph) ? o.glyph[idx] : o.glyph;
    const R = XM.rng(seed * 97 + 13), CELLS = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const idx = j * n + i, v = .3 + R() * .62, ring = R() < .45 ? 2 : 1, sig = [.6, 1.6, 3.2, 5][Math.floor(R() * 4)];
      const inner = ring === 2 ? [[.74, mix(P.bg, P.fg, Math.min(.98, v + .18))], [.5, mix(P.bg, P.fg, Math.min(1, v + .32))]] : [[.66, mix(P.bg, P.fg, Math.min(1, v + .22))]];
      CELLS.push({ i, j, idx, hero: idx === cIdx, col: mix(P.bg, P.fg, v), inner, sig, glyph: glyphOf(idx), dist: Math.hypot(i - m0, j - m0) });
    }
    const cellImg = c => KIT.cached(`xm-notify-cell:${seed}:${n}:${c.idx}:${c.col}:${typeof c.glyph === 'function' ? 'fn' : c.glyph || ''}:${tone}`, Math.ceil(SG * 1.6), Math.ceil(SG * 1.6), q => {
      q.filter = `blur(${c.sig}px)`; icon(q, SG * .8, SG * .8, SG, { col: c.col, inner: c.glyph ? [] : c.inner, glyph: c.glyph }); q.filter = 'none'; });
    const APP = Q ? [.05, .1, .3] : [.15, .22, .5];      // other tiles fade in: delay of the first ring after pull-back starts, extra delay per ring outwards, duration per tile

    let FACE = null;
    const face = () => { if (FACE) return FACE; const r = faceLayout(shapeBits(SH), SG); if (fontsOK()) FACE = r; return r; };

    // ---------- camera: zoom in log space. During each hold it follows a slow-push line; between holds smootherstep blends from one line to the next ----------
    const HOLDS = [{ z: ZA, te: at }];
    if (grid) HOLDS.push({ z: 1, ts: grid.at, te: grid.at + DP });
    HOLDS.push({ z: ZW, ts: wallAt, te: wallAt + DW, curve: PUSHC });
    const Lk = (k, t) => Math.log(HOLDS[k].z) + RATE * (t - HOLDS[k].te);
    function camL(t) {
      let L = Lk(0, t);
      for (let k = 1; k < HOLDS.length; k++) { const h = HOLDS[k]; if (t >= h.te) L = Lk(k, t); else if (t > h.ts) L = lin(Lk(k - 1, t), Lk(k, t), (h.curve || s5)((t - h.ts) / (h.te - h.ts))); }
      return L;
    }
    const camZ = t => Math.exp(camL(t));
    const camV = t => Math.abs(camL(t + .01) - camL(t - .01)) / .02;    // log speed (e-folds of zoom per second)

    // ---------- badge ----------
    const badgeText = t => { let cur = bOpt ? bOpt.text ?? '' : '', prev = cur, ts = -1, rd = ROLL; for (const [tt, v, r] of steps) if (t >= tt) { prev = cur; cur = String(v); ts = tt; rd = r || ROLL; } return [cur, prev, ts, rd]; };
    function badgeDraw(g, t, s, bk, ba = 1) {
      if (!bOpt || bk <= 0 || ba <= 0) return;
      g.save(); g.globalAlpha = ba;
      const bd = s * .36 * bk, gap = s * .065 * bk, cy = CY - s / 2 + s * .08, xr = CX + s / 2 - s * .08 + bd / 2, fs = bd * .56;
      const [cur, prev, ts, rd] = badgeText(t), k = ts >= 0 && rd >= .1 ? s5(pr(t, ts, rd)) : 1;      // steps < 0.1s swap instantly without a cross-fade (semi-transparent flickering digits look soft)
      const wOf = tx => tx ? Math.max(bd, XM.measure(g, tx, { fam: 'unb', size: fs, w: 800 }) + bd * .62) : bd;
      const bw = lin(wOf(prev), wOf(cur), k), x0 = xr - bw;
      const pill = e => { g.beginPath(); g.roundRect(x0 - e, cy - bd / 2 - e, bw + 2 * e, bd + 2 * e, bd / 2 + e); };
      g.fillStyle = P.bg; pill(gap); g.fill();                       // gap ring between badge and icon
      g.fillStyle = BADGE; pill(0); g.fill();
      if ((cur || prev) && bk > .5) {
        // Swap in place (always at the centre, no vertical roll: half-digits would show at the pill edges while rolling):
        // old number fades out at the centre and shrinks to .9; new one fades in and settles from 1.12 to 1 (no bounce). With 1-frame steps k jumps to 1: a clean swap
        g.save(); pill(0); g.clip(); const a = cl((bk - .5) * 2), xm = (x0 + xr) / 2, base = cy + fs * .37;
        const put = (tx, al, sc) => { if (!tx || al <= 0) return; g.save(); g.translate(xm, cy); g.scale(sc, sc); g.translate(-xm, -cy);
          XM.txt(g, tx, xm, base, { fam: 'unb', size: fs, w: 800, col: BTX, align: 'center', alpha: a * al }); g.restore(); };
        if (k < 1 && prev && prev !== cur) { const ko = s5(cl(k / .45)); put(prev, 1 - ko, 1 - .1 * ko); }
        const ki = prev && prev !== cur ? s5(cl((k - .3) / .7)) : 1; put(cur, ki, 1 + .12 * (1 - ki));
        g.restore();
      }
      g.restore();
    }
    const glyphImg = () => KIT.cached(`xm-notify-hg:${typeof heroGlyph === 'function' ? 'fn' + seed : heroGlyph}:${P.bg}`, 520, 520, q => drawGlyph(q, heroGlyph, 260, 260, 500, P.bg));
    // Centre icon (centre grid tile): world side SG, on screen SG × Z. faceA: face opacity (it dissolves into dots during the push)
    function hero(g, t, Z, faceA) {
      if (t < at) return;
      if (t < morphEnd) {             // dot -> short bar -> rounded square (world size, follows the camera)
        const kd = s5(pr(t, at, B1.dot)), ks = s5(pr(t, at + B1.line[0], B1.line[1])), km = s5(pr(t, at + B1.sq[0], B1.sq[1]));
        const w = lin(lin(18, 160, ks) / ZA, SG, km) * Z * kd, h = lin(18 / ZA, SG, km) * Z * kd, r = lin(9 / ZA, SG * .28, km) * Z * kd;
        g.fillStyle = LIT; g.globalAlpha = kd; g.beginPath(); g.roundRect(CX - w / 2, CY - h / 2, w, h, r); g.fill(); g.globalAlpha = 1;
        return;
      }
      const s = SG * Z;
      if (faceA > 0) {
        g.globalAlpha = faceA; g.fillStyle = LIT; g.beginPath(); g.roundRect(CX - s / 2, CY - s / 2, s, s, s * .28); g.fill();
        const ga = heroGlyph ? s5(pr(t, morphEnd - .1, .35)) * faceA : 0;
        if (ga > 0) { const im = glyphImg(), k = s / 500; g.globalAlpha = ga; g.drawImage(im, CX - im.width / 2 * k, CY - im.height / 2 * k + s * .02, im.width * k, im.height * k); }
        g.globalAlpha = 1;
      }
      badgeDraw(g, t, s, bOpt ? s5(pr(t, badgeAt, .35)) : 0, faceA);        // badge dissolves (fades) with the face, revealing the dots underneath
    }
    function neighbors(g, t, Z) {
      if (!grid) return;
      for (const c of CELLS) {
        if (c.hero) continue;
        const k = s5(pr(t, grid.at + APP[0] + APP[1] * (c.dist - 1), APP[2])); if (k <= 0) continue;
        const x = CX + (c.i - m0) * PG * Z, y = CY + (c.j - m0) * PG * Z, im = cellImg(c), sz = im.width * Z * lin(.72, 1, k);
        if (x + sz / 2 < 0 || x - sz / 2 > W || y + sz / 2 < 0 || y - sz / 2 > H) continue;
        g.globalAlpha = k; g.drawImage(im, x - sz / 2, y - sz / 2, sz, sz); g.globalAlpha = 1;
      }
    }
    // Per-dot state right now: [brightness, accent ratio, size factor]
    function dotState(F, q, t) {
      const isS = F.S[q];
      if (t < shapeAt) return [1, 0, 1];
      if (hit) {
        let b = 1, c = 0;
        for (let k = 0; k < 4; k++) { const w = s5(pr(t, HS[k] + (k === 0 && !isS ? SPREAD * F.RW[q] / F.rmax : 0), HF[k])); if (w <= 0) break; const st = HST[k][isS ? 0 : 1]; b = lin(b, st[0], w); c = lin(c, st[1], w); }
        return [b, c, 1];
      }
      if (isS) { const k = pr(t, shapeAt + (Q ? .05 : .1), Q ? .35 : .7); return [1, 0, 1 + .07 * s5(k) + .04 * Math.sin(Math.PI * k)]; }      // shape dots: grow slightly, small overshoot, settle
      return [1 - s5(pr(t, shapeAt + SPREAD * F.RW[q] / F.rmax, OFFD)), 0, 1];                                          // other dots: fade to the dark colour ring by ring from the centre
    }
    function dots(g, t, Z, K) {
      const F = face(), Rb = F.pw * .37 * Z, KQ = K / 1e6;
      for (let q = 0; q < F.n; q++) {
        const sx = F.U[q] * Z, sy = F.V[q] * Z, r2 = sx * sx + sy * sy, f = 1 - KQ * r2;
        if (f < .3) continue;
        const X = CX + sx * f, Y = CY + sy * f, isS = F.S[q], [b, c, mm] = dotState(F, q, t);
        const Rr = Rb * mm * (isS ? 1.1 : .9 + .1 * F.HS[q]);
        if (X + Rr * 2.4 < 0 || X - Rr * 2.4 > W || Y + Rr * 2.4 < 0 || Y - Rr * 2.4 > H) continue;
        const rd = Math.sqrt(r2) * f, kr = 1 - 3 * KQ * r2, kt = f;
        const sig = isS ? .03 + .08 * sm(cl((rd - 420) / 520)) : .03 + .59 * sm(cl((rd - 420) / 520)), dim = isS ? 1 : 1 - .6 * sm(cl((rd - 330) / 600));
        let lv = 0; while (lv < SIGR.length - 2 && SIGR[lv + 1] < sig) lv++;
        const w = cl((sig - SIGR[lv]) / (SIGR[lv + 1] - SIGR[lv])), rot = Math.atan2(sy, sx), cs = Math.cos(rot), sn = Math.sin(rot), sc = Rr / R0;
        g.setTransform(cs * kr * sc, sn * kr * sc, -sn * kt * sc, cs * kt * sc, X, Y);
        const put = (col, a) => {
          if (a <= .003) return;
          if (w < .1 || w > .9) { const sp = sprite(col, w > .9 ? lv + 1 : lv); g.globalAlpha = a; g.drawImage(sp, -sp.width / 2, -sp.height / 2); return; }
          const s0 = sprite(col, lv), s1 = sprite(col, lv + 1);
          g.globalAlpha = a * (1 - w); g.drawImage(s0, -s0.width / 2, -s0.height / 2); g.globalAlpha = a * w; g.drawImage(s1, -s1.width / 2, -s1.height / 2);
        };
        const bb = cl(b);
        if (bb < .999) put(OFF, dim * (1 - bb));
        if (bb > .001) { if (c < .999) put(LIT, dim * bb * (1 - c)); if (c > .001) put(ACC, dim * bb * c); }
      }
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    }
    function sideText(g, t, Z, K) {
      const a = side ? s5(pr(t, wallAt + DW * .85, Q ? .25 : .5)) * (1 - s5(pr(t, shapeAt - .1, Q ? .15 : .4))) : 0;
      if (a <= 0) return;
      const hw = SG / 2 * Z, dx = Math.min(CX - 104, hw * (1 - K * (hw / 1000) ** 2) + 66), fs = 58;
      for (const sx of [1, -1]) {
        g.save(); g.globalAlpha = a; g.translate(CX + sx * dx, CY + 10); g.scale(sx, 1); g.rotate(-8 * Math.PI / 180); g.transform(1, 0, -.2, 1, 0, 0);
        g.font = `${fs}px ${HANDF}`; g.letterSpacing = '-4px'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = LIT; g.strokeStyle = LIT; g.lineWidth = 1.2; g.lineJoin = 'round';
        g.fillText(side, 0, 0); g.strokeText(side, 0, 0); g.letterSpacing = '0px'; g.restore();
      }
      XM.note(HANDF, side);
    }

    // ---------- one frame ----------
    function scene(g, t) {
      const Z = camZ(t);
      g.fillStyle = P.bg; g.fillRect(-10, -10, W + 20, H + 20);
      // Doodle background: full in beat 1, 35% at the grid, fades out at the wall; scales with the camera only to the 0.4 power (like a distant wall)
      const wP = grid ? s5(pr(t, grid.at, DP)) : 0, wW = s5(pr(t, wallAt, DW * .6));
      const da = DS.in(t, at - .1, .5) * lin(1, .35, wP) * (1 - wW);
      if (da > 0 && DOO) { const sc = Math.pow(Z / ZA, .4); KIT.doodle(g, { ...DOO, ink: DINK, alpha: da, scale: sc, ox: CX * (1 - sc), oy: CY * (1 - sc) }); }
      neighbors(g, t, Z);
      const d = s5(pr(t, wallAt + DW * .3, DW * .55)), K = .16 * s5(pr(t, wallAt + DW * .4, DW * .9));
      if (d > 0) dots(g, t, Z, K);
      hero(g, t, Z, 1 - d);
      if (K > 0) { const v = g.createRadialGradient(CX, CY, 380, CX, CY, 1180); v.addColorStop(0, VIG + '0)'); v.addColorStop(1, VIG + (.72 * K / .16).toFixed(3) + ')'); g.fillStyle = v; g.fillRect(0, 0, W, H); }
      sideText(g, t, Z, K);
    }

    const shot = XM.shot({ bg: P.bg, stage: 'flat', cam: o.cam }, () => (g, t) => {
      const v = camV(t), amt = v > 1.5 ? Math.min(hit ? .07 : .05, (v - 1.5) * .02) : 0;      // fastest push / pull frames: a little radial motion blur
      if (amt > .002) { const L = XM.canvas('xm-notify-frame'); scene(L.g, t); g.fillStyle = P.bg; g.fillRect(0, 0, W, H); XM.FX.zoomBlur(g, L.c, CX, CY, amt, 7); }
      else scene(g, t);
      if (o.hud !== false) DS.hud(g, t, P, { tl: 'FIG', ...(o.hud || {}) });
    });
    shot.cues = cues;
    return shot;
  }

  Object.assign(XM, { notify });
})();
