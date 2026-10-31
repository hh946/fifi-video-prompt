// XM.emerge: emerging from the dark + depth-of-field floating words. A visual frame (one continuous shot): a subject
// slowly emerges from darkness / from blur; layers of words in front of and behind it float slowly, blurred by depth
// (with motion smear along the drift direction); a huge blurred English italic word can sit behind the subject. The
// depth of field is real: every element has a depth, the focus picks a layer that is sharp and everything farther away
// gets blurrier, so you can pull focus - from a word to the subject, then to a foreground word. The subject, the words,
// their placement, timing and the focus path are all set by the caller; there is no default content.
// Requires lib.js, xk.js, xm-core.js, xm-ds.js, xm-tex.js (loaded before this file). Canvas 2D (XM.shot), deterministic
// (randomness only via XM.rng / hash).
// Docs: docs/components/emerge.md
//
// Default feel: subject sharpens from 3.2 px to 0 (easeOut) while a light patch on it slowly brightens (easeInOut);
//   words fly in from 0.45x to 1 (expoOut, about 1 s), start 5.4 px extra blurred, reach full opacity quickly, with a
//   22 px horizontal smear (7 copies); mid-layer words 2.6 px blur, the behind word 2.4 px. No warm / cool fringe, no glow
//   or drop shadow on text; colours come from the design system (text = P.fg with opacity falling off by depth; spoken
//   words can take the accent).
//
// Texture: the background goes through XM.DS.stage, so XM.tex.use(shot, { stage:'grid', post:'dark' }) gives a dark grid
//   with scratches + vignette and grain; 'paper' + light:'window' + post:'paper' gives paper with window light. Leave
//   camera pushes to XM.tex.use's push; this component only handles depth of field (focus / defocus).
//
// XM.emerge(o) -> { L, update, cues, boxes(t) }
//   tone    : 'ink' (default) | 'paper' | 'accent'
//   subject : the subject (required). { src: cut-out transparent PNG | draw(g, t, box, P) (draw it yourself, box =
//               [x, y, w, h], w required),
//               h (height on screen px, default .86H), w (required with draw; from the image ratio with src), x (centre x,
//               default W/2), y (bottom y, default H; centre with anchor:'center'),
//               from: 'both' (default: from dark + from blur) | 'dark' | 'blur' | 'none', at (emergence start, absolute s,
//               required), dur (default .9), ease (default 'easeOut'),
//               blur0 (start blur, default 3.2 px; 8-14 recommended for blur-only), dark0 (start brightness, default .25),
//               fade (fraction of dur used for the initial fade-in, default .35; 0 = none),
//               scale0 (start scale, default 1; <1 = slowly approaching), rise:{ from (px, positive = rises from below),
//               to:0, dur, ease:'quartOut' } (optional),
//               gray (0..1 desaturation, default 0), contrast (default 1), light:[[relative height 0..1, brightness
//               factor], ...] (vertical lighting: dark head, bright chest, darker legs; optional),
//               spot:{ x, y (0..1 within the subject box), rx, ry (relative to box w / h), a, from:.3, at, dur, ease }
//               (a patch of light on the subject that slowly brightens, optional),
//               grain (coarse grain on the subject, 0..1, around .12 is visible, default 0), shadow:{ ...XM.tex.shadow
//               options } (grounded soft shadow on the stage, optional; fades automatically near text),
//               keep:[x, y, w, h] (0..1 of the subject image: area foreground blurred words must not cover; default
//               reads the face box from <src basename>.face.json; for objects point keep at the key part; false = ignore),
//               depth (default 0), res (cache resolution multiplier, default 1.5) }
//   words   : floating words (optional): [{ text (required), at (appearance time, required), x, y (word centre at the
//               moment it appears, required),
//               depth: 'far' | 'mid' (default) | 'near' | number (more negative = farther, subject = 0, positive = in
//               front of the subject),
//               size (font size px, default per layer), fam (default 'HeiSC'), w (weight, default 900), sq (horizontal
//               condense, default 1), sy (vertical stretch, default 1), ls (letter spacing, em),
//               color (default P.fg), alpha (default per layer), dir (+-1 along drift, default alternating), speed (px/s,
//               default per layer), smear (smear px, default per layer),
//               grow (growth per second, default per layer), enter:'zoom' (default: fly in from 0.45x) | 'fade', dur
//               (default 1.0), stagger (per-character delay s, negative = from the last character backward),
//               hi: t | [t0, t1] (spoken: the word pulls into focus and brightens; size must be >= 56), hiColor (colour
//               when spoken, default unchanged; 'accent' = the accent), until (fade-out time) }]
//   layers  : per-layer defaults: { far:{ d, size, alpha, speed, smear, grow }, mid:{...}, near:{...} }
//   drift   : float direction in degrees: 0 = horizontal (default), -90 = upward, any angle; smear follows it
//   behind  : huge blurred English italic word behind the subject (optional, English only): { text (required), x0, x1
//               (ink left / right, sets the size from the width) or size, y (baseline, required), fam:'PlayIt', w:800,
//               sy (vertical stretch, default 1.2), alpha (number or [[t, a, ease], ...], default .15), at, dur (fade-in,
//               default .3), mottle (smoky mottling, default .45), depth (default -2.4), color, speed (default 0), dir }
//   focus   : where the focus is: [[t, z, ease], ...], z = number (depth) | 'subject' | a floating word's text; default
//               always on the subject
//   aperture: depth-of-field strength (px of blur per depth unit from the focus), number or [[t, k, ease], ...], default 1
//               (mid-layer words 2.6 px)
//   defocus : extra overall blur (e.g. background growing blurrier during a push): [[t, px, ease], ...]; whatever is in
//               focus only gets .3x of it
//   pool    : pool of light behind the subject (optional): { x, y, r, a:.1, at, dur }. Brightens dark stages (screen),
//               very faint on light stages
//   stageDepth: depth of the stage (grid / paper), default -1.5 (blurs with focus pulls / defocus; sharp when static)
//   hud     : { tl, bl, br } (you write the corner text, no defaults); false = none
//   seed
// Timing (default feel, at = subject starts emerging): subject sharpens over 0-.77 s and brightens over 0-1 s; each word
//   flies into place about 1 s after its at (full opacity after .23 s), then drifts slowly by layer.
// Sound cues: subject emerges (appear), first word (multi), each spoken word (emph). Pick what you need:
//   window.SFX_CUES.push(...shot.cues)
// Rules: everything moves only slowly and smoothly (no back-and-forth wobble); foreground blurred words avoid keep (the
//   face); spoken words are >= 56 px; the behind word is English only; the subject sits above mid / far words.
(() => {
  const { W, H } = XK;
  const DS = XM.DS, SFX = DS.SFX, TX = XM.tex;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ez = e => TX.ease(e);
  const sm = k => k * k * (3 - 2 * k);
  const RAD = Math.PI / 180;
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  const fps = () => (window.VIDEO && VIDEO.fps) || 30;
  const rgbOf = h => { const m = String(h).match(/rgba?\(([^)]+)\)/); if (m) return m[1].split(',').slice(0, 3).map(s => parseFloat(s));
    h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
  const mixCol = (a, b, k) => { const A = rgbOf(a), B = rgbOf(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], k))).join(',')})`; };

  // per-layer defaults (depth unit = px of blur for this layer when the focus is on the subject; mid words 2.6, darker / farther ones ~3.8, behind word 2.4)
  const LAYER = {
    far: { d: -3.8, size: 84, alpha: .36, speed: 6, smear: 12, grow: 0 },
    mid: { d: -2.6, size: 112, alpha: .58, speed: 12, smear: 22, grow: 0 },
    near: { d: 7, size: 240, alpha: .3, speed: 30, smear: 40, grow: .015 },
  };
  const ENTER = { from: .45, dur: 1.0, ease: 'expoOut', alphaDur: 7 / 30, blur: 5.4, rise: 24 };
  const SMEAR_N = 7;

  function loadJSON(url) {     // readable via XHR under file:// rendering (--allow-file-access-from-files); null if unreadable
    return new Promise(res => { try { const x = new XMLHttpRequest(); x.open('GET', url); x.onload = () => { try { res(JSON.parse(x.responseText)); } catch (e) { res(null); } };
      x.onerror = () => res(null); x.send(); } catch (e) { res(null); } });
  }
  const CACHED = new Map();
  function cached(key, w, h, draw) {
    if (!CACHED.has(key)) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), c); CACHED.set(key, c); }
    return CACHED.get(key);
  }
  // keyframes: a number is returned as-is; [[t, v, ease], ...] via XM.tex.kf
  const val = (t, v, d) => v == null ? d : typeof v === 'number' ? v : TX.kf(t, v, 1);

  // ---------- noise (smoky mottling of the behind word, subject grain) ----------
  function vn(x, y, seed) {
    const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = sm(xf), v = sm(yf);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
  }
  function fbm(x, y, seed, oct = 3) { let a = 0, w = .5, f = 1, n = 0; for (let i = 0; i < oct; i++) { a += w * vn(x * f, y * f, seed + i * 7); n += w; w *= .5; f *= 2.03; } return a / n; }
  function mottleTex(seed) {     // half-resolution smoky mottling (alpha): fbm scale 60 px, threshold .42
    return cached('emerge-mottle:' + seed, W >> 1, H >> 1, q => {
      const w = W >> 1, h = H >> 1, d = q.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = fbm(x / 30, y / 30, 71 + seed, 3); d.data[(y * w + x) * 4 + 3] = Math.round(255 * cl((v - .42) * 2.4)); }
      q.putImageData(d, 0, 0);
    });
  }
  function noiseTile(i) {
    return cached('emerge-noise:' + i, 256, 256, q => {
      const d = q.createImageData(256, 256), r = XM.rng(511 + i * 13);
      for (let p = 0; p < d.data.length; p += 4) { const v = 128 + (r() - .5) * 255; d.data[p] = d.data[p + 1] = d.data[p + 2] = v; d.data[p + 3] = 255; }
      q.putImageData(d, 0, 0);
    });
  }

  function emerge(o = {}) {
    const errs = m => console.error('XM.emerge: ' + m);
    const P = DS.tone(o.tone || 'ink'), dark = DS.lum(P.bg) < .4;
    const S0 = o.subject;
    if (!S0 || (!S0.src && !S0.draw)) { errs('subject is required: give src (a cut-out transparent PNG) or draw(g, t, box, P); there is no default subject'); }
    const s = S0 || {};
    if (s.at == null) errs('subject.at (when it starts to emerge) is required');
    if (s.draw && !(s.w && s.h)) errs('a hand-drawn subject (subject.draw) needs w and h (the subject box size)');
    if (o.hud == null) errs('hud is required: { tl, bl, br } from your storyboard (no HUD: hud:false)');
    const seed = o.seed ?? 1;
    const theta = (o.drift ?? 0) * RAD, UX = Math.cos(theta), UY = Math.sin(theta);
    const layers = { far: { ...LAYER.far, ...(o.layers && o.layers.far) }, mid: { ...LAYER.mid, ...(o.layers && o.layers.mid) }, near: { ...LAYER.near, ...(o.layers && o.layers.near) } };
    const dSub = s.depth ?? 0, dStage = o.stageDepth ?? -1.5;

    // ---------- subject ----------
    const R = s.src ? XM.image(s.src) : null;
    let keep = Array.isArray(s.keep) ? s.keep : Array.isArray(s.face) ? s.face : null;
    if (s.src && s.keep == null && s.face == null) {
      XM.asset(loadJSON(String(s.src).replace(/\.[a-z]+$/i, '.face.json')).then(j => {
        if (!j) return;                                    // no .face.json: keep nothing clear unless subject.keep is given
        if (j.faces && j.faces.length) { const f = j.faces[0]; keep = [f.x, f.y, f.w, f.h]; }
      }));
    }
    const from = s.from || 'both', sAt = s.at ?? 0, sDur = s.dur ?? .9, sEase = s.ease || 'easeOut';
    const blur0 = (from === 'both' || from === 'blur') ? (s.blur0 ?? 3.2) : 0, dark0 = (from === 'both' || from === 'dark') ? (s.dark0 ?? .25) : 1;
    const fadeP = s.fade ?? .35;
    function baseBox() {      // settled box (without rise / scale0)
      let w, h = s.h ?? H * .86;
      if (R) w = R.ok ? h * R.img.naturalWidth / R.img.naturalHeight : 0; else w = s.w ?? 0;
      const x = (s.x ?? W / 2) - w / 2, y = s.anchor === 'center' ? (s.y ?? H / 2) - h / 2 : (s.y ?? H) - h;
      return [x, y, w, h];
    }
    function subjState(t) {
      if (t < sAt) return null;
      const k = cl((t - sAt) / Math.max(.01, sDur)), e = ez(sEase)(k);
      const fade = fadeP > 0 ? ez('smooth')(cl(k / fadeP)) : 1;
      const [bx, by, bw, bh] = baseBox();
      const sc = lerp(s.scale0 ?? 1, 1, e);
      let dy = 0;
      if (s.rise) { const r = s.rise, kr = ez(r.ease || 'quartOut')(cl((t - (r.at ?? sAt)) / Math.max(.01, r.dur ?? sDur * 2))); dy = lerp(r.from ?? 0, r.to ?? 0, kr); }
      const w = bw * sc, h = bh * sc, ax = bx + bw / 2, ay = s.anchor === 'center' ? by + bh / 2 : by + bh;
      const box = [ax - w / 2, (s.anchor === 'center' ? ay - h / 2 : ay - h) + dy, w, h];
      // brightening is a little slower than sharpening (1.3x dur, easeInOut)
      const kd = ez('easeInOut')(cl((t - sAt) / Math.max(.01, sDur * 1.3)));
      return { box, fade, bright: lerp(dark0, 1, kd), blur: blur0 * (1 - e), k };
    }
    // lit / desaturated subject texture (sized from the settled box, not the per-frame size, so the cache does not flicker)
    let gradeC = null;
    function gradeTex() {
      if (!R || !R.ok) return null;
      if (gradeC) return gradeC;
      const [, , bw] = baseBox(), iw = R.img.naturalWidth, ih = R.img.naturalHeight;
      const cw = Math.max(8, Math.round(Math.min(iw, bw * (s.res ?? 1.5)))), ch = Math.round(cw * ih / iw);
      const c = document.createElement('canvas'); c.width = cw; c.height = ch; const q = c.getContext('2d');
      const gray = s.gray ?? 0, con = s.contrast ?? 1;
      q.filter = (gray > 0 || con !== 1) ? `grayscale(${gray}) contrast(${con})` : 'none'; q.drawImage(R.img, 0, 0, cw, ch); q.filter = 'none';
      if (s.light && s.light.length) {
        const gr = q.createLinearGradient(0, 0, 0, ch);
        for (const [y, v] of s.light) { const u = Math.round(255 * cl(v)); gr.addColorStop(cl(y), `rgb(${u},${u},${u})`); }
        q.globalCompositeOperation = 'multiply'; q.fillStyle = gr; q.fillRect(0, 0, cw, ch);
        q.globalCompositeOperation = 'destination-in'; q.drawImage(R.img, 0, 0, cw, ch);
      }
      return (gradeC = c);
    }
    function drawSubject(g, t, st, blurPx) {
      const L = XM.canvas('emerge-subj'), q = L.g, [x, y, w, h] = st.box;
      const tex = gradeTex();
      if (tex) q.drawImage(tex, x, y, w, h);
      else if (s.draw) { q.save(); s.draw(q, t, st.box, P); q.restore(); }
      else return;
      if ((s.grain ?? 0) > 0) {      // coarse grain on the subject: overlay, then clipped back to the subject's silhouette
        q.save(); q.globalCompositeOperation = 'overlay'; q.globalAlpha = s.grain; q.fillStyle = q.createPattern(noiseTile((Math.round(t * fps()) >> 1) % 4), 'repeat');
        q.fillRect(Math.max(0, x), Math.max(0, y), Math.min(W, x + w) - Math.max(0, x), Math.min(H, y + h) - Math.max(0, y)); q.restore();
        q.save(); q.globalCompositeOperation = 'destination-in'; if (tex) q.drawImage(tex, x, y, w, h); else { s.draw(q, t, st.box, P); } q.restore();
      }
      if (s.spot) {                  // patch of light on the subject that slowly brightens (e.g. .3 -> 1)
        const Sp = s.spot, kk = lerp(Sp.from ?? .3, 1, ez(Sp.ease || 'easeInOut')(cl((t - (Sp.at ?? sAt)) / Math.max(.01, Sp.dur ?? sDur * 1.15))));
        q.save(); q.globalCompositeOperation = 'source-atop'; q.globalAlpha = (Sp.a ?? .5) * kk;
        q.translate(x + (Sp.x ?? .5) * w, y + (Sp.y ?? .5) * h); q.scale((Sp.rx ?? .15) * w, (Sp.ry ?? .2) * h);
        const rg = q.createRadialGradient(0, 0, 0, 0, 0, 1); rg.addColorStop(0, 'rgba(255,255,255,.85)'); rg.addColorStop(.5, 'rgba(255,255,255,.3)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        q.fillStyle = rg; q.fillRect(-1, -1, 2, 2); q.restore();
      }
      g.save(); g.globalAlpha *= st.fade;
      const f = []; if (st.bright < .995) f.push(`brightness(${st.bright.toFixed(3)})`); if (blurPx > .3) f.push(`blur(${blurPx.toFixed(2)}px)`);
      g.filter = f.length ? f.join(' ') : 'none'; g.drawImage(L.c, 0, 0); g.restore();
    }

    // ---------- floating words ----------
    const WORDS = (o.words || []).map((w0, i) => {
      if (!w0 || !w0.text) { errs(`words[${i}] needs text (which words float is set by the video's script)`); return null; }
      if (w0.at == null || w0.x == null || w0.y == null) { errs(`words[${i}] "${w0.text}" needs at, x, y`); return null; }
      let d, lay;
      if (typeof w0.depth === 'number') { d = w0.depth; lay = d > dSub + 2 ? layers.near : d < -3.2 ? layers.far : layers.mid; }
      else { lay = layers[w0.depth || 'mid']; if (!lay) { errs(`words[${i}].depth must be far / mid / near or a number, got ${w0.depth}`); lay = layers.mid; } d = lay.d; }
      const w = { ...w0, i, d, size: w0.size ?? lay.size, alpha: w0.alpha ?? lay.alpha, speed: w0.speed ?? lay.speed, smear: w0.smear ?? lay.smear, grow: w0.grow ?? lay.grow,
        fam: w0.fam || 'HeiSC', wt: w0.w ?? 900, sq: w0.sq ?? 1, sy: w0.sy ?? 1, ls: w0.ls ?? 0, dir: w0.dir ?? (o.dirs === 'same' ? 1 : (i % 2 ? -1 : 1)) };
      if (w.hi != null && w.size < DS.S.label) errs(`words[${i}] "${w.text}" must be readable when it is spoken: size ≥ ${DS.S.label} (now ${w.size})`);
      if (w.hi != null) {       // the position at the spoken moment (after drifting) must be inside the safe area
        const th = Array.isArray(w.hi) ? w.hi[0] : w.hi, mv = w.dir * w.speed * Math.max(0, th - w.at), hx = w.x + UX * mv, hy = w.y + UY * mv;
        if (hx < DS.SAFE || hx > W - DS.SAFE || hy < DS.SAFE || hy > H - DS.SAFE) errs(`words[${i}] "${w.text}" must be inside the safe area when it is spoken (${hx.toFixed(0)}, ${hy.toFixed(0)}; ≥ ${DS.SAFE} from the edge)`);
      }
      // per-character layout (measured at 100 px, ratios cached). Fonts may not be loaded when the scene builds the shot: measure once with the current font, then again when drawing once the font is ready (measureWord)
      w.chars = [...w.text]; measureWord(w);
      w.delay = w.chars.map((c, j) => (w.stagger ?? 0) >= 0 ? j * (w.stagger ?? 0) : (w.chars.length - 1 - j) * -w.stagger);
      XM.note(w.fam, w.text);
      return w;
    }).filter(Boolean);
    const byText = new Map(WORDS.map(w => [w.text, w.d]));
    const hiCol = w => w.hiColor === 'accent' ? P.accent : w.hiColor || o.hiColor === 'accent' && P.accent || o.hiColor || null;
    function hiK(w, t) {
      if (w.hi == null) return 0;
      const [h0, h1] = Array.isArray(w.hi) ? w.hi : [w.hi, null];
      return sm(cl((t - h0) / .35)) * (h1 != null ? 1 - sm(cl((t - h1) / .5)) : 1);
    }
    // state of one word at this moment
    function measureWord(w) {
      const spec = `${w.wt} 100px ${w.fam}`, q = XM.canvas('emerge-measure', 8, 8).g; q.font = spec;
      const adv = w.chars.map(c => q.measureText(c).width / 100);
      const tot = adv.reduce((a, b) => a + b, 0) + w.ls * (w.chars.length - 1);
      let x = -tot / 2; w.off = w.chars.map((c, j) => { const cx = x + adv[j] / 2; x += adv[j] + w.ls; return cx; });
      w.tot = tot; w.measured = document.fonts.check(spec, w.text);
    }
    function wordState(w, t, zf, ap, df) {
      if (!w.measured) measureWord(w);
      const t0 = w.at + Math.min(...w.delay);
      if (t < t0) return null;
      const out = w.until != null ? 1 - sm(cl((t - w.until) / .4)) : 1;
      if (out <= 0) return null;
      const enter = w.enter || 'zoom', dur = w.dur ?? ENTER.dur;
      const eAt = tt => ez(ENTER.ease)(cl((tt - w.at) / dur));
      const ke = eAt(t - Math.min(...w.delay));
      const scaleW = (enter === 'zoom' ? lerp(ENTER.from, 1, ke) : 1) * (1 + (w.grow || 0) * Math.max(0, t - w.at));
      const age = t - w.at, mv = w.dir * w.speed * Math.max(0, age);
      const x = w.x + UX * mv, y = w.y + UY * mv + (enter === 'zoom' ? ENTER.rise * (1 - ke) : 0);
      const hk = hiK(w, t);
      const chars = w.chars.map((c, j) => {
        const tj = t - w.delay[j], kj = eAt(tj);
        const a = cl((tj - w.at) / ENTER.alphaDur);
        const sc = enter === 'zoom' ? lerp(ENTER.from, 1, kj) / Math.max(.01, lerp(ENTER.from, 1, ke)) : 1;   // late characters also grow from small to large themselves
        return { c, a: a > 0 ? a : 0, sc, ox: w.off[j] };
      });
      const dist = Math.abs(w.d - zf);
      const entryBlur = ENTER.blur * (1 - ke) * (enter === 'fade' ? 1.5 : 1);
      let blur = ap * dist + df * cl(dist / 1.5, .3, 1) + entryBlur + 6 * (1 - out);
      blur = Math.max(.25, blur * (1 - .92 * hk));
      // smear is part of the depth of field (22 px for mid words at 2.6 px defocus): the layer pulled into focus has its smear cut to 1/4, spoken words even less
      const smear = w.smear * (.25 + .75 * cl(dist / 2.6)) * (1 - .75 * hk);
      const alpha = lerp(w.alpha, Math.max(w.alpha, w.hiAlpha ?? .96), hk) * out;
      const hc = hiCol(w), col = hc && hk > 0 ? mixCol(w.color || P.fg, hc, hk) : (w.color || P.fg);
      const size = w.size * scaleW, tw = w.tot * size * w.sq, th = size * w.sy;
      return { w, x, y, size, tw, th, chars, blur, smear, alpha, col, hk, box: [x - tw / 2, y - th / 2, tw, th] };
    }
    function drawWord(tg, st) {
      const { w, size, chars } = st, sm2 = st.smear, pad = 8;
      if (st.box[0] > W + 200 || st.box[0] + st.box[2] < -200 || st.box[1] > H + 200 || st.box[1] + st.box[3] < -200) return;
      const cw = Math.ceil((st.tw + Math.abs(UX) * sm2 + size * .4 + 2 * pad) / 64) * 64, ch = Math.ceil((st.th * 1.3 + Math.abs(UY) * sm2 + 2 * pad) / 64) * 64;
      const L = XM.canvas('emerge-word', cw, ch), q = L.g;
      q.globalCompositeOperation = 'lighter'; q.fillStyle = st.col; q.textAlign = 'center'; q.textBaseline = 'middle';
      q.font = `${w.wt} ${w.size}px ${w.fam}`;
      const n = sm2 > 1.5 ? SMEAR_N : 1, wsum = n > 1 ? Array.from({ length: n }, (_, p) => .55 + .45 * Math.sin(Math.PI * p / (n - 1))).reduce((a, b) => a + b, 0) : 1;
      const k = size / w.size;
      for (const C of chars) {
        if (C.a <= .002) continue;
        for (let p = 0; p < n; p++) {
          const wp = n > 1 ? (.55 + .45 * Math.sin(Math.PI * p / (n - 1))) / wsum : 1, dp = n > 1 ? sm2 * (p / (n - 1) - .5) : 0;
          q.globalAlpha = C.a * wp;
          q.setTransform(w.sq * k * C.sc, 0, 0, w.sy * k * C.sc, cw / 2 + C.ox * size * w.sq + UX * dp, ch / 2 + UY * dp);
          q.fillText(C.c, 0, 0);
        }
      }
      q.setTransform(1, 0, 0, 1, 0, 0);
      tg.save(); tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalAlpha *= st.alpha; tg.filter = st.blur > .3 ? `blur(${st.blur.toFixed(2)}px)` : 'none';
      tg.drawImage(L.c, st.x - cw / 2, st.y - ch / 2); tg.restore();
    }

    // ---------- huge blurred English italic word behind the subject ----------
    const B = o.behind || null;
    if (B) {
      if (!B.text) errs('behind.text is required (the large English word behind the subject)');
      else if (CJK.test(B.text)) errs(`behind takes English only (CJK in a Latin italic display face looks bad), got "${B.text}"`);
      if (B.y == null || (B.size == null && (B.x0 == null || B.x1 == null))) errs('behind needs y (baseline) and x0, x1 (size from width) or size');
    }
    const bFam = B && (B.fam || 'PlayIt'), bW = B && (B.w ?? 800);
    let behindC = null;
    function behindTex() {       // text + smoky mottling, static, cached
      if (behindC) return behindC;
      const L = document.createElement('canvas'); L.width = W; L.height = H; const q = L.getContext('2d');
      q.font = `${bW} 400px ${bFam}`; const m = q.measureText(B.text);
      const ink = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const sx = B.size ? B.size / 400 : (B.x1 - B.x0) / Math.max(1, ink), sy = sx * (B.sy ?? 1.2);
      const x0 = B.size ? (B.x ?? W / 2) - ink * sx / 2 : B.x0;
      q.save(); q.translate(x0 + m.actualBoundingBoxLeft * sx, B.y); q.scale(sx, sy); q.textBaseline = 'alphabetic'; q.fillStyle = B.color || P.fg; q.fillText(B.text, 0, 0); q.restore();
      if ((B.mottle ?? .45) > 0) { q.save(); q.globalCompositeOperation = 'destination-out'; q.globalAlpha = B.mottle ?? .45; q.drawImage(mottleTex(seed), 0, 0, W, H); q.restore(); }
      XM.note(bFam, B.text);
      return (behindC = L);
    }
    function drawBehind(g, t, zf, ap, df) {
      const at = B.at ?? 0; if (t < at) return;
      const a = val(t, B.alpha, .15) * sm(cl((t - at) / Math.max(.01, B.dur ?? .3)));
      if (a <= .002) return;
      const d = B.depth ?? -2.4, dist = Math.abs(d - zf), blur = ap * dist + df * cl(dist / 1.5, .3, 1);
      const mv = (B.dir ?? 1) * (B.speed ?? 0) * Math.max(0, t - at);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha *= a; g.filter = blur > .3 ? `blur(${blur.toFixed(2)}px)` : 'none';
      g.drawImage(behindTex(), UX * mv, UY * mv); g.restore();
    }

    // ---------- focus ----------
    const zOf = z => typeof z === 'number' ? z : z === 'subject' || z == null ? dSub : byText.has(z) ? byText.get(z) : (errs(`focus "${z}" is neither a floating word's text nor 'subject'`), dSub);
    const FK = o.focus ? o.focus.map(k => [k[0], zOf(k[1]), ...k.slice(2)]) : null;
    const focusAt = t => FK ? TX.kf(t, FK, 1) : dSub;

    // grounded shadow around the subject: fades near text (shadows near text should stay light)
    let curBoxes = [];
    const avoid = (x, y) => { let v = 1; for (const b of curBoxes) { const dx = Math.max(b[0] - x, 0, x - b[0] - b[2]), dy = Math.max(b[1] - y, 0, y - b[1] - b[3]); v = Math.min(v, .25 + .75 * sm(cl(Math.hypot(dx, dy) / 90))); } return v; };

    const cues = [];
    if (s.at != null) cues.push({ t: s.at, name: SFX.appear });
    if (WORDS.length) cues.push({ t: Math.min(...WORDS.map(w => w.at)), name: SFX.multi });
    for (const w of WORDS) if (w.hi != null) cues.push({ t: Array.isArray(w.hi) ? w.hi[0] : w.hi, name: SFX.emph });

    function frameState(t) {
      const zf = focusAt(t), ap = val(t, o.aperture, 1), df = val(t, o.defocus, 0);
      const ws = WORDS.map(w => wordState(w, t, zf, ap, df)).filter(Boolean);
      return { zf, ap, df, ws, ss: subjState(t) };
    }

    const shot = XM.shot({ bg: P.bg, stage: 'flat', cam: o.cam }, () => (g, t) => {
      const { zf, ap, df, ws, ss } = frameState(t);
      // stage (grid / paper grain when the texture layer takes over); blurs with focus pulls / defocus (sharp when static)
      DS.stage(g, P);
      const sb = Math.max(0, ap * (Math.abs(dStage - zf) - Math.abs(dStage - dSub))) + df;
      if (sb > .35) { const Sn = XM.canvas('emerge-stage'); Sn.g.drawImage(g.canvas, 0, 0); g.save(); g.setTransform(1, 0, 0, 1, 0, 0); TX.blurClamp(g, Sn.c, sb); g.restore(); }
      if (o.pool) {
        const Pl = o.pool, k = sm(cl((t - (Pl.at ?? sAt)) / Math.max(.01, Pl.dur ?? sDur * 1.3)));
        if (k > 0) {
          const [px, py] = [Pl.x ?? W / 2, Pl.y ?? H / 2], r = Pl.r ?? 600, gr = g.createRadialGradient(px, py, 0, px, py, r), a = (Pl.a ?? .1) * k;
          const c = rgbOf(dark ? P.fg : '#ffffff').join(',');
          gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(.55, `rgba(${c},${a * .4})`); gr.addColorStop(1, `rgba(${c},0)`);
          g.save(); g.globalCompositeOperation = dark ? 'screen' : 'soft-light'; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
        }
      }
      // draw far to near: behind word / far, mid words -> subject -> foreground words (foreground words avoid the face)
      const items = ws.map(st => ({ d: st.w.d, kind: 'w', st }));
      if (B && B.text && !CJK.test(B.text)) items.push({ d: B.depth ?? -2.4, kind: 'b' });
      if (ss) items.push({ d: dSub, kind: 's' });
      items.sort((a, b) => a.d - b.d || (a.kind === 's' ? 1 : b.kind === 's' ? -1 : 0));
      curBoxes = ws.filter(st => st.w.d < dSub).map(st => st.box);
      const front = XM.canvas('emerge-front'); let anyFront = false;
      for (const it of items) {
        if (it.kind === 'b') drawBehind(g, t, zf, ap, df);
        else if (it.kind === 'w') { if (it.d > dSub) { drawWord(front.g, it.st); anyFront = true; } else drawWord(g, it.st); }
        else {
          const dist = Math.abs(dSub - zf), blur = ap * dist + df * cl(dist / 1.5, .3, 1) + ss.blur;
          if (s.shadow && R && R.ok) { const [x, y, w, h] = ss.box; TX.shadow(g, gradeTex() || R.img, x, y, w, h, { ...s.shadow, a: (s.shadow.a ?? .3) * ss.fade, avoid: curBoxes.length ? avoid : null }); }
          drawSubject(g, t, ss, blur);
        }
      }
      if (anyFront) {
        // a foreground word that is spoken and pulled into focus (hi) is meant to be read over the subject, so it is not erased then (the last word to appear should read at the frame centre)
        const kHi = items.reduce((m, it) => (it.kind === 'w' && it.d > dSub && it.st.hk > m ? it.st.hk : m), 0);
        if (keep && ss && kHi < 1) {        // foreground blurred words avoid the face / key part of the subject: erased within 1.2x of the expanded keep box, fully back at 1.8x
          const [x, y, w, h] = ss.box, kx = x + (keep[0] + keep[2] / 2) * w, ky = y + (keep[1] + keep[3] / 2) * h, rx = keep[2] * w * .5 * 1.2, ry = keep[3] * h * .5 * 1.2;
          const q = front.g; q.save(); q.globalCompositeOperation = 'destination-out'; q.translate(kx, ky); q.scale(rx, ry);
          const gr = q.createRadialGradient(0, 0, 0, 0, 0, 1.5); const ka = (1 - kHi).toFixed(3); gr.addColorStop(0, `rgba(0,0,0,${ka})`); gr.addColorStop(1 / 1.5, `rgba(0,0,0,${ka})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
          q.fillStyle = gr; q.fillRect(-2, -2, 4, 4); q.restore();
        }
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(front.c, 0, 0); g.restore();
      }
      if (o.hud !== false) DS.hud(g, t, P, o.hud || {});
    });
    shot.cues = cues;
    // for self-checks: each word's box at this moment (screen coords, before push), whether it is spoken, the subject box and keep box
    shot.boxes = t => {
      const { ws, ss } = frameState(t);
      const kb = keep && ss ? [ss.box[0] + keep[0] * ss.box[2], ss.box[1] + keep[1] * ss.box[3], keep[2] * ss.box[2], keep[3] * ss.box[3]] : null;
      return { words: ws.map(st => ({ text: st.w.text, box: st.box, d: st.w.d, hi: st.hk, blur: st.blur, alpha: st.alpha, size: st.size })), subject: ss ? ss.box : null, keep: kb };
    };
    return shot;
  }

  Object.assign(XM, { emerge });
})();
