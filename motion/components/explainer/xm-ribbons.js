// XM.ribbons: a wall of wavy text ribbons -> rolls up into a 3D cylinder -> camera dives inside and looks down the axis.
// Eight horizontal ribbons (CJK / Latin / ✦ / micro-labels, one colour scheme per row) scroll in alternating directions with
// wavy edges; rows can swap colours one by one and the gaps turn accent-coloured; the ribbons bend around and close into an
// 8-ring cylinder that spins and tilts, and finally the camera looks down its axis. The flat and cylinder stages are the same
// three.js ribbon meshes (curvature rolls continuously from 0 to closed), so flat -> bend -> cylinder has no seam.
// Uses the shared XM.drawGL renderer; unlit textures. Docs: docs/components/ribbons.md
// Load order: vendor/three.min.js -> lib.js -> xk.js -> xm-core.js -> this file.
//
// ─────────────────────────────────────────────────────────────────────────────
// XM.ribbons(o) -> { L, update }   sequenced by XK.seq
// Good for: slogans / a repeated tagline / a keyword flooding the screen (flat wall only); loops / cycles / ecosystems / flywheels (roll into a cylinder, dive in and land one word).
//
//   at        seconds; ribbons slide in row by row from both sides (0.5 s, top rows first). Before that, only the background.
//   rows      [{ text:'FLYWHEEL ✦ LOOP', scheme:'ink' }, ...]   one ribbon per row (repeated if fewer than count).
//             text    CJK and Latin can mix: CJK uses Noto Sans SC (squeezed to 0.7, weight 500), Latin / digits use Unbounded 900;
//                     '✦' is drawn as a four-point star (not a font glyph). Each unit is followed by two lines of micro-labels + a star, then repeats.
//             scheme  'ink' (paper text on ink, default) | 'paper' (ink on paper) | 'accent' (paper on accent) | 'ink-accent' (accent on ink)
//                     | 'paper-accent' (accent on paper) | 'accent-ink' | 'outline' (hollow text on ink) | 'outline-accent' (hollow on accent) | 'outline-paper'
//             Optional bg / fg (colour name or #hex), outline:true, w (Latin weight, default 900; 400 gives a light row), tag:['R01/08','XM-01'] (two micro-label lines)
//   count     number of rows, default 8. With 6 rows each ribbon is 180 px tall and the text bigger (easier to read); 6-8 recommended.
//   speed     flat-stage scroll speed in px/s, default 90 (even rows move right, odd rows x1.35 to the left). Keep it under 160 for explanatory shots or the text becomes unreadable.
//   wave      ribbon-edge wave amplitude in px, default 30. Flattest in the middle, growing toward top and bottom (like a flag pinned at the centre). 0 = straight.
//   gap       gap between ribbons in px, default 10 (opens and closes 0-gap with position).
//   steps     [{ at, push:260, rows:'all'|'odd'|'even' }]   on a keyword, these rows lurch along their direction (0.55 s expoOut) and the wave swells briefly.
//   swap      { at, push:240, stagger:.05, dur:.3 } or [{ at }, ...]   rows swap colours (foreground / background) one by one, with a sweeping front across each row;
//             0.22 s after the first swap the gaps turn accent-coloured. Repeated swaps toggle back and forth.
//   wrap      { at, dur:1.6, bg:'accent' }   start rolling: in the first 55% curvature goes from 0 to closed (camera pulls back and rises), in the last 45% the cylinder spins and keeps tilting to about 50°.
//             Once rolled, the background is bg (default accent); scrolling blends smoothly into spin.
//   spin      cylinder spin in degrees/s (even rows; odd rows x0.65), default 38.
//   radius    cylinder radius in px, default 611; grows automatically when text units are too long.
//   inside    { at, dur:.9, text:'FLYWHEEL', sub:'DATA FLYWHEEL', size:150 }   camera moves above the axis and looks down (rings within rings);
//             text / sub appear in the central hole (paper colour, flat; text to read; sub >= 56 px). Needs wrap (without wrap it rolls automatically at inside.at-1.6).
//   callouts  true (default) | false | { a:['CYLINDER.WRAP','R 611 PX — K 1/611'], b:['ROWS 08 × ∞', null] }   two groups of leader-line micro-text on the cylinder (decorative);
//             null as b's second line = live "SPIN xx.x°".
//   hud       { tl, tr, bl, br } | false   four-corner HUD micro-text (XM.FX.hud; uses difference blending over flat ribbons / inside the cylinder, so it reads on any scheme).
//   ink / paper / accent   the three base colours (default: the darker and lighter of theme text / bg, and theme accent). Under night / paper / lab it is always ink + paper + accent.
//   hit       false (default) | true: 8 px RGB split on entrance frames 2-3 and 6 px on each swap frame. Intro hooks only.
//   seed      changes each row's initial scroll phase / swap order.
//   bg / stage / cam   as in XM.shot (default stage:'flat').
//
// Readability: in the flat stage Latin size = ribbon height x 0.97 (131 px with 8 rows), CJK = height x 1.11 (squeezed). Put slogans to be read in the middle rows;
//       the top and bottom rows touch the frame edge, so use them only for repeated slogans or decoration. In the cylinder stage text gets small: it is imagery, do not introduce new words then.
// Drift: for a full-screen text wall use { drift: { s0:0, s1:.04, x:0, y:0 } } (the default drift's pan would reveal the wall edge).
// Rules: text is flat fill; RGB split only on the hit frames. Deterministic: same t, same frame (scroll offset integrated with a fixed step).
// ─────────────────────────────────────────────────────────────────────────────
(() => {
  const { W, H } = XM;
  const D2R = Math.PI / 180, TAU = Math.PI * 2;
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  let UID = 0;

  // ---------- Colour ----------
  const CC = document.createElement('canvas').getContext('2d');
  function hexOf(c, fb = '#000000') {
    CC.fillStyle = fb; CC.fillStyle = XK.col(c) || c || fb;
    const v = CC.fillStyle; if (v[0] === '#') return v;
    const m = v.match(/[\d.]+/g); return '#' + m.slice(0, 3).map(x => (Math.round(+x)).toString(16).padStart(2, '0')).join('');
  }
  const rgb01 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = h => { const [r, g, b] = rgb01(h); return .2126 * r + .7152 * g + .0722 * b; };
  const SCHEMES = {
    ink: ['ink', 'paper'], paper: ['paper', 'ink'], accent: ['accent', 'paper'], 'ink-accent': ['ink', 'accent'],
    'paper-accent': ['paper', 'accent'], 'accent-ink': ['accent', 'ink'],
    outline: ['ink', 'paper', 1], 'outline-accent': ['accent', 'paper', 1], 'outline-paper': ['paper', 'ink', 1],
  };

  // ---------- Helpers ----------
  const smooth = XM.smooth, expoOut = XM.expoOut, expoInOut = XM.expoInOut;
  const pr = (t, a, b) => b <= a ? (t >= a ? 1 : 0) : clamp((t - a) / (b - a), 0, 1);
  // Catmull-Rom keyframes (array values) with continuous velocity, so camera motion never hitches at a key
  function crKf(K, k) {
    if (k <= K[0][0]) return K[0].slice(1); const n = K.length;
    if (k >= K[n - 1][0]) return K[n - 1].slice(1);
    let i = 0; while (K[i + 1][0] < k) i++;
    const P0 = K[Math.max(0, i - 1)], P1 = K[i], P2 = K[i + 1], P3 = K[Math.min(n - 1, i + 2)], u = (k - P1[0]) / (P2[0] - P1[0]);
    const out = [];
    for (let j = 1; j < P1.length; j++) {
      const a = P0[j], b = P1[j], c = P2[j], d = P3[j];
      out.push(.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u));
    }
    return out;
  }
  const pad2 = v => String(v).padStart(2, '0');

  // ---------- Shader: unlit, two colour-scheme textures + swap front + entrance reveal; mirrored inside (text reads correctly from inside the cylinder) ----------
  const VS = `
    attribute float sx; attribute float vv;
    varying float vS; varying float vV;
    void main() { vS = sx; vV = vv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const FS = `
    uniform sampler2D mA; uniform sampler2D mB; uniform vec3 bgA; uniform vec3 bgB;
    uniform float P; uniform float off; uniform float front; uniform float reveal; uniform float rdir;
    varying float vS; varying float vV;
    void main() {
      if (vS * rdir > reveal) discard;
      float s = gl_FrontFacing ? vS : -vS;
      vec2 uv = vec2((s + off) / P, clamp(vV, 0.0, 1.0));
      vec4 a = texture2D(mA, uv); vec4 b = texture2D(mB, uv);
      float useB = step(front, vS);
      vec3 c = mix(a.rgb, b.rgb, useB);
      float outside = step(1.0, vV) + step(vV, 0.0);
      c = mix(c, mix(bgA, bgB, useB), clamp(outside, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`;

  function ribbons(o = {}) {
    const id = ++UID;
    const at = o.at ?? 0, n = Math.max(2, o.count || 8), BH = H / n, z = BH / 135;
    const speed = o.speed ?? 90, waveA = o.wave ?? 30, gapPx = o.gap ?? 10, spinDeg = o.spin ?? 38;
    const seed = o.seed ?? 1, hit = !!o.hit;
    // Colours resolved at build time (XK.tone only applies during build)
    const tx = hexOf('text'), bx = hexOf('bg');
    const C = {
      ink: hexOf(o.ink || (lum(tx) < lum(bx) ? tx : bx)), paper: hexOf(o.paper || (lum(tx) < lum(bx) ? bx : tx)), accent: hexOf(o.accent || 'accent'),
    };
    const cOf = c => C[c] || hexOf(c);
    // Events
    const swaps = (o.swap ? (Array.isArray(o.swap) ? o.swap : [o.swap]) : []).map(s => ({ at: s.at, push: s.push ?? 240, stagger: s.stagger ?? .05, dur: s.dur ?? .3 })).sort((a, b) => a.at - b.at);
    let wrap = o.wrap ? { dur: 1.6, ...o.wrap } : null;
    const inside = o.inside ? { dur: .9, size: 150, ...o.inside } : null;
    if (inside && !wrap) wrap = { at: inside.at - 1.6, dur: 1.6 };
    const gapBefore = cOf(o.gapColor || 'ink'), gapAfter = cOf((wrap && wrap.bg) || o.gapAfter || 'accent');
    const pushes = (o.steps || []).filter(s => s.push !== 0).map(s => ({ at: s.at, px: s.push ?? 260, rows: s.rows || 'all' }));
    for (const s of swaps) if (s.push) pushes.push({ at: s.at, px: s.push, rows: 'all', swap: true });
    const bumps = pushes.map(p => p.at);

    // Rows
    const src = (o.rows && o.rows.length ? o.rows : [{ text: 'RIBBON ✦ TEXT BAND', scheme: 'ink' }]).map(r => typeof r === 'string' ? { text: r } : r);
    const ROWS = [];
    for (let r = 0; r < n; r++) {
      const s = src[r % src.length], sc = SCHEMES[s.scheme || 'ink'] || SCHEMES.ink;
      const bg = cOf(s.bg || sc[0]), fg = cOf(s.fg || sc[1]);
      ROWS.push({ ...s, bg, fg, outline: s.outline ?? !!sc[2], tag: s.tag || [`R${pad2(r + 1)}/${pad2(n)}`, `${o.code || 'XM'}-${(44 + .25 * r).toFixed(2)}S`] });
    }
    // Per row: scroll direction / speed multiplier / initial phase / swap order
    const order = ROWS.map((_, r) => r).sort((a, b) => hash(seed * 13 + a * 3.1) - hash(seed * 13 + b * 3.1));
    ROWS.forEach((R, r) => {
      R.dir = r % 2 ? -1 : 1; R.mul = r % 2 ? 1.35 : 1; R.ph = hash(seed * 7 + r * 1.7);
      R.swapLag = order.indexOf(r); R.enterLag = r * .035; R.rdir = r % 2 ? -1 : 1;
    });

    // ---------- three.js scene (textures wait for fonts: XK.later) ----------
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, W / H, 10, 40000);
    const NSEG = 720;
    let READY = false, Rr = o.radius || 611, Lc = TAU * Rr;
    const MESH = [];
    for (let r = 0; r < n; r++) {
      const gm = new THREE.BufferGeometry();
      gm.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NSEG + 1) * 2 * 3), 3));
      gm.setAttribute('sx', new THREE.BufferAttribute(new Float32Array((NSEG + 1) * 2), 1));
      gm.setAttribute('vv', new THREE.BufferAttribute(new Float32Array((NSEG + 1) * 2), 1));
      const idx = []; for (let j = 0; j < NSEG; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      gm.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide,
        uniforms: { mA: { value: null }, mB: { value: null }, bgA: { value: new THREE.Vector3() }, bgB: { value: new THREE.Vector3() },
          P: { value: 1000 }, off: { value: 0 }, front: { value: 1e6 }, reveal: { value: -1e6 }, rdir: { value: 1 } },
      });
      const m = new THREE.Mesh(gm, mat); m.frustumCulled = false; scene.add(m);
      MESH.push(m);
    }

    // Unit layout: [text runs (✦ drawn as a star)][54][two micro-label lines][+210 star][+110 next unit]
    const SR = 32.5 * z, SG = 40 * z;
    const FZ = { size: BH * 1.11, sx: .7, ls: 10 * z }, FL = { size: BH * .97, ls: -3.9 * z };
    function fontZ(g, R) { g.font = `${R.zhW ?? 500} ${FZ.size}px HeiSC`; g.letterSpacing = FZ.ls + 'px'; }
    function fontL(g, R) { g.font = `${R.w ?? 900} ${FL.size}px Unb`; g.letterSpacing = FL.ls + 'px'; }
    function layout(g, R) {
      const items = []; let x = 40 * z;
      fontZ(g, R); const mz = g.measureText('中'); const yZ = BH / 2 + (mz.actualBoundingBoxAscent - mz.actualBoundingBoxDescent) / 2;
      fontL(g, R); const ml = g.measureText('H'); const yL = BH / 2 + (ml.actualBoundingBoxAscent - ml.actualBoundingBoxDescent) / 2;
      const parts = String(R.text).split('✦').map(s => s.trim());
      parts.forEach((p, i) => {
        if (i) { x += SG; items.push({ star: true, x: x + SR }); x += 2 * SR + SG; }
        if (!p) return;
        const runs = []; for (const ch of p) { const zh = CJK.test(ch); if (runs.length && runs[runs.length - 1].zh === zh) runs[runs.length - 1].s += ch; else runs.push({ zh, s: ch }); }
        for (const rn of runs) {
          if (rn.zh) { fontZ(g, R); const wdt = g.measureText(rn.s).width * FZ.sx; items.push({ zh: true, s: rn.s, x, y: yZ }); x += wdt; }
          else { fontL(g, R); const wdt = g.measureText(rn.s).width; items.push({ zh: false, s: rn.s, x, y: yL }); x += wdt; }
        }
      });
      g.letterSpacing = '0px';
      const lx = x + 54 * z, sx = lx + 210 * z;
      return { items, lx, sx, P0: sx + SR + 110 * z };
    }
    function drawUnit(R, inv) {
      const bg = inv ? R.fg : R.bg, fg = inv ? R.bg : R.fg, P = R.P;
      const Q = Math.min(2, 8192 / P), cw = Math.round(P * Q), ch = Math.round(BH * Q);
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const g = c.getContext('2d'); g.scale(cw / P, ch / BH);
      g.fillStyle = bg; g.fillRect(0, 0, P, BH);
      for (const it of R.L.items) {
        if (it.star) { XM.FX.star4(g, it.x, BH / 2, SR, fg); continue; }
        g.save(); g.translate(it.x, it.y);
        if (it.zh) { g.scale(FZ.sx, 1); fontZ(g, R); XM.note('HeiSC', it.s); } else { fontL(g, R); XM.note('Unb', it.s); }
        if (R.outline) { g.strokeStyle = fg; g.lineWidth = 6 * z; g.lineJoin = 'miter'; g.strokeText(it.s, 0, 0); g.fillStyle = bg; g.fillText(it.s, 0, 0); }
        else { g.fillStyle = fg; g.fillText(it.s, 0, 0); }
        g.letterSpacing = '0px'; g.restore();
      }
      XM.txt(g, R.tag[0], R.L.lx, 61 * z, { fam: 'mono', size: 14 * z, w: 500, col: fg });
      XM.txt(g, R.tag[1], R.L.lx, 80 * z, { fam: 'mono', size: 13 * z, w: 500, col: fg });
      XM.FX.star4(g, R.L.sx, BH / 2, SR, fg);
      const t3 = new THREE.CanvasTexture(c);
      t3.wrapS = THREE.RepeatWrapping; t3.wrapT = THREE.ClampToEdgeWrapping;
      t3.minFilter = THREE.LinearMipmapLinearFilter; t3.generateMipmaps = true;
      t3.anisotropy = XM.gl().capabilities.getMaxAnisotropy();
      return t3;
    }
    XK.later(() => {
      const g = document.createElement('canvas').getContext('2d');
      let maxP = 0;
      for (const R of ROWS) { R.L = layout(g, R); maxP = Math.max(maxP, R.L.P0); }
      // Radius: one turn must hold a whole number of units (seamless cylinder); search near 611 for the radius that stretches the rows' units least
      const lo = Math.max(o.radius || 560, maxP * 1.001 / TAU), cost = Rq => { const L = TAU * Rq; let c = 0;
        for (const R of ROWS) { const m = Math.max(1, Math.floor(L / R.L.P0)); c = Math.max(c, L / m / R.L.P0 - 1); } return c; };
      if (o.radius) Rr = lo;
      else { let best = 1e9; for (let Rq = lo; Rq <= lo + 520; Rq += 2) { const c = cost(Rq) + Math.abs(Rq - 611) / 611 * .6; if (c < best) { best = c; Rr = Rq; } } }
      Lc = TAU * Rr;
      const fz = (Rr + 540) / (611 + 540); CK = CK0.map(k => k[0] < .2 ? k : [k[0], k[1] * lerp(1, fz, Math.min(1, k[0] / .55)), ...k.slice(2)]);
      ROWS.forEach((R, r) => {
        const m = Math.max(1, Math.floor(Lc / R.L.P0)); R.P = Lc / m;
        R.tex = [drawUnit(R, false), drawUnit(R, true)];
        R.bgv = [new THREE.Vector3(...rgb01(R.bg)), new THREE.Vector3(...rgb01(R.fg))];
        const U = MESH[r].material.uniforms; U.P.value = R.P; U.rdir.value = R.rdir;
        const SX = MESH[r].geometry.attributes.sx.array;
        for (let j = 0; j <= NSEG; j++) SX[j * 2] = SX[j * 2 + 1] = -Lc / 2 + Lc * j / NSEG;
        MESH[r].geometry.attributes.sx.needsUpdate = true;
      });
      READY = true;
    });

    // ---------- Time functions ----------
    const wEnd = wrap ? wrap.at + wrap.dur : Infinity;
    const bendK = t => wrap ? smooth(pr(t, wrap.at, wrap.at + .55 * wrap.dur)) : 0;     // 0 flat -> 1 closed
    function vel(R, r, t) {
      const fl = R.dir * speed * R.mul, sp = spinDeg * D2R * Rr * (r % 2 ? .65 : 1);
      return lerp(fl, sp, bendK(t));
    }
    function offset(R, r, t) {
      let s = R.ph * (R.P || 1000);
      if (t > at) {
        const h = 1 / 60; let x = at;
        while (x + h <= t) { s += (vel(R, r, x) + vel(R, r, x + h)) * h / 2; x += h; }
        if (t > x) s += (vel(R, r, x) + vel(R, r, t)) * (t - x) / 2;
      }
      for (const p of pushes) {
        if (p.rows === 'odd' && r % 2 === 0) continue; if (p.rows === 'even' && r % 2 === 1) continue;
        const a = p.at + (p.swap ? R.swapLag * .03 : 0);
        s += p.px * R.dir * expoOut(pr(t, a, a + .55));
      }
      return s;
    }
    function ampAt(t) {
      let A = waveA * (.35 + .65 * smooth(pr(t, at, at + .9)));
      for (const b of bumps) if (t > b) A += waveA * .7 * Math.exp(-(t - b) / .35) * smooth(pr(t, b, b + .12));
      if (wrap) A *= lerp(1, .5, bendK(t));
      return A;
    }
    // Swap: returns [swaps completed, position of the sweeping front (ribbon coords; new scheme to its right)]
    function swapState(R, t) {
      let done = 0, front = 1e6;
      for (const s of swaps) {
        const a = s.at + R.swapLag * s.stagger, b = a + s.dur;
        if (t >= b) { done++; continue; }
        if (t >= a) { const X1 = Lc / 2 + 2; front = lerp(X1, -X1, expoInOut(pr(t, a, b))); }
        break;
      }
      return [done, front];
    }
    const gapCol = t => (swaps.length && t >= swaps[0].at + .22) || (wrap && t >= wrap.at) ? gapAfter : gapBefore;

    // ---------- Camera ----------
    // Roll: [progress, distance, elevation °, target height, target fraction along the axis kz, fov °]; at k=0 the z=0 plane is exactly 1:1 (the flat-stage camera)
    const D0 = (H / 2) / Math.tan(15 * D2R);
    const CK0 = [[0, D0, 0, 0, 0, 30], [.28, D0 * 1.15, 3, 0, .4, 30], [.55, 3350, 14, -20, 1, 30], [.78, 3550, 28, -50, 1, 30], [1, 3500, 46, -70, 1, 30]];
    let CK = CK0;                                   // when the radius is not 611, scale the camera distance with the cylinder (set in XK.later)
    function camAt(t) {
      let v = [D0, 0, 0, 0, 30];
      if (wrap && t > wrap.at) {
        v = crKf(CK, smooth(pr(t, wrap.at, wEnd)));
        if (t > wEnd) v[1] += Math.min(8, 2.5 * (t - wEnd));                       // after rolling, keep tilting down slowly
      }
      if (inside && t > inside.at) {
        const e = expoInOut(pr(t, inside.at, inside.at + inside.dur));
        const IN = [(H + 260) / Math.sin(84 * D2R), 84, -H / 2, 1, 68];
        v = v.map((x, i) => lerp(x, IN[i], e));
      }
      const [D, el, ty, kz, fov] = v, er = el * D2R;
      const tg = new THREE.Vector3(0, ty, -kz * Rr);
      cam.position.set(tg.x, tg.y + D * Math.sin(er), tg.z + D * Math.cos(er));
      cam.up.set(0, Math.cos(er), -Math.sin(er));
      cam.fov = fov; cam.updateProjectionMatrix(); cam.lookAt(tg); cam.updateMatrixWorld();
    }

    // ---------- Geometry (per frame): wavy edges + gaps + curvature ----------
    const E = new Float64Array(n + 1), GP = new Float64Array(n + 1);
    function geom(t) {
      const kap = wrap ? bendK(t) / Rr : 0, A = ampAt(t), EXT = 70;
      const POS = MESH.map(m => m.geometry.attributes.position.array), VV = MESH.map(m => m.geometry.attributes.vv.array);
      for (let j = 0; j <= NSEG; j++) {
        const xs = -Lc / 2 + Lc * j / NSEG;
        for (let e = 0; e <= n; e++) {
          const env = .12 + .88 * Math.abs(e - n / 2) / (n / 2);
          E[e] = H / 2 - e * BH + A * env * (.8 * Math.sin(TAU * 3 * xs / Lc - 1.7 * t + .45 * e) + .35 * Math.sin(TAU * 7 * xs / Lc + 1.1 * t + 1.3 * e));
          GP[e] = (e === 0 || e === n) ? 0 : gapPx * clamp(.3 + .7 * Math.sin(TAU * 5 * xs / Lc + 1.9 * e + .9 * t), 0, 1);
        }
        let X = xs, Z = 0;
        if (kap > 1e-8) { const th = kap * xs; X = Math.sin(th) / kap; Z = (Math.cos(th) - 1) / kap; }
        for (let r = 0; r < n; r++) {
          const top = r === 0 ? E[0] + EXT : E[r] - GP[r] / 2, bot = r === n - 1 ? E[n] - EXT : E[r + 1] + GP[r + 1] / 2, c = (E[r] + E[r + 1]) / 2;
          const P = POS[r], V = VV[r], q = j * 6;
          P[q] = X; P[q + 1] = top; P[q + 2] = Z; P[q + 3] = X; P[q + 4] = bot; P[q + 5] = Z;
          V[j * 2] = .5 + (top - c) / BH; V[j * 2 + 1] = .5 + (bot - c) / BH;
        }
      }
      for (const m of MESH) { m.geometry.attributes.position.needsUpdate = true; m.geometry.attributes.vv.needsUpdate = true; }
    }

    // ---------- Callouts (cylinder stage, follow 3D anchors) ----------
    const V3 = new THREE.Vector3();
    function proj(x, y, zz) { V3.set(x, y, zz).project(cam); return [(V3.x + 1) / 2 * W, (1 - V3.y) / 2 * H]; }
    const CO = o.callouts === false ? null : (typeof o.callouts === 'object' ? o.callouts : {});
    function callouts(g, t, spinNow) {
      if (!CO || !wrap) return;
      const a = pr(t, wrap.at + .5 * wrap.dur, wrap.at + .5 * wrap.dur + .25) * (inside ? 1 - pr(t, inside.at, inside.at + .3) : 1);
      if (a <= 0) return;
      const pc = C.paper, txtA = CO.a || ['CYLINDER.WRAP', `R ${Math.round(Rr)} PX — K 1/${Math.round(Rr)}`];
      const txtB = CO.b || [`ROWS ${pad2(n)} × ∞`, null];
      g.save(); g.globalAlpha = a; g.strokeStyle = pc; g.lineWidth = 1.5;
      // A: front-left of the top ring
      { const th = -58 * D2R, [ax, ay] = proj(Rr * Math.sin(th), H / 2 - 4, -Rr + Rr * Math.cos(th));
        const x = clamp(ax - 120, 380, W - 120), y = clamp(ay - 86, 130, H - 160);
        g.beginPath(); g.moveTo(x + 8, y + 18); g.lineTo(ax, ay); g.stroke();
        g.fillStyle = pc; g.beginPath(); g.arc(ax, ay, 3, 0, TAU); g.fill();
        XM.txt(g, txtA[0], x, y, { fam: 'mono', size: 19, w: 500, col: pc, ls: 1.5, align: 'right' });
        if (txtA[1]) XM.txt(g, txtA[1], x, y + 24, { fam: 'mono', size: 17, w: 500, col: pc, ls: 2, align: 'right' }); }
      // B: right side of the middle ring
      { const rm = Math.floor(n / 2), th = 78 * D2R, [bx2, by] = proj(Rr * Math.sin(th), H / 2 - (rm + .5) * BH, -Rr + Rr * Math.cos(th));
        const x = clamp(bx2 + 120, 120, W - 380), y = clamp(by - 34, 130, H - 160);
        g.beginPath(); g.moveTo(x - 10, y - 6); g.lineTo(bx2, by); g.stroke();
        g.fillStyle = pc; g.beginPath(); g.arc(bx2, by, 3, 0, TAU); g.fill();
        XM.txt(g, txtB[0], x, y, { fam: 'mono', size: 19, w: 500, col: pc, ls: 1.5 });
        XM.txt(g, txtB[1] || `SPIN ${spinNow.toFixed(1)}°`, x, y + 24, { fam: 'mono', size: 17, w: 500, col: pc, ls: 2 }); }
      g.restore();
    }

    function rgbHit(g, dx) {
      const Lr = XM.canvas('xm-rib-hit'); Lr.g.drawImage(g.canvas, 0, 0);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); XM.FX.rgbSplit(g, Lr.c, dx); g.restore();
    }

    return XM.shot({ bg: o.bg, stage: o.stage || 'flat', cam: o.cam }, S => (g, t) => {
      const bgc = gapCol(t);
      g.fillStyle = bgc; g.fillRect(0, 0, W, H);
      if (!READY || t < at) return;
      camAt(t); geom(t);
      ROWS.forEach((R, r) => {
        const U = MESH[r].material.uniforms, [done, front] = swapState(R, t), k = done % 2;
        U.mA.value = R.tex[k]; U.mB.value = R.tex[1 - k]; U.bgA.value = R.bgv[k]; U.bgB.value = R.bgv[1 - k];
        U.front.value = front; U.off.value = offset(R, r, t);
        const ke = expoOut(pr(t, at + R.enterLag, at + R.enterLag + .5));
        U.reveal.value = ke >= 1 ? 1e6 : lerp(-(W / 2 + 40), W / 2 + 40, ke);
      });
      XM.drawGL(g, scene, cam, { tone: false });
      // Hook mode: RGB split on the entrance / swap frames
      if (hit) {
        const f = Math.floor((t - at) * 30);
        if (f === 2 || f === 3) rgbHit(g, 8);
        for (const s of swaps) if (Math.floor((t - s.at) * 30) === 1) rgbHit(g, 6);
      }
      const R0 = ROWS[0], spinNow = (((offset(R0, 0, t) - offset(R0, 0, wrap ? wrap.at : t)) / Rr / D2R) % 360 + 360) % 360;
      callouts(g, t, spinNow);
      // Text in the central hole (inside)
      if (inside && (inside.text || inside.sub)) {
        const a0 = inside.at + inside.dur * .55, k = expoOut(pr(t, a0, a0 + .45));
        if (k > 0) {
          const yy = H / 2 + (1 - k) * 40, sz = inside.size;
          g.save(); g.globalAlpha = k;
          if (inside.text) XM.txt(g, inside.text, W / 2, yy + (inside.sub ? 0 : sz * .36), { fam: 'unb', size: sz, w: 900, zhW: 900, col: inside.color ? cOf(inside.color) : C.paper, align: 'center', ls: -sz * .02 });
          if (inside.sub) XM.txt(g, inside.sub, W / 2, yy + 92, { fam: 'grot', size: 56, w: 700, col: inside.color ? cOf(inside.color) : C.paper, align: 'center', ls: 6 });
          g.restore();
        }
      }
      // HUD
      if (o.hud !== false) {
        const hd = o.hud || {}, flat = !wrap || t < wrap.at || (inside && t > inside.at + .3 * inside.dur);   // difference blending while over the ribbons
        g.save(); if (flat) g.globalCompositeOperation = 'difference';
        XM.FX.hud(g, t, { tl: hd.tl || `FIG.R  RIBBONS × ${pad2(n)}`, tr: hd.tr, bl: hd.bl ?? (wrap && t >= wrap.at ? 'CYLINDER' : 'WALL'), br: hd.br ?? `${Math.round(speed)} PX/S`, color: flat ? '#ffffff' : C.paper, a: .9 });
        g.restore();
      }
    });
  }

  Object.assign(XM, { ribbons });
})();
