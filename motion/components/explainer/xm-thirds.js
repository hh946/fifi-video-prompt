// XM.thirds: rule-of-thirds focus. Over a busy real screenshot / clip, thirds lines (thin lines + small squares at the intersections)
// split the frame into nine cells; the selected cell (or a block of adjacent cells) stays sharp while the outer cells are blurred and
// darkened (never desaturated). Outer cells can carry real metadata in small DM Mono text (annotation layer). Lines can close in
// from the edges or draw in one by one; focus can move from cell to cell with the narration. It focuses a region, not a word
// (keywords still use the fluorescent-yellow highlight).
// Depends on lib.js, xk.js, xm-core.js, xm-ds.js, xm-tex.js (XM.tex.blurClamp for the full-frame blur). Canvas 2D (XM.shot), deterministic (no Math.random / Date).
// Docs: docs/components/thirds.md
//
// Default feel:
//   · lines: 2 px, ~60% opacity, four 14 px solid squares at the intersections
//   · entrance: lines close in from the four edges in about 4 frames; centre cell sharp, outer = blur + darken
//   · exit: lines fade and the sharp area feathers outward to full screen
//   · the outer cells are not desaturated, the focused cell does not slowly push in, there are no threshold / black flash frames (photosensitivity), and the line colour is the video's accent
//
// XM.thirds(o) → { L, update, cues, times, api }
//   This is a framework: the footage, where the lines go, which cell is focused / where focus moves, and what the cells say are all up to the caller. No default footage or text.
//   Content (required; missing -> console.error):
//     img   : { src, crop:[x,y,w,h], focus:[.5,.5] } background image (cover-fills the screen; on-screen magnification > 1.1 warns, > 1.25 errors)
//             or clip:{ dir, from:0, rate:1, at } (XM.frames sequence), or draw:(g, t) => {} to draw it yourself (must be able to redraw the same frame)
//     at    : when the lines start to appear (absolute seconds)
//     hud   : { tl, bl, br }  four-corner HUD text
//   lines: { x:[x1, x2], y:[y1, y2] } screen positions of the two vertical and two horizontal lines (default thirds 640 / 1280, 360 / 720). Place them so the area to focus falls in one cell
//   focus: [c, r] (one cell, 0..2) | [c0, r0, c1, r1] (adjacent block) | [[t, cell...], ...] (moves with narration: t absolute seconds, each move takes move seconds). Default centre [1, 1]
//     move : seconds per move (default .5, s5 easing: zero velocity at both ends, no overshoot)
//   enter: { mode:'close' (lines close in from the edges) | 'draw' (lines draw one by one), dur:.45, stagger:.12, order:['x0','x1','y0','y1'],
//            outer:0 (draw mode: seconds to wait after the lines before the outer cells blur, fading in over 0.45 s) }
//   outer: { blur:16, dim:.3, feather:2 }  blur radius px, darkening (0..1, black overlay), feather px at the sharp area's edge. No desaturation
//   style: { col (default P.accent; picks >= 3:1 contrast against what it sits on), lw:2, alpha:.6, mark:14 (intersection square size, 0 = off) }
//   info: [{ cell:[c, r], lines:['...', ...], at, pos:[.5, .5], align:'center', size:22 }] real metadata in outer cells (source, date, page, version),
//     small mono text 18-24 px, decorative, never content to read; at omitted = after the entrance. Text colour adapts to the brightness underneath
//   exit: { at, dur:.4, mode:'open' (sharp area feathers out to full screen, lines fade) | 'fade' (outer cells clear, lines fade) }; omitted = held until the shot ends
//   tone : 'ink' (default) | 'paper' (only affects HUD decisions and the background where not covered)
//   sfx: { focus:'pop' (focus lands / moves to the next cell) | false }. No sound by default for lines closing in or info appearing
//   Photosensitivity: entrance / moves / exit estimate full-screen luminance jumps from outer area x dim x image brightness (>= .2 counts); more than 3 in any 1 second -> console.error (unless unsafe:true)
(() => {
  const { W, H } = XK;
  const DS = XM.DS;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const s5 = k => { k = cl(k); return k * k * k * (k * (6 * k - 15) + 10); };
  const fpsOf = () => (window.VIDEO && VIDEO.fps) || 30;
  let _probe = null;
  function probe(w, h) { if (!_probe || _probe.canvas.width !== w || _probe.canvas.height !== h) { const c = document.createElement('canvas'); c.width = w; c.height = h; _probe = c.getContext('2d', { willReadFrequently: true }); } _probe.clearRect(0, 0, w, h); return _probe; }
  const lumAt = (src, x, y, w, h) => { const q = probe(16, 16); q.drawImage(src, x, y, w, h, 0, 0, 16, 16); const d = q.getImageData(0, 0, 16, 16).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722) / 255; return s / (d.length / 4); };
  const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(cl(v, 0, 255)).toString(16).padStart(2, '0')).join('');

  function thirds(o = {}) {
    const err = m => console.error('XM.thirds: ' + m);
    const IM = o.img || null;
    if (!IM || (!IM.src && !(IM.clip && IM.clip.dir) && typeof IM.draw !== 'function'))
      err('img ({ src, crop } screenshot | { clip:{ dir } } frame sequence | { draw(g, t) } your own drawing) is required; the component has no default footage');
    if (o.at == null) err('at (absolute seconds when the lines start to appear) is required');
    if (!o.hud && o.hud !== false) err('hud text (tl shot id / bl chapter / br what is shown) is required; the component has no default text');
    const at = o.at ?? 0, fps = fpsOf();
    const P = { ...DS.tone(o.tone || 'ink') };
    const LX = (o.lines && o.lines.x) || [W / 3, W * 2 / 3], LY = (o.lines && o.lines.y) || [H / 3, H * 2 / 3];
    const EN = { mode: 'close', dur: .45, stagger: .12, order: ['x0', 'x1', 'y0', 'y1'], outer: 0, ...(o.enter || {}) };
    const OU = { blur: 16, dim: .3, feather: 2, ...(o.outer || {}) };
    if (OU.sat != null || OU.desat != null) err('outer is never desaturated; sat / desat are not supported');
    const ST = { lw: 2, alpha: .6, mark: 14, ...(o.style || {}) };
    const EX = o.exit ? { dur: .4, mode: 'open', ...o.exit } : null;
    const MOVE = o.move ?? .5;

    // ---------- Focus: [c, r] | [c0, r0, c1, r1] | [[t, ...], ...] ----------
    const norm = f => f.length === 2 ? [f[0], f[1], f[0], f[1]] : f.slice(0, 4);
    let steps;
    if (!o.focus) steps = [[at, [1, 1, 1, 1]]];
    else if (Array.isArray(o.focus[0])) steps = o.focus.map(s => [s[0], norm(s.slice(1).length === 1 ? s[1] : s.slice(1))]);
    else steps = [[at, norm(o.focus)]];
    steps.sort((a, b) => a[0] - b[0]);
    steps.forEach(([, f]) => { if (f.some(v => v < 0 || v > 2) || f[0] > f[2] || f[1] > f[3]) err('focus cells are 0..2 (column, row); a block is [c0, r0, c1, r1]'); });

    // ---------- Line positions (close entrance: from the frame edges into place) ----------
    const tEnterEnd = EN.mode === 'draw' ? at + EN.stagger * (EN.order.length - 1) + EN.dur : at + EN.dur;
    const closeK = t => EN.mode === 'close' ? XM.expoOut(cl((t - at) / EN.dur)) : 1;
    const linesAt = t => { const k = closeK(t); return { x: [lerp(0, LX[0], k), lerp(W, LX[1], k)], y: [lerp(0, LY[0], k), lerp(H, LY[1], k)] }; };
    const blockRect = (f, Ls) => {
      const xs = [0, Ls.x[0], Ls.x[1], W], ys = [0, Ls.y[0], Ls.y[1], H];
      return [xs[f[0]], ys[f[1]], xs[f[2] + 1], ys[f[3] + 1]];
    };
    function focusRect(t) {
      const Ls = linesAt(t);
      let i = 0; while (i + 1 < steps.length && t >= steps[i + 1][0]) i++;
      const cur = blockRect(steps[i][1], Ls);
      if (i > 0 && t < steps[i][0] + MOVE) { const prev = blockRect(steps[i - 1][1], Ls), k = s5((t - steps[i][0]) / MOVE); return cur.map((v, j) => lerp(prev[j], v, k)); }
      return cur;
    }
    // How much of the outer treatment is showing (0..1)
    const outerK = t => {
      let a = EN.mode === 'draw' ? s5((t - (tEnterEnd - .25 + EN.outer)) / .45) : cl((t - at) / (1 / fps));
      if (EX && t >= EX.at && EX.mode === 'fade') a *= 1 - s5((t - EX.at) / EX.dur);
      if (EX && t >= EX.at + EX.dur && EX.mode === 'open') a *= 1 - s5((t - EX.at - EX.dur) / .15);
      return a;
    };
    const lineK = t => { let a = 1; if (EX && t >= EX.at) a = 1 - s5((t - EX.at) / EX.dur); return a; };
    // Draw progress of each line (draw mode)
    const drawK = (name, t) => EN.mode !== 'draw' ? (t >= at ? 1 : 0) : s5((t - at - EN.stagger * Math.max(0, EN.order.indexOf(name))) / EN.dur);

    // ---------- Background ----------
    const R = IM && IM.src ? { kind: 'img', I: XM.image(IM.src) } : IM && IM.clip ? { kind: 'clip', F: XM.frames(IM.clip.dir) } : { kind: 'draw' };
    const natural = () => R.kind === 'img' ? (R.I.ok ? [R.I.img.naturalWidth, R.I.img.naturalHeight] : null) : R.kind === 'clip' ? (R.F.ok ? [R.F.meta.w, R.F.meta.h] : null) : [W, H];
    function srcRect() {
      const nat = natural(); if (!nat) return null;
      const c = IM.crop || [0, 0, nat[0], nat[1]], fc = IM.focus || [.5, .5], A = W / H;
      let [sx, sy, sw, sh] = c;
      if (sw / sh > A) { const nw = sh * A; sx += (sw - nw) * fc[0]; sw = nw; } else { const nh = sw / A; sy += (sh - nh) * fc[1]; sh = nh; }
      return [sx, sy, sw, sh];
    }
    function drawBase(q, t) {
      q.fillStyle = P.bg; q.fillRect(0, 0, W, H);
      if (R.kind === 'draw') { q.save(); IM.draw(q, t); q.restore(); return; }
      const im = R.kind === 'img' ? (R.I.ok ? R.I.img : null) : R.F.at(Math.max(0, (t - (IM.clip.at ?? at)) * (IM.clip.rate ?? 1) + (IM.clip.from ?? 0)));
      const r = srcRect(); if (!im || !r) return;
      q.imageSmoothingEnabled = true; q.imageSmoothingQuality = 'high';
      q.drawImage(im, r[0], r[1], r[2], r[3], 0, 0, W, H);
    }

    // ---------- Checks: magnification, line colour, photosensitivity ----------
    let checked = false, LINE = ST.col || P.accent;
    const api = { lum: null, steps, linesAt, focusRect };
    function checks(base) {
      if (checked || !natural()) return; checked = true;
      if (R.kind !== 'draw') { const m = W / srcRect()[2]; if (m > 1.1) (m > 1.25 ? console.error : console.warn)(`XM.thirds: the background is magnified ${m.toFixed(2)}x on screen and will look soft (keep <= 1.1). Recapture web pages with capture.js --scale 3; re-render PDFs at 3x`); }
      // What the lines sit on: average colour in a band around the four lines; pick a colour with >= 3:1 contrast (unless the caller gave col)
      const q = probe(48, 27); q.drawImage(base, 0, 0, 48, 27); const d = q.getImageData(0, 0, 48, 27).data; let r = 0, g = 0, b = 0, n = 0;
      for (let y = 0; y < 27; y++) for (let x = 0; x < 48; x++) { const X = x / 48 * W, Y = y / 27 * H; if (Math.min(Math.abs(X - LX[0]), Math.abs(X - LX[1]), Math.abs(Y - LY[0]), Math.abs(Y - LY[1])) > 60) continue; const i = (y * 48 + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      const under = n ? toHex(r / n, g / n, b / n) : P.bg;
      if (!ST.col) LINE = DS.pick(under, [P.accent, DS.PAPER, DS.INK]);
      // Photosensitivity: full-screen mean luminance ≈ image luminance x (1 - outer area share x dim)
      const L0 = lumAt(base, 0, 0, W, H), frac = f => { const [x0, y0, x1, y1] = blockRect(f, { x: LX, y: LY }); return 1 - (x1 - x0) * (y1 - y0) / (W * H); };
      const ev = [[at, L0, L0 * (1 - frac(steps[0][1]) * OU.dim)]];
      for (let i = 1; i < steps.length; i++) ev.push([steps[i][0], L0 * (1 - frac(steps[i - 1][1]) * OU.dim), L0 * (1 - frac(steps[i][1]) * OU.dim)]);
      if (EX) ev.push([EX.at, L0 * (1 - frac(steps[steps.length - 1][1]) * OU.dim), L0]);
      const jumps = ev.filter(e => Math.abs(e[2] - e[1]) >= .2).map(e => e[0]);
      let worst = 0; for (const t0 of jumps) worst = Math.max(worst, jumps.filter(t1 => t1 >= t0 && t1 < t0 + 1).length);
      if (worst > 3 && !o.unsafe) err(`${worst} large full-screen luminance jumps (>= .2) within 1 second; photosensitivity limit is <= 3 per second. Slow the focus moves or lower outer.dim`);
      api.lum = { base: L0, jumps, line: LINE, under };
    }

    // ---------- Info ----------
    const INFO = (o.info || []).map(it => ({ size: 22, pos: [.5, .5], align: 'center', ...it }));
    INFO.forEach((it, i) => { if (!it.cell || !Array.isArray(it.lines)) err(`info[${i}] needs cell:[c, r] and lines:['...'] (real metadata: source, date, page, version)`); });
    function drawInfo(g, t, base) {
      const Ls = { x: LX, y: LY };
      for (const it of INFO) {
        // Exit 'fade': info fades with the lines; 'open': info stays and cuts away with the shot
        const a0 = it.at ?? tEnterEnd, a = DS.in(t, a0, .3) * (EX && EX.mode === 'open' ? 1 : lineK(t)) * (it.until != null ? 1 - s5((t - it.until) / .25) : 1); if (a <= 0) continue;
        const [x0, y0, x1, y1] = blockRect([it.cell[0], it.cell[1], it.cell[0], it.cell[1]], Ls);
        const lh = it.size * 1.4, n = it.lines.length, cx = lerp(x0, x1, it.pos[0]), cy = lerp(y0, y1, it.pos[1]) - (n - 1) * lh / 2;
        const tw = Math.max(...it.lines.map(s => XM.measure(g, s, { fam: 'mono', size: it.size, w: 500 })));
        const bx = it.align === 'center' ? cx - tw / 2 : it.align === 'right' ? cx - tw : cx;
        // Text colour: dark / light by the brightness underneath (after the outer darkening)
        const L = lumAt(base, cl(bx, 0, W - 2), cl(cy - lh, 0, H - 2), cl(tw, 2, W), cl(n * lh, 2, H)) * (1 - OU.dim);
        const col = L > .5 ? '#121214' : '#ece8df';
        it.lines.forEach((s, j) => XM.txt(g, s, cx, cy + j * lh + it.size * .36, { fam: 'mono', size: it.size, w: 500, col, align: it.align, alpha: a }));
      }
    }

    // ---------- Lines + intersection squares ----------
    function drawLines(g, t) {
      const Ls = linesAt(t), la = lineK(t) * ST.alpha; if (la <= 0 || t < at) return;
      g.save(); g.globalAlpha = la; g.strokeStyle = LINE; g.lineWidth = ST.lw; g.lineCap = 'butt';
      const seg = (name, x0, y0, x1, y1) => { const k = drawK(name, t); if (k <= 0) return; g.beginPath(); g.moveTo(x0, y0); g.lineTo(lerp(x0, x1, k), lerp(y0, y1, k)); g.stroke(); };
      seg('x0', Ls.x[0], 0, Ls.x[0], H); seg('x1', Ls.x[1], H, Ls.x[1], 0);
      seg('y0', 0, Ls.y[0], W, Ls.y[0]); seg('y1', W, Ls.y[1], 0, Ls.y[1]);
      g.restore();
      if (ST.mark > 0) {
        const ma = Math.min(1, lineK(t) * Math.min(1, ST.alpha * 1.5)), s = ST.mark;
        g.save(); g.fillStyle = LINE;
        for (const [xi, x] of [['x0', Ls.x[0]], ['x1', Ls.x[1]]]) for (const [yi, y] of [['y0', Ls.y[0]], ['y1', Ls.y[1]]]) {
          const k = Math.min(drawK(xi, t), drawK(yi, t)); if (k < .98) continue;
          g.globalAlpha = ma; g.fillRect(x - s / 2, y - s / 2, s, s);
        }
        g.restore();
      }
    }

    // ---------- Sound ----------
    const SF = o.sfx || {}, cues = [];
    if (SF.focus !== false) { const nm = SF.focus || DS.SFX.bracket; cues.push({ t: +(EN.mode === 'draw' ? tEnterEnd : at + EN.dur * .6).toFixed(3), name: nm });
      for (let i = 1; i < steps.length; i++) cues.push({ t: +(steps[i][0] + MOVE * .7).toFixed(3), name: nm, keep: true }); }

    const shot = XM.shot({ bg: P.bg, stage: 'flat', cam: o.cam }, () => (g, t) => {
      const B = XM.canvas('xm-thirds-base'); drawBase(B.g, t);
      checks(B.c);
      g.drawImage(B.c, 0, 0);
      const oa = t >= at ? outerK(t) : 0;
      if (oa > 0) {
        let r = focusRect(t), fe = OU.feather;
        if (EX && EX.mode === 'open' && t > EX.at) {          // open exit: the sharp area feathers outward to full screen
          const k = s5((t - EX.at) / EX.dur), pad = 260;
          r = [lerp(r[0], -pad, k), lerp(r[1], -pad, k), lerp(r[2], W + pad, k), lerp(r[3], H + pad, k)]; fe = lerp(fe, 45, k);
        }
        const O = XM.canvas('xm-thirds-outer');
        XM.tex.blurClamp(O.g, B.c, OU.blur);
        if (OU.dim > 0) { O.g.fillStyle = `rgba(0,0,0,${OU.dim})`; O.g.fillRect(0, 0, W, H); }
        O.g.globalCompositeOperation = 'destination-out';
        if (fe > .5) O.g.filter = `blur(${fe.toFixed(1)}px)`;
        O.g.fillStyle = '#000'; O.g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
        O.g.filter = 'none'; O.g.globalCompositeOperation = 'source-over';
        g.save(); g.globalAlpha = oa; g.drawImage(O.c, 0, 0); g.restore();
      }
      if (t >= at) { drawInfo(g, t, B.c); drawLines(g, t); }
      if (o.over) { g.save(); o.over(g, t, api); g.restore(); }
      if (o.hud !== false) DS.hud(g, t, P, o.hud || {});
    });
    shot.cues = cues; shot.times = { at, enterEnd: tEnterEnd, steps: steps.map(s => s[0]), exit: EX && EX.at }; shot.api = api;
    return shot;
  }
  Object.assign(XM, { thirds });
})();
