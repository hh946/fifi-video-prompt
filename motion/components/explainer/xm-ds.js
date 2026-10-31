// Explainer design system: the one source of colours, type sizes, HUD, annotation marks, motion timing and the
// sound-cue vocabulary for both XS evidence shots and XM motion components.
// Load after lib.js, xk.js and xm-core.js, and before every xm-*.js / xs-*.js.
//
// Quick reference:
//   const P = XM.DS.tone('ink'|'paper'|'accent')   -> { bg, fg, mute, faint, line, accent, onAccent, mark, warn, ink, paper }
//   XM.DS.stage(g, P, { light })                    -> paint the stage (solid; light:true adds a faint centre light + vignette, for behind real screenshots)
//   XM.DS.hud(g, t, P, { tl, bl, br })              -> standard four-corner HUD (top-left shot id, top-right timecode, bottom-left chapter, bottom-right footage label)
//   XM.DS.frame(g, x, y, w, h, P, { kind, k, label }) -> viewfinder: kind 'evidence' (corner brackets + small label) | 'ai' (rounded frame) | 'diagram' (none)
//   XM.mark.sweep / bracket / callout / stamp      -> standard annotations (below); XM.mark.lead is an optional underline before a sweep
//   XM.mark.hiText(g, text, x, y, txtOpts, P, k)   -> highlight text you draw yourself: yellow block under the text, swept text turns ink
//   XM.DS.contrast(a, b) / XM.DS.pick(bg, prefer)  -> WCAG contrast ratio / pick a colour readable on bg (>= 3:1)
//   XM.frames(dir)                                 -> video frame sequence (from scripts/clip_frames.py); .at(t) gets a frame, loaded on demand
//   XM.DS.in(t, at, d) / out(t, at, d)             -> standard enter / exit progress
//   XM.DS.S                                        -> type-size scale; XM.DS.SFX -> sound-cue vocabulary (use it when writing SFX in the timeline)
(() => {
  const { W, H } = XK;
  const col = c => XK.col(c);

  // ---------- Colour: three stages ----------
  const INK = '#0d0e12', PAPER = '#ece8df';
  function lum(hex) { const h = String(hex).replace('#', ''); if (h.length < 6) return .5; const v = i => parseInt(h.slice(i, i + 2), 16) / 255; return .2126 * v(0) + .7152 * v(2) + .0722 * v(4); }
  // WCAG relative luminance / contrast. Annotation colours are always picked against what they sit on, so they stay readable
  function relLum(hex) { const h = String(hex).replace('#', ''); if (h.length < 6) return .5;
    const v = i => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
    return .2126 * v(0) + .7152 * v(2) + .0722 * v(4); }
  function contrast(a, b) { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  // on: what the annotation sits on. 'light' (light screenshot / background) | 'dark' (dark screenshot / background) | '#hex' (measured colour)
  const onHex = (on, P) => on === 'light' ? '#ffffff' : on === 'dark' ? '#111111' : (on || P.bg);
  // Return the first colour in order with contrast >= min against bg; if none passes, the highest-contrast one
  function pick(bg, prefer, min = 3) { let best = prefer[0], bc = 0;
    for (const c of prefer) { if (!c || c[0] !== '#') continue; const r = contrast(c, bg); if (r >= min) return c; if (r > bc) { bc = r; best = c; } }
    return best; }

  function tone(stage = 'ink') {
    const A = col('accent'), A2 = col('accent2') || A;
    if (stage === 'paper') return { stage, bg: PAPER, fg: '#111214', mute: 'rgba(17,18,20,.56)', faint: 'rgba(17,18,20,.14)', line: 'rgba(17,18,20,.22)',
      accent: A, onAccent: lum(A) > .55 ? '#111214' : PAPER, mark: '#ffe14a', warn: col('warn'), ink: INK, paper: PAPER };
    if (stage === 'accent') { const dark = lum(A) < .55; return { stage, bg: A, fg: dark ? PAPER : '#111214', mute: dark ? 'rgba(236,232,223,.62)' : 'rgba(17,18,20,.56)',
      faint: dark ? 'rgba(236,232,223,.16)' : 'rgba(17,18,20,.14)', line: dark ? 'rgba(236,232,223,.3)' : 'rgba(17,18,20,.25)', accent: dark ? PAPER : INK, onAccent: A,
      mark: '#ffe14a', warn: col('warn'), ink: INK, paper: PAPER }; }
    // ink: if the accent is too dark on a dark stage (e.g. Klein blue), switch to accent2 or a lighter blue so it stays readable
    const acc = lum(A) < .22 ? (lum(A2) > .3 ? A2 : '#8f9bff') : A;
    return { stage: 'ink', bg: INK, fg: PAPER, mute: 'rgba(236,232,223,.56)', faint: 'rgba(236,232,223,.12)', line: 'rgba(236,232,223,.2)',
      accent: acc, onAccent: lum(acc) > .55 ? '#111214' : PAPER, mark: '#ffe14a', warn: col('warn'), ink: INK, paper: PAPER };
  }

  // ---------- Type-size scale (px on the 1920 canvas). Multiply by 0.5625 when placed in a vertical-video window ----------
  const S = { hud: 18, small: 40, label: 56, body: 68, key: 120, num: 180, hero: 280 };
  const SAFE = 110;

  // ---------- Motion ----------
  const clamp01 = k => Math.max(0, Math.min(1, k));
  const inK = (t, at, d = .42) => XM.expoOut(clamp01((t - at) / d));
  const outK = (t, at, d = .25) => 1 - XM.expoIn(clamp01((t - at) / d));
  const hitK = (t, at, d = .12) => XM.expoOut(clamp01((t - at) / d));   // verdict / stamp: fast

  // ---------- Stage ----------
  function stage(g, P, o = {}) {
    if (XM.tex && XM.tex.stageHook(g, P)) return;      // this shot uses a texture-layer stage material (xm-tex.js)
    g.fillStyle = P.bg; g.fillRect(-200, -200, W + 400, H + 400);
    if (o.light) {      // behind real screenshots: a very faint top light + darker corners; the base is still one of the three stages
      const r = g.createRadialGradient(W / 2, H * .38, 0, W / 2, H * .38, W * .62);
      r.addColorStop(0, P.stage === 'paper' ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.06)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, W, H);
      const v = g.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, W * .72);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, P.stage === 'paper' ? 'rgba(40,30,10,.16)' : 'rgba(0,0,0,.5)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    }
  }

  // ---------- Standard HUD ----------
  // tl shot id (S05), tr timecode (automatic), bl chapter (P1 xxx), br name of what this shot shows; the bottom-right disclaimer
  // lines are also drawn here (o.disclaimer:false turns them off).
  // · No backing plate: text is drawn into a white mask, then each pixel switches between dark #121214 and light #ebe8df
  //   by the brightness of the image under it (9 px box blur, smooth between .42 and .58), opacity .6; no stroke, no
  //   shadow. So call hud after everything else in the frame is drawn (the after hook / last line).
  // · Right alignment: the ink of the timecode, br and the disclaimer all ends at HUD.R = 1817; br sits one line (24 px)
  //   above the first disclaimer line.
  const HUD = { R: 1817, TOP: SAFE * .62 + 18, BOT: 1006, A: .6, DARK: [18, 18, 20], LIGHT: [235, 232, 223],
    DISC: [], DISC_Y: [1044, 1063] };
  // Disclaimer text is smaller (14 px, letter-spacing 1.2) and sits on the bottom two lines so subtitles can overlap it; corner HUD stays 18 px
  const HUDF_D = { fam: 'mono', size: 14, w: 500, ls: 1.2, col: '#fff' };
  const HUDF = { fam: 'mono', size: 18, w: 500, ls: 1.6, col: '#fff' };
  const INKR = {};
  function inkRight(str, f) {          // ink width of str drawn left-aligned at x=20 (cached); letterSpacing adds a trailing gap to measureText, so measure pixels
    const key = (f.fam || '') + '|' + str; if (INKR[key] != null) return INKR[key];
    const c = XM.canvas('hud-ink-probe', 1400, 50); XM.txt(c.g, str, 20, 36, f);
    const d = c.g.getImageData(0, 0, 1400, 50).data; let r = 0;
    for (let y = 0; y < 50; y++) for (let x = 0; x < 1400; x++) if (d[(y * 1400 + x) * 4 + 3] > 25 && x > r) r = x;
    return (INKR[key] = r + 1 - 20);
  }
  function lumBlur(px, w, h, R) {
    const L = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) L[i] = (px[i * 4] * .299 + px[i * 4 + 1] * .587 + px[i * 4 + 2] * .114) / 255;
    const S2 = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += L[y * w + x]; S2[(y + 1) * (w + 1) + x + 1] = S2[y * (w + 1) + x + 1] + row; } }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
      out[y * w + x] = (S2[y1 * (w + 1) + x1] - S2[y0 * (w + 1) + x1] - S2[y1 * (w + 1) + x0] + S2[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    }
    return out;
  }
  // Composite mask m (white text) onto g inside rect, switching dark / light by the background (g in screen coordinates: reset the transform first)
  function adaptive(g, m, rect, aMul) {
    const [x, y, w, h] = rect.map(Math.round);
    const bg = g.getImageData(x, y, w, h), b = bg.data, Lb = lumBlur(b, w, h, 9), M = m.getImageData(x, y, w, h).data;
    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      const ma = M[i + 3]; if (!ma) continue;
      const k = clamp01((Lb[p] - .42) / .16), a = ma / 255 * aMul;
      for (let c = 0; c < 3; c++) { const col = k * HUD.DARK[c] + (1 - k) * HUD.LIGHT[c]; b[i + c] = b[i + c] * (1 - a) + col * a; }
    }
    g.putImageData(bg, x, y);
  }
  function hud(g, t, P, o = {}) {
    if (XM.tex) XM.tex.flush(g, P);                  // texture layer: push-in / window shadow / post effects finish before the HUD, so the HUD is always clean
    const a = (o.a ?? 1) * HUD.A, m = o.inset ?? SAFE;
    const mk = XM.canvas('hud-mask', W, H), mg = mk.g;
    const tl = o.tl || 'FIG', tr = o.tr || XM.FX.timecode(t);
    mg.fillStyle = '#fff'; mg.beginPath(); mg.arc(m + 4, HUD.TOP - 6, 4.5, 0, 6.3); mg.fill();
    XM.txt(mg, tl, m + 22, HUD.TOP, HUDF);
    XM.txt(mg, tr, HUD.R - inkRight(tr.replace(/\d/g, '0'), HUDF), HUD.TOP, HUDF);
    if (o.bl) XM.txt(mg, o.bl, m, HUD.BOT, HUDF);
    if (o.br) XM.txt(mg, o.br, HUD.R - inkRight(o.br, HUDF), HUD.BOT, HUDF);
    const disc = Array.isArray(o.disclaimer) && o.disclaimer.length ? o.disclaimer : null;   // optional 1-2 lines bottom-right, e.g. disclaimer: ['Personal opinion, not advice']
    if (disc) disc.forEach((s, i) => XM.txt(mg, s, HUD.R - inkRight(s, HUDF_D), HUD.DISC_Y[i], HUDF_D));
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    adaptive(g, mg, [m - 14, HUD.TOP - 24, W / 2 - m, 34], a);                    // top-left
    adaptive(g, mg, [W / 2, HUD.TOP - 24, W / 2 - (W - HUD.R) + 12, 34], a);      // top-right
    adaptive(g, mg, [m - 14, HUD.BOT - 22, W / 2 - m, 30], a);                    // bottom-left
    adaptive(g, mg, [W * .3, HUD.BOT - 22, HUD.R + 12 - W * .3, (disc ? HUD.DISC_Y[1] + 6 : HUD.BOT + 8) - (HUD.BOT - 22)], a);   // bottom-right br + disclaimer
    g.restore();
  }

  // ---------- Viewfinder / footage-type frame ----------
  // k: 0..1 closing progress (corners move in from 40 px outside); label: small category text above the frame
  function frame(g, x, y, w, h, P, o = {}) {
    const k = o.k ?? 1, kind = o.kind || 'evidence', pad = 18 + 40 * (1 - k);
    if (kind === 'diagram' || k <= 0) return;
    g.save(); g.globalAlpha *= clamp01(k * 1.5);
    if (kind === 'ai') {        // AI-generated: rounded frame
      g.strokeStyle = P.line; g.lineWidth = 2; g.beginPath(); g.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 28); g.stroke();
    } else XM.FX.bracket(g, x - pad, y - pad, w + pad * 2, h + pad * 2, 34, P.fg, 3);
    if (o.label) XM.txt(g, o.label, x - pad, y - pad - 14, { fam: 'mono', size: 20, w: 500, col: P.mute, ls: 2 });
    g.restore();
  }

  // ---------- Standard annotations ----------
  const MARK = '#ffe14a';
  const mark = {
    // Sweep highlight: always fluorescent yellow, and the result must read as dark text on yellow.
    //   o.on is what gets swept: 'light' screenshot -> multiply (white turns yellow, black text stays); 'dark' screenshot ->
    //   difference (dark turns yellow, light text turns dark). Without on: paper stage = light, others = dark. The old
    //   blend:'screen' (dark backgrounds) is mapped to difference, since screen turns light text into unreadable white-on-yellow.
    //   For text you draw on the stage yourself, use hiText instead (yellow block under the text, text turns ink).
    sweep(g, x, y, w, h, P, k, o = {}) {
      if (k <= 0) return; const on = o.on || (P.stage === 'paper' ? 'light' : 'dark');
      let blend = o.blend || (on === 'light' || (on[0] === '#' && relLum(on) > .4) ? 'multiply' : 'difference');
      if (blend === 'screen' || blend === 'lighten') blend = 'difference';
      g.save(); g.globalCompositeOperation = blend; g.globalAlpha *= o.alpha ?? (blend === 'difference' ? 1 : .9);
      g.fillStyle = MARK; g.fillRect(x, y, w * clamp01(k), h); g.restore();
    },
    // Lead-in underline before a sweep: a yellow line draws in under the row from right to left (kLead 0->1), then hides
    //   wherever the sweep has reached (kSweep), so after the sweep it is gone; the only visible mark is still dark-on-yellow.
    //   (x, y, w, h) is the same box as sweep; the line hugs the bottom, thickness max(5, h * .14). o.th overrides it.
    lead(g, x, y, w, h, P, kLead, kSweep = 0, o = {}) {
      const kl = clamp01(kLead), ks = clamp01(kSweep); if (kl <= 0 || ks >= 1) return;
      const th = o.th || Math.max(5, h * .14), x0 = Math.max(x + w * (1 - kl), x + w * ks), x1 = x + w;
      if (x1 <= x0) return;
      g.save(); g.fillStyle = MARK; g.fillRect(x0, y + h - th, x1 - x0, th); g.restore();
    },
    // Bracket: corner brackets close in from outside (instead of a rounded outline). Colour is picked for contrast (>= 3:1)
    //   against what it sits on: o.on as in sweep ('light'|'dark'|'#hex', default stage bg); o.color is preferred and
    //   replaced if contrast is too low; o.halo:true adds a thin contrasting outline (for brackets spanning dark and light content)
    bracket(g, x, y, w, h, P, k, o = {}) {
      if (k <= 0) return; const pad = (o.pad ?? 14) + 46 * (1 - k), lw = o.lw || 5, len = o.len || 28;
      const bg = onHex(o.on, P), c = pick(bg, [o.color, P.accent, P.fg, INK, PAPER, MARK]);
      g.save(); g.globalAlpha *= clamp01(k * 2);
      if (o.halo) XM.FX.bracket(g, x - pad, y - pad, w + pad * 2, h + pad * 2, len, contrast(c, INK) > contrast(c, PAPER) ? INK : PAPER, lw + 4);
      XM.FX.bracket(g, x - pad, y - pad, w + pad * 2, h + pad * 2, len, c, lw); g.restore();
    },
    // Highlight text drawn on the stage: a yellow block sweeps left to right under the text and the swept part turns ink
    //   (dark-on-yellow on all three stages). txtOpts as in XM.txt (fam/size/w/align..., col = colour before the sweep);
    //   o.pad extends the block vertically (default size * .14); o.lead: underline progress 0..1 (as lead, line then sweep)
    hiText(g, text, x, y, txtOpts, P, k, o = {}) {
      const size = txtOpts.size || 56, tw = XM.measure(g, text, txtOpts), al = txtOpts.align || 'left';
      const x0 = al === 'center' ? x - tw / 2 : al === 'right' ? x - tw : x, pad = o.pad ?? size * .14, kk = clamp01(k);
      const top = y - size * .86 - pad, hh = size * 1.12 + pad * 2;
      if (o.lead) mark.lead(g, x0 - pad, top, tw + pad * 2, hh, P, o.lead, kk);
      if (kk > 0) { g.save(); g.fillStyle = MARK; g.fillRect(x0 - pad, top, (tw + pad * 2) * kk, hh); g.restore(); }
      XM.txt(g, text, x, y, txtOpts);
      if (kk > 0) { g.save(); g.beginPath(); g.rect(x0 - pad, top, (tw + pad * 2) * kk, hh); g.clip(); XM.txt(g, text, x, y, { ...txtOpts, col: INK, alpha: 1 }); g.restore(); }
    },
    // Layers over content are always a solid block + contrasting text: no outline, no translucency, readable on anything.
    //   Verdict = white on red (stamp); explanation = white on black (callout).
    // Callout: leader line + white-on-black label. The ink line has a thin off-white outline so it reads on dark, light and accent. Label size defaults to S.label
    callout(g, ax, ay, lx, ly, text, P, k, o = {}) {
      if (k <= 0) return; const size = o.size || S.label;
      const e = clamp01(k * 1.6), mx = ax + (lx - ax) * e, my = ay + (ly - ay) * e;
      g.save(); g.globalAlpha *= clamp01(k * 2); g.lineCap = 'round';
      g.strokeStyle = PAPER; g.lineWidth = 7; g.beginPath(); g.moveTo(ax, ay); g.lineTo(mx, my); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(ax, ay); g.lineTo(mx, my); g.stroke();
      g.beginPath(); g.arc(ax, ay, 9, 0, 6.3); g.fillStyle = PAPER; g.fill(); g.beginPath(); g.arc(ax, ay, 6, 0, 6.3); g.fillStyle = INK; g.fill();
      if (k > .5) { const tw = XM.measure(g, text, { fam: 'zh', size, w: 800 }), pad = size * .32;
        const bx = o.align === 'right' ? lx - tw - pad * 2 : lx, by = ly - size * .62 - pad * .6, bw = tw + pad * 2, bh = size * 1.24 + pad * .4;
        g.fillStyle = PAPER; g.fillRect(bx - 2, by - 2, bw + 4, bh + 4);      // off-white edge so the label separates from an ink stage
        g.fillStyle = INK; g.fillRect(bx, by, bw, bh);
        XM.txt(g, text, bx + pad, ly + size * .36, { fam: 'zh', size, w: 800, col: PAPER, alpha: clamp01((k - .5) * 3) }); }
      g.restore();
    },
    // Verdict stamp: solid red block with white text (one stamp style per video), slammed from 1.8x to 1, slightly tilted. o.color changes the fill (text picks a contrasting colour)
    stamp(g, x, y, text, P, k, o = {}) {
      if (k <= 0) return; const size = o.size || 110, s = 1 + .8 * (1 - k), c = o.color || P.warn;
      const tw = XM.measure(g, text, { fam: 'zh', size, w: 900 }), fg = contrast(c, '#ffffff') >= 3 ? '#ffffff' : INK;
      g.save(); g.translate(x, y); g.rotate((o.rot ?? -7) * Math.PI / 180); g.scale(s, s); g.globalAlpha *= clamp01(k * 1.4);
      g.fillStyle = c; g.fillRect(-tw / 2 - 34, -size * .74, tw + 68, size * 1.38);
      XM.txt(g, text, 0, size * .36, { fam: 'zh', size, w: 900, col: fg, align: 'center' }); g.restore();
    },
  };

  // ---------- Sound-cue vocabulary: one event type = one sound across the video (names from scripts/sfx.py) ----------
  // Videos that set window.SFX_KIT (timeline.js) use the sound-kit vocabulary (scripts/sfx_kit.py, sfx-kit/README.md),
  // which avoids heavy, muffled sounds. Without SFX_KIT the older set is kept so re-renders sound the same.
  const SFX = window.SFX_KIT
    ? { appear: 'tik', sweep: 'paper',   // appear: a very light tik
        bracket: 'pop', callout: 'pop', stamp: 'snap', count: 'tally',   // count: a dry run of clicks (tally)
        reveal: 'snap', land: 'snap', type: 'typing', transition: 'whoosh', wipe: 'whip' }
    : { appear: 'swoosh', sweep: 'paper', bracket: 'pop', callout: 'pop', stamp: 'stamp', count: 'countup', reveal: 'snap', land: 'thud', type: 'typing', transition: 'whoosh', wipe: 'whip' };
  // Named sound-kit events (work with either set): small tags pop one by one / a row pops at once / big keyword / glowing outline
  // lights up / emphasise a line / small bubble / collect / one step morphs into the next / riffle / photo / ranking climbs /
  // move to a new shot (hard cut to an already-laid-out frame, very light) / roll in, dash past (align end).
  // See "which sound for which visual" in sfx-kit/README.md.
  Object.assign(SFX, { tag: 'tik', multi: 'swick', title: 'sparkle', glow: 'glint', emph: 'ting', bubble: 'bub', collect: 'chirp', morph: 'arp', pile: 'riffle', photo: 'shutter', rank: 'bleep', enter: null, dash: 'zip',   // enter: no sound by default when moving to a new shot (sfx.py skips empty names)
    swap: 'slide',
    scene: 'airin', press: 'deal', fly: 'sheet', cuts: 'flick', rush: 'tallyup',
    dot: 'pip', message: 'notify', drop: 'swoop', rushcut: 'revcut' });   // swap: card swap, one landing on another (only the first of a run); scene: big section change; press: single card pressed; fly: paper flies in; cuts: fast cuts (dur covers them); rush: numbers shoot up; dot: single small dot; message: notification pops; drop: tag drops; rushcut: rush into a cut (for the last three, cue t = landing / cut point)

  // ---------- Video frame sequences (from scripts/clip_frames.py) ----------
  // XM.frames(dir) -> { ok, meta, at(t = seconds into the clip) -> HTMLImageElement|null, frame(i) }
  // Frames load on demand: the first time render(t) needs a frame it is registered with XM.late, and render.js waits and
  // renders the same frame again (deterministic, never captures a half-loaded image).
  // Only the 48 most recent frames are kept, so long clips do not exhaust memory; the next few frames are prefetched.
  const CLIPS = new Map(), LATE = [];
  function frames(dir) {
    dir = String(dir).replace(/\/$/, '');
    if (CLIPS.has(dir)) return CLIPS.get(dir);
    const name = dir.split('/').pop(), R = { ok: false, meta: null, dir };
    XM.asset(new Promise(res => {
      const s = document.createElement('script'); s.src = dir + '/clip.js';
      s.onload = () => { R.meta = (window.XM_CLIPS || {})[name]; R.ok = !!R.meta; if (!R.ok) console.error('XM.frames: manifest has no entry for ' + name); res(); };
      s.onerror = () => { console.error('XM.frames: failed to load manifest ' + dir + '/clip.js (run scripts/clip_frames.py first)'); res(); };
      document.head.appendChild(s);
    }));
    const cache = new Map();
    const load = i => { if (cache.has(i)) return cache.get(i);
      const r = { img: new Image(), ok: false }; r.img.src = `${dir}/f_${String(i).padStart(5, '0')}.jpg`;
      r.p = r.img.decode().then(() => { r.ok = true; }).catch(() => { r.bad = true; console.error('XM.frames: failed to load frame ' + r.img.src); });
      cache.set(i, r); while (cache.size > 48) cache.delete(cache.keys().next().value); return r; };
    R.frame = i => { if (!R.ok) return null; i = Math.max(1, Math.min(R.meta.n, Math.round(i)));
      const r = load(i); for (let j = 1; j <= 3; j++) if (i + j <= R.meta.n) load(i + j);
      if (!r.ok) { if (!r.bad) LATE.push(r.p); return null; } return r.img; };
    R.at = t => R.ok ? R.frame(1 + Math.floor(Math.max(0, t) * R.meta.fps + 1e-6)) : null;
    CLIPS.set(dir, R); return R;
  }
  // For render.js: are frames still loading for this frame? If so returns a Promise (render the same t again when it resolves)
  XM.late = () => { if (!LATE.length) return null; const p = Promise.all(LATE.splice(0)); return p; };
  XM.frames = frames;

  XM.DS = { tone, stage, hud, HUD, frame, S, SAFE, SFX, in: inK, out: outK, hit: hitK, INK, PAPER, MARK, lum, contrast, pick };
  XM.mark = mark;
})();
