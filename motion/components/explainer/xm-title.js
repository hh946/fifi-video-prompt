// XM.titleCard: concept title card. One subject (3D object / cutout) + a large English concept name + a Chinese name or
// question + an optional small English line. Letters resolve from blurred to sharp one by one while the line slides; an optional
// thin arc sweeps in behind the subject, and an optional frosted-glass card slowly recedes behind it.
// API: XM.titleCard(o) -> shot { L, update, cues, api }; XM.trackTitle(o) -> { draw, cues, box } (one short title with the
// tracking-in entrance, drawn inside any shot). Docs: docs/components/title.md.
// Requires lib.js, xk.js, xm-core.js, xm-ds.js, xm-tex.js (loaded before this file). Canvas 2D (XM.shot); the subject can be a
// transparent PNG, a PNG sequence, your own draw function, or three.js (rendered through the shared XM.drawGL renderer).
// Deterministic: no Math.random / Date; use XM.rng in the caller if you need randomness.
// Fonts: PlayIt (Playfair Display Italic), Grot (condensed Inter Tight), StixIt, SerifSC, HeiSC.
// Style rules: text never glows and has no drop shadow; flat solid color from the design system (ink / off-white / one accent).
// Surface texture (dark grid, paper, window light, vignette, grain, slow push) belongs to XM.tex.use; this component only calls XM.DS.stage.
//
// XM.titleCard(o) -> { L, update, cues, api }
//   A framework: the words, the subject, placement and whether to draw the arc are all chosen per video. No default text, no default subject.
//   Content (required; missing fields log console.error):
//     title : { text (English only), at, font:'serif' (PlayIt, default)|'grot' (condensed Inter Tight)|'stix', w, size (px; default from layout), squeeze, skew, rot (deg),
//               color:'fg'|'mute'|'accent'|'#hex', alpha, dir:'h'|'v' (v = rotated 90°, reads top to bottom),
//               enter:'focus' (default, letter-by-letter blur-to-sharp)|'fade'|'cut'|'track', reveal:{ per, dur, blur (x font size), bdur, gain, bexp, starts:[s…], durs:[s…] },
//               slide:{ dist:80, dur, pow } | false; position (overrides the layout): left / right / cx and top / bottom / cy / baseline (screen px, measured on glyph ink) }
//     zh    : { text (Chinese name / question; full stops removed, ? and ! kept unless marks:false), at, fam:'serif' (Source Han Serif 900, sheared + condensed)|'hei' (Source Han Sans 900), size (>= 56),
//               squeeze, skew, ls (letter spacing px), dir:'h'|'v' (v = vertical, one upright char per line), enter:'focus'|'type' (typewriter)|'wipe'|'cut'|'track', reveal / type / wipe, slide, position as above }
//     subject: required, one of: src:'x.png' (transparent PNG) | seq:{ files:[…], fps:30 } (PNG sequence, plays from at and holds the last frame)
//               | draw(g, t, P, api) (custom; needs box) | gl:{ scene, camera, update(t), tone, exposure } (three.js via the shared renderer; needs box)
//               placement: box:[x, y, w, h] | cx, cy, h (or w) | x (center), bottom, h; at, enter:'cut'|'focus'|'fade', dur, blur (initial blur px for focus)
//               shadow:{ a, blur, dx, dy, near } (soft shadow from the subject silhouette; near text it drops to `near`, default .25 — keep shadow light where it touches text)
//               halo:{ a, r, a2, r2 } (soft haze around the subject edge; off by default, never applied to text)
//   Optional:
//     en    : { text (English only), at, size (default 48; decorative subtitle, carries no information), font:'stix', w, color, alpha, dir, enter:'focus'|'wipe'|'cut'|'track', reveal / wipe, slide, position as above }
//     arc   : true (automatic: from one side of the frame to the other, passing behind the subject) | { pts:[[x,y]…] (custom path) | from, to, via, k (steepness of the auto S-curve),
//               at, dur:1.6, pow:2.4 (head position 1−(1−k)^pow), width, color, alpha, fade (end fade, fraction of length), blur, keys:[[t, 0..1]…] }
//     card  : true | { box:[cx, cy, w, h] (center + size; default derived from the subject), r (corner radius / width), to:.832 (final scale), dur:2.67, kick:.2, tau:.1, frost:5, textFrost:1.2, face, edge, at }
//     layout: 'corner' (default: English name top-left, subject centered, Chinese bottom-right) | 'side' (subject on one side, text stacked on the other)
//             | 'center' (English name centered behind the subject, Chinese / English below) | 'spine' (English name vertical along one edge, Chinese in a vertical column, subject on the other side).
//             Every position / size gets a layout-based default; anything set in the options overrides it.
//     safe  : content area [x0, y0, x1, y1], default [150, 130, 1770, 950] (clear of the corner HUD and the bottom-right disclaimer)
//     tone  : 'ink' (default) | 'paper' | 'accent'; texture via XM.tex.use(shot, { stage, light, post, push })
//     sfx   : { title, zh, en, arc }, each a sound name or false. Defaults: title -> title (sparkle); zh -> appear (tik), or type (typing) for enter:'type'; the rest silent. false = no sound at all
//     hud   : { tl, bl, br } | false (you write the corner text; no default words); draw(g, t, P, api): extra drawing after the subject, before the HUD; cam: same as other XM shots
//   api.boxes() -> { title, zh, en (on-screen ink boxes [x0, y0, x1, y1]), subject ([x, y, w, h]), card }: for checking overlaps / text leaving the frame.
//   Tracking-in entrance (enter:'track' on title / zh / en; see "tracking" in docs/components/title.md): characters start tightly packed
//     (track.from = −.10 x font size, slightly overlapping) and spread along the reading direction to the final spacing (I.ls, or track.ls = .30 x font size), center fixed.
//     Exponential ease-out (tau = .38 s) while resolving from blur: .08 s fade-in, initial blur .05 x font size clearing over .15 s, plus slight motion blur
//     along the reading direction while spreading (shutter .5 frame). track:{ from, ls, tau, fade, blur, bdur, shutter, origin:'c'|'l'|'r' }.
//     track does not combine with slide (no slide by default when track is set). **Short titles only** (concept / chapter names, <= 6 characters);
//     not for subtitle-like sentences (> 6 characters -> console.warn).
//   One line on its own (no subject, no card): XM.trackTitle(o) -> { draw(g, t, P), cues, box() }, called from any shot's draw (see end of file).
//   Default timing: English name letters every .055 s, each .15 s blur-to-sharp (initial blur 15% of font size), whole line slides 80 px over 1.28 s;
//     arc draws in 1.6 s; card recedes to 83% in 2.67 s (the first frame jumps part of the way); Chinese chars every .08 s, each .16 s; small English every .016 s, each .23 s.
(() => {
  const { W, H } = XK;
  const DS = XM.DS;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fps = () => (window.VIDEO && VIDEO.fps) || 30;
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  const sstep = (a, b, x) => { const k = cl((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const ease = e => (XM.tex ? XM.tex.ease(e) : (k => k));
  const RAD = Math.PI / 180;

  // Fonts: English name PlayIt / condensed Grot / StixIt; Chinese Source Han Serif 900 (sheared + condensed) / Source Han Sans 900
  const LATIN = {
    serif: { fam: 'PlayIt', w: 600, squeeze: .8, skew: 0, cap: .708 },      // Playfair Display Italic: high-contrast italic serif
    grot: { fam: 'Grot', w: 600, squeeze: .6, skew: 0, cap: .727 },        // condensed Inter Tight: narrow grotesque
    stix: { fam: 'StixIt', w: 400, squeeze: 1, skew: 0, cap: .653 },       // small italic English line
  };
  const HAN = {
    serif: { fam: 'SerifSC', w: 900, squeeze: .61, skew: .19 },            // Source Han Serif Heavy, sheared .19, condensed to .61
    hei: { fam: 'HeiSC', w: 900, squeeze: 1, skew: 0 },
  };
  // Default timing (see the header)
  const REVEAL = {
    title: { per: .055, dur: .15, blur: .15, bdur: .12, gain: 1.35, bexp: 1.2 },     // letters .055 s apart, each resolves in .15 s; initial blur .15 x font size
    zh: { per: .08, dur: .16, blur: .16, bdur: .14, gain: 1.35, bexp: 1.33 },        // chars .08 s apart, each resolves in .16 s; initial blur .16 x font size
    en: { per: .016, dur: .233, blur: .21, bdur: .233, gain: 1.2, bexp: 1.6 },       // letters .016 s apart, each .23 s
  };
  const SLIDE = { title: { dist: 80, dur: 1.28, pow: 3.27 }, zh: { dist: 80, dur: .96, pow: 3.27 }, en: { dist: 80, dur: .92, pow: 3.2 } };   // remaining offset = dist·(1−k)^pow
  const TYPE = { lead: .167, per: .033, ramp: .067, blink: .067 };     // typewriter: cursor blinks in cell 1 during lead (on / off every blink s), then one char every per s
  const WIPE = { dur: .83, soft: .15, ease: 'linear' };                // left-to-right wipe; soft edge = soft x line length
  // Tracking-in: start spacing −.10 x font size, final .30, exponential ease-out tau = .38 s
  const TRACK = { from: -.1, ls: .3, tau: .38, fade: .08, blur: .05, bdur: .15, shutter: .5, origin: 'c' };
  // Glyph i of n (spaces count) at u seconds: offset along the reading direction (relative to its final position), velocity, opacity, blur
  function trackAt(n, i, u, size, lsF, Tk) {
    const D = (lsF / size - Tk.from) * size, e = Math.exp(-Math.max(0, u) / Tk.tau), sh = Tk.origin === 'l' ? 0 : Tk.origin === 'r' ? (n - 1) : (n - 1) / 2;
    const off = -(i - sh) * D * e, vel = (i - sh) * D * e / Tk.tau;
    return { off, vel, a: Math.min(1, Math.max(0, u / Math.max(1e-3, Tk.fade))), b: Tk.blur * size * Math.max(0, 1 - u / Math.max(1e-3, Tk.bdur)) };
  }
  // Draw one glyph with motion blur along the reading direction: N copies across the shutter, each at alpha 1 − (1 − a)^(1/N), so the overlap adds up to a and the trail fades
  function trackGlyph(drawAt, st, fpsv, Tk) {
    const dist = Math.abs(st.vel) * Tk.shutter / fpsv, N = Math.max(1, Math.min(10, Math.ceil(dist / 1.5)));
    const al = N > 1 ? 1 - Math.pow(1 - Math.min(.999, st.a), 1 / N) : st.a;
    for (let k = 0; k < N; k++) drawAt(st.off + (N > 1 ? (k / (N - 1) - .5) * dist * Math.sign(st.vel) : 0), al, st.b);
  }
  const ARC = { dur: 1.6, pow: 2.4, width: 4.2, alpha: .6, fade: .06, blur: .6, k: 4 };   // thin arc: head position 1−(1−k)^2.4
  const CARD = { r: .05, to: .832, dur: 2.67, kick: .2, tau: .1, frost: 5, textFrost: 1.2, aspect: 2.21 };   // frosted card: shrinks to .832; jumps part of the way on the first frame (kick), then roughly linear
  const SAFE = [150, 130, 1770, 950];
  const LAYOUTS = ['corner', 'side', 'center', 'spine'];

  let ID = 0;
  function titleCard(o = {}) {
    const id = ++ID, err = m => console.error('XM.titleCard: ' + m);
    const P = { ...DS.tone(o.tone || 'ink') }, dark = DS.lum(P.bg) < .4;
    const colOf = c => (!c || c === 'fg' ? P.fg : c === 'mute' ? P.mute : c === 'accent' ? P.accent : c === 'mark' ? P.mark : c);
    const lay = o.layout || 'corner';
    if (!LAYOUTS.includes(lay)) err(`layout must be ${LAYOUTS.join(' / ')}, got ${lay}`);
    const TI = o.title || {}, ZI = o.zh || {}, EI = o.en || null, SI = o.subject || null;
    if (!TI.text) err('title.text is required (the English concept name; there is no default)');
    else if (CJK.test(TI.text)) err('title takes English only; put CJK text in zh');
    if (TI.at == null) err('title.at is required (when the English name starts to appear, absolute seconds)');
    if (!ZI.text) err('zh.text is required (a native-language name or question: not every viewer reads English)');
    if (ZI.text && ZI.at == null) err('zh.at is required');
    if (EI && (!EI.text || EI.at == null)) err('en needs text and at (leave en out if you do not want it)');
    if (EI && EI.text && CJK.test(EI.text)) err('en takes English only');
    if (!SI) err('subject is required: src (transparent PNG) | seq (PNG sequence) | draw | gl; there is no default subject');
    for (const [I, nm] of [[TI, 'title'], [ZI, 'zh'], [EI, 'en']]) if (I && I.enter === 'track' && I.text) shortCheck(String(I.text), 'XM.titleCard ' + nm);

    // ---------- subject ----------
    const subj = SI ? (() => {
      const s = SI, S = { o: s };
      if (s.seq) { if (!s.seq.files || !s.seq.files.length) err('subject.seq.files is empty'); S.frames = (s.seq.files || []).map(f => XM.image(f)); }
      else if (s.src) S.R = XM.image(s.src);
      else if (s.gl) { if (!s.gl.scene || !s.gl.camera) err('subject.gl needs scene and camera'); if (!s.box) err('subject.gl needs box:[x, y, w, h] (roughly the area the subject covers, for layout and shadow)'); }
      else if (s.draw) { if (!s.box) err('subject.draw needs box:[x, y, w, h]'); }
      else err('subject needs one of src / seq / draw / gl');
      S.img = t => {
        if (S.R) return S.R.ok ? S.R.img : null;
        if (S.frames) { const i = cl(Math.floor((t - (s.at ?? TI.at ?? 0)) * (s.seq.fps || 30) + 1e-6), 0, S.frames.length - 1); const r = S.frames[i]; return r && r.ok ? r.img : null; }
        return null;
      };
      S.aspect = () => { const im = S.R ? S.R.img : S.frames ? S.frames[0].img : null; return im && im.naturalWidth ? im.naturalWidth / im.naturalHeight : (s.box ? s.box[2] / s.box[3] : 1); };
      return S;
    })() : null;

    // ---------- one text line: measure (local coords: baseline y = 0, from the pen start rightwards; dir:'v' rotates Latin lines 90°, Chinese goes one char per line) ----------
    function spec(I, role) {
      if (role === 'zh') { const F = HAN[I.fam || 'serif'] || HAN.serif; return { fam: F.fam, w: I.w ?? F.w, squeeze: I.squeeze ?? F.squeeze, skew: I.skew ?? F.skew, cap: .88, han: true }; }
      const F = LATIN[I.font || (role === 'en' ? 'stix' : 'serif')] || LATIN.serif;
      return { fam: F.fam, w: I.w ?? F.w, squeeze: I.squeeze ?? F.squeeze, skew: I.skew ?? F.skew, cap: F.cap, han: false };
    }
    function cleanZh(s, marks) { let r = String(s).replace(/[。．]/g, ''); r = r.replace(/[，,、；;：:]+$/, ''); if (marks === false) r = r.replace(/[？！?!]/g, ''); return r; }
    const MG = XM.canvas('tc:measure', 16, 16, false).g;
    function measureLine(I, role, size) {
      const sp = spec(I, role), text = role === 'zh' ? cleanZh(I.text, I.marks) : String(I.text), chars = [...text], n = chars.length;
      const dir = I.dir || 'h', sq = sp.squeeze, sk = sp.skew, ls = I.ls ?? (I.enter === 'track' ? ((I.track && I.track.ls) ?? TRACK.ls) * size : 0);
      MG.font = `${sp.w} ${size}px ${sp.fam}`; MG.letterSpacing = '0px';
      const gl = [];
      if (sp.han && dir === 'v') {          // Chinese vertical: upright chars, one per line, stepped by font size
        const adv = size * (I.lh ?? 1.02) + ls;
        for (let i = 0; i < n; i++) { const m = MG.measureText(chars[i]); const w = m.width * sq;
          gl.push({ ch: chars[i], x: -w / 2, y: i * adv, l: -w / 2 + (-m.actualBoundingBoxLeft) * sq, r: -w / 2 + m.actualBoundingBoxRight * sq + sk * m.actualBoundingBoxAscent, t: i * adv - m.actualBoundingBoxAscent, b: i * adv + m.actualBoundingBoxDescent, cw: w }); }
      } else {                              // horizontal (Latin with dir:'v' is measured horizontally and rotated at draw time); positioned by prefix width to keep kerning (To, Av)
        for (let i = 0; i < n; i++) {
          const x = MG.measureText(chars.slice(0, i).join('')).width * sq + i * ls, m = MG.measureText(chars[i]);
          gl.push({ ch: chars[i], x, y: 0, l: x - m.actualBoundingBoxLeft * sq - Math.max(0, -sk) * m.actualBoundingBoxAscent, r: x + m.actualBoundingBoxRight * sq + Math.max(0, sk) * m.actualBoundingBoxAscent, t: -m.actualBoundingBoxAscent, b: m.actualBoundingBoxDescent, cw: m.width * sq });
        }
      }
      const ink = gl.filter(q => q.ch.trim());
      const box = ink.length ? [Math.min(...ink.map(q => q.l)), Math.min(...ink.map(q => q.t)), Math.max(...ink.map(q => q.r)), Math.max(...ink.map(q => q.b))] : [0, 0, 1, 1];
      XM.note(sp.fam, text);
      return { I, role, sp, text, chars, gl, box, size, dir, rot: (!sp.han && dir === 'v') ? 90 : (I.rot || 0), ox: 0, oy: 0 };
    }
    // local box -> screen box (origin ox, oy, rotated rot degrees)
    function sbox(Lp, ox = Lp.ox, oy = Lp.oy) {
      const [x0, y0, x1, y1] = Lp.box, a = Lp.rot * RAD, c = Math.cos(a), s = Math.sin(a), xs = [], ys = [];
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { xs.push(ox + x * c - y * s); ys.push(oy + x * s + y * c); }
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    // Place by on-screen ink box: one of left/right/cx and one of top/bottom/cy (or baseline = origin y); values set in the options win
    function place(Lp, want) {
      const I = Lp.I, w = { ...want };
      for (const k of ['left', 'right', 'cx']) if (I[k] != null) { delete w.left; delete w.right; delete w.cx; w[k] = I[k]; }
      for (const k of ['top', 'bottom', 'cy', 'baseline']) if (I[k] != null) { delete w.top; delete w.bottom; delete w.cy; delete w.baseline; w[k] = I[k]; }
      const b = sbox(Lp, 0, 0);
      Lp.ox = w.left != null ? w.left - b[0] : w.right != null ? w.right - b[2] : w.cx != null ? w.cx - (b[0] + b[2]) / 2 : 0;
      Lp.oy = w.baseline != null ? w.baseline : w.top != null ? w.top - b[1] : w.bottom != null ? w.bottom - b[3] : w.cy != null ? w.cy - (b[1] + b[3]) / 2 : 0;
      return Lp;
    }
    // Font size: use size if given; otherwise solve for ink height = capPx, then shrink so the long side <= maxLen
    function sized(I, role, capPx, maxLen, minSize = 0) {
      if (I.size) return measureLine(I, role, I.size);
      const m = measureLine(I, role, 100), vert = m.sp.han && m.dir === 'v';
      const capH = role === 'zh' ? (vert ? Math.max(...m.gl.filter(q => q.ch.trim()).map(q => q.b - q.t)) || 88 : m.box[3] - m.box[1]) : -m.box[1];   // Latin: height above baseline; Chinese: ink height of one char
      let s = 100 * capPx / Math.max(1, capH);
      const len = vert ? m.box[3] - m.box[1] : m.box[2] - m.box[0];
      if (maxLen && len * s / 100 > maxLen) s = 100 * maxLen / len;
      return measureLine(I, role, Math.max(minSize, Math.round(s * 10) / 10));
    }

    // ---------- layout: compute a good default (text ink placed inside safe; subject placed by layout unless given) ----------
    let LAY = null;
    function layout() {
      const C = o.safe || SAFE, CW = C[2] - C[0], CH = C[3] - C[1];
      const sb = (() => {      // subject box [x, y, w, h]
        if (!SI) return [W / 2 - 200, H / 2 - 200, 400, 400];
        if (SI.box) return SI.box.slice();
        const asp = subj.aspect();
        const D = { corner: { cx: W * .5, cy: H * .47, h: H * .5 }, side: { x: W * .74, bottom: H + 2, h: H * .92 }, center: { cx: W * .5, cy: H * .62, h: H * .56 }, spine: { cx: W * .36, cy: H * .55, h: H * .62 } }[lay] || {};
        const own = SI.cx != null || SI.cy != null ? 'c' : SI.x != null || SI.bottom != null ? 'b' : null;
        const s = own === 'c' ? { h: D.h, cx: D.cx ?? D.x, cy: D.cy ?? H / 2, ...SI } : own === 'b' ? { h: D.h, x: D.x ?? D.cx, bottom: D.bottom ?? H, ...SI } : { ...D, ...SI };
        const h = s.h ?? (s.w ? s.w / asp : H * .5), w = s.w ?? h * asp;
        if (s.bottom != null) { const x = s.x ?? W / 2; return [x - w / 2, s.bottom - h, w, h]; }
        return [(s.cx ?? W / 2) - w / 2, (s.cy ?? H / 2) - h / 2, w, h];
      })();
      const [sx, sy, sw, sh] = sb, scx = sx + sw / 2, scy = sy + sh / 2;
      let T, Z, E = null;
      const enSize = EI ? (EI.size ?? 48) : 0;
      if (lay === 'corner') {
        T = place(sized(TI, 'title', H * .25, W * .46), { left: C[0], top: C[1] });
        Z = place(sized(ZI, 'zh', H * .19, W * .42, 56), { right: C[2], baseline: C[3] });
        if (EI) { const zt = sbox(Z)[1]; E = place(measureLine(EI, 'en', enSize), { right: C[2], baseline: zt - enSize * .5 }); }
      } else if (lay === 'side') {
        const textRight = (SI && SI.side) === 'left', gap = W * .03;      // subject on the right by default, text on the left
        const room = textRight ? C[2] - (sx + sw - sw * .12) - gap : (sx + sw * .12) - C[0] - gap;
        T = sized(TI, 'title', H * .33, room);
        T = place(T, textRight ? { right: C[2], baseline: H * .57 } : { left: C[0], baseline: H * .57 });
        const tb = sbox(T), ind = (o.indent ?? .45) * (tb[2] - tb[0]), x0 = textRight ? tb[0] : tb[0] + ind;
        let y = tb[3] + H * .02;
        if (EI) { E = place(measureLine(EI, 'en', enSize), { left: x0, top: y }); y = sbox(E)[3] + H * .025; }
        Z = place(sized(ZI, 'zh', H * .1, room - ind, 56), { left: x0, top: y });
      } else if (lay === 'center') {      // English name centered at the top, subject in the middle covering its lower half (magazine-cover style); Chinese + small English stacked bottom-left
        T = place(sized(TI, 'title', H * .3, CW * .9), { cx: W / 2, top: C[1] + H * .03 });
        Z = place(sized(ZI, 'zh', H * .12, Math.max(200, sx - C[0] - W * .03), 56), { left: C[0], baseline: C[3] });
        if (EI) E = place(measureLine(EI, 'en', enSize), { left: C[0], baseline: sbox(Z)[1] - enSize * .55 });
      } else {      // spine: English name rotated 90° along the right edge (left edge when subject.side:'right'), Chinese vertical column next to it, small English rotated too
        const left = (SI && SI.side) === 'right';
        T = sized({ dir: 'v', ...TI }, 'title', W * .13, CH);
        T = place(T, left ? { left: C[0], cy: (C[1] + C[3]) / 2 } : { right: C[2], cy: (C[1] + C[3]) / 2 });
        const tb = sbox(T), gap = W * .022;
        Z = sized({ dir: 'v', ...ZI }, 'zh', H * .1, CH * .8, 56);
        Z = place(Z, left ? { left: tb[2] + gap, top: tb[1] + H * .02 } : { right: tb[0] - gap, top: tb[1] + H * .02 });
        if (EI) { const zb = sbox(Z); E = place(measureLine({ dir: 'v', ...EI }, 'en', enSize), left ? { left: zb[2] + gap * .6, top: zb[1] } : { right: zb[0] - gap * .6, top: zb[1] }); }
      }
      // Arc (auto: bottom-left -> behind the subject -> top-right; for 'center' the other way, top-left -> bottom-right)
      let arc = null;
      if (o.arc) {
        const A = o.arc === true ? {} : o.arc;
        let pts = A.pts ? A.pts.map(p => p.slice()) : null;
        if (!pts) {     // auto: from one side to the other, behind the subject, through the gaps between text lines (never over text)
          let from, to, via = A.via || [scx + sw * .06, scy + sh * .12];
          if (lay === 'center') { const tb = sbox(T), lo = (E ? sbox(E) : sbox(Z))[1]; from = [-40, (tb[3] + lo) / 2]; to = [W + 40, C[3] - H * .05]; via = A.via || [scx, scy + sh * .05]; }   // right end lands above the bottom-right HUD / disclaimer
          else if (lay === 'corner') { from = [-40, C[3] + H * .07]; to = [W + 40, C[1] - H * .07]; }
          else { from = [-40, C[3] + H * .06]; to = [W + 40, scy - sh * .3]; }
          if (A.from) from = A.from; if (A.to) to = A.to;
          pts = hermite(from, via, to, A.k ?? ARC.k);
        }
        arc = poly(pts);
      }
      // Card (center + size; default behind and below the subject: width = 1.69 x subject width, center .25 x subject height below the subject center)
      let card = null;
      if (o.card) {
        const K = o.card === true ? {} : o.card;
        const b = K.box || (() => { const w = sw * 1.69; return [scx + sw * .056, scy + sh * .25, w, w / CARD.aspect]; })();
        card = { cx: b[0], cy: b[1], w: b[2], h: b[3] };
      }
      return { T, Z, E, sb, arc, card, C };
    }
    const L0 = () => LAY || (LAY = layout());

    // Auto S-curve: monotonic in x, horizontal at both ends, slope at via = k x average slope (cubic Hermite), one point every 6 px
    function hermite(a, v, b, k) {
      const avg = (b[1] - a[1]) / (b[0] - a[0]), mv = k * avg, out = [];
      const seg = (p, q, m0, m1) => { const n = Math.max(4, Math.ceil((q[0] - p[0]) / 6)), dx = q[0] - p[0];
        for (let i = 0; i < n; i++) { const s = i / n, h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
          out.push([p[0] + dx * s, h00 * p[1] + h10 * dx * m0 + h01 * q[1] + h11 * dx * m1]); } };
      seg(a, v, 0, mv); seg(v, b, mv, 0); out.push(b.slice());
      return out;
    }
    // Polyline + cumulative length (sparse points are densified with Catmull-Rom first)
    function poly(pts) {
      let P2 = pts;
      if (pts.length >= 3) { P2 = []; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 6));
        for (let j = 0; j < n; j++) { const s = j / n, s2 = s * s, s3 = s2 * s;
          P2.push([0, 1].map(c => .5 * (2 * p1[c] + (-p0[c] + p2[c]) * s + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * s2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * s3))); } }
        P2.push(pts[pts.length - 1].slice()); }
      const cum = [0]; for (let i = 1; i < P2.length; i++) cum.push(cum[i - 1] + Math.hypot(P2[i][0] - P2[i - 1][0], P2[i][1] - P2[i - 1][1]));
      return { pts: P2, cum, len: cum[cum.length - 1] };
    }

    // ---------- draw one text line ----------
    // Per-glyph state: a (opacity), b (blur px), slide (offset along the reading direction)
    function glyphState(Lp, t, i) {
      const I = Lp.I, role = Lp.role, kind = I.enter || 'focus', at = I.at;
      if (kind === 'cut') return t >= at ? { a: 1, b: 0 } : null;
      if (kind === 'fade') { const k = cl((t - at) / (I.dur ?? .4)); return k > 0 ? { a: ease('easeOut')(k), b: 0 } : null; }
      if (kind === 'focus') {
        const R = { ...REVEAL[role], ...(I.reveal || {}) };
        const nIdx = Lp.gl.slice(0, i).filter(q => q.ch.trim()).length;     // spaces don't take a beat
        const s0 = at + (R.starts ? (R.starts[nIdx] ?? R.starts[R.starts.length - 1]) : nIdx * R.per), d = R.durs ? (R.durs[nIdx] ?? R.dur) : R.dur;
        const k = (t - s0) / d; if (k <= 0) return null;
        const kb = cl((t - s0) / (R.bdur ?? d));
        return { a: Math.min(1, k * R.gain), b: R.blur * Lp.size * Math.pow(1 - kb, R.bexp) };
      }
      return { a: 1, b: 0 };     // type / wipe are handled in drawLine
    }
    function slideOf(Lp, t) {
      const I = Lp.I; if (I.slide === false || (I.enter === 'track' && !I.slide)) return 0;
      const S = { ...SLIDE[Lp.role], ...(I.slide || {}) }, k = cl((t - I.at) / S.dur);
      return -S.dist * Math.pow(1 - k, S.pow);
    }
    function drawLine(g, t, Lp) {
      if (!Lp) return;
      const I = Lp.I, kind = I.enter || 'focus', at = I.at; if (t < at - 1e-6 && kind !== 'type') return;
      const color = colOf(I.color), A0 = I.alpha ?? 1, sp = Lp.sp, vert = sp.han && Lp.dir === 'v';
      const sl = slideOf(Lp, t), dxL = vert ? 0 : sl, dyL = vert ? sl : 0;
      const font = `${sp.w} ${Lp.size}px ${sp.fam}`;
      const glyph = (q, gg, a, b) => {
        if (a <= .002 || !q.ch.trim()) return;
        gg.save(); gg.globalAlpha = A0 * Math.min(1, a); gg.filter = b > .25 ? `blur(${b.toFixed(2)}px)` : 'none';
        gg.translate(q.x + dxL, q.y + dyL); if (sp.skew) gg.transform(1, 0, -sp.skew, 1, 0, 0); gg.scale(sp.squeeze, 1);
        gg.font = font; gg.fillStyle = color; gg.textBaseline = 'alphabetic'; gg.fillText(q.ch, 0, 0); gg.restore();
      };
      const frame = gg => { gg.translate(Lp.ox, Lp.oy); if (Lp.rot) gg.rotate(Lp.rot * RAD); };
      if (kind === 'type') {
        const Y = { ...TYPE, ...(I.type || {}) }, n = Lp.gl.length, u = t - at; if (u < 0) return;
        g.save(); frame(g);
        let typed = 0;
        for (let i = 0; i < n; i++) { const s0 = Y.lead + i * Y.per, k = (u - s0) / Y.ramp; if (k <= 0) break; typed = i + 1; glyph(Lp.gl[i], g, k, 0); }
        // Cursor: an underline. Blinks in cell 1 before typing (on blink, off blink), sits on the next cell while typing, gone when done
        let cell = -1;
        if (u < Y.lead) cell = Math.floor(u / Y.blink) % 2 === 0 ? 0 : -1;
        else if (typed < n) cell = typed;
        if (cell >= 0 && I.cursor !== false) { const q = Lp.gl[cell], th = Math.max(4, Lp.size * .055), cw = q.cw * .72;
          g.globalAlpha = A0 * .9; g.fillStyle = colOf(I.cursorColor || I.color);
          if (vert) g.fillRect(q.x + (q.cw - cw) / 2, q.y + Lp.size * .1, cw, th); else g.fillRect(q.x + (q.cw - cw) / 2, Lp.size * .1, cw, th); }
        g.restore(); return;
      }
      if (kind === 'track') {
        const Tk = { ...TRACK, ...(I.track || {}) }, u = t - at; if (u < 0) return;
        const lsF = I.ls ?? ((I.track && I.track.ls) ?? TRACK.ls) * Lp.size, n = Lp.gl.length;
        g.save(); frame(g);
        for (let i = 0; i < n; i++) {
          const q = Lp.gl[i]; if (!q.ch.trim()) continue;
          const st = trackAt(n, i, u, Lp.size, lsF, Tk);
          trackGlyph((d, al, b) => { g.save(); if (vert) g.translate(0, d); else g.translate(d, 0); glyph(q, g, al, b); g.restore(); }, st, fps(), Tk);
        }
        g.restore(); return;
      }
      if (kind === 'wipe') {
        const Wp = { ...WIPE, ...(I.wipe || {}) }, k = ease(Wp.ease)(cl((t - at) / Wp.dur)); if (k <= 0) return;
        const Lw = XM.canvas('tc:wipe'), q = Lw.g; q.save(); frame(q);
        for (const gq of Lp.gl) glyph(gq, q, 1, 0);
        const [x0, y0, x1, y1] = Lp.box, along = vert ? [y0, y1] : [x0, x1], len = along[1] - along[0], soft = Wp.soft * len, f = along[0] - soft + (len + 2 * soft) * k;
        const gr = vert ? q.createLinearGradient(0, f - soft / 2, 0, f + soft / 2) : q.createLinearGradient(f - soft / 2 + dxL, 0, f + soft / 2 + dxL, 0);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        q.globalCompositeOperation = 'destination-in'; q.globalAlpha = 1; q.filter = 'none'; q.fillStyle = gr; q.fillRect(-W * 2, -H * 2, W * 4, H * 4); q.restore();
        g.drawImage(Lw.c, 0, 0); return;
      }
      g.save(); frame(g);
      for (let i = 0; i < Lp.gl.length; i++) { const st = glyphState(Lp, t, i); if (st) glyph(Lp.gl[i], g, st.a, st.b); }
      g.restore();
    }

    // ---------- arc: fixed in screen space, drawn from the start to the head; both ends fade ----------
    function drawArc(g, t, A) {
      const S = { ...ARC, ...(o.arc === true ? {} : o.arc) }, at = S.at ?? TI.at;
      const k = S.keys ? XM.tex.kf(t, S.keys) : 1 - Math.pow(1 - cl((t - at) / S.dur), S.pow);
      if (t < at || k <= 0) return;
      const fl = A.len * k, Lr = XM.canvas('tc:arc'), q = Lr.g, col = colOf(S.color || 'fg'), fade = S.fade * A.len;
      q.lineCap = 'round'; q.lineJoin = 'round'; q.lineWidth = S.width; q.strokeStyle = col;
      for (let i = 0; i < A.pts.length - 1 && A.cum[i] < fl; i += 3) {
        const j = Math.min(i + 3, A.pts.length - 1), mid = (A.cum[i] + A.cum[j]) / 2;
        q.globalAlpha = S.alpha * sstep(0, fade, mid) * sstep(0, fade, A.len - mid);
        q.beginPath(); q.moveTo(...A.pts[i]);
        for (let m = i + 1; m <= j; m++) {
          if (A.cum[m] <= fl) q.lineTo(...A.pts[m]);
          else { const u = (fl - A.cum[m - 1]) / Math.max(1e-6, A.cum[m] - A.cum[m - 1]); q.lineTo(lerp(A.pts[m - 1][0], A.pts[m][0], u), lerp(A.pts[m - 1][1], A.pts[m][1], u)); break; }
        }
        q.stroke();
      }
      g.save(); g.globalCompositeOperation = dark ? 'screen' : 'source-over'; g.filter = S.blur > 0 ? `blur(${S.blur}px)` : 'none'; g.drawImage(Lr.c, 0, 0); g.restore();
    }

    // ---------- frosted glass card: center fixed, slowly recedes (shrinks) while its edge defocuses; face = blurred background + a white layer ----------
    function cardRect(t, Cd) {
      const K = { ...CARD, ...(o.card === true ? {} : o.card) }, at = K.at ?? TI.at, u = Math.max(0, t - at);
      const fr = K.kick * (1 - Math.exp(-u / K.tau)) + (1 - K.kick) * Math.min(1, u / K.dur), s = 1 - (1 - K.to) * fr;
      const w = Cd.w * s, h = Cd.h * s; return { x: Cd.cx - w / 2, y: Cd.cy - h / 2, w, h, r: w * K.r, fr, K };
    }
    const rr = (g, c, ins = 0) => { g.beginPath(); g.roundRect(c.x + ins, c.y + ins, c.w - 2 * ins, c.h - 2 * ins, Math.max(1, c.r - ins)); };
    function drawCard(g, t, Cd, behind, text) {
      const c = cardRect(t, Cd), K = c.K;
      const B = XM.canvas('tc:frost'); XM.tex.blurClamp(B.g, behind, K.frost);
      g.save(); rr(g, c); g.clip(); g.drawImage(B.c, 0, 0);
      if (text) { g.filter = `blur(${K.textFrost}px)`; g.globalAlpha = .9; g.drawImage(text, 0, 0); g.filter = 'none'; g.globalAlpha = 1; }
      g.fillStyle = `rgba(255,255,255,${K.face ?? (dark ? .125 : .32)})`; g.fillRect(c.x, c.y, c.w, c.h); g.restore();
      // Edge: thin bright stroke left / right / bottom; the straight top edge becomes a ~16 px soft bright band; faint outer glow. The further it recedes, the softer the edge
      const E = XM.canvas('tc:edge'), q = E.g, ea = K.edge ?? (dark ? .42 : .9);
      q.strokeStyle = `rgba(255,255,255,${ea})`; q.lineWidth = 2.2; rr(q, c, .4); q.stroke();
      q.save(); q.globalCompositeOperation = 'destination-out'; q.filter = 'blur(3px)'; q.fillStyle = 'rgba(0,0,0,.9)'; q.fillRect(c.x + c.r * 1.2, c.y - 6, c.w - c.r * 2.4, 12); q.restore();
      q.filter = 'blur(6px)'; q.strokeStyle = `rgba(255,255,255,${ea * .62})`; q.lineWidth = 7; q.beginPath(); q.moveTo(c.x + c.r * .8, c.y + 1); q.lineTo(c.x + c.w - c.r * .8, c.y + 1); q.stroke();
      q.filter = 'blur(8px)'; q.strokeStyle = `rgba(255,255,255,${ea * .2})`; q.lineWidth = 12; rr(q, c, -4); q.stroke(); q.filter = 'none';
      if (!dark) { q.strokeStyle = 'rgba(17,18,20,.12)'; q.lineWidth = 1.2; rr(q, c, -1.2); q.stroke(); }      // a white edge is invisible on paper: add a faint ink line outside
      const df = .6 + 2.6 * c.fr;
      g.save(); g.globalCompositeOperation = dark ? 'screen' : 'source-over'; g.filter = `blur(${df.toFixed(2)}px)`; g.drawImage(E.c, 0, 0); g.restore();
    }

    // ---------- subject layer ----------
    function subjectLayer(t, sb) {
      if (!subj) return null; const s = subj.o, at = s.at ?? TI.at;
      if (t < at - 1e-6 || (s.out != null && t >= s.out)) return null;
      const L = XM.canvas('tc:subj'), q = L.g, [x, y, w, h] = sb;
      if (s.draw) s.draw(q, t, P, api);
      else if (s.gl) { if (s.gl.update) s.gl.update(t); XM.drawGL(q, s.gl.scene, s.gl.camera, { tone: s.gl.tone ?? true, exposure: s.gl.exposure ?? 1 }); }
      else { const im = subj.img(t); if (!im) return null; q.imageSmoothingQuality = 'high'; q.drawImage(im, x, y, w, h); }
      return L;
    }
    function enterOf(t) {
      const s = subj.o, at = s.at ?? TI.at, kind = s.enter || 'cut';
      if (kind === 'cut') return { a: 1, b: 0 };
      const k = ease('easeOut')(cl((t - at) / (s.dur ?? .5)));
      return { a: k, b: kind === 'focus' ? (s.blur ?? 24) * (1 - k) : 0 };
    }
    let AVOID = null;
    function avoidFn() {         // Shadow is lighter near text: `near` inside / at the text ink box, back to full strength 0.6 x text height away
      if (AVOID) return AVOID;
      const { T, Z, E } = L0(), near = (SI.shadow && SI.shadow.near) ?? .25, boxes = [T, Z, E].filter(Boolean).map(Lp => { const b = sbox(Lp); return { b, r: Math.max(40, Math.min(b[2] - b[0], b[3] - b[1]) * .6) }; });
      return (AVOID = (x, y) => { let v = 1; for (const { b, r } of boxes) { const dx = Math.max(b[0] - x, 0, x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]); v = Math.min(v, lerp(near, 1, sstep(0, r, Math.hypot(dx, dy)))); } return v; });
    }

    // ---------- sound ----------
    const cues = [];
    if (o.sfx !== false) {
      const S = o.sfx || {}, add = (t, name, ex) => { if (name && t != null) cues.push({ t: +t.toFixed(3), name, ...(ex || {}) }); };
      add(TI.at, S.title === false ? null : (S.title || DS.SFX.title));
      if (ZI.text) { const ty = ZI.enter === 'type'; add(ZI.at + (ty ? ({ ...TYPE, ...(ZI.type || {}) }).lead : 0), S.zh === false ? null : (S.zh || (ty ? DS.SFX.type : DS.SFX.appear)), ty ? { dur: +(([...cleanZh(ZI.text, ZI.marks)].length) * ({ ...TYPE, ...(ZI.type || {}) }).per + .1).toFixed(3) } : null); }
      if (EI && S.en) add(EI.at, S.en);
      if (o.arc && S.arc) add((o.arc.at ?? TI.at), S.arc);
    }

    const api = { P, layout: () => L0(), boxes: () => { const l = L0(), b = Lp => (Lp ? sbox(Lp).map(v => Math.round(v)) : null);
      return { title: b(l.T), zh: b(l.Z), en: b(l.E), subject: l.sb.map(Math.round), card: l.card ? [l.card.cx - l.card.w / 2, l.card.cy - l.card.h / 2, l.card.cx + l.card.w / 2, l.card.cy + l.card.h / 2].map(Math.round) : null }; } };

    const shot = XM.shot({ bg: P.bg, stage: 'flat', cam: o.cam }, () => (g, t) => {
      const l = L0();
      DS.stage(g, P);                                   // the stage material set by XM.tex.use (stage) is applied here
      if (l.arc) drawArc(g, t, l.arc);
      // text (the subject sits on top of the big type: text first, then card and subject)
      const front = [l.T, l.Z, l.E].filter(Lp => Lp && Lp.I.layer === 'front'), back = [l.T, l.E, l.Z].filter(Lp => Lp && Lp.I.layer !== 'front');
      let behind = null;
      if (l.card) { const Bh = XM.canvas('tc:behind'); Bh.g.drawImage(g.canvas, 0, 0); behind = Bh.c; }
      const Tx = XM.canvas('tc:text'); for (const Lp of back) drawLine(Tx.g, t, Lp);
      g.drawImage(Tx.c, 0, 0);
      if (l.card && t >= ((o.card.at ?? TI.at) - 1e-6)) drawCard(g, t, l.card, behind, Tx.c);
      // subject: shadow -> halo -> body
      const SL = subjectLayer(t, l.sb);
      if (SL) {
        const en = enterOf(t), s = subj.o;
        let src = SL.c;
        if (en.b > .3) { const Bl = XM.canvas('tc:subjBlur'); Bl.g.filter = `blur(${en.b.toFixed(2)}px)`; Bl.g.drawImage(SL.c, 0, 0); src = Bl.c; }
        if (s.shadow) { const D = { a: .4, blur: 28, dx: 18, dy: 34, ...s.shadow };
          XM.tex.shadow(g, src, 0, 0, W, H, { a: D.a * en.a, blur: D.blur, sx: 1, sy: 1, shear: 0, dx: D.dx, dy: D.dy, ground: H, avoid: avoidFn() }); }
        if (s.halo) { const Hh = { a: .4, r: 34, a2: .35, r2: 7, ...s.halo }, Hz = XM.canvas('tc:halo');
          g.save(); g.globalCompositeOperation = dark ? 'screen' : 'soft-light';
          Hz.g.filter = `blur(${Hh.r}px)`; Hz.g.drawImage(src, 0, 0); g.globalAlpha = Hh.a * en.a; g.drawImage(Hz.c, 0, 0);
          if (Hh.a2) { Hz.g.clearRect(0, 0, W, H); Hz.g.filter = `blur(${Hh.r2}px)`; Hz.g.drawImage(src, 0, 0); g.globalAlpha = Hh.a2 * en.a; g.drawImage(Hz.c, 0, 0); }
          g.restore(); }
        g.save(); g.globalAlpha = en.a * (s.alpha ?? 1); g.drawImage(src, 0, 0); g.restore();
      }
      for (const Lp of front) drawLine(g, t, Lp);
      if (o.draw) o.draw(g, t, P, api);
      if (o.hud !== false) DS.hud(g, t, P, { tl: 'FIG', ...(o.hud || {}) });
    });
    shot.cues = cues;
    shot.api = api;
    return shot;
  }

  // Tracking-in is for short titles only: warn above ~6 Chinese chars / ~16 Latin letters (subtitle-like sentences don't belong here)
  function shortCheck(text, who, long) {
    if (long) return;
    const n = [...text].reduce((k, c) => k + (CJK.test(c) ? 1 : /\s/.test(c) ? 0 : .45), 0);
    if (n > 6.5) console.warn(`${who}: "${text}" is too long (about ${n.toFixed(1)} characters); letter-spaced titles are for concept / chapter names of ≤ 6 characters, leave subtitle-like sentences to the subtitles`);
  }

  // ---------- XM.trackTitle: one short title with the tracking-in entrance (no subject, no card; draw it inside any shot's draw) ----------
  //   o: text (required; concept / chapter name, <= 6 chars), at (required; appear time = when the voiceover says the word), x (required; alignment point),
  //      cy | baseline (one required: vertical ink center / baseline), align:'c' (default, center fixed while spreading)|'l'|'r', size (default 96, >= 56),
  //      fam:'hei' (Source Han Sans 900, default)|'serif' (Source Han Serif 900, sheared + condensed), w, squeeze, skew,
  //      color:'fg'|'mute'|'accent'|'mark'|'#hex', alpha, ls (final spacing in font sizes, default .3), track:{ from, tau, fade, blur, bdur, shutter },
  //      out:{ at, dur:.25, mode:'fade'|'cut' } | seconds, sfx (false = silent; default appear = tik), long:true (suppress the length warning on purpose, e.g. for templates)
  //   -> { draw(g, t, P), cues, box() -> [x0, y0, x1, y1] (final ink box) }
  function trackTitle(o = {}) {
    const err = m => console.error('XM.trackTitle: ' + m);
    if (!o.text) err('text is required (set it from the voice-over; there is no default text)');
    if (o.at == null) err('at is required (when it appears: the frame the voice-over says the word)');
    if (o.x == null || (o.cy == null && o.baseline == null)) err('needs a position: x and cy (vertical ink centre) or baseline');
    const text = String(o.text || ' ').replace(/[。．]$/, ''), chars = [...text], n = chars.length;
    shortCheck(text, 'XM.trackTitle', o.long);
    const size = o.size ?? 96; if (size < 56) console.warn(`XM.trackTitle: size ${size} < 56 (text meant to be read needs at least 56px)`);
    const F = o.fam === 'serif' ? HAN.serif : HAN.hei, han = /[⺀-鿿]/.test(text);
    const fam = han ? F.fam : (o.fam === 'serif' ? 'PlayIt' : 'Grot'), wt = o.w ?? (han ? F.w : 700), sq = o.squeeze ?? (han ? F.squeeze : 1), sk = o.skew ?? (han ? F.skew : 0);
    const Tk = { ...TRACK, ...(o.track || {}), origin: o.align === 'l' ? 'l' : o.align === 'r' ? 'r' : 'c' };
    const lsF = (o.ls ?? Tk.ls) * size;
    let L = null;
    function lay() {          // final layout (font size size, spacing lsF): pen x per char (prefix-width positioning) and ink box
      if (L) return L;
      const q = XM.canvas('tt:measure', 16, 16, false).g; q.font = `${wt} ${size}px ${fam}`; q.letterSpacing = '0px';
      const xs = [], ink = [];
      for (let i = 0; i < n; i++) { const x = q.measureText(chars.slice(0, i).join('')).width * sq + i * lsF, m = q.measureText(chars[i]);
        xs.push(x); if (chars[i].trim()) ink.push([x - m.actualBoundingBoxLeft * sq, -m.actualBoundingBoxAscent, x + m.actualBoundingBoxRight * sq + Math.max(0, sk) * m.actualBoundingBoxAscent, m.actualBoundingBoxDescent]); }
      const bx = ink.length ? [Math.min(...ink.map(b => b[0])), Math.min(...ink.map(b => b[1])), Math.max(...ink.map(b => b[2])), Math.max(...ink.map(b => b[3]))] : [0, -size * .8, size, size * .1];
      const ox = o.align === 'l' ? o.x - bx[0] : o.align === 'r' ? o.x - bx[2] : o.x - (bx[0] + bx[2]) / 2;
      const oy = o.baseline != null ? o.baseline : o.cy - (bx[1] + bx[3]) / 2;
      return (L = { xs, bx, ox, oy });
    }
    const OUT = o.out == null ? null : typeof o.out === 'number' ? { at: o.out, dur: .25, mode: 'fade' } : { dur: .25, mode: 'fade', ...o.out };
    const cues = o.sfx === false || o.at == null ? [] : [{ t: +o.at.toFixed(3), name: o.sfx || DS.SFX.appear }];
    function draw(g, t, P) {
      P = P || DS.tone('ink');
      const u = t - o.at; if (u < 0) return;
      let A = o.alpha ?? 1;
      if (OUT && t >= OUT.at) { if (OUT.mode === 'cut') return; const k = cl((t - OUT.at) / OUT.dur); if (k >= 1) return; A *= 1 - k * k; }
      const l = lay(), c = o.color, col = !c || c === 'fg' ? P.fg : c === 'mute' ? P.mute : c === 'accent' ? P.accent : c === 'mark' ? P.mark : c;
      g.save(); g.translate(l.ox, l.oy);
      for (let i = 0; i < n; i++) {
        if (!chars[i].trim()) continue;
        const st = trackAt(n, i, u, size, lsF, Tk);
        trackGlyph((d, al, b) => {
          g.save(); g.globalAlpha = A * al; g.filter = b > .25 ? `blur(${b.toFixed(2)}px)` : 'none';
          g.translate(l.xs[i] + d, 0); if (sk) g.transform(1, 0, -sk, 1, 0, 0); g.scale(sq, 1);
          g.font = `${wt} ${size}px ${fam}`; g.fillStyle = col; g.textBaseline = 'alphabetic'; g.fillText(chars[i], 0, 0); g.restore();
        }, st, fps(), Tk);
      }
      g.restore();
      XM.note(fam, text);
    }
    return { draw, cues, box: () => { const l = lay(); return [l.bx[0] + l.ox, l.bx[1] + l.oy, l.bx[2] + l.ox, l.bx[3] + l.oy].map(Math.round); } };
  }

  XM.trackTitle = trackTitle;
  XM.titleCard = titleCard;
  Object.assign(XM.titleCard, { REVEAL, SLIDE, TYPE, WIPE, ARC, CARD, SAFE, LATIN, HAN, TRACK });
})();
