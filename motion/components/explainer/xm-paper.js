// XM.paper: 3D paper enter / exit for a flat card (screenshot card, paper page, ...). The card content is painted into a
// texture and placed as a 3D sheet in the shared WebGL renderer (XM.gl()): at rest it is slightly tilted (right edge
// nearer the camera) and its lower part fades out down the page; the camera pushes in along the line of sight to a
// point; enter / exit use one of the six modes below. Currently used by XS.evidence (when enter / exit are given);
// other flat-card components can use it too.
//
// enter.kind                                     exit.kind
//   'fly'   flies up from lower right, side-on, then squares up   'recede' backs away, turns, darkens
//   'line'  a horizontal line draws, the page stands up on it     'fold'   folds back onto the same axis into a line (yellow when highlighted), line shrinks to a point
//   'pull'  a stack rises from below and the top page is pulled   'tuck'   the stack rises, this page drops back, the whole stack falls
//   'desk'  lies flat on a desk, slides in from the right (stays flat)  'slide'  flicks away left along the page plane
//   'macro' opens on an extreme close-up of the target, pulls out once  'dive'   pushes into the target point (into the yellow highlight), hard cut at the end
//   'drum'  mounted on a horizontal drum, rotates up from below   'drum'   rotates away upward; the next page in chain arrives from below
// Choosing: fly is the general default; line / fold suit evidence about lines, paths or timelines; pull / tuck = "pull out a
//   document"; desk / slide feel everyday; macro suits hooks and section openers, and a dive exit can cut straight into the
//   next shot; drum for several pieces of evidence in a row (use chain). Do not give two neighbouring evidence shots the same entrance.
//
// API (usually not called directly; XS.evidence builds it):
//   XM.paper({
//     w, h          card size (stage px at s=1)
//     paint(g, t)   paint the card content into g (coords 0..w x 0..h, already scaled to texture resolution); key(t) returns a string, and the card is not repainted while it is unchanged (optional)
//     x, y, s       card centre on stage and scale at rest (default W/2, H/2, 1)
//     tilt          rest tilt [rx, ry, rz] in degrees, default [-4, -9, 1.6]; a desk entrance switches to lying flat [-34, 0, 2]
//     fade          fade-out of the lower part [from, to] as fractions of card height, default [.6, 1]; false = no fade
//     focus         [[t, cx, cy, zoom]] in card px: bring that point to screen centre, magnified zoom times (cubicInOut between keys). Omitted: placed by x/y/s
//     enter / exit  { kind, at, dur } (dur optional, each kind has a default)
//     axis          axis for line / fold (card px y), default the card's middle
//     target        target point [cx, cy] for macro / dive (card px), default card centre
//     foldColor     colour of the fold-exit line (pass fluorescent yellow if there is a highlight); lineColor = entrance line colour (default stage foreground)
//     base          card base colour (back side / stack), default '#e9e8e4'
//     chain         [{ w, h, paint, key, at, anchor:[cx, cy], focus }] drum page turns: at time at the current page rotates away and this one arrives;
//                   anchor = point of this page to put at screen centre (card px). Smoothest when enter / exit are both 'drum', but not required.
//     P             stage palette (XM.DS.tone(...))
//   })
//   -> { draw(g, t), project(i, cx, cy) -> [sx, sy] (card px of card i -> stage coords this frame; call after draw), page(t) -> current page index, cut(t) }
(() => {
  const { W, H } = XK;
  const D2R = Math.PI / 180, FOV = 30, FPX = (H / 2) / Math.tan(FOV / 2 * D2R);
  const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, d) => cl((t - a) / d);
  const lerp = (a, b, k) => a + (b - a) * k;
  const expoOut = k => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
  const sineInOut = k => -(Math.cos(Math.PI * k) - 1) / 2;
  const cubicInOut = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const powOut = (k, p) => 1 - Math.pow(1 - k, p);
  const powIn = (k, p) => Math.pow(k, p);
  const logLerp = (a, b, k) => Math.exp(lerp(Math.log(a), Math.log(b), k));
  const DUR_IN = { fly: .85, line: 1.15, pull: 1.05, desk: 1.0, macro: 1.2, drum: .9 };
  const DUR_OUT = { recede: 1.05, fold: 1.1, tuck: .85, slide: .55, dive: .78, drum: .75 };

  const VS = `varying vec2 vC; uniform vec2 uWH;
    void main() { vC = vec2(position.x, -position.y) + uWH * .5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const FS = `varying vec2 vC; uniform sampler2D uTex; uniform vec2 uWH, uFade; uniform float uOp, uBri, uDim, uHasTex; uniform vec3 uBase;
    void main() {
      float a = uFade.y > uFade.x ? clamp(1.0 - (vC.y / uWH.y - uFade.x) / (uFade.y - uFade.x), 0.0, 1.0) : 1.0;
      vec3 c = uBase * .74;
      if (gl_FrontFacing && uHasTex > .5) c = texture2D(uTex, vec2(vC.x / uWH.x, 1.0 - vC.y / uWH.y)).rgb;
      else if (gl_FrontFacing) c = uBase;
      c *= 1.0 - .05 * smoothstep(.55, 1.0, vC.x / uWH.x);                 // slightly darker toward the right edge
      gl_FragColor = vec4(c * uBri * uDim, a * uOp);
    }`;

  function sheet(scene, w, h, base, tex) {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false,
      uniforms: { uTex: { value: tex || null }, uHasTex: { value: tex ? 1 : 0 }, uWH: { value: new THREE.Vector2(w, h) }, uFade: { value: new THREE.Vector2(0, 0) },
        uOp: { value: 1 }, uBri: { value: 1 }, uDim: { value: 1 }, uBase: { value: new THREE.Color(base) } } });
    const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; m.frustumCulled = false; scene.add(m);
    return m;
  }
  const rotM = r => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0] * D2R, r[1] * D2R, r[2] * D2R, 'XYZ'));
  const tr = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  // Rotate by r (degrees) about local point p, then translate by off
  const about = (p, r, off = [0, 0, 0]) => tr(off[0] + p.x, off[1] + p.y, off[2] + p.z).multiply(rotM(r)).multiply(tr(-p.x, -p.y, -p.z));

  function paper(o) {
    const P = o.P || XM.DS.tone('ink');
    const s0 = o.s ?? 1, X = o.x ?? W / 2, Y = o.y ?? H / 2;
    const enter = o.enter ? { ...o.enter, dur: o.enter.dur ?? DUR_IN[o.enter.kind] ?? .9 } : null;
    const exit = o.exit ? { ...o.exit, dur: o.exit.dur ?? DUR_OUT[o.exit.kind] ?? .8 } : null;
    const desk = enter && enter.kind === 'desk';
    const tilt = o.tilt || (desk ? [-34, 0, 2] : [-4, -9, 1.6]);
    const fade = o.fade === false ? [0, 0] : (o.fade || [.6, 1]);
    const base = o.base || '#e9e8e4';
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(FOV, W / H, 1, 1e6);

    // Each card: texture (offscreen canvas, 2x) + plane
    const cards = [{ w: o.w, h: o.h, paint: o.paint, key: o.key, at: -1e9, anchor: null, focus: o.focus }, ...(o.chain || [])].map((c, i) => {
      const Q = Math.min(2, 4096 / Math.max(c.w, c.h));
      const cv = document.createElement('canvas'); cv.width = Math.round(c.w * Q); cv.height = Math.round(c.h * Q);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.anisotropy = XM.gl().capabilities.getMaxAnisotropy();
      const mesh = sheet(scene, c.w, c.h, base, tex);
      mesh.material.uniforms.uFade.value.set(...fade);
      return { ...c, Q, cv, g: cv.getContext('2d'), tex, mesh, last: null, M: new THREE.Matrix4(), idx: i };
    });
    // Paper stack (pull / tuck): two blank sheets underneath
    const kinds = [enter && enter.kind, exit && exit.kind];
    const stack = kinds.includes('pull') || kinds.includes('tuck') ? [sheet(scene, o.w, o.h, base), sheet(scene, o.w, o.h, base)] : [];
    stack.forEach((m, i) => { m.material.uniforms.uFade.value.set(...fade); m.material.uniforms.uDim.value = i ? .62 : .8; m.renderOrder = -2 + i; });
    cards.forEach(c => { c.mesh.renderOrder = 1 + c.idx; });
    // Desk: same plane as the paper, one top light + contact shadow under the page
    let deskMesh = null;
    if (desk) {
      deskMesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w * 9, o.w * 7), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false,
        uniforms: { uRect: { value: new THREE.Vector4() }, uRot: { value: 0 }, uW: { value: o.w }, uIn: { value: P.stage === 'paper' ? 1 : 0 } },
        vertexShader: 'varying vec2 vL; void main(){ vL = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec2 vL; uniform vec4 uRect; uniform float uRot, uW, uIn;
          void main(){
            vec2 d = vL - uRect.xy; float s = sin(-uRot), c = cos(-uRot); d = vec2(c*d.x - s*d.y, s*d.x + c*d.y);
            vec2 q = abs(d) - uRect.zw; float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
            vec2 pc = vL - vec2(uW * .2, uW * .55);
            float pool = exp(-dot(pc, pc) / (2.0 * uW * uW * 1.25));
            vec3 col = mix(vec3(.051, .055, .071), vec3(.227, .224, .235), pool);
            float sh = (1.0 - smoothstep(-.016 * uW, .18 * uW, sd)) * .7 * smoothstep(-uRect.w * .9, uRect.w * .3, d.y);
            col *= 1.0 - sh;
            float edge = smoothstep(uW * 3.4, uW * 2.1, length(vL * vec2(.8, 1.0)));
            gl_FragColor = vec4(col, edge * (1.0 - uIn));
          }` }));
      deskMesh.matrixAutoUpdate = false; deskMesh.renderOrder = -5; scene.add(deskMesh);
    }

    // Placement: world unit = stage px at s=1; with the camera at (0, 0, FPX/s) the card sits on stage exactly per x/y/s
    const L = (c, cx, cy) => new THREE.Vector3(cx - c.w / 2, -(cy - c.h / 2), 0);       // card px -> card-local coords
    const REST = new THREE.Matrix4().compose(new THREE.Vector3((X - W / 2) / s0, -(Y - H / 2) / s0, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt[0] * D2R, tilt[1] * D2R, tilt[2] * D2R, 'XYZ')), new THREE.Vector3(1, 1, 1));
    const REST_Q = new THREE.Quaternion().setFromRotationMatrix(REST);
    const C0 = cards[0];
    const worldOf = (c, cx, cy) => L(c, cx, cy).applyMatrix4(c.M);
    // Camera: focus keys -> that point at screen centre, magnified zoom (looking along the card normal; the camera itself does not rotate)
    function camFocus(t) {
      const F = C0.focus;
      if (!F || !F.length) return new THREE.Vector3(0, 0, FPX / s0);
      const at = i => { const [, cx, cy, z] = F[i]; const p = L(C0, cx, cy).applyMatrix4(REST); return new THREE.Vector3(p.x, p.y, p.z + FPX / (s0 * (z || 1))); };
      if (t <= F[0][0]) return at(0);
      for (let i = 1; i < F.length; i++) if (t < F[i][0]) return at(i - 1).lerp(at(i), cubicInOut((t - F[i - 1][0]) / Math.max(1e-6, F[i][0] - F[i - 1][0])));
      return at(F.length - 1);
    }
    const dolly = (p, c, r) => new THREE.Vector3(p.x + (c.x - p.x) * r, p.y + (c.y - p.y) * r, p.z + (c.z - p.z) * r);
    // Angle about x at which the page is edge-on to the camera (line / fold): solve with the axis-to-camera direction in page-local coords
    function edgeAngle(axisLocal, camPos) {
      const a = axisLocal.clone().applyMatrix4(REST), d = camPos.clone().sub(a).applyQuaternion(REST_Q.clone().invert());
      return Math.atan2(d.z, d.y) / D2R;
    }

    const axisY = o.axis ?? o.h / 2, target = o.target || [o.w / 2, o.h / 2];
    const tg = { x: target[0], y: target[1] };
    let cutAt = Infinity;
    if (exit && exit.kind === 'dive') cutAt = exit.at + exit.dur;
    const lastIdx = cards.length - 1;
    const useDrum = cards.length > 1 || (enter && enter.kind === 'drum') || (exit && exit.kind === 'drum');
    // drum: angle of card i on the drum (0 = facing front, negative = below, positive = rotated up)
    const R = o.w * 1.3;
    function drumAngle(i, t) {
      let a = 0;
      if (i === 0 && enter && enter.kind === 'drum') a = lerp(-52, 0, expoOut(seg(t, enter.at, enter.dur)));
      if (i > 0) a = lerp(-62, 0, sineInOut(seg(t, cards[i].at, 1.0)));
      if (i < lastIdx) a += 62 * sineInOut(seg(t, cards[i + 1].at, 1.0));
      if (i === lastIdx && exit && exit.kind === 'drum') a += 64 * powIn(seg(t, exit.at, exit.dur), 2.2);
      return a;
    }
    let lineDraw = null;

    function pose(t, camPos) {
      // Returns each card's world matrix, opacity and brightness; the stack; entrance / exit lines
      const out = [], A = enter && t < (exit ? exit.at : Infinity) ? enter : null;
      const mid = L(C0, o.w / 2, o.h / 2);
      let m0 = new THREE.Matrix4(), op = 1, bri = 1, rzDesk = desk ? 0 : 0, off = [0, 0, 0];
      lineDraw = null;
      const w = o.w;
      // ---- Enter ----
      if (enter) {
        const k = seg(t, enter.at, enter.dur);
        if (t < enter.at) op = 0;
        switch (enter.kind) {
          case 'fly': {
            const kp = powOut(k, 2.5), kr = expoOut(seg(t, enter.at, enter.dur * .65));
            m0 = about(mid, [lerp(62, 0, kr), lerp(-28, 0, kr), lerp(-36, 0, kr)], [lerp(.55 * w, 0, kp), lerp(-.75 * w, 0, kp), lerp(-3.25 * w, 0, kp)]);
            op *= cl((t - enter.at) / .08); break; }
          case 'line': {
            const tIn = enter.at + .32, ki = expoOut(seg(t, tIn, enter.dur - .32)), ax = L(C0, o.w / 2, axisY);
            m0 = about(ax, [edgeAngle(ax, camPos) * (1 - ki), 0, 0]);
            op *= cl((t - tIn) / .06);
            lineDraw = { kind: 'in', k: expoOut(seg(t, enter.at, .4)), a: 1 - seg(t, tIn + .25, .35), y: axisY, color: o.lineColor || P.fg };
            break; }
          case 'pull': break;                       // computed below together with the stack
          case 'desk': {
            const ki = expoOut(k);
            rzDesk = lerp(24, 0, ki);
            m0 = about(mid, [0, 0, rzDesk], [lerp(1.35 * w, 0, ki), lerp(-.25 * w, 0, ki), 0]); break; }
          case 'macro': op *= cl((t - enter.at) / .12); break;
          case 'drum': op *= cl((t - enter.at) / .1); break;
        }
      }
      // ---- Exit ----
      let exitM = new THREE.Matrix4();
      if (exit && t >= exit.at) {
        const k = seg(t, exit.at, exit.dur);
        switch (exit.kind) {
          case 'recede': {
            const ko = sineInOut(k), kd = powIn(seg(t, exit.at + .1, exit.dur - .1), 1.8);
            exitM = about(mid, [16 * ko, -26 * ko, -8 * ko], [.35 * w * ko, .21 * w * ko, -2.6 * w * ko]); bri = 1 - kd; break; }
          case 'fold': {
            const ax = L(C0, o.w / 2, axisY), ko = powIn(seg(t, exit.at, .5), 2.2);
            exitM = about(ax, [edgeAngle(ax, camPos) * ko, 0, 0]);
            const tLine = exit.at + .5;
            lineDraw = { kind: 'out', kc: cubicInOut(seg(t, tLine, .45)), a: seg(t, exit.at + .3, .15) * (1 - seg(t, tLine + .5, .12)), y: axisY, color: o.foldColor || P.fg };
            if (k >= 1) op = 0;
            break; }
          case 'slide': {
            const ko = powIn(k, 2.2);
            exitM = about(mid, [0, 0, 16 * ko], [-1.7 * w * ko, .13 * w * ko, 0]); if (k >= 1) op = 0; break; }
          case 'tuck': break;
          case 'dive': break;
          case 'drum': break;
        }
      }
      // ---- Pull out / tuck back (moves together with the stack) ----
      let stackY = null, yA = 0, rzA = 0, lift = 0;
      if (kinds.includes('pull') || kinds.includes('tuck')) {
        const STACK = -.38 * w, STACK_OUT = -.22 * w, GONE = -1.35 * w;
        let yB = GONE;
        if (enter && enter.kind === 'pull') {
          const a0 = enter.at, ks = expoOut(seg(t, a0, .45)), ka = expoOut(seg(t, a0 + .38, .67)), kb = powIn(seg(t, a0 + .55, .45), 2);
          const yS = lerp(GONE, STACK, ks); yA = lerp(yS, 0, ka); yB = lerp(yS, GONE, kb);
          rzA = lerp(-5, 0, ka); lift = Math.sin(Math.PI * ka) * 14;
          if (t < a0) op = 0;
        }
        if (exit && exit.kind === 'tuck' && t >= exit.at) {
          const a0 = exit.at, ob = expoOut(seg(t, a0, .32)), oa = sineInOut(seg(t, a0 + .1, .3)), og = powIn(seg(t, a0 + .42, .43), 2.2);
          yB = lerp(GONE, STACK_OUT, ob); yA = lerp(0, STACK_OUT, oa); rzA = lerp(0, -5, oa);
          const d = lerp(0, GONE - STACK_OUT, og); yB += d; yA += d;
        }
        stackY = yB;
        m0 = about(mid, [lift, 0, rzA], [0, yA, 0]);
      }
      // Drum: card 0 lands at a0 (last focus point if any, else card centre); each chain card aligns its anchor to a0
      const F = C0.focus && C0.focus.length ? C0.focus[C0.focus.length - 1] : null;
      const a0 = F ? L(C0, F[1], F[2]) : mid;
      const drumD = (i, anc) => { const ang = useDrum ? drumAngle(i, t) : 0, a = ang * D2R;
        return tr(a0.x, a0.y, a0.z).multiply(tr(0, R * Math.sin(a), -R * (1 - Math.cos(a)))).multiply(rotM([-ang, 0, 0])).multiply(tr(-anc.x, -anc.y, -anc.z)); };
      const gone = i => i < lastIdx && t > cards[i + 1].at + 1.0;                 // already rotated away
      // Card 0: rest x drum x enter x exit (exit applies to it when there is only one card)
      out.push({ M: REST.clone().multiply(drumD(0, a0)).multiply(m0).multiply(lastIdx === 0 ? exitM : new THREE.Matrix4()), op: gone(0) ? 0 : op, bri: lastIdx === 0 ? bri : 1 });
      for (let i = 1; i < cards.length; i++) {
        const c = cards[i], anc = L(c, ...(c.anchor || [c.w / 2, c.h / 2]));
        out.push({ M: REST.clone().multiply(drumD(i, anc)).multiply(i === lastIdx ? exitM : new THREE.Matrix4()), op: t > c.at && !gone(i) ? 1 : 0, bri: i === lastIdx ? bri : 1 });
      }
      // Stack
      if (stackY != null) {
        out.stack = [REST.clone().multiply(about(mid, [0, 0, 2.6], [-.03 * w, stackY - .06 * w, -24])), REST.clone().multiply(about(mid, [0, 0, -2.8], [.02 * w, stackY - .03 * w, -12]))];
      }
      // desk: the desk follows the paper plane
      if (deskMesh) {
        deskMesh.matrix.copy(REST).multiply(tr(0, -.2 * w, -3)); deskMesh.matrixWorldNeedsUpdate = true;
        const rz = exit && exit.kind === 'slide' && t >= exit.at ? rzDesk + 16 * powIn(seg(t, exit.at, exit.dur), 2.2) : rzDesk;
        out.desk = { rz };
      }
      return out;
    }

    function camAt(t) {
      let c = camFocus(t);
      if (enter && enter.kind === 'macro') {
        const r = logLerp(1 / 6, 1, powOut(seg(t, enter.at + .1, enter.dur - .1), 3));
        c = dolly(L(C0, tg.x, tg.y).applyMatrix4(REST), c, r);
      }
      if (exit && exit.kind === 'dive' && t >= exit.at) {
        const r = logLerp(1, 1 / 400, powIn(seg(t, exit.at, exit.dur), 1.6));
        c = dolly(L(C0, tg.x, tg.y).applyMatrix4(REST), c, r);
      }
      return c;
    }
    function current(t) { let i = 0; for (let j = 1; j < cards.length; j++) if (t >= cards[j].at + .5) i = j; return i; }

    function draw(g, t) {
      if (t >= cutAt) return;
      const cp = camAt(t);
      cam.position.copy(cp); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      const ps = pose(t, cp);
      cards.forEach((c, i) => {
        const p = ps[i] || { M: c.M, op: 0, bri: 1 };
        c.M.copy(p.M); c.mesh.matrix.copy(p.M); c.mesh.matrixWorldNeedsUpdate = true;
        const op = (p.op ?? 1) * (i === 0 && ps[0].vis != null ? ps[0].vis : 1);
        const u = c.mesh.material.uniforms; u.uOp.value = op; u.uBri.value = p.bri ?? 1;
        c.mesh.visible = op > .001 && (p.bri ?? 1) > .001;
        if (c.mesh.visible) {
          const k = c.key ? c.key(t) : String(Math.round(t * 60));
          if (k !== c.last) { c.g.setTransform(c.Q, 0, 0, c.Q, 0, 0); c.g.clearRect(0, 0, c.w, c.h); c.paint(c.g, t); c.tex.needsUpdate = true; c.last = k; }
        }
      });
      stack.forEach((m, i) => { const M = ps.stack ? ps.stack[i] : null; m.visible = !!M && ps[0].op > 0; if (M) { m.matrix.copy(M); m.matrixWorldNeedsUpdate = true; } });
      if (deskMesh && ps.desk) {
        const c = worldOf(C0, o.w / 2, o.h / 2).applyMatrix4(deskMesh.matrix.clone().invert());
        deskMesh.material.uniforms.uRect.value.set(c.x, c.y, o.w / 2, o.h / 2); deskMesh.material.uniforms.uRot.value = ps.desk.rz * D2R;
      }
      XM.drawGL(g, scene, cam);
      // Entrance / exit line (drawn in screen space; endpoints projected from the axis on the page)
      if (lineDraw) {
        const e0 = proj(worldOf(C0, 0, lineDraw.y)), e1 = proj(worldOf(C0, o.w, lineDraw.y));
        const cx = (e0[0] + e1[0]) / 2, cy = (e0[1] + e1[1]) / 2;
        g.save(); g.lineCap = 'round'; g.strokeStyle = lineDraw.color;
        if (lineDraw.kind === 'in' && lineDraw.a > 0) {
          g.globalAlpha *= lineDraw.a; g.lineWidth = 5; g.beginPath();
          g.moveTo(lerp(cx, e0[0], lineDraw.k), lerp(cy, e0[1], lineDraw.k)); g.lineTo(lerp(cx, e1[0], lineDraw.k), lerp(cy, e1[1], lineDraw.k)); g.stroke();
        }
        if (lineDraw.kind === 'out' && lineDraw.a > 0) {
          const u0 = proj(worldOf(C0, o.w * .1, lineDraw.y)), u1 = proj(worldOf(C0, o.w * .9, lineDraw.y)), mx = (u0[0] + u1[0]) / 2, my = (u0[1] + u1[1]) / 2;
          g.globalAlpha *= lineDraw.a; g.lineWidth = lerp(8, 16, lineDraw.kc); g.beginPath();
          g.moveTo(lerp(u0[0], mx, lineDraw.kc), lerp(u0[1], my, lineDraw.kc)); g.lineTo(lerp(u1[0], mx, lineDraw.kc), lerp(u1[1], my, lineDraw.kc)); g.stroke();
        }
        g.restore();
      }
    }
    function proj(v) { const q = v.clone().project(cam); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H, q.z]; }
    return {
      draw,
      project: (i, cx, cy) => proj(worldOf(cards[i], cx, cy)),
      page: current,
      cut: t => t >= cutAt,
      cards,
    };
  }
  XM.paper = paper;
})();
