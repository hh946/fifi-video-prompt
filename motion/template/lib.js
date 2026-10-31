// Generic helpers: SVG DOM, deterministic random, easing, keyframes, hand-made shapes. Nothing project-specific.
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) {
    if (k === 'text') e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (parent) parent.appendChild(e);
  return e;
}
function setA(e, attrs) { for (const k in attrs) e.setAttribute(k, attrs[k]); }
function show(e, v) { e.setAttribute('display', v ? 'inline' : 'none'); }

// Deterministic pseudo-random 0..1: same input, same output. Never use Math.random / Date inside render.
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);      // progress of t through [a, b], 0..1
const lin = k => k;
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeIn = k => k * k * k;
const easeInOut = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
function backOut(k, s = 2.2) { const c = s + 1; return 1 + c * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2); } // overshoot ease (pop-in)
// damped oscillation after t0: freq in Hz, decay rate (landing bounce, window wobble)
function wobble(t, t0, freq = 3, decay = 6) { if (t < t0) return 0; const d = t - t0; return Math.exp(-d * decay) * Math.sin(d * freq * 2 * Math.PI); }
// impact envelope: 1 at t0, then exponential decay (white flash, shake amount, squash)
function pulse(t, t0, decay = 8) { return t < t0 ? 0 : Math.exp(-(t - t0) * decay); }
// beat pulse: 1 at the start of every beat, then decays; drives bobbing to the rhythm (beat in seconds)
function beatPulse(t, beat = 0.5, decay = 10) { const b = t / beat; return Math.exp(-(b - Math.floor(b)) * beat * decay); }

// keyframes: [[t, v], [t, v, easeFn], ...]; each segment can set its own easing (default easeInOut)
function kf(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1, ef] = keys[i];
      return v0 + (v1 - v0) * (ef || easeInOut)((t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}

// ---------- hand-made shapes ----------
function starPts(cx, cy, n, r1, r2, seed = 0, jag = 0) {   // burst / star points; jag > 0 makes it irregular
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const r = (i % 2 ? r2 : r1) * (1 + jag * (hash(seed + i) - .5));
    const a = Math.PI * i / n - Math.PI / 2;
    p.push((cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1));
  }
  return p.join(' ');
}
function roughRectPath(x, y, w, h, j = 3, seed = 0) {        // slightly wonky rectangle
  const r = i => (hash(seed + i) - .5) * 2 * j;
  return `M${x + r(1)},${y + r(2)} L${x + w + r(3)},${y + r(4)} L${x + w + r(5)},${y + h + r(6)} L${x + r(7)},${y + h + r(8)} Z`;
}
function tornEdge(x0, x1, y, amp, seed, step = 18) {          // torn-paper edge as a point list
  let d = '';
  for (let x = x0, i = 0; x <= x1 + step; x += step, i++) d += `${Math.min(x, x1)},${(y + (hash(seed + i) - .5) * amp).toFixed(1)} `;
  return d.trim();
}
function tapeRect(parent, x, y, w, rot, fill = '#e9dcb2') {   // tape strip
  return el('rect', { x: x - w / 2, y: y - 20, width: w, height: 40, fill, opacity: .85, stroke: '#b9a77d', 'stroke-width': 2, transform: `rotate(${rot} ${x} ${y})` }, parent);
}
