// XM.wordCuts: keyword match-cut. A run of real screenshots cut fast, with the same word (or logo / avatar / number: a box is a box)
// landing on the same screen point in every page, like flipping a book in front of the camera. Can hold on the last page, highlight
// the word, then pull back to show the whole page.
// Depends on lib.js, xk.js, xm-core.js, xm-ds.js, xm-tex.js (load them first). Canvas 2D (XM.shot), deterministic (no Math.random / Date).
// Docs: docs/components/cuts.md.
//
// Default feel (the numbers behind the defaults):
//   · a cut every 3 frames; the boxed word is aligned to the same point on every page (≤ 2 px error)
//   · with mark.fixed, a screen-fixed highlighter box (e.g. 264 × 116, multiply) that scales with the slow push
//   · slow push centred on the box: S 0.82 -> 1 (ease-out, until the last cut) -> hold -> 1.03 (slow linear creep)
//   · lens look: sharp centre, radial streak towards the edges (up to 50 px, from elliptical radius .3, power 1.6) + isotropic edge blur 5.5 px
//     + slight chromatic fringe + heavy vignette (corners darkened ~74%) + screen-fixed horizontal scanlines (period 14.8 px, 2.4%).
//     Blur / fringe / vignette / grain come from the texture layer: XM.tex.use(shot, { post: XM.wordCuts.POST });
//     the radial streak and scanlines are drawn by this component (lens option, can be turned off)
//   · exit: 4-frame white flash: white .25 / .56 / .69 / .79 + extra blur 2 / 5.5 / 7 / 10.5 px, while the push continues
//
// XM.wordCuts(o) -> { L, update, cues, times, api }
//   A frame, not content: which screenshots, which word, what rhythm, where it lands are all up to the caller. No default screenshots,
//   words or HUD text.
//   Content (required, console.error if missing):
//     pages  : [{ src, box:[x, y, w, h], … }]  ≥ 2 real screenshots. box = the word's pixel box in that image (measure it with any OCR,
//              e.g. macOS Vision; logos / avatars / numbers work too, a box is a box). Optional per page:
//              on:'light'|'dark' (light or dark page, picks the highlight blend; measured if omitted), rot (extra degrees for this page),
//              zoom (extra scale), dx, dy (shift this page's word from the align point, px), crop:[x, y, w, h] (card view shows only this
//              region), label (what this page is; shown bottom-right in the HUD after landing)
//     at     : time of the first cut (absolute s)
//     hud    : { tl, bl, br, brLand }  HUD corner text; brLand = bottom-right text after landing (not changed per cut, to avoid flicker)
//   Order and rhythm:
//     order  : [page index…] cut order (repeats allowed); or count: number of cuts (cycles through pages). Default: each page once
//     rhythm : frames per page. Number (default 3) | [frames…] (per page, the last value repeats) | { from, to, ease } (ramp from `from` to `to`
//              frames: from < to = fast then slow, from > to = slow then fast) | { times:[absolute s…] } (cut on voiceover words).
//              The last page holds until the shot ends
//   Alignment:
//     align  : [x, y] screen point where the word lands (default screen centre). Need not be centred: a third line leaves room for context
//     anchor : [u, v] point of the word box that is aligned (0..1, default [.5, .5] centre; use the left edge [0, .5] when the box has a fixed
//              width and words vary in length)
//     fit    : 'h' (default: scale each page so box height = size) | 'w' (box width = size: the same word in different fonts gets the same
//              width) | 'none' (keep screenshot pixel ratio × scale: best for shots from the same site at the same zoom)
//     size / scale : see fit. size defaults to 110 px (at camera S = 1). On-screen magnification of a screenshot (page scale × max camera
//              zoom) must be ≤ 1.1: > 1.25 is an error, 1.1–1.25 a warning. If it is too big, recapture at higher resolution
//              (web pages: capture.js --scale 3; PDFs: re-render at 3×) instead of upscaling
//     turn   : [start, end] (degrees) the whole run rotates slowly from start to end (monotonic, no back-and-forth); each page's rot is added. Default none
//   Layout:
//     view   : 'bleed' (default, recommended: the page fills the screen like looking at paper up close; the area outside the page is filled
//              with the page's own background colour) | 'card' (variant B: screenshots as cards on a stage, DS.stage, which the texture
//              layer can swap; cards have a faint soft shadow)
//     stack  : card view: cut cards stay underneath and pile up (default true); false = one replaces the other
//     tone   : stage 'paper' (default) | 'ink' | 'accent' (card view background; HUD and mark colours follow it)
//   Marking (highlight is always highlighter yellow, dark text on yellow, same as XM.mark.sweep; multiply on light pages, difference on dark):
//     mark   : { cuts:'sweep' (default, every page highlighted) | false (no highlight during the cuts, only after landing). Keywords are
//                always highlighted, never boxed or bracketed,
//                fixed:{ w, h, dx, dy } (instead of each page's word box, one fixed-size box at the align point: same box however long the word),
//                pad:[x, y] (padding around the word box, as a fraction of box height, default [.12, .16]) }
//   Camera:
//     zoom   : [[t, s, ease], …] (absolute s; s = camera scale, 1 = the size from fit; ease applies on arrival). Default: first cut .82 -> landing 1
//              (ease-out), then a very slow push to 1.03. Zoom centre `center` (default = align point; with a fixed box = box centre)
//     land   : after the last page (optional; omitted = no hold, no highlight, no pull-back):
//              { sweep:{ at, dur:.45 } | false (highlight the word after landing; at defaults to landing + .3 s),
//                pull:{ at, dur:1.4, ease:'inOut', fit:'page'|'pile'|number, to:[x, y], margin:[.1, .13], level:true } | false
//                (pull back to the whole: fit 'page' = the last page fully in frame, 'pile' = the whole card pile; level = straighten the last page) }
//     exit   : { kind:'flash', at, dur:4/30, white:.79, blur:10.5 } (white flash + blur out into the next shot)
//     enter  : { kind:'flash', dur:.2, white:.67, blur:24 } (clear in from white and blur, the reverse)
//     lens   : { streak:{ L:50, r0:.3, pow:1.6 } | false, scan:{ amp:.024, period:14.8 } | false } radial streak / scanlines. On by default for bleed, off for card
//   Background and overlay (for version / logo runs; omitted = default behaviour):
//     backdrop : 'page' (default: in bleed view the area outside the page uses the page colour) | 'stage' (stage colour DS.stage, for
//                transparent logos on a stage) | (g, t, P) => {} (draw your own background, e.g. a playing video frame under a logo run; screen coords)
//     over     : (g, t, { ci, page, landed, api, P }) => {}  extra layer after the page and before the HUD (screen coords), e.g. a name that changes with each logo
//   No highlight at all: mark:{ cuts:false } and no land (or land:{ sweep:false }); for logo / title-card runs with no word to mark, no error
//   Sound (returns cues; in the scene: window.SFX_CUES.push(...shot.cues)):
//     sfx    : { run:'riffle' (default, one riffle for the whole run, dur covers it) | 'filmfeed' | false, sweep:'paper' (highlight on landing) | false,
//              land:false | name, pull:false | name }
//              Individual cuts get no sound (a dozen clicks in a row is noisy); run:false for even less
//   Other: seed
//
// Photosensitivity: full-screen high-frequency flashing is a risk. Keep overall brightness steady across fast cuts: all-light screenshots are
//   safest; don't alternate dark screenshots (dark web pages, dark posts) with light ones. The component measures each cut's mean screen
//   brightness: adjacent cuts < 0.33 s apart that differ by ≥ .2 count as one flash; more than 3 in any 1 s -> console.error (the render
//   check blocks it), 1–3 -> console.warn.
(() => {
  const { W, H } = XK;
  const DS = XM.DS;
  const SC = [W / 2, H / 2];
  const RAD = Math.PI / 180;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fpsOf = () => (window.VIDEO && VIDEO.fps) || 30;
  const EASE = {
    linear: k => k, smooth: k => k * k * (3 - 2 * k),
    in: k => k * k * k, out: k => 1 - Math.pow(1 - k, 3), inOut: k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    s5: k => k * k * k * (k * (6 * k - 15) + 10),
  };
  const ez = e => (typeof e === 'function' ? e : EASE[e] || (XM.tex && XM.tex.ease ? XM.tex.ease(e) : EASE.linear));
  // Keyframes [[t, v, ease]], ease applies on arrival
  function kf(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) { const a = keys[i - 1], b = keys[i]; return lerp(a[1], b[1], ez(b[2] || 'linear')(cl((t - a[0]) / Math.max(1e-6, b[0] - a[0])))); }
    return keys[keys.length - 1][1];
  }
  // 4-frame exit flash (normalised to 1): white level and extra blur
  const FLASH = { white: [[0, 0], [.25, .32], [.5, .71], [.75, .87], [1, 1]], blur: [[0, 0], [.25, .19], [.5, .52], [.75, .67], [1, 1]] };
  const kfN = (k, keys) => kf(k, keys);

  // Recommended post settings (texture layer XM.tex.post params, see header). Usage: XM.tex.use(shot, { post: XM.wordCuts.POST })
  const POST = { edge: { px: 5.5, r0: .34, r1: 1, pow: 1.4, asp: .86 }, chroma: { k: .003 }, vig: { a: .8, r0: .45, pow: 1.35, asp: .86 }, grain: { a: .03, scale: 1.5 } };
  const LENS = { streak: { L: 50, r0: .3, pow: 1.6, ax: 960, ay: 520, n: 20 }, scan: { amp: .024, period: 14.8, phase: 10.1 } };

  // ---------- helpers ----------
  const rot2 = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
  let _probe = null;
  function probe(w, h) { if (!_probe || _probe.canvas.width !== w || _probe.canvas.height !== h) { const c = document.createElement('canvas'); c.width = w; c.height = h; _probe = c.getContext('2d', { willReadFrequently: true }); } _probe.setTransform(1, 0, 0, 1, 0, 0); _probe.clearRect(0, 0, w, h); return _probe; }
  const lumAt = (d, i) => (d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722) / 255;
  // Page background colour (fills outside the page): median of a ring of edge pixels
  function edgeColor(img) {
    const q = probe(64, 64); q.drawImage(img, 0, 0, 64, 64); const d = q.getImageData(0, 0, 64, 64).data, px = [];
    for (let i = 0; i < 64; i++) for (const [x, y] of [[i, 0], [i, 63], [0, i], [63, i]]) { const j = (y * 64 + x) * 4; px.push([d[j], d[j + 1], d[j + 2]]); }
    px.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2])); const m = px[px.length >> 1];
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  }
  // Light or dark around the word (automatic `on`)
  function pageTone(img, b) {
    const q = probe(48, 24), m = b[3] * 1.2; q.drawImage(img, b[0] - m, b[1] - m, b[2] + 2 * m, b[3] + 2 * m, 0, 0, 48, 24);
    const d = q.getImageData(0, 0, 48, 24).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += lumAt(d, i);
    return s / (d.length / 4) > .5 ? 'light' : 'dark';
  }
  // Scanlines (screen-fixed, multiplied over the frame; built once)
  let _scan = null;
  function scanLayer(S) {
    const key = S.amp + ':' + S.period + ':' + (S.phase || 0);
    if (_scan && _scan.key === key) return _scan.c;
    const c = document.createElement('canvas'); c.width = 8; c.height = H; const q = c.getContext('2d'), d = q.createImageData(8, H);
    for (let y = 0; y < H; y++) { const v = 255 * (1 - S.amp * (.5 + .5 * Math.cos(2 * Math.PI * (y + .5 - (S.phase || 0)) / S.period))); for (let x = 0; x < 8; x++) { const i = (y * 8 + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } }
    q.putImageData(d, 0, 0); _scan = { key, c }; return c;
  }
  // Radial streak: the frame is scaled up / down around (cx, cy) n times and averaged (each pixel smears symmetrically along its radius,
  // no overall shift), then masked with ramp(ρ, r0)^pow of the elliptical radius ρ = |(dx/ax, dy/ay)| so only the outer ring streaks (sharp centre)
  function streak(g, S, cx, cy) {
    const L = S.L ?? 50; if (L <= 0) return;
    const src = XM.canvas('wc-streak-src'); src.g.drawImage(g.canvas, 0, 0);
    const out = XM.canvas('wc-streak'), q = out.g, n = S.n ?? 20, amt = L / (S.ax ?? 960);
    q.imageSmoothingQuality = 'high';
    for (let j = 0; j < n; j++) { const s = 1 + amt * (j / (n - 1) - .5); q.globalAlpha = 1 / (j + 1); q.setTransform(s, 0, 0, s, cx * (1 - s), cy * (1 - s)); q.drawImage(src.c, 0, 0); }
    q.setTransform(1, 0, 0, 1, 0, 0); q.globalAlpha = 1;
    // Mask: radial gradient drawn in elliptical space (x normalised by ax, y by ay)
    q.globalCompositeOperation = 'destination-in';
    q.save(); q.setTransform(S.ax ?? 960, 0, 0, S.ay ?? 520, cx, cy);
    const gr = q.createRadialGradient(0, 0, 0, 0, 0, 1), r0 = S.r0 ?? .3, pw = S.pow ?? 1.6;
    for (let i = 0; i <= 20; i++) { const rho = i / 20, k = Math.pow(cl((rho - r0) / (1 - r0)), pw); gr.addColorStop(rho, `rgba(0,0,0,${k.toFixed(4)})`); }
    q.fillStyle = gr; q.fillRect(-4, -4, 8, 8); q.restore();
    q.globalCompositeOperation = 'source-over';
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(out.c, 0, 0); g.restore();
  }

  function wordCuts(o = {}) {
    // ---------- required ----------
    const pages = Array.isArray(o.pages) ? o.pages : [];
    if (pages.length < 2) console.error('XM.wordCuts: pages (≥ 2 real screenshots + the pixel box of the word in each) is required, set by the video\'s script; there is no default footage');
    pages.forEach((p, i) => { if (!p || !p.src || !Array.isArray(p.box) || p.box.length !== 4) console.error(`XM.wordCuts: pages[${i}] needs src and box:[x, y, w, h] (the word's pixel box in the screenshot)`); });
    if (o.at == null) console.error('XM.wordCuts: at (absolute time of the first cut) is required, set it from the voice-over');
    if (!o.hud) console.error('XM.wordCuts: hud text (tl shot number / bl chapter / br what is shown) is required; there are no default words');
    const at = o.at ?? 0, fps = fpsOf();
    const view = o.view || 'bleed', P = { ...DS.tone(o.tone || 'paper') };
    const fit = o.fit || 'h', size = o.size ?? 110, anchor = o.anchor || [.5, .5];
    const A = o.align || [W / 2, H / 2];
    const M = { cuts: 'sweep', pad: [.12, .16], ...(o.mark || {}) };
    if (M.cuts && M.cuts !== 'sweep') console.error(`XM.wordCuts: mark.cuts must be 'sweep' or false (keywords are always highlighted, never boxed or bracketed), got ${M.cuts}`);
    const lens = o.lens === false ? {} : { ...(view === 'bleed' ? LENS : {}), ...(o.lens || {}) };

    // ---------- order, rhythm ----------
    const order = o.order ? o.order.slice() : Array.from({ length: o.count ?? pages.length }, (_, i) => i % Math.max(1, pages.length));
    const n = order.length, R = o.rhythm ?? 3;
    let cutT;                                                                  // start time of each cut (absolute s, snapped to frames)
    if (R && R.times) cutT = R.times.slice(0, n).map(v => Math.round(v * fps) / fps);
    else {
      const fr = typeof R === 'number' ? Array(n).fill(R) : Array.isArray(R) ? Array.from({ length: n }, (_, i) => R[Math.min(i, R.length - 1)])
        : Array.from({ length: n }, (_, i) => lerp(R.from ?? 3, R.to ?? R.from ?? 3, ez(R.ease || 'linear')(n > 1 ? i / (n - 1) : 0)));
      let f = Math.round(at * fps); cutT = [];
      for (let i = 0; i < n; i++) { cutT.push(f / fps); f += Math.max(1, Math.round(fr[i])); }
    }
    const tLand = cutT[n - 1];
    const cutIdx = t => { const f = Math.round(t * fps); let i = 0; while (i + 1 < n && Math.round(cutT[i + 1] * fps) <= f) i++; return i; };
    const turn = o.turn || [0, 0];

    // ---------- per-cut geometry: page pixels -> world (origin = the word's align point, unit = screen px at camera S=1) ----------
    const G = order.map((pi, c) => {
      const p = pages[pi] || {}, b = p.box || [0, 0, 1, 1];
      const k = (fit === 'w' ? size / b[2] : fit === 'none' ? (o.scale ?? 1) : size / b[3]) * (p.zoom ?? 1);
      const rot = (lerp(turn[0], turn[1], n > 1 ? c / (n - 1) : 0) + (p.rot ?? 0)) * RAD;
      return { pi, p, b, k, rot, ax: b[0] + anchor[0] * b[2], ay: b[1] + anchor[1] * b[3], dx: p.dx ?? 0, dy: p.dy ?? 0 };
    });
    const IMG = pages.map(p => (p && p.src ? XM.image(p.src) : null));
    const INFO = pages.map(() => null);       // after load: { bg, on }
    const info = pi => { const im = IMG[pi]; if (!im || !im.ok) return null; if (!INFO[pi]) { const p = pages[pi]; INFO[pi] = { bg: edgeColor(im.img), on: p.on || pageTone(im.img, p.box) }; } return INFO[pi]; };
    const cardRect = g0 => { const im = IMG[g0.pi]; return g0.p.crop || [0, 0, im && im.ok ? im.img.naturalWidth : 4 * g0.b[2], im && im.ok ? im.img.naturalHeight : 4 * g0.b[3]]; };
    const toWorld = (g0, x, y) => { const [u, v] = rot2((x - g0.ax) * g0.k, (y - g0.ay) * g0.k, g0.rot); return [u + g0.dx, v + g0.dy]; };

    // ---------- camera ----------
    const FX = M.fixed ? { w: M.fixed.w, h: M.fixed.h, dx: M.fixed.dx ?? 0, dy: M.fixed.dy ?? 0 } : null;
    const Z = o.center || (FX ? [A[0] + FX.dx, A[1] + FX.dy] : A);           // zoom centre (screen)
    const wz = [Z[0] - A[0], Z[1] - A[1]];                                    // world point under the zoom centre
    const zoomKeys = o.zoom || [[at, .82], [tLand, 1, 'out'], [tLand + 3, 1.03, 'linear']];
    // Screenshots must be sharp: on-screen magnification of each page = page scale × max camera zoom
    {
      const zMax = Math.max(1, ...zoomKeys.map(z => z[1])), seen = new Set();
      G.forEach(g0 => {
        const m = g0.k * zMax, src = (pages[g0.pi] || {}).src; if (seen.has(g0.pi) || m <= 1.1) return; seen.add(g0.pi);
        (m > 1.25 ? console.error : console.warn)(`XM.wordCuts: ${src} is scaled up ${m.toFixed(2)}× on screen and will look blurry (keep it ≤ 1.1). ` +
          'Recapture web pages with scripts/capture.js --scale 3; re-render PDFs at 3×; if only a small image exists, reduce size or use a smaller crop instead of upscaling');
      });
    }
    const LD = o.land || null;
    const SW = LD && LD.sweep !== false ? { at: (LD.sweep && LD.sweep.at) ?? tLand + .3, dur: (LD.sweep && LD.sweep.dur) ?? .45, lead: LD.sweep && LD.sweep.lead } : null;
    const PL = LD && LD.pull ? { dur: 1.4, ease: 'inOut', fit: 'page', margin: [.1, .13], level: true, ...LD.pull } : null;
    if (PL && PL.at == null) PL.at = (SW ? SW.at + SW.dur : tLand) + .7;
    const camBase = t => { const s = kf(t, zoomKeys); return { s, r: 0, Lw: [wz[0] - (Z[0] - SC[0]) / s, wz[1] - (Z[1] - SC[1]) / s] }; };
    let PULL = null;
    function pullTarget() {
      if (PULL) return PULL;
      const gl = G[n - 1], rF = PL.level ? -gl.rot : 0, pts = [];
      for (const g0 of (PL.fit === 'pile' ? G : [gl])) { const [x, y, w, h] = cardRect(g0); for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) pts.push(rot2(...toWorld(g0, px, py), rF)); }
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      const mg = PL.margin, sF = typeof PL.fit === 'number' ? PL.fit : Math.min(W * (1 - 2 * mg[0]) / (bx1 - bx0), H * (1 - 2 * mg[1]) / (by1 - by0));
      const to = PL.to || SC, cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      const Lw = rot2(cx - (to[0] - SC[0]) / sF, cy - (to[1] - SC[1]) / sF, -rF);
      const ok = IMG[gl.pi] && IMG[gl.pi].ok;
      const r = { s: sF, r: rF, Lw }; if (ok) PULL = r; return r;
    }
    function cam(t) {
      if (!PL || t <= PL.at) return camBase(t);
      const a = camBase(PL.at), b = pullTarget(), e = ez(PL.ease)(cl((t - PL.at) / PL.dur));
      return { s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), e)), r: lerp(a.r, b.r, e), Lw: [lerp(a.Lw[0], b.Lw[0], e), lerp(a.Lw[1], b.Lw[1], e)] };
    }
    const setCam = (g, C) => { g.setTransform(1, 0, 0, 1, 0, 0); g.translate(SC[0], SC[1]); g.rotate(C.r); g.scale(C.s, C.s); g.translate(-C.Lw[0], -C.Lw[1]); };
    const setPage = (g, C, g0) => { setCam(g, C); g.translate(g0.dx, g0.dy); g.rotate(g0.rot); g.scale(g0.k, g0.k); g.translate(-g0.ax, -g0.ay); };

    // ---------- draw one cut's page(s) (no marks, no lens) ----------
    function drawCard(g, C, c, shadow) {
      const g0 = G[c], im = IMG[g0.pi]; if (!im || !im.ok) return;
      const [x, y, w, h] = cardRect(g0);
      setPage(g, C, g0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      if (shadow) { g.save(); g.shadowColor = `rgba(0,0,0,${(o.card && o.card.shadow) ?? .3})`; g.shadowBlur = 38; g.shadowOffsetY = 12; g.fillStyle = info(g0.pi).bg; g.fillRect(x, y, w, h); g.restore(); }
      g.drawImage(im.img, x, y, w, h, x, y, w, h);
    }
    const BK = o.backdrop || 'page';
    function drawPages(g, C, ci, t) {
      if (view === 'bleed') {
        const g0 = G[ci], I = info(g0.pi);
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
        if (typeof BK === 'function') { g.fillStyle = P.bg; g.fillRect(0, 0, W, H); BK(g, t, P); }
        else if (BK === 'stage') DS.stage(g, P);
        else { g.fillStyle = I ? I.bg : P.bg; g.fillRect(0, 0, W, H); }
        g.restore();
        g.save(); drawCard(g, C, ci, false); g.restore();
        return;
      }
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); DS.stage(g, P); g.restore();
      const from = o.stack === false ? ci : Math.max(0, ci - (o.stackMax ?? 30));
      for (let c = from; c <= ci; c++) { g.save(); drawCard(g, C, c, true); g.restore(); }
    }
    const padBox = (b, pad) => [b[0] - pad[0] * b[3], b[1] - pad[1] * b[3], b[2] + 2 * pad[0] * b[3], b[3] + 2 * pad[1] * b[3]];

    // ---------- photosensitivity self-check: mean screen brightness of each cut at S=1; adjacent cuts differing ≥ .2 less than .33 s apart = one flash ----------
    let checked = false;
    function flashCheck() {
      if (checked || !IMG.every(im => !im || im.ok)) return; checked = true;
      const q = probe(192, 108), Lm = [];
      for (let c = 0; c < n; c++) {
        q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, 192, 108);
        const C = camBase(cutT[c]); q.save(); q.scale(.1, .1);
        const set0 = q.setTransform.bind(q); q.setTransform = (a, b, cc, d, e, f) => set0(a * .1, b * .1, cc * .1, d * .1, e * .1, f * .1);
        try { drawPages(q, C, c, cutT[c]); } finally { q.setTransform = set0; }
        q.restore();
        const d = q.getImageData(0, 0, 192, 108).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += lumAt(d, i); Lm.push(s / (d.length / 4));
      }
      const fl = []; for (let c = 1; c < n; c++) if (Math.abs(Lm[c] - Lm[c - 1]) >= .2 && cutT[c] - cutT[c - 1] < .33) fl.push(cutT[c]);
      let worst = 0; for (const t0 of fl) worst = Math.max(worst, fl.filter(t1 => t1 >= t0 && t1 < t0 + 1).length);
      const msg = `XM.wordCuts: the rapid cuts have ${fl.length} full-screen brightness jumps (mean brightness change ≥ .2 between cuts), up to ${worst} within 1 s. Photosensitivity risk: don't alternate dark and light screenshots in rapid cuts; use one kind of background or slow down`;
      if (worst > 3) console.error(msg); else if (worst > 0) console.warn(msg);
      api.lum = Lm;
    }

    // ---------- sound ----------
    const SF = o.sfx || {}, cues = [];
    const cue = (t, name, x = {}) => { if (name && isFinite(t)) cues.push({ t: +t.toFixed(3), name, ...x }); };
    const runName = SF.run === false ? null : SF.run || DS.SFX.pile;
    if (n > 1) cue(cutT[0], runName, { dur: +(tLand - cutT[0] + 1 / fps).toFixed(3), ...(SF.runGain != null ? { gain: SF.runGain } : {}) });
    if (SF.land) cue(tLand, SF.land);
    if (SW && SF.sweep !== false) cue(SW.at, SF.sweep || DS.SFX.sweep);
    if (PL && SF.pull) cue(PL.at, SF.pull);

    const EX = o.exit && o.exit.kind === 'flash' ? { dur: 4 / fps, white: .79, blur: 10.5, ...o.exit } : null;
    const EN = o.enter && o.enter.kind === 'flash' ? { dur: .2, white: .67, blur: 24, ...o.enter } : null;
    const api = { cutT, tLand, cutIdx, cam, sweep: SW, pull: PL, lum: null };

    const shot = XM.shot({ bg: P.bg, stage: 'flat', cam: o.cam }, () => (g, t) => {
      flashCheck();
      const ci = cutIdx(t), C = cam(t), g0 = G[ci];
      drawPages(g, C, ci, t);
      // ---- marks ----
      const landed = ci === n - 1 && t >= tLand;
      const I = info(g0.pi), on = I ? I.on : 'light';
      if (M.cuts === 'sweep' && !(landed && SW)) {
        g.save();
        if (FX) { setCam(g, C); DS && XM.mark.sweep(g, FX.dx - FX.w / 2, FX.dy - FX.h / 2, FX.w, FX.h, P, 1, { on }); }
        else { setPage(g, C, g0); const b = padBox(g0.b, M.pad); XM.mark.sweep(g, b[0], b[1], b[2], b[3], P, 1, { on }); }
        g.restore();
      }
      if (landed && SW) {
        const k = cl((t - SW.at) / SW.dur), kE = 1 - Math.pow(1 - k, 2);
        g.save(); setPage(g, C, g0); const b = padBox(g0.b, M.pad);
        if (SW.lead) XM.mark.lead(g, b[0], b[1], b[2], b[3], P, cl((t - SW.at + .3) / .3), kE);
        XM.mark.sweep(g, b[0], b[1], b[2], b[3], P, kE, { on }); g.restore();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (typeof o.over === 'function') { g.save(); o.over(g, t, { ci, page: g0.pi, landed, api, P }); g.restore(); g.setTransform(1, 0, 0, 1, 0, 0); }
      // ---- lens (this component's own: radial streak, scanlines; blur / fringe / vignette / grain are done by the texture layer before DS.hud) ----
      const Cz = [SC[0] + C.s * (wz[0] - C.Lw[0]), SC[1] + C.s * (wz[1] - C.Lw[1])];
      if (lens.streak) streak(g, lens.streak, Cz[0], Cz[1]);
      // ---- enter / exit: white flash + overall blur ----
      let white = 0, blur = 0;
      if (EX && t >= EX.at) { const k = cl((t - EX.at + 1 / fps) / EX.dur); white = EX.white * kfN(k, FLASH.white); blur = EX.blur * kfN(k, FLASH.blur); }
      if (EN && t < at + EN.dur) { const k = 1 - cl((t - at) / EN.dur); white = Math.max(white, EN.white * kfN(k, FLASH.white)); blur = Math.max(blur, EN.blur * kfN(k, FLASH.blur)); }
      if (blur > .3) { const S = XM.canvas('wc-blur-src'); S.g.drawImage(g.canvas, 0, 0); XM.tex.blurClamp(g, S.c, blur); }
      if (white > 0) { g.save(); g.globalAlpha = white; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.restore(); }
      if (lens.scan) { g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(scanLayer(lens.scan), 0, 0, W, H); g.restore(); }
      // ---- HUD (DS.hud applies the texture layer's post first) ----
      const hud = { ...(o.hud || {}) }; if (hud.brLand && landed) hud.br = hud.brLand; delete hud.brLand;
      if (o.hud !== false) DS.hud(g, t, P, hud);
    });
    shot.cues = cues; shot.times = { cuts: cutT, land: tLand, sweep: SW && SW.at, pull: PL && PL.at, pullEnd: PL && PL.at + PL.dur }; shot.api = api;
    return shot;
  }
  wordCuts.POST = POST; wordCuts.LENS = LENS;
  Object.assign(XM, { wordCuts });
})();
