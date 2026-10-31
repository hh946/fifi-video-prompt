// XS.rank: leaderboard climb -> cut to the real leaderboard screenshot. A tilted 3D leaderboard board; the target row
// climbs past other rows (each one bumped down a place), lands with an impact, the camera pulls back and flattens to
// show the whole board, then optionally cuts to a real screenshot aligned row for row and circles the target.
// Docs: docs/components/xs-rank.md
//
// Animation logic source (motion logic ported directly, visuals redrawn in the XM design system):
//   repo    https://github.com/w52m/qwen3-8-max-text-arena-rank-climb
//   file    src/TextArenaRankClimb.tsx (Remotion / React, portrait 1080x1920, 8 s)
//   commit  3bddb3264c588ff3cc63bb0f9a24b710d2b2095c (2026-09-30)
//   license the repository has no LICENSE file. See also xm-assets/rank/SOURCE.md.
//   Ported: camera locked on the target row, tilted perspective flattening over time (rotateX 57->39->24->0, rotateY /
//           rotateZ easing out together), each row the target passes is bumped down one place, blur and opacity by
//           distance from the target row, landing impact (z lifts -> drops back), final pull-back and flatten revealing
//           the whole board. Upstream camera keyframes (frames 38/158/176/230) are mapped to event times.
//   Not copied: the beige web skin (rounded white cards, green glow, gradient progress bar, Arial). Replaced with the XM
//           design system: three stage colours, Unbounded numbers, DM Mono model names / HUD, Source Han Sans for
//           Chinese, the target row as a solid accent block, corner bracket marks. Upstream's landing shake / motion
//           blur / green flash / trails only with hit:true.
//   Added: proof - after the climb and pull-back, cut to the real leaderboard screenshot. The screenshot sits on the
//           same 3D board, aligned to the redrawn target row via rowBox, so rows do not jump at the cut.
//
// Rendering: XM.shot's canvas draws the stage; the leaderboard is CSS 3D (one perspective container + a preserve-3d
//   board inside L.cam), styled per frame from t (pure function, no CSS transitions); a small canvas on the board draws
//   the landing brackets; a top screen canvas draws the HUD, the screenshot viewfinder and marks on the screenshot.
//   Screen coordinates come from the same 3D projection (exact once the board is flat).
//
// ───────────────────────────────── XS.rank(o) ─────────────────────────────────
// For "X reaches #1 on Y leaderboard / breaks into the top three / ranks highest among Z". One shot, 4-5 beats:
//   entry -> climb (one beat per row passed) -> land -> pull back -> cut to the real screenshot + circle.
//   at      : number  entry time (absolute s, usually the shot's t0).
//   rows    : [{ rank, name, sub, score, err, extra, spread, tag }]  leaderboard rows; rank is the **real final rank**
//             (as in the screenshot). name model name (DM Mono); sub vendor / license (small); score (Unbounded); err
//             confidence interval (9 for +-9); extra votes etc.; spread rank range; tag small label (e.g.
//             'PRELIMINARY'). Include the target row in rows (same name as target.name); otherwise target's fields are used.
//   target  : { name, from, to }  the target model climbs from rank from to rank to (to = real rank in the screenshot).
//             The climb is an illustrative "enters / overtakes" motion: ranks before from are not real history, so the
//             voiceover should talk about the final rank.
//   climb   : { at, dur }   climb (default from at+0.45 for 2.8 s). Fast then slow, the last few rows one beat each:
//             calm mode cubic-bezier(.3,.72,.3,1), hit:true uses upstream's (.22,1,.36,1) (harder start). Pull-back /
//             push-in use smoothstep in calm mode, upstream easing with hit.
//   land    : { at }        landing (default = end of climb). The target row drops back onto the board, corner brackets
//             close onto its cell.
//   reveal  : { at, dur, fit }  pull back and flatten to show the whole board (default from land+0.45 for 1.3 s).
//             fit: 'all' (whole board, default) | 'width' (fill the width, top aligned) | number (board -> screen scale).
//   proof   : { src, iw, ih, crop:[x,y,w,h], rowBox:[x,y,w,h], at, dur, mode, label, mark:{x,at,kind}, zoom:{at,dur,scale,x} }
//             real screenshot (optional). src image path (relative to the page); iw/ih image pixel size; crop shows only
//             this part (default whole image); rowBox = pixel box of the **target row** in the screenshot (the final-rank
//             row). The screenshot is scaled by rowBox to the redrawn row height, left aligned, on the same board: redraw
//             with the screenshot's row height / column positions (see geo / columns) and the whole table lines up.
//             at cut start (default reveal end +0.35); dur 0.45; mode 'scan' (a line sweeps down, the real screenshot
//             appears above it, default) | 'cut' | 'dissolve'; label viewfinder category text (default Chinese for
//             "screenshot"); mark circles the target row: x:[x0,x1] span to mark (board coords, default row left+40 to
//             68% of row width, i.e. rank -> score), at (default 0.25 s before zoom ends), kind 'bracket' corner
//             brackets (default) | 'sweep' highlighter (multiply);
//             zoom pushes into the target row: at (default at+dur+0.15), dur 1.3, scale (default fits mark.x to the safe
//             area, <= 1.8), x (default middle of mark.x).
//   columns : [{ key, label, x, align, w }]  columns (board coords). key: 'rank' | 'name' (with sub) | 'score' (with
//             err, tag) | any other field name (shown as-is in DM Mono). Default rank 154 centred / rank range 389
//             centred / model 600 / score 1144 / extra 1540 centred (matching the lmarena screenshot at 2x).
//   geo     : { w, h, rowH, rowY, rowX, rowW, headY, headH }  board size (board coords). Default 1824x1720, row height
//             106, first row top 531, row left 34, row width 1756, header 442-531 - the layout of a 1440-wide lmarena
//             text leaderboard screenshot at 2x. For another leaderboard measure it from the screenshot (see
//             docs/components/xs-rank.md).
//   title   : { zh, en, meta } | string  board title (appears on pull-back): zh Source Han Sans 900; en small; meta
//             date / votes (DM Mono). Also used in the bottom-left HUD.
//   tone    : 'ink' | 'paper' | 'accent'  stage (default follows the caller: built inside XK.tone('paper', ...) = paper).
//   hud     : { tl, bl, br } | false     corner HUD. br defaults to Chinese for "redrawn", switches to proof.label after
//             the cut to the screenshot.
//   hit     : false  true = upstream pacing: entry motion blur + trails, landing spring overshoot + shake + blur + accent
//             flash (for an opening hook).
//   cam     : XK camera keyframes (rarely needed, the component has its own camera).
//   Returns { L, update } for XK.seq. Use drift:false or a very small drift (the component moves its own camera).
//
// Suggested sounds (XM.DS.SFX): entry swoosh(at); climb ratchet(climb.at, dur=climb.dur); landing SFX.land(land.at);
//   pull-back whoosh(reveal end, align:'end'); screenshot cut snap(proof.at); circle pop(mark.at). With hit:true the
//   landing can use punch.
// Rules: text is flat solid colour; deterministic (no Math.random / Date); all times are absolute seconds.
(() => {
  const { W, H } = XM;
  const D2R = Math.PI / 180;
  const c01 = k => Math.max(0, Math.min(1, k));
  const mix = (a, b, k) => a + (b - a) * k;
  const FAMS = { zh: 'HeiSC', mono: 'Mono', unb: 'Unb' };
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  const reg = (fam, s) => { s = String(s ?? ''); let a = '', z = ''; for (const ch of s) (CJK.test(ch) ? (z += ch) : (a += ch)); if (z) XM.note('HeiSC', z); if (a) XM.note(FAMS[fam] || fam, a); };

  // ---------- easing ----------
  function bezier(x1, y1, x2, y2) {      // CSS cubic-bezier (upstream Easing.bezier(.22,1,.36,1))
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = u => ((ax * u + bx) * u + cx) * u, Y = u => ((ay * u + by) * u + cy) * u;
    return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, u = x; for (let i = 0; i < 40; i++) { u = (lo + hi) / 2; if (X(u) < x) lo = u; else hi = u; } return Y(u); };
  }
  const EASE = bezier(.22, 1, .36, 1);                    // upstream (used with hit:true)
  const EASE_X = bezier(.3, .72, .3, 1);                  // calm mode: softer start (keeps hard impact frames <= 6 per second)
  // monotone cubic interpolation (Fritsch-Carlson): upstream is piecewise linear with corners between segments; this passes through the same keys with continuous speed and zero speed at the end (no jolt)
  function curve(K) {
    const n = K.length, xs = K.map(k => k[0]), ys = K.map(k => k[1]), d = [], m = [];
    for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]);
    m[0] = d[0]; m[n - 1] = 0;
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return t => {
      if (t <= xs[0]) return ys[0]; if (t >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (t > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], u = (t - xs[i]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
    };
  }
  const spring = (x, f = 2.2, z = .32) => { if (x <= 0) return 0; const w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + z * w / wd * Math.sin(wd * x)); };
  const interp = (v, xs, ys) => { if (v <= xs[0]) return ys[0]; for (let i = 0; i < xs.length - 1; i++) if (v <= xs[i + 1]) return mix(ys[i], ys[i + 1], (v - xs[i]) / (xs[i + 1] - xs[i])); return ys[ys.length - 1]; };

  // ---------- default layout (= board coords of a 1440-wide arena.ai text leaderboard screenshot at 2x) ----------
  const GEO = { w: 1824, h: 1720, rowH: 106, rowY: 531, rowX: 34, rowW: 1756, headY: 442, headH: 89 };
  const COLS = [
    { key: 'rank', label: 'RANK', x: 154, align: 'center', w: 220 },
    { key: 'spread', label: 'RANGE', x: 389, align: 'center', w: 220 },
    { key: 'name', label: 'MODEL', x: 600 },
    { key: 'score', label: 'SCORE', x: 1144 },
    { key: 'extra', label: 'VOTES', x: 1540, align: 'center', w: 200 },
  ];
  const PERSP = 1800, OX = W / 2, OY = H * .48;

  function rank(o) {
    const P = XM.DS.tone(o.tone || (XM.DS.lum(XK.col('bg')) > .5 ? 'paper' : 'ink'));
    const PP = XM.DS.tone('paper');                       // marks on the screenshot (light web page) use the light palette
    const S = XM.DS.S, G = { ...GEO, ...(o.geo || {}) }, BW = G.w, BH = G.h, BL = (W - BW) / 2, BT = (H - BH) / 2;
    const cols = o.columns || COLS, hit = !!o.hit;
    const tg = o.target, F = tg.from, T = tg.to;
    const tRow = { ...(o.rows.find(r => r.name === tg.name) || {}), ...tg, rank: T };
    const others = o.rows.filter(r => r.name !== tg.name).map(r => ({ ...r, pre: (r.rank > T && r.rank <= F) ? r.rank - 1 : r.rank }));
    const minR = Math.min(T, ...others.map(r => r.pre)), maxR = Math.max(F, ...others.map(r => r.rank));
    const slotTop = s => G.rowY + (s - minR) * G.rowH;

    // ---- timing ----
    const at = o.at;
    const C = { at: at + .45, dur: 2.8, ...(o.climb || {}) };
    const Ld = { at: C.at + C.dur, ...(o.land || {}) };
    const Rv = { at: Ld.at + .45, dur: 1.3, fit: 'all', ...(o.reveal || {}) };
    const R1 = Rv.at + Rv.dur;
    const pf = o.proof ? { at: R1 + .35, dur: .45, mode: 'scan', label: 'SCREENSHOT', ...o.proof } : null;
    if (pf) {
      pf.mark = { kind: 'bracket', x: [G.rowX + 40, G.rowX + G.rowW * .68], ...(pf.mark || {}) };
      const mw0 = pf.mark.x[1] - pf.mark.x[0];
      pf.zoom = { at: pf.at + pf.dur + .15, dur: 1.3, scale: Math.min(1.8, (W - 2 * XM.DS.SAFE - 80) / mw0), x: (pf.mark.x[0] + pf.mark.x[1]) / 2, ...(pf.zoom || {}) };
      if (pf.mark.at == null) pf.mark.at = pf.zoom.at + pf.zoom.dur - .25;
      pf.crop = pf.crop || [0, 0, pf.iw, pf.ih];
      pf.k = G.rowH / pf.rowBox[3];                                        // screenshot px -> board coords
      pf.ox = G.rowX - pf.rowBox[0] * pf.k; pf.oy = slotTop(T) - pf.rowBox[1] * pf.k;
      pf.box = [pf.ox + pf.crop[0] * pf.k, pf.oy + pf.crop[1] * pf.k, pf.crop[2] * pf.k, pf.crop[3] * pf.k];
    }

    // ---- target row position (float, in rank cells) and when each row is passed ----
    const CE = hit ? EASE : EASE_X;
    const slotF = t => {
      const climb = CE((t - C.at) / C.dur), ent = hit ? 3 * (1 - spring((t - at) / 1.1, 1.2, .55)) : 1.6 * (1 - XM.expoOut(c01((t - at) / .6)));
      return F - (F - T) * climb + Math.max(0, ent);
    };
    for (const r of others) if (r.rank > T && r.rank <= F) {             // the moment the target's float rank crosses pre+0.5 (inverse of the easing)
      const goal = (F - r.pre - .5) / (F - T); let lo = 0, hi = 1;
      for (let i = 0; i < 40; i++) { const u = (lo + hi) / 2; if (CE(u) < goal) lo = u; else hi = u; }
      r.passAt = C.at + lo * C.dur;
    }
    const disp = (r, t) => r.passAt == null ? 0 : EASE(c01((t - r.passAt + .22) / .44));
    const impactK = t => t < Ld.at ? 0 : hit ? spring(t - Ld.at, 2.4, .3) : XM.expoOut(c01((t - Ld.at) / .45));
    const LIFT = 110;
    const lift = t => LIFT * (1 - impactK(t));

    // ---- camera: upstream keyframes 0/28/42/158/176/230 -> event times ----
    const tk = [at, at + (C.at - at) * .67, C.at, Ld.at, Ld.at + (Rv.at - Ld.at) * .9, R1];
    let sR, aimR;
    { const fit = Rv.fit;
      if (fit === 'all') { sR = Math.min((W - 2 * 200) / BW, (H - 2 * 72) / BH); aimR = [BW / 2, BH / 2]; }
      else { sR = fit === 'width' ? (W - 2 * 150) / BW : +fit; const vh = H / sR, ty = slotTop(T) + G.rowH / 2;
        aimR = [BW / 2, Math.max(vh / 2 - 60, Math.min(BH - vh / 2 + 60, ty - vh * .12))]; } }
    const SC = curve(tk.map((x, i) => [x, [1.38, 1.4, 1.42, 1.4, 1.3, sR][i]]));
    const RX = curve(tk.map((x, i) => [x, [57, 46, 39, 24, 17, 0][i]]));
    const RY = curve(tk.map((x, i) => [x, [-20, -16, -13, -6, -4, 0][i]]));
    const RZ = curve(tk.map((x, i) => [x, [-5.6, -4.2, -3.2, -1.3, -.9, 0][i]]));
    const FXc = curve(tk.map((x, i) => [x, [480, 540, 600, 680, 700, aimR[0]][i]]));
    const revK = t => (hit ? EASE : XM.smooth)(c01((t - Rv.at) / Rv.dur));

    // point on the board (board coords, z toward the camera) -> container coords (before perspective) / screen coords
    function xf(p, c) {
      let x = p[0] - BW / 2, y = p[1] - BH / 2, z = p[2] || 0, a, b;
      a = c.rz * D2R; [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
      b = c.ry * D2R; [x, z] = [x * Math.cos(b) + z * Math.sin(b), -x * Math.sin(b) + z * Math.cos(b)];
      a = c.rx * D2R; [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
      return [BL + BW / 2 + c.s * x + c.cx, BT + BH / 2 + c.s * y + c.cy, z];       // CSS scale() only scales x / y
    }
    function project(p, c) { const [X, Y, Z] = xf(p, c), f = PERSP / (PERSP - Z); return [OX + (X - OX) * f, OY + (Y - OY) * f]; }
    function aim(c, p, sx, sy) {           // solve the translation that puts board point p exactly at screen (sx, sy): camera lock
      c.cx = 0; c.cy = 0; const [X, Y, Z] = xf(p, c), f = PERSP / (PERSP - Z);
      c.cx = (sx - OX) / f + OX - X; c.cy = (sy - OY) / f + OY - Y; return c;
    }
    function cam(t) {
      const yT = slotTop(Math.min(slotF(t), maxR + 3)) + G.rowH / 2;
      if (pf && t >= pf.zoom.at) {        // screenshot push-in: board is already flat
        const k = XM.smooth(c01((t - pf.zoom.at) / pf.zoom.dur)), s = mix(sR, pf.zoom.scale, k);
        return aim({ s, rx: 0, ry: 0, rz: 0 }, [mix(aimR[0], pf.zoom.x, k), mix(aimR[1], slotTop(T) + G.rowH / 2, k), 0], W / 2, H / 2);
      }
      const k = revK(t), c = { s: SC(t), rx: RX(t), ry: RY(t), rz: RZ(t) };
      return aim(c, [mix(FXc(t), aimR[0], k), mix(yT, aimR[1], k), lift(t) * (1 - k)], W / 2, mix(H * .53, H / 2, k));
    }

    // ---------------- nodes ----------------
    const shot = XM.shot({ bg: P.bg, stage: 'flat', cam: o.cam }, Sx => {
      const L = Sx.L;
      const wrap = document.createElement('div');
      wrap.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;perspective:${PERSP}px;perspective-origin:${OX}px ${OY}px;overflow:hidden;`;
      const board = document.createElement('div');
      board.style.cssText = `position:absolute;left:${BL}px;top:${BT}px;width:${BW}px;height:${BH}px;transform-origin:50% 50%;transform-style:preserve-3d;`;
      wrap.appendChild(board);
      L.cam.insertBefore(wrap, L.front);
      const ov = document.createElement('canvas'); ov.width = W; ov.height = H; ov.style.cssText = 'position:absolute;left:0;top:0;';
      L.cam.insertBefore(ov, L.front);
      const og = ov.getContext('2d');

      const div = (parent, css, txt) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;' + css; if (txt != null) d.textContent = txt; parent.appendChild(d); return d; };
      const font = (fam, size, w = 500, extra = '') => `font-family:${FAMS[fam]},HeiSC;font-size:${size}px;font-weight:${w};line-height:1;white-space:nowrap;${extra}`;

      // board top: title + meta + table header (appear on pull-back)
      const ti = typeof o.title === 'string' ? { zh: o.title } : (o.title || {});
      const head = div(board, `left:0;top:0;width:${BW}px;height:${G.rowY}px;`);
      if (ti.en) { div(head, `left:${G.rowX}px;top:22px;${font('mono', 24, 500, `letter-spacing:4px;color:${P.mute};`)}`, ti.en); reg('mono', ti.en); }
      if (ti.zh) { div(head, `left:${G.rowX - 4}px;top:62px;${font('zh', 96, 900, `color:${P.fg};letter-spacing:-1px;`)}`, ti.zh); reg('zh', ti.zh); }
      if (ti.meta) { div(head, `left:${G.rowX}px;top:214px;${font('mono', 28, 500, `color:${P.mute};letter-spacing:1px;`)}`, ti.meta); reg('mono', ti.meta); }
      div(head, `left:${G.rowX}px;top:${G.headY}px;width:${G.rowW}px;height:3px;background:${P.fg};`);
      for (const c of cols) if (c.label) {
        const al = c.align || 'left', w = c.w || 400, left = al === 'center' ? c.x - w / 2 : al === 'right' ? c.x - w : c.x;
        div(head, `left:${left}px;top:${G.headY}px;width:${w}px;height:${G.headH}px;display:flex;align-items:center;justify-content:${al === 'center' ? 'center' : al === 'right' ? 'flex-end' : 'flex-start'};${font('zh', 28, 700, `color:${P.mute};`)}`, c.label);
        reg('zh', c.label);
      }

      // rows
      function mkRow(r, isT) {
        const fg = isT ? P.onAccent : P.fg, mute = isT ? P.onAccent : P.mute;
        const el = div(board, `left:${G.rowX}px;top:0;width:${G.rowW}px;height:${G.rowH}px;box-sizing:border-box;${isT ? `background:${P.accent};` : `border-top:2px solid ${P.line};`}will-change:transform,opacity,filter;`);
        const cell = (c, css) => { const al = c.align || 'left', w = c.w || 520, left = (al === 'center' ? c.x - w / 2 : al === 'right' ? c.x - w : c.x) - G.rowX;
          return div(el, `left:${left}px;top:0;width:${w}px;height:${G.rowH}px;display:flex;align-items:center;justify-content:${al === 'center' ? 'center' : al === 'right' ? 'flex-end' : 'flex-start'};${css}`); };
        const R = { r, el, isT };
        for (const c of cols) {
          if (isT && c.key === 'spread') continue;              // the rank range is final data; showing it on the target row during the climb would contradict itself
          if (c.key === 'rank') { R.rk = cell(c, font('unb', isT ? 80 : 36, isT ? 900 : 600, `color:${fg};letter-spacing:-1px;`)); R.rk.textContent = String(r.rank); reg('unb', '0123456789'); }
          else if (c.key === 'name') {
            const d = cell(c, 'flex-direction:column;align-items:flex-start;justify-content:center;gap:10px;');
            div(d, `position:relative;${font('mono', isT ? 40 : 34, 500, `color:${fg};`)}`, r.name); reg('mono', r.name);
            if (r.sub) { div(d, `position:relative;${font('mono', 21, 500, `color:${mute};opacity:${isT ? .72 : 1};`)}`, r.sub); reg('mono', r.sub); }
          } else if (c.key === 'score') {
            const d = cell(c, 'gap:16px;');
            div(d, `position:relative;${font('unb', isT ? 40 : 34, 700, `color:${fg};letter-spacing:-1px;`)}`, r.score); reg('unb', String(r.score ?? ''));
            if (r.err != null) { div(d, `position:relative;${font('mono', 22, 500, `color:${mute};opacity:${isT ? .72 : 1};`)}`, '±' + r.err); reg('mono', '±' + r.err); }
            if (r.tag) { div(d, `position:relative;padding:7px 10px 6px;border:2px solid ${isT ? P.onAccent : P.line};${font('mono', 16, 500, `color:${mute};letter-spacing:2px;`)}`, r.tag); reg('mono', r.tag); }
          } else if (r[c.key] != null) { cell(c, font('mono', 28, 500, `color:${c.key === 'spread' ? mute : fg};`)).textContent = r[c.key]; reg('mono', r[c.key]); }
        }
        if (isT) R.bar = div(el, `left:0;bottom:0;height:5px;width:${G.rowW}px;transform-origin:0 0;background:${P.onAccent};opacity:.55;`);
        return R;
      }
      const RO = others.map(r => mkRow(r, false));
      const TR = mkRow(tRow, true);
      const trails = hit ? [1, 2].map(i => div(board, `left:${G.rowX}px;top:0;width:${G.rowW}px;height:${G.rowH}px;background:${P.accent};`)) : [];

      // landing brackets: small canvas on the board (moves with the 3D)
      const MP = 90, MR = 2, mx0 = G.rowX - MP, my0 = slotTop(T) - MP, mw = G.rowW + MP * 2, mh = G.rowH + MP * 2;
      const mc = document.createElement('canvas'); mc.width = mw * MR; mc.height = mh * MR;
      mc.style.cssText = `position:absolute;left:${mx0}px;top:${my0}px;width:${mw}px;height:${mh}px;`;
      board.appendChild(mc); const mg = mc.getContext('2d'); let mDirty = true;

      // real screenshot: same board, aligned by rowBox
      let pImg = null, pWrap = null, pLine = null, pSweep = null;
      if (pf) {
        const [x, y, w, h] = pf.box;
        pWrap = div(board, `left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;display:none;background:#fff;`);
        pImg = new Image(); pImg.src = pf.src; XM.asset(pImg.decode().catch(() => console.error('XS.rank: failed to load screenshot: ' + pf.src)));
        pImg.style.cssText = `position:absolute;left:${-pf.crop[0] * pf.k}px;top:${-pf.crop[1] * pf.k}px;width:${pf.iw * pf.k}px;height:${pf.ih * pf.k}px;max-width:none;`;
        pWrap.appendChild(pImg);
        pSweep = div(board, `left:${pf.mark.x[0]}px;top:${slotTop(T) + 8}px;height:${G.rowH - 16}px;width:${pf.mark.x[1] - pf.mark.x[0]}px;transform-origin:0 0;background:${PP.mark};mix-blend-mode:multiply;opacity:.9;display:none;`);
        pLine = div(board, `left:${x - 30}px;top:0;width:${w + 60}px;height:6px;background:${PP.accent};display:none;`);
      }

      const stl = (e, k, v) => { if (e._s === undefined) e._s = {}; if (e._s[k] !== v) { e._s[k] = v; e.style[k] = v; } };

      return (g, t) => {
        // stage
        const kL = pf ? c01((t - pf.at) / Math.max(.01, pf.dur)) : 0;
        XM.DS.stage(g, P);
        if (kL > 0) { g.save(); g.globalAlpha = kL; XM.DS.stage(g, P, { light: true }); g.restore(); }

        const c = cam(t), k = revK(t), kIn = XM.DS.in(t, at, .45);
        // hit: entry motion blur / landing shake + blur
        let blurW = 0, shx = 0, shy = 0, pulse = 0;
        if (hit) {
          const f = (t - at) * 30, fl = (t - Ld.at) * 30;
          blurW = interp(f, [0, 5, 18, 34], [17, 12, 1.5, 0]) + interp(fl, [-5, 0, 4, 13], [0, 0, 5.5, 0]);
          pulse = interp(fl, [-2, 5, 12, 23], [0, 1, .24, 0]);
          shx = Math.sin(t * 30 * 2.9) * pulse * 17; shy = Math.sin(t * 30 * 3.7 + .6) * pulse * 10;
        }
        stl(wrap, 'filter', blurW > .05 ? `blur(${blurW.toFixed(2)}px)` : 'none');
        stl(wrap, 'transform', hit ? `translate(${shx.toFixed(2)}px,${shy.toFixed(2)}px)` : 'none');
        stl(board, 'transform', `translate3d(${c.cx.toFixed(2)}px,${c.cy.toFixed(2)}px,0) scale(${c.s.toFixed(5)}) rotateX(${c.rx.toFixed(4)}deg) rotateY(${c.ry.toFixed(4)}deg) rotateZ(${c.rz.toFixed(4)}deg)`);

        const pfOn = pf && t >= pf.at, pfFull = pf && (pf.mode === 'cut' ? t >= pf.at : t >= pf.at + pf.dur);
        stl(board, 'transformStyle', pfOn ? 'flat' : 'preserve-3d');
        stl(head, 'opacity', c01((t - Rv.at - .15) / (Rv.dur * .7)).toFixed(3));

        // target row
        const sF = slotF(t), yT = slotTop(sF), z = lift(t) * (1 - (pfOn ? 1 : 0));
        stl(TR.el, 'transform', `translate3d(0,${yT.toFixed(2)}px,${z.toFixed(2)}px)`);
        stl(TR.el, 'opacity', c01((t - at) / .14).toFixed(3));
        stl(TR.el, 'visibility', pfFull ? 'hidden' : 'visible');
        TR.rk.textContent = String(Math.max(T, Math.min(F, Math.round(Math.min(sF, F)))));
        if (TR.bar) stl(TR.bar, 'transform', `scaleX(${(.04 + .96 * CE(c01((t - at - .4) / (Ld.at - at - .4)))).toFixed(4)})`);
        for (let i = 0; i < trails.length; i++) {
          const ke = c01((t - at) / 1.2), a = (1 - ke) * (.4 / (i + 1));
          stl(trails[i], 'display', a > .01 ? 'block' : 'none');
          if (a > .01) { stl(trails[i], 'transform', `translate3d(0,${(yT + (i + 1) * 76).toFixed(1)}px,${(54 + (i + 1) * 8)}px)`); stl(trails[i], 'opacity', a.toFixed(3)); stl(trails[i], 'filter', `blur(${3 + (i + 1) * 3}px)`); }
        }
        // other rows: bumped down one place when passed; blurred by distance
        for (const R of RO) {
          const d = disp(R.r, t), y = slotTop(R.r.pre + d), dist = Math.abs(y - yT);
          const op = interp(dist, [80, 440, 850], [.92, .54, .18]) * (1 - k) + k, bl = (1 - k) * Math.max(0, Math.min(4.2, (dist - 90) / 165));
          stl(R.el, 'transform', `translate3d(0,${y.toFixed(2)}px,0)`);
          stl(R.el, 'opacity', (op * kIn).toFixed(3));
          stl(R.el, 'filter', bl > .05 ? `blur(${bl.toFixed(2)}px)` : 'none');
          stl(R.el, 'visibility', pfFull ? 'hidden' : 'visible');
          if (R.rk) { const v = String(R.r.passAt != null && t >= R.r.passAt ? R.r.rank : R.r.pre); if (R.rk.textContent !== v) R.rk.textContent = v; }   // change rank at the same moment as the target row
        }

        // landing brackets (on the board)
        const kB = t < Ld.at ? 0 : XM.DS.hit(t, Ld.at, .3) * (1 - c01((t - Ld.at - .75) / .35));
        if (kB > 0 || mDirty) {
          mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, mc.width, mc.height); mDirty = kB > 0;
          if (kB > 0) { mg.setTransform(MR, 0, 0, MR, -mx0 * MR, -my0 * MR); XM.mark.bracket(mg, G.rowX, slotTop(T), G.rowW, G.rowH, P, kB, { pad: 22, len: 34, lw: 6, color: P.fg }); }
        }

        // screenshot
        if (pf) {
          stl(pWrap, 'display', pfOn ? 'block' : 'none');
          let kp = pf.mode === 'cut' ? (pfOn ? 1 : 0) : XM.expoInOut(c01((t - pf.at) / pf.dur));
          if (pf.mode === 'scan') { stl(pWrap, 'clipPath', `inset(0 0 ${((1 - kp) * 100).toFixed(3)}% 0)`); stl(pWrap, 'opacity', '1'); }
          else stl(pWrap, 'opacity', pf.mode === 'dissolve' ? kp.toFixed(3) : '1');
          const sc = pf.mode === 'scan' && kp > 0 && kp < 1;
          stl(pLine, 'display', sc ? 'block' : 'none');
          if (sc) stl(pLine, 'transform', `translateY(${(pf.box[1] + kp * pf.box[3] - 3).toFixed(2)}px)`);
          const ks = pf.mark.kind === 'sweep' ? XM.expoOut(c01((t - pf.mark.at) / .4)) : 0;
          stl(pSweep, 'display', ks > 0 ? 'block' : 'none');
          if (ks > 0) stl(pSweep, 'transform', `scaleX(${ks.toFixed(4)})`);
        }

        // ---------- screen layer: HUD, screenshot viewfinder, marks, hit flash ----------
        og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, W, H);
        if (pulse > .01) { const rg = og.createRadialGradient(W * .5, H * .53, 0, W * .5, H * .53, W * .4); rg.addColorStop(0, P.accent); rg.addColorStop(1, 'rgba(0,0,0,0)');
          og.save(); og.globalAlpha = pulse * .3; og.globalCompositeOperation = P.stage === 'paper' ? 'multiply' : 'screen'; og.fillStyle = rg; og.fillRect(0, 0, W, H); og.restore(); }
        if (pf && t >= pf.at) {
          const flat = cam(t), q = (x, y) => project([x, y, 0], flat);
          const [bx, by, bw, bh] = pf.box, a = q(bx, by), b = q(bx + bw, by + bh);
          XM.DS.frame(og, a[0], a[1], b[0] - a[0], b[1] - a[1], P, { k: XM.DS.in(t, pf.at + pf.dur * .4, .45), label: pf.label });
          if (pf.mark.kind !== 'sweep') {
            const ra = q(pf.mark.x[0], slotTop(T)), rb = q(pf.mark.x[1], slotTop(T) + G.rowH);
            XM.mark.bracket(og, ra[0], ra[1], rb[0] - ra[0], rb[1] - ra[1], PP, XM.DS.in(t, pf.mark.at, .35), { on: 'light', pad: 12, len: 30, lw: 6 });
          }
        }
        if (o.hud !== false) {
          const hu = o.hud || {};
          og.save(); og.globalAlpha = kIn;
          const onShot = pf && t >= pf.at + pf.dur * .5;
          XM.DS.hud(og, t, P, { tl: hu.tl || 'RANK / ' + String(F).padStart(2, '0') + ' → ' + String(T).padStart(2, '0'), bl: hu.bl || ti.zh, br: onShot ? pf.label : (hu.br || 'REDRAWN') });
          og.restore();
        }
      };
    });
    return shot;
  }

  Object.assign(XS, { rank });
})();
