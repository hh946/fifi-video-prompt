// XS.screen: fisheye "phone filming a screen" evidence. Turns a real screenshot into a shot that looks like a phone
// pointed at a monitor: barrel fisheye distortion centred on the lens + scan lines / moire interference + vignette; the
// focus point moves by keyframes (push in to the line being discussed). Highlight marks are drawn in screenshot pixel
// coordinates, bend with the distortion in the shader and sit under the moire and vignette, like a highlight that was
// on the screen all along.
// Docs: docs/components/xs-screen.md
//
// ---------- Upstream source ----------
// The shader and the timing of the push-in / mark slide-in are ported from vibe-motion/fisheye-motion:
//   https://github.com/vibe-motion/fisheye-motion  commit c163ee8c20ffcbba384e792ff0bc26618a392aba (2026-09-04, zjucat)
//   - src/lib/FisheyeRenderer.js: fragment shader (distortion / fade to black out of bounds / four blend modes for mark
//     rectangles + mask slide-in / moire / vignette), default parameters, rectangle coordinate conversion
//   - vibe-motion-app/motion/timeline.js: focus push easeInOutCubic, mark mask easeOutCubic, linear drift after the push
// License: the repository has no LICENSE file. See also xm-assets/screen/SOURCE.md.
// Changes from upstream: (1) no separate WebGL context, uses the shared renderer XM.gl() (three r158 ShaderMaterial,
//   GLSL1 auto-converted under WebGL2); (2) added uCenter (distortion centre fixed at the lens centre while the content
//   moves underneath, like a real phone lens; pull:0 restores upstream's "magnifier follows the focus point");
//   (3) added uCrop (screenshot pixel crop), uExpo (entry exposure), uMoirePhase (slowly crawling moire); (4) texture
//   uses mipmaps + anisotropic filtering so text does not shimmer when scaled down; (5) every frame is fully determined
//   by t (no rAF / video source).
//
// ---------- API ----------
// XS.screen({
//   src, iw, ih            screenshot path (loaded with XM.image, works from file://, pixels never read) and its pixel
//                          size (required)
//   crop:[x,y,w,h]         framing (screenshot px), default the whole image. Expanded automatically to the screen box
//                          aspect (cover); the screenshot outside the crop stays visible (the screen is continuous)
//   at                     entry time (absolute s), default 0. Entry: viewfinder corners close in 0.5 s + exposure rises
//                          from black over 0.6 s + distortion relaxes from 1.8x to the set value
//   out                    exit time (optional): 0.25 s fade out
//   tone                   'ink'|'paper'|'accent': stage. Default follows the theme (XK.tone('paper', ...) or XK.theme)
//   page                   'light'|'dark': whether the screenshot itself is a light or dark page. Sets the highlight blend
//                          (light multiply / dark screen) and mark colours. Default 'light'
//   focus:[[t, ix, iy, zoom, ease?]]   focus keyframes (screenshot px + zoom, 1 = exactly the crop). easeInOutCubic
//                          between keys (as upstream). The point is moved to the screen centre (see pull). Default crop
//                          centre, zoom 1
//   pull                   0..1, default 1: move the focus point to the screen centre (camera pan). 0 = upstream behaviour
//                          (distortion centre follows the focus point, like a magnifier)
//   drift                  constant slow push: zoom fraction per second (upstream zoomDrift), default 0.035; keeps reading
//                          holds alive. 0 = off
//   marks:[{ x,y,w,h, at, dur, mode:'sweep'|'bracket', blend, color, opacity, out, note }]
//                          screenshot px. sweep: highlight block sliding in left to right in the shader (dur default 0.6 s,
//                          easeOutCubic), bends with the distortion; highlights are always fluorescent yellow (color is
//                          ignored); blend defaults by page: light multiply / dark difference (both give dark text on
//                          yellow; screen / lighten are switched to difference); opacity default light .9 / dark 1
//                          bracket: four corner brackets closing in (like XM.mark.bracket), bracket lines mapped through
//                          the distortion; colour picked for >= 3:1 contrast with the page (color is preferred if it passes)
//                          note: { text, x, y, at, align } leader line from this mark to a white-on-black label at (x,y)
//                          (stage coords, XM.mark.callout, size 56)
//                          at most 8 sweeps (shader limit, same as upstream)
//   stamps:[{ text, x, y, at, size, rot }]  verdict stamps (XM.mark.stamp), stage coords
//   fisheye:{ strength, zoom }   distortion strength (default .45; upstream's 1.6 is too strong to read text), base zoom
//                          (default 1.1). strength may be keyframes [[t, v], ...] (easeInOut between keys)
//   moire:{ intensity, scale, angle, drift }  default { .1, 640, 0, 1.4 } (drift = moire crawl speed in rad/s). intensity
//                          may be keyframes. Upstream defaults .28 / 900 make text noisy
//   vignette:{ amount, radius, softness }     default { .7, .78, .45 } (upstream .85 / .72 / .45)
//   frame                  'screen' (default: viewfinder corners + thin border) | 'phone' (portrait phone: ink bezel +
//                          rounded screen) | 'none' (nothing, pair with a full-frame box)
//   box:[x,y,w,h]          screen position on stage. Default screen [190,150,1540,780]; phone [690,110,540,860]
//   af                     autofocus box: when the focus point moves noticeably (> 6% of the crop width), a yellow focus
//                          box flashes at the screen centre. Default true
//   hud                    { tl, bl, br } standard corner HUD (XM.DS.hud), br defaults to Chinese for "screenshot"; false = off
//   label                  small category text above the viewfinder (decoration), default none
//   bg                     stage background, default the tone's background
// })
// Returns { L, update(t, kS), toStage(ix, iy, t) } for XK.seq. toStage converts screenshot px to this frame's stage
// coordinates (for adding your own overlays).
//
// When to use screen instead of a flat screenshot: when you want "caught on camera" evidence (a screenshot someone sent,
// a back-office page). Use it 1-3 times per video; more gets disorienting.
// Defaults are calm: no shake, no overshoot; push easeInOutCubic, highlight easeOutCubic, brackets expoOut.
// Requires three r158 (global THREE), lib.js, xk.js, xk-shots.js, xm-core.js, xm-ds.js.
(() => {
  const { W, H } = XK;
  const MAX_RECTS = 8;
  const BLEND = { normal: 0, multiply: 1, screen: 2, lighten: 3, difference: 4 };
  const clamp01 = k => Math.max(0, Math.min(1, k));
  const easeOutCubic = k => 1 - Math.pow(1 - clamp01(k), 3);
  const easeInOutCubic = k => { k = clamp01(k); return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  const hexRgb = (h) => { const s = String(h).replace('#', ''); const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s.slice(0, 6), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

  const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

  // Fragment shader: ported from fisheye-motion/src/lib/FisheyeRenderer.js (see header), with added uCenter / uCrop / uExpo / uMoirePhase.
  const FRAG = `
varying vec2 vUv;

uniform sampler2D uTex;
uniform float uAspect;         // screen box aspect w/h
uniform vec2  uFocus;          // focus point (crop space, gl coords, y up)
uniform vec2  uCenter;         // distortion centre on screen (upstream = uFocus)
uniform float uStrength;       // barrel distortion strength
uniform float uZoom;           // centre zoom
uniform vec4  uCrop;           // crop rectangle as uv in the full texture: x0, y0, w, h (gl coords)
uniform float uExpo;           // exposure (0 -> 1 on entry)
uniform float uMoireIntensity;
uniform float uMoireScale;
uniform float uMoireAngle;
uniform float uMoirePhase;     // moire crawl phase
uniform float uVignette;
uniform float uVignetteRadius;
uniform float uVignetteSoft;

#define MAX_RECTS 8
uniform int   uRectCount;
uniform vec4  uRects[MAX_RECTS];      // x,y,w,h: crop space (gl coords, y up)
uniform vec4  uRectColors[MAX_RECTS]; // rgb + opacity
uniform float uRectBlends[MAX_RECTS]; // 0 normal / 1 multiply / 2 screen / 3 lighten
uniform float uRectMasks[MAX_RECTS];  // 0..1 left-to-right slide-in progress

void main() {
  // ---- fisheye: barrel distortion around uCenter, centred on uFocus ----
  vec2 p = vUv - uCenter;
  p.x *= uAspect;
  float r2 = dot(p, p);
  vec2 pd = p * (1.0 + uStrength * r2) / uZoom;
  pd.x /= uAspect;
  vec2 suv = uFocus + pd;                      // crop space
  vec2 tuv = uCrop.xy + suv * uCrop.zw;        // full texture

  vec3 col;
  bool inside = tuv.x >= 0.0 && tuv.x <= 1.0 && tuv.y >= 0.0 && tuv.y <= 1.0;
  if (inside) {
    col = texture2D(uTex, tuv).rgb;
  } else {
    vec2 cuv = clamp(tuv, 0.0, 1.0);
    float over = length((tuv - cuv) / uCrop.zw) * 12.0;
    col = texture2D(uTex, cuv).rgb * max(0.0, 1.0 - over);
  }

  // ---- mark rectangles: drawn in source image coords, bend with the fisheye, then covered by moire / vignette ----
  for (int i = 0; i < MAX_RECTS; i++) {
    if (i >= uRectCount) break;
    vec4 rc = uRects[i];
    if (inside &&
        suv.x >= rc.x && suv.x <= rc.x + rc.z * uRectMasks[i] &&
        suv.y >= rc.y && suv.y <= rc.y + rc.w) {
      vec3 mark = uRectColors[i].rgb;
      float mode = uRectBlends[i];
      vec3 blended;
      if (mode < 0.5)      blended = mark;
      else if (mode < 1.5) blended = col * mark;
      else if (mode < 2.5) blended = 1.0 - (1.0 - col) * (1.0 - mark);
      else if (mode < 3.5) blended = max(col, mark);
      else                 blended = abs(col - mark);          // difference: yellow highlight on a dark page; light text turns dark, dark background turns yellow
      col = mix(col, blended, uRectColors[i].a);
    }
  }

  // ---- moire: interference of fine scan lines in source space x fine scan lines in screen space ----
  float s = sin(uMoireAngle), c = cos(uMoireAngle);
  vec2 sp = suv * uCrop.zw / uCrop.w;          // normalised by crop height so line density is the same for any crop
  float srcCoord = -s * sp.x * uAspect + c * sp.y;
  float scrCoord = -s * vUv.x * uAspect + c * vUv.y;
  float l1 = sin(srcCoord * uMoireScale);
  float l2 = sin(scrCoord * uMoireScale * 1.045 + 1.3 + uMoirePhase);
  float beat = 0.5 + 0.5 * l1 * l2;
  float fine = 0.5 + 0.5 * l1;
  float moire = mix(fine, beat, 0.65);
  col *= 1.0 - uMoireIntensity * moire;

  // ---- vignette: radial darkening around the frame centre ----
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  float d = length(q);
  float fall = smoothstep(uVignetteRadius - uVignetteSoft, uVignetteRadius + uVignetteSoft, d);
  col *= 1.0 - uVignette * fall;

  gl_FragColor = vec4(col * uExpo, 1.0);
}`;

  // textures cached by src (one screenshot shared across shots)
  const TEX = new Map();
  function texFor(src) {
    if (TEX.has(src)) return TEX.get(src);
    const r = XM.image(src), tex = new THREE.Texture(r.img);
    tex.colorSpace = THREE.NoColorSpace;            // sample as-is, no colour space conversion on output (matches upstream's raw WebGL)
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const T = { r, tex, up: false };
    TEX.set(src, T);
    return T;
  }

  // number or keyframes [[t, v, ease?], ...]
  const val = (v, t, d) => v == null ? d : Array.isArray(v) ? kf(v, t) : v;

  function screen(o) {
    const stageName = o.tone || (XK.TH.dark ? 'ink' : 'paper');
    const P = XM.DS.tone(stageName);
    const page = o.page || 'light';
    const PP = XM.DS.tone(page === 'dark' ? 'ink' : 'paper');      // marks drawn on the screenshot use the page's palette, not the stage's
    // bracket colour chosen for contrast with the screenshot (>= 3:1) instead of relying on the caller
    const markCol = XM.DS.pick(page === 'dark' ? '#111111' : '#ffffff', [PP.accent, P.accent, XM.DS.MARK, XM.DS.INK, XM.DS.PAPER]);
    const fr = o.frame || 'screen';
    const box = o.box || (fr === 'phone' ? [690, 110, 540, 860] : [190, 150, 1540, 780]);
    const [bx, by, bw, bh] = box, aspect = bw / bh;
    const iw = o.iw, ih = o.ih;
    // framing: expand to the screen box aspect (cover)
    let [cx, cy, cw, ch] = o.crop || [0, 0, iw, ih];
    if (cw / ch < aspect) { const nw = ch * aspect; cx -= (nw - cw) / 2; cw = nw; } else { const nh = cw / aspect; cy -= (nh - ch) / 2; ch = nh; }
    const at = o.at || 0;
    const FE = { strength: .45, zoom: 1.1, ...(o.fisheye || {}) };
    const MO = { intensity: .1, scale: 640, angle: 0, drift: 1.4, ...(o.moire || {}) };
    const VG = { amount: .7, radius: .78, softness: .45, ...(o.vignette || {}) };
    const pull = o.pull ?? 1, driftZ = o.drift ?? .035;
    const focus = (o.focus && o.focus.length ? o.focus : [[at, cx + cw / 2, cy + ch / 2, 1]]).map(f => f.slice());
    const marks = (o.marks || []).map(m => ({ ...m, mode: m.mode === 'box' ? 'bracket' : (m.mode || 'sweep') }));
    const sweeps = marks.filter(m => m.mode === 'sweep').slice(0, MAX_RECTS);
    const brackets = marks.filter(m => m.mode === 'bracket');
    const T = texFor(o.src);

    // ---- three: one full-screen triangle + the ported shader ----
    const U = {
      uTex: { value: T.tex }, uAspect: { value: aspect }, uFocus: { value: new THREE.Vector2(.5, .5) }, uCenter: { value: new THREE.Vector2(.5, .5) },
      uStrength: { value: FE.strength }, uZoom: { value: FE.zoom },
      uCrop: { value: new THREE.Vector4(cx / iw, 1 - (cy + ch) / ih, cw / iw, ch / ih) }, uExpo: { value: 1 },
      uMoireIntensity: { value: MO.intensity }, uMoireScale: { value: MO.scale }, uMoireAngle: { value: MO.angle }, uMoirePhase: { value: 0 },
      uVignette: { value: VG.amount }, uVignetteRadius: { value: VG.radius }, uVignetteSoft: { value: VG.softness },
      uRectCount: { value: sweeps.length },
      uRects: { value: Array.from({ length: MAX_RECTS }, () => new THREE.Vector4()) },
      uRectColors: { value: Array.from({ length: MAX_RECTS }, () => new THREE.Vector4()) },
      uRectBlends: { value: new Float32Array(MAX_RECTS) }, uRectMasks: { value: new Float32Array(MAX_RECTS) },
    };
    sweeps.forEach((m, i) => {
      // screenshot px -> crop-space uv (gl coords: the rectangle's top edge y becomes bottom 1-(y+h), same conversion as upstream)
      U.uRects.value[i].set((m.x - cx) / cw, 1 - (m.y + m.h - cy) / ch, m.w / cw, m.h / ch);
      // highlights are always fluorescent yellow: light page multiply, dark page difference, both "dark text on yellow"; legacy screen / lighten would give white text on yellow, so they are replaced
      const [r, g, b] = hexRgb(XM.DS.MARK);
      let bl = m.blend || (page === 'dark' ? 'difference' : 'multiply'); if (bl === 'screen' || bl === 'lighten') bl = 'difference';
      U.uRectColors.value[i].set(r, g, b, m.opacity ?? (bl === 'difference' ? 1 : .9));
      U.uRectBlends.value[i] = BLEND[bl] ?? 1;
    });
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, depthTest: false, depthWrite: false });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));   // large triangle covering the screen (as upstream)
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
    const scene = new THREE.Scene(); scene.add(mesh);
    const cam = new THREE.Camera();
    const VP = new THREE.Vector4();

    // ---- per-frame camera state (pure function) ----
    function lens(t) {
      let fx, fy, z, tLast = focus[focus.length - 1][0];
      if (t <= focus[0][0]) [, fx, fy, z] = focus[0];
      else if (t >= tLast) [, fx, fy, z] = focus[focus.length - 1];
      else for (let i = 1; i < focus.length; i++) if (t < focus[i][0]) {
        const a = focus[i - 1], b = focus[i], k = (b[4] || easeInOutCubic)((t - a[0]) / (b[0] - a[0]));
        fx = a[1] + (b[1] - a[1]) * k; fy = a[2] + (b[2] - a[2]) * k; z = (a[3] ?? 1) + ((b[3] ?? 1) - (a[3] ?? 1)) * k; break;
      }
      z = (z ?? 1) * (1 + driftZ * Math.max(0, t - at));             // constant slow push (upstream zoomDrift) keeps holds alive
      const ke = XM.expoOut(clamp01((t - at) / .6));
      const F = [(fx - cx) / cw, 1 - (fy - cy) / ch];
      const C = [F[0] + (.5 - F[0]) * pull, F[1] + (.5 - F[1]) * pull];
      return { F, C, Z: FE.zoom * z, S: val(FE.strength, t, .45) * (1 + .8 * (1 - ke)), ke };
    }
    // screenshot px -> stage px (solve rho + S*rho^3 = Z|d| for the on-screen position)
    function map(ix, iy, Lz) {
      let dx = ((ix - cx) / cw - Lz.F[0]) * aspect, dy = (1 - (iy - cy) / ch) - Lz.F[1];
      const dl = Math.hypot(dx, dy);
      let ux = Lz.C[0], uy = Lz.C[1];
      if (dl > 1e-7) {
        const target = Lz.Z * dl; let r = target;
        for (let i = 0; i < 12; i++) { const f = r + Lz.S * r * r * r - target, df = 1 + 3 * Lz.S * r * r; r -= f / df; if (r < 0) r = 0; }
        ux += dx / dl * r / aspect; uy += dy / dl * r;
      }
      return [bx + ux * bw, by + (1 - uy) * bh];
    }

    const shot = XM.shot({ bg: o.bg || P.bg, stage: 'flat' }, () => (g, t) => {
      const kOut = o.out != null ? XM.DS.out(t, o.out) : 1;
      XM.DS.stage(g, P, { light: true });
      if (o.hud !== false) XM.DS.hud(g, t, P, { tl: (o.hud && o.hud.tl) || 'FIG.SCR', bl: o.hud && o.hud.bl, br: (o.hud && o.hud.br) ?? 'SCREENSHOT' });
      if (t < at) return;
      g.save(); g.globalAlpha *= kOut;
      const kF = XM.DS.in(t, at, .5);
      if (fr !== 'none') XM.DS.frame(g, bx, by, bw, bh, P, { kind: 'evidence', k: kF, label: o.label });
      if (fr === 'phone') { g.fillStyle = P.ink; g.beginPath(); g.roundRect(bx - 16, by - 16, bw + 32, bh + 32, 58); g.fill(); }

      // ---- shader render ----
      const Lz = lens(t);
      if (T.r.ok && !T.up) { T.tex.needsUpdate = true; T.up = true; }
      if (T.r.ok) {
        U.uFocus.value.set(Lz.F[0], Lz.F[1]); U.uCenter.value.set(Lz.C[0], Lz.C[1]);
        U.uZoom.value = Lz.Z; U.uStrength.value = Lz.S; U.uExpo.value = Lz.ke;
        U.uMoireIntensity.value = val(MO.intensity, t, .1); U.uMoirePhase.value = MO.drift * t;
        sweeps.forEach((m, i) => { const k = easeOutCubic((t - m.at) / (m.dur || .6)); U.uRectMasks.value[i] = m.out != null ? k * XM.DS.out(t, m.out) : k; });
        const r = XM.gl();
        if (!T.aniso) { T.tex.anisotropy = r.capabilities.getMaxAnisotropy(); T.aniso = true; }
        const rw = Math.min(W, Math.round(bw)), rh = Math.min(H, Math.round(bh));
        r.getViewport(VP);
        r.toneMapping = THREE.NoToneMapping; r.setClearColor(0x000000, 0); r.clear();
        r.setViewport(0, 0, rw, rh); r.render(scene, cam); r.setViewport(VP);
        g.save();
        g.globalAlpha *= clamp01((t - at) / .25);
        if (fr === 'phone') { g.beginPath(); g.roundRect(bx, by, bw, bh, 42); g.clip(); }
        g.drawImage(r.domElement, 0, H - rh, rw, rh, bx, by, bw, bh);
        g.restore();
      }
      if (fr === 'screen') { g.strokeStyle = P.line; g.lineWidth = 2; g.strokeRect(bx, by, bw, bh); }

      // ---- brackets: corner brackets mapped through the distortion (they bend) ----
      g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
      for (const m of brackets) {
        let k = XM.DS.in(t, m.at, .42); if (m.out != null) k *= XM.DS.out(t, m.out);
        if (k <= 0) continue;
        const [ax, ay] = map(m.x + m.w / 2, m.y + m.h / 2, Lz), [ex] = map(m.x + m.w / 2 + 10, m.y + m.h / 2, Lz);
        const sc = Math.max(.05, Math.abs(ex - ax) / 10);                     // stage px / screenshot px (local)
        const pad = ((m.pad ?? 14) + 46 * (1 - k)) / sc, len = (m.len || 28) / sc;
        const x0 = m.x - pad, y0 = m.y - pad, x1 = m.x + m.w + pad, y1 = m.y + m.h + pad;
        g.save(); g.globalAlpha *= clamp01(k * 2); g.strokeStyle = m.color ? XM.DS.pick(page === 'dark' ? '#111111' : '#ffffff', [XK.col(m.color), markCol]) : markCol; g.lineWidth = m.lw || 5; g.lineJoin = 'miter'; g.beginPath();
        for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
          for (let i = 0; i <= 6; i++) { const [qx, qy] = map(px, py + sy * len * (1 - i / 6), Lz); i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }
          for (let i = 1; i <= 6; i++) { const [qx, qy] = map(px + sx * len * i / 6, py, Lz); g.lineTo(qx, qy); }
        }
        g.stroke(); g.restore();
      }
      g.restore();

      // ---- autofocus box: flashes a yellow box at the screen centre on each focus change (phone-filming cue) ----
      if (o.af !== false) for (let i = 1; i < focus.length; i++) {
        const ft = focus[i - 1][0], d = t - ft;                               // focus at the moment the push starts
        if (d < 0 || d > 1.1 || Math.hypot(focus[i][1] - focus[i - 1][1], focus[i][2] - focus[i - 1][2]) < cw * .06) continue;   // only when the position changes noticeably (no flashing on slow pushes)
        const kk = XM.expoOut(clamp01(d / .22)), blink = d > .5 && d < .8 && Math.floor(d / .1) % 2 === 1 ? .25 : 1;
        const a = (d > .85 ? 1 - (d - .85) / .25 : 1) * blink, s = 150 * (1.35 - .35 * kk);
        const ux = bx + Lz.C[0] * bw, uy = by + (1 - Lz.C[1]) * bh;
        g.save(); g.globalAlpha *= clamp01(a);
        XM.FX.bracket(g, ux - s / 2, uy - s / 2, s, s, 22, P.mark, 3);
        XM.FX.cross(g, ux, uy, 9, P.mark, 2, 0);
        g.restore();
      }

      // ---- leader-line labels, verdict stamps (stage coords) ----
      for (const m of marks) if (m.note) {
        const n = m.note, k = XM.DS.in(t, n.at ?? (m.at + .4), .42) * (n.out != null ? XM.DS.out(t, n.out) : 1);
        if (k <= 0) continue;
        const right = n.x >= map(m.x + m.w / 2, m.y, Lz)[0];
        const [ax, ay] = map(right ? m.x + m.w + 8 : m.x - 8, m.y + m.h / 2, Lz);
        XM.mark.callout(g, ax, ay, n.x, n.y, n.text, PP, k, { align: n.align || (right ? 'left' : 'right'), size: n.size });
      }
      for (const s of o.stamps || []) XM.mark.stamp(g, s.x, s.y, s.text, P, XM.DS.hit(t, s.at), { size: s.size, rot: s.rot });
      g.restore();
    });
    shot.toStage = (ix, iy, t) => map(ix, iy, lens(t));
    return shot;
  }

  Object.assign(XS, { screen });
})();
