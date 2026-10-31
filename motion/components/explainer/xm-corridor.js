// XM.textCorridor (key: corridor): a text corridor. Four walls of text flow toward the camera down an endless corridor while
// a short English phrase is laid over the foreground word by word, with accent-colour flashes. English only.
// Docs: docs/components/corridor.md
//
// Look:
//   Corridor: a square-ish corridor (width : height = 1 : 0.861), each of the four walls carries 3 text ribbons (12 wedges; ribbon gaps
//         and corners are dark), vanishing point near the centre.
//         The wall text is not true perspective but a log mapping: every factor of e in screen radius moves a fixed number of letters
//         along the wall, so text shrinks inward while keeping its aspect ratio, like an infinite corridor.
//         The text is a repeated serif uppercase line streaming toward the camera.
//         Brightness: brightest about 150-220 px from the centre, fading to near black beyond ~520 px; nearer text is blurrier. A white
//         star flare + glow at the vanishing point.
//   Phrase: serif uppercase words appear one by one, each on a black block; accent blocks can flash just before / beside a word.
//   Only English: CJK wall text or phrases log console.error (fails the render check).
//
// Explanatory mode (default hit:false): slower flow, no frame skipping, no burst, no blur flashes; the star flare stays but smaller and dimmer;
//   accent blocks use the real accent colour and flash for 0.2 s.
// Hook mode (hit:true): bursts out from the vanishing point on entrance (circular reveal + a kick of speed), flow x3 updating only every
//   3 / 2 frames alternately, slight RGB split on the wall text, star flare changes size each step.
// ───────────────────────────── XM.textCorridor(o) ─────────────────────────────
// A framework: four text walls flowing to the centre + a foreground phrase laid word by word + accent blocks. What the walls say, the phrase,
// how many words, when they appear and where blocks flash are all chosen by the caller for the video. The component has no default words.
//   at     : entrance (absolute seconds). Explanatory: 0.5 s fade in from the stage colour; hook: circular burst from the vanishing point (.35 s).
//   words  : [English words...] (required) wall words (atmosphere; may be small and dim). Repeated in order into a ribbon, each ribbon phase-shifted. STIX Two 700 uppercase. Missing -> console.error
//   phrase : [{ text, at, style, x, y, size }] (optional) foreground phrase laid word by word (text to read): each word sits on a solid ink block (XM.DS layer-over-content rule),
//            English only, white text >= 56 px (default 84). style 'roman' (default, upright serif) | 'italic' (serif italic) | 'key' (accent-coloured text).
//            x / y: block top-left (omitted = automatic by layout). sfx: false mutes this word. Appearance: the block wipes open left to right in .2 s with the text (hard cut in hook mode).
//   layout : 'left' (default: a staggered staircase on the left half, one word per line) | 'scatter' (scattered either side of the vanishing point).
//   flash  : [{ at, word, mode, w, h }] a solid accent rectangle flashes (explanatory .2 s / hook 2 frames, real accent). Position follows a word:
//            mode 'side' (default) = right of the newest word at time at; 'pre' = occupies the place of the next word (flash first, then the word). word: target a specific word index.
//   speed  : flow multiplier (default 1: explanatory text moves outward e^0.55 ≈ 1.7x radius per second; hook mode another x3).
//   spokes : number of wedge ribbons 8 | 12 (default) | 16 (split evenly over four walls).
//   vp     : [x, y] vanishing point (default [960, 540]).
//   dim    : wall-text brightness 0-1 (default .68). light: centre light 0-1 (default explanatory .7 / hook 1; false = 0).
//   squeeze: horizontal compression of wall text (default .55; smaller = narrower and taller).
//   hit    : false (default, explanatory) | true (hook mode, see above).
//   tone   : 'ink'|'paper' (default follows the caller's XK.tone). hud: { tl, bl, br } | false (shot id, chapter, what is shown; you write it, see SKILL.md; no default text). seed: ribbon phase, star flare. cam: XK camera keys.
// Returns { L, update, cues }. cues: one tag per phrase word (sfx:false on a word mutes it, a name replaces it); hook mode adds a transition on entrance. No sound for the explanatory fade-in.
//
// Depends on xk.js, xm-core.js (XM.gl / XM.drawGL shared renderer, no extra WebGL context), xm-ds.js, vendor/three.min.js. Fonts: Stix / StixIt (STIX Two Text, xm-assets/fonts/, registered in the skeleton index.html).
// Deterministic: randomness only via XM.rng / fixed hashes in the shader; all times are absolute seconds.
(() => {
  const { W, H } = XK;
  const DS = XM.DS, SFX = DS.SFX;
  const TAU = Math.PI * 2, FPS = 30, KAB = 1.161;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const EO = XM.expoOut, pr = (t, a, d) => cl((t - a) / d);
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  const fontsReady = () => !document.fonts || document.fonts.status === 'loaded';
  const frameOf = (t, a) => Math.floor((t - a) * FPS + 1e-6);

  function rgbOf(c) {
    const s = String(c).trim();
    if (s[0] === '#') { let h = s.slice(1); if (h.length === 3) h = [...h].map(x => x + x).join(''); const n = parseInt(h.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 1]; }
    const m = s.match(/[\d.]+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2], m[3] != null ? +m[3] : 1];
  }
  const v3 = c => { const a = rgbOf(c); return new THREE.Vector3(a[0] / 255, a[1] / 255, a[2] / 255); };
  const mix3 = (a, b, k) => a.clone().lerp(b, k);

  const MC = document.createElement('canvas').getContext('2d');
  const setFont = (g, fam, size, w) => { g.font = `${w} ${size}px ${fam}`; g.letterSpacing = '0px'; };
  function ink(s, fam, size, w) { setFont(MC, fam, size, w); const m = MC.measureText(s); return { l: -m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent, adv: m.width }; }
  function put(g, s, x, y, fam, size, w, col) { setFont(g, fam, size, w); g.fillStyle = col; g.fillText(s, x, y); XM.note(fam, s); }

  // ---------- Shader: log-mapped four walls ----------
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uVP;
uniform float uPhase, uLanes, uLrS, uLrT, uDim, uLight, uReveal, uFade, uRGB, uSeed, uSoft;
uniform vec3 uBase, uSeam, uInk, uFog, uGlow, uBg;
const float KAB = ${KAB};
float h11(float n){ return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
void main(){
  vec2 ps = vec2(vUv.x * 1920., (1. - vUv.y) * 1080.);
  vec2 d = ps - uVP;
  float ax = abs(d.x), ay = abs(d.y) * KAB;
  float side = step(ay, ax);
  float r = max(max(ax, ay), .5);
  float across = side > .5 ? d.y * KAB / max(ax, .5) : d.x / max(ay, .5);
  float wall = side > .5 ? (d.x < 0. ? 1. : 0.) : (d.y < 0. ? 3. : 2.);
  float lanef = clamp((across + 1.) * .5 * uLanes, 0., uLanes - 1e-4);
  float lane = floor(lanef), v = lanef - lane;
  float lr = side > .5 ? uLrS : uLrT;
  float u = -log(r) / lr + uPhase + h11(wall * 5.31 + lane * 1.73 + uSeed);
  vec2 tc = vec2(u, 1. - v);
  // Nearer = blurrier (depth of field): near text is magnified so mipmaps do not help -> 9-tap ring blur scaled to screen pixels in texture space
  float bpx = clamp((r - 320.) * .022, 0., 11.) * uSoft;
  float lanePx = side > .5 ? 2. * r / (KAB * uLanes) : 2. * r / uLanes;
  vec2 bt = vec2(bpx / (r * lr + 1.), bpx / max(lanePx, 1.));
  float m0 = texture2D(uTex, tc).r, acc = m0;
  if (bpx > .5) { for (int i = 0; i < 8; i++) { float a = float(i) * .7854; acc += texture2D(uTex, tc + bt * vec2(cos(a), sin(a))).r; } acc /= 9.; }
  vec3 m = vec3(acc);
  if (uRGB > 0.) { float du = uRGB / (r * lr + 1.); m.r = mix(texture2D(uTex, tc - vec2(du, 0.)).r, acc, .4); m.b = mix(texture2D(uTex, tc + vec2(du, 0.)).r, acc, .4); }
  float gin = .07, gc = .15;                                              // gaps: narrow between ribbons, wide at the corners
  float g0 = lane < .5 ? gc : gin, g1 = lane > uLanes - 1.5 ? gc : gin;
  float aa = clamp(fwidth(lanef), .002, .05);
  float mask = smoothstep(g0 - aa, g0 + aa, v) * (1. - smoothstep(1. - g1 - aa, 1. - g1 + aa, v));
  float E = 1. - .64 * smoothstep(190., 500., r) - .25 * smoothstep(500., 800., r);   // brightest at 150-220 px, near black beyond 520 px (a .11 floor keeps the walls visible)
  vec3 wallc = mix(uBase, uInk, clamp(m * uDim * E, 0., 1.));
  vec3 col = mix(uSeam, wallc, mask);
  float rr = length(d);
  col = mix(col, uFog, .5 * exp(-rr / 95.) * uLight);
  col += uGlow * (.30 * exp(-rr / 62.) + .06 * exp(-rr / 200.)) * uLight;
  float rv = 1. - smoothstep(uReveal - 40., uReveal, rr);
  col = mix(uBg, col, rv * uFade);
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;
  let Q = null;
  function quad() {
    if (Q) return Q;
    const uniforms = {
      uTex: { value: null }, uVP: { value: new THREE.Vector2(960, 540) }, uPhase: { value: 0 }, uLanes: { value: 3 }, uLrS: { value: 2 }, uLrT: { value: 2 },
      uDim: { value: .72 }, uLight: { value: .7 }, uReveal: { value: 3000 }, uFade: { value: 1 }, uRGB: { value: 0 }, uSeed: { value: 0 }, uSoft: { value: 1 },
      uBase: { value: new THREE.Vector3() }, uSeam: { value: new THREE.Vector3() }, uInk: { value: new THREE.Vector3() }, uFog: { value: new THREE.Vector3() }, uGlow: { value: new THREE.Vector3() }, uBg: { value: new THREE.Vector3() },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    Q = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    return Q;
  }

  // ---------- Wall ribbons: one period = words repeated once in order; white text on black, scaled horizontally to 2048 by natural width ----------
  const TEX = new Map();
  function strip(words) {
    const zh = words.some(w => CJK.test(w)), sep = zh ? '　' : '  ';
    let s = words.map(w => zh ? w : String(w).toUpperCase()).join(sep) + sep;
    const fam = zh ? 'SerifSC' : 'Stix', wgt = zh ? 900 : 700;
    const capR = zh ? .88 : ink('H', fam, 100, wgt).a / 100, size = (zh ? 150 : 158) / capR;
    while (ink(s, fam, size, wgt).adv < 256 * 6) s += s;                    // repeat until long enough (period at least 6 letter-heights)
    const key = s + fam;
    if (TEX.has(key)) return TEX.get(key);
    const nat = ink(s, fam, size, wgt).adv, c = document.createElement('canvas'); c.width = 2048; c.height = 256;
    const q = c.getContext('2d'); q.fillStyle = '#000'; q.fillRect(0, 0, 2048, 256);
    q.save(); q.scale(2048 / nat, 1);
    const base = zh ? 128 + size * .38 : 128 + size * capR / 2;
    put(q, s, 0, base, fam, size, wgt, '#fff');
    if (!zh) { q.lineWidth = 3; q.strokeStyle = '#fff'; q.strokeText(s, 0, base); }
    q.restore();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.anisotropy = 8; tex.needsUpdate = true;
    const r = { tex, aspect: nat / 256, zh };
    if (fontsReady()) TEX.set(key, r); else setTimeout(() => tex.dispose(), 0);
    return r;
  }

  // ---------- Foreground phrase layout ----------
  const IND = [0, 120, 330, 70, 410, 200];
  const SCAT = [[235, 380], [330, 560], [640, 440], [1080, 650], [1360, 470], [560, 720]];
  function layPhrase(o, P) {
    const items = (o.phrase || []).map((p, i) => typeof p === 'string' ? { text: p, i } : { ...p, i });
    const n = items.length, rows = [];
    for (const p of items) {
      const zh = CJK.test(p.text), size = p.size || (zh ? 96 : 84), style = p.style || 'roman';   // about 54 / 47 px inside a vertical-video window
      const fam = zh ? 'SerifSC' : style === 'italic' ? 'StixIt' : 'Stix', w = zh ? 900 : 700;
      const m = ink(p.text, fam, size, w), capH = zh ? size * .82 : ink('H', fam, size, w).a;
      const padX = size * .26, padT = size * .2, padB = size * (zh ? .22 : .2);
      const bw = (m.r - m.l) + padX * 2 + (zh && style === 'italic' ? size * .12 : 0), bh = capH + padT + padB + (zh ? size * .06 : 0);
      rows.push({ ...p, zh, size, style, fam, w, m, capH, padX, padT, bw, bh });
    }
    const lh = Math.max(110, ...rows.map(r => r.bh + 26));
    rows.forEach((r, i) => {
      let x, y;
      if (o.layout === 'scatter') { const s = SCAT[i % SCAT.length]; x = s[0]; y = s[1] - r.bh / 2; }
      else { x = 220 + IND[i % IND.length]; y = CYc(o) - (n * lh) / 2 + i * lh + (lh - r.bh) / 2; }
      r.x = r.x ?? x; r.y = r.y ?? y;
      r.x = cl(r.x, 150, W - 150 - r.bw); r.y = cl(r.y, 150, H - 150 - r.bh);
    });
    return rows;
  }
  const CYc = o => (o.vp ? o.vp[1] : 540);

  function textCorridor(o = {}) {
    const stage = o.tone === 'paper' || o.tone === 'ink' ? o.tone : (XK.TH.dark ? 'ink' : 'paper');
    const P = DS.tone(stage), PI = DS.tone('ink'), A = XK.col('accent'), hit = !!o.hit, seed = o.seed ?? 1;
    const at = o.at ?? 0, vp = o.vp || [960, 540], spokes = [8, 12, 16].includes(o.spokes) ? o.spokes : 12, lanes = spokes / 4;
    if (!(o.words && o.words.length)) console.error('XM.textCorridor: words (English wall words) are required; the component has no default words');
    const words = (o.words && o.words.length ? o.words : [' ']).map(String);
    // English only. console.error fails the render check; the caller must switch to English before rendering
    const zhBad = [...words, ...(o.phrase || []).map(p => typeof p === 'string' ? p : (p && p.text) || '')].filter(x => CJK.test(x));
    if (zhBad.length) console.error('XM.textCorridor takes English only (wall words and phrase): ' + zhBad.join(' / '));
    const speed = (o.speed ?? 1) * (hit ? 3 : 1) * .55;          // log radius per second
    const dim = o.dim ?? .68, light = o.light === false ? 0 : (o.light ?? (hit ? 1 : .7));
    const ink3 = v3(P.fg), bg3 = v3(P.bg);
    const COL = stage === 'paper'
      ? { base: bg3.clone(), seam: mix3(bg3, ink3, .14), ink: ink3, fog: v3('#ffffff'), glow: new THREE.Vector3(.35, .35, .35), bg: bg3 }
      : { base: mix3(bg3, ink3, .025), seam: new THREE.Vector3(0, 0, 0), ink: ink3, fog: mix3(bg3, ink3, .45), glow: new THREE.Vector3(1, 1, 1), bg: bg3 };
    const BOX = PI.bg, BOXT = PI.fg, KEY = PI.accent;                   // layer over content: solid ink block + off-white text; key = an accent readable on the ink stage
    const hudO = o.hud === false ? null : { tl: 'FIG', ...(o.hud || {}) };
    let rows = null;
    const getRows = () => { if (rows) return rows; const r = layPhrase(o, P); if (fontsReady()) rows = r; return r; };
    const flashes = (o.flash || []).map(f => typeof f === 'number' ? { at: f } : f);
    const cues = hit ? [{ t: +at.toFixed(3), name: SFX.transition, gain: .5 }] : [];             // no sound for the explanatory fade-in; hook burst gets a whoosh
    for (const p of (o.phrase || [])) if (p && p.at != null && p.sfx !== false) cues.push({ t: +p.at.toFixed(3), name: typeof p.sfx === 'string' ? p.sfx : SFX.tag, gain: .35 });
    // Hook mode frame skipping: update only every 3 / 2 frames alternately
    const stepT = t => { if (!hit) return t; const f = Math.max(0, frameOf(t, at)), k = Math.floor(f / 5) * 5 + (f % 5 >= 3 ? 3 : 0); return at + k / FPS; };
    const R0 = XM.rng(seed * 11 + 5), SPK = Array.from({ length: 12 }, (_, i) => ({ a: i / 12 * TAU + (R0() - .5) * .3, l: 2.2 + R0() * 3, w: 1.1 + R0() * 1.4 }));

    const shot = XM.shot({ bg: P.bg, cam: o.cam }, () => (g, t) => {
      const ts = stepT(t), S = strip(words), U = quad().mat.uniforms;
      const lrS = (o.squeeze ?? (S.zh ? .8 : .55)) * S.aspect * 2 / (KAB * lanes), lrT = (o.squeeze ?? (S.zh ? .8 : .55)) * S.aspect * 2 * KAB / lanes;
      const burst = hit ? 1.4 * (1 - Math.exp(-Math.max(0, ts - at) * 5)) : 0;          // hook mode: speed kick on entrance
      U.uTex.value = S.tex; U.uVP.value.set(vp[0], vp[1]); U.uLanes.value = lanes; U.uLrS.value = lrS; U.uLrT.value = lrT;
      U.uPhase.value = ((ts - at) * speed + burst) / lrS; U.uDim.value = dim; U.uLight.value = light; U.uSeed.value = seed * 3.7; U.uSoft.value = 1;
      U.uReveal.value = hit ? 2300 * Math.pow(pr(t, at, .3), 1.6) : 3000;          // hook mode: bursts outward from the vanishing point, accelerating. NOTE: the rest of this line is commented out: U.uFade.value = hit ? 1 : EO(pr(t, at, .5)); U.uRGB.value = hit ? 1.6 : 0;
      for (const k of ['base', 'seam', 'ink', 'fog', 'glow', 'bg']) U['u' + k[0].toUpperCase() + k.slice(1)].value.copy(COL[k]);
      XM.drawGL(g, Q.scene, Q.cam);
      // Vanishing-point star flare (smaller and dimmer when explanatory; changes size each step in hook mode)
      const kf = hit ? 1 : EO(pr(t, at, .5));
      if (light > 0 && kf > 0 && stage === 'ink') {
        const R = (hit ? 22 + 8 * Math.sin(ts * 9.1 + seed) : 16) * light, [cx, cy] = vp;
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = kf;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * 3.2);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.28, 'rgba(255,255,255,.9)'); gr.addColorStop(.45, 'rgba(235,238,240,.35)'); gr.addColorStop(1, 'rgba(200,205,210,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R * 3.2, 0, TAU); g.fill();
        for (const s of SPK) {
          const len = R * s.l * (hit ? 1 : .8), ex = cx + Math.cos(s.a) * len, ey = cy + Math.sin(s.a) * len, lg = g.createLinearGradient(cx, cy, ex, ey);
          lg.addColorStop(0, `rgba(255,255,255,${hit ? .55 : .35})`); lg.addColorStop(1, 'rgba(255,255,255,0)');
          g.strokeStyle = lg; g.lineWidth = s.w; g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
        }
        g.restore();
      }
      // Foreground phrase: ink block wipes open, text revealed with it
      const Rw = getRows();
      for (const r of Rw) {
        if (r.at == null || t < r.at) continue;
        const k = hit ? 1 : EO(pr(t, r.at, .22)), ww = r.bw * k;
        g.fillStyle = BOX; g.fillRect(r.x, r.y, ww, r.bh);
        g.save(); g.beginPath(); g.rect(r.x, r.y, ww, r.bh); g.clip();
        const col = r.style === 'key' ? KEY : BOXT, bx = r.x + r.padX - r.m.l, by = r.y + r.padT + r.capH;
        if (r.zh && r.style === 'italic') { g.translate(bx, by); g.transform(1, 0, -.2, 1, 0, 0); put(g, r.text, r.size * .1, 0, r.fam, r.size, r.w, col); }
        else put(g, r.text, bx, by, r.fam, r.size, r.w, col);
        g.restore();
      }
      // Accent block: one flash
      for (const f of flashes) {
        const dur = hit ? 2 / FPS : (f.dur ?? .2); if (t < f.at || t >= f.at + dur) continue;
        let ref = null, pre = f.mode === 'pre';
        if (f.word != null) ref = Rw[f.word];
        else if (pre) ref = Rw.filter(r => r.at != null && r.at > f.at).sort((a, b) => a.at - b.at)[0];
        else ref = Rw.filter(r => r.at != null && r.at <= f.at).sort((a, b) => b.at - a.at)[0];
        if (!ref) continue;
        const fh = f.h ?? ref.bh, fw = f.w ?? (pre ? ref.bw : ref.bh * 1.5);
        let fx = pre ? ref.x : ref.x + ref.bw + 16, fy = pre ? ref.y : ref.y;
        if (!pre && fx + fw > W - 150) fx = ref.x - 16 - fw;
        g.fillStyle = A; g.fillRect(fx, fy, fw, fh);
      }
      if (hudO) DS.hud(g, t, P, hudO);
    });
    shot.cues = cues;
    return shot;
  }

  Object.assign(XM, { textCorridor });
})();
