// XM.wall: whole-wall swap. A wall of cells (a few strips or a grid) each holding a different real screenshot / clip slides in
// and stops; on a chosen word every cell switches at once to the same image / clip ("many different things -> actually all
// the same one"). Optionally sweep a fluorescent-yellow highlight on the new image (same spot in every cell, together).
// Depends on lib.js, xk.js, xm-core.js, xm-ds.js (xm-tex.js optional). Canvas 2D (XM.shot), deterministic (no Math.random / Date).
// Docs: docs/components/wall.md
//
// Default motion feel:
//   · two film strips sliding in opposite directions: top strip -1.78° moving left, bottom +1.89° moving right; pitch ~600 px
//   · slide-in: each frame's remaining offset shrinks by x0.87 (= normalised exponential ease-out e^(-4.6k)); motion blur length = per-frame offset x 0.9
//   · after the swap the wall stays still (no drift), random white-card flashes are left out (photosensitivity)
//
// XM.wall(o) → { L, update, cues, times, api }
//   This is a framework: what goes on the wall, how many cells, layout, which word triggers the swap and what it swaps to are all
//   up to the caller. The component has no default footage and no default HUD text.
//   Content (required; missing -> console.error):
//     cells : [{ src | clip:{ dir, from:0, rate:1 }, crop:[x,y,w,h], focus:[.5,.5], label, on }]  >= 2 different real screenshots / clips.
//             src = image; clip = frame-sequence dir from scripts/clip_frames.py (XM.frames). crop = region of the source to use (default whole), cells are filled cover-style;
//             focus = which side to keep when cropping. label = small mono note above the cell (what it is, 18-24 px, decorative). Order: strip 1 start to end, then strip 2;
//             cells repeat if there are more cells than entries
//     same  : { at, src | clip, crop, focus, on, br, mark:[{ box:[x,y,w,h], at, dur:.45 }] } whole-wall swap: at (absolute seconds, on the spoken word) every cell switches to this image /
//             clip (for a clip all cells show the same frame). br = HUD bottom-right text after the swap. mark = fluorescent-yellow sweep at the same spot in every cell (box in source px).
//             May be an array (several swaps), one object each
//     at    : when the wall starts sliding in (absolute seconds)
//     hud   : { tl, bl, br }  four-corner HUD text (see SKILL.md)
//   Layout (all optional):
//     axis   : 'row' (default: one strip = one row, slides horizontally) | 'col' (one strip = one column, slides vertically)
//     lanes  : number of strips (default 2); per: cells visible per strip (default 4). About 2 x 4 works; avoid many tiny cells
//     box    : [x, y, w, h] area of the wall (default [150, 190, 1620, 700], readable content 150 px from the edge); gap: cell gap (default 28)
//     tilt   : strip tilt in degrees (number = all strips; array = per strip; default 0)
//     overflow : extra cells at each end of a strip (for film strips running off-frame; default 0)
//     radius : cell corner radius (default 6); border: thin cell outline (default P.line, false = none)
//     band   : strip backing (the film strip itself) { pad:14, col } | false (default false)
//     list   : explicit geometry per strip (overrides the automatic layout): [{ m:[x,y] strip midpoint (centre of cell 0 at rest), angle (deg), pitch, w, h, j:[j0, j1] (cell index range),
//              rot (extra rotation of the photo relative to the strip, deg) }]
//   enter: { dur:.8, ease:'expoOut'|function, dir:'alt'|1|-1|[...], from:[...], stagger:.06, blur:.9 }
//     dir = slide direction per strip (+1 along the strip, -1 against; 'alt' = strip 0 -1, strip 1 +1, ... opposite directions); from = start offset of each strip from rest (px;
//     computed automatically to start just off-frame if omitted); blur = motion-blur length = per-frame offset x blur (0 = off). No drift after stopping
//   swap: { style:'cut' (default, all cells hard-cut on the same frame) | 'wipe' (all cells wipe to the new image from one side together), dur:.3, dir:'down'|'up'|'left'|'right' }
//   labels: { size:20, gap:10, col } (style of cell labels)
//   Hooks: under(g, t) draws below the wall, above the stage; over(g, t, api) draws above the wall, below the HUD (draw a subject overlapping the wall here)
//   tone : 'ink' (default) | 'paper' | 'accent'
//   sfx: { enter:'sheet' (paper flying in; 'filmfeed' for film strips) | false, swap:'snap' (reveal) | false, mark:'paper' | false }
//   Photosensitivity: the component estimates the full-screen luminance jump of each swap from each image's mean brightness (>= .2 counts as one);
//     more than 3 in any 1 second -> console.error, unless unsafe:true is passed explicitly
//   Screenshots must be sharp: on-screen magnification of a cell (display px / source px) > 1.1 warns, > 1.25 errors. Use a higher-resolution image or a smaller crop instead of upscaling
(() => {
  const { W, H } = XK;
  const DS = XM.DS;
  const RAD = Math.PI / 180;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fpsOf = () => (window.VIDEO && VIDEO.fps) || 30;
  const EASE = { expoOut: XM.expoOut, linear: k => k, smooth: k => k * k * (3 - 2 * k), out3: k => 1 - Math.pow(1 - k, 3),
    // Slide-in: each frame's remaining offset x0.87 -> normalised exponential e^(-4.6k)
    decay: k => (1 - Math.exp(-4.6 * k)) / (1 - Math.exp(-4.6)) };
  const ez = e => (typeof e === 'function' ? e : EASE[e] || (XM.tex && XM.tex.ease ? XM.tex.ease(e) : XM.expoOut));
  let _probe = null;
  function probe(w, h) { if (!_probe || _probe.canvas.width !== w || _probe.canvas.height !== h) { const c = document.createElement('canvas'); c.width = w; c.height = h; _probe = c.getContext('2d', { willReadFrequently: true }); } _probe.clearRect(0, 0, w, h); return _probe; }
  const lumOfImg = (img, sx, sy, sw, sh) => { const q = probe(24, 24); q.drawImage(img, sx, sy, sw, sh, 0, 0, 24, 24); const d = q.getImageData(0, 0, 24, 24).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722) / 255; return s / (d.length / 4); };
  const hexLum = h => { const m = String(h).replace('#', ''); if (m.length < 6) return .5; const v = i => parseInt(m.slice(i, i + 2), 16) / 255; return .2126 * v(0) + .7152 * v(2) + .0722 * v(4); };

  function wall(o = {}) {
    const err = m => console.error('XM.wall: ' + m);
    const cells = Array.isArray(o.cells) ? o.cells : [];
    if (cells.length < 2) err('cells (>= 2 different real screenshots / clips: { src, crop } or { clip:{ dir } }) must be provided; the component has no default footage');
    cells.forEach((c, i) => { if (!c || (!c.src && !(c.clip && c.clip.dir))) err(`cells[${i}] needs src (image) or clip:{ dir } (frame sequence)`); });
    const sames = o.same ? (Array.isArray(o.same) ? o.same : [o.same]) : [];
    if (!sames.length) err('same ({ at, src | clip }: on which word the whole wall swaps, and to what) is required; it is the point of this component');
    sames.forEach((s, i) => { if (s.at == null) err(`same[${i}].at (absolute seconds of the swap, on the first frame of the spoken word) is required`); if (!s.src && !(s.clip && s.clip.dir)) err(`same[${i}] needs src or clip:{ dir }`); });
    if (o.at == null) err('at (absolute seconds when the wall starts sliding in) is required');
    if (!o.hud && o.hud !== false) err('hud text (tl shot id / bl chapter / br what is shown) is required; the component has no default text');
    const at = o.at ?? 0, fps = fpsOf();
    const P = { ...DS.tone(o.tone || 'ink') };
    sames.sort((a, b) => a.at - b.at);

    // ---------- Layout: geometry of each strip ----------
    const LY = { axis: 'row', lanes: 2, per: 4, box: [150, 190, 1620, 700], gap: 28, tilt: 0, overflow: 0, radius: 6, border: true, band: false, ...(o.layout || {}) };
    let lanes;
    if (Array.isArray(LY.list)) lanes = LY.list.map(l => ({ m: l.m, ang: (l.angle || 0) * RAD, pitch: l.pitch, w: l.w, h: l.h, j0: l.j[0], j1: l.j[1], rot: (l.rot || 0) * RAD, cross: l.h }));
    else {
      const [bx, by, bw, bh] = LY.box, n = LY.lanes, per = LY.per, gp = LY.gap, ov = LY.overflow;
      // With cell labels, reserve one label line above each cell (so it does not overlap the cell above)
      const lbS = (o.labels && o.labels.size) ?? 20, lbG = (o.labels && o.labels.gap) ?? 10, ex = cells.some(c => c && c.label) && lbS ? lbS + lbG : 0;
      const tl = i => (Array.isArray(LY.tilt) ? LY.tilt[i] ?? 0 : LY.tilt) * RAD;
      lanes = [];
      for (let i = 0; i < n; i++) {
        if (LY.axis === 'col') { const cw = (bw - gp * (n - 1)) / n, ch = (bh - gp * (per - 1) - ex * per) / per;
          lanes.push({ m: [bx + cw / 2 + i * (cw + gp), by + bh / 2 + ex / 2], ang: 90 * RAD + tl(i), pitch: ch + gp + ex, w: cw, h: ch, cross: cw, j0: -(per - 1) / 2 - ov, j1: (per - 1) / 2 + ov, rot: -90 * RAD }); }
        else { const cw = (bw - gp * (per - 1)) / per, ch = (bh - gp * (n - 1) - ex * n) / n;
          lanes.push({ m: [bx + bw / 2, by + ex + ch / 2 + i * (ch + gp + ex)], ang: tl(i), pitch: cw + gp, w: cw, h: ch, cross: ch, j0: -(per - 1) / 2 - ov, j1: (per - 1) / 2 + ov, rot: 0 }); }
      }
    }
    // Cell j of lane i -> which entry in cells (counted along the strips, wrapping)
    let idx = 0;
    lanes.forEach((ln, i) => { ln.i = i; ln.cells = []; for (let j = ln.j0; j <= ln.j1 + 1e-6; j++) ln.cells.push({ j, k: idx++ % Math.max(1, cells.length) }); });

    // ---------- Enter ----------
    const EN = { dur: .8, ease: 'expoOut', dir: 'alt', stagger: .06, blur: .9, ...(o.enter || {}) };
    const eEase = ez(EN.ease);
    lanes.forEach((ln, i) => {
      const dir = Array.isArray(EN.dir) ? EN.dir[i] ?? 1 : EN.dir === 'alt' ? (i % 2 ? 1 : -1) : EN.dir;
      if (Array.isArray(EN.from) && EN.from[i] != null) { ln.from = EN.from[i]; }
      else {
        // Automatic: start with the whole strip just off-frame (projected along the strip direction)
        const ux = Math.cos(ln.ang), uy = Math.sin(ln.ang), half = ((ln.j1 - ln.j0) / 2 + .5) * ln.pitch + Math.max(ln.w, ln.h);
        const mc = ln.m[0] * ux + ln.m[1] * uy, lo = Math.min(0, W * ux, H * uy, W * ux + H * uy), hi = Math.max(0, W * ux, H * uy, W * ux + H * uy);
        const jm = (ln.j0 + ln.j1) / 2 * ln.pitch;            // strip centre relative to m
        ln.from = dir < 0 ? (hi - (mc + jm) + half + 40) : -((mc + jm) - lo + half + 40);
      }
      ln.t0 = at + i * EN.stagger;
    });
    const offAt = (ln, t) => ln.from * (1 - eEase(cl((t - ln.t0) / EN.dur)));
    const tSettle = Math.max(...lanes.map(l => l.t0)) + EN.dur;

    // ---------- Footage ----------
    const mk = s => s.clip ? { kind: 'clip', F: XM.frames(s.clip.dir), from: s.clip.from ?? 0, rate: s.clip.rate ?? 1, t0: s.clip.at, s }
      : { kind: 'img', I: XM.image(s.src), s };
    const SRC = cells.map(mk), SAME = sames.map(mk);
    const natural = R => R.kind === 'img' ? (R.I.ok ? [R.I.img.naturalWidth, R.I.img.naturalHeight] : null) : (R.F.ok ? [R.F.meta.w, R.F.meta.h] : null);
    function frameOf(R, t, tStart) {
      if (R.kind === 'img') return R.I.ok ? R.I.img : null;
      const t0 = R.t0 ?? tStart; return R.F.at(Math.max(0, (t - t0) * R.rate + R.from));
    }
    // Source region to use (cover-fit to the cell aspect)
    function srcRect(R, w, h) {
      const nat = natural(R); if (!nat) return null;
      const c = R.s.crop || [0, 0, nat[0], nat[1]], fc = R.s.focus || [.5, .5], A = w / h;
      let [sx, sy, sw, sh] = c;
      if (sw / sh > A) { const nw = sh * A; sx += (sw - nw) * fc[0]; sw = nw; } else { const nh = sw / A; sy += (sh - nh) * fc[1]; sh = nh; }
      return [sx, sy, sw, sh];
    }

    // ---------- Checks: magnification, photosensitivity ----------
    let checked = false;
    const lumC = [], lumS = [];
    function checks() {
      if (checked) return;
      const all = [...SRC, ...SAME];
      if (!all.every(R => natural(R))) return;
      checked = true;
      const lw = Math.max(...lanes.map(l => l.w)), lh = Math.max(...lanes.map(l => l.h));
      all.forEach(R => {
        const r = srcRect(R, lw, lh), m = lw / r[2], name = R.s.src || (R.s.clip && R.s.clip.dir);
        if (m > 1.1) (m > 1.25 ? console.error : console.warn)(`XM.wall: ${name} is magnified ${m.toFixed(2)}x in its cell and will look soft (keep <= 1.1). Recapture web pages with scripts/capture.js --scale 3, or use smaller cells / a larger crop`);
      });
      const lumR = R => { const r = srcRect(R, lw, lh), im = R.kind === 'img' ? R.I.img : R.F.frame(1); return im ? lumOfImg(im, ...r) : .5; };
      SRC.forEach(R => lumC.push(lumR(R))); SAME.forEach(R => lumS.push(lumR(R)));
      // Estimate the wall's share of the screen (cell area / screen area, at rest)
      let area = 0; lanes.forEach(ln => ln.cells.forEach(() => { area += ln.w * ln.h; })); const fr = cl(area / (W * H), 0, 1), bg = hexLum(P.bg);
      const mean = arr => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
      const scr = [bg * (1 - fr) + mean(lumC) * fr, ...lumS.map(v => bg * (1 - fr) + v * fr)];
      const jumps = []; for (let i = 1; i < scr.length; i++) if (Math.abs(scr[i] - scr[i - 1]) >= .2) jumps.push(sames[i - 1].at);
      let worst = 0; for (const t0 of jumps) worst = Math.max(worst, jumps.filter(t1 => t1 >= t0 && t1 < t0 + 1).length);
      if (worst > 3 && !o.unsafe) err(`whole-wall swaps cause ${worst} large full-screen luminance jumps (>= .2) within 1 second; photosensitivity limit is <= 3 per second. Slow down, use images of similar brightness, or pass unsafe:true explicitly`);
      api.lum = { cells: lumC, same: lumS, screen: scr, jumps };
    }

    // ---------- Draw one strip ----------
    const SW = { style: 'cut', dur: .3, dir: 'down', ...(o.swap || {}) };
    const LB = { size: 20, gap: 10, col: P.mute, ...(o.labels || {}) };
    const bandCol = LY.band ? (LY.band.col || (XM.tex && XM.tex.shade ? XM.tex.shade(P.bg, P.stage === 'paper' ? -.06 : .1) : P.faint)) : null;
    const lineCol = LY.border === false ? null : (typeof LY.border === 'string' ? LY.border : P.line);
    const curSame = t => { let s = -1; for (let i = 0; i < sames.length; i++) if (t >= sames[i].at) s = i; return s; };

    function drawContent(g, R, t, tStart, w, h) {
      const im = frameOf(R, t, tStart), r = srcRect(R, w, h); if (!im || !r) return null;
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(im, r[0], r[1], r[2], r[3], -w / 2, -h / 2, w, h);
      return r;
    }
    function wipeClip(g, w, h, k) {
      const d = SW.dir; g.beginPath();
      if (d === 'down') g.rect(-w / 2, -h / 2, w, h * k); else if (d === 'up') g.rect(-w / 2, h / 2 - h * k, w, h * k);
      else if (d === 'right') g.rect(-w / 2, -h / 2, w * k, h); else g.rect(w / 2 - w * k, -h / 2, w * k, h);
      g.clip();
    }
    function drawCell(g, ln, c, t, cx, cy) {
      const w = ln.w, h = ln.h, r = LY.radius;
      g.save(); g.translate(cx, cy); g.rotate(ln.ang + ln.rot);
      if (LB.size && cells[c.k] && cells[c.k].label) {          // small label text (left-aligned above the cell; column strips are rotated back upright)
        XM.txt(g, cells[c.k].label, -w / 2, -h / 2 - LB.gap, { fam: 'mono', size: LB.size, w: 500, col: LB.col });
      }
      g.save(); g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, r); g.clip();
      g.fillStyle = P.stage === 'paper' ? '#d9d5cc' : '#1a1b20'; g.fillRect(-w / 2, -h / 2, w, h);
      const si = curSame(t);
      if (SW.style === 'wipe' && si >= 0 && t < sames[si].at + SW.dur) {
        // wipe: the previous image underneath, the new one covering it by wipe progress (all cells, same moment, same direction)
        const prev = si - 1 < 0 ? SRC[c.k] : SAME[si - 1], k = XM.expoOut(cl((t - sames[si].at) / SW.dur));
        drawContent(g, prev, t, si - 1 < 0 ? at : sames[si - 1].at, w, h);
        g.save(); wipeClip(g, w, h, k); drawContent(g, SAME[si], t, sames[si].at, w, h); g.restore();
      } else drawContent(g, si < 0 ? SRC[c.k] : SAME[si], t, si < 0 ? at : sames[si].at, w, h);
      // Highlight sweep (on the swapped-in image, same spot in every cell)
      if (si >= 0 && sames[si].mark) {
        const R = SAME[si], rr = srcRect(R, w, h);
        if (rr) for (const mk of [].concat(sames[si].mark)) {
          const k = cl((t - mk.at) / (mk.dur ?? .45)); if (k <= 0) continue;
          const kE = 1 - Math.pow(1 - k, 2), s = w / rr[2], b = mk.box;
          g.save(); g.translate(-w / 2, -h / 2); g.scale(s, s); g.translate(-rr[0], -rr[1]);
          XM.mark.sweep(g, b[0], b[1], b[2], b[3], P, kE, { on: sames[si].on || 'light' });
          g.restore();
        }
      }
      g.restore();
      if (lineCol) { g.strokeStyle = lineCol; g.lineWidth = 1.5; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, r); g.stroke(); }
      g.restore();
    }
    function drawLane(g, ln, t, off) {
      const ux = Math.cos(ln.ang), uy = Math.sin(ln.ang);
      if (bandCol) {
        const pad = LY.band.pad ?? 14, a = (ln.j0 - .5) * ln.pitch + off - pad, b = (ln.j1 + .5) * ln.pitch + off + pad;
        g.save(); g.translate(ln.m[0], ln.m[1]); g.rotate(ln.ang); g.fillStyle = bandCol;
        const top = ln.cross / 2 + pad + (LB.size && cells.some(c => c.label) ? LB.size + LB.gap : 0), bot = ln.cross / 2 + pad;
        g.fillRect(a, -top, b - a, top + bot); g.restore();
      }
      for (const c of ln.cells) {
        const d = c.j * ln.pitch + off, cx = ln.m[0] + ux * d, cy = ln.m[1] + uy * d, R = Math.hypot(ln.w, ln.h) / 2 + 40;
        if (cx < -R || cx > W + R || cy < -R || cy > H + R) continue;
        drawCell(g, ln, c, t, cx, cy);
      }
    }

    // ---------- Sound ----------
    const SF = o.sfx || {}, cues = [];
    const cue = (t, name, x = {}) => { if (name && isFinite(t)) cues.push({ t: +t.toFixed(3), name, ...x }); };
    if (SF.enter !== false) cue(at, SF.enter || DS.SFX.fly || 'sheet');
    sames.forEach(s => { if (SF.swap !== false) cue(s.at, SF.swap || DS.SFX.reveal); for (const mk of [].concat(s.mark || [])) if (SF.mark !== false) cue(mk.at, SF.mark || DS.SFX.sweep); });

    const api = { lanes, tSettle, offAt, lum: null };
    const shot = XM.shot({ bg: P.bg, stage: 'flat', cam: o.cam }, () => (g, t) => {
      checks();
      DS.stage(g, P);
      if (o.under) { g.save(); o.under(g, t, api); g.restore(); }
      for (const ln of lanes) {
        const off = offAt(ln, t), v = Math.abs(off - offAt(ln, t - 1 / fps)), Lb = v * (EN.blur || 0);
        if (Lb < 2) { drawLane(g, ln, t, off); continue; }
        // Motion blur: average of n copies along the strip (layering each at 1/(i+1) on a transparent layer = average)
        const n = Math.min(24, Math.max(4, Math.ceil(Lb / 14))), Ly = XM.canvas('xm-wall-lane');
        for (let i = 0; i < n; i++) { Ly.g.globalAlpha = 1 / (i + 1); drawLane(Ly.g, ln, t, off - Lb / 2 + Lb * i / (n - 1)); }
        Ly.g.globalAlpha = 1; g.drawImage(Ly.c, 0, 0);
      }
      if (o.over) { g.save(); o.over(g, t, api); g.restore(); }
      if (o.hud !== false) {
        const si = curSame(t), hud = { ...(o.hud || {}) };
        if (si >= 0 && sames[si].br) hud.br = sames[si].br;
        DS.hud(g, t, P, hud);
      }
    });
    shot.cues = cues; shot.times = { at, settle: tSettle, swaps: sames.map(s => s.at) }; shot.api = api;
    return shot;
  }
  wall.EASE = EASE;
  Object.assign(XM, { wall });
})();
