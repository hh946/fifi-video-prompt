// XM.lens: hexagonal window. An English keyword arrives with speed (dash, accelerate, go live, SPEEDRUN). English only.
// Load after lib.js, xk.js, xm-core.js, xm-ds.js, xm-kit.js. Docs: docs/components/lens.md. Canvas 2D (XM.shot), deterministic (randomness only via XM.rng / hash).
//
// Beats:
//   1. full-screen accent background + optional doodle backdrop (caller chooses its content) + very fine horizontal scanlines
//   2. a dark flat hexagonal window wipes open left to right in 0.45 s (hit mode adds a thick dotted leading bar); a thin white outline,
//      with a small white trapezoid "ear" at each end
//   3. a trail of ghosts (icon slot: the caller decides what it is) from dark to bright, the front one off-white, dashes through the window
//      (left to right by default; dir reverses it)
//   4. (hit only) one frame of horizontal sawtooth displacement
//   5. the icon re-enters from the left and leads while the letters slam into the window one by one (explanatory pace: 0.24 s from 1.4x,
//      expoOut, no bounce, no shake). Letters are Anton (Latin) / Noto Sans SC 900 squeezed (CJK fallback), filling their slot, corners
//      chamfered, one horizontal knife cut, slightly tilted and staggered in height
//   6. after the last letter lands, the icon and its trail burst out of the window behind the letters
//   7. optional invert: background turns off-white + grey doodles, window off-white, letters ink, and an accent hand-lettered block
//      (Sedgwick Ave Display) covers the first part of the word; 0.3 s wipe at explanatory pace, one-frame cut + sawtooth in hit mode
//
// XM.lens(o) → { L, update, cues }
// A framework: accent background + backdrop + hexagonal window + a trail passing through + letters slamming in + optional invert with a
// hand-lettered block. The word, the object passing through, the backdrop and the invert text are all chosen by the caller for the video.
// The component has no default word, object or backdrop.
//   word    : the keyword (required), **English only**: 3-9 letters (uppercased; a space = a slightly wider word gap). CJK text looks poor in the window and logs console.error, which fails the render check
//   at      : entrance (absolute seconds): the window wipes open (0.45 s at explanatory pace)
//   pass    : { at, dur } first pass of the trail through the window (default at+0.35, 0.7 s; hit 0.33 s); false = none
//   dir     : direction of the first pass, 1 left to right (default) | -1 right to left
//   letters : [t...] when each letter slams in (absolute seconds); otherwise per: one every per seconds from 0.3 s after pass ends (default Latin 0.14, CJK 0.24; hit 0.05 / 0.1)
//   per     : see above
//   icon    : the object passing through (required): an XM.KIT.icon kind ('app' | 'arrow' | 'cursor' | an XM.KIT.MOTIFS name) or a draw function (g, x, y, s, { col, flip }) => {}; false = nothing runs through
//   doodle  : backdrop (optional): { motifs:[XM.KIT.MOTIFS names...] | draw(g, W, H), small, seed }; colour is set from the stage; omitted = plain background + scanlines
//   trail   : number of ghosts (default 7)
//   burst   : { at, dur } the icon bursts out after the last letter (default last letter +0.08, 0.38 s; hit +0.03, 0.25 s); false = no burst
//   invert  : { at } invert (optional)
//   tag     : { at, text, span:[i0,i1] } hand-lettered block over the first part of the word after the invert; covered letters fade to a faint base (default span: first word if there is a space, else the first floor(n/2) letters; 0.25 s after invert); false = none
//   colors  : { accent } override the accent for this shot only
//   tone    : 'accent' (default, full-screen accent) | 'ink' | 'paper'; hud / hit / cam / seed as in other XM components (you write the hud text, see SKILL.md; no default text)
// Timing (explanatory pace, 6 letters): window 0-0.45 -> trail 0.35-1.05 -> letters 1.35-2.05 (one every 0.14 s, each lands in 0.24 s) -> icon burst 2.13-2.51 -> (optional) invert
// Sound cues: trail dash (wipe, end aligned to mid-pass), last letter lands (title), invert (reveal). Individual letters get no sound.
(() => {
  const { W, H } = XK;
  const DS = XM.DS, SFX = DS.SFX, KIT = XM.KIT, INK = DS.INK, PAPER = DS.PAPER;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const EO = XM.expoOut;
  const io3 = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const pr = (t, a, d) => cl((t - a) / Math.max(1e-6, d));
  const lin = (a, b, k) => a + (b - a) * k;
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  const rgbOf = h => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
  const mix = (a, b, k) => { const A = rgbOf(a), B = rgbOf(b); return '#' + A.map((v, i) => Math.round(lin(v, B[i], k)).toString(16).padStart(2, '0')).join(''); };
  const FAM = { cut: 'Anton', tag: 'SedgwickAveDisplay', tagZh: 'HeiSC' };      // CJK should not appear (see word); tagZh only avoids an empty font fallback

  // ============================================================ Window: flat hexagon, top and bottom edges with asymmetric slopes
  const AX = 960, TOPY = 140.5, BOTY = 902.4, KT = .3324, KB = .2846, XL = 58, XR = 1862;
  const topY = x => TOPY + KT * Math.abs(x - AX), botY = x => BOTY - KB * Math.abs(x - AX);
  const HEXP = [[XL, topY(XL)], [AX, TOPY], [XR, topY(XR)], [XR, botY(XR)], [AX, BOTY], [XL, botY(XL)]];
  const oTop = x => 116 + .3306 * Math.abs(x - AX), oBot = x => 925 - .2833 * Math.abs(x - AX);
  const OUT = [[34, oTop(34)], [AX, 116], [1886, oTop(1886)], [1886, oBot(1886)], [AX, 925], [34, oBot(34)]];
  const midY = x => (topY(x) + botY(x)) / 2, winH = x => botY(x) - topY(x);
  const poly = (g, pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
  // Ears at both ends: white trapezoids, tall on the outside and short next to the window, with a dark panel inside
  function ears(g, col, panel) {
    for (const s of [1, -1]) {
      g.save(); if (s < 0) { g.translate(2 * AX, 0); g.scale(-1, 1); }
      g.fillStyle = col; poly(g, [[4, 396], [XL + 2, 422], [XL + 2, 664], [4, 690]]); g.fill();
      g.fillStyle = panel; poly(g, [[15, 414], [XL - 8, 434], [XL - 8, 652], [15, 672]]); g.fill();
      g.restore();
    }
  }
  const scanTile = a => KIT.cached('xm-lens-scan:' + a, 8, 4, c => { c.fillStyle = `rgba(0,0,0,${a})`; c.fillRect(0, 0, 8, 1.3); });
  const dotTile = () => KIT.cached('xm-lens-dots', 14, 14, c => { c.fillStyle = '#fff'; for (const [x, y] of [[3.5, 3.5], [10.5, 10.5]]) { c.beginPath(); c.arc(x, y, 2.2, 0, 6.3); c.fill(); } });

  // ============================================================ Letters: one small texture per letter (fill slot -> chamfer corners -> one cut); drawn once while colour / glyph stay the same
  const MG = () => XM.canvas('xm-lens-measure', 8, 8, false).g;
  function letterArt(key, ch, w, h, cjk, fill, seam, seed) {
    const pad = 28, cw = Math.ceil(w + pad * 2), chh = Math.ceil(h + pad * 2);
    return KIT.cached(key, cw, chh, c => {
      const R = XM.rng(seed), j = (a) => (R() - .5) * a;
      const q = [[pad + j(w * .1), pad + j(h * .05)], [pad + w + j(w * .1), pad + j(h * .05)], [pad + w + j(w * .1), pad + h + j(h * .05)], [pad + j(w * .1), pad + h + j(h * .05)]];
      c.save(); poly(c, q); c.clip();
      const S = 200; c.font = `${cjk ? 900 : 400} ${S}px ${cjk ? 'HeiSC' : FAM.cut}`; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
      let sx, sy, ox, oy;
      if (cjk) { const adv = c.measureText(ch).width || S; sx = w / adv; sy = h / S; ox = pad; oy = pad + h * .88; }
      else { const m = c.measureText(ch), cap = c.measureText('H').actualBoundingBoxAscent || S * .7, iw = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || S * .4;
        sx = w / iw; sy = h / cap; ox = pad + m.actualBoundingBoxLeft * sx; oy = pad + h; }
      c.translate(ox, oy); c.scale(sx, sy);
      c.lineJoin = 'miter'; c.miterLimit = 3; c.strokeStyle = seam; c.lineWidth = 22 / Math.sqrt(sx * sy); c.strokeText(ch, 0, 0);
      c.fillStyle = fill; c.fillText(ch, 0, 0);
      c.restore();
      // One horizontal knife cut (hand-cut feel): a thin slot knocked out to show the window behind. Not for CJK (a horizontal cut turns 一 into 二)
      if (!cjk) {
        const y1 = pad + h * (.32 + R() * .36), y2 = y1 + (R() - .5) * h * .22;
        c.globalCompositeOperation = 'destination-out'; c.lineWidth = Math.max(4, Math.min(w, h) * .028);
        c.beginPath(); c.moveTo(0, y1); c.lineTo(cw, y2); c.stroke(); c.globalCompositeOperation = 'source-over';
      }
    });
  }

  // Letter layout: Latin columns by ink width, CJK fixed-width; the row fills x 210-1710 in the window; letters that are too wide are squeezed back (Latin stretched at most 1.55x, CJK aspect <= 0.8)
  // brk: indices after which a space follows (word gap adds 0.3 letter widths)
  function layout(chars, cjk, seed, brk = new Set()) {
    const g = MG(), S = 200, R = XM.rng(seed * 31 + 7);
    g.font = `${cjk ? 900 : 400} ${S}px ${cjk ? 'HeiSC' : FAM.cut}`;
    const cap = cjk ? S : (g.measureText('H').actualBoundingBoxAscent || S * .7);
    const nat = chars.map(c => { if (cjk) return 1; const m = g.measureText(c); return ((m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || S * .4) / cap; });
    const X0 = 210, X1 = 1710, gap = cjk ? 26 : 10, LM = 34;
    const n = chars.length, SP = .3, sumN = nat.reduce((a, b) => a + b, 0) + SP * brk.size;
    let k = (X1 - X0 - gap * (n - 1)) / sumN;
    const place = kk => { const tot = sumN * kk + gap * (n - 1); let x = (X0 + X1) / 2 - tot / 2;
      return nat.map((v, i) => { const w = v * kk, xc = x + w / 2; x += w + gap + (brk.has(i) ? SP * kk : 0); return { xc, w }; }); };
    for (let it = 0; it < 4; it++) {
      let worst = 0;
      for (const [i, s] of place(k).entries()) { const h = winH(s.xc) - LM * 2, st = cjk ? (s.w / h) / .8 : (s.w / h) / (nat[i] * 1.55); worst = Math.max(worst, st); }
      if (worst <= 1.001) break; k /= worst;
    }
    return place(k).map((s, i) => ({ ...s, h: (winH(s.xc) - LM * 2) * (.93 + R() * .07), cy: midY(s.xc) + (R() - .5) * 26, rot: (R() - .5) * .085 }));
  }

  // ============================================================ XM.lens
  function lens(o = {}) {
    const tone = o.tone || 'accent', hit = !!o.hit, seed = o.seed ?? 3;
    const A0 = (o.colors && o.colors.accent) || XK.col('accent');
    if (!o.word) console.error('XM.lens: word is required (English); the component has no default word');
    const raw = String(o.word || ' '), cjk = CJK.test(raw), word = cjk ? raw : raw.toUpperCase();
    if (cjk || (o.tag && o.tag.text && CJK.test(o.tag.text))) console.error('XM.lens takes English words only (CJK text looks poor in the window): ' + raw);
    const all = [...word], chars = [], brk = new Set();
    for (const c of all) { if (c.trim()) chars.push(c); else if (chars.length) brk.add(chars.length - 1); }
    const n = chars.length;
    const P0 = { ...DS.tone(tone) }, Pinv = DS.tone(tone === 'paper' ? 'ink' : 'paper');
    if (tone === 'accent') P0.bg = A0;                                          // colors.accent also drives the HUD block
    // Two palettes: normal / inverted (resolved at build time)
    const base = tone === 'accent' ? A0 : P0.bg;
    const N = { bg: base, dInk: tone === 'accent' ? mix(A0, INK, .5) : tone === 'paper' ? mix(PAPER, INK, .3) : mix(INK, PAPER, .09), dA: 1, scan: tone === 'paper' ? .05 : .16,
      win: INK, wInk: mix(INK, PAPER, .07), letter: PAPER, seam: INK, line: PAPER, ear: PAPER, panel: INK, P: P0 };
    const V = tone === 'paper'
      ? { bg: INK, dInk: mix(INK, PAPER, .12), dA: 1, scan: .16, win: PAPER, wInk: mix(PAPER, INK, .06), letter: INK, seam: PAPER, line: PAPER, ear: PAPER, panel: INK, P: Pinv }
      : { bg: PAPER, dInk: mix(PAPER, INK, .3), dA: 1, scan: .05, win: PAPER, wInk: mix(PAPER, INK, .06), letter: INK, seam: PAPER, line: INK, ear: INK, panel: PAPER, P: Pinv };
    const ghostCols = k => k < .5 ? mix(mix(A0, INK, .62), A0, k * 2) : mix(A0, mix(A0, PAPER, .5), (k - .5) * 2);   // k 0 darkest -> 1 brightest

    // ---------- Time ----------
    const at = o.at ?? 0, dir = o.dir === -1 ? -1 : 1;
    const OPEN = hit ? .3 : .45;
    const pass = o.pass === false ? null : { at: (o.pass && o.pass.at) ?? at + (hit ? .2 : .35), dur: (o.pass && o.pass.dur) ?? (hit ? .33 : .7) };
    const per = o.per ?? (cjk ? (hit ? .1 : .24) : (hit ? .05 : .14));
    const L0 = pass ? pass.at + pass.dur + (hit ? .1 : .3) : at + .6;
    const LT = (o.letters && o.letters.length ? o.letters : chars.map((_, i) => L0 + i * per)).slice(0, n);
    while (LT.length < n) LT.push(LT[LT.length - 1] + per);
    const SLAM = hit ? 0 : .24, lastT = LT[n - 1];
    const burst = o.burst === false ? null : { at: (o.burst && o.burst.at) ?? lastT + (hit ? .03 : .08), dur: (o.burst && o.burst.dur) ?? (hit ? .25 : .38) };
    const inv = o.invert ? { at: o.invert.at ?? lastT + 1, dur: hit ? 0 : .3 } : null;
    const tagO = o.tag === false || !(inv || o.tag) ? null : (() => {
      const T = o.tag || {}, span = T.span || [0, brk.size ? Math.min(...brk) + 1 : Math.max(1, Math.floor(n / 2))];   // with a space: first word; otherwise the first half
      return { at: T.at ?? (inv ? inv.at + (hit ? .07 : .25) : lastT + .5), span, text: T.text || chars.slice(span[0], span[1]).join(''), dur: hit ? 0 : .35 };
    })();
    if (o.icon == null) console.error('XM.lens: icon is required (an XM.KIT.icon kind or a draw function; icon:false for none)');
    const kind = o.icon || null, TR = o.trail ?? 7;
    const DOO = typeof o.doodle === 'function' ? { draw: o.doodle, key: 'xm-lens' } : o.doodle && typeof o.doodle === 'object' ? o.doodle : null;

    const cues = []; const cue = (t, name, gain, x = {}) => { if (isFinite(t)) cues.push({ t: +t.toFixed(3), name, gain, ...x }); };
    if (pass) cue(pass.at + pass.dur * .5, SFX.wipe, .4, { align: 'end' });
    cue(lastT + SLAM * .3, SFX.title, .55);
    if (inv) cue(inv.at, SFX.reveal, .5);

    let SLOTS = null;
    const slots = () => { if (SLOTS) return SLOTS; const s = layout(chars, cjk, seed, brk); if (!document.fonts || document.fonts.status === 'loaded') SLOTS = s; return s; };
    const art = (i, S) => { const s = slots()[i]; XM.note(cjk ? 'HeiSC' : FAM.cut, chars[i]);
      return letterArt(`xm-lens:${word}:${i}:${Math.round(s.w)}x${Math.round(s.h)}:${S.letter}:${S.seam}:${seed}`, chars[i], s.w, s.h, cjk, S.letter, S.seam, seed * 13 + i * 7); };

    // Icon + trail. xAt(τ) gives the lead icon's x at time τ (null = not in yet / already out)
    // part: 'all' | 'trail' (ghosts only) | 'lead' (lead icon only); while leading, ghosts sit behind the letters and the lead icon in front
    function iconRun(g, t, xAt, nTrail, dt, leadCol, part = 'all') {
      if (!kind) return;
      for (let i = part === 'lead' ? 0 : nTrail; i >= (part === 'trail' ? 1 : 0); i--) {
        const x = xAt(t - i * dt); if (x == null) continue;
        const s = Math.max(40, winH(cl(x, XL, XR)) * .36), col = i === 0 ? leadCol : ghostCols(1 - i / (nTrail + 1)), xn = xAt(t - i * dt + .02);
        KIT.icon(g, kind, x, midY(cl(x, XL, XR)) + s * .04, s, { col, badge: i === 0 ? A0 : col, flip: kind !== 'app' && xn != null && xn < x });
      }
    }
    const passX = tau => { if (!pass) return null; const k = (tau - pass.at) / pass.dur; if (k < 0 || k > 1.25) return null;
      const e = hit ? k : (k * .55 + io3(cl(k)) * .45 + Math.max(0, k - 1) * .55); const xa = dir > 0 ? XL - 160 : XR + 160, xb = dir > 0 ? XR + 160 : XL - 160; return lin(xa, xb, e); };
    // Leading: enter at the left ear, arrive just ahead of each letter as it lands; finally burst out of the right ear
    const runX = tau => {
      const S = slots(), ahead = i => { const r = S[i].xc + S[i].w / 2; return r + winH(cl(r, XL, XR)) * .19 + 22; };
      const enter = LT[0] - (hit ? .12 : .32);
      if (tau < enter) return null;
      if (tau < LT[0]) return lin(XL - 140, ahead(0), io3(pr(tau, enter, LT[0] - enter)));
      for (let i = 1; i < n; i++) if (tau < LT[i]) return lin(ahead(i - 1), ahead(i), io3(pr(tau, LT[i - 1], LT[i] - LT[i - 1])));
      if (!burst) return ahead(n - 1);
      if (tau < burst.at) return ahead(n - 1);
      const k = pr(tau, burst.at, burst.dur); if (k >= 1) return null;
      return lin(ahead(n - 1), XR + 220, Math.pow(k, 1.35));
    };

    function scene(g, t, S, openK) {
      g.fillStyle = S.bg; g.fillRect(0, 0, W, H);
      if (DOO) KIT.doodle(g, { ...DOO, ink: S.dInk, alpha: S.dA });
      g.save(); g.fillStyle = g.createPattern(scanTile(S.scan), 'repeat'); g.fillRect(0, 0, W, H); g.restore();
      // Window: wipes open left to right
      const xo = lin(XL - 10, XR + 10, openK);
      g.save(); g.beginPath(); g.rect(-10, -10, xo + 10, H + 20); g.clip();
      poly(g, HEXP); g.fillStyle = S.win; g.fill();
      g.save(); poly(g, HEXP); g.clip(); if (DOO) KIT.doodle(g, { ...DOO, ink: S.wInk, alpha: 1, dots: true });
      // Inside the window: first trail pass -> letters -> lead icon
      if (pass) iconRun(g, t, passX, hit ? TR + 3 : TR, hit ? .03 : .05, S.letter);
      const RT = [hit ? 4 : 3, hit ? .028 : .045];
      iconRun(g, t, runX, RT[0], RT[1], S.letter, 'trail');
      const SL = slots(), tagK = tagO && t >= tagO.at ? (tagO.dur ? EO(pr(t, tagO.at, tagO.dur)) : 1) : 0;
      for (let i = 0; i < n; i++) {
        if (t < LT[i]) continue;
        const s = SL[i], c = art(i, S), k = SLAM ? pr(t, LT[i], SLAM) : 1, e = EO(k), sc = 1 + .4 * (1 - e);
        const under = tagK > 0 && i >= tagO.span[0] && i < tagO.span[1] ? cl(tagK * 1.4) : 0;     // letters under the hand-lettered block fade to a faint base
        g.save(); g.globalAlpha = cl(k * 5) * (1 - .8 * under); g.translate(s.xc, s.cy); g.rotate(s.rot); g.scale(sc, sc); g.drawImage(c, -c.width / 2, -c.height / 2); g.restore();
      }
      if (tagK > 0) drawTag(g, t, S);
      iconRun(g, t, runX, RT[0], RT[1], S.letter, 'lead');
      g.restore();
      // Wipe front (hit mode: dark thick bar with dots)
      if (openK < 1 && hit) { g.save(); g.lineCap = 'round'; g.lineWidth = 64; g.strokeStyle = INK; g.beginPath(); g.moveTo(xo - 32, topY(xo) + 40); g.lineTo(xo - 32, botY(xo) - 40); g.stroke();
        g.globalCompositeOperation = 'source-atop'; g.globalAlpha = .6; g.fillStyle = g.createPattern(dotTile(), 'repeat'); g.fillRect(xo - 70, 0, 80, H); g.restore(); }
      // Outline + ears
      g.save(); g.lineWidth = 2.6; g.strokeStyle = S.line; g.lineJoin = 'miter'; poly(g, OUT); g.stroke(); g.restore();
      ears(g, S.ear, S.panel);
      g.restore();
      if (openK < 1) {      // the ear on the side not yet wiped shows first (the door is there)
        g.save(); g.beginPath(); g.rect(-10, -10, 80, H + 20); g.clip(); ears(g, S.ear, S.panel); g.restore();
      }
      if (o.hud !== false) DS.hud(g, t, S.P, { tl: 'FIG', ...(o.hud || {}) });
    }

    // Hand-lettered block over the first part of the word (Latin graffiti face / CJK ZCOOL KuaiLe), accent with thick ink outline, slightly tilted
    function drawTag(g, t, S) {
      const SL = slots(), i0 = cl(tagO.span[0], 0, n - 1), i1 = cl(tagO.span[1], i0 + 1, n);
      const xa = SL[i0].xc - SL[i0].w / 2, xb = SL[i1 - 1].xc + SL[i1 - 1].w / 2, xc = (xa + xb) / 2, bw = xb - xa, bh = winH(xc) * .62;
      const fam = CJK.test(tagO.text) ? FAM.tagZh : FAM.tag, M = MG(); M.font = `400 200px ${fam}`;
      const m = M.measureText(tagO.text), tw = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || 200, th = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 160;
      let size = 200 * Math.min(bh / th, (bw * 1.04) / tw), sx = cl((bw * 1.04) / (tw * size / 200), 1, 1.3);
      const k = tagO.dur ? EO(pr(t, tagO.at, tagO.dur)) : 1;
      g.save(); g.beginPath(); g.rect(xa - 120, 0, (bw + 240) * k, H); g.clip();
      g.translate(xc, midY(xc) + bh * .04); g.rotate(-.07); g.scale(sx, 1);
      g.font = `400 ${size}px ${fam}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.strokeStyle = INK; g.lineWidth = size * .09; g.strokeText(tagO.text, 0, 0);
      g.fillStyle = A0; g.fillText(tagO.text, 0, 0);
      g.restore(); XM.note(fam, tagO.text);
    }

    function saw(g, amp, period, seedK) {        // one frame of horizontal sawtooth displacement (hit mode): one tooth every period rows, sliding from +amp to -amp within the tooth
      const L = XM.canvas('xm-lens-saw'); L.g.drawImage(g.canvas, 0, 0);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      for (let y = 0; y < H; y += 2) { const q = (y + hash(seedK) * period) / period, kq = Math.floor(q), dx = amp * (1 - 2 * (q - kq)) * (.85 + .3 * hash(kq * 1.31 + seedK));
        g.drawImage(L.c, 0, y, W, 2, dx, y, W, 2); }
      g.restore();
    }

    const shot = XM.shot({ bg: N.bg, stage: 'flat', cam: o.cam }, () => (g, t) => {
      const openK = hit ? pr(t, at, OPEN) : EO(pr(t, at, OPEN));
      const ki = inv ? (inv.dur ? EO(pr(t, inv.at, inv.dur)) : (t >= inv.at ? 1 : 0)) : 0;
      if (ki >= 1) scene(g, t, V, openK);
      else {
        scene(g, t, N, openK);
        if (ki > 0) {        // the invert wipes left to right
          const L = XM.canvas('xm-lens-inv'); scene(L.g, t, V, openK);
          g.save(); g.beginPath(); g.rect(0, 0, W * ki, H); g.clip(); g.drawImage(L.c, 0, 0); g.restore();
        }
      }
      if (hit) {
        const near = a => a != null && t >= a && t < a + .034;
        if (pass && near(pass.at + pass.dur * .92)) saw(g, 9, 8, 3);
        else if (near(lastT)) saw(g, 12, 8, 5);
        else if (inv && near(inv.at)) saw(g, 12, 8, 7);
      }
    });
    shot.cues = cues;
    return shot;
  }

  Object.assign(XM, { lens });
})();
