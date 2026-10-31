// XM.tag: short highlight labels laid over any shot. Two looks: 'paper' (torn dark strip, serif text,
// small yellow pin dot, optional English sub-line; develops from blur and drifts into place, then sways
// slowly) and 'bar' (flat dark bar, slanted bold sans text, small square pin; slides in from one side).
// API: XM.tag(items, o) -> { draw(g, t, P), cues, items, boxes(t), api }; XM.tag.on(shot | [shots], items, o) -> shot.
// Docs: docs/components/tag.md
// Load after lib.js, xk.js, xm-core.js, xm-ds.js (xm-tex.js optional). Canvas 2D, deterministic (randomness only via XM.rng / hash).
// Fonts: SerifSC (Source Han Serif 900, paper), HeiSC (Source Han Sans 900, bar), StixIt (English sub-line).
//
// ── How to attach (a label is an overlay, not a shot of its own) ──────────────────────────────
//   ① Your own shot: const tg = XM.tag([...], { ... }); call tg.draw(g, t, P) inside your draw at any layer.
//      It draws under the current transform (follows camera push / moves, stays sharp when scaled); draw it
//      before the subject and the subject covers it.
//   ② A ready-made shot (bigType, XS.evidence, XM.notify ... anything that calls XM.DS.hud): XM.tag.on(shot, [...], { ... }).
//      The labels are drawn just before that shot's HUD, so texture-layer push / window light / post also apply to them;
//      the label cues are merged into shot.cues. When an evidence card pushes in, pass map: (x, y, t) => shot.toStage(x, y, t)
//      so labels stay pinned to screenshot pixels (mapScale makes the text size follow the zoom).
//   To be hidden behind a subject: occlude (the subject's silhouette; only its alpha is used to cut the label). No need to redraw the subject.
//
// ── The two looks (defaults below) ──────────────────────────────────────────────────────────
//   paper: rough-edged dark strip (soft edge) + SerifSC 900 off-white text squeezed to .72 width + highlighted chars in
//     marker yellow (P.mark) + a small yellow rounded square (pin) at the top left + optional small italic English line below.
//     Enter: pin first (grows and fades in over 6 frames) -> 1 frame later the strip fades in (12 frames) and characters
//     appear left to right (first 4 at once, then ~1.1 char / frame); the whole label goes from very blurred
//     (.14 x font size, ~8.5 px at size 60) to sharp in .5 s ((1-u)^1.7), opacity .5 -> 1 in 9 frames, sub-line 6 frames later;
//     meanwhile it drifts in from lower right ((.28, 1.15) font sizes away, quadOut over 1.47 s).
//     Once settled it sways slowly (slow drift, never a fast shake): x ±.033 size / 2.2 s, y ±.024 size / 2.8 s,
//     rotation ±.5° / 2.5 s, ramping from 0 to full over .5 s.
//   bar: flat dark bar (1.5 x font size tall) + HeiSC 900 off-white text skewed .2 + a small off-white square (pin, half outside the bar).
//     Enter: slides in from 6 font sizes away (slow start, fastest around frames 6–9, then a long tail ×.74 per frame,
//     settled in 20 frames); bar and text fade in together over 19 frames; horizontal motion blur with a .3-frame shutter;
//     the square appears in the last 18% of the slide. hold = fade in on the spot first, then slide. No sway.
//   Style choices: no drop shadow under the text, bar text has no vertical gradient (grad:true turns it on), no chromatic
//   split, nothing drawn left of the bar text; yellow is P.mark; strip / bar grey is a slightly cool ink (#232428);
//   the paper strip has no paper grain and the text no wear noise.
//
// ── XM.tag(items, o) -> { draw(g, t, P), cues, items, boxes(), api }   XM.tag.on(shot, items, o) -> shot ─────────────
//   items (one label each; you write all text, the component has no default text):
//     text   : required. A short phrase (a verdict / keyword of about ≤ 8 CJK chars; longer -> console.warn. A label is not a subtitle or a sentence)
//     at     : appear time (absolute seconds). Default o.at + i × o.stagger; neither given -> console.error
//     x, y   : required. Anchor position (current canvas coords; with o.map, the map's input coords, e.g. screenshot pixels)
//     anchor : which point of the label sits at (x, y): 'tl' (default, strip top-left) | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br'
//              | 'pin' (centre of the dot / square) | [fx, fy] (fractions of strip width / height)
//     style  : 'paper' (default, or o.style) | 'bar'
//     size   : font size px (paper 84, bar 100; readable text ≥ 56, smaller -> console.warn)
//     hi     : highlighted chars (marker yellow): 'substring' | number n (last n chars) | [indices...]. Default none
//     sub    : small italic English line under the text (English only, paper only). Decoration, carries no information
//     rot    : rotation in degrees around the anchor. For a tilted look ±1–4° is enough
//     from   : bar slides in from 'left' (default) | 'right'; dist (px, default 6 × size); hold (s to fade in on the spot before sliding, default 0)
//     rise   : paper drift path { dx, dy (font sizes, start relative to end), dur, ease }; false = develop in place
//     sway   : slow sway. paper on, bar off by default; true | false | { x, y (font sizes), r (deg), px, py, pr (periods, s) }
//     out    : exit. Time (s) or { at, mode:'blur' (paper default: blur + fade) | 'slide' (bar default: slides back out its entry side) | 'fade', dur }
//     point  : optional connector { x, y, at } to a point on the subject (same coords as x, y). A thin straight line from the strip
//              edge to that point with a small square at the end; the line follows the sway, the end stays put.
//              One line per label, don't build a spider web.
//     delay  : paper: text delay after the pin (default 1 frame); clear: time to go sharp (default .5 s); soft: residual softness after (px, default .4)
//     color  : { strip, text, hi, pin, line } colour overrides (normally leave alone: ink-grey strip, off-white text, yellow highlight)
//     square : bar's top-left square (default on, false = off); skew (default .2); grad (vertical gradient on bar text, default off)
//     seed, sfx (false = silent / a sound name)
//   o (the whole group):
//     at, stagger : items without at appear from o.at, one every stagger (default .8 s)
//     style       : default look for the group
//     map         : (x, y, t) -> [x, y] label coords -> canvas coords (pin labels to something that moves, e.g. XS.evidence's shot.toStage)
//     mapScale    : true -> font size follows the map's local scale (1 at the moment the label appears)
//     occlude     : (q, t) => {} (draw the silhouette of whatever covers the labels on q, same coords) | { src, box:[x, y, w, h] } (a transparent PNG)
//     on          : what is under the labels: 'dark' | 'light' | '#hex', used to pick a contrasting connector colour (default from P's stage)
//     sfx         : false = no sound for the group. Default: paper plays SFX.tag (tik), bar plays SFX.appear (tik); cues closer than .25 s play once
//   draw(g, t, P) draws under g's current transform; boxes(t) returns the screen corners of each label drawn at frame t
//   [{ text, alpha, pts }] (for self-checks; [] if that frame wasn't drawn); api.layout(i) returns the measured layout (local coords).
//
// ── Hard-cut entry, stacking and the either/or pair ─────────────────────────────────────────
//   For callout boxes that just pop on and off with no animation (final size on the first frame, timed to the spoken keyword),
//   pinned to the screen rather than the camera, possibly across several cuts; at most two at once, the second offset down-right.
//   Per item:
//     enter  : 'cut' = hard cut in (first frame is the settled state: no develop, no slide, no sway, no motion blur; the first frame = at,
//              lock it to the frame the keyword starts, measured from the SRT / voice waveform).
//              Omitted = the normal entry (paper develops and drifts, bar slides). Can be set group-wide via o.enter.
//              With enter:'cut', out also defaults to a hard cut (out:{ at, mode:'cut' }).
//   Group (o):
//     enter  : default entry for the group (as above)
//     out    : default exit for items without their own out (e.g. a pair vanishing together)
//     stack  : 'step' | { mode:'step', dx:1.3, dy:2.3, unit:'h'|'px', dir:'rd'|'ld'|'ru'|'lu' }
//              Staircase: item i (i ≥ 1) without x, y is placed at item i−1 offset (dx, dy) toward dir (unit:'h' = multiples of the
//              first item's strip height, default (1.3, 2.3); 'px' = pixels), same anchor as item 1. dir: rd down-right (default)
//              | ld down-left (labels near the right edge) | ru / lu upward. Two or three per screen at most; > 3 -> console.warn
//     pair   : { q:'English question', dir:'rd'|'ld', overlap:1.33, gap:.49, qx:.64, qSize:.42, qAt, qDur:.375, qAlpha:.9, qColor (default off-white / ink by o.on) }
//              Either/or: exactly two items. Item 2 sits down-right of item 1 (dir:'ld' mirrors to down-left): its left edge = item 1's
//              right edge minus overlap strip heights (at most .3 strip widths), its top = item 1's bottom + gap strip heights.
//              Between them a small italic English line (StixIt, size = qSize × item 1 size; English only, decoration),
//              starting qx strip heights past item 1's right edge, soft-wiped in left to right over qDur s from qAt (default item 1's at).
//              Item 2 without at appears .21 s after item 1.
//     pin    : true = pin to the screen: labels are drawn after the texture layer's push / window light / post
//              (they don't grow when XM.tex.use's push moves in), using screen coordinates.
//              To span a cut, attach the same labels to several adjacent shots: XM.tag.on([shotA, shotB, ...], items, o)
//              (cues go to the first shot only), or call the same tg.draw in each of your shots' draw.
//              Set drift:false on pinned shots in XK.seq (drift is a whole-layer transform and would move the labels).
//
// Guidelines: short phrases only; at most 3–4 per screen, staggered; never over the subject's face; at most one highlight;
//   English only in the sub-line; don't let an exit clash with the start of the next sentence.
//   Stack / pair: at most two per screen; keep each up until the sentence ends (≥ 2.5 s).
(() => {
  const { W, H } = XK;
  const DS = XM.DS, SFX = DS.SFX;
  const fps = () => (window.VIDEO && VIDEO.fps) || 30;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const sstep = k => k * k * (3 - 2 * k);
  const vn = (x, s) => { const i = Math.floor(x), f = x - i; return lerp(hash(i + s * 57.1), hash(i + 1 + s * 57.1), sstep(f)); };
  const EZ = {
    linear: k => k, quadOut: k => 1 - (1 - k) * (1 - k), quadIn: k => k * k, easeIn: k => k * k * k,
    easeOut: k => 1 - Math.pow(1 - k, 3), easeInOut: k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    expoOut: XM.expoOut, expoIn: XM.expoIn, smooth: sstep,
  };
  const ez = e => (typeof e === 'function' ? e : EZ[e] || EZ.quadOut);
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  const INK = DS.INK, PAPER = DS.PAPER;
  const STRIP = '#232428';             // strip / bar colour: INK lifted ~10%, very slightly cool
  const FONT = { paper: 'SerifSC', bar: 'HeiSC', sub: 'StixIt' };

  // ---------- Default timing (frame counts at 30 fps converted to seconds) ----------
  const PAPER_D = {
    size: 84, sq: .72, pad: { l: .27, r: .32, t: .32, b: .32, bSub: .58 }, rough: .07, edge: .015,
    pin: { dx: .35, dy: -.09, s: .4 },                     // pin-dot centre relative to the strip's top-left corner (font-size multiples), and its side length
    delay: 1 / 30, clear: .5, strip: .4, pw: 1.7, blur0: .14, soft: .4, a0: .5, aIn: .3, lead: 4, perChar: 1 / 33,
    sub: { size: .24, dy: .36, dx: .02, in: .2, dur: .27, alpha: .28 },
    rise: { dx: .28, dy: 1.15, dur: 1.47, ease: 'quadOut' },
    sway: { x: .033, y: .024, r: .5, px: 2.2, py: 2.8, pr: 2.5, ramp: .5 },
    out: { mode: 'blur', dur: .3 },
  };
  const k30 = a => a.map(([f, v]) => [f / 30, v]);
  const BAR_D = {
    size: 100, h: 1.5, pad: { l: .55, r: .27 }, skew: .2, dist: 6, shutter: .3,     // left padding .55 (no decoration left of the text)
    slide: k30([[0, 1], [1, .933], [3, .867], [5, .758], [6, .64], [7, .557], [8, .453], [9, .353], [10, .267], [11, .2], [12, .147],
      [13, .107], [14, .073], [15, .05], [16, .033], [17, .02], [18, .01], [19, .003], [20, 0]]),
    fade: k30([[0, .02], [1, .03], [2, .07], [3, .12], [4, .17], [5, .22], [6, .3], [7, .41], [8, .5], [9, .63], [10, .71], [11, .77],
      [12, .82], [13, .84], [14, .88], [15, .94], [16, .95], [17, .97], [18, .99], [19, 1]]),
    square: { s: .35, x: -.55, y: -.53 },      // top-left square: side .35 x font size; x / y in multiples of the square's side (half sits outside the bar)
    out: { mode: 'slide', dur: .35 },
  };
  const kf = (t, keys) => { if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) { const a = keys[i - 1], b = keys[i]; return lerp(a[1], b[1], (t - a[0]) / (b[0] - a[0])); }
    return keys[keys.length - 1][1]; };

  // ---------- Torn outline: generated in "font size = 1" units and cached (during a push the pixel size changes every frame; keying the cache on pixel size made the edge jitter) ----------
  const TORN = new Map();
  function torn(q, w, h, seed, rough) {
    const key = `${w.toFixed(2)}:${h.toFixed(2)}:${seed}:${rough}`;
    if (!TORN.has(key)) {
      const R = i => hash(i * 7.31 + seed * 131.7), st = .1, P = [];
      for (let x = 0, i = 0; x <= w + 1e-6; x += st, i++) P.push([x, (vn(x / .22, seed + 1) - .5) * rough + (R(i) - .5) * rough * .5]);
      for (let y = 0; y <= h + 1e-6; y += st) P.push([w + (vn(y / .22, seed + 2) - .5) * rough * .8, y]);
      for (let x = w, i = 0; x >= -1e-6; x -= st, i++) P.push([x, h + (vn(x / .22, seed + 3) - .5) * rough + (R(i + 500) - .5) * rough * .5]);
      for (let y = h; y >= -1e-6; y -= st) P.push([(vn(y / .22, seed + 4) - .5) * rough * .8, y]);
      TORN.set(key, P);
    }
    q.beginPath(); TORN.get(key).forEach(([x, y], i) => (i ? q.lineTo(x, y) : q.moveTo(x, y))); q.closePath();
  }

  // ---------- Measure text (measured once at 100 px and scaled; local origin = left end of the text baseline) ----------
  const MQ = () => XM.canvas('xm-tag:measure', 8, 8, false).g;
  function layout(it) {
    if (it._L) return it._L;
    const q = MQ(), s = it.size, paper = it.style === 'paper', fam = FONT[it.style], chars = it.chars;
    q.font = `900 100px ${fam}`; q.letterSpacing = '0px';
    const ref = q.measureText('国'), asc = ref.actualBoundingBoxAscent / 100 * s, desc = ref.actualBoundingBoxDescent / 100 * s;
    const sq = paper ? it.sq : 1, xs = [0];
    for (let i = 1; i <= chars.length; i++) xs.push(q.measureText(chars.slice(0, i).join('')).width / 100 * s * sq);
    const tw = xs[chars.length];
    let box, pin;
    if (paper) {
      const p = PAPER_D.pad, b = it.sub ? p.bSub : p.b;
      box = { x: -p.l * s, y: -asc - p.t * s, w: tw + (p.l + p.r) * s, h: (p.t + b) * s + asc + desc };
      pin = { x: box.x + PAPER_D.pin.dx * s, y: box.y + PAPER_D.pin.dy * s, s: PAPER_D.pin.s * s };
    } else {
      const p = BAR_D.pad, bh = (it.h ?? BAR_D.h) * s, sk = it.skew;
      box = { x: -p.l * s, y: -asc - (bh - asc - desc) / 2, w: (p.l + p.r) * s + tw + sk * asc, h: bh };
      const Q = BAR_D.square, qs = Q.s * s;             // square side .35 x font size, its top-left (.55, .53) square-sides outside the bar corner: half outside
      pin = { x: box.x + Q.x * qs + qs / 2, y: box.y + Q.y * qs + qs / 2, s: qs };
    }
    return (it._L = { asc, desc, xs, tw, box, pin, sq });
  }
  function anchorPt(it, Lo) {
    const b = Lo.box, a = it.anchor ?? 'tl';
    if (a === 'pin') return [Lo.pin.x, Lo.pin.y];
    if (Array.isArray(a)) return [b.x + a[0] * b.w, b.y + a[1] * b.h];
    const fx = a.includes('l') ? 0 : a.includes('r') ? 1 : .5, fy = a.includes('t') ? 0 : a.includes('b') ? 1 : .5;
    if (!/^(tl|t|tr|l|c|r|bl|b|br)$/.test(a)) console.error('XM.tag: anchor must be tl / t / tr / l / c / r / bl / b / br / pin / [fx, fy], got ' + a);
    return [b.x + fx * b.w, b.y + fy * b.h];
  }

  // ---------- State at time t ----------
  function state(it, t) {
    const s = it.size, paper = it.style === 'paper';
    const st = { alpha: 1, blur: 0, dx: 0, dy: 0, sx: 0, sy: 0, sr: 0, slide: 0, smear: 0, decor: 1, cu: it.chars.length, stripA: 1, subA: 1, pinK: 1, pinBlur: 0 };
    if (it.enter === 'cut') {          // hard cut: the frame at `at` is already the settled state; nothing before it
      if (t < it.at - 1e-6) return null;
      st.soft = paper ? it.soft : 0; st.slide = paper ? 0 : outSlide(it, t);
    } else if (paper) {
      const tp = it.at, tc = it.at + it.delay, fr1 = 1 / fps();
      if (t < tp) return null;
      const kd = cl((t - tp) / (6 / 30));
      st.pinK = kd; st.pinBlur = 1.6 / 60 * s * (1 - kd);
      st.onlyPin = t < tc - fr1 - 1e-6;                  // pin first: a faint ghost of the text starts one frame before the text
      const u = cl((t - tc) / it.clear);
      st.cu = t >= tc ? Math.min(it.lead, it.chars.length) + (t - tc) / it.perChar : 1.5;
      st.stripA = cl((t - tc) / it.stripIn);
      st.alpha = t >= tc ? PAPER_D.a0 + (1 - PAPER_D.a0) * cl((t - tc) / PAPER_D.aIn) : PAPER_D.a0;
      st.blur = it.blur0 * s * Math.pow(1 - u, it.pw) + (t < tc ? 2 / 60 * s : 0); st.soft = it.soft;     // soft is in screen pixels (does not grow during a push)
      st.subA = cl((t - tc - PAPER_D.sub.in) / PAPER_D.sub.dur);
      if (it.rise) { const R = it.rise, k = 1 - ez(R.ease || 'quadOut')(cl((t - tp) / (R.dur ?? 1.47))); st.dx = (R.dx ?? 0) * s * k; st.dy = (R.dy ?? 0) * s * k; }
    } else {
      const t0 = it.at, th = t0 + it.hold;
      if (t < t0) return null;
      const sgn = it.from === 'right' ? 1 : -1, sh = BAR_D.shutter / fps();
      const rem = tt => (tt < th ? 1 : cl(kf(tt - th, it.slide || BAR_D.slide)));
      const pos = tt => sgn * it.dist * rem(tt) + outSlide(it, tt);
      st.slide = pos(t); st.smear = Math.abs(pos(t - sh) - pos(t));
      st.alpha = cl(kf(t - t0, it.fade || BAR_D.fade));
      st.decor = cl((1 - rem(t) - .82) / .12);
    }
    if (it.swayO) {
      const S = it.swayO, ts = t - (it.at + (it.enter === 'cut' ? 0 : paper ? it.delay : it.hold)), a = EZ.easeInOut(cl(ts / S.ramp)), P2 = Math.PI * 2, ph = it.ph;
      st.sx = a * S.x * s * Math.sin(P2 * ts / S.px + ph); st.sy = a * S.y * s * Math.sin(P2 * ts / S.py + ph * 1.7);
      st.sr = a * S.r * Math.PI / 180 * Math.sin(P2 * ts / S.pr + ph * .6);
    }
    if (it.outO) {
      const O = it.outO;
      if (O.mode === 'cut') { if (t >= O.at - 1e-6) return null; return st; }     // hard cut out (both labels of a pair vanish on the same frame)
      const k = cl((t - O.at) / O.dur);
      if (k >= 1) return null;
      if (k > 0) {
        if (O.mode === 'blur') { st.alpha *= 1 - EZ.easeIn(k); st.blur += it.blur0 * s * Math.pow(k, 1.5); st.pinK *= 1 - k; }
        else if (O.mode === 'slide') st.alpha *= 1 - k * k;
        else st.alpha *= 1 - XM.expoIn(k);
      }
    }
    return st;
  }
  function outSlide(it, t) {
    const O = it.outO; if (!O || O.mode !== 'slide') return 0;
    const k = cl((t - O.at) / O.dur); return (it.from === 'right' ? 1 : -1) * it.dist * EZ.easeIn(k);
  }

  // ---------- Label body (local coords: origin = left end of the text baseline) ----------
  function body(q, it, st, Lo, P) {
    const s = it.size, C = it.color, chars = it.chars, b = Lo.box;
    if (it.style === 'paper') {
      if (st.stripA > 0) {
        q.save(); q.globalAlpha *= st.stripA; q.translate(b.x, b.y);
        q.filter = `blur(${(PAPER_D.edge * s * it._dev).toFixed(2)}px)`; q.scale(s, s);
        torn(q, Math.round(b.w / s * 100) / 100, Math.round(b.h / s * 100) / 100, it.seed, PAPER_D.rough);
        q.fillStyle = C.strip || STRIP; q.fill(); q.restore();
      }
      q.save(); q.font = `900 ${s}px ${FONT.paper}`; q.letterSpacing = '0px'; q.textBaseline = 'alphabetic'; q.scale(Lo.sq, 1);
      for (let i = 0; i < chars.length; i++) {
        const a = cl(st.cu - i); if (a <= 0) continue;
        q.globalAlpha = a; q.fillStyle = it.hiSet.has(i) ? (C.hi || P.mark) : (C.text || PAPER);
        q.fillText(chars[i], Lo.xs[i] / Lo.sq, 0);
      }
      q.restore();
      if (it.sub && st.subA > 0) {
        const S = PAPER_D.sub;
        q.save(); q.font = `500 ${S.size * s}px ${FONT.sub}`; q.globalAlpha = st.subA * S.alpha; q.fillStyle = C.text || PAPER;
        q.fillText(it.sub, S.dx * s, Lo.desc + S.dy * s); q.restore();
      }
    } else {
      q.fillStyle = C.strip || STRIP; q.fillRect(b.x, b.y, b.w, b.h);
      q.save(); q.font = `900 ${s}px ${FONT.bar}`; q.letterSpacing = '0px'; q.textBaseline = 'alphabetic'; q.transform(1, 0, -it.skew, 1, 0, 0);
      const base = C.text || PAPER, fill = it.grad ? (() => { const gr = q.createLinearGradient(0, -Lo.asc, 0, Lo.desc); gr.addColorStop(0, XM.tex ? XM.tex.shade(base, .3) : base); gr.addColorStop(1, XM.tex ? XM.tex.shade(base, -.2) : base); return gr; })() : base;
      for (let i = 0; i < chars.length; i++) { q.fillStyle = it.hiSet.has(i) ? (C.hi || P.mark) : fill; q.fillText(chars[i], Lo.xs[i], 0); }
      q.restore();
      if (it.square && st.decor > 0) { const p = Lo.pin; q.save(); q.globalAlpha *= st.decor; q.fillStyle = st.pinCol || C.pin || '#f7f6f2'; q.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); q.restore(); }
    }
  }
  // The corner dot / square must contrast with the background just outside it (an off-white square disappears on a light background).
  // Sample the luminance of a small patch outside the dot (this frame, before the labels are drawn):
  // dark background -> paper uses marker yellow, bar uses off-white; light background -> the accent colour (or ink if contrast is too low).
  // Blends continuously with luminance, so a slowly changing background never makes the colour jump.
  function pinColor(g, M, it, Lo, P) {
    const p = Lo.pin, q = M.transformPoint({ x: p.x - p.s * .55, y: p.y - p.s * .55 }), r = Math.max(3, Math.round(p.s * .3 * Math.hypot(M.a, M.b)));
    let L = null;
    try { const d = g.getImageData(Math.round(q.x - r), Math.round(q.y - r), 2 * r, 2 * r).data; let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { sum += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]; n++; }
      if (n) L = sum / n; } catch (e) { L = null; }
    if (L == null) L = P.stage === 'paper' ? 230 : 30;
    const dark = it.style === 'paper' ? P.mark : '#f7f6f2';
    const light = DS.pick(PAPER, [P.accent, INK], 3);          // light-background reference is off-white: use the accent if it reaches 3:1 on off-white
    const k = Math.max(0, Math.min(1, (L - 95) / 70)), e = k * k * (3 - 2 * k);
    const hx = c => { c = String(c).replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) || 0); };
    const A = hx(dark), B = hx(light);
    return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * e)).join(',') + ')';
  }
  function pinDot(q, it, st, Lo, P) {     // paper's yellow dot (never blurred with the strip: it is sharp from its first frame)
    if (st.pinK <= 0) return;
    const p = Lo.pin, ds = p.s * 1.02 * (.5 + .5 * st.pinK);
    q.save(); q.globalAlpha *= (.35 + .65 * st.pinK) * Math.min(1, st.alpha / .5);
    if (st.pinBlur > .3) q.filter = `blur(${(st.pinBlur * it._dev).toFixed(2)}px)`;
    q.fillStyle = st.pinCol || it.color.pin || P.mark; q.beginPath(); q.roundRect(p.x - ds / 2, p.y - ds / 2, ds, ds * .95, ds * .3); q.fill(); q.restore();
  }

  // ---------- A group of labels ----------
  function make(items, o = {}) {
    if (!Array.isArray(items) || !items.length) console.error('XM.tag: the first argument is an array of tags [{ text, at, x, y, … }], content set by the voice-over');
    const cues = [];
    // Stack / pair: later items' positions are derived from item 1 (needs text metrics, so computed on first draw, see resolve)
    const ST = o.stack == null || o.stack === false ? null : { mode: 'step', dx: 1.3, dy: 2.3, unit: 'h', dir: 'rd', ...(typeof o.stack === 'string' ? { mode: o.stack } : o.stack) };
    if (ST && ST.mode !== 'step') console.error('XM.tag: stack must be \'step\' (for a choice of two use pair)');
    if (ST && !/^(rd|ld|ru|lu)$/.test(ST.dir)) console.error('XM.tag: stack.dir must be rd / ld / ru / lu');
    if (ST && (items || []).length > 3) console.warn('XM.tag: stack works best with two or three labels per screen; got ' + items.length + ' labels');
    const PR = o.pair ? { dir: 'rd', overlap: 1.33, gap: .49, qx: .64, qSize: .42, qDur: .375, qAlpha: .9, ...(o.pair === true ? {} : o.pair) } : null;
    if (PR && ST) console.error('XM.tag: use stack or pair, not both');
    if (PR && (items || []).length !== 2) console.error('XM.tag: pair is a choice of two and needs exactly two tags (now ' + (items || []).length + ')');
    if (PR && PR.q != null && CJK.test(PR.q)) { console.error(`XM.tag: pair.q takes English only ("${PR.q}"); a question the viewer must read belongs in the voice-over / subtitles`); PR.q = null; }
    if (PR && !/^(rd|ld)$/.test(PR.dir)) console.error('XM.tag: pair.dir must be rd / ld');
    const derived = i => i > 0 && (ST || PR);           // this item's position is derived from the previous one
    let prevSize = null;
    const list = (items || []).map((src, i) => {
      const it = { ...src }, style = it.style || o.style || 'paper', paper = style === 'paper';
      it.style = style; it.i = i;
      it.enter = it.enter ?? o.enter ?? null;
      if (it.enter != null && it.enter !== 'cut') { console.error(`XM.tag: enter must be 'cut' (hard cut); omitted = ${paper ? 'develop and settle' : 'slide in'}, got ${it.enter}`); it.enter = null; }
      if (it.out == null && o.out != null) it.out = o.out;
      if (PR && i === 1 && it.at == null && src.at == null && items[0] && items[0].at != null) it.at = items[0].at + .21;     // item 2 of a pair appears 5 frames (.21 s) after item 1
      if (style !== 'paper' && style !== 'bar') console.error('XM.tag: style must be paper / bar, got ' + style);
      if (!it.text) console.error(`XM.tag: tag ${i + 1} has no text (set it from the voice-over; there is no default text)`);
      it.text = String(it.text || ' ');
      it.chars = [...it.text];
      const len = it.chars.reduce((n, c) => n + (CJK.test(c) ? 1 : c === ' ' ? .3 : .55), 0);
      if (len > 8.6) console.warn(`XM.tag: "${it.text}" is too long (about ${len.toFixed(1)} characters wide); a tag holds a verdict / keyword of about 8 characters at most, use XS.doc or big type for long sentences`);
      if (/[。]$/.test(it.text)) console.warn(`XM.tag: "${it.text}" should not end with a full stop`);
      if (it.at == null) { if (o.at != null) it.at = o.at + i * (o.stagger ?? .8); else console.error(`XM.tag: "${it.text}" has no at (or a group o.at + stagger)`); }
      it.at = it.at ?? 0;
      if ((it.x == null || it.y == null) && !derived(i)) console.error(`XM.tag: "${it.text}" needs a position x, y (with anchor it sets where the tag sits)`);
      if (PR && i === 1 && (src.x != null || src.y != null)) console.warn('XM.tag: the second tag of a pair is placed from the first, x, y ignored (to move it change pair.overlap / gap)');
      it.own = !(derived(i) && (PR || src.x == null || src.y == null));
      it.size = it.size ?? (derived(i) && prevSize ? prevSize : paper ? PAPER_D.size : BAR_D.size);     // later stack / pair items default to the previous item's size
      prevSize = it.size;
      if (it.size < 56 && !o.mapScale && !it.small) console.warn(`XM.tag: "${it.text}" size ${it.size} < 56 (text meant to be read needs at least 56px, about 32px in a portrait window)`);
      it.seed = it.seed ?? (17 + i * 13);
      it.ph = it.ph ?? i * 2.1;
      it.color = it.color || {};
      // Highlighted chars
      it.hiSet = new Set();
      if (it.hi != null && it.hi !== false) {
        if (typeof it.hi === 'number') for (let k = Math.max(0, it.chars.length - it.hi); k < it.chars.length; k++) it.hiSet.add(k);
        else if (Array.isArray(it.hi)) it.hi.forEach(k => it.hiSet.add(k));
        else { const h = [...String(it.hi)], s0 = it.text.indexOf(String(it.hi)); if (s0 < 0) console.error(`XM.tag: hi "${it.hi}" is not in "${it.text}"`);
          else { const ci = [...it.text.slice(0, s0)].length; for (let k = 0; k < h.length; k++) it.hiSet.add(ci + k); } }
      }
      if (it.sub != null) {
        if (!paper) { console.warn('XM.tag: the bar style has no English sub-line; sub ignored'); it.sub = null; }
        else if (CJK.test(it.sub)) { console.error(`XM.tag: sub takes English only ("${it.sub}")`); it.sub = null; }
      }
      if (paper) {
        it.sq = it.sq ?? PAPER_D.sq; it.delay = it.delay ?? PAPER_D.delay; it.clear = it.clear ?? PAPER_D.clear; it.stripIn = it.stripIn ?? PAPER_D.strip;
        it.pw = it.pw ?? PAPER_D.pw; it.blur0 = it.blur0 ?? PAPER_D.blur0; it.soft = it.soft ?? PAPER_D.soft; it.lead = it.lead ?? PAPER_D.lead; it.perChar = it.perChar ?? PAPER_D.perChar;
        if (it.enter === 'cut' && it.rise) console.warn('XM.tag: enter:\'cut\' does not settle, rise ignored');
        it.rise = it.rise === false || it.enter === 'cut' ? null : { ...PAPER_D.rise, ...(typeof it.rise === 'object' ? it.rise : {}) };
      } else {
        it.from = it.from || 'left'; if (it.from !== 'left' && it.from !== 'right') console.error('XM.tag: bar from must be left / right');
        it.dist = it.dist ?? BAR_D.dist * it.size; it.hold = it.hold ?? 0; it.skew = it.skew ?? BAR_D.skew;
        it.square = it.square ?? true;
        if (it.mosaic != null) console.warn('XM.tag: the bar style has no left-end mosaic; mosaic option ignored');
        if (it.rise) console.warn('XM.tag: rise is only for paper; bar slides in with from / dist');
      }
      const sw = it.sway ?? (paper && it.enter !== 'cut');          // hard-cut labels don't sway by default (they stay fixed)
      it.swayO = sw ? { ...PAPER_D.sway, ...(typeof sw === 'object' ? sw : {}) } : null;
      const OD = it.enter === 'cut' ? { mode: 'cut', dur: 0 } : paper ? PAPER_D.out : BAR_D.out;
      it.outO = it.out == null ? null : typeof it.out === 'number' ? { ...OD, at: it.out } : { ...OD, ...it.out };
      if (it.outO && it.outO.at == null) { console.error(`XM.tag: "${it.text}" out needs at`); it.outO = null; }
      if (it.point) { const p = Array.isArray(it.point) ? { x: it.point[0], y: it.point[1] } : { ...it.point }; p.at = p.at ?? it.at + .12; it.pointO = p; }
      // Sound
      const sfx = o.sfx === false || it.sfx === false ? null : typeof it.sfx === 'string' ? it.sfx : paper ? SFX.tag : SFX.appear;
      const ct = paper || it.enter === 'cut' ? it.at : it.at + it.hold;
      if (sfx && !cues.some(c => Math.abs(c.t - ct) < .25)) cues.push({ t: +ct.toFixed(3), name: sfx });
      return it;
    });
    cues.sort((a, b) => a.t - b.t);

    // ---------- Stack / pair: on first draw (fonts loaded, text measurable) derive the positions of the later items ----------
    const FR = a => { if (Array.isArray(a)) return a; a = a || 'tl'; if (a === 'pin') return [0, 0];
      return [a.includes('l') ? 0 : a.includes('r') ? 1 : .5, a.includes('t') ? 0 : a.includes('b') ? 1 : .5]; };
    function boxOf(it) { const Lo = layout(it), [ax, ay] = anchorPt(it, Lo), b = Lo.box; return { x0: it.x - ax + b.x, y0: it.y - ay + b.y, w: b.w, h: b.h }; }
    let resolved = false, Q = null;
    function resolve() {
      if (resolved || !list.length) return; resolved = true;
      if (ST) {
        const u = ST.unit === 'px' ? 1 : layout(list[0]).box.h, sx = ST.dir.includes('l') ? -1 : 1, sy = ST.dir.includes('u') ? -1 : 1;
        for (let i = 1; i < list.length; i++) {
          const it = list[i]; if (it.own) continue;
          if (it.anchor == null) it.anchor = list[i - 1].anchor;
          const pb = boxOf(list[i - 1]), [fx, fy] = FR(it.anchor);       // the point on the previous strip's box matching this item's anchor, plus the offset
          it.x = pb.x0 + fx * pb.w + sx * ST.dx * u; it.y = pb.y0 + fy * pb.h + sy * ST.dy * u;
        }
      }
      if (PR && list.length === 2) {
        const A = list[0], B = list[1], a = boxOf(A), h = a.h, rd = PR.dir === 'rd';
        B.anchor = rd ? 'tl' : 'tr'; B._L = null;
        const ov = Math.min(PR.overlap * h, .3 * a.w);            // short labels (2–3 chars): step back at most .3 strip widths, otherwise item 2 lands right under item 1 and the offset disappears
        B.x = rd ? a.x0 + a.w - ov : a.x0 + ov; B.y = a.y0 + a.h + PR.gap * h;
        if (PR.q) {
          const qs = PR.qSize * A.size, cap = .653 * qs;          // StixIt cap height ≈ .653 x font size
          Q = { size: qs, x: rd ? a.x0 + a.w + PR.qx * h : a.x0 - PR.qx * h, rd, base: a.y0 + a.h + PR.gap * h / 2 + cap / 2, at: PR.qAt ?? A.at, dur: PR.qDur };
        }
      }
    }
    // The small italic question between the pair: soft-wiped left to right (not char by char); exits with item 1
    function drawQ(c, t, M0, P) {
      if (!Q || t < Q.at - 1e-6) return;
      const A = list[0]; let a = PR.qAlpha;
      if (A.outO && t >= A.outO.at - 1e-6) { if (A.outO.mode === 'cut') return; const k = cl((t - A.outO.at) / A.outO.dur); if (k >= 1) return; a *= 1 - k; }
      const L = XM.canvas('xm-tag:q', c.canvas.width, c.canvas.height), q = L.g;
      q.setTransform(M0); q.font = `500 ${Q.size}px ${FONT.sub}`; q.letterSpacing = '0px'; q.textBaseline = 'alphabetic'; q.textAlign = Q.rd ? 'left' : 'right';
      q.fillStyle = PR.qColor || DS.pick(onBg(P), [PAPER, INK]); q.fillText(PR.q, Q.x, Q.base);     // default: off-white or ink depending on the background (o.on sets it)
      const w = q.measureText(PR.q).width, x0 = Q.rd ? Q.x : Q.x - w, k = cl((t - Q.at) / Math.max(.01, Q.dur));
      if (k < 1) {
        const soft = .18 * w, f = x0 - soft + (w + 2 * soft) * k, gr = q.createLinearGradient(f - soft / 2, 0, f + soft / 2, 0);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        q.globalCompositeOperation = 'destination-in'; q.fillStyle = gr; q.fillRect(x0 - soft * 2, Q.base - Q.size * 1.2, w + soft * 4, Q.size * 1.6); q.globalCompositeOperation = 'source-over';
      }
      q.setTransform(1, 0, 0, 1, 0, 0);
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = a; c.drawImage(L.c, 0, 0); c.restore();
    }

    let occImg = null;
    if (o.occlude && typeof o.occlude === 'object' && o.occlude.src) occImg = XM.image(o.occlude.src);
    const onBg = P => { const v = o.on || (P.stage === 'paper' ? 'light' : 'dark'); return v === 'light' ? '#ffffff' : v === 'dark' ? '#111111' : v; };
    let checked = false, last = [], lastT = null;

    function draw(g, t, P) {
      P = P || DS.tone('ink');
      if (o.pin && XM.tex) XM.tex.flush(g, P);          // pinned: finish the texture layer's push / post first so labels don't zoom with it (flush runs once; later HUD calls don't repeat it)
      resolve();
      const cw = g.canvas.width, ch = g.canvas.height, M0 = o.pin ? new DOMMatrix() : g.getTransform(), dev0 = Math.hypot(M0.a, M0.b);
      const vis = [];
      for (const it of list) {
        if (!it.chars.length) continue;
        const st = state(it, t); if (!st || st.alpha <= .002) continue;
        const Lo = layout(it);
        // Placement: anchor -> (x, y) (through map if given), then add entry / sway offsets
        let x = it.x, y = it.y, sc = 1;
        if (o.map) {
          [x, y] = o.map(it.x, it.y, t);
          if (o.mapScale) { const [x1, y1] = o.map(it.x + 100, it.y, t); const [a0, b0] = o.map(it.x, it.y, it.at), [a1, b1] = o.map(it.x + 100, it.y, it.at);
            sc = Math.hypot(x1 - x, y1 - y) / Math.max(1e-6, Math.hypot(a1 - a0, b1 - b0)); }
        }
        const [ax, ay] = anchorPt(it, Lo), b = Lo.box, rot = (it.rot || 0) * Math.PI / 180;
        const m = new DOMMatrix().translateSelf(x + st.dx * sc, y + st.dy * sc).rotateSelf(0, 0, ((it.rot || 0)))
          .scaleSelf(sc, sc).translateSelf(st.slide + st.sx, st.sy).translateSelf(b.x + b.w / 2 - ax, b.y + b.h / 2 - ay)
          .rotateSelf(0, 0, st.sr * 180 / Math.PI).translateSelf(-(b.x + b.w / 2), -(b.y + b.h / 2));
        it._dev = dev0 * sc;
        st.pinCol = it.color.pin || pinColor(g, M0.multiply(m), it, Lo, P);
        vis.push({ it, st, Lo, m, rot });
      }
      if (!checked && vis.length) { checked = true; selfCheck(M0); }
      last = []; lastT = t;
      const qOn = Q && t >= Q.at - 1e-6;
      if (!vis.length && !qOn) return;
      const C = XM.canvas('xm-tag:C', cw, ch);
      if (qOn) drawQ(C.g, t, M0, P);
      // Connector lines (under all strips)
      for (const v of vis) if (v.it.pointO) connector(C.g, v, t, P, M0, onBg(P));
      for (const v of vis) {
        const { it, st, Lo, m } = v;
        const c = C.g;
        if (st.onlyPin) { c.save(); c.setTransform(M0.multiply(m)); pinDot(c, it, st, Lo, P); c.restore(); continue; }
        const L = XM.canvas('xm-tag:L', cw, ch), q = L.g;
        q.setTransform(M0.multiply(m)); body(q, it, st, Lo, P);
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = st.alpha;
        const bpx = st.blur * it._dev + (st.soft || 0);
        if (st.smear > 1) {           // horizontal motion blur (distance travelled within a .3-frame shutter)
          const d = M0.multiply(m).transformPoint({ x: 1, y: 0 }), d0 = M0.multiply(m).transformPoint({ x: 0, y: 0 }), ux = d.x - d0.x, uy = d.y - d0.y;
          const N = Math.max(2, Math.min(24, Math.ceil(st.smear * it._dev / 2))), A = XM.canvas('xm-tag:acc', cw, ch);   // at least 2 samples: with N = 1, k/(N−1) = 0/0 and the label wouldn't draw at all (shows as a flash)
          A.g.globalCompositeOperation = 'lighter'; A.g.globalAlpha = 1 / N;
          for (let k = 0; k < N; k++) { const f = st.smear * (k / (N - 1) - .5); A.g.drawImage(L.c, ux * f, uy * f); }
          c.drawImage(A.c, 0, 0);
        } else {
          if (bpx > .3) c.filter = `blur(${bpx.toFixed(2)}px)`;
          c.drawImage(L.c, 0, 0);
        }
        c.restore();
        if (it.style === 'paper') { c.save(); c.setTransform(M0.multiply(m)); pinDot(c, it, st, Lo, P); c.restore(); }
        const MM = M0.multiply(m), b = Lo.box;
        last.push({ text: it.text, alpha: st.alpha, pts: [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([px, py]) => { const p = MM.transformPoint({ x: px, y: py }); return [Math.round(p.x), Math.round(p.y)]; }) });
      }
      // Hidden behind the subject: cut the labels with the silhouette's alpha only
      if (o.occlude) {
        const c = C.g; c.save(); c.setTransform(M0); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = 1;
        if (typeof o.occlude === 'function') o.occlude(c, t);
        else if (occImg && occImg.ok) { const [bx, by, bw, bh] = o.occlude.box; c.drawImage(occImg.img, bx, by, bw, bh); }
        c.restore();
      }
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
      g.drawImage(C.c, 0, 0); g.restore();
      for (const it of list) XM.note(FONT[it.style], it.text);
      for (const it of list) if (it.sub) XM.note(FONT.sub, it.sub);
      if (PR && PR.q) XM.note(FONT.sub, PR.q);
    }
    // Connector: a thin straight line from the strip edge point nearest the target to the target (target fixed, line start follows the sway), small square at the end
    function connector(c, v, t, P, M0, bgHex) {
      const { it, st, Lo, m } = v, p = it.pointO, k = XM.expoOut(cl((t - p.at) / .35));
      if (k <= 0) return;
      let [tx, ty] = o.map ? o.map(p.x, p.y, t) : [p.x, p.y];
      const inv = m.inverse(), lp = inv.transformPoint({ x: tx, y: ty }), b = Lo.box;
      const sx = cl(lp.x, b.x, b.x + b.w), sy = cl(lp.y, b.y, b.y + b.h);
      if (sx === lp.x && sy === lp.y) return;                           // target inside the label: no line
      const s0 = m.transformPoint({ x: sx, y: sy }), ex = lerp(s0.x, tx, k), ey = lerp(s0.y, ty, k);
      const col = it.color.line || DS.pick(bgHex, it.style === 'paper' ? [P.mark, PAPER, INK] : [PAPER, INK, P.mark]);
      const lw = Math.max(2.5, .035 * it.size), es = Math.max(9, .13 * it.size);
      c.save(); c.setTransform(M0); c.globalAlpha = st.alpha * Math.min(1, st.alpha / .5);
      c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'butt'; c.beginPath(); c.moveTo(s0.x, s0.y); c.lineTo(ex, ey); c.stroke();
      if (k > .85) { c.globalAlpha *= (k - .85) / .15; c.fillStyle = col; c.fillRect(tx - es / 2, ty - es / 2, es, es); }
      c.restore();
    }
    // Self-check (once, on first draw): console.warn if a settled box leaves the frame or overlaps another
    function selfCheck(M0) {
      const boxes = list.map(it => {
        const Lo = layout(it), b = Lo.box, [ax, ay] = anchorPt(it, Lo);
        let x = it.x, y = it.y; if (o.map) [x, y] = o.map(it.x, it.y, it.at);
        const m = M0.multiply(new DOMMatrix().translateSelf(x, y).rotateSelf(0, 0, it.rot || 0).translateSelf(-ax, -ay));
        const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([px, py]) => m.transformPoint({ x: px, y: py }));
        return { it, x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) };
      });
      for (const B of boxes) if (B.x0 < 0 || B.y0 < 0 || B.x1 > W || B.y1 > H) console.warn(`XM.tag: "${B.it.text}" ends up outside the frame (${[B.x0, B.y0, B.x1, B.y1].map(Math.round)})`);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i], B = boxes[j], ov = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), oh = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
        const live = (A.it.outO ? A.it.outO.at : 1e9) > B.it.at && (B.it.outO ? B.it.outO.at : 1e9) > A.it.at;
        if (live && ov > 4 && oh > 4) console.warn(`XM.tag: "${A.it.text}" and "${B.it.text}" overlap once settled`);
      }
    }
    return { draw, cues, items: list, boxes: t => (t == null || t === lastT ? last : []), api: { layout: i => layout(list[i]) } };
  }

  // Attach to a ready-made shot: labels are drawn just before the shot's HUD (texture-layer push / window light / post apply to them;
  // with o.pin they are drawn after post). cues are merged into shot.cues.
  // shots can be an array of adjacent shots (pinned labels across a cut): the same labels are drawn on each, same screen position,
  // unbroken across the cut; cues go to the first shot only.
  function on(shots, items, o = {}) {
    const arr = Array.isArray(shots) ? shots : [shots];
    if (!arr.length || arr.some(s => !s || typeof s.update !== 'function')) { console.error('XM.tag.on: the first argument must be a shot returned by a component (with update), or an array of shots'); return shots; }
    const T = make(items, o);
    arr.forEach((shot, k) => {
      const up = shot.update;
      shot.update = function (t, kS) {
        const hud0 = DS.hud; let done = false;
        DS.hud = function (g, tt, P, oo) { if (!done) { done = true; T.draw(g, tt, P); } return hud0.call(this, g, tt, P, oo); };
        try { up.call(this, t, kS); } finally { DS.hud = hud0; }
        if (!done && shot.S && shot.S.g) T.draw(shot.S.g, t, DS.tone(o.tone || 'ink'));   // this shot drew no HUD (hud:false): draw labels on top (no post)
      };
      if (k === 0) shot.cues = (shot.cues || []).concat(T.cues);
      shot.tags = T;
    });
    return shots;
  }

  function tag(items, o) { return make(items, o); }
  tag.on = on;
  tag.PAPER = PAPER_D; tag.BAR = BAR_D; tag.STRIP = STRIP;
  XM.tag = tag;
})();
