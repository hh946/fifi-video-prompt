// XM · type: type specimen.
// XM.typeSpecimen(o) turns one word into a "type specimen" shot: outlined letters appear one by one, then fill in solid;
// per-letter width labels and a total-width rule follow; an optional tag row highlights its items one at a time; an optional
// crosshair locks onto the word. Returns an XM.shot { L, update }. Full docs: docs/components/type.md
// Load order: lib.js → xk.js → xm-core.js → this file.
//
// ─────────────────────────────────────────────────────────────────────────────
// XM.typeSpecimen(o)
//   Use for: the first time an English concept appears (AGENT / TOKEN / RAG), or a three-part preview ("it can sense, plan, act").
//   at       seconds, shot content starts: guide lines grow from both ends, right-column micro text types, the index slides in,
//            outlined letters appear one by one (one every 0.05s)
//   word     main word (Latin: Unbounded Black; CJK: Noto Sans SC 900, picked automatically). Fitted into x 150–1770,
//            ink height at most cap (default 290px).
//            For full-width words, give this shot's XK.seq entry drift:{ s0:0, s1:.035, x:0, y:-10 } (the default drift pushes
//            the outer letters off screen).
//   kicker   'Agent' | { text, size }  big word top-left. Good place for a translation / gloss of the main word (text meant to
//            be read). Default size 190 for CJK / 230 for Latin, width ≤ 980. Lightly slams in at `at` (1.1→1 over 0.2s);
//            with hit:true it is 1.25→1 plus one blurred frame.
//   fill     { at, mode:'rise'|'block', dur:.5, color }  outline → solid. Default { at: at+0.9, mode:'rise' }.
//            rise  = a cursor bar sweeps left to right; letters it passes rise up from below the baseline (clipped at the baseline)
//            block = a colour block sweeps left to right and leaves solid letters behind (color default: ink when the
//                    background is the accent colour, otherwise 'accent')
//            fill:false = stays an outline specimen
//   metrics  true (default)  after the fill, each letter gets "A·01 0.842" (its real advance width / em, measured from the
//            font) plus a total-width rule "1690 PX" (decorative micro text)
//   tags     { items:['Sense','Plan','Act'], at:[t1,t2,t3], show, size:60 } (or just an items array)
//            a tag row at the bottom, typed in one by one at `show` (default 0.2s after the fill ends); at at[j] item j is
//            highlighted (a solid block slides over, text inverts). Text meant to be read: keep size ≥ 56px.
//   slam     { at, label:'LOCKED' }  lock-on: ghost outlines expand off the word, crosshair lines sweep to its centre, the
//            viewfinder closes in, a reticle spins, and the label types top-right (use on the "this is the one" beat).
//            With slam but no fill (fill omitted), letters slam in one by one from the right, skewed, then lock.
//   cursor   cursor / reticle colour. Default 'accent2' when the background is the accent colour, else 'accent'. Any hex works.
//   index    '01'  big number top-right (Unbounded 400); of: '03'; spec: three lines of right-column micro text
//            (default ['SPECIMEN', '01 OF 03', 'KINETIC TYPE STUDY'])
//   breathe  true (default)  after the fill the tracking opens slightly and settles back (the HUD TRACK value follows)
//   hit      false (default, explainer pacing) | true: punchy timing — one letter per frame, 2% camera push on the fill,
//            faster slam, RGB split on the lock frame
//   bg       background (default 'accent'); fg: text colour (default: whichever theme colour contrasts most with bg)
//   hud      { tl, bl, br } | false   corner HUD micro text
//   cam      XK camera keyframes
//   Beats: at (guides + outline letters + kicker) → fill.at (fill) → tags highlight in turn (tags.at) → slam.at (lock).
//   Keep adjacent beats ≤ 1s apart.
//
//
// Rule: letters are flat solid colour; effects such as RGB split or glitch belong to the effect itself, never to the text fill.
// Every function returns XM.shot's { L, update }; colours are resolved when the shot is built (can be wrapped in XK.tone).
// Performance (measured, including capture): typeSpecimen ≈ 0.1s/frame.
// ─────────────────────────────────────────────────────────────────────────────
(() => {
  const { W, H } = XM;
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  let UID = 0;

  // ---------------- colour ----------------
  const CC = document.createElement('canvas').getContext('2d');
  function hexOf(c, fb = '#000000') {
    CC.fillStyle = fb; CC.fillStyle = XK.col(c) || c || fb;
    const v = CC.fillStyle; if (v[0] === '#') return v;
    const m = v.match(/[\d.]+/g); return '#' + m.slice(0, 3).map(x => Math.round(+x).toString(16).padStart(2, '0')).join('');
  }
  const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = h => { const [r, g, b] = rgbOf(h).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const rgba = (h, a) => { const [r, g, b] = rgbOf(h); return `rgba(${r},${g},${b},${a})`; };
  const mixH = (a, b, k) => { const A = rgbOf(a), B = rgbOf(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  function scheme(o) {
    const T = hexOf('text'), B = hexOf('bg');
    const LIGHT = lum(T) > lum(B) ? T : B, DARK = lum(T) > lum(B) ? B : T;
    const bg = hexOf(o.bg || 'accent'), light = lum(bg) > .4;
    const fg = o.fg ? hexOf(o.fg) : light ? DARK : LIGHT;
    return { bg, fg, LIGHT, DARK, light, acc: hexOf('accent') };
  }

  // ---------------- helpers ----------------
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo3 = k => 1 - Math.pow(1 - cl(k), 3);
  const pad = (n, k = 2) => String(n).padStart(k, '0');
  const typ = (s, n) => [...s].slice(0, Math.max(0, Math.floor(n))).join('');
  const mono = (g, s, x, y, size, col, o = {}) => XM.txt(g, s, x, y, { fam: 'mono', size, w: 500, col, ls: o.ls ?? size * .12, align: o.align, alpha: o.alpha });
  const famOf = s => CJK.test(s) ? 'HeiSC' : 'Unb';

  // Backdrop: flat colour + 32px dot grid + elliptical vignette, cached per colour
  const BGC = new Map();
  function backdrop(bg, light) {
    if (BGC.has(bg)) return BGC.get(bg);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = light ? mixH(bg, '#000000', .5) : mixH(bg, '#ffffff', .45); g.globalAlpha = .35; g.beginPath();
    for (let y = 0; y < H + 32; y += 32) for (let x = 0; x < W + 32; x += 32) g.rect(x - 1.1, y - 1.1, 2.2, 2.2);
    g.fill(); g.globalAlpha = 1;
    g.save(); g.translate(W / 2, H / 2 - 30); g.scale(1, H / W * 1.12);
    const r = W * .62, gr = g.createRadialGradient(0, 0, r * .42, 0, 0, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.55, 'rgba(0,0,0,.035)'); gr.addColorStop(1, 'rgba(0,0,0,.13)');
    g.fillStyle = gr; g.fillRect(-W, -W, W * 2, W * 2); g.restore();
    BGC.set(bg, c); return c;
  }

  // ---------------- Big type laid out by ink bounds (drawn glyph by glyph; origins come from prefix widths, so kerning is kept) ----------------
  const INK = new Map();
  function ink(s, size, w, fam) {
    const k = s + '|' + size + '|' + w + '|' + fam; let r = INK.get(k); if (r) return r;
    CC.font = `${w} ${size}px ${fam}`; CC.letterSpacing = '0px'; const m = CC.measureText(s);
    r = { l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, adv: m.width, asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent };
    INK.set(k, r); return r;
  }
  // Returns { ch, n, pre (each glyph origin at zero tracking), inkL, rLast, asc, desc, size, w, fam }
  function lay(word, size, w, fam) {
    const ch = [...word], pre = ch.map((c, i) => i ? ink(ch.slice(0, i).join(''), size, w, fam).adv : 0), m = ink(word, size, w, fam);
    return { ch, n: ch.length, pre, inkL: -ink(ch[0], size, w, fam).l, rLast: ink(ch[ch.length - 1], size, w, fam).r, asc: m.asc, desc: m.desc, size, w, fam };
  }
  // Glyph origins at tracking ls (px), shifted by ox
  const xsOf = (F, ls, ox = 0) => F.pre.map((v, i) => v + i * ls + ox);
  const widthOf = (F, ls) => F.pre[F.n - 1] + (F.n - 1) * ls + F.rLast - F.inkL;
  function letters(g, F, xs, base, o = {}) {
    g.font = `${o.w || F.w} ${F.size}px ${F.fam}`; g.letterSpacing = '0px'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    if (o.stroke) { g.strokeStyle = o.col; g.lineWidth = o.stroke; g.lineJoin = o.join || 'miter'; } else g.fillStyle = o.col;
    for (let i = 0; i < F.n; i++) {
      if (o.only && !o.only(i)) continue;
      const x = xs[i] + (o.dx ? o.dx(i) : 0), y = base + (o.dy ? o.dy(i) : 0), sk = o.skew ? o.skew(i) : 0, c = F.ch[i];
      if (sk) { g.save(); g.translate(x, y); g.transform(1, 0, -sk, 1, 0, 0); o.stroke ? g.strokeText(c, 0, 0) : g.fillText(c, 0, 0); g.restore(); }
      else o.stroke ? g.strokeText(c, x, y) : g.fillText(c, x, y);
      if (o.dil && !o.stroke) { g.save(); g.strokeStyle = o.col; g.lineWidth = o.dil * 2; g.lineJoin = 'round'; g.strokeText(c, x, y); g.restore(); }
    }
    XM.note(F.fam, F.ch.join(''));
  }
  // Outline text (outer half of the stroke only): stroke at 2× width off-screen, then punch out the solid glyphs.
  // Variable-font contours overlap, so a plain strokeText would show the inner lines.
  function outlined(g, lw, col, key, paint) {
    const L = XM.canvas('xmt-ol-' + key);
    L.g.setTransform(g.getTransform());
    paint(L.g, { stroke: lw * 2, col: '#fff' });
    L.g.globalCompositeOperation = 'destination-out'; paint(L.g, { col: '#000' });
    L.g.globalCompositeOperation = 'source-in'; L.g.setTransform(1, 0, 0, 1, 0, 0); L.g.fillStyle = col; L.g.fillRect(0, 0, W, H);
    L.g.globalCompositeOperation = 'source-over';
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(L.c, 0, 0); g.restore();
  }
  // Full-frame RGB split (the one or two hit frames): offsets the colour channels of what is already on g
  function rgbHit(g, dx) {
    const T = XM.canvas('xmt-hit'); T.g.drawImage(g.canvas, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    XM.FX.rgbSplit(g, T.c, dx); g.restore();
  }

  // =====================================================================================================
  // XM.typeSpecimen
  // =====================================================================================================
  function typeSpecimen(o = {}) {
    const id = ++UID, a = o.at ?? 0, word = String(o.word || 'TYPE'), fam = famOf(word);
    const C = scheme(o), FG = C.fg, BG = C.bg, hit = !!o.hit;
    const fill = (o.fill === false || (o.fill == null && o.slam)) ? null : { at: a + .9, mode: 'rise', dur: hit ? .26 : .5, ...(o.fill || {}) };
    if (fill) fill.color = hexOf(fill.color || (BG === C.acc ? C.DARK : 'accent'));
    const slam = o.slam ? { at: a + 2.4, label: 'LOCKED', ...o.slam } : null;
    const fEnd = fill ? fill.at + fill.dur : slam ? slam.at + .45 : a + .4;
    const tg = o.tags ? (Array.isArray(o.tags) ? { items: o.tags } : { ...o.tags }) : null;
    if (tg) { tg.at = [].concat(tg.at ?? []); tg.show = tg.show ?? (fill ? fEnd + .2 : a + .5); tg.size = tg.size || 60; }
    const kick = o.kicker == null ? null : typeof o.kicker === 'string' ? { text: o.kicker } : { ...o.kicker };
    const index = o.index || '01', spec = o.spec || ['SPECIMEN', `${index} OF ${o.of || '03'}`, 'KINETIC TYPE STUDY'];
    const metrics = o.metrics !== false, breathe = o.breathe !== false;
    const CUR = hexOf(o.cursor || (BG === C.acc ? 'accent2' : 'accent'));
    const X0 = 150, X1 = 1770, BASE = o.base ?? 760, CAPMAX = o.cap ?? 290, LS0 = fam === 'Unb' ? -.015 : .02;
    const FONT = fam === 'Unb' ? 'UNBOUNDED BLACK 900' : 'NOTO SANS SC 900';
    const per = hit ? 1 / 30 : .05;                       // interval between outlined letters appearing
    let P = null;

    function prep() {                                      // measured on first draw, after fonts have loaded
      if (P) return P;
      const m = lay(word, 100, 900, fam), wid = widthOf(m, LS0 * 100), capR = (m.asc + (fam === 'HeiSC' ? m.desc : 0)) / 100;
      const size = Math.min(100 * (X1 - X0) / wid, CAPMAX / capR);
      const F = lay(word, size, 900, fam), desc = fam === 'HeiSC' ? F.desc : 0;
      P = { F, size, n: F.n, base: BASE - desc, cap: F.asc + desc };
      P.top = BASE - P.cap;
      P.adv1 = F.ch.map(c => ink(c, size, 900, fam).adv);
      P.lInk = F.ch.map(c => ink(c, size, 900, fam).l);
      P.wInk = F.ch.map(c => { const k = ink(c, size, 900, fam); return k.l + k.r; });
      if (kick) {
        const s0 = kick.size || (CJK.test(kick.text) ? 190 : 230), w0 = XM.measure(CC, kick.text, { fam: 'unb', size: s0, w: 900, ls: -s0 * .02 });
        P.ks = Math.min(s0, s0 * 980 / w0);
        CC.font = `900 ${P.ks}px ${famOf(kick.text)}`; const km = CC.measureText(kick.text);
        P.kb = 365; P.kTop = P.kb - km.actualBoundingBoxAscent;
      }
      P.gy = kick ? [P.kTop, P.kb, P.top, BASE] : [180, 365, P.top, BASE];
      if (tg) {
        const ws = tg.items.map(s => XM.measure(CC, s, { fam: 'zh', size: tg.size, w: 700 })), gap = tg.size * .95;
        const tot = ws.reduce((s, v) => s + v, 0) + gap * (ws.length - 1);
        let x = 960 - tot / 2; P.tx = ws.map(w => { const r = [x, w]; x += w + gap; return r; }); P.tgap = gap;
      }
      return P;
    }
    // Tracking (em): opens slightly after the fill, then settles (TRACK -0.015 → +0.012 → -0.005)
    const trk = t => { if (!breathe) return LS0; const k = cl((t - fEnd) / .75); return LS0 + .01 * XM.smooth(k) + .016 * Math.sin(Math.PI * k); };

    return XM.shot({ bg: BG, stage: 'flat', cam: o.cam }, S => (g, t) => {
      g.drawImage(backdrop(BG, C.light), 0, 0);
      if (t < a) return;
      const p = prep(), F = p.F, dt = t - a;
      if (hit && fill && t >= fill.at) { const s = 1 + .022 * Math.exp(-(t - fill.at) * 9); g.translate(960, 540); g.scale(s, s); g.translate(-960, -540); }

      // ---- guide lines (grow in from both ends)
      g.fillStyle = rgba(FG, .23);
      p.gy.forEach((y, i) => { const k = eo3((dt - i * .05) / .3); if (k <= 0) return; const L = (W + 120) * k;
        if (i % 2) g.fillRect(W + 60 - L, y - .6, L, 1.3); else g.fillRect(-60, y - .6, L, 1.3); });
      [X0 - 50, X1 + 50].forEach((x, i) => { const k = eo3((dt - .08 - i * .05) / .3); if (k > 0) g.fillRect(x - .6, -60, 1.3, (H + 120) * k); });

      // ---- layout at the current tracking (centred)
      const ls = trk(t) * p.size, wid = widthOf(F, ls), ox = 960 - wid / 2 - F.inkL, xs = xsOf(F, ls, ox);
      const XL = 960 - wid / 2, XR = 960 + wid / 2, cy = BASE - p.cap / 2;

      // ---- right-column micro text (decorative)
      const RC = 1130, fade = d => cl((dt - d) / .07);
      let nn = (dt - .07) * 120;
      spec.forEach((s, i) => { const len = [...s].length, m = cl(nn, 0, len); if (m > 0) mono(g, typ(s, m), RC, 222 + i * 23, i ? 15 : 18, FG); nn -= len; });
      if (dt > .1) mono(g, `CAP-HEIGHT — ${(p.cap / p.size).toFixed(3)} EM / ${Math.round(p.cap)} PX`, RC, 168, 14, FG, { alpha: fade(.1) * .95 });
      if (dt > .13) mono(g, 'BASELINE — 0.000', RC, 398, 14.5, FG, { alpha: fade(.13) * .95 });
      if (dt > .16 && !(slam && t >= (slam.at + (fill ? 0 : .22)) + .1)) mono(g, `FIT → ${Math.round(wid)} PX · ${p.size.toFixed(1)} PX / ${Math.round(p.cap)} CAP`, X1, p.top - 40, 14.5, FG, { align: 'right', alpha: fade(.16) * .95 });
      if (dt > .1) XM.FX.barcode(g, RC, 300, 250, 35, FG, 31 + p.n * 7);
      const tv = trk(t), trs = (tv >= 0 ? '+' : '-') + Math.abs(tv).toFixed(3);
      [`${FONT} / ${Math.round(p.size)} PX`, `TRACK ${trs} EM · LEAD 0.82`, `GLYPHS ${pad(p.n)} · GRID 12 COL`].forEach((s, i) => {
        const k = (dt - .1 - i * .05) * 150; if (k > 0) mono(g, typ(s, k), RC + 272, 312 + i * 17, 13, FG, { alpha: .95 }); });
      if (dt > .2) { const sc = cl((dt - .2) / .07); g.save(); g.translate(1786, 392); g.rotate((30 + (hit ? 450 : 140) * (dt - .27)) * D2R); XM.FX.star4(g, 0, 0, 24 * (.6 + .4 * sc), FG, .1); g.restore(); }
      if (dt > .07) { const k = eo3((dt - .07) / .2); g.save(); g.beginPath(); g.rect(1400, 0, 520, 270); g.clip();
        XM.txt(g, index, X1, 262 + 34 * (1 - k), { fam: 'unb', size: 150, w: 400, col: FG, align: 'right', ls: -3 }); g.restore(); }

      // ---- has each letter landed solid? (landed letters stop drawing their outline)
      const rd = hit ? .17 : .24;
      const cur = fill && fill.mode !== 'block' ? (() => {
        const xa = XL - 30, xb = XR + 40, T = fill.dur * .8;
        const st = xs.map((x, i) => { const k = cl((x - p.lInk[i] + p.wInk[i] * .2 - xa) / (xb - xa)); return fill.at + (1 - Math.cbrt(1 - k)) * T; });
        return { xa, xb, T, st };
      })() : null;
      let blk = null;
      if (fill && fill.mode === 'block' && t >= fill.at) {
        const u = (t - fill.at) / fill.dur, xa = XL - 30, xb = XR + 140;
        blk = { xR: lerp(xa, xb, XM.expoOut(cl(u / .7))), xL: lerp(xa, xb, eo3((u - .3) / .7)), done: u >= 1 };
      }
      const slamStg = hit ? 1 / 60 : .06, slamDec = hit ? 80 : 18;
      const landed = i => {
        if (cur) return t >= cur.st[i] + rd;
        if (blk) return blk.done;
        if (slam && !fill) return t >= slam.at + i * slamStg + Math.log(300) / slamDec;
        return false;
      };

      // ---- lock: ghost outlines expand + crosshair lines (behind the word)
      const tl = slam ? slam.at + (fill ? 0 : .22) : Infinity;
      if (slam && t >= slam.at) {
        const gd = hit ? .32 : .6;
        for (let j = 0; j < 2; j++) {
          const k = (t - slam.at) / (gd * (j ? .8 : 1)); if (k >= 1) continue;
          const s = 1 + XM.expoOut(k) * (hit ? .75 : .3) * (1 + .55 * j);
          g.save(); g.globalAlpha *= .85 * (1 - k); g.translate(960, cy); g.scale(s, s); g.translate(-960 + 12 * j * k, -cy + 8 * k);
          outlined(g, 2.4 / s + .4, rgba(FG, .85), 'gh' + j + '-' + id, (gx, st) => letters(gx, F, xs, p.base, st));
          g.restore();
        }
      }
      if (t >= tl) {
        const k = XM.expoOut(cl((t - tl) / .3)), hx = lerp(W * .8, 960, k), hy = lerp(140, cy, k);
        g.fillStyle = rgba(FG, .38); g.fillRect(hx - .7, -40, 1.4, H + 80); g.fillRect(-40, hy - .7, W + 80, 1.4);
      }

      // ---- outlined letters (appear one by one)
      const nOut = Math.floor((dt - .12) / per) + 1;
      if (nOut > 0) {
        g.save();
        if (blk && !blk.done) { g.beginPath(); g.rect(blk.xR, -100, W * 2, H + 200); g.clip(); }
        outlined(g, 1.4, rgba(FG, .55), 'sp' + id, (gx, st) => letters(gx, F, xs, p.base, { ...st, only: i => i < nOut && !landed(i) }));
        g.restore();
      }
      // ---- fill
      if (cur && t >= fill.at) {
        g.save(); g.beginPath(); g.rect(-100, -100, W + 200, BASE + 109); g.clip();
        letters(g, F, xs, p.base, { col: FG, only: i => t >= cur.st[i], dy: i => { const k = (t - cur.st[i]) / rd; return k >= 1 ? 0 : p.cap * 1.45 * (1 - XM.expoOut(k)); } });
        g.restore();
      }
      if (blk) {
        if (blk.done) letters(g, F, xs, p.base, { col: FG });
        else {
          g.save(); g.beginPath(); g.rect(-50, -100, blk.xL + 50, H + 200); g.clip(); letters(g, F, xs, p.base, { col: FG }); g.restore();
          g.fillStyle = fill.color; g.fillRect(blk.xL, p.top - 14, blk.xR - blk.xL, p.cap + 32);
        }
      }
      if (slam && !fill && t >= slam.at) {
        letters(g, F, xs, p.base, { col: FG, only: i => t >= slam.at + i * slamStg,
          dx: i => 620 * Math.exp(-(t - slam.at - i * slamStg) * slamDec),
          skew: i => { const k = (t - slam.at - i * slamStg) / (hit ? .15 : .3); return k >= 1 ? 0 : .34 * (1 - k) * (1 - k); } });
      }
      // ---- sweep cursor (rise): parked on the left guide before the fill, sweeps across during it
      if (cur) {
        let x = null;
        if (t >= a + .25 && t < fill.at) x = X0 - 50;
        else if (t >= fill.at && t < fill.at + cur.T + .05) x = lerp(cur.xa, cur.xb, eo3((t - fill.at) / cur.T));
        if (x != null) { g.fillStyle = CUR; g.fillRect(x - 3.5, p.top - 2, 7, p.cap + 2); }
      }
      // ---- per-letter width labels + total-width rule
      if (metrics && t >= fEnd) {
        const nM = Math.floor((t - fEnd) / .04) + 1;
        for (let i = 0; i < Math.min(p.n, nM); i++) mono(g, `${F.ch[i]}·${pad(i + 1)}  ${(p.adv1[i] / p.size).toFixed(3)}`, xs[i] - p.lInk[i], BASE + 36, 15, FG, { alpha: .9 });
        const k = eo3((t - fEnd - .05) / .35);
        if (k > 0) {
          const half = wid / 2 * k, y = BASE + 90, gap = 70, L0 = 960 - half, R0 = 960 + half;
          g.fillStyle = rgba(FG, .7);
          if (half > gap) { g.fillRect(L0, y - .7, half - gap, 1.4); g.fillRect(960 + gap, y - .7, half - gap, 1.4); }
          g.fillRect(L0 - .7, y - 7, 1.4, 14); g.fillRect(R0 - .7, y - 7, 1.4, 14);
          mono(g, `${Math.round(wid * k)} PX`, 960, y + 5, 15, FG, { align: 'center' });
        }
      }
      // ---- top-left kicker (light slam into place)
      if (kick) {
        const k = dt / (hit ? .07 : .2), s = k >= 1 ? 1 : lerp(hit ? 1.25 : 1.1, 1, XM.expoOut(k));
        g.save(); g.translate(X0, p.kb); g.scale(s, s); if (hit && k < .5) g.filter = 'blur(3px)';
        XM.txt(g, kick.text, 0, 0, { fam: 'unb', size: p.ks, w: 900, col: FG, ls: -p.ks * .02, alpha: hit ? 1 : cl(dt / .1) });
        g.restore();
      }
      // ---- bottom tags: typed in one by one; item j highlights at at[j]
      if (tg && t >= tg.show) {
        const TY = BASE + 172, sz = tg.size;
        let j = -1, jp = -1; tg.at.forEach((v, i) => { if (v != null && t >= v) { if (j < 0 || v >= tg.at[j]) { jp = j; j = i; } } });
        let bx = null;
        if (j >= 0) {
          const k = eo3((t - tg.at[j]) / .32), cur2 = [P.tx[j][0] - 16, P.tx[j][1] + 32];
          if (jp < 0) bx = [cur2[0], cur2[1] * eo3((t - tg.at[j]) / .2)];
          else { const pr = [P.tx[jp][0] - 16, P.tx[jp][1] + 32]; bx = [lerp(pr[0], cur2[0], k), lerp(pr[1], cur2[1], k)]; }
          g.fillStyle = FG; g.fillRect(bx[0], TY - sz * .9, bx[1], sz * 1.2);
        }
        tg.items.forEach((s, i) => {
          const n = (t - tg.show - i * .09) / .03; if (n <= 0) return;
          const [x, w] = P.tx[i], c = x + w / 2, inBox = bx && c > bx[0] && c < bx[0] + bx[1];
          XM.txt(g, typ(s, n), x, TY, { fam: 'zh', size: sz, w: 700, col: inBox ? BG : FG });
          if (i < tg.items.length - 1 && n > [...s].length) { g.fillStyle = FG; g.fillRect(x + w + P.tgap / 2 - 3.5, TY - sz * .36, 7, 7); }
        });
      }
      // ---- lock: viewfinder corners + reticle + label
      if (t >= tl + .1) {
        const off = t < tl + .2 ? 14 : 0, bx0 = XL - 34, by0 = p.top - 24, bx1 = XR + 34, by1 = BASE + 18;
        g.save(); g.strokeStyle = FG; g.lineWidth = 5;
        for (const [x, y, sx, sy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]]) {
          const X = x - sx * off, Y = y - sy * off; g.beginPath(); g.moveTo(X, Y + sy * 75); g.lineTo(X, Y); g.lineTo(X + sx * 76, Y); g.stroke(); }
        g.restore();
        g.save(); g.translate(960, cy); g.rotate(-.5 + (t - tl) * (hit ? 3.6 : 1.6)); g.strokeStyle = CUR; g.lineWidth = 3.2;
        g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(-34, 0); g.lineTo(34, 0); g.moveTo(0, -34); g.lineTo(0, 34); g.stroke(); g.restore();
        mono(g, typ(slam.label, (t - tl - .1) * 30), X1, p.top - 40, 19, FG, { ls: 2.5, align: 'right' });
      }
      if (hit && slam && t >= tl && t < tl + 2 / 30) rgbHit(g, 9);
      if (o.hud !== false) { g.setTransform(1, 0, 0, 1, 0, 0); XM.FX.hud(g, t, { tl: `SPECIMEN ${index} — ${word}`, bl: 'XM/TYPE', br: FONT, ...(o.hud || {}), color: FG }); }
    });
  }


  Object.assign(XM, { typeSpecimen,
  });
})();
