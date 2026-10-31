// XM.tiltWords: tilted perspective word groups. Short phrases are mapped onto true perspective planes (four-point
// homography, not skew); each group appears when it is spoken; groups far from the focus are blurred. An optional
// foreground subject sits on top of the words.
// Requires lib.js, xk.js, xm-core.js, xm-ds.js (xm-tex.js optional: with XM.tex.use the stage material / window light /
// post effects change). Canvas 2D shell (XM.shot) + the shared three.js renderer (XM.gl / XM.drawGL).
// Perspective text: one full-screen RawShaderMaterial; the fragment shader maps each screen pixel back into the text
// texture with the inverse homography (mip level from the Jacobian, manual LOD, no implicit derivatives). Depth of field
// is done in the same shader (per-pixel circle of confusion + 24-tap disc). Deterministic: no Math.random / Date; the same
// input gives byte-identical frames.
// Docs: docs/components/tilt.md
//
// Default motion feel (FEEL below):
//   - each group slides in from off-screen toward the subject, first frame 43-72 px from its end position (about 60),
//     remaining offset R = (1-k)^2.4, done in 0.67-0.87 s (default .75 s);
//   - opacity follows the same curve (1-(1-k)^2.4), reaches 1 in 0.7-0.93 s (default .85 s); fadeEase:'linear' also works;
//   - while sliding: sharp text + trails along the slide direction (current, 0.5 and 1 frame ago, weighted .55 / .25 / .20,
//     like frame-blended footage); no blur once settled;
//   - text: Source Han Serif 900, not condensed, tilted by perspective only; no drop shadow behind the words; the subject
//     sits above the words with a soft paper shadow of only .22;
//   - camera (words + subject, stage fixed) can pull back around the frame centre (e.g. to .90, accelerating) -> zoom;
//     the subject scales and straightens around the frame centre (cubic easeOut) -> subject.keys.
//
// -----------------------------------------------------------------------------
// XM.tiltWords(o) -> { L, update, cues, api }
//   A frame only: which words, on which planes, when they appear, what the focus follows and what sits in front are all
//   decided by the caller. No default words, subject or layout.
//   Variant A (main usage): word planes placed around a subject with quad / pos / screen.
//   Variant B: words on the surfaces of a 3D space (space + on) with camera moves (cam keyframes).
//   words (required): [{ ... }]  one entry per phrase group.
//     text (required), at (required, absolute time in s when the group appears)
//     placement (exactly one, required):
//       quad   : [[x,y] x4]  screen points the line's em box maps to (top-left, top-right, bottom-right, bottom-left).
//                Use when matching measured corners; ignores cam, follows zoom only
//       on     : 'floor' | 'back' | 'left' | 'right' | 'ceiling'  which surface of space; position x / y / z (world
//                coords, omit the axis that is fixed by the surface), roll (in-plane rotation, degrees, clockwise +)
//       pos    : [x, y, z] + rot:[pitch, yaw, roll]  free tilted board in space (pitch>0 top edge leans away,
//                yaw>0 right side goes away, roll>0 clockwise)
//       screen : [x, y] + depth (default 1 = at distance F) + rot  same, placed by screen position: em box centre at screen
//     size   : em height (world px; at Z = F equals screen px). Not needed for quad. Readable words must stay >= 56 px at
//              their smallest point after perspective (checked, console.warn if not; ambient:true words are not checked)
//     anchor : [ax, ay] point of the em box placed at pos (default [.5, .5]); stretch: in-plane vertical stretch (for floor
//              text that looks too flat at a grazing angle, like road markings; default 1)
//     font   : 'SerifSC' (default, Source Han Serif) | 'HeiSC' | 'PlayIt' | 'Grot' | 'Mono' | 'StixIt' | 'Brush'; weight 900;
//              squeeze = horizontal condense (default 1); track = letter spacing (em)
//     color  : 'fg' (default) | 'accent' | 'mute' | '#hex'; fill:'grad' vertical gradient (light top, dark bottom; default flat)
//     enter  : 'slide' (default) | 'light' (lights up in place from a faint ghost, ghost default .16) | 'rise' (pushed up
//              along the plane) | 'cut'
//              or { kind, dur, fade, ease, fadeEase, from:[dx,dy] (screen px, first-frame offset for slide; omitted = dist px
//              outward from the focus centre), dist:60, trail:true, plane:[du,dv] }
//     ghost  : ghost opacity before at (default 0; .16 for light); out: when this group fades out (.3 s)
//     mark   : { at, dur:.45 } highlighter sweep (yellow block on the same tilted plane, left to right; swept text turns ink)
//     depth  : relative depth in quad mode (default 1, for DOF); focus:false = focus never follows it; ambient:true =
//              background words; sfx: sound name for this group | false
//   space (optional): surfaces. { floor:{ y, grid, extent }, back:{ z, ... }, left:{ x, ... }, right:{ x, ... }, ceiling:{ y, ... } }
//              grid = { step:300 (world px), width:5, color:'fg', alpha:.12 } perspective grid on the surface (tiles / wall
//              panels), affected by DOF and fog; extent = { x:[x0,x1], y:[...], z:[z0,z1] } surface bounds (default very large)
//   cam (optional): perspective camera { pos:[x,y,z], yaw, pitch (>0 looks down), roll, F:1500 (focal length px), cx, cy
//              (principal point = vanishing centre, default frame centre; moving it up = shift lens, verticals stay straight) }
//              or [[t, {...}, ease], ...] for dolly / pan (ease on the arriving key). quad words do not follow the camera
//   zoom (optional): [[t, s, ease], ...] scales words + subject together around zc (default frame centre); the stage does
//              not move. For a full-frame push use XM.tex.use's push
//   focus (optional): 'follow' (default: focus on the most recently spoken group, moving over shift s) |
//              [[t, index | 'subject' | {x,y,z}], ...]
//   dof (optional): { ap:0 (depth DOF: blur = ap * |1 - focusDepth / depth|, px), screen:{ r0, r1, max, pow } (blur by
//              screen distance from the focus, r0 -> r1 ramps to max px), max:10, shift:.6 } | false
//   fog (optional): { near, far, amt:1 } world px depth; farther fades into the background (cam-mode words and surfaces only)
//   subject (optional): foreground subject, always above the words
//     { src (cut-out transparent PNG) | draw(g, t, P, api), box:[x,y,w,h] | x, y (centre), h, scale (PNG pixel ratio,
//       default fit to box), keys:[[t, s, rot, dx, dy, ease], ...] (scale / rotate / move around pivot, default subject
//       centre), pivot:[x,y], pos3:[x,y,z] (place in the 3D scene: bottom centre stands here, follows the camera, gets DOF)
//       + h3 (world height), at, out (appear / disappear, .3 s fades), blur (px), alpha,
//       shadow: { kind:'drop' (soft shadow on the paper) | 'ground' (contact shadow for standing on a floor), dx, dy,
//       blur, a, sy, shear, near:.4 (shadow strength left where it is close to the words) } | false }
//   tone : 'paper' (default) | 'ink' | 'accent'; hud: { tl, bl, br } (required, you write the corner text; the component
//          fills none) | false
//   under(g, t, P, api) / draw(g, t, P, api): draw your own layer below the words / above the subject
//   sfx  : 'first' (default: SFX.appear on the first group; sweep sound on marks) | 'each' (SFX.tag on every later group)
//          | false. Groups appear word by word with the voiceover, so a sound on every group gets noisy; by default only
//          the first group gets one.
// api: cam(t), project([x,y,z], t), wordQuad(i, t), subjectBox(t), P. All times are absolute seconds.
(() => {
  const { W, H } = XK;
  const DS = XM.DS, SFX = DS.SFX;
  const RAD = Math.PI / 180;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fps = () => (window.VIDEO && VIDEO.fps) || 30;
  const err = m => console.error('XM.tiltWords: ' + m);
  const warn = m => console.warn('XM.tiltWords: ' + m);
  const smooth = k => k * k * (3 - 2 * k);
  const powOut = p => k => 1 - Math.pow(1 - cl(k), p);
  const EASES = {
    linear: k => k, smooth, easeIn: k => k * k * k, easeOut: k => 1 - Math.pow(1 - k, 3), quadIn: k => k * k, quadOut: k => 1 - (1 - k) * (1 - k),
    easeInOut: k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), sine: k => .5 - .5 * Math.cos(Math.PI * k), expoOut: XM.expoOut,
    smoother: k => k * k * k * (k * (k * 6 - 15) + 10),
  };
  const ez = e => (typeof e === 'function' ? e : typeof e === 'number' ? powOut(e) : EASES[e] || EASES.linear);
  // default motion feel (see header)
  const FEEL = { dur: .75, fade: .85, ease: 2.4, fadeEase: 2.4, dist: 60, trail: [[0, .55], [.5, .25], [1, .2]], ghost: .16, lightDur: .45, shift: .6, out: .3 };
  const FAMS = ['SerifSC', 'HeiSC', 'PlayIt', 'Grot', 'Mono', 'StixIt', 'Brush', 'Unb'];
  const ASC = .88;      // em box: .88 em above the baseline, .12 em below (CJK ideographic box for Source Han Serif / Sans)

  // ---------- small matrices (3x3, row-major) ----------
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function mm(A, B) {
    const o = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return o;
  }
  const Tm = (dx, dy) => [1, 0, dx, 0, 1, dy, 0, 0, 1];
  const Sm = (s, cx, cy) => [s, 0, cx * (1 - s), 0, s, cy * (1 - s), 0, 0, 1];
  // homography: 4 src points -> 4 dst points (Gaussian elimination, 8x8)
  function homography(src, dst) {
    const M = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      M.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]); M.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < 8; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let j = c; j <= 8; j++) M[r][j] -= k * M[c][j]; }
    }
    const h = M.map((r, i) => r[8] / r[i]);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }
  function inv3(m) {
    const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }
  function apH(m, x, y) { const w = m[6] * x + m[7] * y + m[8]; return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w, w]; }

  // ---------- camera ----------
  // World coords: x right, y down, z into the screen (same as screen axes). 1 world px at Z = F is 1 screen px.
  const CAM0 = { pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, F: 1500, cx: W / 2, cy: H / 2 };
  function basis(c) {
    const y = c.yaw * RAD, p = c.pitch * RAD, r = c.roll * RAD;
    const f = [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
    const rt = [Math.cos(y), 0, -Math.sin(y)], dn = cross(f, rt);
    const cr = Math.cos(r), sr = Math.sin(r);
    return { r: add(scl(rt, cr), scl(dn, sr)), d: add(scl(dn, cr), scl(rt, -sr)), f };
  }
  function project(c, B, P) { const v = sub(P, c.pos), Z = dot(B.f, v); return [c.cx + c.F * dot(B.r, v) / Z, c.cy + c.F * dot(B.d, v) / Z, Z]; }
  // plane coords (a, b) -> homogeneous screen coords: H = K*[R*eu, R*ev, R*(O - C)]; the third row's w is camera depth Z
  function planeH(c, B, O, eu, ev) {
    const col = v => [dot(B.r, v), dot(B.d, v), dot(B.f, v)];
    const K = v => [c.F * v[0] + c.cx * v[2], c.F * v[1] + c.cy * v[2], v[2]];
    const u = K(col(eu)), v = K(col(ev)), o = K(col(sub(O, c.pos)));
    return [u[0], v[0], o[0], u[1], v[1], o[1], u[2], v[2], o[2]];
  }
  function rotV(pitch = 0, yaw = 0, roll = 0) {     // R = Ry(-yaw)*Rx(-pitch)*Rz(roll)
    const a = -pitch * RAD, b = -yaw * RAD, c = roll * RAD;
    return v => {
      let x = Math.cos(c) * v[0] - Math.sin(c) * v[1], y = Math.sin(c) * v[0] + Math.cos(c) * v[1], z = v[2];
      const y2 = Math.cos(a) * y - Math.sin(a) * z, z2 = Math.sin(a) * y + Math.cos(a) * z; y = y2; z = z2;
      const x3 = Math.cos(b) * x + Math.sin(b) * z, z3 = -Math.sin(b) * x + Math.cos(b) * z;
      return [x3, y, z3];
    };
  }
  // surface: origin + two in-plane axes (eu = text right, ev = text down) + world <-> plane coords (a, b)
  const SURF = {
    floor: s => ({ O: p => [p.x ?? 0, s.y, p.z ?? 0], eu: [1, 0, 0], ev: [0, 0, -1], ab: p => [p.x, -p.z] }),
    ceiling: s => ({ O: p => [p.x ?? 0, s.y, p.z ?? 0], eu: [1, 0, 0], ev: [0, 0, 1], ab: p => [p.x, p.z] }),
    back: s => ({ O: p => [p.x ?? 0, p.y ?? 0, s.z], eu: [1, 0, 0], ev: [0, 1, 0], ab: p => [p.x, p.y] }),
    left: s => ({ O: p => [s.x, p.y ?? 0, p.z ?? 0], eu: [0, 0, 1], ev: [0, 1, 0], ab: p => [p.z, p.y] }),
    right: s => ({ O: p => [s.x, p.y ?? 0, p.z ?? 0], eu: [0, 0, -1], ev: [0, 1, 0], ab: p => [-p.z, p.y] }),
  };

  // ---------- keyframes ----------
  function normKeys(keys, def) {
    let prev = def.slice();
    return keys.map(k => { const v = prev.slice(); let e = null;
      k.slice(1).forEach((x, i) => { if (typeof x === 'number') { if (i < v.length) v[i] = x; } else if (x != null) e = x; });
      prev = v; return { t: k[0], v, e }; });
  }
  function kfAt(t, K) {
    if (t <= K[0].t) return K[0].v;
    for (let i = 1; i < K.length; i++) if (t < K[i].t) { const a = K[i - 1], b = K[i], k = ez(b.e || 'easeInOut')(cl((t - a.t) / Math.max(1e-6, b.t - a.t))); return a.v.map((x, j) => lerp(x, b.v[j], k)); }
    return K[K.length - 1].v;
  }
  const camVec = c => [...(c.pos || CAM0.pos), c.yaw ?? 0, c.pitch ?? 0, c.roll ?? 0, c.F ?? CAM0.F, c.cx ?? CAM0.cx, c.cy ?? CAM0.cy];
  const vecCam = v => ({ pos: [v[0], v[1], v[2]], yaw: v[3], pitch: v[4], roll: v[5], F: v[6], cx: v[7], cy: v[8] });

  // ---------- GL: perspective mapping + DOF (shared XM.gl renderer) ----------
  const VS = `precision highp float;
in vec3 position;
void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const FS = `precision highp float;
uniform sampler2D tex; uniform vec2 tsz; uniform vec4 lim;
uniform mat3 H0; uniform mat3 H1; uniform mat3 H2; uniform vec3 tw;
uniform vec3 hrow; uniform float zk;
uniform vec3 foc; uniform float ap; uniform vec4 scr; uniform float maxc;
uniform float alpha; uniform float bias; uniform vec3 fog; uniform vec2 res;
out vec4 outColor;
const int NT = 24;
vec4 tapH(mat3 M, vec2 q, float ex){
  vec3 u = M * vec3(q, 1.0);
  if (u.z <= 1e-6) return vec4(0.0);
  vec2 uv = u.xy / u.z;
  vec2 dx = vec2(M[0][0] - uv.x * M[0][2], M[0][1] - uv.y * M[0][2]) / u.z;
  vec2 dy = vec2(M[1][0] - uv.x * M[1][2], M[1][1] - uv.y * M[1][2]) / u.z;
  float lod = log2(max(max(length(dx), length(dy)), 1e-6)) + bias + ex;
  float ins = step(lim.x, uv.x) * step(lim.y, uv.y) * step(uv.x, lim.z) * step(uv.y, lim.w);
  return textureLod(tex, uv / tsz, max(lod, 0.0)) * ins;
}
vec4 all3(vec2 q, float ex){
  vec4 c = tw.x * tapH(H0, q, ex);
  if (tw.y > 0.0) c += tw.y * tapH(H1, q, ex);
  if (tw.z > 0.0) c += tw.z * tapH(H2, q, ex);
  return c;
}
void main(){
  vec2 q = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec3 u0 = H0 * vec3(q, 1.0);
  float Z = 1e4, coc = maxc;
  if (u0.z > 1e-6) {
    vec2 uv0 = u0.xy / u0.z;
    Z = max(zk * dot(hrow, vec3(uv0, 1.0)), 1e-4);
    coc = ap * abs(1.0 - foc.z / Z);
    if (scr.z > 0.0) coc += scr.z * pow(clamp((length(q - foc.xy) - scr.x) / max(scr.y - scr.x, 1.0), 0.0, 1.0), scr.w);
    coc = min(coc, maxc);
  }
  vec4 acc = vec4(0.0);
  if (coc < 0.6) {
    acc = 0.25 * (all3(q + vec2(-0.25, -0.25), 0.0) + all3(q + vec2(0.25, -0.25), 0.0) + all3(q + vec2(-0.25, 0.25), 0.0) + all3(q + vec2(0.25, 0.25), 0.0));
  } else {
    float ex = log2(max(1.0, 0.36 * coc));
    for (int i = 0; i < NT; i++) {
      float r = sqrt((float(i) + 0.5) / float(NT)) * coc, a = float(i) * 2.39996323;
      acc += all3(q + r * vec2(cos(a), sin(a)), ex);
    }
    acc /= float(NT);
  }
  float fk = 1.0 - fog.z * smoothstep(fog.x, fog.y, Z);
  outColor = acc * alpha * fk;
}`;
  const TEX = new Map();
  function texOf(cv, repeat) {
    let T = TEX.get(cv);
    if (!T) {
      T = new THREE.CanvasTexture(cv); T.flipY = false; T.premultiplyAlpha = true; T.colorSpace = THREE.NoColorSpace;
      T.generateMipmaps = true; T.minFilter = THREE.LinearMipmapLinearFilter; T.magFilter = THREE.LinearFilter; T.anisotropy = 1;
      T.wrapS = T.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      TEX.set(cv, T);
    }
    return T;
  }
  const m3 = m => new THREE.Matrix3().set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
  function glLayer() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
    const U = { tex: { value: null }, tsz: { value: new THREE.Vector2(1, 1) }, lim: { value: new THREE.Vector4(0, 0, 1, 1) },
      H0: { value: new THREE.Matrix3() }, H1: { value: new THREE.Matrix3() }, H2: { value: new THREE.Matrix3() }, tw: { value: new THREE.Vector3(1, 0, 0) },
      hrow: { value: new THREE.Vector3(0, 0, 1) }, zk: { value: 1 }, foc: { value: new THREE.Vector3(W / 2, H / 2, 1) }, ap: { value: 0 },
      scr: { value: new THREE.Vector4(0, 1, 0, 1) }, maxc: { value: 0 }, alpha: { value: 1 }, bias: { value: -.5 }, fog: { value: new THREE.Vector3(1e9, 2e9, 0) },
      res: { value: new THREE.Vector2(W, H) } };
    const mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: FS, uniforms: U, transparent: true,
      premultipliedAlpha: true, blending: THREE.NormalBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
    mesh.U = U;
    mesh.box = (x0, y0, x1, y1) => {
      const a = geo.attributes.position.array, X = x => x / W * 2 - 1, Y = y => 1 - y / H * 2;
      a.set([X(x0), Y(y0), 0, X(x1), Y(y0), 0, X(x1), Y(y1), 0, X(x0), Y(y1), 0]); geo.attributes.position.needsUpdate = true;
    };
    return mesh;
  }

  // ---------- text textures ----------
  const TPL = new Map();
  function textMetrics(w) {
    const c = XM.canvas('xm-tilt-measure', 8, 8), q = c.g;
    q.font = `${w.weight} ${w.Ft}px ${w.font}`; q.letterSpacing = (w.track * w.Ft).toFixed(2) + 'px';
    const adv = q.measureText(w.text).width - w.track * w.Ft; q.letterSpacing = '0px';
    return adv * w.squeeze;
  }
  function drawTpl(q, w, P, mk) {
    const { Ft, pad, aw } = w;
    q.clearRect(0, 0, w.TW, w.TH);
    const x0 = pad - .07 * Ft, x1 = pad + aw + .07 * Ft, y0 = pad - .05 * Ft, y1 = pad + 1.07 * Ft;
    if (mk > 0) { q.fillStyle = P.mark; q.fillRect(x0, y0, (x1 - x0) * mk, y1 - y0); }
    const paint = col => {
      q.save(); q.translate(pad, pad + ASC * Ft); q.scale(w.squeeze, w.stretchTpl || 1);
      q.font = `${w.weight} ${Ft}px ${w.font}`; q.letterSpacing = (w.track * Ft).toFixed(2) + 'px'; q.textBaseline = 'alphabetic'; q.textAlign = 'left';
      q.fillStyle = col; q.fillText(w.text, 0, 0); q.letterSpacing = '0px'; q.restore();
    };
    const col = w.fill === 'grad' && XM.tex ? XM.tex.grad(q, w.col, pad, pad + Ft, w.gradK ?? .35) : w.col;
    paint(col);
    if (mk > 0) { q.save(); q.beginPath(); q.rect(x0, 0, (x1 - x0) * mk, w.TH); q.clip(); paint(DS.INK); q.restore(); }
  }
  function tplCanvas(w, P, mk) {
    if (mk > 0 && mk < 1) {           // highlight sweep in progress: redraw the same dynamic texture every frame
      if (!w.dyn) { w.dyn = document.createElement('canvas'); w.dyn.width = w.TW; w.dyn.height = w.TH; }
      drawTpl(w.dyn.getContext('2d'), w, P, mk); const T = texOf(w.dyn); T.needsUpdate = true; return w.dyn;
    }
    const key = `${w.key}|${mk >= 1 ? 1 : 0}`;
    if (!TPL.has(key)) { const c = document.createElement('canvas'); c.width = w.TW; c.height = w.TH; drawTpl(c.getContext('2d'), w, P, mk >= 1 ? 1 : 0); TPL.set(key, c); }
    return TPL.get(key);
  }
  function gridTile(g, P) {
    const key = `grid|${g.color}|${g.alpha}|${g.width}|${g.step}`;
    if (!TPL.has(key)) {
      const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const q = c.getContext('2d');
      const lw = Math.max(1.5, g.width / g.step * N);
      q.fillStyle = g.color; q.globalAlpha = g.alpha; q.fillRect(0, 0, N, lw); q.fillRect(0, lw, lw, N - lw);
      TPL.set(key, c);
    }
    return TPL.get(key);
  }

  function tiltWords(o = {}) {
    const tone = o.tone || 'paper', P = { ...DS.tone(tone) };
    const colOf = c => (!c || c === 'fg' ? P.fg : c === 'accent' ? P.accent : c === 'mute' ? P.mute : c === 'mark' ? P.mark : XK.col(c));
    if (!Array.isArray(o.words) || !o.words.length) err('words (which word groups, when they appear, where they sit) is required, set by the video\'s script; there is no default text');
    if (o.hud == null) err('hud corner text (tl shot number / bl chapter / br what this shot shows) is required; there is no default text');
    const space = {}; for (const [k, s] of Object.entries(o.space || {})) { if (!SURF[k]) { err(`space must be floor / back / left / right / ceiling, got ${k}`); continue; } space[k] = { ...s, S: SURF[k](s) }; }
    const camK = Array.isArray(o.cam) ? normKeys(o.cam.map(k => [k[0], ...camVec(k[1] || {}), k[2]]), camVec(o.cam[0][1] || {})) : null;
    const camFix = !camK ? vecCam(camVec(o.cam || {})) : null;
    const camAt = t => (camK ? vecCam(kfAt(t, camK)) : camFix);
    const zoomK = o.zoom ? normKeys(o.zoom, [1]) : null, ZC = o.zc || [W / 2, H / 2];
    const zoomAt = t => (zoomK ? kfAt(t, zoomK)[0] : 1);
    const dof = o.dof === false ? null : { ap: 0, max: 10, shift: FEEL.shift, ...(o.dof || {}) };
    const fog = o.fog ? { near: o.fog.near, far: o.fog.far, amt: o.fog.amt ?? 1 } : null;
    const sfxMode = o.sfx === undefined ? 'first' : o.sfx;

    // ---------- per group: normalise options + texture ----------
    const words = (o.words || []).map((w0, i) => {
      const w = { ...w0, i };
      if (!w.text) err(`words[${i}] has no text`);
      if (typeof w.at !== 'number') err(`words[${i}] "${w.text}" has no at (when this group is spoken)`);
      w.mode = w.quad ? 'quad' : w.on ? 'surf' : w.pos || w.screen ? 'free' : null;
      if (!w.mode) err(`words[${i}] "${w.text}" needs a placement: one of quad / on / pos / screen`);
      if (w.on && !space[w.on]) err(`words[${i}] "${w.text}" sits on ${w.on}, but space has no such surface`);
      if (w.mode !== 'quad' && !(w.size > 0)) err(`words[${i}] "${w.text}" needs size (em height in world px)`);
      w.font = w.font || 'SerifSC'; if (!FAMS.includes(w.font)) warn(`words[${i}] font ${w.font} is not among the fonts registered by the template`);
      w.weight = w.weight ?? 900; w.squeeze = w.squeeze ?? 1; w.track = w.track ?? 0; w.stretch = w.stretch ?? 1;
      w.col = colOf(w.color); w.anchor = w.anchor || [.5, .5]; w.depth = w.depth ?? 1;
      const E = typeof w.enter === 'string' ? { kind: w.enter } : { kind: 'slide', ...(w.enter || {}) };
      E.kind = E.kind || 'slide';
      E.dur = E.dur ?? (E.kind === 'light' ? FEEL.lightDur : FEEL.dur); E.fade = E.fade ?? (E.kind === 'light' ? FEEL.lightDur : E.kind === 'cut' ? 1 / fps() : FEEL.fade);
      E.ease = E.ease ?? FEEL.ease; E.fadeEase = E.fadeEase ?? (E.kind === 'light' ? 'easeOut' : FEEL.fadeEase); E.dist = E.dist ?? FEEL.dist;
      E.trail = E.trail === false ? null : E.kind === 'slide' ? (Array.isArray(E.trail) ? E.trail : FEEL.trail) : null;
      w.E = E; w.ghost = w.ghost ?? (E.kind === 'light' ? FEEL.ghost : 0);
      w.mark = w.mark ? { dur: .45, ...w.mark } : null;
      XM.note(w.font, w.text);
      return w;
    });
    // focus centre (slide moves outward from here by default): subject centre, or frame centre without a subject
    const subj = o.subject || null;
    const S = subj ? { ...subj } : null;
    if (S && !S.src && !S.draw) err('subject needs src (a cut-out transparent PNG) or draw(g, t, P, api)');
    const SI = S && S.src ? XM.image(S.src) : null;
    const sKeys = S && S.keys ? normKeys(S.keys, [1, 0, 0, 0]) : null;

    // plane -> texture texel homography at time t (without zoom / slide)
    function baseH(w, t, cam, B) {
      const { pad, aw, Ft } = w;
      if (w.mode === 'quad') return w.Hq;
      let O, eu, ev;
      if (w.mode === 'surf') { const s = space[w.on].S; O = s.O(w); eu = s.eu; ev = s.ev; }
      else {
        const R = rotV(...(w.rot || [0, 0, 0])); eu = R([1, 0, 0]); ev = R([0, 1, 0]);
        if (w.pos) O = w.pos;
        else { const c0 = camAt(w.at), B0 = basis(c0), Z = (w.depth ?? 1) * c0.F, X = (w.screen[0] - c0.cx) * Z / c0.F, Y = (w.screen[1] - c0.cy) * Z / c0.F;
          O = add(c0.pos, add(add(scl(B0.r, X), scl(B0.d, Y)), scl(B0.f, Z))); }
      }
      if (w.mode === 'surf' && w.roll) { const a = w.roll * RAD, c = Math.cos(a), s = Math.sin(a); const u2 = add(scl(eu, c), scl(ev, s)), v2 = add(scl(eu, -s), scl(ev, c)); eu = u2; ev = v2; }
      // in-plane slide (rise / enter.plane)
      const pl = w.planeOff ? w.planeOff(t) : null;
      if (pl) O = add(O, add(scl(eu, pl[0]), scl(ev, pl[1])));
      const k = w.size / Ft, ks = k * w.stretch, ax = w.anchor[0] * aw, ay = w.anchor[1] * Ft;
      const A = [k, 0, -(pad + ax) * k, 0, ks, -(pad + ay) * ks, 0, 0, 1];
      return mm(planeH(cam, B, O, eu, ev), A);
    }
    function prep(w) {     // texture size: font size = settled on-screen em height x 1.25 (mip handles smaller, no blur when larger)
      w.Ft = 200; w.pad = 0; w.aw = textMetrics(w);
      let em;
      if (w.mode === 'quad') { const q = w.quad; em = (Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) + Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1])) / 2; }
      else { const t = w.at + 1, c = camAt(t), B = basis(c); w.pad = 0; w.TW = 1; w.TH = 1;
        const Hb = baseH(w, t, c, B), a = apH(Hb, w.aw / 2, 0), b = apH(Hb, w.aw / 2, w.Ft); em = a[2] > 0 && b[2] > 0 ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 200; }
      let Ft = Math.round(cl(em * 1.25, 140, 440));
      const per = w.aw / 200; if (per * Ft + Ft > 4000) Ft = Math.floor(4000 / (per + 1));
      w.Ft = Ft; w.aw = textMetrics(w); w.pad = Math.ceil(.3 * Ft);
      w.TW = Math.ceil(w.aw + 2 * w.pad); w.TH = Math.ceil(Ft + 2 * w.pad);
      w.key = `${w.text}|${w.font}|${w.weight}|${Ft}|${w.col}|${w.squeeze}|${w.track}|${w.fill || ''}`;
      if (w.mode === 'quad') {
        const { pad, aw } = w;
        w.Hq = homography([[pad, pad], [pad + aw, pad], [pad + aw, pad + Ft], [pad, pad + Ft]], w.quad);
      }
    }
    let prepped = false;
    const fontsOK = () => !document.fonts || document.fonts.status === 'loaded';
    function ensurePrep() {
      if (prepped || !fontsOK()) return prepped;
      for (const w of words) prep(w);
      // entry direction: slide defaults to dist px (screen) outward from the focus centre
      const C0 = S ? subjCenter(S.at ?? 0) : [W / 2, H / 2];
      for (const w of words) {
        const E = w.E;
        if (E.kind === 'slide' && !E.from && !E.plane) {
          const c = wordCenter(w, w.at + E.dur + .1), d = [c[0] - C0[0], c[1] - C0[1]], n = Math.hypot(d[0], d[1]) || 1;
          E.from = [d[0] / n * E.dist, d[1] / n * E.dist];
        }
        if (E.kind === 'rise' && !E.plane) E.plane = [0, (w.size || 100) * .6];
        if (E.plane) w.planeOff = t => { const R = 1 - ez(E.ease)(cl((t - w.at) / E.dur)); return [E.plane[0] * R, E.plane[1] * R]; };
      }
      // readable? (settled; em box vertical edge x .82 ~ glyph ink height)
      for (const w of words) {
        if (w.ambient) continue;
        const t = w.at + Math.max(w.E.dur, w.E.fade) + .05, G = geomAt(w, t, false);
        let mn = Infinity;
        for (let i = 0; i <= 6; i++) { const s = w.pad + w.aw * i / 6, a = apH(G.Hd, s, w.pad), b = apH(G.Hd, s, w.pad + w.Ft); if (a[2] > 0 && b[2] > 0) mn = Math.min(mn, Math.hypot(a[0] - b[0], a[1] - b[1]) * .82); }
        w.minInk = mn;
        if (mn < 56) warn(`"${w.text}" is only about ${mn.toFixed(0)} px tall at its smallest after perspective (< 56, unreadable in a portrait window): increase size / tilt less, or mark it ambient:true as background text`);
      }
      prepped = true; return true;
    }
    // full geometry at time t: Hd (texture texel -> screen, incl. zoom + slide), centre, depth
    function slideOff(w, t) {
      const E = w.E; if (E.kind !== 'slide' || !E.from) return [0, 0];
      const R = 1 - ez(E.ease)(cl((t - w.at) / E.dur));
      return [E.from[0] * R, E.from[1] * R];
    }
    function geomAt(w, t, withSlide = true) {
      const c = camAt(t), B = basis(c), z = zoomAt(t);
      let Hd = mm(Sm(z, ZC[0], ZC[1]), baseH(w, t, c, B));
      if (withSlide) { const d = slideOff(w, t); if (d[0] || d[1]) Hd = mm(Tm(d[0], d[1]), Hd); }
      const ce = apH(Hd, w.pad + w.aw / 2, w.pad + w.Ft / 2);
      const zk = w.mode === 'quad' ? w.depth / ce[2] : 1 / c.F;
      return { Hd, cx: ce[0], cy: ce[1], z: zk * ce[2], zk, F: c.F };
    }
    function wordCenter(w, t) { const G = geomAt(w, t, false); return [G.cx, G.cy]; }
    function wordAlpha(w, t) {
      const E = w.E; let a;
      if (t < w.at) a = w.ghost;
      else a = lerp(w.ghost, 1, ez(E.fadeEase)(cl((t - w.at) / E.fade)));
      if (w.out != null && t > w.out) a *= 1 - EASES.easeIn(cl((t - w.out) / FEEL.out));
      return a;
    }

    // ---------- subject ----------
    function subjBase() {
      if (!S) return null;
      if (S.box) return S.box.slice();
      const ok = SI && SI.ok, iw = ok ? SI.img.naturalWidth : 1, ih = ok ? SI.img.naturalHeight : 1;
      const h = S.h ?? (ok ? ih / (S.scale || 1) : 400), w = S.w ?? h * iw / ih;
      return [(S.x ?? W / 2) - w / 2, (S.y ?? H / 2) - h / 2, w, h];
    }
    // subject transform this frame: returns { box (base box), m (DOMMatrix: base box -> screen), z (relative depth), sc }
    function subjXf(t) {
      if (!S) return null;
      const z = zoomAt(t), m = new DOMMatrix();
      m.translateSelf(ZC[0], ZC[1]).scaleSelf(z, z).translateSelf(-ZC[0], -ZC[1]);
      if (S.pos3) {
        const c = camAt(t), B = basis(c), p = project(c, B, S.pos3), ok = SI && SI.ok;
        const h = (S.h3 ?? 600) * c.F / p[2], w = ok ? h * SI.img.naturalWidth / SI.img.naturalHeight : h;
        return { box: [p[0] - w / 2, p[1] - h, w, h], m, z: p[2] / c.F, ground: [p[0], p[1]] };
      }
      const box = subjBase();
      if (sKeys) {
        const [s, rot, dx, dy] = kfAt(t, sKeys), pv = S.pivot || [box[0] + box[2] / 2, box[1] + box[3] / 2];
        m.translateSelf(dx, dy).translateSelf(pv[0], pv[1]).rotateSelf(rot).scaleSelf(s, s).translateSelf(-pv[0], -pv[1]);
      }
      return { box, m, z: 1, ground: [box[0] + box[2] / 2, box[1] + box[3]] };
    }
    function subjCenter(t) { const X = subjXf(t); if (!X) return [W / 2, H / 2]; const p = X.m.transformPoint(new DOMPoint(X.box[0] + X.box[2] / 2, X.box[1] + X.box[3] / 2)); return [p.x, p.y]; }
    const subjAlpha = t => !S ? 0 : (S.at != null ? EASES.easeOut(cl((t - S.at) / .3)) : 1) * (S.out != null ? 1 - EASES.easeIn(cl((t - S.out) / .3)) : 1) * (S.alpha ?? 1);

    // ---------- focus ----------
    const focusable = words.filter(w => w.focus !== false && !w.ambient).sort((a, b) => a.at - b.at);
    function targetState(tg, t) {
      if (tg === 'subject') { const c = subjCenter(t), X = subjXf(t); return [c[0], c[1], X ? X.z : 1]; }
      if (typeof tg === 'number') { const G = geomAt(words[tg], t); return [G.cx, G.cy, G.z]; }
      if (tg && typeof tg === 'object') return [tg.x ?? W / 2, tg.y ?? H / 2, tg.z ?? 1];
      return [W / 2, H / 2, 1];
    }
    function focusAt(t) {
      let ev;
      if (Array.isArray(o.focus)) ev = o.focus.map(([tt, tg]) => ({ t: tt, tg }));
      else ev = focusable.map(w => ({ t: w.at, tg: w.i }));
      if (!ev.length) return [W / 2, H / 2, 1];
      let i = -1; for (let j = 0; j < ev.length; j++) if (ev[j].t <= t) i = j;
      if (i < 0) return targetState(ev[0].tg, t);
      const cur = targetState(ev[i].tg, t);
      if (i === 0 || !dof) return cur;
      const k = EASES.smoother(cl((t - ev[i].t) / dof.shift));
      if (k >= 1) return cur;
      const prev = targetState(ev[i - 1].tg, t);
      return [lerp(prev[0], cur[0], k), lerp(prev[1], cur[1], k), 1 / lerp(1 / prev[2], 1 / cur[2], k)];
    }
    function cocAt(x, y, z, F) {
      if (!dof) return 0;
      const f = focusAt(lastT); let c = (dof.ap || 0) * Math.abs(1 - f[2] / z);
      if (dof.screen) { const s = dof.screen; c += (s.max || 0) * Math.pow(cl((Math.hypot(x - f[0], y - f[1]) - (s.r0 ?? 0)) / Math.max(1, (s.r1 ?? 1000) - (s.r0 ?? 0))), s.pow ?? 1.5); }
      return Math.min(c, dof.max);
    }

    // ---------- subject shadow: fades where it is close to the words ----------
    const AV = { w: W >> 3, h: H >> 3 };
    function avoidMask(t, near, R) {
      const L = XM.canvas('xm-tilt-avoid', AV.w, AV.h), q = L.g, img = q.createImageData(AV.w, AV.h), d = img.data;
      const polys = [];
      for (const w of words) { if (wordAlpha(w, t) < .25) continue; const G = geomAt(w, t), p = [[w.pad, w.pad], [w.pad + w.aw, w.pad], [w.pad + w.aw, w.pad + w.Ft], [w.pad, w.pad + w.Ft]].map(([s, u]) => apH(G.Hd, s, u));
        if (p.every(v => v[2] > 0)) polys.push(p.map(v => [v[0] / 8, v[1] / 8])); }
      const r8 = R / 8;
      for (let y = 0; y < AV.h; y++) for (let x = 0; x < AV.w; x++) {
        let dmin = Infinity; const px = x + .5, py = y + .5;
        for (const p of polys) {
          let inside = true, sgn = 0, dd = Infinity;
          for (let k = 0; k < 4; k++) { const a = p[k], b = p[(k + 1) % 4], ex = b[0] - a[0], ey = b[1] - a[1], cr = ex * (py - a[1]) - ey * (px - a[0]);
            if (sgn === 0) sgn = Math.sign(cr); else if (Math.sign(cr) !== sgn && cr !== 0) inside = false;
            const u = cl(((px - a[0]) * ex + (py - a[1]) * ey) / (ex * ex + ey * ey)); dd = Math.min(dd, Math.hypot(a[0] + u * ex - px, a[1] + u * ey - py)); }
          dmin = Math.min(dmin, inside ? 0 : dd);
        }
        const v = near + (1 - near) * smooth(cl(dmin / r8));
        d[(y * AV.w + x) * 4 + 3] = Math.round(255 * v);
      }
      q.putImageData(img, 0, 0);
      return L.c;
    }
    function drawShadow(g, t, X, img, a0) {
      const sh = S.shadow; if (!sh) return;
      const kind = sh.kind || (S.pos3 ? 'ground' : 'drop');
      const L = XM.canvas('xm-tilt-shadow'), q = L.g;
      const [bx, by, bw, bh] = X.box;
      q.save(); q.setTransform(X.m);
      if (kind === 'drop') {
        q.filter = `brightness(0) blur(${(sh.blur ?? 9).toFixed(1)}px)`;
        q.drawImage(img, bx + (sh.dx ?? -7), by + (sh.dy ?? 6), bw, bh);
      } else {
        const gx = X.ground[0], gy = X.ground[1];
        q.filter = `brightness(0) blur(${(sh.blur ?? Math.max(6, bw * .03)).toFixed(1)}px)`;
        q.translate(gx, gy); q.transform(1, 0, sh.shear ?? -.6, sh.sy ?? .16, 0, 0); q.translate(-gx, -gy);
        q.drawImage(img, bx, by, bw, bh);
        q.setTransform(X.m); q.filter = `blur(${(bw * .025).toFixed(1)}px)`; q.fillStyle = 'rgba(0,0,0,.85)';       // contact shadow: a flat ellipse underneath
        q.beginPath(); q.ellipse(gx, gy - bh * .004, bw * .42, Math.max(3, bw * .035), 0, 0, Math.PI * 2); q.fill();
      }
      q.restore();
      q.save(); q.globalCompositeOperation = 'destination-in'; q.imageSmoothingQuality = 'high'; q.drawImage(avoidMask(t, sh.near ?? .4, sh.reach ?? 70), 0, 0, W, H); q.restore();
      g.save(); g.globalAlpha *= (sh.a ?? (kind === 'drop' ? .22 : .5)) * a0; g.drawImage(L.c, 0, 0); g.restore();
    }
    function drawSubject(g, t) {
      if (!S) return;
      const a0 = subjAlpha(t); if (a0 <= .001) return;
      const X = subjXf(t);
      if (S.draw) { g.save(); g.globalAlpha *= a0; S.draw(g, t, P, api, X); g.restore(); return; }
      if (!SI || !SI.ok) return;
      drawShadow(g, t, X, SI.img, a0);
      const [bx, by, bw, bh] = X.box;
      let blur = S.blur ?? 0;
      if (S.pos3 && dof) { const c = subjCenter(t); blur += cocAt(c[0], c[1], X.z) * .5; }
      g.save(); g.setTransform(g.getTransform().multiply(X.m)); g.globalAlpha *= a0;
      if (blur > .15) g.filter = `blur(${blur.toFixed(2)}px)`;
      g.imageSmoothingQuality = 'high'; g.drawImage(SI.img, bx, by, bw, bh); g.restore();
    }

    // ---------- surfaces (grid) and words: one GL pass ----------
    const meshes = new Map();
    const scene = new THREE.Scene(), ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const meshOf = key => { if (!meshes.has(key)) meshes.set(key, glLayer()); return meshes.get(key); };
    let lastT = 0;
    function setDof(U, F) {
      const f = focusAt(lastT);
      U.foc.value.set(f[0], f[1], f[2]);
      if (dof) { U.ap.value = dof.ap || 0; const s = dof.screen; U.scr.value.set(s ? s.r0 ?? 0 : 0, s ? s.r1 ?? 1000 : 1, s ? s.max || 0 : 0, s ? s.pow ?? 1.5 : 1); U.maxc.value = dof.max; }
      else { U.ap.value = 0; U.scr.value.set(0, 1, 0, 1); U.maxc.value = 0; }
      if (fog && F) U.fog.value.set(fog.near / F, fog.far / F, fog.amt); else U.fog.value.set(1e9, 2e9, 0);
    }
    function drawGL(g, t) {
      scene.clear(); let n = 0;
      const c = camAt(t), B = basis(c), z = zoomAt(t), Zs = Sm(z, ZC[0], ZC[1]);
      // grid on surfaces (whole-screen inverse mapping: pixels above the horizon / behind the camera come out empty)
      for (const [k, s] of Object.entries(space)) {
        const gr = s.grid; if (!gr) continue;
        const G = { step: 300, width: 5, color: P.fg, alpha: .12, ...gr }; G.color = colOf(G.color);
        const tile = gridTile(G, P), N = 256, kt = G.step / N;
        const O = s.S.O({}), Hp = mm(Zs, mm(planeH(c, B, O, s.S.eu, s.S.ev), [kt, 0, 0, 0, kt, 0, 0, 0, 1]));
        const ex = s.extent || {}, rng2 = (a, d) => a || [-d, d];
        const xs = rng2(ex.x, 1e6), ys = rng2(ex.y, 1e6), zs = rng2(ex.z, 1e6);
        const corners = [[xs[0], ys[0], zs[0]], [xs[1], ys[1], zs[1]]].map(([x, y, zz]) => s.S.ab({ x, y, z: zz }).map(v => v / kt));
        const M = meshOf('surf:' + k), U = M.U;
        U.tex.value = texOf(tile, true); U.tsz.value.set(N, N);
        U.lim.value.set(Math.min(corners[0][0], corners[1][0]), Math.min(corners[0][1], corners[1][1]), Math.max(corners[0][0], corners[1][0]), Math.max(corners[0][1], corners[1][1]));
        const Hi = inv3(Hp); U.H0.value = m3(Hi); U.tw.value.set(1, 0, 0); U.hrow.value.set(Hp[6], Hp[7], Hp[8]); U.zk.value = 1 / c.F;
        U.alpha.value = gr.alphaAt ? gr.alphaAt(t) : 1; U.bias.value = 0; setDof(U, c.F);
        M.box(0, 0, W, H); M.renderOrder = n++; scene.add(M);
      }
      for (const w of words) {
        const a = wordAlpha(w, t); if (a <= .002) continue;
        const G = geomAt(w, t), U = (meshOf('w:' + w.i)).U, M = meshOf('w:' + w.i);
        const mk = w.mark ? ez('easeInOut')(cl((t - w.mark.at) / w.mark.dur)) : 0;
        const cv = tplCanvas(w, P, mk);
        U.tex.value = texOf(cv); U.tsz.value.set(w.TW, w.TH); U.lim.value.set(0, 0, w.TW, w.TH);
        U.H0.value = m3(inv3(G.Hd));
        // slide trails: positions 0.5 and 1 frame ago (frame-blend look); none once settled
        const tr = w.E.trail, d0 = slideOff(w, t), d1 = slideOff(w, t - 1 / fps());
        const moving = tr && Math.hypot(d0[0] - d1[0], d0[1] - d1[1]) > .3;
        let Hs = [G.Hd];
        if (moving) { Hs = tr.map(([fr]) => (fr ? geomAt(w, t - fr / fps()).Hd : G.Hd)); U.H1.value = m3(inv3(Hs[1])); U.H2.value = m3(inv3(Hs[2])); U.tw.value.set(tr[0][1], tr[1][1], tr[2][1]); }
        else U.tw.value.set(1, 0, 0);
        U.hrow.value.set(G.Hd[6], G.Hd[7], G.Hd[8]); U.zk.value = G.zk; U.alpha.value = a; U.bias.value = -.5;
        setDof(U, w.mode === 'quad' ? 0 : G.F);
        // draw only the area around the word (when all four corners are in front of the camera), plus margin for DOF and trails
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ok = true;
        for (const Hm of Hs) for (const [s, u] of [[0, 0], [w.TW, 0], [w.TW, w.TH], [0, w.TH]]) { const p = apH(Hm, s, u); if (p[2] <= 0) ok = false; x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
        const m = (dof ? dof.max : 0) + 4;
        if (ok) M.box(cl(x0 - m, 0, W), cl(y0 - m, 0, H), cl(x1 + m, 0, W), cl(y1 + m, 0, H)); else M.box(0, 0, W, H);
        M.renderOrder = n++; scene.add(M);
      }
      if (n) XM.drawGL(g, scene, ocam);
    }

    // ---------- sound ----------
    const cues = [];
    if (sfxMode !== false) {
      const byAt = words.filter(w => w.sfx !== false).slice().sort((a, b) => a.at - b.at);
      byAt.forEach((w, j) => {
        const name = typeof w.sfx === 'string' ? w.sfx : j === 0 ? SFX.appear : sfxMode === 'each' ? SFX.tag : null;
        if (name) cues.push({ t: +w.at.toFixed(3), name, gain: j === 0 ? .5 : .4 });
      });
      for (const w of words) if (w.mark) cues.push({ t: +w.mark.at.toFixed(3), name: SFX.sweep, gain: .6 });
    }

    const api = {
      P, cam: camAt, zoom: zoomAt, focus: t => { lastT = t; return focusAt(t); },
      project: (p, t) => { const c = camAt(t), B = basis(c), z = zoomAt(t), q = project(c, B, p); return [ZC[0] + (q[0] - ZC[0]) * z, ZC[1] + (q[1] - ZC[1]) * z, q[2]]; },
      wordQuad: (i, t) => { const w = words[i]; if (!ensurePrep()) return null; const G = geomAt(w, t); return [[w.pad, w.pad], [w.pad + w.aw, w.pad], [w.pad + w.aw, w.pad + w.Ft], [w.pad, w.pad + w.Ft]].map(([s, u]) => apH(G.Hd, s, u).slice(0, 2)); },
      wordAlpha: (i, t) => wordAlpha(words[i], t),
      subjectBox: t => { const X = subjXf(t); return X && X.box; }, words,
      math: { homography, inv3, apply: apH },
    };

    const shot = XM.shot({ bg: P.bg, stage: 'flat', cam: o.camKf }, () => (g, t) => {
      lastT = t;
      DS.stage(g, P);
      if (o.under) { g.save(); o.under(g, t, P, api); g.restore(); }
      if (ensurePrep()) drawGL(g, t);
      drawSubject(g, t);
      if (o.draw) { g.save(); o.draw(g, t, P, api); g.restore(); }
      if (o.hud !== false) DS.hud(g, t, P, o.hud || {});
    });
    shot.cues = cues;
    shot.api = api;
    return shot;
  }
  tiltWords.math = { homography, inv3, apply: apH };
  XM.tiltWords = tiltWords;
})();
