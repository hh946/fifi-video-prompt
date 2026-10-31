// XM.KIT: small shared drawing pieces used by xm-lens.js / xm-notify.js and others: a cached offscreen canvas,
// a full-screen line-art doodle backdrop, app icons, single line-art motifs and solid icons. The pieces provide shape
// and technique only; what to draw is always chosen by the caller.
// Load after xk.js, xm-core.js and xm-ds.js. Deterministic: randomness comes only from XM.rng.
//
//   XM.KIT.cached(key, w, h, draw)            -> offscreen canvas drawn once (draw(g)). Include anything that changes the image (colour, size) in key
//   XM.KIT.doodle(g, o)                       -> full-screen line-art backdrop (seamless on all edges + 4 px dot screen). The caller picks the content:
//        o = { motifs:[names from XM.KIT.MOTIFS...] or draw(g, W, H) (your own white line art, cached by key), small:[small marks] (neutral default, [] for none),
//              ink:'#hex', bg, alpha, scale, ox, oy, dots:true, seed }; with neither motifs nor draw it logs console.error
//   XM.KIT.appIcon(g, x, y, s, o)             -> app icon: rounded square + notification badge top-right (with a transparent gap). Centre (x, y), side s
//        o = { col (square), badge (badge colour; false = none; default col), rot (radians), glyph:'motif name' (knocked-out icon inside), outline:{col,w} (outline only) }
//   XM.KIT.motif(g, name, x, y, r, o)         -> one line-art motif of radius r. o = { col, lw, rot, mode:'line'|'fill'|'solid', seed }
//   XM.KIT.MOTIFS                             -> list of available motif names
//   XM.KIT.icon(g, kind, x, y, s, o)          -> one solid small object (e.g. the thing that travels through a shot). kind: 'app' (rounded square + badge) | 'arrow' (solid fat arrow, pointing right) | 'cursor' (solid mouse pointer) |
//                                               any motif name (solid version) | a draw function (g, x, y, s, o) => {}
//        o = { col, badge, rot, flip }
(() => {
  const { W, H } = XK;
  const TAU = Math.PI * 2;

  const CACHE = new Map();
  function cached(key, w, h, draw) {
    let c = CACHE.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = w; c.height = h; c.__key = key;
    draw(c.getContext('2d'));
    if (!document.fonts || document.fonts.status === 'loaded') CACHE.set(key, c);      // do not cache before fonts finish loading (a preview page may draw one frame early)
    return c;
  }

  // ---------- Line-art motifs (unit box about -1..1; each stroke { p points, c closed, f filled, s smoothed, w line-width multiplier }) ----------
  const arcPts = (cx, cy, r, a0, a1, n = 12, ry = r) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * ry]; });
  const ring = (cx, cy, r, n = 16, ry = r) => arcPts(cx, cy, r, 0, TAU * (n - 1) / n, n - 1, ry);
  const MOTIFS = {
    wifi: () => [{ p: arcPts(0, .7, 1.25, -2.42, -.72), s: 1 }, { p: arcPts(0, .7, .85, -2.42, -.72), s: 1 }, { p: arcPts(0, .7, .45, -2.42, -.72, 8), s: 1 }, { p: ring(0, .62, .13, 8), c: 1, f: 1, s: 1 }],
    cursor: () => [{ p: [[-.55, -.95], [-.55, .62], [-.16, .3], [.12, .95], [.42, .82], [.14, .2], [.62, .2]], c: 1, f: .5 }],
    bubble: () => [{ p: [[-.95, -.7], [.95, -.7], [.95, .35], [-.1, .35], [-.55, .9], [-.5, .35], [-.95, .35]], c: 1 }, { p: ring(-.45, -.18, .1, 6), c: 1, f: 1 }, { p: ring(0, -.18, .1, 6), c: 1, f: 1 }, { p: ring(.45, -.18, .1, 6), c: 1, f: 1 }],
    clock: () => [{ p: ring(0, 0, .95, 18), c: 1, s: 1 }, { p: [[0, -.6], [0, 0], [.42, .26]] }, { p: [[0, -.95], [0, -.78]], w: .7 }, { p: [[.95, 0], [.78, 0]], w: .7 }, { p: [[0, .95], [0, .78]], w: .7 }, { p: [[-.95, 0], [-.78, 0]], w: .7 }],
    cup: () => [{ p: [[-.7, -.25], [.5, -.25], [.38, .9], [-.58, .9]], c: 1 }, { p: arcPts(.5, .2, .38, -1.35, 1.35, 8), s: 1 }, { p: [[-.38, -.5], [-.25, -.72], [-.4, -.95]], s: 1, w: .7 }, { p: [[-.02, -.5], [.12, -.74], [-.04, -1]], s: 1, w: .7 }, { p: [[.3, -.5], [.43, -.7], [.3, -.92]], s: 1, w: .7 }],
    battery: () => [{ p: [[-.95, -.45], [.75, -.45], [.75, .45], [-.95, .45]], c: 1 }, { p: [[.75, -.18], [.98, -.18], [.98, .18], [.75, .18]] }, { p: [[-.72, -.24], [-.38, -.24], [-.38, .24], [-.72, .24]], c: 1, f: 1 }],
    zzz: () => [{ p: [[-.95, .2], [-.4, .2], [-.95, .9], [-.4, .9]] }, { p: [[-.25, -.35], [.2, -.35], [-.25, .2], [.2, .2]], w: .85 }, { p: [[.35, -.95], [.75, -.95], [.35, -.5], [.75, -.5]], w: .7 }],
    plane: () => [{ p: [[-1, -.1], [1, -.75], [.25, .85], [-.05, .2]], c: 1 }, { p: [[-.05, .2], [1, -.75]] }, { p: [[-.05, .2], [-.12, .7], [.12, .42]] }],
    at: () => [{ p: arcPts(0, 0, .34, .3, TAU + .3, 12), s: 1 }, { p: [[.34, -.3], [.34, .22], [.5, .4], [.74, .3]], s: 1 }, { p: arcPts(0, 0, .92, .35, TAU - .75, 18), s: 1 }],
    hourglass: () => [{ p: [[-.6, -.9], [.6, -.9], [.06, 0], [.6, .9], [-.6, .9], [-.06, 0]], c: 1 }, { p: [[-.78, -.92], [.78, -.92]], w: 1.2 }, { p: [[-.78, .92], [.78, .92]], w: 1.2 }, { p: [[-.3, .88], [0, .45], [.3, .88]], c: 1, f: 1 }],
    face: () => [{ p: ring(0, 0, .95, 18), c: 1, s: 1 }, { p: [[-.45, -.25], [-.2, -.25]], w: 1.1 }, { p: [[.2, -.25], [.45, -.25]], w: 1.1 }, { p: [[-.35, .35], [.35, .35]] }],
    smile: () => [{ p: ring(0, 0, .95, 18), c: 1, s: 1 }, { p: ring(-.33, -.25, .1, 6), c: 1, f: 1 }, { p: ring(.33, -.25, .1, 6), c: 1, f: 1 }, { p: arcPts(0, .1, .48, .3, Math.PI - .3, 8), s: 1 }],
    bolt: () => [{ p: [[.2, -1], [-.6, .12], [-.08, .12], [-.3, 1], [.6, -.2], [.06, -.2]], c: 1, f: .6 }],
    star: () => [{ p: Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * TAU / 10, r = i % 2 ? .42 : 1; return [Math.cos(a) * r, Math.sin(a) * r]; }), c: 1, f: .5 }],
    mail: () => [{ p: [[-.95, -.6], [.95, -.6], [.95, .6], [-.95, .6]], c: 1 }, { p: [[-.95, -.6], [0, .12], [.95, -.6]] }],
    bell: () => [{ p: [[-.75, .55], [-.5, .2], [-.48, -.3], [-.2, -.72], [.2, -.72], [.48, -.3], [.5, .2], [.75, .55]], c: 1, s: 1 }, { p: arcPts(0, .62, .2, 0, Math.PI, 6), s: 1 }, { p: ring(.55, -.7, .2, 8), c: 1, f: 1 }],
    power: () => [{ p: arcPts(0, .08, .85, -1.05, Math.PI + 1.05, 16), s: 1 }, { p: [[0, -.98], [0, -.1]], w: 1.15 }],
    cloud: () => [{ p: [[-.9, .45], [-.95, .05], [-.6, -.2], [-.45, -.6], [.05, -.7], [.35, -.35], [.8, -.25], [.95, .15], [.75, .45]], c: 1, s: 1 }],
    search: () => [{ p: ring(-.2, -.2, .62, 14), c: 1, s: 1 }, { p: [[.25, .25], [.9, .9]], w: 1.3 }],
    pin: () => [{ p: [[0, .98], [-.6, -.1], [-.55, -.6], [0, -.95], [.55, -.6], [.6, -.1]], c: 1, s: 1 }, { p: ring(0, -.35, .2, 8), c: 1, f: 1 }],
    check: () => [{ p: [[-.8, -.8], [.8, -.8], [.8, .8], [-.8, .8]], c: 1 }, { p: [[-.45, 0], [-.1, .4], [.5, -.4]], w: 1.2 }],
    hash: () => [{ p: [[-.4, -.9], [-.6, .9]] }, { p: [[.5, -.9], [.3, .9]] }, { p: [[-.9, -.3], [.9, -.3]] }, { p: [[-.95, .35], [.85, .35]] }],
    loading: () => Array.from({ length: 8 }, (_, i) => { const a = i * TAU / 8; return { p: [[Math.cos(a) * .5, Math.sin(a) * .5], [Math.cos(a) * .95, Math.sin(a) * .95]], w: .5 + i * .1 }; }),
    moon: () => [{ p: [...arcPts(0, 0, .9, -1.9, 1.9, 12), ...arcPts(.42, 0, .72, 1.45, -1.45, 10)], c: 1, s: 1, f: .5 }],
    cross: () => [{ p: [[-.8, -.8], [.8, .8]] }, { p: [[.8, -.8], [-.8, .8]] }],
    plus: () => [{ p: [[-.9, 0], [.9, 0]] }, { p: [[0, -.9], [0, .9]] }],
    zig: () => [{ p: [[-1, .3], [-.6, -.4], [-.2, .3], [.2, -.4], [.6, .3], [1, -.4]] }],
    arrow: () => [{ p: [[-.95, .5], [-.3, .1], [.2, -.1], [.8, -.5]], s: 1 }, { p: [[.3, -.62], [.85, -.52], [.62, -.02]] }],
    spiral: () => [{ p: Array.from({ length: 22 }, (_, i) => { const a = i * .62, r = .12 + i * .04; return [Math.cos(a) * r, Math.sin(a) * r]; }), s: 1 }],
    dots: () => [-.7, 0, .7].map(x => ({ p: ring(x, 0, .2, 6), c: 1, f: 1 })),
    wave: () => [{ p: [[-1, 0], [-.66, -.4], [-.33, 0], [0, .4], [.33, 0], [.66, -.4], [1, 0]], s: 1 }],
    tri: () => [{ p: [[0, -.85], [.8, .65], [-.8, .65]], c: 1 }],
  };

  function tracePts(g, pts, closed, smooth) {
    g.beginPath();
    if (!smooth || pts.length < 3) { pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if (closed) g.closePath(); return; }
    const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (closed) {
      const m0 = mid(pts[n - 1], pts[0]); g.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
      g.closePath();
    } else {
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) { const m = mid(pts[i], pts[i + 1]); g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
      g.lineTo(pts[n - 1][0], pts[n - 1][1]);
    }
  }
  // Draws white on a transparent layer (the caller tints it with source-in). mode: 'line' outline | 'fill' largest closed shape filled, details knocked out | 'solid' knocked-out lines on a solid blob
  function drawMotifWhite(g, name, cx, cy, size, rot, lw, mode, r) {
    const strokes = MOTIFS[name](), j = 0.045;
    const xf = p => { const x = p[0] + (r() - .5) * j, y = p[1] + (r() - .5) * j, c = Math.cos(rot), s = Math.sin(rot); return [cx + (x * c - y * s) * size, cy + (x * s + y * c) * size]; };
    const prims = strokes.map(s => ({ ...s, q: s.p.map(xf) }));
    g.lineCap = 'round'; g.lineJoin = 'round';
    const pass = (op, grow, fillAll) => {
      g.globalCompositeOperation = op;
      for (const s of prims) {
        tracePts(g, s.q, s.c, s.s);
        if (s.c && (fillAll || s.f === 1 || (s.f && mode !== 'solid'))) g.fill();
        g.lineWidth = lw * (s.w || 1) + grow; g.stroke();
      }
    };
    g.fillStyle = g.strokeStyle = '#fff';
    if (mode === 'solid') {
      const blob = ring(0, 0, 1.22, 11).map(p => { const k = .82 + r() * .36; return [cx + p[0] * k * size, cy + p[1] * k * size]; });
      g.globalCompositeOperation = 'destination-out'; tracePts(g, blob, true, true); g.lineWidth = lw * 2.4; g.stroke(); g.fill();
      g.globalCompositeOperation = 'source-over'; tracePts(g, blob, true, true); g.fill();
      pass('destination-out', lw * .25, false);
    } else if (mode === 'fill') {
      const closed = prims.filter(s => s.c), open = prims.filter(s => !s.c);
      g.globalCompositeOperation = 'destination-out'; for (const s of closed) { tracePts(g, s.q, true, s.s); g.lineWidth = lw * 3; g.stroke(); }
      g.globalCompositeOperation = 'source-over'; let first = true;
      for (const s of closed) {
        tracePts(g, s.q, true, s.s);
        if (first) { g.fill(); g.lineWidth = lw; g.stroke(); first = false; } else { g.globalCompositeOperation = 'destination-out'; g.fill(); g.globalCompositeOperation = 'source-over'; }
      }
      for (const s of open) { g.globalCompositeOperation = first ? 'source-over' : 'destination-out'; tracePts(g, s.q, false, s.s); g.lineWidth = lw * (s.w || 1) * .8; g.stroke(); }
    } else {
      pass('destination-out', lw * 2.2, true);
      pass('source-over', 0, false);
      if (r() < .5) {
        g.globalCompositeOperation = 'source-over';
        for (const s of prims) { tracePts(g, s.q.map(p => [p[0] + (r() - .5) * lw * .9, p[1] + (r() - .5) * lw * .9]), s.c, s.s); g.lineWidth = lw * .35; g.stroke(); }
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ---------- Doodle backdrop ----------
  // The component is only the framework; the caller chooses the content to fit the video.
  //   motifs: line-art icons for the large and medium layers (from XM.KIT.MOTIFS); small: small scattered marks (a few neutral ones by default, [] for none);
  //   draw(g, W, H): draw your own full white line-art sheet on transparent instead of motifs (key = cache key). Neither -> console.error, which fails the render check
  const NEUTRAL_SMALL = ['cross', 'plus', 'zig', 'dots', 'wave', 'tri'];
  function doodleAlpha(o) {
    const dots = o.dots !== false, motifs = (o.motifs || []).filter(m => MOTIFS[m]), small = (o.small || NEUTRAL_SMALL).filter(m => MOTIFS[m]), seed = o.seed ?? 20261013;
    const key = 'kit:doodle:alpha:' + (dots ? 1 : 0) + ':' + seed + ':' + (o.draw ? 'draw:' + (o.key || 'custom') : motifs.join(',') + '|' + small.join(','));
    return cached(key, W, H, g => {
      if (o.draw) { g.save(); o.draw(g, W, H); g.restore(); }
      else {
        const r = XM.rng(seed), U = W / 1920;
        const place = (name, cx, cy, size, rot, lw, mode) => {
          for (const ox of [0, -W, W]) for (const oy of [0, -H, H]) {        // repeat near-edge motifs on the opposite side so all four edges tile seamlessly
            const x = cx + ox, y = cy + oy, m = size * 1.5;
            if (x < -m || x > W + m || y < -m || y > H + m) continue;
            drawMotifWhite(g, name, x, y, size, rot, lw, mode, XM.rng(Math.floor(cx * 7 + cy * 13 + size)));
          }
        };
        const grid = (cols, rows, fn) => { const cw = W / cols, ch = H / rows; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) fn((i + .5 + (r() - .5) * .8) * cw, (j + .5 + (r() - .5) * .8) * ch, i + j * cols); };
        let k = Math.floor(r() * motifs.length);
        if (motifs.length) {
          grid(6, 3, (x, y, i) => place(motifs[(k += 5) % motifs.length], x, y, (150 + r() * 110) * U, (r() - .5) * .9, (10 + r() * 5) * U, i % 9 === 4 ? 'solid' : i % 5 === 0 ? 'fill' : 'line'));
          grid(9, 5, (x, y) => place(motifs[(k += 7) % motifs.length], x, y, (58 + r() * 60) * U, (r() - .5) * 1.1, (5.5 + r() * 3.5) * U, r() < .07 ? 'solid' : r() < .24 ? 'fill' : 'line'));
        }
        if (small.length) grid(16, 9, (x, y) => { if (r() < .8) place(small[Math.floor(r() * small.length)], x, y, (16 + r() * 26) * U, r() * TAU, (2.6 + r() * 2.2) * U, 'line'); });
      }
      if (dots) {        // 4 px dot screen: keep ink only on the dots (halftone texture)
        const dot = document.createElement('canvas'); dot.width = dot.height = 4;
        const dg = dot.getContext('2d'); dg.fillStyle = '#fff'; dg.beginPath(); dg.arc(2, 2, 1.5, 0, TAU); dg.fill();
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-in'; g.fillStyle = g.createPattern(dot, 'repeat'); g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
      }
    });
  }
  function doodle(g, o = {}) {
    if (!o.draw && !(o.motifs && o.motifs.length)) { console.error('XM.KIT.doodle: choose the backdrop content for your video: pass motifs:[names from XM.KIT.MOTIFS...] or draw(g, W, H); if you want no backdrop, do not call it'); return; }
    const ink = o.ink || '#ffffff', sc = o.scale ?? 1, A = doodleAlpha(o);
    const tile = cached('kit:doodle:tint:' + ink + ':' + A.__key, W, H, q => { q.drawImage(A, 0, 0); q.globalCompositeOperation = 'source-in'; q.fillStyle = ink; q.fillRect(0, 0, W, H); });
    g.save();
    if (o.bg) { g.fillStyle = o.bg; g.fillRect(-200, -200, W + 400, H + 400); }
    g.globalAlpha *= o.alpha ?? 1;
    if (sc === 1 && !o.ox && !o.oy) g.drawImage(tile, 0, 0);
    else { const pat = g.createPattern(tile, 'repeat'); pat.setTransform(new DOMMatrix().translate(o.ox || 0, o.oy || 0).scale(sc)); g.fillStyle = pat; g.fillRect(-200, -200, W + 400, H + 400); }
    g.restore();
  }

  // ---------- Single line-art motif ----------
  function motif(g, name, x, y, r, o = {}) {
    if (!MOTIFS[name]) return;
    const lw = o.lw ?? Math.max(2, r * .12), pad = Math.ceil(r * 1.6 + lw * 3), sz = pad * 2;
    const L = XM.canvas('kit-motif', sz, sz);
    drawMotifWhite(L.g, name, pad, pad, r, o.rot || 0, lw, o.mode || 'line', XM.rng(o.seed ?? 7));
    L.g.globalCompositeOperation = 'source-in'; L.g.fillStyle = o.col || '#fff'; L.g.fillRect(0, 0, sz, sz); L.g.globalCompositeOperation = 'source-over';
    g.drawImage(L.c, x - pad, y - pad);
  }

  // ---------- App icon (rounded square + badge) ----------
  const HEAD = { r: .28, badge: .34, gap: .06, in: .07 };
  function appIcon(g, x, y, s, o = {}) {
    const col = o.col || '#fff', badge = o.badge === undefined ? col : o.badge, rot = o.rot || 0;
    const pad = Math.ceil(s * .9), sz = pad * 2, L = XM.canvas('kit-app', sz, sz), q = L.g;
    q.save(); q.translate(pad, pad); q.scale(s, s);
    const sq = new Path2D(); sq.roundRect(-.5, -.5, 1, 1, HEAD.r);
    const bx = .5 - HEAD.in, by = -.5 + HEAD.in, br = HEAD.badge / 2;
    q.fillStyle = col;
    if (badge !== false) { const cut = new Path2D(); cut.rect(-4, -4, 8, 8); cut.arc(bx, by, br + HEAD.gap, 0, TAU, true); q.save(); q.clip(cut, 'evenodd'); q.fill(sq); q.restore(); }
    else q.fill(sq);
    q.restore();
    if (o.glyph) { const c2 = o.glyphCol; if (c2) motif(q, o.glyph, pad, pad + s * .02, s * .3, { col: c2, lw: Math.max(2, s * .055) }); else { q.globalCompositeOperation = 'destination-out'; motif(q, o.glyph, pad, pad + s * .02, s * .3, { col: '#000', lw: Math.max(2, s * .055) }); q.globalCompositeOperation = 'source-over'; } }
    if (badge !== false) { q.save(); q.translate(pad, pad); q.scale(s, s); q.fillStyle = badge; q.beginPath(); q.arc(bx, by, br, 0, TAU); q.fill(); q.restore(); }
    if (o.outline) {     // outline only: solid minus an inset copy
      const w = o.outline.w || 4; q.globalCompositeOperation = 'destination-out'; q.save(); q.translate(pad, pad); q.scale(s, s);
      const k = 1 - 2 * w / s; const sq2 = new Path2D(); sq2.roundRect(-.5 * k, -.5 * k, k, k, Math.max(.01, HEAD.r - w / s)); q.fill(sq2);
      if (badge !== false) { q.beginPath(); q.arc(bx, by, Math.max(.01, br - w / s), 0, TAU); q.fill(); }
      q.restore(); q.globalCompositeOperation = 'source-in'; q.fillStyle = o.outline.col || col; q.fillRect(0, 0, sz, sz); q.globalCompositeOperation = 'source-over';
    }
    g.save(); g.translate(x, y); g.rotate(rot); g.drawImage(L.c, -pad, -pad); g.restore();
  }

  // ---------- Solid small object (kind chosen by the caller) ----------
  function icon(g, kind, x, y, s, o = {}) {
    if (typeof kind === 'function') { kind(g, x, y, s, o); return; }      // caller draws it: kind(g, centreX, centreY, size, { col, rot, flip, badge })
    if (!kind) { console.error('XM.KIT.icon: kind is required: app / arrow / cursor / a name from XM.KIT.MOTIFS, or a draw function'); return; }
    const col = o.col || '#fff';
    g.save(); g.translate(x, y); g.rotate(o.rot || 0); if (o.flip) g.scale(-1, 1);
    if (kind === 'app') { g.restore(); appIcon(g, x, y, s, { ...o, rot: (o.rot || 0) * (o.flip ? -1 : 1) }); return; }
    g.fillStyle = col;
    if (kind === 'arrow') {          // solid fat arrow (pointing right), total length s
      const h = s * .62, t = h * .42, hl = s * .46;
      g.beginPath(); g.moveTo(-s / 2, -t / 2); g.lineTo(s / 2 - hl, -t / 2); g.lineTo(s / 2 - hl, -h / 2); g.lineTo(s / 2, 0); g.lineTo(s / 2 - hl, h / 2); g.lineTo(s / 2 - hl, t / 2); g.lineTo(-s / 2, t / 2); g.closePath(); g.fill();
    } else if (kind === 'cursor') {  // solid mouse pointer, height s
      const k = s / 2; g.beginPath(); [[-.55, -.95], [-.55, .62], [-.16, .3], [.12, .95], [.42, .82], [.14, .2], [.62, .2]].forEach(([a, b], i) => i ? g.lineTo(a * k, b * k) : g.moveTo(a * k, b * k)); g.closePath(); g.fill();
    } else { g.restore(); motif(g, kind, x, y, s / 2, { col, mode: 'fill', lw: Math.max(3, s * .07), rot: o.rot || 0 }); return; }
    g.restore();
  }

  XM.KIT = { cached, doodle, appIcon, motif, icon, tracePts, MOTIFS: Object.keys(MOTIFS) };
})();
