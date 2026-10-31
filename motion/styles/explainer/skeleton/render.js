// render(t) is a pure function of time. XK.play shows / hides shots and runs transitions; the signature is drawn last.
function render(t, depth = 0) {
  XK.play(t);
  if (typeof WATERMARK !== 'undefined') watermark(t, WATERMARK);
  // Video-frame assets load on demand: if this frame still waits for an image, render the same t again once it's in
  // (render_frames.js awaits the returned promise).
  const late = typeof XM !== 'undefined' && XM.late ? XM.late() : null;
  if (late && depth < 3) return late.then(() => render(t, depth + 1));
}

window.render = render;
window.ready = document.fonts.ready
  .then(() => Promise.all([...document.fonts].map(f => f.load())))
  .then(() => (typeof XM !== 'undefined' ? XM.ready() : null))          // component data files (map masks, glyphs)
  // Wait for render(0) and its late assets; otherwise a late render(0) could overwrite a later frame.
  .then(() => { XK.prepare(); return Promise.resolve(render(0)).then(() => [...document.fonts].map(f => f.family + ':' + f.status)); });
(() => {
  const q = new URLSearchParams(location.search);
  if (q.has('t')) window.ready.then(() => render(parseFloat(q.get('t'))));
  if (q.has('play')) window.ready.then(() => {
    const t0 = performance.now();
    const tick = () => { render(((performance.now() - t0) / 1000) % VIDEO.duration); requestAnimationFrame(tick); };
    tick();
  });
})();
