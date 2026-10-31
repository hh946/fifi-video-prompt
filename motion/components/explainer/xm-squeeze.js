// XM.squeeze: a crowded flower field. In a dark field a glowing white hero flower lights up, then rows of similar
// flowers grow in, pack into cells and press tighter and tighter until the hero is squeezed small (it can grow back).
// By default there is no frame: the field fades irregularly into the stage (faint mist + sparse blurred flower shadows),
// using only the accent colour and white.
// Requires vendor/three.min.js (r158, global THREE), lib.js, xk.js, xm-core.js, xm-ds.js, loaded before this file.
// Docs: docs/components/squeeze.md
//
// Growth timing (bud-tip front, coverage line) follows measured reference curves, stretched onto crowd.at / flood / full
// with a piecewise-linear time map. The squeeze is real cell packing: every frame a power diagram (convex polygons) is
// solved and the hero's weight is bisected so its cell area matches the requested size. Grown dark flowers fill their
// own cells, so when the hero shrinks its neighbours take over the space instead of leaving gaps.
//
// XM.squeeze(o) -> { L, update, S, cues, times, hero(t), box }
// A visual frame only: field -> hero lights up -> peers fill in -> pressure builds -> hero squeezed. What the field, the
// hero and the peers stand for is up to the caller (write it with tag / notes / draw). There is no default text.
//   box   : { x, y, w, h } field area in the 1920x1080 frame (optional, default 700x800 at 250,140 on the left)
//   edge  : optional edge treatment. 'fade' (default) = no frame; the field fades out from the centre in an irregular,
//           slowly changing round shape (each direction fades at a different distance, no visible straight edges).
//           'box' = thin rectangular frame. Or { start, wobble, rx, ry, pad }: radius where fading starts (fraction,
//           default 0.5), per-direction variation (default 0.32), horizontal / vertical radius (fraction of box w / h,
//           default 0.56), how far the field extends past the box in px (default 200). The hero and its glow never fade.
//   hero  : required { at, x, y, r, from }: time the hero lights up; final position (0-1 inside the box, default 0.5 / 0.48);
//           petal radius in px (default 0.12 x box short side); where it grows from (0-1 inside the box, default
//           [0.5, 0.86] for fade, [0.5, 0.97] for box; the stem attaches here)
//   crowd : required { at, flood, full }: first peers appear -> flood starts (before that only a few sparse bottom rows) -> box full
//   heat  : optional { at, full, color }: pressure builds from at to full (flowers jostle, some small ones are squeezed out,
//           the rest grow to fill in). color is optional: if set, a pressure glow pushes in from the edges (do not use the
//           design system's warn red, it is reserved for verdicts). Without color there is only the motion, no glow (the
//           default; a red glow looks muddy, blue / white reads cleaner).
//   squeeze: optional [{ at, peak, release, dir, depth }]: the hero is squeezed from at, smallest at peak, grows back from
//           release (omit = stays squeezed). dir = screen direction the wedge opens toward (default [0, -1] = up: the
//           lower-left and lower-right neighbours close in and the hero becomes an inverted triangle pointing at its centre).
//           depth 0-1 = how hard (default 1 = about a quarter of the area left)
//   backdrop: optional background. Default { mist: true, mid: true, near: true }: a faint slowly drifting mist in the accent
//           colour (large soft shapes, bright near the hero, dark elsewhere); a few large blurred lotus shadows scattered
//           sparsely around the field (mid ground); large out-of-focus dark lotus shapes in three corners (foreground).
//           false = plain stage. Keep backgrounds large, sparse and soft; a dense repeated pattern of small shapes looks busy.
//   tag   : optional { text, at }: solid name tag at the top-left of the field (what the field represents)
//   notes : optional [string]: small monospace notes (e.g. "scale: 1 cell = ...")
//   draw  : optional (g, t, P, api) => {}: your own layer above the field and below the HUD (side numbers, callout labels...);
//           api.hero(t) returns the hero's on-screen position and size
//   colors: optional { accent, hero }: glow colour (default theme accent); hero petal colour (default off-white tinted to accent)
//   scale : optional flower size multiplier (default 1); seed optional
//   hud   : as in other XM components (you write the text)
// Timing (all from parameters, no default times): buds start 0.5 s before hero.at; the hero opens at hero.at (fully open
//   after 0.9 s); crowd.at -> flood only the bottom rows; flood -> full the box fills (front slow, then fast); heat.at -> full
//   pressure builds, flowers jostle and some small ones disappear; squeezes at the times you give.
// Sound cues: one land hit (XM.DS.SFX.land) at each squeeze peak. Add other sounds (counters, highlights) yourself.
// Rendering: a fragment shader draws the field per pixel (0.1-0.3 s per frame) on the shared renderer XM.gl();
//   render with the GPU enabled (CHROME_ARGS).
(() => {
  const { W, H } = XK;
  const DS = XM.DS;
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
  const interp = (tab, t) => {
    if (t <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) if (t <= tab[i][0]) { const [t0, v0] = tab[i - 1], [t1, v1] = tab[i]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0); }
    return tab[tab.length - 1][1];
  };
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rgb01 = hex => { const h = String(hex).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };

  // ============================================================ measured growth curves (reference time in s -> height in the box, 0 top / 1 bottom)
  // Measured on a panel spanning y 99-1341: highest bud tip, and the line below which dark flowers cover everything
  const OY0 = 99, OH = 1242, ON = v => (v - OY0) / OH;
  const TIP_O = [[0.0, 1248], [0.2, 1186], [0.4, 1053], [0.6, 982], [0.8, 895], [1.0, 775], [1.2, 679], [1.4, 611], [1.6, 510], [1.8, 411],
    [1.9, 311], [2.0, 266], [2.2, 205], [2.4, 150], [2.6, 124], [2.8, 120], [2.9, 104]].map(([t, y]) => [t, ON(y)]);
  const COVER_O = [[0.0, 1520], [0.45, 1400], [0.9, 1280], [1.2, 1150], [1.4, 960], [1.5, 925], [1.7, 846], [1.8, 744], [2.0, 624], [2.2, 562],
    [2.4, 457], [2.6, 391], [2.8, 251], [3.0, 135], [3.2, 60]].map(([t, y]) => [t, ON(y)]);
  function coverInvO(v) {               // reference time at which the coverage line passes height v
    for (let i = 1; i < COVER_O.length; i++) {
      const [t0, y0] = COVER_O[i - 1], [t1, y1] = COVER_O[i];
      if (v >= y1) return y0 === y1 ? t0 : t0 + (t1 - t0) * (y0 - v) / (y0 - y1);
    }
    return COVER_O[COVER_O.length - 1][0];
  }
  // pressure glow strength over heat progress 0-1; accent glow vs. coverage
  const RED_N = [[0, 0.05], [0.2, 0.08], [0.29, 0.16], [0.39, 0.3], [0.49, 0.45], [0.59, 0.6], [0.68, 0.7], [0.78, 0.8], [0.88, 0.86], [1, 0.95]];
  const BLUE_F = [[0, 0.45], [0.3, 0.5], [0.5, 0.64], [0.7, 0.73], [0.9, 0.83], [1, 0.9]];

  // ============================================================ field shader (lengths scaled by uK, colours from uniforms)
  const VS = `out vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const FS = `
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uF; uniform sampler2D uG; uniform int uGW; uniform int uGH;
uniform sampler2D uSprout; uniform sampler2D uTop;
uniform float uT; uniform vec2 uW; uniform float uWs; uniform float uBlue; uniform float uRed; uniform float uBlueMask;
uniform float uGapD; uniform float uGapW; uniform vec4 uSL; uniform float uRimI; uniform float uK; uniform float uHU;
uniform vec3 uAcc; uniform vec3 uHeat; uniform vec3 uHero; uniform float uEdge;
uniform vec4 uBox; uniform vec3 uFade; uniform float uSeed; uniform vec3 uBg; uniform vec2 uCtr; uniform vec2 uRad;
in vec2 vUv;
layout(location = 0) out highp vec4 outColor;
#define TAU 6.28318530718
#define GS 48.0
float sst(float a, float b, float x) { float k = clamp((x - a) / (b - a), 0.0, 1.0); return k * k * (3.0 - 2.0 * k); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
vec4 F(int i, int k) { return texelFetch(uF, ivec2(k, i), 0); }
uint hsh(uvec3 v) { v = v * 1664525u + 1013904223u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; v ^= v >> 16u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; return v.x; }
float h3(vec3 p) { return float(hsh(uvec3(ivec3(floor(p)) + 4096))) / 4294967295.0; }
float vnoise(vec3 x) { vec3 i = floor(x), f = fract(x); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h3(i), h3(i + vec3(1, 0, 0)), u.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), u.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z); }
float fbm(vec3 x) { return 0.55 * vnoise(x) + 0.3 * vnoise(vec3(2.1 * x.xy + vec2(5.2, 1.3), 1.7 * x.z)) + 0.15 * vnoise(vec3(4.3 * x.xy + vec2(9.1, 7.7), 2.9 * x.z)); }
// fade-mode boundary: ellipse around uCtr with radii uRad, scaled per direction by low-frequency noise (each direction fades at a different, slowly changing distance), plus fine wobble.
// Returns normalised radius: 1 ~ boundary in that direction
float rEdge(vec2 p) {
  vec2 q = (p - uCtr) / uRad; float th = atan(q.y, q.x);
  float n = (fbm(vec3(cos(th) * 1.3 + uSeed, sin(th) * 1.3 - uSeed * 0.7, uT * 0.035)) - 0.5) * 2.0 * uFade.y;
  float fine = (fbm(vec3(p / (90.0 * uK) + uSeed * 1.7, uT * 0.04)) - 0.5) * 0.12;
  return length(q) / max(0.4, 1.0 + n) + fine;
}
float blueFall(float d) { return clamp(exp(-pow(d / (280.0 * uK), 2.0)) * 0.95 + exp(-d / (300.0 * uK)) * 0.10, 0.0, 1.0); }
void main() {
  vec2 p = vec2(uSL.x + vUv.x * uSL.z, uSL.y + (1.0 - vUv.y) * uSL.w);
  vec2 fw2 = fwidth(p);
  float aa = clamp(max(fw2.x, fw2.y), 0.05, 40.0);
  // ---- light: accent glows out from the hero; pressure colour pushes in from the edges in patches
  float dW = length(p - uW);
  float bl = uBlue * blueFall(dW);
  // edge: box mode = distance to the box edge; fade mode = distance to a noisy rounded boundary (positive inside), fading into the stage beyond it
  float e, alpha = 1.0, edgeK = 1.0, apx = 1.0;
  float rr = 0.0;
  if (uFade.x > 0.0) {
    rr = rEdge(p);
    e = (0.95 - rr) * min(uRad.x, uRad.y);                     // distance to the boundary (px, positive inside): the pressure glow pushes in from here
    apx = 1.0 - sst(uFade.x, 1.12, rr);                        // fade outward in rings: starts at radius start, gone past the boundary
    alpha = apx;
    float qe = min(min(p.x - uSL.x, uSL.x + uSL.z - p.x), min(p.y - uSL.y, uSL.y + uSL.w - p.y));
    edgeK = sst(0.0, 24.0, qe) * uEdge;                       // whole field fades in at the start; zero at the outer edge of the drawn area
    alpha *= edgeK;
  } else {
    e = min(min(p.x - uBox.x, uBox.x + uBox.z - p.x), min(p.y - uBox.y, uBox.y + uBox.w - p.y));
  }
  float Lb = mix(30.0, 175.0, sst(0.24, 1.0, uHU)) * uK;
  float corner = exp(-length(p - uBox.xy - uBox.zw) / (230.0 * uK)) * sst(-0.1, 0.2, uHU) * 0.8;
  float band = exp(-max(e - (uFade.x > 0.0 ? 0.12 * min(uRad.x, uRad.y) : 0.0), 0.0) / Lb) + (uFade.x > 0.0 ? 0.0 : corner);   // fade: pressure glow sits on the ring where flowers are still visible
  float nz = fbm(vec3(p / (150.0 * uK), uT * 0.9));
  float patchy = clamp((nz - 0.33) * 2.6, 0.0, 1.0);
  float mask = mix(1.0, sst(190.0 * uK, 430.0 * uK, dW), uBlueMask);
  float rd = clamp(uRed * band * patchy * 1.25 * mask, 0.0, 1.0);
  float core = 0.5 * uBlue * exp(-pow(dW / (uWs * 1.3), 2.0));
  vec3 col = uBg + bl * 1.3 * uAcc + rd * 0.33 * uHeat + core * vec3(70.0, 90.0, 120.0) / 255.0;   // fade mode: empty areas = stage colour, so no dark patch shows while fading
  vec4 sp = texture(uSprout, vUv);
  col = mix(col, sp.rgb, sp.a);
  // ---- which flower owns this pixel (smallest power distance, within that flower's reach)
  ivec2 gc = clamp(ivec2((p - uSL.xy) / GS), ivec2(0), ivec2(uGW - 1, uGH - 1));
  int row = gc.y * uGW + gc.x;
  int best = -1; float bp = 1e20; bool done = false;
  for (int t = 0; t < 12; t++) {
    if (done) break;
    vec4 ids = texelFetch(uG, ivec2(t, row), 0);
    for (int c = 0; c < 4; c++) {
      float fi = ids[c];
      if (fi < 0.0) { done = true; break; }
      int i = int(fi + 0.5);
      vec4 a0 = F(i, 0), a1 = F(i, 1);
      vec2 dq = p - a1.xy; float rr = a0.w + aa;
      if (dot(dq, dq) > rr * rr) continue;
      vec2 ds = p - a0.xy; float pw = dot(ds, ds) - a0.z * a0.z;
      if (pw < bp) { bp = pw; best = i; }
    }
  }
  if (best >= 0) {
    vec4 A0 = F(best, 0), A1 = F(best, 1), A2 = F(best, 2), A3 = F(best, 3), A4 = F(best, 4);
    bool white = A4.z > 0.5;
    float dc = 1e5; bool done2 = false;
    for (int t = 0; t < 12; t++) {
      if (done2) break;
      vec4 ids = texelFetch(uG, ivec2(t, row), 0);
      for (int c = 0; c < 4; c++) {
        float fj = ids[c];
        if (fj < 0.0) { done2 = true; break; }
        int j = int(fj + 0.5);
        if (j == best) continue;
        vec4 b0 = F(j, 0), b1 = F(j, 1);
        vec2 dd = b0.xy - A0.xy; float len = length(dd);
        if (len < 1e-3) continue;
        float pa = dot(p - A0.xy, p - A0.xy) - A0.z * A0.z;
        float pb = dot(p - b0.xy, p - b0.xy) - b0.z * b0.z;
        float bis = (pb - pa) / (2.0 * len);
        float outJ = length(p - b1.xy) - b1.z * 1.06 - 1.0;
        float gap = (white || F(j, 4).z > 0.5) ? uGapW : uGapD;
        float dj = max(bis, outJ + 0.5 * gap) - 0.5 * gap;
        if (dj > 60.0) continue;
        dc = smin(dc, dj, 12.0);
      }
    }
    vec2 C = A1.xy; float s = max(A1.z, 1.0), rot = A1.w;
    float n = A2.x, curl = A2.y, open = A2.z, fan = A2.w;
    vec2 v = p - C; float r = length(v); float th = atan(v.y, v.x);
    float rho = clamp(r / s, 0.0, 1.0);
    float phi = th + curl * pow(1.0 - rho, 1.4) - rot;
    float stepA = TAU / n, span = stepA * fan;
    float rr0 = mod(phi, TAU);
    float ds, mk = 1.0, uu = 0.5; bool leading = true; bool inGap = rr0 > n * span;
    float kk = floor(rr0 / span);
    if (inGap) { ds = -min(rr0 - n * span, TAU - rr0) * r; }
    else {
      float rel = rr0 - kk * span; uu = rel / span;
      ds = min(rel, span - rel) * r; leading = rel < 0.5 * span;
      int k = int(kk);
      mk = k == 0 ? A3.x : k == 1 ? A3.y : k == 2 ? A3.z : k == 3 ? A3.w : k == 4 ? A4.x : A4.y;
      float ok = clamp(open * 1.25 - kk * 0.05, 0.0, 1.0);
      mk *= 0.55 + 0.45 * ok;
    }
    float lobe = white ? 0.2 : 0.1;
    float dnat = s * mk * ((1.0 - lobe) + lobe * sqrt(max(sin(3.14159265 * uu), 0.0))) - r;
    float bulge = (white ? 4.0 : 3.0) * sqrt(max(sin(3.14159265 * uu), 0.0)) * clamp(open * 1.5, 0.0, 1.0);
    float notch = (white ? 7.0 : 5.0) * (1.0 - sqrt(max(sin(3.14159265 * uu), 0.0))) * clamp(open * 1.5, 0.0, 1.0);
    float dout = smin(dc + bulge - notch, dnat, 8.0);
    if (inGap) dout = min(dout, ds);
    float seamHalf = white ? mix(1.9, 1.2, A4.w) : mix(0.5, 3.4, pow(rho, 1.3));
    float dsm = ds - seamHalf;
    float dpet = smin(dout, dsm, white ? mix(8.0, 4.0, A4.w) : 9.0);
    float covF = smoothstep(-0.5 * aa, 0.5 * aa, dout);
    float covP = smoothstep(-0.5 * aa, 0.5 * aa, dpet);
    bool seamSide = dsm < dout;
    float rimK = white ? 0.0 : clamp(uRimI * (exp(-pow(dW / (230.0 * uK), 2.0)) + 0.15 * exp(-dW / (320.0 * uK))), 0.0, 1.0);
    float lw = mix(0.5, 0.95, rimK);
    float line = 1.0 - smoothstep(lw - 0.5 * aa, lw + 0.5 * aa, abs(dpet - 1.25));
    float cr = (white ? min(8.0, s * 0.13) : min(7.0, s * 0.12)) * clamp((open - 0.2) * 2.0, 0.0, 1.0);
    float bk = clamp(bl * 1.3, 0.0, 1.0);
    if (uFade.x > 0.0 && !white) {               // flowers near the edge fade as a whole, by their centre position, so the edge breaks up flower by flower
      float vis = 1.0 - sst(uFade.x - 0.08, 1.0, rEdge(C));
      float jit = 0.7 + 0.3 * fract(sin(float(best) * 7.13) * 4375.85);          // per-flower variation keeps the edge ragged
      alpha = mix(alpha, apx * mix(1.0, vis * jit, 0.6) * edgeK, covF);           // inside a flower the outer side is also fainter (per pixel), times the per-flower fade
    }
    if (white) {
      vec3 base = uAcc * 0.56;
      float g = clamp(r / (s * 1.1), 0.0, 1.0);
      vec3 fill = mix(mix(mix(uHero, uAcc, 0.14), mix(uHero, uAcc, 0.07), smoothstep(0.0, 0.5, g)), mix(uHero, uAcc, 0.045), smoothstep(0.5, 1.0, g));
      vec3 rim = mix(vec3(1.0), uAcc, 0.33);
      col = mix(col, base, covF);
      col = mix(col, mix(fill, rim, line * 0.9), covP);
      if (cr > 0.5) {
        float dots = 1e5;
        for (int i = 0; i < 6; i++) { float an = rot + float(i) * TAU / 6.0; dots = min(dots, length(p - C - cr * 0.65 * vec2(cos(an), sin(an)))); }
        dots = min(dots, r);
        col = mix(col, uAcc * 0.68, (1.0 - smoothstep(1.25 - 0.5 * aa, 1.25 + 0.5 * aa, dots)) * covF);
      }
    } else {
      vec3 seamC = vec3(3.0, 3.0, 5.0) / 255.0;
      float g = clamp(r / s, 0.0, 1.0);
      float pv = fract(sin(float(best) * 12.9898 + kk * 78.233) * 43758.5453);
      float inside = max(dpet, 0.0);
      float edgeL = exp(-inside / 14.0);
      vec3 fill = (mix(vec3(4.0, 4.0, 6.0), vec3(14.0, 14.0, 17.0), pow(g, 0.8)) * (0.82 + 0.36 * pv) + vec3(4.0) * edgeL * g) / 255.0 + bl * uAcc * 0.04;
      fill += bl * 0.16 * exp(-inside / 9.0) * uAcc;
      float rg = pow(rd, 1.6) * 0.8;
      fill += rg * exp(-inside / 11.0) * uHeat;
      vec3 rimC = mix(vec3(56.0, 56.0, 62.0) / 255.0, mix(vec3(1.0), uAcc, 0.06), max(bk * 0.8, rimK));
      rimC = mix(rimC, mix(vec3(0.24), uHeat, 0.5), clamp(rd * rd * 0.8, 0.0, 1.0) * (1.0 - bk));
      float lk = seamSide ? (leading ? mix(0.4, 0.95, rimK) : mix(0.12, 0.7, rimK)) : 1.0;
      lk *= clamp(open * 2.0, 0.0, 1.0);
      if (uFade.x > 0.0) lk *= pow(apx, 1.8);                                      // outlines fade faster than fills: contours disappear toward the edge
      col = mix(col, seamC, covF);
      col = mix(col, mix(fill, rimC, line * lk), covP);
      if (cr > 0.5) {
        float dcen = r - cr;
        col = mix(col, vec3(10.0, 10.0, 12.0) / 255.0 + bl * uAcc * 0.05, (1.0 - smoothstep(-0.5 * aa, 0.5 * aa, dcen)) * covF);
        float dots = 1e5;
        for (int i = 0; i < 7; i++) { float an = rot + float(i) * TAU / 7.0; dots = min(dots, length(p - C - cr * 0.85 * vec2(cos(an), sin(an)))); }
        dots = min(dots, r);
        vec3 dotC = vec3(92.0, 92.0, 100.0) / 255.0 + bl * mix(vec3(0.3), uAcc, 0.4);
        float dk = clamp((open - 0.2) * 2.0, 0.0, 1.0) * covF;
        col += dotC * 0.18 * exp(-dots * dots / 6.0) * dk;
        col = mix(col, dotC, (1.0 - smoothstep(1.35 - 0.6 * aa, 1.35 + 0.6 * aa, dots)) * dk);
      }
    }
  }
  vec4 tp = texture(uTop, vUv);
  col = mix(col, tp.rgb, tp.a);
  if (uFade.x > 0.0) {                                          // the hero and its glow do not fade, so it stays visible near the edge (the stem fades with the field and grows up out of the dark)
    float lit = clamp((bl * 1.3 + core) * 1.15, 0.0, 1.0);
    alpha = max(alpha, lit * edgeK);
    if (best >= 0 && F(best, 4).z > 0.5) alpha = max(alpha, edgeK);
  }
  if (uFade.x <= 0.0) col = mix(col, mix(vec3(118.0, 112.0, 116.0) / 255.0, mix(vec3(0.46), uHeat, 0.35), clamp(uRed, 0.0, 1.0) * 0.5) * uEdge, 1.0 - smoothstep(1.1 - 0.5 * aa, 1.1 + 0.5 * aa, e));
  outColor = vec4(col * alpha, alpha);   // premultiplied alpha: faded areas show the stage
}`;

  // ============================================================ mist (large low-frequency noise drifting slowly; lit near the hero)
  const BG_FS = `
