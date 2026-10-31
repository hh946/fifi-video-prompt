// XK: the explainer runtime. Theme colours, shot layers, camera, CSS 3D cards, sequenced playback with transitions,
// canvas transitions (registered via XK.fx), a photosensitivity check, and post-font-load preparation.
// Rules (see SKILL.md): build every node in scene.js (anything that needs loaded fonts, like measuring text, goes in
// XK.later and runs before the first render); render(t) only changes attributes; no Math.random / Date / CSS
// animation / transition. All times are absolute seconds taken from T in timeline.js.
// API: XK.theme(base, over), XK.tone(base, fn), XK.col(c), XK.layer(o), XK.card(L, o), XK.camKf / poseKf,
//      XK.text, XK.fmtNum, XK.later, XK.prepare, XK.seq(items), XK.play(t), XK.fx(name, def), XK.fxCues(), XK.luma().
// Depends on lib.js: el / setA / show / hash / clamp / lerp / prog / easeOut / easeIn / easeInOut / backOut / pulse / kf.
const XK = (() => {
  const W = 1920, H = 1080, NS = 'http://www.w3.org/2000/svg';

  // ---------- Theme: three base palettes + a per-video accent colour ----------
  // Take the accent from the topic (a product / company / subject colour); use it only for highlights, tags, connectors and key numbers.
  const PRESETS = {
    night: { bg: '#121317', bg2: '#1a1c22', card: '#1f2128', card2: '#2a2d36', line: '#3b3f4a', text: '#f3f1ec', mute: '#8b909b', warn: '#ff4a3d', ok: '#35d07f', dark: true },
    paper: { bg: '#eee8de', bg2: '#e4ddd0', card: '#fbf8f2', card2: '#ece6da', line: '#cdc4b4', text: '#1c1a17', mute: '#7a7468', warn: '#e0392c', ok: '#1d9a52', dark: false },
    lab:   { bg: '#f3f4f6', bg2: '#e9ebef', card: '#ffffff', card2: '#eef0f4', line: '#d5d8df', text: '#101217', mute: '#7f848e', warn: '#ff3b30', ok: '#1fb058', dark: false },
  };
  const TH = { ...PRESETS.night, accent: '#4d8dff', accent2: '#ffd23f', accentInk: '#ffffff' };
  function theme(base = 'night', over = {}) { Object.assign(TH, PRESETS[base] || {}, over); return TH; }
  const col = c => (c && TH[c]) || (c && PRESETS[c] && PRESETS[c].bg) || c;   // 'accent' / 'warn' / 'paper' (palette name) / '#hex' all work
  // Build one shot on a different base palette (alternate dark / light stages): XK.tone('paper', () => XS.phones({...})).
  // The accent stays. Colours are resolved at build time, so restoring the theme afterwards does not affect the shot.
  function tone(base, fn) { const saved = { ...TH }; Object.assign(TH, PRESETS[base]); try { return fn(); } finally { for (const k in TH) delete TH[k]; Object.assign(TH, saved); } }

  // ---------- Stage ----------
  let stage, wipe, wipeTxt;
  const layers = [];
  function init() {
    stage = document.getElementById('xk-stage');
    stage.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;background:${TH.bg};perspective:2200px;`;
    wipe = document.createElement('div');
    wipe.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;display:none;z-index:50;`;
    stage.appendChild(wipe);
  }

  // One shot = a layer div (transitions transform it) > cam (camera transforms it) > [background div, back SVG, cards layer, front SVG]
  function layer(o = {}) {
    if (!stage) init();
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;display:none;transform-origin:50% 50%;`;
    const cam = document.createElement('div');
    cam.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;`;   // no preserve-3d here: card 3D is computed only inside the cards layer, otherwise tilted cards would slip behind the background plane
    const fill = document.createElement('div');
    fill.style.cssText = `position:absolute;left:-${W}px;top:-${H}px;width:${W * 3}px;height:${H * 3}px;background:${stageBg(o)};`;
    const back = mkSvg(W, H), cards = document.createElement('div'), front = mkSvg(W, H);
    cards.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-style:preserve-3d;perspective:${o.perspective || 2000}px;perspective-origin:50% 45%;`;
    cam.append(fill, back, cards, front);
    // Solid background + huge faint word (chapter "cover"): word is one tone lighter / darker than the background, flat fill
    if (o.word) { const t = document.createElementNS(NS, 'text'); t.textContent = o.word;
      for (const [k, v] of Object.entries({ x: W / 2, y: H / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': o.wordSize || 420, 'font-weight': 900, fill: col(o.wordColor || 'bg2'), class: 'zh' })) t.setAttribute(k, v);
      back.appendChild(t); }
    d.appendChild(cam);
    stage.insertBefore(d, wipe);
    const L = { div: d, cam, fill, back, cards, front, bg: o.bg || 'bg', fillCss: stageBg(o) };
    L.camAt = (fx = W / 2, fy = H / 2, s = 1, rot = 0) => {
      L.camV = [fx, fy, s, rot];          // canvas transitions flatten the shot canvas into a full-frame snapshot with this same transform
      cam.style.transform = `translate(${(W / 2 - fx * s).toFixed(2)}px,${(H / 2 - fy * s).toFixed(2)}px) scale(${s.toFixed(4)}) rotate(${rot}deg)`;
    };
    L.setBg = (c, st) => { L.fillCss = stageBg({ bg: c, stage: st }); fill.style.background = L.fillCss; };
    L.camAt();
    layers.push(L);
    return L;
  }
  // Stage texture (much of the realism lives here): a good backdrop is never flat colour but a lit surface with vignette and grain.
  // stage: 'desk' (default: one top light + darkened corners + fine grain) | 'mat' (cutting-mat grid, physical feel) | 'flat' (solid, for big-text cards)
  let GRAIN = null;
  function grainUrl() {               // deterministic grain texture, generated once
    if (GRAIN) return GRAIN;
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), d = x.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) { const v = Math.floor(hash(i * 1.37 + .5) * 255); d.data.set([v, v, v, 22], i * 4); }
    x.putImageData(d, 0, 0); GRAIN = c.toDataURL(); return GRAIN;
  }
  function stageBg(o) {
    const base = col(o.bg || 'bg'), st = o.stage || (o.word ? 'flat' : 'desk');
    if (st === 'flat') return base;
    const lift = TH.dark ? 'rgba(255,255,255,.075)' : 'rgba(255,255,255,.55)', dark = TH.dark ? 'rgba(0,0,0,.55)' : 'rgba(60,45,20,.16)';
    const spot = `radial-gradient(ellipse 34% 40% at 50% 38%, ${lift}, transparent 70%)`;
    const vig = `radial-gradient(ellipse 60% 62% at 50% 50%, transparent 55%, ${dark} 100%)`;
    const grain = `url(${grainUrl()})`;
    if (st === 'mat') {
      const ln = TH.dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)';
      const grid = `linear-gradient(${ln} 2px, transparent 2px) 0 0/72px 72px, linear-gradient(90deg, ${ln} 2px, transparent 2px) 0 0/72px 72px`;
      return `${grain}, ${spot}, ${vig}, ${grid}, ${base}`;
    }
    return `${grain}, ${spot}, ${vig}, ${base}`;
  }
  function mkSvg(w, h) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('width', w); s.setAttribute('height', h); s.setAttribute('viewBox', `0 0 ${w} ${h}`);
    s.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;';
    return s;
  }

  // Camera keyframes: [[t, fx, fy, s], ...], easeInOut between keys; an easing function can go in slot 5
  function camKf(keys, t) {
    if (!keys || !keys.length) return [W / 2, H / 2, 1];
    if (t <= keys[0][0]) return keys[0].slice(1, 4);
    for (let i = 1; i < keys.length; i++) {
      if (t < keys[i][0]) {
        const a = keys[i - 1], b = keys[i], k = (b[4] || easeInOut)((t - a[0]) / (b[0] - a[0]));
        return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
      }
    }
    return keys[keys.length - 1].slice(1, 4);
  }

  // ---------- Cards: rounded, shadowed divs holding one SVG; posed with CSS 3D ----------
  function card(L, o) {
    const d = document.createElement('div');
    const r = o.radius ?? 22;
    d.style.cssText = `position:absolute;left:0;top:0;width:${o.w}px;height:${o.h}px;border-radius:${r}px;overflow:hidden;` +
      `background:${col(o.fill || 'card')};transform-origin:50% 50%;backface-visibility:hidden;` +
      (o.shadow === false ? '' : `box-shadow:0 30px 80px rgba(0,0,0,${TH.dark ? .55 : .18}),0 0 0 1px ${TH.dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'};`);
    const svg = mkSvg(o.w, o.h);
    svg.setAttribute('data-crop-ok', '');        // cards are redrawn UI: cropping on camera push-in is intentional (render check only looks for missing glyphs)
    d.appendChild(svg);
    L.cards.appendChild(d);
    const C = { div: d, svg, w: o.w, h: o.h, o };
    // Pose: x, y = card centre in screen px; z depth; rx / ry / rz degrees; s scale; op opacity; blur px
    C.pose = (p) => {
      const x = (p.x ?? W / 2) - o.w / 2, y = (p.y ?? H / 2) - o.h / 2;
      d.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${(p.z || 0).toFixed(1)}px) rotateX(${(p.rx || 0).toFixed(2)}deg) rotateY(${(p.ry || 0).toFixed(2)}deg) rotateZ(${(p.rz || 0).toFixed(2)}deg) scale(${(p.s ?? 1).toFixed(4)})`;
      d.style.opacity = (p.op ?? 1).toFixed(3);
      d.style.filter = p.blur > .05 ? `blur(${p.blur.toFixed(2)}px)` : 'none';   // depth of field: out-of-focus cards blur a little
      d.style.display = (p.op ?? 1) <= 0.001 ? 'none' : 'block';
    };
    return C;
  }
  // Pose keyframes: [[t, {x,y,z,rx,ry,rz,s,op}], ...]; keys left out carry over from the previous key
  function poseKf(keys, t) {
    const full = []; let acc = {};
    for (const [tt, p, ef] of keys) { acc = { ...acc, ...p }; full.push([tt, { ...acc }, ef]); }
    if (t <= full[0][0]) return full[0][1];
    for (let i = 1; i < full.length; i++) {
      if (t < full[i][0]) {
        const [t0, a] = full[i - 1], [t1, b, ef] = full[i], k = (ef || easeInOut)((t - t0) / (t1 - t0)), o = {};
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) o[key] = lerp(a[key] ?? b[key], b[key] ?? a[key], k);
        return o;
      }
    }
    return full[full.length - 1][1];
  }

  // ---------- Text ----------
  // cls: zh (Noto Sans SC) / serif (Noto Serif SC) / grot (Inter Tight) / mono (DM Mono). Text is flat fill; no effects beyond a stroke.
  function text(parent, str, x, y, o = {}) {
    const t = el('text', { x, y, 'font-size': o.size || 48, fill: col(o.fill || 'text'), 'text-anchor': o.anchor || 'start',
      'dominant-baseline': o.base || 'alphabetic', class: o.cls || 'zh', 'font-weight': o.weight || 700 }, parent);
    if (o.ls) t.setAttribute('letter-spacing', o.ls);
    if (o.opacity != null) t.setAttribute('opacity', o.opacity);
    t.textContent = str;
    return t;
  }
  const fmtNum = (v, o = {}) => {
    const d = o.dec ?? 0, s = v.toFixed(d);
    const [i, f] = s.split('.');
    const ii = o.sep === false ? i : i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (o.pre || '') + ii + (f ? '.' + f : '') + (o.suf || '');
  };

  // ---------- Prep that needs loaded fonts (measuring text, sampling glyph points) ----------
  const pending = [];
  function later(fn) { pending.push(fn); }
  function prepare() {          // measuring needs layout: show all shot layers invisibly, measure, then hide them again
    for (const L of layers) { L.div.style.display = 'block'; L.div.style.visibility = 'hidden'; }
    while (pending.length) pending.shift()();
    for (const L of layers) { L.div.style.display = 'none'; L.div.style.visibility = ''; }
  }

  // ---------- Sequenced playback + transitions ----------
  // items: [{ shot, t0, t1, tin:'cut'|'push'|'zoom'|'rise'|'flip'|'iris'|'wipe'|'slide'|'slash'|'defocus'|'whip'|'leak'|'recede', din, at:[x,y] (iris centre), dir:1|-1, fx:{…} }]
  //   slash / defocus / whip are canvas transitions (see below; implemented in xm-trans.js), as are leak / recede (xm-trans2.js); their options go in fx:{…}.
  // Convention: shot i owns [t0, t1); the next one enters from t1 over din seconds while this one exits at the same time.
  const DIN = { cut: 0, push: .42, zoom: .38, rise: .32, flip: .45, iris: .45, wipe: .5, slide: .42 };
  let SEQ = [];
  // Drift: every shot makes one slow, constant, one-directional push / pull + pan over its whole screen time (no shake, jitter
  // or breathing). Together with in-shot process animation this keeps the frame alive; neighbouring shots alternate direction.
  // item.drift = false turns it off, or pass { s0, s1, x, y }.
  const DRIFTS = [{ s0: 0, s1: .08, x: -90, y: 0 }, { s0: .08, s1: 0, x: 90, y: -20 }, { s0: .01, s1: .09, x: 0, y: -50 }, { s0: .02, s1: .1, x: 100, y: 16 }];
  function seq(items) {
    SEQ = items.slice().sort((a, b) => a.t0 - b.t0);
    SEQ.forEach((it, i) => {
      it.next = SEQ[i + 1] || null; it.prev = SEQ[i - 1] || null; it.idx = i;
      const F = FXR[it.tin];
      if (F) {                       // canvas transition: options, duration, swap time and sound cues all come from the registered transition
        it.fxo = F.prep ? F.prep(it) : (it.fx || {});
        it.din = it.din ?? it.fxo.din ?? F.din; it.cut = it.cut ?? it.fxo.cut ?? F.cut ?? 0;
        it.cues = F.cues ? F.cues(it) : [];
      }
      it.din = it.din ?? DIN[it.tin || 'cut'];
    });
    // After every item is prepared, call F.link(it, SEQ) so a transition can look at its neighbours' windows
    //   (recede stays down until the next transition's cut; leak allows at most one per video).
    SEQ.forEach(it => { const F = FXR[it.tin]; if (F && F.link) F.link(it, SEQ); });
    SEQ.forEach(it => { const n = it.next, F = n && FXR[n.tin];
      // Canvas transitions: the outgoing shot lives only until it is last visible inside the transition (F.holdPrev, default 0 = gone at the next t0)
      const dout = n ? (F ? (F.holdPrev ? F.holdPrev(n) : 0) : n.din) : 0;
      it.tEnd = (it.t1 ?? (n ? n.t0 : (window.VIDEO ? VIDEO.duration : it.t0 + 5))) + dout;
      it.shot.span = [it.t0, it.tEnd]; });
    return SEQ;
  }
  // Suggested sound cues for all canvas transitions (scene.js: window.SFX_CUES.push(...XK.fxCues()))
  const fxCues = () => SEQ.flatMap(it => it.cues || []);

  // ---------- Canvas transitions (slash inverted diagonal cut / defocus etc., implemented in xm-trans.js) ----------
  // Why: inversion, full-frame blur, edges that soften with position and colour fringes are per-pixel work DOM / CSS cannot do.
  // How: during the window both shots update as usual (drawing into their XM.shot canvases) but their divs stay hidden; xk
  //   flattens each canvas together with its drift / camera transform and background into a full-frame snapshot (screen
  //   coordinates) and the registered transition composites them, frame by frame, onto a canvas above all shots.
  // HUD: inside the window, XM.DS.hud only runs texture post-processing (XM.tex.flush) and records its arguments; after
  //   compositing, the HUD of whichever shot should be showing is drawn back on top with that shot's own transform. The HUD
  //   is never inverted or blurred, sits exactly where the shot would draw it, and its light / dark text is split per pixel
  //   against the composited image.
  // Timing: item.t0 = first frame of the next shot (for defocus: the frame where the swap happens inside the blur).
  //   Transition window = [t0 - cut, t0 - cut + din).
  // Register: XK.fx(name, { din, cut, cpu, prep(it) -> options, draw(g, A, B, k, it, t), hud(k, it) -> 0 previous | 1 next,
  //   holdPrev(it) -> seconds the previous shot stays alive after the next t0, cues(it) -> [{ t, name, gain }] })
  //   snapT(it, t) -> [snapshot time for previous shot, snapshot time for next shot] (optional; default both t)
  //   link(it, SEQ) (optional): called once after all items are prepared; may change it.din or read neighbours' it.cut / it.din
  //   In draw, A / B = { c: full-frame snapshot canvas, g, it, shot } (A may be null when the first shot uses a canvas transition);
  //   with cpu:true the snapshot canvases are fast for getImageData.
  // Limits: works only for shots built with XM.shot (XS / XM / big text, i.e. nearly all); legacy DOM shots from xk-shots
  //   have no canvas and fall back to a hard cut at t0 (console.warn). SVG bits on S.L.front / back are not in the
  //   snapshot (invisible for those fractions of a second). Two canvas-transition windows must not overlap.
  const FXR = {};
  const cl01 = v => Math.max(0, Math.min(1, v));
  function fx(name, def) { FXR[name] = def; DIN[name] = def.din ?? .5; return def; }
  let fxc = null, fxg = null, CAP = null, HUD0 = null, HUDC = null, HUDM = null, warned = false;
  const SNAP = {};
  function mkCanvas(cpu) { const c = document.createElement('canvas'); c.width = W; c.height = H; return { c, g: c.getContext('2d', cpu ? { willReadFrequently: true } : undefined) }; }
  function hookHud() {        // installed once: XM.DS loads after xk.js, so hook it on first use of a canvas transition
    if (HUD0 || typeof XM === 'undefined' || !XM.DS || !XM.DS.hud) return;
    HUD0 = XM.DS.hud;
    XM.DS.hud = function (g, t, P, o) {
      if (CAP && g && g.canvas === CAP.cv) { if (XM.tex) XM.tex.flush(g, P); CAP.hud = [t, P, o || {}]; return; }
      return HUD0.apply(this, arguments);
    };
  }
  const driftOf = it => it.drift === false ? null : (it.drift || DRIFTS[it.idx % DRIFTS.length]);
  const kSOf = (it, t) => clamp((t - it.t0) / Math.max(.1, it.tEnd - it.t0), 0, 1);
  function snap(it, t, slot, cpu) {
    const sh = it.shot, S = sh.S, L = sh.L, kS = kSOf(it, t), D = driftOf(it);
    if (!S || !S.cv) return { dom: true, it, shot: sh };
    hookHud(); CAP = { cv: S.cv, hud: null };
    let hud = null;
    try { sh.update(t, kS); } finally { hud = CAP.hud; CAP = null; }
    const M = new DOMMatrix();
    if (D) { const sc = 1 + lerp(D.s0, D.s1, kS); M.translateSelf(W / 2 + D.x * kS, H / 2 + D.y * kS); M.scaleSelf(sc, sc); M.translateSelf(-W / 2, -H / 2); }
    const [cx, cy, cs, cr] = L.camV || [W / 2, H / 2, 1, 0];
    M.translateSelf(W / 2 - cx * cs, H / 2 - cy * cs); M.scaleSelf(cs, cs); if (cr) M.rotateSelf(cr);
    const key = slot + (cpu ? 'c' : 'g'), C = SNAP[key] || (SNAP[key] = mkCanvas(cpu)), q = C.g;
    q.setTransform(1, 0, 0, 1, 0, 0); q.globalAlpha = 1; q.globalCompositeOperation = 'source-over'; q.filter = 'none';
    q.fillStyle = TH.bg; q.fillRect(0, 0, W, H);
    q.setTransform(M); q.fillStyle = /[(]/.test(L.fillCss || '(') ? col(L.bg) : L.fillCss; q.fillRect(-W, -H, 3 * W, 3 * H);
    q.imageSmoothingQuality = 'high'; q.drawImage(S.cv, 0, 0); q.setTransform(1, 0, 0, 1, 0, 0);
    return { c: C.c, g: q, it, shot: sh, hud, M };
  }
  function showPlain(it, t) {      // DOM-shot fallback: show as usual (drift only)
    const L = it.shot.L, s = L.div.style, kS = kSOf(it, t), D = driftOf(it);
    s.display = 'block'; s.opacity = '1'; s.clipPath = 'none';
    s.transform = D ? `translate(${(D.x * kS).toFixed(2)}px,${(D.y * kS).toFixed(2)}px) scale(${(1 + lerp(D.s0, D.s1, kS)).toFixed(5)})` : 'none';
    it.shot.update(t, kS);
  }
  // Draw the HUD back onto the transition canvas: map the composite back into shot coordinates with the inverse transform,
  // draw the HUD there (light / dark text split against that image), then paste back only the HUD ink (dilated hud-mask)
  // with the shot transform, so no other pixels are resampled
  function drawHud(g, S) {
    if (!S || !S.hud || !HUD0) return;
    const [ht, P, o] = S.hud;
    const T = HUDC || (HUDC = mkCanvas(true)), q = T.g;
    q.setTransform(1, 0, 0, 1, 0, 0); q.globalAlpha = 1; q.filter = 'none'; q.globalCompositeOperation = 'copy';
    q.setTransform(S.M.inverse()); q.drawImage(fxc, 0, 0); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over';
    HUD0(q, ht, P, o);
    const m = XM.canvas('hud-mask', W, H, false).c, Mk = HUDM || (HUDM = mkCanvas(false)), mg = Mk.g;
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = 'copy'; mg.filter = 'blur(1px)'; mg.drawImage(m, 0, 0); mg.filter = 'none';
    mg.globalCompositeOperation = 'lighter'; mg.drawImage(Mk.c, 0, 0); mg.drawImage(Mk.c, 0, 0); mg.globalCompositeOperation = 'source-over';
    q.globalCompositeOperation = 'destination-in'; q.drawImage(Mk.c, 0, 0); q.globalCompositeOperation = 'source-over';
    g.save(); g.setTransform(S.M); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.drawImage(T.c, 0, 0); g.restore();
  }
  function activeFx(t) {
    for (const it of SEQ) { const F = FXR[it.tin]; if (!F || !(it.din > 0)) continue;
      const w0 = it.t0 - (it.cut || 0); if (t >= w0 - 1e-6 && t < w0 + it.din - 1e-6) return { it, F, k: cl01((t - w0) / it.din) }; }
    return null;
  }
  // When each snapshot is taken: F.snapT(it, t) -> [t for previous, t for next]. Use it when a transition needs the next
  //   shot's first frame before t0 (e.g. whip blurring in): hold the next shot at t0 instead of updating it before its own t0.
  //   Without snapT both are taken at t.
  const reset = g => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; };
  function compose(job, t, g, sA, sB) {     // composite this frame of the transition (no HUD) -> { A, B }, or null if a DOM shot makes compositing impossible
    const { it, F, k } = job, pv = it.prev, cpu = !!F.cpu;
    const [ta, tb] = F.snapT ? F.snapT(it, t) : [t, t];
    const B = snap(it, tb, sB, cpu), A = pv ? snap(pv, ta, sA, cpu) : null;
    if (B.dom || (A && A.dom)) return null;
    reset(g); F.draw(g, A, B, k, it, t); reset(g);
    return { A, B };
  }
  function runFx(job, t) {
    const { it, F, k } = job, pv = it.prev;
    if (!fxc) {
      ({ c: fxc, g: fxg } = mkCanvas(true));
      fxc.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:40;display:none;`;
      stage.insertBefore(fxc, wipe);
    }
    const r = compose(job, t, fxg, 'A', 'B');
    if (!r) {
      if (!warned) { console.warn(`XK canvas transition ${it.tin}: a shot is not an XM.shot (no canvas); falling back to a hard cut at t0`); warned = true; }
      showPlain(t < it.t0 - 1e-6 && pv ? pv : it, t); return;
    }
    const which = F.hud ? F.hud(k, it, t) : (t >= it.t0 - 1e-6 ? 1 : 0);
    drawHud(fxg, which ? r.B : r.A);
    fxc.style.display = 'block';
  }

  // ---------- Photosensitivity check: at most 3 large luminance jumps in any 1-second window; applies to all transitions ----------
  // Checks all transitions together (canvas transitions and hard cuts; DOM transitions such as push / slide change over several
  //   frames and are not counted). Runs once, synchronously, on the first XK.play:
  //   every transition window (plus one frame either side) is composited frame by frame (no HUD) and its mean relative luminance
  //   Y (linear sRGB, 0-1) measured; a run of frames moving in one direction is one change, and a total |dY| >= LUMA.thr whose
  //   darker end has Y < LUMA.dark counts as one large jump (the WCAG 2.3.1 general-flash definition);
  //   more than LUMA.max jumps in any LUMA.win-second window -> console.error.
  //   If a transition in the window sets fx:{ unsafe:true } this drops to console.warn. Flashes drawn inside a shot by a component are not checked here.
  //   Footage frames (XM.frames) may still be loading during the check: their loading is chained onto XM.late, and the
  //   check reruns when render.js re-renders the same frame after waiting (at most 3 times).
  // XK.luma() returns the measured [{ t, Y }] and the jump list, for QA scripts.
  const LUMA = { thr: .1, dark: .8, max: 3, win: 1, on: true };
  let lumaRun = 0, lumaDone = false, lumaWait = null, lumaRes = null, LUMC = null, LUMK = null;
  const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); });
  function meanY(cv) {
    const K = LUMK || (LUMK = (() => { const c = document.createElement('canvas'); c.width = 192; c.height = 108; return { c, g: c.getContext('2d', { willReadFrequently: true }) }; })());
    K.g.imageSmoothingQuality = 'high'; K.g.drawImage(cv, 0, 0, W, H, 0, 0, 192, 108);
    const d = K.g.getImageData(0, 0, 192, 108).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += .2126 * LIN[d[i]] + .7152 * LIN[d[i + 1]] + .0722 * LIN[d[i + 2]];
    return s / (192 * 108);
  }
  function screenAt(t, g) {        // draw this moment (no HUD) into g; returns false if it cannot (DOM shot)
    const job = activeFx(t);
    if (job) return !!compose(job, t, g, 'LA', 'LB');
    let vis = null;
    for (const it of SEQ) if (t >= it.t0 - 1e-6 && t < it.tEnd - 1e-6) vis = it;      // if two overlap, take the later
    reset(g);
    if (!vis) { g.fillStyle = TH.bg; g.fillRect(0, 0, W, H); return true; }
    const S = snap(vis, t, 'LB', false); if (S.dom) return false;
    g.drawImage(S.c, 0, 0); return true;
  }
  function lumaCheck() {
    const fps = (window.VIDEO && VIDEO.fps) || 30, fr = new Map();      // frame number -> the transition item that owns it
    for (const it of SEQ) {
      if (!it.prev) continue;
      const F = FXR[it.tin];
      if (F && it.din > 0) { const w0 = it.t0 - (it.cut || 0), w1 = w0 + it.din;
        for (let f = Math.floor(w0 * fps + 1e-6) - 1; f <= Math.ceil(w1 * fps - 1e-6); f++) fr.set(f, it); }
      else if (!(it.din > 0)) { const f = Math.round(it.t0 * fps); fr.set(f - 1, it); fr.set(f, it); }
    }
    const C = LUMC || (LUMC = mkCanvas(false)), Y = [];
    for (const f of [...fr.keys()].sort((a, b) => a - b)) {
      if (f < 0 || (window.VIDEO && f >= VIDEO.duration * fps)) continue;
      if (screenAt(f / fps, C.g)) Y.push({ f, t: f / fps, Y: meanY(C.c), it: fr.get(f) });
    }
    // One jump = a run of frames moving in one direction (a fade or a frame-by-frame darkening streak counts once; a WCAG flash = a pair of opposite changes)
    const jumps = []; let run = null;
    const flush = () => { if (run) { const d = run.end.Y - run.start.Y, lo = Math.min(run.start.Y, run.end.Y);
      if (Math.abs(d) >= LUMA.thr && lo < LUMA.dark) jumps.push({ t: run.end.t, from: run.start.Y, to: run.end.Y, it: run.end.it }); } run = null; };
    for (let i = 1; i < Y.length; i++) {
      const a = Y[i - 1], b = Y[i];
      if (b.f - a.f !== 1) { flush(); continue; }
      const d = b.Y - a.Y, sg = Math.abs(d) < .005 ? 0 : Math.sign(d);
      if (run && run.end === a && (sg === 0 || sg === run.sg)) { run.end = b; continue; }
      flush(); if (sg) run = { sg, start: a, end: b };
    }
    flush();
    return { Y, jumps };
  }
  function lumaReport(R) {
    const J = R.jumps, seen = new Set();
    for (let i = 0; i < J.length; i++) {
      const w = J.filter(j => j.t >= J[i].t - 1e-6 && j.t < J[i].t + LUMA.win - 1e-6);
      if (w.length <= LUMA.max) continue;
      const key = w.map(j => j.t.toFixed(3)).join(); if (seen.has(key)) continue; seen.add(key);
      const unsafe = w.some(j => j.it && j.it.fxo && j.it.fxo.unsafe);
      const desc = w.map(j => `${j.t.toFixed(2)}s ${j.it ? j.it.tin || 'cut' : '?'} Y ${j.from.toFixed(2)}→${j.to.toFixed(2)}`).join('; ');
      const msg = `XK photosensitivity: ${J[i].t.toFixed(2)}–${(J[i].t + LUMA.win).toFixed(2)} s has ${w.length} large luminance jumps (limit ${LUMA.max}): ${desc}`;
      if (unsafe) console.warn(msg + ' (a transition sets unsafe:true, so this is allowed)');
      else console.error(msg + '. Move flashing (white / black) transitions more than 1 s apart, or use a non-flashing transition');
    }
  }
  function lumaMaybe() {
    if (lumaDone || !LUMA.on || !SEQ.length) return;
    if (lumaWait && !lumaWait.done) return;
    lumaRun++;
    lumaRes = lumaCheck();
    const late = typeof XM !== 'undefined' && XM.late ? XM.late() : null;    // only the footage frames the check itself requested (this frame's shots have not updated yet)
    if (late && lumaRun < 3) {
      const w = lumaWait = { done: false, p: late.then(() => { w.done = true; }) };
      if (!XM.late.luma) { const L0 = XM.late; XM.late = () => { const a = L0(), b = lumaWait && !lumaWait.done && !lumaWait.given ? lumaWait.p : null; if (b) lumaWait.given = true; return a && b ? Promise.all([a, b]) : (a || b); }; XM.late.luma = true; }
      return;
    }
    lumaDone = true; lumaReport(lumaRes);
  }
  const luma = () => lumaRes && { Y: lumaRes.Y.map(({ t, Y }) => ({ t, Y })), jumps: lumaRes.jumps.map(({ t, from, to, it }) => ({ t, from, to, tin: it && it.tin })) };

  function play(t) {
    lumaMaybe();
    wipe.style.display = 'none';
    if (fxc) fxc.style.display = 'none';
    for (const L of layers) L.div.style.display = 'none';
    const job = activeFx(t);
    for (const it of SEQ) {
      if (job && (it === job.it || it === job.it.prev)) continue;     // these two shots are drawn by the canvas transition this frame
      const n = it.next, nF = n && FXR[n.tin];
      const dout = n ? (nF ? (nF.holdPrev ? nF.holdPrev(n) : 0) : n.din) : 0, t1 = it.t1 ?? (n ? n.t0 : Infinity);
      if (t < it.t0 || t >= t1 + dout) continue;
      const L = it.shot.L, s = L.div.style;
      let tf = '', op = 1, clip = 'none', vis = true;
      // Enter
      const ki = it.din > 0 ? prog(t, it.t0, it.t0 + it.din) : 1;
      if (ki < 1) {
        const k = easeInOut(ki), dir = it.dir || 1;
        switch (it.tin) {
          case 'push': tf += `translateX(${((1 - k) * W * dir).toFixed(1)}px)`; break;
          case 'slide': tf += `translateY(${((1 - k) * H * dir).toFixed(1)}px)`; break;
          case 'zoom': tf += `scale(${lerp(.8, 1, k).toFixed(4)})`; op = k; break;
          case 'rise': tf += `translateY(${((1 - k) * 160).toFixed(1)}px)`; op = k; break;
          case 'flip': tf += `rotateY(${lerp(85 * dir, 0, k).toFixed(2)}deg)`; vis = ki > .5; break;
          case 'iris': { const [cx, cy] = it.at || [W / 2, H / 2]; clip = `circle(${(easeIn(ki) * 2300).toFixed(1)}px at ${cx}px ${cy}px)`; break; }
          case 'wipe': vis = ki >= .5; wipeAt(ki, it); break;
        }
      }
      // Exit (decided by how the next shot enters)
      if (n && t >= t1 && dout > 0) {
        const ko = prog(t, t1, t1 + dout), k = easeInOut(ko), dir = n.dir || 1;
        switch (n.tin) {
          case 'push': tf = `translateX(${(-k * W * dir).toFixed(1)}px) ` + tf; break;
          case 'slide': tf = `translateY(${(-k * H * dir).toFixed(1)}px) ` + tf; break;
          case 'zoom': tf = `scale(${lerp(1, 1.45, k).toFixed(4)}) ` + tf; op *= 1 - k; break;
          case 'rise': op *= 1 - k; break;
          case 'flip': tf = `rotateY(${lerp(0, -85 * dir, k).toFixed(2)}deg) ` + tf; vis = vis && ko < .5; break;
          case 'iris': break;
          case 'wipe': vis = vis && ko < .5; break;
        }
      }
      if (!vis) continue;
      const kS = clamp((t - it.t0) / Math.max(.1, it.tEnd - it.t0), 0, 1);
      const D = it.drift === false ? null : (it.drift || DRIFTS[it.idx % DRIFTS.length]);
      if (D) tf += ` translate(${(D.x * kS).toFixed(2)}px,${(D.y * kS).toFixed(2)}px) scale(${(1 + lerp(D.s0, D.s1, kS)).toFixed(5)})`;
      s.display = 'block'; s.transform = tf.trim() || 'none'; s.opacity = op.toFixed(3); s.clipPath = clip;
      it.shot.update(t, kS);
    }
    if (job) runFx(job, t);
  }
  // Colour wipe: a full block of accent colour sweeps left to right; the shot changes underneath at the midpoint
  function wipeAt(k, it) {
    wipe.style.display = 'block';
    wipe.style.background = col(it.wipeColor || 'accent');
    const x = lerp(-W, W, easeInOut(k));
    wipe.style.transform = `translateX(${x.toFixed(1)}px) skewX(-8deg)`;
    wipe.style.width = (W * 1.2) + 'px';
  }

  return { W, H, NS, TH, PRESETS, theme, tone, col, init, layer, mkSvg, camKf, card, poseKf, text, fmtNum, later, prepare, seq, play, layers, fx, fxCues, LUMA, luma, get FXR() { return FXR; }, get SEQ() { return SEQ; } };
})();
