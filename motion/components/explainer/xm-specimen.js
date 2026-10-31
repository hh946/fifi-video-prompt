// XM.specimen / XM.specimenGrid: object specimen cards (prism / bolt / planet / mind). A huge scrolling repeated-word
// wall in the background, a 3D object, a spec sheet (typed line by line, with a leader line), a name plate, a barcode,
// viewfinder corners and a sparkle; whip transitions between cards; finally a 2x2 grid of live cards that swap places.
// Docs: docs/components/specimen.md
//
// ───────────────────────────────── XM.specimen(o) ─────────────────────────────────
// One object specimen card. Use it to introduce a product / four properties of a concept / specs: the object is the
// "cover", and the spec sheet types out line by line with the voiceover.
//   at      : number      time the card content enters (absolute s, usually the shot's t0). Before it only background + wall.
//   obj     : 'prism'|'bolt'|'planet'|'mind'   the object. prism = transparency / clarity / seeing through (real glass
//             refracting the word wall, orange-cyan dispersion fringes); bolt = speed / energy / compute;
//             planet = scale / ecosystem / world; mind = model / reasoning / neural network. Default 'prism'.
//   word    : string      word for the background wall (English in Unbounded 900, Chinese automatically in Source Han Sans
//             900), default label.en or 'SPEC'.
//   wordSize: number      wall font size, default 400 English / 380 Chinese. rows: ['o','f','o'] per row filled f /
//             outline o (default ['o','f','o']).
//   speed   : number      wall scroll speed in px/s (default 110, adjacent rows move in opposite directions).
//   label   : { zh, en }  name plate bottom-left (zh >= 120 px).
//   index   : '01/04'     OBJ.01 / 04 at the top-left (HUD decoration). kicker: small Chinese text top-left (default: Chinese for "spec file").
//   title   : string      small spec sheet header (default 'SPEC / ' + label.en).
//   spec    : [[k, v], ...] or [{ k, v, at }] (3-4 rows recommended). v can be: a string; a function t => string (live
//             reading); { from, to, dec, pre, suf, dur } a counter (starts rolling when the row appears). k is 56 px, v is
//             64 px; both are text meant to be read.
//   steps   : [{ at, row:i }]  row i appears at at (default: one row every 0.28 s from at+0.5)
//             [{ at, hi:i }]   highlight row i (inverted block sweeps in from the left; hi:-1 clears) - light up the
//                              parameter being talked about
//             [{ at, kick:90 }] extra 90 deg turn of the object (0.7 s expoOut) - a "flip" when the topic changes
//             [{ at, ring:true }] a thin ring expands around the object (emphasis)
//   spin    : number      object spin in deg/s (default prism 5 / bolt 1 = sway amplitude / planet 8 / mind 22).
//   zebra   : 0..1        strength of the black marble veins on the bolt (default 0.9). refl: prism reflection /
//             highlight strength (default 1).
//   bg      : card background (XK colour name or #hex, default 'accent'). ink: word wall colour (default auto: light
//             background -> dark, dark background -> accent, accent background -> light).
//   fg      : HUD / spec sheet text colour (default: whichever contrasts most with bg). plate: name plate colour (auto).
//   pos     : [x, y]      object centre (default [720, 540]). size: object scale (default 1).
//   code    : string      small text under the barcode (default 'SPEC-' + index).
//   hud     : { tl, bl, br } | false   tiny corner HUD text (XM.FX.hud).
//   whip    : { in:true, out:seconds, dir:'h'|'v' }  whip between cards: in = RGB dispersion on the first two frames +
//             1.05 -> 1 settle; out = 0.1 s before this time the wall accelerates and whips out with motion blur (set the
//             next card's t0 to out, tin:'cut'). Off by default.
//   cam     : XK camera keyframes (as in other shots).
//   Returns { L, update } for XK.seq.
//
// ───────────────────────────────── XM.specimenGrid(o) ─────────────────────────────────
// 2x2 live cards (all objects spinning) that swap positions over time. Use for "four things side by side / four-point
// summary / four-way comparison".
//   at      : first card's entry time; the four cards unfold top to bottom 0.12 s apart (each card's own entry plays too).
//   cards   : [specimen options x4] (as above, without at; name plates are scaled 1.4x in the grid to stay readable).
//   swaps   : [t, ...]   swap positions at each time (0.45 s expoInOut; moving cards scale up slightly and sit on top).
//   layouts : [[card in slot 0, slot 1, slot 2, slot 3], ...]  arrangement after each swap (default [1,0,3,2] ->
//             [3,2,1,0] -> [2,3,0,1] -> [0,1,2,3], cycling).
//   focus   : [{ at, i }]   talking about card i: the other three dim, this one gets an outline; i:-1 clears.
//   gap     : grid gap (default 22 px, dark background shows in it). bg: gap colour (default the darkest theme colour).
//
// Rules: text is flat solid colour; dispersion only on the glass and on the two whip frames. three.js uses XM.drawGL's
//   shared renderer; the environment map is a procedural studio (no HDR file).
// Performance: a single card and the 2x2 grid both stay under 0.2 s per frame (including capture; the grid is four GL
//   renders + four offscreen cards).
(() => {
  const { W, H } = XM;
  const d2r = Math.PI / 180;

  // ---------------- colours ----------------
  function rgbOf(c) {
    c = XK.col(c) || '#000';
    if (c[0] === '#') { let h = c.slice(1); if (h.length === 3) h = [...h].map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
    const m = c.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
  }
  function lum(c) { const [r, g, b] = rgbOf(c).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; }
  function hex(c) { const [r, g, b] = rgbOf(c); return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
  function scheme(o) {                     // resolved when the shot is built (XK.tone only applies at build time)
    const a = hex('text'), b = hex('bg'), LIGHT = lum(a) > lum(b) ? a : b, DARK = lum(a) > lum(b) ? b : a;
    const bg = hex(o.bg || 'accent'), L = lum(bg);
    const light = L > .35, dark = L < .03;
    const fg = o.fg ? hex(o.fg) : (light ? DARK : LIGHT);
    const ink = o.ink ? hex(o.ink) : light ? DARK : dark ? hex('accent') : LIGHT;
    const plate = o.plate ? hex(o.plate) : dark ? LIGHT : DARK;
    const plateFg = lum(plate) > .35 ? DARK : LIGHT;
    return { bg, fg, ink, plate, plateFg, LIGHT, DARK, light };
  }

  // ---------------- three.js shared resources (created on first use) ----------------
  let G3 = null;
  const FOV = 30, DIST = (H / 2) / Math.tan(FOV / 2 * d2r);
  // Procedural studio (equirectangular): u=.75 is behind the camera (faces pointing at the camera reflect this). Bright top, dark bottom, soft pink / mint / blue blobs on the sides, a few white light strips.
  function envCanvas() {
    const w = 1024, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const el = e => h / 2 - e / 90 * h / 2;
    const gr = x.createLinearGradient(0, 0, 0, h);
    for (const [e, cc] of [[90, '#ffffff'], [45, '#f4f2ff'], [22, '#dcd8fa'], [10, '#9690de'], [3, '#3d3f98'], [-8, '#1c1e5c'], [-25, '#0e1032'], [-90, '#090a1c']]) gr.addColorStop((90 - e) / 180, cc);
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    const blob = (u, e, rx, ry, cc, a) => { x.save(); x.translate(u * w, el(e)); x.scale(rx, ry); const g2 = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      g2.addColorStop(0, `rgba(${cc},${a})`); g2.addColorStop(1, `rgba(${cc},0)`); x.fillStyle = g2; x.beginPath(); x.arc(0, 0, 1, 0, 6.3); x.fill(); x.restore(); };
    // large softbox behind the camera (upper half), darkening toward its lower edge
    const pg = x.createLinearGradient(0, el(40), 0, el(-12)); pg.addColorStop(0, 'rgba(255,255,255,1)'); pg.addColorStop(.62, 'rgba(255,255,255,.95)'); pg.addColorStop(.78, 'rgba(170,160,240,.7)'); pg.addColorStop(1, 'rgba(30,30,90,0)');
    x.fillStyle = pg; x.fillRect(.69 * w, el(40), .12 * w, el(-12) - el(40));
    blob(.60, -4, 70, 46, '110,235,190', .85);      // mint
    blob(.90, -12, 80, 50, '60,90,255', .9);        // blue
    blob(.38, 4, 70, 50, '245,140,235', .7);        // pink
    blob(.47, -14, 50, 40, '255,220,150', .85);     // warm
    x.fillStyle = 'rgba(255,255,255,.96)';
    for (const [u, e, ww, len] of [[.42, 12, 10, 200], [.25, 30, 8, 120], [.95, 20, 9, 160], [.56, 26, 7, 90]]) x.fillRect(u * w - ww / 2, el(e) - len / 2, ww, len);
    return c;
  }
  const NOISE = `
float h3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fb3(vec3 p){ float s = 0.0, a = .5; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.02; a *= .5; } return s; }
vec3 film(float t){ return .72 + .26 * cos(6.2832 * (t + vec3(0.0, .33, .67))); }
`;
  const ENV_GLSL = `
uniform sampler2D uEnv;
vec3 film(float t){ return .72 + .26 * cos(6.2832 * (t + vec3(0.0, .33, .67))); }
vec3 envAt(vec3 d){ d = normalize(d); vec2 uv = vec2(atan(d.z, d.x) * .1591549 + .5, asin(clamp(d.y, -1.0, 1.0)) * .3183099 + .5); return texture2D(uEnv, uv).rgb; }
`;
  // rounded cube (inline RoundedBoxGeometry): subdivided cube, each vertex pushed onto "inner box + sphere of radius r"; analytic normals, smooth edges
  function roundedBox(s, r, m = 10) {
    const N = 2 * m + 1, geo = new THREE.BoxGeometry(1, 1, 1, N, N, N), p = geo.getAttribute('position'), nrm = geo.getAttribute('normal');
    const h = s / 2, k = h - r;
    const remap = u => {                                 // uniform grid [-.5,.5] -> m segments on each side fall in the rounded band, 1 flat segment in the middle
      const i = Math.round((u + .5) * N);
      if (i <= m) { const f = i / m; return -h + r * (1 - Math.cos(f * Math.PI / 2)); }
      const f = (i - m - 1) / m; return k + r * Math.sin(f * Math.PI / 2);
    };
    const v = new THREE.Vector3(), q = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(remap(p.getX(i)), remap(p.getY(i)), remap(p.getZ(i)));
      q.set(Math.max(-k, Math.min(k, v.x)), Math.max(-k, Math.min(k, v.y)), Math.max(-k, Math.min(k, v.z)));
      n.copy(v).sub(q); if (n.lengthSq() < 1e-6) n.fromBufferAttribute(nrm, i); n.normalize();
      v.copy(q).addScaledVector(n, r);
      p.setXYZ(i, v.x, v.y, v.z); nrm.setXYZ(i, n.x, n.y, n.z);
    }
    return geo;
  }
  function init3() {
    if (G3) return G3;
    const R = XM.gl();
    const cam = new THREE.PerspectiveCamera(FOV, W / H, 10, 20000); cam.position.set(0, 0, DIST); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const ec = envCanvas();
    const envRaw = new THREE.CanvasTexture(ec); envRaw.colorSpace = THREE.NoColorSpace; envRaw.wrapS = THREE.RepeatWrapping;
    const envSrgb = new THREE.CanvasTexture(ec); envSrgb.colorSpace = THREE.SRGBColorSpace; envSrgb.mapping = THREE.EquirectangularReflectionMapping;
    const ENV = new THREE.PMREMGenerator(R).fromEquirectangular(envSrgb).texture;

    // ---- prism: custom transmission shader. Each fragment traces the refracted ray through a "thickness" with three IORs (orange / mid / cyan) and samples the word wall back on screen
    //      -> each face shows a sharp, uniformly shifted piece of text (readable); orange-cyan fringes at face junctions and rounded edges; plus Fresnel studio reflection + thin-film iridescence.
    const bdTex = new THREE.CanvasTexture(document.createElement('canvas')); bdTex.colorSpace = THREE.NoColorSpace;
    bdTex.minFilter = THREE.LinearFilter; bdTex.generateMipmaps = false;
    const pMat = new THREE.ShaderMaterial({
      uniforms: { uBd: { value: bdTex }, uEnv: { value: envRaw }, uVP: { value: VP }, uInv: { value: new THREE.Matrix4() }, uIor: { value: 1.5 }, uDisp: { value: .045 },
        uThick: { value: 520 }, uRefl: { value: 1 }, uHalf: { value: 235 }, uRad: { value: 30 }, uEdge: { value: new THREE.Color(.42, .86, .78) } },
      vertexShader: `varying vec3 vWP; varying vec3 vWN; varying vec3 vLN;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vLN = normal; vWN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: ENV_GLSL + `uniform sampler2D uBd; uniform mat4 uVP; uniform mat4 uInv; uniform float uIor, uDisp, uThick, uRefl, uHalf, uRad; uniform vec3 uEdge;
        varying vec3 vWP; varying vec3 vWN; varying vec3 vLN;
        vec3 bd(vec3 P, vec3 V, vec3 N, float ior){ vec3 d = refract(-V, N, 1.0 / ior); vec4 c = uVP * vec4(P + d * uThick, 1.0); return texture2D(uBd, c.xy / c.w * .5 + .5).rgb; }
        float mid3(vec3 a){ return a.x + a.y + a.z - max(a.x, max(a.y, a.z)) - min(a.x, min(a.y, a.z)); }
        void main(){
          vec3 N = normalize(vWN), V = normalize(cameraPosition - vWP);
          if (dot(N, V) < 0.0) N = -N;
          // transmission: three IORs -> orange / mid / cyan weighted (energy-conserving, no dispersion on flat areas, colour fringes at boundaries)
          vec3 cL = bd(vWP, V, N, uIor - uDisp), cM = bd(vWP, V, N, uIor), cH = bd(vWP, V, N, uIor + uDisp);
          vec3 tr = cL * vec3(.62, .30, .02) + cM * vec3(.38, .40, .36) + cH * vec3(.0, .30, .62);
          tr = mix(tr, vec3(.9, .9, .97), .10);                                  // a touch of milky white in the glass body
          // back edges seen through the glass: the refracted ray reaches an exit point; near the junction of two faces -> a thin cyan line
          vec3 lp = (uInv * vec4(vWP, 1.0)).xyz, ld = normalize(mat3(uInv) * refract(-V, N, 1.0 / uIor));
          vec3 tq = (sign(ld) * uHalf - lp) / ld; float te = min(tq.x, min(tq.y, tq.z));
          vec3 pe = abs(lp + ld * te) / uHalf;
          float sm = mid3(pe), w0 = 1.0 - uRad / uHalf;
          float edgeIn = smoothstep(w0 + .03, w0 + .045, sm) * (1.0 - smoothstep(w0 + .075, w0 + .095, sm));
          tr = mix(tr, tr * .4 + uEdge * .62, edgeIn * .7);
          // reflection: Fresnel + thin-film iridescence
          float c = clamp(dot(N, V), 0.0, 1.0), F = .045 + .955 * pow(1.0 - c, 5.0);
          vec3 R = reflect(-V, N), env = envAt(R);
          vec3 refl = env * mix(vec3(1.0), film(c * 1.7 + .15) * 1.25, .55);
          float k = clamp(F * 1.8 * uRefl + .05, 0.0, 1.0);
          vec3 col = mix(tr, refl, k);
          // rounded edges: where the local normal deviates from the face normal -> bright edge (studio light + white)
          vec3 an = abs(normalize(vLN)); float bev = smoothstep(.015, .16, 1.0 - max(an.x, max(an.y, an.z)));
          col = mix(col, mix(vec3(.86, .97, .95), env * 1.05 + .08, .45), bev * .62);   // edges: clean bright edge (cyan-white), so distant black text does not smear into a black band
          col += pow(max(env.r + env.g + env.b - 2.6, 0.0), 2.0) * .7 * uRefl;
          gl_FragColor = vec4(col, 1.0);
        }` });
    const pScene = new THREE.Scene(), cube = new THREE.Mesh(roundedBox(470, 30, 10), pMat); pScene.add(cube);

    // ---- bolt: extruded lightning bolt; front / back faces are flowing pink / white / black zebra liquid marble (shader), sides and bevels iridescent chrome
    const BP = [[1015, 45], [735, 635], [935, 590], [905, 1025], [1190, 405], [985, 455]].map(([x, y]) => new THREE.Vector2(x - 962, -(y - 540)));
    const bGeo = new THREE.ExtrudeGeometry(new THREE.Shape(BP), { depth: 46, bevelEnabled: true, bevelThickness: 16, bevelSize: 15, bevelSegments: 3, curveSegments: 4 });
    bGeo.translate(0, 0, -23);
    const capMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uEnv: { value: envRaw }, uZebra: { value: .9 } },
      vertexShader: `varying vec2 vP; varying vec3 vWN; varying vec3 vWP;
        void main(){ vP = position.xy; vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vWN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: ENV_GLSL + `uniform float uT, uZebra; varying vec2 vP; varying vec3 vWN; varying vec3 vWP;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1,0)), f.x), mix(h2(i + vec2(0,1)), h2(i + vec2(1,1)), f.x), f.y); }
        float fb(vec2 p){ float s = 0.0, a = .5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s; }
        void main(){
          vec2 p = vP / 230.0;
          vec2 q = vec2(fb(p + vec2(0.0, uT * .16)), fb(p + vec2(5.2, 1.3) - uT * .11));
          vec2 r = vec2(fb(p + 3.0 * q + vec2(1.7, 9.2) + uT * .13), fb(p + 3.0 * q + vec2(8.3, 2.8)));
          float s = fract(fb(p + 2.6 * r) * 4.2);
          vec3 Wt = vec3(1.0, .985, 1.0), PP = vec3(.98, .87, .97), PK = vec3(.94, .64, .91), MG = vec3(.82, .40, .80), BK = vec3(.05, .03, .08);
          vec3 c = mix(Wt, PP, smoothstep(.08, .32, s));
          c = mix(c, PK, smoothstep(.32, .48, s)); c = mix(c, MG, smoothstep(.48, .57, s));
          c = mix(c, BK, uZebra * smoothstep(.57, .6, s) * (1.0 - smoothstep(.64, .67, s)));
          c = mix(c, PK, smoothstep(.64, .70, s)); c = mix(c, PP, smoothstep(.70, .82, s)); c = mix(c, Wt, smoothstep(.82, .95, s));
          vec3 N = normalize(vWN), V = normalize(cameraPosition - vWP); if (dot(N, V) < 0.0) N = -N;
          float F = .04 + .96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
          c = mix(c, envAt(reflect(-V, N)), .07 + .5 * F);
          gl_FragColor = vec4(c, 1.0);
        }` });
    const sideMat = new THREE.MeshPhysicalMaterial({ color: 0xeceaff, metalness: 1, roughness: .07, envMap: ENV, envMapIntensity: 1.15, iridescence: .55, iridescenceIOR: 1.5, iridescenceThicknessRange: [180, 560] });
    const bolt = new THREE.Group(); bolt.add(new THREE.Mesh(bGeo, [capMat, sideMat]));
    const bScene = new THREE.Scene(); bScene.add(bolt);

    // ---- planet: thin-film soap-bubble sphere (iridescent land + Fresnel rim) + pearl ring (sphere writes depth first to hide the back of the ring)
    const sMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, uniforms: { uRot: { value: new THREE.Matrix3() } },
      vertexShader: `varying vec3 vO; varying vec3 vN; varying vec3 vV;
        void main(){ vO = normalize(position); vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: NOISE + `varying vec3 vO; varying vec3 vN; varying vec3 vV; uniform mat3 uRot;
        void main(){
          vec3 p = uRot * vO;
          float n = fb3(p * 1.9 + vec3(3.1, 1.2, 7.7));
          float land = smoothstep(.50, .515, n), band = fract(n * 9.0);
          vec3 N = gl_FrontFacing ? vN : -vN;
          float fr = pow(1.0 - abs(dot(N, vV)), 2.2);
          vec3 col = film(band * .9 + n * 1.5);
          col = mix(col, vec3(.95, .93, 1.0), smoothstep(.62, .75, n) * .25);
          float a = land * (.82 - .1 * band);
          vec3 rim = film(fr * 1.4 + .2);
          vec3 c = mix(vec3(.75, .8, 1.0), col, land);
          float alpha = max(a, .07 + .55 * fr);
          c = mix(c, rim, (1.0 - land) * fr);
          if (!gl_FrontFacing) { alpha *= .55; c *= .55; }
          vec3 L1 = normalize(vec3(-.42, .38, .82)), L2 = normalize(vec3(.32, -.12, .94));
          float s1 = smoothstep(.9975, .9992, dot(N, L1)), s2 = smoothstep(.9985, .9995, dot(N, L2));
          if (gl_FrontFacing) { c = mix(c, vec3(1.0), max(s1, s2)); alpha = max(alpha, max(s1, s2)); }
          gl_FragColor = vec4(c, alpha);
        }` });
    const rMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: NOISE + `varying vec2 vP;
        void main(){
          float r = length(vP), t = (r - 385.0) / 255.0, ang = atan(vP.y, vP.x);
          float b = n3(vec3(r * .09, 1.3, 2.1)) * .7 + n3(vec3(r * .025, 4.0, 1.0)) * .5;
          float alpha = smoothstep(.0, .04, t) * smoothstep(1.0, .9, t) * (.25 + .75 * smoothstep(.35, .75, b));
          vec3 c = film(t * 2.3 + b * .8 + ang * .05);
          c = mix(c, vec3(.88, .87, .93), .55 + .12 * sin(r * .6));
          float seam = smoothstep(.06, .0, abs(fract(r * .045) - .5) - .44); c *= 1.0 - .55 * seam;
          gl_FragColor = vec4(c, min(1.0, alpha * 1.05));
        }` });
    const planet = new THREE.Group();
    const sph = new THREE.Mesh(new THREE.SphereGeometry(365, 128, 64), sMat); sph.renderOrder = 3;
    const occ = new THREE.Mesh(new THREE.SphereGeometry(362, 64, 32), new THREE.MeshBasicMaterial({ colorWrite: false })); occ.renderOrder = 1;
    const ring = new THREE.Mesh(new THREE.RingGeometry(385, 640, 256, 1), rMat); ring.renderOrder = 2;
    const rg = new THREE.Group(); rg.add(ring);
    planet.add(sph, occ, rg);
    const plScene = new THREE.Scene(); plScene.add(planet);

    // ---- mind: white thick-tube icosahedron + thin geodesic lines + colourful faceted core
    const wMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: .5, metalness: 0, emissive: 0x8f8c86, envMap: ENV, envMapIntensity: .7 });
    function edges(geo, tube, node, group) {
      const pos = geo.getAttribute('position'), seen = new Set(), verts = new Map();
      const key = v => `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`;
      for (let i = 0; i < pos.count; i += 3) {
        const tri = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(pos, i + k));
        for (const v of tri) verts.set(key(v), v);
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
          const ka = key(tri[a]), kb = key(tri[b]), kk = ka < kb ? ka + '|' + kb : kb + '|' + ka; if (seen.has(kk)) continue; seen.add(kk);
          const A = tri[a], B = tri[b], c = new THREE.Mesh(new THREE.CylinderGeometry(tube, tube, A.distanceTo(B), 10, 1), wMat);
          c.position.copy(A).add(B).multiplyScalar(.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); group.add(c);
        }
      }
      if (node) for (const v of verts.values()) { const s = new THREE.Mesh(new THREE.SphereGeometry(node, 16, 12), wMat); s.position.copy(v); group.add(s); }
    }
    const outer = new THREE.Group(), inner = new THREE.Group(), core = new THREE.Group();
    edges(new THREE.IcosahedronGeometry(440, 0), 8, 15, outer);
    edges(new THREE.IcosahedronGeometry(305, 1), 2.2, 0, inner);
    const cg = new THREE.IcosahedronGeometry(235, 0).toNonIndexed(), cols = [];
    const pal = [[.95, .95, 1], [.98, .72, .9], [.62, .9, .92], [.99, .9, .62], [.8, .7, .98], [.7, .95, .78], [.99, .78, .66], [.66, .78, .99]], rr = XM.rng(404);
    for (let i = 0; i < cg.getAttribute('position').count; i += 3) { const p = pal[Math.floor(rr() * pal.length)], s = .86 + .14 * rr(); for (let k = 0; k < 3; k++) { const d = s * (.94 + .06 * k); cols.push(p[0] * d, p[1] * d, p[2] * d); } }
    cg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    core.add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .96, toneMapped: false })));
    const mind = new THREE.Group(); mind.add(outer, inner, core);
    const mScene = new THREE.Scene(); mScene.add(mind);

    G3 = { R, cam, bdTex, pMat, cube, pScene, bolt, capMat, bScene, planet, sMat, rg, plScene, mind, outer, inner, core, mScene };
    return G3;
  }

  // place the object and render it into g (g already has background + word wall; the prism uses g's canvas as its refraction background)
  const SPIN = { prism: 5, bolt: 1, planet: 8, mind: 22 };
  const SCALE = { prism: 1, bolt: .74, planet: .7, mind: .8 };
  function renderObj(g, C, t, tile) {
    const S3 = init3(), o = C.o, a = t - C.at;
    if (a < 0) return;
    const obj = C.obj, sp = o.spin ?? SPIN[obj];
    let kick = 0; for (const s of C.steps) if (s.kick && t >= s.at) kick += s.kick * XM.expoOut((t - s.at) / .7);
    const ent = XM.expoOut(Math.min(1, a / .55));
    const sc = (o.size || 1) * SCALE[obj] * (tile ? .92 : 1);
    const [px, py] = C.pos, X = px - W / 2, Y = -(py - H / 2);
    let scene;
    if (obj === 'prism') {
      const m = S3.cube; m.position.set(X, Y, 0); m.scale.setScalar(sc * (.8 + .2 * ent));
      m.rotation.set(.615 + .04 * Math.sin(a * .7), (44 + sp * a + kick) * d2r - (1 - ent) * 1.1, .1, 'XYZ');
      m.updateMatrixWorld(true); S3.pMat.uniforms.uInv.value.copy(m.matrixWorld).invert();
      S3.pMat.uniforms.uRefl.value = o.refl ?? 1;
      if (S3.bdTex.image !== g.canvas) S3.bdTex.image = g.canvas;
      S3.bdTex.needsUpdate = true; scene = S3.pScene;
    } else if (obj === 'bolt') {
      const m = S3.bolt; m.position.set(X, Y, 0); m.scale.setScalar(sc * (.85 + .15 * ent));
      const swing = Math.sin(a * .9) * .22 * sp;
      m.rotation.set(.1, -.38 + swing + (1 - ent) * Math.PI * 2 + kick * d2r, .06);
      S3.capMat.uniforms.uT.value = t; S3.capMat.uniforms.uZebra.value = o.zebra ?? .9;
      scene = S3.bScene;
    } else if (obj === 'planet') {
      const m = S3.planet; m.position.set(X, Y, 0); m.scale.setScalar(sc * (.82 + .18 * ent));
      const yaw = (.4 + (sp * a + kick) * d2r);
      S3.sMat.uniforms.uRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(.35)));
      S3.rg.rotation.set(-1.08, 0, -.42 - a * .02 - (1 - ent) * .5, 'ZXY');
      scene = S3.plScene;
    } else {
      const m = S3.mind; m.position.set(X, Y, 0); m.scale.setScalar(sc * (1 + .35 * (1 - ent)));
      const k = (sp * a + kick) * d2r;
      S3.outer.rotation.set(.35 + k * .3, .4 + k, .1);
      S3.inner.rotation.set(-.2 - k * .4, -k * 1.3, .3);
      S3.core.rotation.set(.5 + k * .8, .2 + k * 1.6, k * .5);
      scene = S3.mScene;
    }
    XM.drawGL(g, scene, S3.cam, { tone: false });
  }

  // ---------------- one card (drawn into a 1920x1080 offscreen canvas) ----------------
  let UID = 0;
  function makeCard(o, at) {
    const C = { o, at, obj: o.obj || 'prism', id: ++UID, sc: scheme(o) };
    C.pos = o.pos || [720, 540];
    C.label = o.label || { zh: '', en: '' };
    C.word = o.word || C.label.en || 'SPEC';
    C.zhWord = /[⺀-鿿]/.test(C.word);
    C.idx = o.index || '01/04';
    const [i1, i2] = C.idx.split('/');
    C.idxA = (i1 || '01').trim(); C.idxB = (i2 || '04').trim();
    C.title = o.title || ('SPEC / ' + (C.label.en || C.obj.toUpperCase()));
    C.code = o.code || `SPEC-${C.idxA}${C.idxB}-${String(C.id * 37 % 1000).padStart(3, '0')}`;
    C.steps = (o.steps || []).slice().sort((a, b) => a.at - b.at);
    C.rows = (o.spec || []).map((r, i) => Array.isArray(r) ? { k: r[0], v: r[1] } : { ...r });
    C.rows.forEach((r, i) => { const st = C.steps.find(s => s.row === i); r.at = r.at ?? (st ? st.at : at + .5 + i * .28); });
    return C;
  }
  function rowVal(r, t) {
    const v = r.v;
    if (typeof v === 'function') return String(v(t));
    if (v && typeof v === 'object') { const k = XM.expoOut(prog(t, r.at + .1, r.at + .1 + (v.dur ?? .9))); return XK.fmtNum(lerp(v.from ?? 0, v.to, k), { dec: v.dec ?? 0, pre: v.pre, suf: v.suf, sep: v.sep }); }
    return String(v ?? '');
  }
  // spec sheet size (measure text)
  const KS = 56, VS = 64, RH = 100, HD = 58, PAD = 30;
  function specGeom(g, C) {
    if (C.geom) return C.geom;
    let kw = 0, vw = 0;
    for (const r of C.rows) {
      kw = Math.max(kw, XM.measure(g, r.k, { fam: 'zh', size: KS, w: 500 }));
      const sample = typeof r.v === 'function' ? r.v(1e3) : r.v && typeof r.v === 'object' ? XK.fmtNum(r.v.to, { dec: r.v.dec ?? 0, pre: r.v.pre, suf: r.v.suf }) : String(r.v);
      vw = Math.max(vw, XM.measure(g, sample, { fam: 'grot', size: VS, w: 800 }));
    }
    const w = Math.max(560, Math.min(820, kw + vw + 70 + PAD * 2)), x1 = 1740, x0 = x1 - w, y0 = 250;
    return (C.geom = { x0, x1, y0, w });
  }
  function drawCard(g, C, t, tile) {
    const { bg, fg, ink, plate, plateFg } = C.sc, o = C.o, a = t - C.at;
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // word wall
    const size = o.wordSize || (C.zhWord ? 380 : 400), gap = size * (C.zhWord ? .98 : .86), rowsM = o.rows || ['o', 'f', 'o'];
    let tt = t; if (C.whipOut != null) { const k = prog(t, C.whipOut - .12, C.whipOut); tt += k * k * .9; }
    XM.FX.wordRows(g, tt * 1 + C.id * 1.7, { word: C.word, size, y0: H / 2 + size * (C.zhWord ? .36 : .36) - gap, gap, rows: 3, speed: o.speed ?? 110,
      solid: rowsM.map(r => r === 'f'), color: ink, sw: Math.max(3, size * .012), sep: C.zhWord ? '　' : '  ' });
    // 3D object
    renderObj(g, C, t, tile);
    if (a < 0) return;
    const [ox, oy] = C.pos;
    // entry ring + ring from steps
    const rings = [C.at + .05, ...C.steps.filter(s => s.ring).map(s => s.at)];
    for (const r0 of rings) { const k = prog(t, r0, r0 + .7); if (k <= 0 || k >= 1) continue;
      g.save(); g.globalAlpha = (1 - k) * .9; g.strokeStyle = fg; g.lineWidth = 2; g.beginPath(); g.arc(ox, oy, 300 + 280 * XM.expoOut(k), 0, 6.3); g.stroke(); g.restore(); }
    // viewfinder corners
    const kb = XM.expoOut(prog(a, 0, .45)), e = 46 * (1 - kb), bw = 400, bh = 386, L = 58;
    g.save(); g.globalAlpha = kb; g.strokeStyle = fg; g.lineWidth = 3; g.beginPath();
    for (const [x, y, sx, sy] of [[ox - bw - e, oy - bh - e, 1, 1], [ox + bw + e, oy - bh - e, -1, 1], [ox - bw - e, oy + bh + e, 1, -1], [ox + bw + e, oy + bh + e, -1, -1]]) { g.moveTo(x + sx * L, y); g.lineTo(x, y); g.lineTo(x, y + sy * L); }
    g.stroke(); g.lineWidth = 2; g.beginPath(); g.moveTo(ox, oy - bh - 18); g.lineTo(ox, oy - bh + 10); g.moveTo(ox, oy + bh - 10); g.lineTo(ox, oy + bh + 18); g.stroke();
    XM.FX.star4(g, ox + bw - 6, oy - bh + 8, 22, fg, .12, 0); XM.FX.star4(g, ox - bw + 12, oy + bh - 12, 8, fg, .12, 0);
    XM.FX.star4(g, 1640, 820, 12, fg, .12, 0);
    g.restore();
    // top-left: OBJ.01 / 04 + small Chinese kicker + file number (HUD decoration)
    if (!tile) { g.fillStyle = bg; g.fillRect(118, 112, 430, 96); g.fillRect(1430, 120, 330, 80); }
    const hy = tile ? 150 : 150, n = Math.floor(clamp((a + .05) * 40, 0, 99));
    const s1 = `OBJ.${C.idxA}`; XM.txt(g, s1.slice(0, n), 132, hy, { fam: 'mono', size: 26, w: 700, col: fg, ls: 2.2 });
    if (n > s1.length) XM.txt(g, ('/ ' + C.idxB).slice(0, n - s1.length), 132 + XM.measure(g, s1 + ' ', { fam: 'mono', size: 26, w: 700, ls: 2.2 }) + 6, hy, { fam: 'mono', size: 26, w: 500, col: fg, ls: 2.2 });
    const kick = o.kicker || 'SPEC SHEET';
    XM.txt(g, kick, 132, hy + 38, { fam: 'zh', size: 24, w: 800, col: fg });
    const sub = '· SPECIMEN ARCHIVE'; XM.txt(g, sub.slice(0, Math.floor(clamp((a + .02) * 50, 0, 99))), 132 + XM.measure(g, kick, { fam: 'zh', size: 24, w: 800 }) + 12, hy + 37, { fam: 'mono', size: 15, w: 500, col: fg, ls: 2.4 });
    if (!tile) {
      XM.txt(g, 'SPECIMEN SHEET — REV.7', 1745, 147, { fam: 'mono', size: 15, w: 500, col: fg, align: 'right', ls: 2.4 });
      XM.txt(g, `T+${Math.max(0, a).toFixed(3)}S`, 1745, 181, { fam: 'mono', size: 24, w: 700, col: fg, align: 'right', ls: 2.2 });
    }
    // name plate (bottom-left): big Chinese text (condensed .82) + English + small text
    if (C.label.zh || C.label.en) {
      const kl = XM.expoOut(prog(a, .08, .5)), ps = tile ? 1.4 : 1;
      const zhS = 120, zhW = C.label.zh ? XM.measure(g, C.label.zh, { fam: 'zh', size: zhS, w: 500 }) * .82 : 0;
      const enS = 60, enW = C.label.en ? XM.measure(g, C.label.en, { fam: 'unb', size: enS, w: 500, ls: -1.2 }) : 0;
      const gx = C.label.zh ? 34 : 0, w = 36 + zhW + gx + Math.max(enW, 190) + 40, h = 160;
      g.save(); g.translate(130, tile ? 960 : 958); g.scale(ps, ps); g.translate(0, -h);
      g.beginPath(); g.rect(0, 0, w * kl, h); g.clip();
      g.fillStyle = plate; g.fillRect(0, 0, w, h);
      if (C.label.zh) { g.save(); g.translate(36, 126); g.scale(.82, 1); XM.txt(g, C.label.zh, 0, 0, { fam: 'zh', size: zhS, w: 500, col: plateFg }); g.restore(); }
      const ex = 36 + zhW + gx;
      XM.txt(g, `FIG.${C.idxA} / ${C.obj.toUpperCase()}`, ex, 46, { fam: 'mono', size: 15, w: 700, col: plateFg, ls: 1.6 });
      if (C.label.en) XM.txt(g, C.label.en, ex, 124, { fam: 'unb', size: enS, w: 500, col: plateFg, ls: -1.2 });
      g.restore();
    }
    // spec sheet (top-right)
    if (C.rows.length) {
      const G = specGeom(g, C), { x0, x1, y0, w } = G, k = XM.expoOut(prog(a, .15, .5));
      // sheet height follows the rows shown so far (at least one), no big empty box
      let nr = 1; C.rows.forEach((r, i) => { if (i > 0) nr += XM.expoOut(prog(t, r.at - .05, r.at + .2)); });
      const h = HD + 18 + RH * nr + 6;
      if (k > 0) {
        g.save();
        g.fillStyle = bg; g.fillRect(x0, y0, w, h * k);
        g.strokeStyle = fg; g.lineWidth = 2; g.strokeRect(x0 + 1, y0 + 1, w - 2, h * k - 2);
        g.fillStyle = fg; g.fillRect(x0, y0, w, HD);
        const nh = Math.floor(clamp((a - .15) * 45, 0, C.title.length));
        XM.txt(g, C.title.slice(0, nh), x0 + PAD, y0 + 37, { fam: 'mono', size: 22, w: 700, col: bg, ls: 2.4 });
        g.fillStyle = bg; g.fillRect(x1 - 92, y0 + 24, 11, 11); g.fillRect(x1 - 72, y0 + 24, 11, 11);
        g.strokeStyle = bg; g.lineWidth = 1.6; g.strokeRect(x1 - 51.2, y0 + 24.8, 9.6, 9.6);
        // highlighted row (inverted block sweeps in from the left; swept text takes the background colour)
        let hi = -1, hiAt = 0; for (const s of C.steps) if (s.hi != null && t >= s.at) { hi = s.hi; hiAt = s.at; }
        g.beginPath(); g.rect(x0, y0, w, h * k); g.clip();
        C.rows.forEach((r, i) => {
          const kk = t - r.at; if (kk < 0) return;
          const ry = y0 + HD + 18 + i * RH, by = ry + 70;
          const ks = [...r.k], nk = Math.min(ks.length, Math.floor(kk / .045) + 1);
          const v = rowVal(r, t), vs = XM.scramble(v, t, r.at + .12, .32, C.id * 13 + i);
          const put = (tc, al) => {
            XM.txt(g, ks.slice(0, nk).join(''), x0 + PAD, by, { fam: 'zh', size: KS, w: 500, col: tc, alpha: al });
            if (vs) XM.txt(g, vs, x1 - PAD, by, { fam: 'grot', size: VS, w: 800, col: tc, align: 'right' });
          };
          put(fg, .82);
          if (i === hi) {
            const kh = XM.expoOut(prog(t, hiAt, hiAt + .3)), fw = (w - 20) * kh;
            g.save(); g.beginPath(); g.rect(x0 + 10, ry + 2, fw, RH - 8); g.clip();
            g.fillStyle = fg; g.fillRect(x0 + 10, ry + 2, fw, RH - 8); put(bg, 1); g.restore();
          }
          if (i < C.rows.length - 1) { g.save(); g.globalAlpha = .5; g.fillStyle = fg; g.fillRect(x0 + PAD, ry + RH - 4, (w - PAD * 2) * XM.expoOut(clamp(kk / .4, 0, 1)), 1.5); g.restore(); }
        });
        g.restore();
        // leader line: header -> bends toward the object
        const lx = x0 - 70, ly = y0 + HD / 2, kl = XM.expoOut(prog(a, .3, .7));
        const ex = lx - (lx - (ox + 250)) * kl, ey = ly + (oy - 170 - ly) * kl;
        g.save(); g.strokeStyle = fg; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, ly); g.lineTo(lx, ly); g.lineTo(ex, ey); g.stroke();
        if (kl > .95) { g.fillStyle = fg; g.beginPath(); g.arc(ex, ey, 6, 0, 6.3); g.fill(); }
        g.restore();
      }
    }
    // barcode (bottom-right)
    if (a > .3) {
      const x = 1400, y = 852;
      XM.FX.barcode(g, x, y, 340, 62, fg, 31 + C.id * 7);
      XM.txt(g, `${C.code}  ×  ${String(Math.floor(a * 30) % 1000).padStart(3, '0')}`, x, y + 92, { fam: 'mono', size: 14, w: 500, col: fg, ls: 1.4 });
    }
    // HUD + vignette
    if (!tile && o.hud !== false) XM.FX.hud(g, t, { color: fg, a: .85, tl: (o.hud && o.hud.tl) || `FIG/${C.idxA} — SPECIMEN`, bl: (o.hud && o.hud.bl) || `${C.idxA} ${C.obj.toUpperCase()}`, br: (o.hud && o.hud.br) || '120 BPM ■□□□' });
    const vg = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * 1.05);
    vg.addColorStop(0, 'rgba(0,0,10,0)'); vg.addColorStop(1, `rgba(0,0,10,${C.sc.light ? .13 : .1})`); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  // ---------------- whip helpers ----------------
  function mblur(g, src, vx, vy, n, s = 1, ox = 0, oy = 0) {
    const T = XM.canvas('xmsp-mb'), tg = T.g; n = Math.min(40, Math.max(n, Math.ceil(Math.hypot(vx, vy) / 12)));
    for (let i = 0; i < n; i++) { tg.globalAlpha = 1 / (i + 1); const f = i / (n - 1) - .5; tg.drawImage(src, W / 2 - W * s / 2 + ox + vx * f, H / 2 - H * s / 2 + oy + vy * f, W * s, H * s); }
    tg.globalAlpha = 1; g.drawImage(T.c, 0, 0);
  }
  function streaks(g, seed, vert, col) {
    const r = XM.rng(seed); g.save(); g.fillStyle = col; g.globalAlpha = .85;
    for (let i = 0; i < 14; i++) { const a = r() * (vert ? W : H), b = r() * (vert ? H : W), l = 40 + r() * 320, th = 1 + r() * 2.5; if (vert) g.fillRect(a, b, th, l); else g.fillRect(b, a, l, th); }
    g.restore();
  }
  function chroma(g, src, dx, s) {
    const T = XM.canvas('xmsp-ch'), tg = T.g;
    g.save(); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
    for (const [c, o] of [['#ff0000', -dx], ['#00ff00', 0], ['#0000ff', dx]]) {
      tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, W, H);
      tg.drawImage(src, W / 2 - W * s / 2 + o, H / 2 - H * s / 2, W * s, H * s);
      tg.globalCompositeOperation = 'multiply'; tg.fillStyle = c; tg.fillRect(0, 0, W, H);
      g.drawImage(T.c, 0, 0);
    }
    g.restore();
  }

  // ---------------- XM.specimen ----------------
  function specimen(o = {}) {
    const at = o.at ?? 0, C = makeCard(o, at), wh = o.whip || null;
    if (wh && wh.out != null) C.whipOut = wh.out;
    return XM.shot({ bg: C.sc.bg, stage: 'flat', cam: o.cam }, S => (g, t) => {
      const Lc = XM.canvas('xmsp-card-' + C.id);
      drawCard(Lc.g, C, t, false);
      const a = t - at;
      if (wh && wh.out != null && t >= wh.out - .1) {                       // whip out
        const k = prog(t, wh.out - .1, wh.out), vert = wh.dir === 'v';
        g.fillStyle = C.sc.bg; g.fillRect(0, 0, W, H);
        if (vert) mblur(g, Lc.c, 0, 120 + 300 * k, 16, 1.04, 0, 70 * k); else mblur(g, Lc.c, 220 + 420 * k, 0, 16, 1.06, -260 * k * k, 0);
        streaks(g, Math.floor(t * 30) * 13 + C.id, vert, C.sc.LIGHT);
        return;
      }
      if (wh && wh.in && a >= 0 && a < .07) { chroma(g, Lc.c, 6, 1.05); return; }
      const s = wh && wh.in ? 1 + .03 * (1 - XM.expoOut(prog(a, .07, .45))) : 1;
      if (s !== 1) g.drawImage(Lc.c, W / 2 - W * s / 2, H / 2 - H * s / 2, W * s, H * s); else g.drawImage(Lc.c, 0, 0);
    });
  }

  // ---------------- XM.specimenGrid ----------------
  const DEF_LAYOUTS = [[1, 0, 3, 2], [3, 2, 1, 0], [2, 3, 0, 1], [0, 1, 2, 3]];
  function specimenGrid(o = {}) {
    const at = o.at ?? 0, gap = o.gap ?? 22, TW = (W - gap) / 2, TH = (H - gap) / 2, ts = TW / W;
    const cards = (o.cards || []).slice(0, 4).map((c, i) => makeCard({ ...c, hud: false }, at + i * .12));
    const SLOT = [[0, 0], [TW + gap, 0], [0, TH + gap], [TW + gap, TH + gap]];
    const swaps = (o.swaps || []).slice().sort((a, b) => a - b), lays = o.layouts || DEF_LAYOUTS;
    const layoutAt = i => i < 0 ? [0, 1, 2, 3] : lays[i % lays.length];
    const focus = (o.focus || []).slice().sort((a, b) => a.at - b.at);
    const sc = scheme({ bg: 'accent' }), gapCol = o.bg ? hex(o.bg) : sc.DARK, DUR = .45;
    return XM.shot({ bg: gapCol, stage: 'flat', cam: o.cam }, S => (g, t) => {
      g.fillStyle = gapCol; g.fillRect(0, 0, W, H);
      let si = -1; for (let i = 0; i < swaps.length; i++) if (t >= swaps[i]) si = i;
      const moving = si >= 0 && t < swaps[si] + DUR, k = moving ? XM.expoInOut(prog(t, swaps[si], swaps[si] + DUR)) : 1;
      const Lfrom = layoutAt(moving ? si - 1 : si), Lto = layoutAt(si);
      let fi = -1, fAt = 0; for (const f of focus) if (t >= f.at) { fi = f.i; fAt = f.at; }
      const kf = fi >= 0 ? XM.expoOut(prog(t, fAt, fAt + .35)) : 0;
      const order = [0, 1, 2, 3].sort((a, b) => {
        const ma = Lfrom.indexOf(a) !== Lto.indexOf(a), mb = Lfrom.indexOf(b) !== Lto.indexOf(b);
        return (ma - mb) || ((a === fi) - (b === fi));
      });
      for (const ci of order) {
        const C = cards[ci]; if (!C) continue;
        const ap = prog(t, C.at, C.at + .4); if (ap <= 0) continue;
        const Lc = XM.canvas('xmsp-tile-' + C.id);
        drawCard(Lc.g, C, t, true);
        const [ax, ay] = SLOT[Lfrom.indexOf(ci)], [bx, by] = SLOT[Lto.indexOf(ci)], mv = moving && (ax !== bx || ay !== by);
        const bump = mv ? 1 + .1 * Math.sin(Math.PI * k) : 1, fs = ci === fi ? 1 + .03 * kf : 1;
        const w = TW * bump * fs, h = TH * bump * fs, cx = lerp(ax, bx, k) + TW / 2, cy = lerp(ay, by, k) + TH / 2;
        const ea = XM.expoOut(ap), hh = h * ea;                                        // entry: unfold top to bottom
        g.save(); g.beginPath(); g.rect(cx - w / 2, cy - h / 2, w, hh); g.clip();
        const ds = ts * bump * fs; g.drawImage(Lc.c, cx - W * ds / 2, cy - H * ds / 2, W * ds, H * ds);
        if (fi >= 0 && ci !== fi) { g.fillStyle = `rgba(0,0,0,${.58 * kf})`; g.fillRect(cx - w / 2, cy - h / 2, w, h); }
        g.restore();
        if (ci === fi && kf > 0) { g.save(); g.strokeStyle = C.sc.fg; g.globalAlpha = kf; g.lineWidth = 6; g.strokeRect(cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6); g.restore(); }
      }
    });
  }

  Object.assign(XM, { specimen, specimenGrid });
})();
