// XM.bubble: a breathing liquid-glass bubble (key: bubble). Its reflections show a text band, a dark arc, an accent-coloured
// liquid surface and a white grid floor, with a thin-film rainbow rim, pearl edge and two highlights. Around it: a statement
// rising letter by letter on one side, a scrambled English subtitle, halftone rings / four-point stars on beats, a specimen
// box with readouts; it can swing across to the other side (answer line), stretch into a peanut, split into two cells and merge.
// Docs: docs/components/bubble.md
// Load order: vendor/three.min.js (r158, global THREE) -> lib.js -> xk.js -> xm-core.js -> this file.
// The bubble is a ray-marched SDF (up to 6 ellipsoids blended with smin + simplex-noise wobble) in a custom fragment shader on a
// full-screen quad, output through the shared renderer XM.gl() / XM.drawGL (no new WebGLRenderer). The reflection environment
// (sky / dark arc / text-band texture / liquid / grid floor / highlights) is built in the shader; no HDR.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// XM.bubble(o) → { L, update }
//   Good for: a close-up of one idea / world; "X is not Y but Z" (type on one side -> bubble swings over -> answer on the other); "split in two / contrast both sides, then merge"
//   o.at      seconds; the bubble swells from the centre (0.5 s with slight overshoot, liquid wobble settles). Default 0
//   o.band    text band wrapping around inside the reflection (decorative; squeezed and stretched by the lens):
//             'LLM' | { text:'LLM', panel:['NEXT','TOKEN'], tag:'PREDICT THE' }
//             text: big text on the band (CJK or Latin, 2-6 characters is best); panel: two lines of bold Unbounded in an accent block; tag: one line of small mono text on the block.
//             panel defaults to the second half of sub's English text, tag to the first half; with neither: 'LIQUID / GLASS'
//   o.say     [{ text, at, color, size }]  statement to be read, one line per item, letters rise from below (o.per seconds each, default 0.06) with an accent cursor.
//             With swing: lines with at < swing.at go in the first column (opposite the bubble); lines with at >= swing.at go in the column revealed after the swing (answer, default colour 'accent').
//             color defaults to 'text' (first column) / 'accent' (second); size is automatic by default (all lines in a column share one size fitted to the column width, max o.textSize=210, min 56)
//   o.sub     { text, at } | [{ text, at }, ...]  scrambled-decode English subtitle (mono 26 px; a decorative echo, never information to read);
//             it appears under the last line of whichever column is showing at that time
//   o.side    'right' (default: bubble right, text left) | 'left'
//   o.size    bubble diameter in px, default 780. After a split each cell is 0.7 x size; after a merge 0.76 x size
//   o.beats   [at, ...]  beats: a halftone dot ring expands, three four-point stars pop, the bubble squeezes slightly (no screen shake, no camera push)
//   o.swing   { at }  the bubble winds up, then stretches and swings to the other side (~0.45 s, 0.5 s settle); the reflection rolls with it and a halftone smear trails behind;
//             first-column text disappears as the bubble sweeps over it, the second column is revealed
//   o.split   { at, labels:['Think','Answer'], size:72 }  moves to the centre and bulges sideways (0.3 s) -> peanut (0.25 s) -> snaps into two cells
//             (chrome spikes pulled inward, two droplets flung up and down, a four-point star + MITOSIS 1->2 in the middle); labels type out under the cells (text to read, left 'text', right 'accent');
//             labels may be [{ text, at, color }], default at = split.at+0.6 / +0.85. Statement text is covered and disappears as the peanut bulges
//   o.merge   { at, label:'One answer' }  the two cells approach, form a liquid bridge and fuse into one (~0.55 s, 0.6 s settle), stopping at the centre;
//             label types out underneath (default at = merge.at+0.7)
//   o.hit     false (default, explanatory pace) | true (intro hook: swing / split timings sped up to 0.75x)
//   o.box     { id:'SPECIMEN_001', tag:'LIQUID GLASS' } | false   four-corner specimen box that follows the bubble, with readouts (diameter, breathing phase, T+seconds; decorative micro-text)
//   o.hud     { top:'03 — BREATH · NEGATIVE SPACE', tl:'FIG.03', bl:'03 BREATH', br } | false   top-centre micro-text + barcode, four-corner HUD, side crosshairs, bottom progress bar (events drawn as ticks)
//   o.tags    ['01 / STATEMENT', '02 / RESPONSE']  micro-text labels above the two columns
//   o.dur     shot duration (only for the bottom progress bar), default 6
//   o.per     seconds between letters, default 0.06 (each letter rises over 0.12 s)
//   o.slant   skew of the statement text, default 0.17 (slight italic); o.squeeze horizontal compression, default 0.8
//   o.bg / o.cam  as in XM.shot (stage fixed to 'flat'; the background is a self-drawn radial vignette)
//
// Colours: liquid, liquid lines and outer outline = 'accent'; the thin-film rainbow (cyan / yellow / pink) is fixed; sky = the background on light stages, pearl grey on dark ones;
//       the reflected floor is always a white grid on black. Colours are resolved at build time, so you can wrap it in XK.tone('paper'|'lab', () => XM.bubble({...})).
// Rules: text to be read (say / split.labels / merge.label) is flat fill; rainbow, highlights and pearl edge stay on the glass.
// Deterministic: all motion is a pure function of t; noise is driven only by t. Cost: one full-screen ray march per frame (pixels outside the bubble exit early).
// ─────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  const { W, H } = XM;
  const TAU = Math.PI * 2, NB = 6;
  const CJK = /[⺀-鿿　-〿＀-￯]/;

  // ---------- Colour ----------
  const CC = document.createElement('canvas').getContext('2d');
  function rgbOf(c, fb = '#ffffff') {
    const s = XK.col(c) || c || fb;
    CC.fillStyle = fb; CC.fillStyle = s;
    const v = CC.fillStyle;
    if (v[0] === '#') return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    const m = v.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]];
  }
  const hex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const lum = a => (.2126 * a[0] + .7152 * a[1] + .0722 * a[2]) / 255;
  const v3 = (c, k = 1) => new THREE.Vector3(c[0] / 255 * k, c[1] / 255 * k, c[2] / 255 * k);
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // ---------- Shader (colours as uniforms) ----------
  const FRAG = /* glsl */`
precision highp float;
uniform vec2 uRes;
uniform vec4 uBlob[${NB}];   // xy=centre (canvas px) z=radius (0=off) w=noise phase
uniform vec4 uStr[${NB}];    // x=horizontal scale y=vertical scale z=stretch angle w=noise amplitude
uniform float uK, uT, uRot, uTilt, uRoll;
uniform sampler2D uBand;
uniform vec3 uSky, uLiq, uLine, uEdge, uTint;
uniform float uTintK;
varying vec2 vUv;

// Ashima simplex noise (MIT)
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float blobSD(vec3 p,int i){
  vec4 B=uBlob[i];vec4 S=uStr[i];
  if(B.z<.5)return 1e5;
  vec3 q=p-vec3(B.x,B.y,0.);
  float c=cos(S.z),s=sin(S.z);
  q.xy=mat2(c,s,-s,c)*q.xy;
  float sx=S.x,sy=S.y,sz=1./sqrt(S.x*S.y);
  vec3 qs=q/vec3(sx,sy,sz);
  vec3 dn=qs/max(length(qs),1e-3);
  float ph=B.w;
  float n=snoise(dn*.75+vec3(ph,ph*.7,uT*.7))*.85+snoise(dn*1.2+vec3(-ph,uT*.8,ph*.3))*.15;
  vec3 R=B.z*(1.+S.w*n)*vec3(sx,sy,sz);
  float k0=length(q/R),k1=length(q/(R*R));
  return k0*(k0-1.)/max(k1,1e-6);
}
float map(vec3 p){
  float d=blobSD(p,0);
  for(int i=1;i<${NB};i++){d=smin(d,blobSD(p,i),uK);}
  return d;
}
vec3 nrm(vec3 p){
  const vec2 e=vec2(1.,-1.)*.9;
  return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));
}
float bandAA(float x,float a,float b,float w){return smoothstep(a-w,a+w,x)*(1.-smoothstep(b-w,b+w,x));}
vec3 env(vec3 d){
  float ew=max(fwidth(d.y)*.4,.0015);
  float el=asin(clamp(d.y,-1.,1.));
  float az0=atan(d.x,d.z), az=az0+uRot;
  float ca=cos(az0);
  vec3 sky=uSky;
  vec3 col=sky;
  float side=smoothstep(.62,.32,ca)*smoothstep(-.97,-.86,ca);
  float hn=snoise(vec3(az*.8,uT*.35,3.1));
  float hb=bandAA(el,.49+.025*hn,.6+.05*snoise(vec3(az*.9,uT*.3,7.7)),ew)*side;
  float back=smoothstep(.0,-.25,ca)*smoothstep(-.6,-.4,ca)*bandAA(el,.155,.315,ew);
  col=mix(col,vec3(.03),max(hb,back));
  float B0=0., BT=.7;
  float B1=B0+(BT-B0)*sqrt(smoothstep(-.2,.6,ca));
  if(el>B0&&el<B1){
    float wv=snoise(vec3(az*2.2,el*5.,uT*.45));
    float u=az/6.2831853+.006*wv,v=(el-B0)/(BT-B0)+.012*snoise(vec3(az*2.,uT*.4,1.3));
    col=texture2D(uBand,vec2(u,clamp(v,0.,1.))).rgb;
  }
  float fr=smoothstep(-.95,-.8,ca);
  float fl=-.465;
  if(el<=B0&&el>B0-.022) col=mix(col,uLine,fr);
  col=mix(col,vec3(.03,.03,.05),bandAA(el,-.175,-.13,ew)*fr);
  if(el<-.175) col=mix(sky,uLiq,max(fr,step(el,-.3)));
  vec2 fp=d.xz/max(-d.y,.08);
  float ga=uRot; fp=mat2(cos(ga),sin(ga),-sin(ga),cos(ga))*fp;
  vec2 gq=fp*2.15;
  vec2 gw=min(fwidth(gq),vec2(.5));
  vec2 gd=abs(fract(gq-.5)-.5);
  vec2 gl=1.-smoothstep(vec2(.004),vec2(.004)+gw*1.9+.006,gd);
  float lineA=max(gl.x,gl.y);
  if(el<fl) col=mix(vec3(.02,.02,.026),vec3(.88,.88,.9),lineA);
  col=mix(col,vec3(.03,.03,.05),bandAA(el,fl-.012,-.44,ew));
  vec3 LA=normalize(vec3(-.35,.55,.75)),LB=normalize(vec3(.5,.3,.8));
  col+=vec3(1.)*smoothstep(.9985,.9995,dot(d,LA))*.9;
  col+=vec3(1.)*smoothstep(.9988,.9996,dot(d,LB))*.8;
  return col;
}
vec3 film(float ct,float th){
  vec3 lam=vec3(650.,532.,450.);
  float n=1.33; float st=sqrt(max(0.,1.-(1.-ct*ct)/(n*n)));
  vec3 ph=6.2831853*2.*n*th*st/lam;
  return .5+.5*cos(ph);
}
void main(){
  vec2 px=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  float near=1e9;
  for(int i=0;i<${NB};i++){ if(uBlob[i].z>.5){ float rr=uBlob[i].z*max(max(uStr[i].x,uStr[i].y),1.)*1.25+uK; near=min(near,length(px-uBlob[i].xy)-rr);} }
  if(near>0.){ gl_FragColor=vec4(0.); return; }
  vec3 ro=vec3(px.x,px.y,1400.), rd=vec3(0.,0.,-1.);
  float t=0.,dmin=1e9; bool hit=false; vec3 p;
  for(int k=0;k<110;k++){
    p=ro+rd*t;
    float d=map(p);
    dmin=min(dmin,d);
    if(d<.25){hit=true;break;}
    t+=d*.55;
    if(t>2800.)break;
  }
  if(!hit){
    float a=1.-smoothstep(0.,1.2,dmin);
    if(a<=0.){gl_FragColor=vec4(0.);return;}
    gl_FragColor=vec4(uEdge*a,a);return;
  }
  vec3 n=nrm(p); n.y=-n.y;
  vec3 v=vec3(0.,0.,-1.);
  float ct0=clamp(-n.z,0.,1.);
  float lw=.008+.08*pow(1.-ct0,3.);
  vec3 wn=vec3(snoise(n*.9+vec3(uT*.5,0.,2.)),snoise(n*.9+vec3(5.,uT*.5,1.)),0.);
  vec3 nw=normalize(n+lw*wn+vec3(n.xy*.10*pow(1.-ct0,2.),0.));
  vec3 r=reflect(v,nw);
  { float c=cos(uRoll),s=sin(uRoll); r.xy=mat2(c,s,-s,c)*r.xy; float c2=cos(uTilt),s2=sin(uTilt); r.yz=mat2(c2,s2,-s2,c2)*r.yz; }
  float ct=clamp(dot(n,-v),0.,1.);
  vec3 c=env(r);
  float th=470.+160.*snoise(n*.9+vec3(uT*.3))+230.*(1.-ct);
  vec3 f=film(ct,th);
  float wIr=mix(.28,.72,pow(1.-ct,1.5));
  vec3 fc=mix(vec3(.74,.84,.82),vec3(1.05,1.03,.98),f);
  c=mix(c,c*fc*1.05+(f-.5)*.1,wIr);
  float de=uBlob[0].z*ct*ct*.5;
  float lum=dot(c,vec3(.3,.5,.2));
  vec3 sheen=mix(c,vec3(.93,.92,.97),.5*smoothstep(.2,.7,lum))*(.75+.5*f)+f*.08;
  c=mix(c,sheen,(1.-smoothstep(6.,30.,de))*.85);
  c=mix(c,uEdge,1.-smoothstep(1.6,2.8,de));
  c=mix(c,uTint,uTintK);
  c*=vec3(1.,.99,.965);
  gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;
  const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;

  let S3 = null;
  function scene3() {
    if (S3) return S3;
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const V = () => new THREE.Vector3();
    const uniforms = {
      uRes: { value: new THREE.Vector2(W, H) }, uT: { value: 0 }, uRot: { value: 0 }, uTilt: { value: 0 }, uRoll: { value: 0 }, uK: { value: 60 },
      uBlob: { value: Array.from({ length: NB }, () => new THREE.Vector4()) },
      uStr: { value: Array.from({ length: NB }, () => new THREE.Vector4()) },
      uBand: { value: null }, uSky: { value: V() }, uLiq: { value: V() }, uLine: { value: V() }, uEdge: { value: V() }, uTint: { value: V() }, uTintK: { value: .07 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, blending: THREE.NoBlending, depthTest: false, depthWrite: false });
    mat.extensions.derivatives = true;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; scene.add(quad);
    return (S3 = { scene, cam, uniforms });
  }

  // ---------- Text-band texture (the text wrapping round inside the reflection) ----------
  const BANDS = new Map();
  function bandTex(B, P) {
    const key = JSON.stringify([B, P.acc, P.ink]);
    if (BANDS.has(key)) return BANDS.get(key);
    const c = document.createElement('canvas'); c.width = 4096; c.height = 512; const g = c.getContext('2d');
    const PAPER = '#f4f3f0', INKD = '#0a0a0c';
    g.fillStyle = PAPER; g.fillRect(0, 0, 4096, 512);
    const zh = CJK.test(B.text), fam = zh ? 'zh' : 'unb', size = zh ? 440 : 330, w = zh ? 480 : 900, ls = zh ? 30 : -6, base = zh ? 455 : 420;
    const seg = 2048, tw0 = XM.measure(g, B.text, { fam, size, w, ls }), sx = Math.min(.86, seg * .6 / Math.max(1, tw0)), tw = tw0 * sx;
    for (let i = 0; i < 2; i++) {
      const x0 = i * seg;
      g.save(); g.translate(x0 + 50, 0); g.scale(sx, 1); XM.txt(g, B.text, 0, base, { fam, size, w, ls, col: INKD }); g.restore();
      g.fillStyle = INKD; g.beginPath(); g.arc(x0 + 50 + tw + 10, 300, 14, 0, 7); g.fill();
      const px = x0 + 50 + tw + 50, pw = seg - tw - 130;
      g.fillStyle = P.acc; g.fillRect(px, 60, pw, 410);
      const lines = B.panel.slice(0, 2);
      let mw = 1; for (const s of lines) mw = Math.max(mw, XM.measure(g, s, { fam: 'unb', size: 100, w: 900, ls: -2 }));
      const k = Math.min(.8, (pw - 44) / mw);
      g.save(); g.beginPath(); g.rect(px, 60, pw, 410); g.clip();
      g.save(); g.translate(px + 22, 0); g.scale(Math.min(.8, (pw - 44) / Math.max(1, XM.measure(g, B.tag, { fam: 'mono', size: 40, w: 500, ls: 3 }))), 1);
      if (B.tag) XM.txt(g, B.tag, 0, 135, { fam: 'mono', size: 40, w: 500, col: hex(mixc(P.inkC, P.accC, .15)), ls: 3 });
      g.restore();
      g.save(); g.translate(px + 22, 0); g.scale(k, 1);
      lines.forEach((s, j) => XM.txt(g, s, 0, lines.length === 1 ? 340 : 285 + j * 115, { fam: 'unb', size: 100, w: 900, col: P.ink, ls: -2 }));
      g.restore(); g.restore();
    }
    g.fillStyle = P.acc; g.fillRect(0, 0, 4096, 9); g.fillRect(0, 503, 4096, 9);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
    BANDS.set(key, t);
    return t;
  }

  // ---------- Small pieces ----------
  function haloDots(g, cx, cy, rx, ry, color, pitch, maxr, edge = .35, alpha = 1) {
    if (alpha <= 0 || rx <= 0 || ry <= 0) return;
    g.save(); g.globalAlpha *= alpha; g.fillStyle = color; g.beginPath();
    const x0 = Math.floor((cx - rx) / pitch) * pitch, y0 = Math.floor((cy - ry) / pitch) * pitch;
    for (let y = y0; y <= cy + ry; y += pitch) for (let x = x0; x <= cx + rx; x += pitch) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry); if (d >= 1) continue;
      const k = clamp((1 - d) / edge, 0, 1), r = maxr * Math.sqrt(k); if (r < .45) continue;
      g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
    }
    g.fill(); g.restore();
  }
  function ringDots(g, cx, cy, r0, r1, color, pitch, maxr, alpha = 1) {
    if (alpha <= 0) return;
    g.save(); g.globalAlpha *= alpha; g.fillStyle = color; g.beginPath();
    for (let r = r0; r <= r1 + .1; r += pitch) {
      const n = Math.max(12, Math.round(TAU * r / pitch)), k = r1 > r0 ? (r - r0) / (r1 - r0) : 0;
      const rr = maxr * (1 - .55 * k); if (rr < .4) continue;
      for (let i = 0; i < n; i++) { const a = i / n * TAU + (Math.round((r - r0) / pitch) % 2) * Math.PI / n; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU); }
    }
    g.fill(); g.restore();
  }
  function tri(g, x, y, s, up, color) { g.fillStyle = color; g.beginPath(); if (up) { g.moveTo(x, y - s); g.lineTo(x + s, y + s * .2); g.lineTo(x - s, y + s * .2); } else { g.moveTo(x, y + s * .2); g.lineTo(x + s, y - s); g.lineTo(x - s, y - s); } g.fill(); }
  function arrow(g, x, y, w, color) { g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w - 5, y); g.stroke(); g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w - 6, y - 4); g.lineTo(x + w - 6, y + 4); g.fill(); }
  const ell = (x, y, w, h, ph, amp = .05) => { const r = Math.max(8, (w + h) / 4 - 6); return { x, y, r, sx: Math.max(.05, (w / 2 - 6) / r), sy: Math.max(.05, (h / 2 - 6) / r), ph, amp }; };

  // ---------- Component ----------
  function bubble(o = {}) {
    const at = o.at ?? 0, side = o.side === 'left' ? 'left' : 'right', D = o.size || 780, f = o.hit ? .75 : 1;
    const per = o.per ?? .06, slant = o.slant ?? .17, sqz = o.squeeze ?? .8;
    const sw = o.swing && o.swing.at != null ? o.swing.at : null;
    const sp = o.split && o.split.at != null ? o.split.at : null;
    const mg = o.merge && o.merge.at != null && sp != null ? o.merge.at : null;
    const beats = (o.beats || []).slice().sort((a, b) => a - b);
    const dur = o.dur ?? 6;

    // Colours (resolved at build time)
    const bgC = rgbOf(o.bg || 'bg'), dark = lum(bgC) < .5;
    const accC = rgbOf('accent'), textC = rgbOf('text'), muteC = rgbOf('mute'), inkC = rgbOf(XK.TH.accentInk || '#ffffff');
    const P = { acc: hex(accC), accC, ink: hex(inkC), inkC };
    const skyC = dark ? [214, 214, 220] : mixc(bgC, [238, 236, 233], .5);
    const hudC = dark ? rgba(textC, .82) : rgba(mixc(textC, [8, 10, 12], .5), .9);
    const starInk = hex(dark ? textC : mixc(textC, [10, 11, 14], .6));
    const bgIn = hex(dark ? mixc(bgC, [255, 255, 255], .05) : mixc(bgC, [255, 255, 255], .12));
    const bgOut = hex(dark ? mixc(bgC, [0, 0, 0], .45) : mixc(bgC, [40, 36, 30], .12));
    const colOf = (c, fb) => hex(rgbOf(c || fb));

    // Text band
    const subs = (Array.isArray(o.sub) ? o.sub : o.sub ? [o.sub] : []).filter(s => s && s.text);
    const B0 = typeof o.band === 'string' ? { text: o.band } : (o.band || {});
    const words = (subs[0] ? subs[0].text : 'LIQUID GLASS').toUpperCase().split(/\s+/).filter(Boolean);
    const np = words.length >= 3 ? 2 : words.length;              // the block holds the last two words; earlier words become the tag
    const band = {
      text: B0.text || words[0],
      tag: B0.tag ?? words.slice(0, words.length - np).join(' '),
      panel: B0.panel || words.slice(words.length - np),
    };

    // Layout
    const X1 = side === 'right' ? W - 115 - D / 2 : 115 + D / 2, X2 = W - X1, Y = 540, dir = Math.sign(X2 - X1);
    const CX = W / 2, CY = 480, dc = .7 * D, Cx = Math.min(470, W / 2 - 115 - dc / 2), Dm = .76 * D;
    const colSide = s => (s === 'right' ? 'left' : 'right');            // bubble on the right -> text on the left
    const crossT = sw != null ? sw + .3 * f : null;
    const hideAll = sp != null ? sp + .35 * f : Infinity;
    const cols = [
      { align: colSide(side) === 'left' ? 'left' : 'right', from: -Infinity, to: crossT ?? hideAll, lines: [], subs: [], tag: (o.tags || [])[0] ?? '01 / STATEMENT', fb: 'text' },
      { align: colSide(side) === 'left' ? 'right' : 'left', from: crossT ?? Infinity, to: hideAll, lines: [], subs: [], tag: (o.tags || [])[1] ?? '02 / RESPONSE', fb: 'accent' },
    ];
    for (const l of o.say || []) { const c = sw != null && l.at >= sw ? cols[1] : cols[0]; c.lines.push({ ...l, hex: colOf(l.color, c.fb) }); }   // colour resolved at build time
    for (const s of subs) (sw != null && s.at >= sw ? cols[1] : cols[0]).subs.push(s);
    const colX = c => c.align === 'left' ? 140 : W - 140;
    const colW = (D < 1 ? 800 : (side === 'right' ? X1 - D / 2 - 70 - 140 : W - 140 - (X1 + D / 2 + 70)));
    let LAY = null;                       // measured on the first draw after fonts load
    function layout(g) {
      LAY = cols.map((c, ci) => {
        if (!c.lines.length) return null;
        let fit = o.textSize || 210;
        for (const l of c.lines) { const w1 = [...l.text].reduce((s, ch) => s + XM.measure(g, ch, { fam: 'zh', size: 100, w: 500 }) * sqz + 2.5, 0) / 100; if (!l.size) fit = Math.min(fit, (colW - 20) / w1); }
        const sz0 = Math.max(56, Math.floor(fit));
        const n = c.lines.length, lh0 = sz0 * .99, subH = c.subs.length ? sz0 * .3 + 34 : 0;
        const top = Y - (n * lh0 + subH) / 2 + 8;
        let y = top;
        const lines = c.lines.map((l, i) => {
          const s = l.size || sz0, chars = [...l.text];
          const adv = chars.map(ch => XM.measure(g, ch, { fam: 'zh', size: s, w: 500 }) * sqz + s * .025);
          const tot = adv.reduce((a, b) => a + b, 0);
          const x0 = c.align === 'left' ? colX(c) - s * .03 : colX(c) - tot - s * .1;
          const st = chars.map((_, j) => l.at + j * per);
          const L = { s, chars, adv, x0, top: y, base: y + s * .84, st, col: l.hex, end: st[st.length - 1] };
          y += s * .99;
          return L;
        });
        return { lines, top, bottom: y, tagY: top - 6 };
      });
    }

    // ---------- Geometry: bubble / cells for each frame ----------
    function single(t) {
      const u = t - at;
      const e = backOut(prog(t, at, at + .5), 1.4);
      const br = Math.sin(u * TAU / 2.4 - .6);
      let x = X1 + 6 * Math.sin(u * .9), y = Y + 7 * Math.sin(u * .7 + 1);
      let w = D * (1 + .018 * br), h = D * (1 + .032 * br);
      let rot = 1.15 + .12 * u, roll = (side === 'right' ? 1 : -1) * lerp(-.32, -.1, easeOut(prog(t, at, at + 1.6)));
      let amp = .065 + .075 * (1 - prog(t, at, at + .9));
      for (const b of beats) { const wb = wobble(t, b, 2.4, 7); w *= 1 + .05 * wb; h *= 1 - .035 * wb; }
      if (sw != null && t >= sw) {
        const v = (t - sw) / f, A = 110, OV = 90;
        let xs;
        if (v < .15) { const k = easeInOut(v / .15); xs = X1 - dir * A * k; w *= 1 - .14 * k; h *= 1 + .05 * k; }
        else if (v < .42) { const k = (v - .15) / .27, st = Math.sin(Math.PI * k); xs = lerp(X1 - dir * A, X2 + dir * OV, XM.expoInOut(k)); w *= (1 - .14 * (1 - k)) * (1 + .3 * st); h *= (1 + .05 * (1 - k)) * (1 - .2 * st); }
        else { const q = v - .42, j = Math.exp(-4.5 * q) * Math.sin(13 * q); xs = X2 + dir * OV * Math.exp(-5 * q) * Math.cos(9 * q); w *= 1 + .07 * j; h *= 1 - .06 * j; amp += .05 * Math.exp(-3 * q); }
        x += xs - X1;
        rot += -dir * 3.1 * XM.expoInOut(prog(v, .12, .5));
        roll = lerp(roll, 0, prog(v, .1, .5));
      }
      return { x, y, w: w * e, h: h * e, rot, roll, amp };
    }
    function geom(t) {
      const s0 = single(t);
      if (sp == null || t < sp) return { blobs: [ell(s0.x, s0.y, s0.w, s0.h, 1.3, s0.amp)], k: 60, boxes: [s0], rot: s0.rot, roll: s0.roll, mode: 'one' };
      const v = (t - sp) / f, rot = s0.rot + .6 * XM.expoOut(prog(v, .3, .9)), roll = s0.roll;
      if (v < .3) {
        const k = easeInOut(v / .3), x = lerp(s0.x, CX, k), y = lerp(s0.y, CY, k), w = s0.w * (1 + .18 * k), h = s0.h * (1 + .02 * k);
        return { blobs: [ell(x, y, w, h, 1.3, .06)], k: 60, boxes: [{ x, y, w, h }], rot, roll, mode: 'pulse' };
      }
      // Start: shape at v = .3
      const sA = single(sp + .3 * f), w0 = sA.w * 1.18, h0 = sA.h * 1.02;
      if (v < .55) {
        const kk = (v - .3) / .25, e = easeIn(kk), d = .62 * Cx * e;
        const r = lerp(h0 / 2, dc * .5, e), sxx = lerp(w0 / h0, 1, Math.min(1, kk * 1.6)), syy = 1 - .08 * Math.sin(Math.PI * kk);
        const kS = lerp(160, 105, kk), comp = kS * .25 * (1 - clamp(d / 200, 0, 1));
        const a = { x: CX - d, y: CY, r: r - comp, sx: sxx, sy: syy, ph: 1.3, amp: .05 }, b = { x: CX + d, y: CY, r: r - comp, sx: sxx, sy: syy, ph: 1.3, amp: .05 };
        return { blobs: [a, b], k: kS, boxes: [{ x: CX, y: CY, w: 2 * d + 2 * r * sxx, h: 2 * r * syy }], rot, roll, mode: 'peanut', neck: Math.round(Math.max(0, 2 * r * syy * (1 - e * 1.15))) };
      }
      // Cells
      const cell = (tt) => {
        const q = Math.max(0, (tt - sp) / f - .55);
        let off = Cx * (1 - .05 * Math.exp(-6 * q) * Math.cos(11 * q) + .12 * Math.exp(-6 * q) * Math.sin(11 * q));
        let r2 = dc, cy = CY + 4 * Math.sin((tt - sp) * 1.3);
        const ja = Math.exp(-4 * q) * Math.sin(13 * q), jb = Math.exp(-4 * q) * Math.sin(13 * q + 1.1);
        const br = .012 * Math.sin((tt - sp) * TAU / 2.6);
        let A = { x: CX - off, y: cy, w: r2 * (1 + .09 * ja + br), h: r2 * (1 - .07 * ja + br * 1.5) };
        let Bc = { x: CX + off, y: cy, w: r2 * (1 + .09 * jb + br), h: r2 * (1 - .07 * jb + br * 1.5) };
        let k = 36, fused = false;
        if (mg != null && tt >= mg) {
          const m = (tt - mg) / f, e = XM.expoIn(prog(m, 0, .42));
          off = lerp(off, 0, e); k = lerp(36, 200, prog(m, .08, .4));
          const rr = lerp(dc, Dm, prog(m, .25, .55)), j = wobble(tt, mg + .42 * f, 2.2, 4.5);
          const breath = .015 * Math.sin((tt - mg) * TAU / 2.4);
          A = { x: CX - off, y: cy, w: rr * (1 + .1 * j + breath), h: rr * (1 - .08 * j + breath * 1.6) };
          Bc = { x: CX + off, y: cy, w: A.w, h: A.h };
          fused = off < 1;
        }
        for (const b of beats) if (b > sp + .6) { const wb = wobble(tt, b, 2.4, 7); A.w *= 1 + .05 * wb; A.h *= 1 - .035 * wb; Bc.w *= 1 + .05 * wb; Bc.h *= 1 - .035 * wb; }
        return { A, B: Bc, k, off, fused };
      };
      const C = cell(t), q = v - .55;
      const comp = C.k * .25 * (1 - clamp(2 * C.off / 200, 0, 1));
      const merging = mg != null && t >= mg;
      const LA = ell(C.A.x, C.A.y, C.A.w - comp * 2, C.A.h - comp * 2, merging ? 2.2 : 1.3), LB = ell(C.B.x, C.B.y, C.B.w - comp * 2, C.B.h - comp * 2, merging ? 2.2 : 4.1);
      const blobs = [LA, LB];
      if (q < .1) {   // moment of splitting: chrome spikes pulled inward
        const hl = 80 * (1 - q / .1) + 8;
        blobs.push({ x: C.A.x + C.A.w / 2 + hl * .7, y: C.A.y - 2, r: hl / 2.6, sx: 2.6, sy: .45, ph: 0, amp: 0 });
        blobs.push({ x: C.B.x - C.B.w / 2 - hl * .7, y: C.B.y - 2, r: hl / 2.6, sx: 2.6, sy: .45, ph: 0, amp: 0 });
      }
      if (q < .17) {  // thin droplets flung up and down
        const e = easeOut(q / .15), sc = D / 860;
        const top = CY - lerp(190, 380, e) * sc, bot = CY + lerp(200, 350, e) * sc, el = lerp(8, 2.4, e), rr = lerp(30, 20, e) * sc;
        blobs.push({ x: CX + 40 * sc, y: top, r: rr, sx: 1 / Math.sqrt(el), sy: Math.sqrt(el) * 1.1, ph: 2, amp: 0 });
        blobs.push({ x: CX - 38 * sc, y: bot, r: rr, sx: 1 / Math.sqrt(el), sy: Math.sqrt(el) * 1.1, ph: 3, amp: 0 });
      }
      const mm = merging ? (t - mg) / f : 0;
      return { blobs, k: C.k, boxes: C.fused ? [{ x: CX, y: C.A.y, w: C.A.w, h: C.A.h }] : merging && mm > .2 ? [{ x: CX, y: C.A.y, w: 2 * C.off + C.A.w, h: C.A.h }] : [C.A, C.B],
        rot: rot + (merging ? .6 * XM.expoOut(prog(mm, .2, .8)) : 0), roll, mode: merging ? (C.fused ? 'merged' : 'merging') : 'cells', q };
    }

    // ---------- Text ----------
    function charRise(g, L, i, t, x) {
      const k = easeOut(prog(t, L.st[i], L.st[i] + .12 * f));
      if (k <= 0) return;
      const s = L.s;
      g.save(); g.beginPath(); g.rect(x - s * .12, L.top - s * .1, L.adv[i] + s * .4, s * 1.06); g.clip();
      g.translate(x, L.base + (1 - k) * s * .95); g.transform(1, 0, -slant, 1, 0, 0); g.scale(sqz, 1);
      XM.txt(g, L.chars[i], 0, 0, { fam: 'zh', size: s, w: 500, col: L.col });
      g.restore();
    }
    function drawLine(g, L, t) {
      let x = L.x0;
      for (let i = 0; i < L.chars.length; i++) { charRise(g, L, i, t, x); x += L.adv[i]; }
    }
    function cursor(g, lines, t) {
      let cur = null;
      for (const L of lines) if (t >= L.st[0] - .01 && t < L.end + .4) cur = L;
      if (!cur) return;
      let x = cur.x0;
      for (let i = 0; i < cur.chars.length; i++) { if (t < cur.st[i]) break; x = cur.x0 + cur.adv.slice(0, i).reduce((a, b) => a + b, 0) + cur.adv[i] * easeOut(prog(t, cur.st[i], cur.st[i] + .12 * f)); }
      if (t > cur.end + .15 && Math.floor((t - cur.end) * 6) % 2 === 1) return;
      g.fillStyle = P.acc; g.fillRect(x + cur.s * .02, cur.top + cur.s * .04, Math.max(6, cur.s * .045), cur.s * .84);
    }
    const mono = (g, s, x, y, oo = {}) => XM.txt(g, s, x, y, { fam: 'mono', size: oo.size || 16, w: 500, col: oo.col || hudC, ls: oo.ls ?? 1.8, align: oo.align, alpha: oo.alpha });
    function drawCols(g, t) {
      cols.forEach((c, ci) => {
        const Ly = LAY[ci]; if (!Ly || t < c.from || t >= c.to) return;
        const first = Ly.lines[0];
        if (t >= first.st[0] - .03) {
          const s = XM.scramble(c.tag, t, first.st[0] - .03, .35, 11 + ci);
          mono(g, s, c.align === 'left' ? colX(c) : colX(c) - XM.measure(g, c.tag, { fam: 'mono', size: 16, ls: 1.8 }), Ly.tagY, { align: 'left' });
        }
        for (const L of Ly.lines) drawLine(g, L, t);
        if (t < c.to) cursor(g, Ly.lines, t);
        let y = Ly.bottom + 26 + 26;
        for (const s of c.subs) {
          if (t < s.at) continue;
          const str = XM.scramble(s.text.toUpperCase(), t, s.at, Math.min(1.2, s.text.length * .035), 21 + ci);
          const fw = XM.measure(g, s.text.toUpperCase(), { fam: 'mono', size: 26, ls: 6 });
          XM.txt(g, str, c.align === 'left' ? colX(c) : colX(c) - fw, y, { fam: 'mono', size: 26, w: 500, ls: 6, col: hex(textC) });
          y += 40;
        }
      });
    }
    // Labels under the cells / after merging (text to read)
    const SPL = o.split || {}, MRG = o.merge || {};
    const labs = sp == null ? [] : (SPL.labels || []).slice(0, 2).map((l, i) => {
      const L = typeof l === 'string' ? { text: l } : l;
      return { text: L.text, at: L.at ?? sp + (.6 + .25 * i) * f, col: colOf(L.color, i ? 'accent' : 'text'), size: L.size || SPL.size || 72, i };
    });
    const mlab = mg != null && MRG.label ? { text: MRG.label, at: MRG.at_label ?? mg + .7 * f, col: colOf(MRG.color, 'text'), size: MRG.size || 72 } : null;
    function centerLabel(g, lab, cx, base, t, alpha = 1) {
      if (t < lab.at || alpha <= 0) return;
      const chars = [...lab.text], s = lab.size;
      const adv = chars.map(ch => XM.measure(g, ch, { fam: 'zh', size: s, w: 600 }) + s * .03);
      const tot = adv.reduce((a, b) => a + b, 0);
      let x = cx - tot / 2;
      g.save(); g.globalAlpha *= alpha;
      chars.forEach((ch, i) => {
        const k = easeOut(prog(t, lab.at + i * per, lab.at + i * per + .12));
        if (k > 0) { g.save(); g.beginPath(); g.rect(x - 4, base - s * .95, adv[i] + 8, s * 1.15); g.clip(); XM.txt(g, ch, x, base + (1 - k) * s, { fam: 'zh', size: s, w: 600, col: lab.col }); g.restore(); }
        x += adv[i];
      });
      g.restore();
    }

    // ---------- Specimen box ----------
    function corner(g, x, y, sx, sy, c) { g.fillStyle = c; g.fillRect(sx > 0 ? x : x - 30, sy > 0 ? y : y - 2, 30, 2); g.fillRect(sx > 0 ? x : x - 2, sy > 0 ? y : y - 30, 2, 30); }
    function specimen(g, R, lab, alpha = 1) {
      const [L, T, Rr, Bm] = R;
      g.save(); g.globalAlpha *= alpha;
      corner(g, L, T, 1, 1, hudC); corner(g, Rr, T, -1, 1, hudC); corner(g, L, Bm, 1, -1, hudC); corner(g, Rr, Bm, -1, -1, hudC);
      if (lab.tl1) { mono(g, lab.tl1, L + 13, T + 27); if (lab.tl2) mono(g, lab.tl2, L + 13, T + 47); }
      if (lab.tr1) { mono(g, lab.tr1, Rr - 13, T + 27, { align: 'right' }); if (lab.tr2) mono(g, lab.tr2, Rr - 13, T + 47, { align: 'right' }); }
      if (lab.bl1) { mono(g, lab.bl1, L + 13 + (lab.blTri != null ? 18 : 0), Bm - 33); if (lab.blTri != null) tri(g, L + 19, Bm - 39, 6, lab.blTri, hudC); if (lab.bl2) mono(g, lab.bl2, L + 13, Bm - 13); }
      if (lab.br) mono(g, lab.br, Rr - 13, Bm - 13, { align: 'right' });
      if (lab.arrow) { mono(g, lab.arrow[0], L + 13, T + 47); const x = L + 13 + XM.measure(g, lab.arrow[0], { fam: 'mono', size: 16, ls: 1.8 }) + 4; arrow(g, x, T + 41, 22, hudC); mono(g, lab.arrow[1], x + 28, T + 47); }
      g.restore();
    }
    const BOX = o.box === false ? null : { id: 'SPECIMEN_001', tag: 'LIQUID GLASS', ...(o.box || {}) };
    function drawBox(g, t) {
      if (!BOX || t < at + .2) return;
      let G = geom(Math.max(at + .2, t - .05)); const a = prog(t, at + .2, at + .3);
      { const G1 = geom(t); if (G1.mode !== G.mode || G1.boxes.length !== G.boxes.length) G = G1; }   // no smear when the shape mode changes
      const Tp = `T+${(t - at).toFixed(2)}`;
      const rect = b => [b.x - b.w / 2 - 26, b.y - b.h / 2 - 22, b.x + b.w / 2 + 26, b.y + b.h / 2 + 22];
      if (G.mode === 'one') {
        const b = G.boxes[0], u = t - at, inhale = Math.cos(u * TAU / 2.4 - .6) > 0;
        const swinging = sw != null && t >= sw && t < sw + .9 * f;
        specimen(g, rect(b), { tl1: BOX.id, tl2: BOX.tag, tr1: `Ø ${String(Math.round(b.w)).padStart(3, '0')} PX`, tr2: 'VISC 0.82 PA·S',
          bl1: swinging ? 'SWING' : inhale ? 'BREATH IN' : 'BREATH OUT', blTri: swinging ? null : inhale, bl2: swinging ? 'STATE  TRANSIT' : 'STATE  STABLE', br: Tp }, a);
      } else if (G.mode === 'pulse' || G.mode === 'peanut') {
        const b = G.boxes[0], pulse = Math.min(4, Math.floor((t - sp) / (.13 * f)) + 1);
        specimen(g, rect(b), G.mode === 'peanut'
          ? { tl1: BOX.id, arrow: ['MITOSIS 1', '2'], tr1: `NECK ${String(G.neck).padStart(3, '0')} PX`, tr2: 'TENSION  HIGH', bl1: 'BREATH HOLD', bl2: `PULSE  ${String(pulse).padStart(2, '0')}/04` }
          : { tl1: BOX.id, tl2: BOX.tag, tr1: `Ø ${String(Math.round(b.w)).padStart(3, '0')} PX`, tr2: 'VISC 0.82 PA·S', bl1: 'BREATH HOLD', bl2: `PULSE  ${String(pulse).padStart(2, '0')}/04`, br: Tp });
      } else if (G.boxes.length === 2) {
        const [A, Bc] = G.boxes;
        specimen(g, rect(A), { tl1: 'CELL_A', tl2: 'SPLIT OK' });
        specimen(g, rect(Bc), { tr1: 'CELL_B', tr2: 'SPLIT OK', br: Tp });
      } else {
        const b = G.boxes[0];
        specimen(g, rect(b), { tl1: BOX.id, arrow: [G.mode === 'merged' ? 'MERGED 2' : 'MERGING 2', '1'], tr1: `Ø ${String(Math.round(b.w)).padStart(3, '0')} PX`, tr2: 'VISC 0.82 PA·S', bl1: 'STATE  STABLE', br: Tp });
      }
    }

    // ---------- HUD ----------
    const HUD = o.hud === false ? null : { top: '03 — BREATH · NEGATIVE SPACE', tl: 'FIG.03', bl: '03 BREATH', ...(o.hud || {}) };
    const evts = [at, ...beats, sw, sp, mg].filter(v => v != null);
    function drawHud(g, t) {
      if (!HUD) return;
      XM.FX.hud(g, t - at, { tl: HUD.tl, bl: HUD.bl, br: HUD.br, color: dark ? 'text' : hex(mixc(textC, [8, 10, 12], .5)), a: dark ? .8 : .9, size: 15 });
      if (t >= at + .1 && HUD.top) {
        const s = XM.scramble(HUD.top, t, at + .1, .5, 3), w = XM.measure(g, HUD.top, { fam: 'mono', size: 15, ls: 1.8 });
        mono(g, s, W / 2 - w / 2, 92, { size: 15 });
        const bw = 140 * prog(t, at + .12, at + .2); let x = W / 2 - 70, i = 0; g.fillStyle = hudC;
        while (x < W / 2 - 70 + bw) { const w2 = 1 + Math.floor(hash(40 + i) * 3); if (i % 2 === 0) g.fillRect(x, 102, Math.min(w2, W / 2 - 70 + bw - x), 14); x += w2; i++; }
      }
      g.strokeStyle = hudC; g.lineWidth = 1.2;
      for (const x of [86, W - 86]) { g.beginPath(); g.arc(x, 540, 7, 0, TAU); g.moveTo(x - 13, 540); g.lineTo(x + 13, 540); g.moveTo(x, 527); g.lineTo(x, 553); g.stroke(); }
      // Bottom progress bar: events are ticks
      const x0 = 610, x1 = 1310, yb = H - 80, k = clamp((t - at) / dur, 0, 1);
      g.fillStyle = hudC; g.fillRect(x0, yb, x1 - x0, 2);
      for (const e of evts) { const xx = x0 + (x1 - x0) * clamp((e - at) / dur, 0, 1); g.fillRect(xx, yb - 8, 1.5, 8); }
      g.fillRect(x0 - 1, yb - 14, 2, 15); g.fillRect(x1 - 1, yb - 14, 2, 15);
      g.fillStyle = P.acc; g.fillRect(x0, yb - 1, (x1 - x0) * k, 4);
      g.fillStyle = hudC; g.fillRect(x0 + (x1 - x0) * k - 5, yb - 4, 10, 10);
    }

    // ---------- Main draw ----------
    return XM.shot({ bg: o.bg || 'bg', stage: 'flat', cam: o.cam }, S => (g, t) => {
      if (!LAY) layout(g);
      const gr = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 1150);
      gr.addColorStop(0, bgIn); gr.addColorStop(.55, bgIn); gr.addColorStop(1, bgOut);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      if (t < at) { drawHud(g, t); return; }
      const G = geom(t);

      // Halftone glow (under the bubble)
      if (sw != null && t >= sw && t < sw + .5 * f) {
        const v = (t - sw) / f, Gl = geom(t - .07 * f).boxes[0], a = prog(v, 0, .05) * (1 - prog(v, .38, .5));
        haloDots(g, Gl.x + dir * 30, Gl.y, Gl.w / 2 + 28, Gl.h / 2 + 18, P.acc, 12.5, 6.6, .2, a);
      }
      if (sp != null) {
        const v = (t - sp) / f;
        if (v >= -.03 && v < .5) { const b = G.boxes[0], a = prog(v, -.03, .02) * (1 - prog(v, .4, .5)); haloDots(g, b.x - 60 * (1 - prog(v, .05, .2)), b.y + 18, b.w / 2 + 40, b.h / 2 + 42, P.acc, 10, 5.2, .25, a); }
        if (v >= .55 && v < .8 && G.boxes.length === 2) { const a = prog(v, .55, .57) * (1 - prog(v, .72, .8)); G.boxes.forEach((b, j) => haloDots(g, b.x + (j ? -40 : 40), b.y + 26, b.w / 2 + 36, b.h / 2 + 36, P.acc, 10, 5.2, .25, a)); }
      }
      if (mg != null) { const v = (t - mg) / f; if (v >= .3 && v < .75) { const b = G.boxes[0], a = prog(v, .3, .35) * (1 - prog(v, .6, .75)); haloDots(g, b.x, b.y + 20, b.w / 2 + 40 + 40 * prog(v, .3, .75), b.h / 2 + 40, P.acc, 10, 5, .22, a); } }

      // Statement (under the bubble: the bubble covers the text as it swings over)
      drawCols(g, t);

      // Bubble
      const SC = scene3(), U = SC.uniforms;
      U.uT.value = t - at + 36.1; U.uRot.value = G.rot; U.uRoll.value = G.roll; U.uTilt.value = 0; U.uK.value = G.k;
      U.uBand.value = bandTex(band, P);
      U.uSky.value.copy(v3(skyC)); U.uLiq.value.copy(v3(mixc(accC, [255, 255, 255], .05)));
      U.uLine.value.copy(v3(accC, .88)); U.uEdge.value.copy(v3(accC, .92));
      U.uTint.value.set(.52, .5, .48); U.uTintK.value = dark ? .03 : .07;
      for (let i = 0; i < NB; i++) {
        const b = G.blobs[i];
        if (!b) { U.uBlob.value[i].set(0, 0, 0, 0); continue; }
        U.uBlob.value[i].set(b.x, b.y, b.r, b.ph ?? 0);
        U.uStr.value[i].set(b.sx ?? 1, b.sy ?? 1, b.ang ?? 0, b.amp ?? .05);
      }
      g.save(); g.filter = 'blur(0.6px)'; XM.drawGL(g, SC.scene, SC.cam); g.restore();

      // Beats: halftone ring + four-point stars
      for (const b of beats) {
        if (t < b || t > b + 1) continue;
        const k = prog(t, b, b + .3);
        if (k < 1) for (const bx of G.boxes) {
          const R0 = Math.max(bx.w, bx.h) / 2 + 6 + (G.boxes.length > 1 || mlab || labs.length ? 90 : 150) * easeOut(k);
          ringDots(g, bx.x, bx.y, R0, R0 + 30 * (1 - k) + 2, P.acc, 7, 3.6 * (1 - .7 * k), 1 - k * .6);
        }
        const s = XM.expoOut(prog(t, b + .03, b + .17)), a = 1 - prog(t, b + .62, b + .78);
        if (a > 0 && G.boxes.length === 1) {
          const bx = G.boxes[0], sc = bx.w / 830, mx = bx.x < W / 2 ? -1 : 1;
          g.save(); g.globalAlpha *= a;
          XM.FX.star4(g, bx.x + mx * -250 * sc, bx.y - 340 * sc, 46 * s, starInk, .16, .26);
          XM.FX.star4(g, bx.x + mx * 245 * sc, bx.y - 360 * sc, 22 * s, P.acc, .16, .1);
          XM.FX.star4(g, bx.x + mx * -430 * sc, bx.y - 177 * sc, 14 * s, starInk, .18, 0);
          g.restore();
        }
      }
      // Split: centre star + MITOSIS 1->2
      if (sp != null) {
        const v = (t - sp) / f;
        if (v >= .55 && v < .85) {
          const s = XM.expoOut(prog(v, .55, .62)) * (1 - .3 * prog(v, .78, .85));
          XM.FX.star4(g, CX, CY, 68 * s * D / 860, starInk, .15, -.35 + .5 * prog(v, .55, .85));
          if (v >= .57) {
            const lab = 'MITOSIS 1', lw = XM.measure(g, lab + '  2', { fam: 'mono', size: 22, ls: 6 }) + 30, al = 1 - .7 * prog(v, .8, .85);
            const x = CX - lw / 2, y = CY + 140 * D / 860;
            const s1 = XM.scramble(lab, t, sp + .57 * f, .12, 71);
            XM.txt(g, s1, x, y, { fam: 'mono', size: 22, w: 500, ls: 6, col: hudC, alpha: al });
            if (s1.length === lab.length) { g.save(); g.globalAlpha *= al; arrow(g, x + XM.measure(g, lab, { fam: 'mono', size: 22, ls: 6 }) + 2, y - 8, 28, hudC); g.restore(); XM.txt(g, '2', x + lw - 22, y, { fam: 'mono', size: 22, w: 500, col: hudC, alpha: al }); }
          }
        }
        // Labels of the two cells
        if (labs.length && G.mode !== 'merged') {
          const C = G.boxes.length === 2 ? G.boxes : null;
          const fade = mg != null ? 1 - prog(t, mg, mg + .2 * f) : 1;
          labs.forEach((L, i) => { const cx = C ? C[i].x : CX + (i ? 1 : -1) * Cx; centerLabel(g, L, cx, CY + dc / 2 + 50 + L.size * .9, t, fade); });
        }
        if (mlab) centerLabel(g, mlab, CX, CY + Dm / 2 + 50 + mlab.size * .9, t);
      }
      drawBox(g, t);
      drawHud(g, t);
    });
  }

  Object.assign(XM, { bubble });
})();