precision highp float;
uniform vec2 uRes; uniform float uT; uniform vec2 uW; uniform float uBlue; uniform vec3 uAcc; uniform vec3 uBg; uniform float uK; uniform float uIn; uniform vec2 uDrift;
in vec2 vUv;
layout(location = 0) out highp vec4 outColor;
float h3(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 x) { vec3 i = floor(x), f = fract(x); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h3(i), h3(i + vec3(1, 0, 0)), u.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), u.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z); }
float fbm(vec3 x) { return 0.55 * vnoise(x) + 0.3 * vnoise(x * 2.03 + 5.1) + 0.15 * vnoise(x * 4.1 + 9.7); }
void main() {
  vec2 p = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  float n = fbm(vec3((p + uDrift) / 560.0, uT * 0.05)), n2 = fbm(vec3((p - uDrift * 1.4) / 300.0 + 3.7, uT * 0.07));
  float m = smoothstep(0.3, 0.85, 0.7 * n + 0.3 * n2);              // wisps of mist
  float dW = length(p - uW);
  float lit = uBlue * (exp(-pow(dW / (600.0 * uK), 2.0)) * 0.9 + exp(-dW / (850.0 * uK)) * 0.25);
  vec2 cq = (p - uW) / (0.55 * uRes);
  float vig = 1.0 - 0.8 * smoothstep(0.25, 1.0, length(cq * vec2(0.9, 1.0)));
  vec3 col = uBg + uAcc * (0.045 * m * (0.35 + 1.4 * lit) * vig + 0.07 * lit * lit) + vec3(0.012) * m * vig;
  outColor = vec4(mix(uBg, col, uIn), 1.0);
}`;

  // ============================================================ power-diagram cells (squeeze physics)
  function clipHalf(poly, ax, ay, c) {
    const out = [], n = poly.length;
    for (let i = 0; i < n; i++) {
      const P = poly[i], Q = poly[(i + 1) % n];
      const dp = ax * P[0] + ay * P[1] - c, dq = ax * Q[0] + ay * Q[1] - c;
      if (dp <= 0) out.push(P);
      if ((dp <= 0) !== (dq <= 0)) { const k = dp / (dp - dq); out.push([P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k]); }
    }
    return out;
  }
  const DISC = Array.from({ length: 48 }, (_, i) => [Math.cos(i * TAU / 48), Math.sin(i * TAU / 48)]);
  function clipDisc(poly, cx, cy, r) {
    for (let i = 0; i < 48 && poly.length >= 3; i++) { const [ux, uy] = DISC[i]; poly = clipHalf(poly, ux, uy, ux * cx + uy * cy + r * Math.cos(Math.PI / 48)); }
    return poly;
  }
  function area(poly) { let A = 0; for (let i = 0, n = poly.length; i < n; i++) { const P = poly[i], Q = poly[(i + 1) % n]; A += P[0] * Q[1] - Q[0] * P[1]; } return Math.abs(A) / 2; }
  const farthest = (poly, cx, cy) => poly.reduce((m, P) => Math.max(m, Math.hypot(P[0] - cx, P[1] - cy)), 0);

  const MAXF = 768, TEXW = 5, GSZ = 48, GPER = 48;

  function squeeze(o = {}) {
    const fail = m => console.error('XM.squeeze: ' + m);
    if (!o.hero || o.hero.at == null) fail('hero.at is required (when the hero lights up)');
    if (!o.crowd || o.crowd.at == null || o.crowd.flood == null || o.crowd.full == null) fail('crowd.at / flood / full are required (when the crowd appears / floods in / fills the frame)');
    const P = DS.tone(o.tone || 'ink');
    const B = Object.assign({ x: 250, y: 140, w: 700, h: 800 }, o.box || {});
    const X0 = B.x, Y0 = B.y, X1 = B.x + B.w, Y1 = B.y + B.h;
    const EDGE = o.edge === 'box' ? null : Object.assign({ start: 0.5, wobble: 0.32, rx: 0.56, ry: 0.56, pad: 200 }, typeof o.edge === 'object' ? o.edge : {});
    const PADQ = EDGE ? EDGE.pad : 0;                                // how far the field extends past the box (the fade band lives here)
    const QX0 = X0 - PADQ, QY0 = Y0 - PADQ, QW = B.w + 2 * PADQ, QH = B.h + 2 * PADQ, QX1 = QX0 + QW, QY1 = QY0 + QH;
    const KS = o.scale || 1;                                         // flower size
    const UK = clamp(Math.sqrt(B.w * B.h / (881 * 1242)), 0.6, 1.0); // glow radius scales with the box size
    const at0 = o.at != null ? o.at : Math.min(o.hero.at, o.crowd.at) - 0.6;
    const HE = Object.assign({ x: 0.5, y: 0.48, from: [0.5, o.edge === 'box' ? 0.97 : 0.86] }, o.hero);
    HE.r = HE.r || 0.12 * Math.min(B.w, B.h);
    const CR = o.crowd, HT = o.heat || null;
    const SQ = (o.squeeze || []).map(e => Object.assign({ dir: [0, -1], depth: 1 }, e));
    const ACC = (o.colors && o.colors.accent) || XK.col('accent') || P.accent;
    const HERO_C = (o.colors && o.colors.hero) || '#f4f5ff';
    const HEAT_C = HT && HT.color ? HT.color : '#000000';
    const R0 = rng(o.seed || 20261015);
    const cues = SQ.map(e => ({ t: +e.peak.toFixed(3), name: DS.SFX.land, gain: .55 }));
    const BD = o.backdrop === false ? null : Object.assign({ mist: true, mid: true, near: true }, typeof o.backdrop === 'object' ? o.backdrop : {});

    // ---------- time map: reference time <-> scene time (piecewise linear, knots at reference 0 / 0.45 / 1.0 / 3.2 s)
    const KN = [[0, CR.at - 0.5 * Math.max(0.6, (CR.flood - CR.at) / 0.55 * 0.45)], [0.45, CR.at], [1.0, CR.flood], [3.2, CR.full], [8, CR.full + 4.8 * (CR.full - CR.flood) / 2.2]];
    const warp = to => interp(KN, to);
    const unwarp = t => interp(KN.map(([a, b]) => [b, a]), t);
    const rate = to => { const a = warp(to - 0.05), b = warp(to + 0.05); return clamp((b - a) / 0.1, 0.5, 3); };
    const fillU = t => clamp((unwarp(t) - 0.3) / 2.9);
    const heatU = t => HT ? clamp((t - HT.at) / (HT.full - HT.at)) : 0;
    const blueI = t => sstep(HE.at - 0.02, HE.at + 0.95, t) * interp(BLUE_F, fillU(t)) * (1 - 0.1 * heatU(t));
    const redI = t => HT && HT.color && t > HT.at ? interp(RED_N, heatU(t)) : 0;   // no colour given = no pressure glow
    const whiteRot = t => -0.6 * (t - HE.at) + 0.4;
    const gapD = t => lerp(14, 8, sstep(0.24, 0.9, fillU(t))) * KS;
    const gapW = t => lerp(20, 11, sstep(0.24, 0.9, fillU(t))) * KS;
    function squeezeAt(t) {
      let k = 0, dir = [0, -1];
      for (const e of SQ) {
        const v = e.depth * sstep(e.at, e.peak, t) * (e.release != null ? 1 - sstep(e.release, e.release + 0.4, t) : 1);
        if (v > k) { k = v; dir = e.dir; }
      }
      const L = Math.hypot(dir[0], dir[1]) || 1;
      return { k, dir: [dir[0] / L, dir[1] / L] };
    }
    // hero: grows up from the bottom edge, following the coverage line to its rest position
    const heroPos = t => {
      const u = sstep(HE.at + 0.2, CR.full + 0.3, t);
      const fx = lerp(HE.from[0], HE.x, u), fy = lerp(HE.from[1], HE.y, Math.pow(u, 0.85));
      const wob = sstep(HE.at, HE.at + 1, t);
      return [X0 + B.w * fx + 4 * Math.sin(t * 1.3) * wob, Y0 + B.h * fy + 3 * Math.cos(t * 1.1) * wob];
    };
    const heroOpen = t => easeOut((t - HE.at - 0.02) / 0.85);
    const heroR = t => { const s = squeezeAt(t); return HE.r * (0.18 + 0.82 * heroOpen(t)) * (1 - 0.5 * s.k); };   // area shrinks to about a quarter

    // ---------- flower layout (fixed seed)
    const FL = [];
    (() => {
      const nTry = Math.round(1400 * (QW * QH) / (881 * 1242)), sizes = [];
      for (let i = 0; i < nTry; i++) { const u = R0(); sizes.push(KS * 0.86 * (u < 0.18 ? lerp(70, 86, R0()) : u < 0.72 ? lerp(50, 70, R0()) : lerp(30, 50, R0()))); }
      sizes.sort((a, b) => b - a);
      for (const R of sizes) for (let k = 0; k < 60; k++) {
        const x = lerp(QX0 - 30, QX1 + 30, R0()), y = lerp(QY0 - 30, QY1 + 20, R0());
        let ok = true; for (const g of FL) { if (Math.hypot(g.x - x, g.y - y) < 0.80 * (g.R + R)) { ok = false; break; } }
        if (ok) { FL.push({ x, y, R }); break; }
      }
      for (const f of FL) {
        const u = R0();
        f.n = u < 0.1 ? 4 : u < 0.9 ? 5 : 6; f.rot = R0() * TAU; f.spin = (R0() - 0.5) * 0.4;
        f.m = Array.from({ length: 6 }, () => lerp(0.9, 1.08, R0())); f.curl = lerp(0.5, 0.85, R0());
        const to = coverInvO(clamp((f.y - Y0) / B.h, -0.4, 1.3)), sc = rate(to);
        f.birth = warp(to) - 0.35 * sc + (R0() - 0.5) * 0.4 * sc; f.bloom = 0.55 * Math.min(1.6, sc);
        f.sprout = R0() < 0.22; f.tipOff = Math.pow(R0(), 1.1) * 380 * (B.h / OH);
        f.bx = f.x + (R0() - 0.5) * 90; f.amp = lerp(16, 40, R0()); f.lam = lerp(170, 320, R0()); f.ph = R0() * TAU; f.sway = lerp(0.6, 1.4, R0()); f.wob = R0() * TAU;
        f.lose = R0() < 0.18 + 0.3 * clamp((60 * KS - f.R) / (30 * KS)); f.dieU = lerp(0.37, 0.78, R0());
      }
    })();
    const SPR = [];
    (() => { const R1 = rng((o.seed || 7) + 77); const n = Math.round(9 * B.w / 881);
      for (let i = 0; i < n; i++) { const x = lerp(X0 + 10, X1 - 10, R1());
        SPR.push({ x, y: lerp(Y0 + 20, Y0 + 300 * B.h / OH, R1()), bx: x + (R1() - 0.5) * 80, tipOff: Math.pow(R1(), 1.1) * 300 * B.h / OH,
          amp: lerp(16, 40, R1()), lam: lerp(170, 320, R1()), ph: R1() * TAU, sway: lerp(0.6, 1.4, R1()) }); } })();

    // ---------- per-frame state (power cells solved by area)
    const BOX = [[QX0 - 40, QY0 - 40], [QX1 + 40, QY0 - 40], [QX1 + 40, QY1 + 40], [QX0 - 40, QY1 + 40]];
    function powerCell(a, wa, nb) {
      let poly = BOX;
      for (const b of nb) { if (b === a) continue;
        const ax = b.sx - a.sx, ay = b.sy - a.sy, c = (b.sx * b.sx + b.sy * b.sy - a.sx * a.sx - a.sy * a.sy - b.wr * b.wr + wa * wa) / 2;
        poly = clipHalf(poly, ax, ay, c); if (poly.length < 3) return []; }
      return poly;
    }
    let CACHE = { t: NaN };
    function states(t) {
      if (CACHE.t === t) return CACHE;
      const [wx, wy] = heroPos(t), sq = squeezeAt(t), hu = heatU(t);
      const wOpen = heroOpen(t);
      const Rt = heroR(t);
      const off = sq.k * Rt * 0.9;
      const site = [wx, wy], C = [wx - sq.dir[0] * off, wy - sq.dir[1] * off];
      let Wd = null;
      if (t >= HE.at) {
        const rot0 = whiteRot(t) - (1 - wOpen) * 1.6, fan0 = 0.32 + 0.68 * wOpen;
        const half = 1.55, th = Math.atan2(sq.dir[1], sq.dir[0]);
        const fanS = (2 * half) / TAU, rotS = th - half;
        let dr = ((rotS - rot0) % TAU + TAU) % TAU; if (dr > Math.PI) dr -= TAU;
        Wd = { white: true, x: C[0], y: C[1], sx: site[0], sy: site[1], s: Math.max(4, Rt), wr: Rt, sN: Rt, n: 6, sq: sq.k,
          rot: rot0 + dr * sq.k, m: [1, 0.97, 1.03, 0.98, 1.02, 0.99], curl: lerp(0.75, 0.5, sq.k), open: wOpen, fan: lerp(fan0, fanS, sq.k) };
      }
      const crowd = 1 + 0.10 * sstep(0.29, 0.88, hu), jost = 0.4 + 2.4 * sstep(0.29, 0.73, hu);
      const S = [];
      for (const f of FL) {
        const ob = (t - f.birth) / f.bloom;
        if (ob <= 0) continue;
        const open = easeOut(ob);
        let x = f.x + 2.0 * Math.sin(t * 2.3 + f.wob) * jost, y = f.y + 2.0 * Math.cos(t * 2.0 + f.wob * 1.3) * jost;
        const fate = f.lose ? 1 - sstep(f.dieU, f.dieU + 0.22, hu) : 1 + 0.32 * sstep(0.29, 0.83, hu);
        if (fate < 0.02) continue;
        const s = f.R * (0.2 + 0.8 * open) * (1.0 + 0.36 * sstep(0, 1.4 * f.bloom / 0.55, t - f.birth)) * crowd * fate;
        if (Wd) {
          let dx = x - site[0], dy = y - site[1], d = Math.hypot(dx, dy) + 1e-6;
          const reach = Rt + 0.55 * s;
          if (d < reach) { const nd = reach - (reach - d) * 0.25; x = site[0] + dx / d * nd; y = site[1] + dy / d * nd; }
          if (sq.k > 0 && d < (Rt + s) * 2.4) {          // squeezed: lower-left / lower-right flowers close toward the centre line and push upward
            const ux = dx / d, uy = dy / d, ca = ux * sq.dir[0] + uy * sq.dir[1];
            const lowSide = clamp(1 - Math.abs(ca + 0.45) / 0.6);
            const px = -sq.dir[1], py = sq.dir[0], sgn = Math.sign(ux * px + uy * py) || 1;
            const m = sq.k * lowSide * 0.45 * (Rt + s);
            x -= px * sgn * m; y -= py * sgn * m; x += sq.dir[0] * m * 0.5; y += sq.dir[1] * m * 0.5;
          }
          dx = x - C[0]; dy = y - C[1]; d = Math.hypot(dx, dy) + 1e-6;
          const dmin = lerp(0.45 * Rt + 0.6 * s, 0.25 * Rt + 0.55 * s, sq.k);
          if (d < dmin) { x = C[0] + dx / d * dmin; y = C[1] + dy / d * dmin; }
        }
        S.push({ x, y, sx: x, sy: y, s, sg: s, wr: s, pack: sstep(0.4, 1.4, (t - f.birth) * 0.55 / f.bloom) * Math.min(1, fate), n: f.n,
          rot: f.rot + f.spin * (t - at0) * (1 + 1.5 * sstep(0.29, 0.73, hu)) - (1 - open) * 1.1, m: f.m, curl: f.curl, open, fan: 0.32 + 0.68 * open });
      }
      if (Wd) S.unshift(Wd);
      const G = new Map(), GS = 96, key = (i, j) => i * 4096 + j;
      for (const a of S) { const k = key(Math.floor(a.sx / GS), Math.floor(a.sy / GS)); if (!G.has(k)) G.set(k, []); G.get(k).push(a); }
      const near = (a, R) => { const out = [], i0 = Math.floor((a.sx - R) / GS), i1 = Math.floor((a.sx + R) / GS), j0 = Math.floor((a.sy - R) / GS), j1 = Math.floor((a.sy + R) / GS);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const Lq = G.get(key(i, j)); if (Lq) for (const b of Lq) if (b !== a && Math.hypot(b.sx - a.sx, b.sy - a.sy) < R) out.push(b); }
        return out; };
      if (Wd) {
        const nbW = near(Wd, Rt * 3 + 240), A = Math.PI * (Rt + gapW(t) / 2) ** 2, sCap = Rt * (1.25 + 1.2 * sq.k) + 6;
        const areaAt = wv => area(clipDisc(powerCell(Wd, wv, nbW), C[0], C[1], sCap));
        let lo = 0, hi = Rt * 3 + 40;
        if (areaAt(hi) <= A) lo = hi; else for (let it = 0; it < 26; it++) { const mid = (lo + hi) / 2; if (areaAt(mid) < A) lo = mid; else hi = mid; }
        Wd.wr = lo;
        Wd.s = Math.max(4, Math.min(sCap, farthest(clipDisc(powerCell(Wd, lo, nbW), C[0], C[1], sCap), C[0], C[1]) * 1.04));
      }
      for (const a of S) {
        if (a.white || a.pack <= 0.001) continue;
        const poly = powerCell(a, a.wr, near(a, a.sg * 2 + 260));
        if (poly.length < 3) continue;
        a.s = lerp(a.sg, clamp(farthest(poly, a.x, a.y) * 1.08, a.sg, a.sg * 2.6), a.pack);
      }
      CACHE = { t, S, W: Wd, w: { x: wx, y: wy, r: Rt }, C };
      return CACHE;
    }

    // ---------- stems (Canvas 2D layer)
    const TS = 1.5, TW = Math.round(QW * TS), TH = Math.round(QH * TS);
    const mkLayer = () => { const c = document.createElement('canvas'); c.width = TW; c.height = TH; return { c, x: c.getContext('2d') }; };
    const TIPq = t => Y0 + B.h * interp(TIP_O, unwarp(t));
    const rgba = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
    function stemPath(x, f, ty, t) {
      const by = QY1 + 4, Hh = Math.max(1, by - f.y);
      const Xf = y => { const u = clamp((by - y) / Hh); return lerp(f.bx, f.x, u) + f.amp * Math.sin(Math.PI * Math.min(1, u * 1.15)) * Math.sin(TAU * y / f.lam + f.ph + t * f.sway * 0.12); };
      const N = Math.max(3, Math.ceil((by - ty) / 22));
      x.moveTo(Xf(by), by); for (let i = 1; i <= N; i++) { const y = lerp(by, ty, i / N); x.lineTo(Xf(y), y); }
      return Xf(ty);
    }
    function drawSprouts(L, t) {
      const x = L.x; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, TW, TH);
      x.setTransform(TS, 0, 0, TS, -QX0 * TS, -QY0 * TS); x.lineCap = 'round'; x.lineJoin = 'round';
      const tipF = TIPq(t);
      const one = (f, ty, dim, tip) => { x.beginPath(); const tx = stemPath(x, f, ty, t); x.strokeStyle = rgba(118, 118, 126, dim); x.lineWidth = 1.6; x.stroke();
        if (tip) { x.beginPath(); x.arc(tx, ty, 3.0, 0, TAU); x.fillStyle = rgba(170, 170, 178, dim); x.fill(); } };
      for (const f of FL) { if (!f.sprout) continue; const ty = Math.max(f.y, tipF + f.tipOff); if (ty > QY1 - 4) continue; one(f, ty, t > f.birth ? 0.42 : 1, t <= f.birth); }
      const fu = fillU(t);
      for (const f of SPR) { const ty = Math.max(f.y, tipF + f.tipOff); if (ty > QY1 - 4) continue; one(f, ty, 1 - sstep(0.72, 0.93, fu) * 0.6, true); }
    }
    function drawStem(L, t, Wd) {
      const x = L.x; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, TW, TH);
      if (!Wd) return;
      x.setTransform(TS, 0, 0, TS, -QX0 * TS, -QY0 * TS);
      const sx = X0 + B.w * HE.from[0], sy = EDGE ? Y1 + PADQ * 0.7 : Y1 + 2, Lh = sy - Wd.y;   // fade: the stem grows up out of the fade band
      x.lineCap = 'round'; x.beginPath(); x.moveTo(sx, sy);
      x.bezierCurveTo(sx - 18, sy - Lh * 0.38, Wd.x + 26, Wd.y + Lh * 0.45, Wd.x, Wd.y);
      const [ar, ag, ab] = rgb01(ACC).map(v => v * 255);
      x.strokeStyle = rgba(lerp(ar, 255, .25), lerp(ag, 255, .25), lerp(ab, 255, .25), 0.35); x.lineWidth = 7; x.stroke();
      x.strokeStyle = rgba(238, 242, 255, 1); x.lineWidth = 2.7; x.stroke();
    }

    // ---------- three.js: one plane over the field + shader (shared renderer)
    let GL = null;
    function glInit() {
      const FDATA = new Float32Array(MAXF * TEXW * 4);
      const fTex = new THREE.DataTexture(FDATA, TEXW, MAXF, THREE.RGBAFormat, THREE.FloatType); fTex.minFilter = fTex.magFilter = THREE.NearestFilter;
      const GW = Math.ceil(QW / GSZ), GH = Math.ceil(QH / GSZ);
      const GDATA = new Float32Array(GW * GH * GPER);
      const gTex = new THREE.DataTexture(GDATA, GPER / 4, GW * GH, THREE.RGBAFormat, THREE.FloatType); gTex.minFilter = gTex.magFilter = THREE.NearestFilter;
      const SP = mkLayer(), TP = mkLayer();
      const tex = L => { const t = new THREE.CanvasTexture(L.c); t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; return t; };
      const spT = tex(SP), tpT = tex(TP);
      const v3 = h => new THREE.Vector3(...rgb01(h));
      const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
        uniforms: { uF: { value: fTex }, uG: { value: gTex }, uGW: { value: GW }, uGH: { value: GH }, uSprout: { value: spT }, uTop: { value: tpT },
          uT: { value: 0 }, uW: { value: new THREE.Vector2() }, uWs: { value: 40 }, uBlue: { value: 0 }, uRed: { value: 0 }, uBlueMask: { value: 0 },
          uGapD: { value: 14 }, uGapW: { value: 20 }, uSL: { value: new THREE.Vector4(QX0, QY0, QW, QH) }, uBox: { value: new THREE.Vector4(X0, Y0, B.w, B.h) },
          uFade: { value: new THREE.Vector3(EDGE ? EDGE.start : 0, EDGE ? EDGE.wobble : 0, 0) }, uCtr: { value: new THREE.Vector2(X0 + B.w / 2, Y0 + B.h / 2) },
          uRad: { value: new THREE.Vector2(EDGE ? EDGE.rx * B.w : 1, EDGE ? EDGE.ry * B.h : 1) }, uSeed: { value: ((o.seed || 7) % 97) * 0.731 }, uBg: { value: new THREE.Vector3(...(EDGE ? rgb01(P.bg) : [0, 0, 0])) }, uRimI: { value: 0 }, uK: { value: UK }, uHU: { value: 0 },
          uAcc: { value: v3(ACC) }, uHeat: { value: v3(HEAT_C) }, uHero: { value: v3(HERO_C) }, uEdge: { value: 1 } } });
      const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(0, W, H, 0, -1, 1);
      mat.transparent = true; mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;   // premultiplied alpha
      const q = new THREE.Mesh(new THREE.PlaneGeometry(QW, QH), mat); q.position.set(QX0 + QW / 2, H - (QY0 + QH / 2), 0); scene.add(q);
      GL = { FDATA, fTex, GDATA, gTex, GW, GH, SP, TP, spT, tpT, mat, scene, cam };
    }
    function pack(S) {
      const n = Math.min(S.length, MAXF), F = GL.FDATA;
      for (let i = 0; i < n; i++) { const a = S[i], k = i * TEXW * 4;
        F.set([a.sx, a.sy, a.wr, a.s * 1.12 + 6, a.x, a.y, a.s, a.rot, a.n, a.curl, a.open, a.fan, a.m[0], a.m[1], a.m[2], a.m[3], a.m[4], a.m[5], a.white ? 1 : 0, a.sq || 0], k); }
      GL.fTex.needsUpdate = true;
      const G = GL.GDATA; G.fill(-1); const cnt = new Int32Array(GL.GW * GL.GH);
      for (let i = 0; i < n; i++) { const a = S[i], R = a.s * 1.12 + 6 + 40;
        const gx0 = Math.max(0, Math.floor((a.x - R - QX0) / GSZ)), gx1 = Math.min(GL.GW - 1, Math.floor((a.x + R - QX0) / GSZ));
        const gy0 = Math.max(0, Math.floor((a.y - R - QY0) / GSZ)), gy1 = Math.min(GL.GH - 1, Math.floor((a.y + R - QY0) / GSZ));
        for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
          const cx = Math.max(QX0 + gx * GSZ, Math.min(a.x, QX0 + (gx + 1) * GSZ)), cy = Math.max(QY0 + gy * GSZ, Math.min(a.y, QY0 + (gy + 1) * GSZ));
          if ((cx - a.x) ** 2 + (cy - a.y) ** 2 > R * R) continue;
          const g = gy * GL.GW + gx; if (cnt[g] >= GPER) continue; G[g * GPER + cnt[g]++] = i; } }
      GL.gTex.needsUpdate = true;
    }

    // ---------- 2D: stage, drafting grid, bloom, halo, grain
    const bc = document.createElement('canvas'); bc.width = Math.ceil(QW / 2); bc.height = Math.ceil(QH / 2); const bx = bc.getContext('2d');
    let DITHER = null;
    // ---------- background: mist (shader, rendered at half resolution and scaled up) + mid / near blurred flower shadows (2D)
    let BG = null;
    const bgc = document.createElement('canvas'); bgc.width = W / 2; bgc.height = H / 2; const bgx = bgc.getContext('2d');   // the mist is soft, half resolution is enough
    const nc = document.createElement('canvas'); nc.width = W / 2; nc.height = H / 2; const ncx = nc.getContext('2d');
    function mistLayer(g, t, w) {
      if (!BG) {
        const v3 = h => new THREE.Vector3(...rgb01(h));
        const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: BG_FS, glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
          uniforms: { uRes: { value: new THREE.Vector2(W, H) }, uT: { value: 0 }, uW: { value: new THREE.Vector2() }, uBlue: { value: 0 }, uAcc: { value: v3(ACC) },
            uBg: { value: v3(P.bg) }, uK: { value: UK }, uIn: { value: 0 }, uDrift: { value: new THREE.Vector2() } } });
        const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(0, W, H, 0, -1, 1);
        const q = new THREE.Mesh(new THREE.PlaneGeometry(W, H), m); q.position.set(W / 2, H / 2, 0); sc.add(q);
        BG = { m, sc, cam };
      }
      const u = BG.m.uniforms;
      u.uT.value = t; u.uW.value.set(w.x, w.y); u.uBlue.value = blueI(t) * 0.9 + 0.1 * sstep(at0, at0 + 1, t); u.uIn.value = DS.in(t, at0, .8);
      u.uDrift.value.set(14 * (t - at0), -6 * (t - at0));            // mist drifts slowly
      bgx.clearRect(0, 0, bgc.width, bgc.height);
      XM.drawGL(bgx, BG.sc, BG.cam, { w: bgc.width, h: bgc.height });
      g.save(); g.filter = 'blur(2px)'; g.drawImage(bgc, 0, 0, W, H); g.restore();
    }
    const NEAR = [[-40, 1040, 320, 0.3, 7], [1985, 1080, 380, 1.1, 8], [1915, 20, 270, 2.0, 7]];   // foreground shadows: x, y, radius, rotation, petal count (in the frame corners, mostly off-screen, clear of the field)
    const MID = [[990, 110, 150, 0.8, 6], [70, 560, 170, 2.4, 7], [1010, 820, 130, 1.6, 6], [1560, 1010, 180, 0.2, 7], [430, 1060, 150, 1.2, 6], [1840, 520, 140, 2.9, 6]];   // mid-ground shadows: sparse, very soft
    function nearLayer(g, t, w, list = NEAR, blur = 5, alpha = 1) {
      const k = DS.in(t, at0, .9) * alpha; if (k <= 0) return;
      const x = ncx; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, nc.width, nc.height); x.setTransform(.5, 0, 0, .5, 0, 0);
      const [ar, ag, ab] = rgb01(ACC).map(v => v * 255);
      list.forEach(([cx, cy, R, rot0, n], i) => {
        const dx = 14 * Math.sin((t - at0) * .23 + i * 1.7), dy = 10 * Math.cos((t - at0) * .19 + i), rot = rot0 + 0.04 * Math.sin((t - at0) * .15 + i);
        const lit = blueI(t) * Math.exp(-Math.hypot(cx - w.x, cy - w.y) / 700);
        for (const layer of [0, 1]) for (let j = 0; j < n; j++) {        // two layers of pointed petals, inner layer offset by half a petal and shorter: a lotus seen from above
          const a = rot + (j + layer * 0.5) * TAU / n, L = R * (layer ? 0.72 : 1), Wd = R * (layer ? 0.26 : 0.3);
          x.save(); x.translate(cx + dx, cy + dy); x.rotate(a);
          x.beginPath(); x.moveTo(0, 0);
          x.bezierCurveTo(L * 0.3, -Wd, L * 0.75, -Wd * 0.85, L, 0);          // petal tip
          x.bezierCurveTo(L * 0.75, Wd * 0.85, L * 0.3, Wd, 0, 0); x.closePath();
          x.fillStyle = layer ? 'rgba(7,8,12,0.96)' : 'rgba(4,5,8,0.95)'; x.fill();
          x.lineWidth = 2.4; x.strokeStyle = `rgba(${lerp(ar, 255, .45) | 0},${lerp(ag, 255, .45) | 0},${lerp(ab, 255, .45) | 0},${0.14 + 0.5 * lit})`; x.stroke();
          x.restore();
        }
      });
      g.save(); g.globalAlpha = k; g.filter = `blur(${blur}px)`; g.drawImage(nc, 0, 0, W, H); g.restore();   // out of focus
    }
    function drafting(g, t) {               // drafting background: dot grid, ruler along the top of the box, corner crosses (very faint)
      const k = DS.in(t, at0, .5);
      g.save(); g.globalAlpha = k;
      g.fillStyle = P.faint; for (let x = 150; x <= W - 150; x += 40) for (let y = 150; y <= H - 150; y += 40) { if (!EDGE && x > X0 - 30 && x < X1 + 30 && y > Y0 - 30 && y < Y1 + 30) continue; g.fillRect(x - 1, y - 1, 2, 2); }
      if (EDGE) { g.restore(); return; }
      g.strokeStyle = P.line; g.lineWidth = 1.5;
      for (let x = X0; x <= X1 + 0.5; x += B.w / 20) { const hh = (Math.round((x - X0) / (B.w / 20)) % 5 === 0) ? 14 : 7; g.beginPath(); g.moveTo(x, Y0 - 18); g.lineTo(x, Y0 - 18 - hh); g.stroke(); }
      g.beginPath(); g.moveTo(X0, Y0 - 18); g.lineTo(X1, Y0 - 18); g.stroke();
      for (const [x, y] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]]) { g.beginPath(); g.moveTo(x - 16, y); g.lineTo(x - 6, y); g.moveTo(x + 6, y); g.lineTo(x + 16, y); g.moveTo(x, y - 16); g.lineTo(x, y - 6); g.moveTo(x, y + 6); g.lineTo(x, y + 16); g.stroke(); }
      g.restore();
    }
    function halo(g, t, w) {
      if (t < HE.at) return;
      const early = sstep(HE.at, HE.at + 0.17, t) * (1 - sstep(HE.at + 0.6, HE.at + 1.3, t));
      const size = lerp(w.r * 3.4 + 60 * KS, 380 * UK, early), op = lerp(0.5, 0.38, early) * sstep(HE.at, HE.at + 0.1, t);
      const tint = lerp(1, 0.55, early), R = size / 2;
      const gr = g.createRadialGradient(w.x, w.y, 0, w.x, w.y, R);
      gr.addColorStop(0, `rgba(${255 * tint | 0},${255 * lerp(1, .68, early) | 0},255,${op})`); gr.addColorStop(0.18, `rgba(190,205,255,${0.55 * op})`);
      gr.addColorStop(0.45, `rgba(80,110,255,${0.18 * op})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(w.x - R, w.y - R, 2 * R, 2 * R); g.restore();
    }
    function postBox(g) {                   // bloom (blur bright areas and add a little back) + fixed +-1 grain (breaks up banding in dark gradients)
      bx.globalCompositeOperation = 'copy'; bx.filter = 'contrast(3.2) blur(3px)';
      bx.drawImage(g.canvas, QX0, QY0, QW, QH, 0, 0, bc.width, bc.height); bx.filter = 'none';
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.24; g.drawImage(bc, QX0, QY0, QW, QH); g.restore();
      const x0 = Math.max(0, Math.floor(QX0)), y0 = Math.max(0, Math.floor(QY0)), w = Math.min(W - x0, Math.ceil(QW)), h = Math.min(H - y0, Math.ceil(QH));
      const id = g.getImageData(x0, y0, w, h), px = id.data;
      if (!DITHER) { let sd = 12345; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647; DITHER = new Int8Array(w * h); for (let i = 0; i < DITHER.length; i++) DITHER[i] = Math.round(r() + r() - 1); }
      for (let i = 0, j = 0; i < px.length; i += 4, j++) { const d = DITHER[j]; if (px[i] | px[i + 1] | px[i + 2]) { px[i] += d; px[i + 1] += d; px[i + 2] += d; } }
      g.putImageData(id, x0, y0);
    }
    function tagDraw(g, t) {                // solid name tag at the top-left of the box
      if (!o.tag || !o.tag.text) return;
      const k = DS.in(t, o.tag.at != null ? o.tag.at : at0, .4); if (k <= 0) return;
      const size = DS.S.label, tw = XM.measure(g, o.tag.text, { fam: 'zh', size, w: 800 }), pad = size * .32, bh = size * 1.24 + pad * .4;
      const xx = EDGE ? X0 + 10 : X0 - 2, yy = (EDGE ? Y0 - bh * 0.55 : Y0 - bh - 26) + 12 * (1 - k);   // fade: floats at the top-left of the field, over the fade band
      g.save(); g.globalAlpha *= k; g.fillStyle = PAPER_; g.fillRect(xx - 2, yy - 2, tw + pad * 2 + 4, bh + 4); g.fillStyle = DS.INK; g.fillRect(xx, yy, tw + pad * 2, bh);
      XM.txt(g, o.tag.text, xx + pad, yy + bh / 2 + size * .36, { fam: 'zh', size, w: 800, col: DS.PAPER }); g.restore();
    }
    const PAPER_ = DS.PAPER;
    function notesDraw(g, t) {
      if (!o.notes || !o.notes.length) return;
      const k = DS.in(t, o.tag && o.tag.text && o.tag.at != null ? o.tag.at + .15 : at0 + .3, .5);   // appears together with the tag if there is one
      const ny = EDGE ? (o.tag && o.tag.text ? Y0 + DS.S.label * 0.9 + 22 : Y0 + 10) : Y1 + 40;     // fade: below the tag (text stays readable where the edges are faint)
      o.notes.forEach((s, i) => XM.txt(g, s, EDGE ? X0 + 10 : X0, ny + i * 30, { fam: 'mono', size: 20, w: 500, col: P.mute, alpha: k, ls: 1.2 }));
    }

    const api = { edge: EDGE ? 'fade' : 'box', hero: t => { const s = states(t); return s.W ? { x: s.C[0], y: s.C[1], r: s.w.r, site: [s.w.x, s.w.y], on: true } : { x: heroPos(t)[0], y: heroPos(t)[1], r: 0, on: false }; }, box: { ...B } };
    const shot = XM.shot({ bg: P.bg }, S => (g, t) => {
      DS.stage(g, P);
      if (!GL) glInit();
      const st = states(t);
      if (BD && BD.mist) mistLayer(g, t, st.w); else drafting(g, t);
      if (BD && BD.mid) nearLayer(g, t, st.w, MID, 11, 0.7);         // mid ground: softer and fainter, behind the field
      pack(st.S);
      drawSprouts(GL.SP, t); GL.spT.needsUpdate = true;
      drawStem(GL.TP, t, st.W); GL.tpT.needsUpdate = true;
      const u = GL.mat.uniforms, hu = heatU(t);
      u.uT.value = t; u.uW.value.set(st.w.x, st.w.y); u.uWs.value = st.W ? st.W.sN : 40;
      u.uBlue.value = blueI(t); u.uRed.value = redI(t); u.uBlueMask.value = sstep(HE.at, HE.at + 0.9, t); u.uHU.value = hu;
      u.uRimI.value = sstep(HE.at + 0.05, HE.at + 1.0, t); u.uGapD.value = gapD(t); u.uGapW.value = gapW(t); u.uEdge.value = DS.in(t, at0, .45);
      XM.drawGL(g, GL.scene, GL.cam);
      halo(g, t, st.w);
      postBox(g);
      if (BD && BD.near) nearLayer(g, t, st.w);
      tagDraw(g, t);
      notesDraw(g, t);
      if (o.draw) { g.save(); o.draw(g, t, P, api); g.restore(); }
      if (o.hud !== false) DS.hud(g, t, P, Object.assign({ tl: 'FIG' }, o.hud || {}));
    });
    return { L: shot.L, update: shot.update, S: shot.S, cues, hero: api.hero, box: api.box,
      times: { at: at0, hero: HE.at, crowd: { ...CR }, heat: HT ? { at: HT.at, full: HT.full } : null, squeeze: SQ.map(e => ({ at: e.at, peak: e.peak, release: e.release })) } };
  }

  Object.assign(XM, { squeeze });
})();
