// XM.bigType / XM.bigName / XM.bigQuote: full-frame big type. Huge, horizontally squeezed heavy serif words that cut in
// on the spoken keyword and stay perfectly still, optionally with a cut-out subject in front, a footage window behind,
// or an equal-width "block" layout. Docs: docs/components/bigtype.md
// Load after lib.js, xk.js, xm-core.js, xm-ds.js. Canvas 2D (XM.shot), deterministic (no randomness).
// Font: Noto Serif SC (OFL) 900 = the SerifSC family, squeezed horizontally. This component is meant for CJK text:
//      a real heavy serif squeezed narrow, not a Latin display face forced onto CJK.
//
// The look:
//   ① very large narrow heavy serif, ink height 60–70% of the frame, tracking near 0;
//   ② layer order is always background -> big type -> subject (person / object / screenshot); the subject may cover part of the text;
//   ③ hard cut in on the frame the keyword is spoken (or 1–5 frames early), hard cut out 0–6 frames before the next sentence, no motion in between;
//   ④ the only motion: lines cutting in one after another, and quote sentences fading in (~0.4 s from light grey to full colour).
//   Text is flat solid colour by default; the soft glow is an opt-in parameter (glow), off by default.
//
// ── Whitespace (squeeze is computed, not fixed) ─────────────────────────────────────────────
//   The text should have clear space between it and the subject, about as wide as the space to the frame edges.
//   Too wide a squeeze (0.60 / 0.80) leaves no air and looks bloated, so the squeeze is derived from the layout:
//   · Reference: four horizontal gaps averaging 143.5 px = 7.5% of frame width -> SPACE; the smallest, 121 px = 6.3% -> SPACE_WARN;
//     ink height ≈ 72% of the frame (about 150 px left top and bottom) -> VFILL.
//   · Auto (squeeze omitted or 'auto'): text height first fills 72% of the text area; every horizontal gap (text ↔ frame / area edge,
//     text ↔ the subject's actually drawn edge) is ≥ SPACE, and the two gaps on one side are equal (text centred in its space).
//     That gives the text width; width / height = squeeze.
//     Wider than 0.52 -> squeeze stops at 0.52 and the extra becomes more space; narrower than 0.40 -> squeeze stops at 0.40 and the text gets shorter.
//   · A wider subject gives narrower text, then shorter text; a narrower subject gives wider text, then more space.
//   · A numeric squeeze still works (overrides auto); size still shrinks to keep gaps ≥ SPACE. If both squeeze and size are fixed
//     and a gap drops below SPACE_WARN -> console.warn.
//   · Big type can stand alone: no subject, no under = solid background + big type + corner HUD (the default).
//
// ─────────────────────────────────────────────────────────────────────────────
// XM.bigType(o) -> { L, update, cues, subs, times, api }   subject over text / lines cutting in / text over a footage window / text only
//   This is a frame: the text, timing, foreground and footage are all yours to choose from the voiceover. No default text, subject or footage.
//   Content (required; missing -> console.error):
//     lines  : [{ text, at, align, color, size, split }] one per line. at = when that line's words are spoken (absolute s).
//              Lines with different at cut in one after another.
//              split (layout 'around') = number of chars in the left half (default: split by ink width, punctuation never starts the right half)
//     words  : not supported (passing it is an error)
//   Layout:
//     layout : 'rows' (default: each line spans the text area; a subject stands over the text) | 'around' (each line split into left and
//              right halves, the subject stands in the middle column) | 'behind' (the whole text block centred on the subject's body
//              centre line, behind the subject; height / squeeze follow the rows auto rule) | 'block' (equal-width block, see below).
//              around / behind without a subject fall back to rows
//     tuck   : around only. When the subject is so wide that the text would have to shrink (squeeze already at 0.40), keep the height
//              and let the inner side slightly tuck behind the subject: outer gap still ≥ space; the top 60% of the subject (face,
//              upper body) is never touched and stays ≥ 10% of text height away; the bottom 40% (armrests, hands, legs) may overlap
//              up to tuck × text height (default 0.03). The widest squeeze meeting these wins. On by default with auto squeeze;
//              a number = the overlap limit (0–0.3, also works with a fixed squeeze); false = off (shrink the text instead)
//     squeeze: 'auto' (default, from whitespace, see above) | number (glyph width / height, overrides auto)
//     squeezeRange: default [0.40, 0.52] (the range that still reads as a narrow heavy serif)
//     space  : minimum horizontal gap as a fraction of frame width, default 0.075 (≈ 144 px at 1920)
//     track  : tracking (em), default 0
//     size   : text height (px, ink height). Default auto: up to 72% of the text-area height (all lines together), then shrunk for whitespace
//     maxSize: cap for the auto height, default 0.72 × text-area height (≈ 778 for the full frame)
//     box    : text area [x, y, w, h] (gaps are measured from its edges), default the whole frame; with under, the footage window
//     valign : 'top' | 'center' (default) | 'bottom'
//     color  : text colour 'fg' (default: off-white on ink / ink on off-white) | 'accent' | '#hex'. Use the accent only for irony / warning
//     glow   : false (default, flat text) | true | { color, blur, alpha }. Soft glow; use only the text or accent colour
//   Foreground subject (optional; omit for type only):
//     subject: { src, x, y, h, at, out, column:[x0, x1], side, edge, anchor, alpha, draw(g, t, P, api) }
//              src = a transparent cut-out PNG; x = centre, y = bottom edge (default H, standing on the frame bottom), h = drawn height;
//              at / out = when it appears / disappears (default the whole shot);
//              column = the subject's actual horizontal extent [x0, x1] (default: measured from the cut-out's opaque pixels at the
//              height of the text row; required when you draw it yourself with draw)
//              texture = optional edge texture for portrait photos; texture:false turns it off.
//   Background (optional, solid by default):
//     tone   : stage 'ink' (default) | 'paper' | 'accent'. Solid, nothing added
//     light  : the design system's soft top light + vignette. Off by default; on by default with under, light:false turns it off
//     under  : footage window { box:[x,y,w,h], clips:[{ dir, at, from, rate }], img, dim, texture, label, frame }
//              clips = XM.frames image sequences (from scripts/clip_frames.py), played from at, starting at second from of the clip;
//              the footage cuts under the text while the text stays still;
//              img = a still image; dim = footage darkening (default 0.22); texture:'screen' adds fine vertical screen lines to the
//              window (footage + text, default off); label = small category label of the viewfinder (default: a short 'footage' tag); frame:false = no brackets.
//              With under, the text area defaults to the window and the text is clipped to it
//   Timing (all absolute seconds from T; the component handles "a few frames early in / early out"):
//     lead   : frames to enter before the word is spoken, default 2
//     until  : time the next sentence starts -> the text cuts out at until − tail frames; subtitle hand-back uses it too
//     tail   : default 2 frames
//     out    : explicit disappear time (no tail subtracted). Without until / out the text stays until the next shot cuts in
//   Sound (returns cues):
//     sfx    : { name, gain, each }. Enter sound default 'kacha' (shutter click); when lines cut in at different times, each line uses 'pa'.
//              each: 'line' (one per line, default) | 'first' (first only); false = silent. No exit sound; lines appearing together sound once
//   Subtitles (returns subs; see the docs on subtitle hand-off):
//     subtitle: 'drop' (default: the big type is the spoken words, so the bottom subtitle drops them) | 'keep' (the big type is just one word of the sentence)
//   en     : { text, at, size, squeeze, color, gap, align } a small English line under the big type (name cards; English only)
//   hud    : { tl, bl, br } | false   corner HUD (you write the text; no default)
//   api.fit(): { squeeze, auto, wanted, inkH, space, gaps:[{ at, px }], minGap } the squeeze used and measured gaps (for checks)
//
// ── Optional extras (omit and nothing changes) ─────────────────────────────────────────────
//   enter  : 'cut' (default, hard cut) | 'sweep' (per-char reveal in place: k² ramp, starts 3 px blurred; chars start almost together
//            and finish one after another: starts .03 s apart, first char full at .1 s, then one more every .12 s; per / first / gap / dur / blur
//            adjustable; the whole line also drifts up 6% of its height over .57 s; rise sets the fraction, 0 = no drift)
//            | 'rise' (whole line fades in + drifts up: opacity 1−(1−k)^3.5 over ~1 s, drift 30% of height; rise / dur adjustable)
//            | 'slide' (each char slides in from one side with horizontal smear: .05 s apart, .2 s to settle, .3 heights of travel).
//            Also { kind, per, dur, blur, rise, dist, from }.
//            Default enter sound: cut = kacha / pa; sweep / rise = sparkle; slide = pa
//   fill   : 'flat' (default, solid) | 'grad' (vertical gradient, lighter top, darker bottom, printed-ink look; subtle by default, k .35) | { grad:k }
//   wear   : 0..1 worn type (sparse small specks rubbed off), default 0
//   alpha  : text opacity (default 1). E.g. ≈ .5 lets light and shade of a coloured background show through dark text
//   skew   : slant (tan, default 0). .12 subtle, .2–.35 strong
//   lines[i].squeeze : this line's own fixed squeeze (excluded from auto squeeze); e.g. a small line stretched 1.15 above a bold line at .69
//   subject.filter   : canvas filter applied to the subject (e.g. 'brightness(.15) contrast(1.2)' turns a crowd into a silhouette)
//   behind : { text (English only), at, color (default accent mixed halfway to the background), alpha, size (px, default .81 × frame height),
//              x, y (centre, default the big type's centre), w (weight, default 800), squeeze, blur (px blur of the whole word),
//              zoom:[from, to] (slow scale of the whole word), enter:'cut'|'sweep' (default sweep: letters fade in over ~1 s) }
//            a huge italic English word behind the big type, font PlayIt (Playfair Display Italic); may bleed off frame, covered by
//            big type and subject. Layer order: background -> behind word -> big type -> subject
//   notes  : [{ at: index or 'a char', text (English), t (time, default that char's), pos:'on'|'below'|'above'|'left'|'right', dx, dy, size, w, color }]
//            small italic English notes on / next to a char; PlayIt italic, default size max(44, text height × .09).
//            pos default 'on': sits on the char's lower strokes. Default colour follows what's underneath: background colour where it
//            overlaps strokes, text colour where it sits on the background, so every part stays legible; color = one colour throughout
//   subject.shadow: true | { a:.32, blur:22, sy:.22, shear:-.35, dx, dy } soft ground shadow from the subject's silhouette; fades near the text
//   Slow push, window light, grain / vignette come from the texture layer: XM.tex.use(shot, { light:'window', post:'paper', push:{ to:1.05 } }) (xm-tex.js)
//
// ── Equal-width block and logo name card ───────────────────────────────────────────────────
//   layout:'block'  equal-width block: lines are forced to the same width, each line's height follows from its own horizontal ratio,
//     so lines with fewer chars get taller; if lines + gaps exceed the text-area height (72%) the whole block scales down.
//     lines[i]: { text, at, font (default SerifSC for CJK / o.latin for Latin), squeeze (default Latin .70, CJK o.cjkSqueeze ?? .52;
//       CJK capped at .60, larger -> warn and clamp), track, from, dist, color }
//     lines[i].from: 'left'|'right'|'top'|'bottom' per-line slide-in: .3 s expoOut, no overshoot, fades in over the first 35%,
//       motion smear by speed (o.slide sets the duration)
//     latin: Latin line font (default 'Fraunces' = Fraunces 144 Black); width = block width; blockAlign; gap = ink gap between lines (px)
//     mid: { text, size:24, between:0, at, color, font } small note in the gap: real metadata (source · date · original name),
//       not an explanation; Latin in Mono, CJK in HeiSC
//     ornaments: { kind:'star'|'x'|'dot', place:'sides'|'ends'|'left'|'right'|'top'|'bottom', size, gap, color (default 'accent';
//       'mute' for the first half of a contrast), at }
//     blocks: [{ lines, mid, ornaments, width }] several blocks hard-swapped within one shot: the next block replaces the whole
//       previous one on the frame its first line appears
//     Sound: kacha when a block first appears, pa for later / sliding lines in the same block; subtitle hand-off per line,
//       handed back on the frame the block is replaced
//     With subject.side the block is centred in the space on the other side (text column + subject); api.fit() gives each block's
//     width / position / line heights, horizontal ratios and height factors
//   under.front: { clips:[{ dir?, matte, at, from, rate }] } people / objects moving in the footage are lifted back over the text
//     using a greyscale matte sequence (white = in front of the text)
//   bigName name.img: the name is a real logo image. { img, at, text, w, x, y, fill, maxH, align, vpos, tint }; mid is a note line under it;
//     subject.side:null = subject in the middle in front of the logo (covers the middle, shows the ends; api.fit().covered gives the
//     covered fraction of head / middle / tail, head or tail > 35% -> warn); no drift
//
// XM.bigName(o)  concept name card: off-white background + one big concept name + a small English original name + a black-and-white
//   portrait or object on one side (optional).
//   name:{ text, at } (required), en:{ text }, subject:{ src, side:'left'|'right', h, overlap }, otherwise as bigType
// XM.bigQuote(o) quote fading in sentence by sentence + portrait: ink text on off-white, each sentence fades from light grey to
//   full colour in about 0.4 s as it is spoken.
//   parts:[{ text, at }] (required, joined into one paragraph and wrapped; punctuation never starts a line), fade (default 0.4),
//   maxLines (default 3), subject:{ src, side, h }, otherwise as bigType.
//   Quote wrapping fills the text area, so width isn't set by the gaps; the squeeze defaults to the reference 0.45 (a number works too);
//   the outer gap is still ≥ space
//
// Rules (see the docs): still + hard cuts: the first frame is the complete text, no scaling, moving or shaking in between;
//   set drift:false on the seq entry. Use it sparingly, only for the conclusion words of a section.
(() => {
  const { W, H } = XK;
  const DS = XM.DS;
  const FAM = 'SerifSC';
  const CJK = /[⺀-鿿　-〿＀-￯]/;
  const NARROW = /[，。、：；！？,.;:!?」』”’）)·]/;      // narrow punctuation: 0.6 char wide
  const NOHEAD = /[，。、：；！？,.;:!?」』”’）)]/;        // never at a line start
  // Whitespace reference (measured on a reference layout with squeeze 0.45)
  const SPACE = .075;          // average of four reference gaps 170 / 123 / 121 / 160 px = 143.5 px ÷ 1920
  const SPACE_WARN = .063;     // the smallest of them, 121 px ÷ 1920: fixed squeeze + size producing a smaller gap -> console.warn
  const VFILL = .72;           // ink height ≈ 72% of the frame (about 150 px top and bottom)
  const SQ_REF = .45;          // reference squeeze: default only where width isn't set by gaps (quote wrapping)
  const SQ_RANGE = [.40, .52]; // squeeze range that still reads as a narrow heavy serif (ink width ≈ 0.4–0.5 × height); 0.40 = narrowest useful value;
                               // 0.52 = the 0.45 reference plus the same margin, well below 0.60 which looks bloated
  // When the subject is very wide and whitespace rules would shrink the text (around + auto squeeze), keep the text height and let
  //   the inner side tuck slightly behind the subject instead. Tested values: at 778 px text height, squeeze 0.48 tucks 20 px (2.6%)
  //   into an armrest and stays 92 px (11.8%) from the upper body; 0.52 tucks 52 px (6.7%) and gets within 66 px (8.5%), too close.
  const TUCK_LOW = .03;        // subject's lower 40% (armrests, hands, legs, base): text may tuck in up to 3% of its height
  const TUCK_UP = .10;         // subject's upper 60% (face, upper body): never touched, ink stays ≥ 10% of text height away
  const TUCK_ZONE = .6;        // upper / lower divider: 60% of the subject's visible height (opaque top -> bottom in frame)
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fps = () => (window.VIDEO && VIDEO.fps) || 30;
  const snapT = t => Math.round(t * fps() - 1e-6) / fps();           // snap to the frame grid: frame n = n / fps
  const rgbOf = h => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
  const mix = (a, b, k) => { const A = rgbOf(a), B = rgbOf(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  const solid = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return c; const [r, g, b] = m[1].split(',').map(s => parseFloat(s)); return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); };
  // Punctuation in big type: keep commas, drop full stops.
  //   A comma stays at the end of its line and the line breaks after it (never a comma at a line start); 。 is always removed;
  //   、；：…—！？ are removed too, breaking the line where they were; quotes, brackets and title marks are removed; marks:true keeps only ？！.
  //   . , : inside numbers (0.45, 1,000, 3:2) are not punctuation; the middle dot · and hyphen - stay (names, model numbers).
  const P_BREAK = /[，。、；：,.;:…—！？!?]/, P_STRIP = /[“”‘’「」『』"'（）()《》〈〉【】\[\]]/, P_MARK = /[！？!?]/, P_COMMA = /[，,]/;
  function cleanText(s, marks) {
    const cs = [...String(s ?? '')], segs = [''], removed = [];
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], num = /[.,:]/.test(c) && /\d/.test(cs[i - 1] || '') && /\d/.test(cs[i + 1] || '');
      const apos = /['’]/.test(c) && /[A-Za-z]/.test(cs[i - 1] || '');      // apostrophes (I'M, CAN'T, LACIN’) are not quotes: keep them
      if (!num && !apos && P_STRIP.test(c)) { removed.push(c); continue; }
      if (!num && P_BREAK.test(c)) {
        if (P_COMMA.test(c) || (marks && P_MARK.test(c))) segs[segs.length - 1] += c === ',' ? '，' : c; else removed.push(c);
        if (segs[segs.length - 1].trim()) segs.push('');
        continue;
      }
      segs[segs.length - 1] += c;
    }
    return { segs: segs.map(x => x.trim()).filter(Boolean), removed, endBreak: cs.length > 0 && P_BREAK.test(cs[cs.length - 1]) };
  }
  const fontsReady = () => !document.fonts || document.fonts.status === 'loaded';

  // ---------- Glyph metrics (measured once fonts are loaded): ink height / em, baseline to ink top / em ----------
  let MET = null;
  function met() {
    if (MET) return MET;
    const g = XM.canvas('xm-bigtype-measure', 8, 8, false).g;
    g.font = `900 1000px ${FAM}`;
    const m = g.measureText('国');
    const asc = m.actualBoundingBoxAscent || 880, desc = m.actualBoundingBoxDescent || 70;
    const r = { ink: (asc + desc) / 1000, asc: asc / 1000, g };
    if (fontsReady()) MET = r;
    return r;
  }
  // One char at em = 1, unsqueezed: advance a (CJK = 1; Latin from the glyph; narrow punctuation 0.6), ink left l, ink right r (relative to origin),
  // ink top t (above baseline), ink bottom b (below baseline). Commas and full stops sit lower than a CJK glyph, so stacked lines need extra room
  const GM = new Map();
  function glyph(ch, wt = 900) {
    const k = wt + ch; if (GM.has(k)) return GM.get(k);
    const M = met(); M.g.font = `${wt} 1000px ${FAM}`;
    const m = M.g.measureText(ch);
    let a = m.width / 1000; if (NARROW.test(ch)) a = Math.min(a, 1) * .6;
    const l = -(m.actualBoundingBoxLeft || 0) / 1000, r = /\s/.test(ch) ? l : (m.actualBoundingBoxRight ?? m.width) / 1000;
    const v = { a, l, r, t: (m.actualBoundingBoxAscent || 0) / 1000, b: (m.actualBoundingBoxDescent || 0) / 1000 };
    if (MET) GM.set(k, v);
    return v;
  }
  // Per-row ink extent of a glyph (em units, relative to origin / baseline): used to measure how far text tucks behind the subject (real glyph shape, not the box)
  const GR = new Map();
  function glyphRows(ch) {
    if (GR.has(ch)) return GR.get(ch);
    const E = 200, c = document.createElement('canvas'); c.width = E * 2; c.height = E * 2;
    const x = c.getContext('2d', { willReadFrequently: true }), ox = E * .5, bl = E * 1.3;
    x.font = `900 ${E}px ${FAM}`; x.fillStyle = '#000'; x.fillText(ch, ox, bl);
    const d = x.getImageData(0, 0, c.width, c.height).data, rows = [];
    for (let y = 0; y < c.height; y++) { let a = -1, b = -1; for (let i = 0; i < c.width; i++) if (d[(y * c.width + i) * 4 + 3] > 64) { if (a < 0) a = i; b = i; }
      if (a >= 0) rows.push([(y + .5 - bl) / E, (a - ox) / E, (b + 1 - ox) / E]); }
    if (MET) GR.set(ch, rows);
    return rows;
  }
  // Ink of a run of chars: U = ink width at em = 1, unsqueezed, no tracking; l0 = ink left of the first char; n = char count
  function runOf(chars) {
    const gs = chars.map(c => glyph(c));
    if (!gs.length) return { U: 0, l0: 0, n: 0, gs };
    let s = 0; for (let j = 0; j < gs.length - 1; j++) s += gs[j].a;
    return { U: s + gs[gs.length - 1].r - gs[0].l, l0: gs[0].l, n: gs.length, gs };
  }
  const inkW = (run, em, sq, tr) => run.n ? em * (sq * run.U + tr * (run.n - 1)) : 0;

  // ---------- Choosing squeeze / height ----------
  // runs: [{ run, A }] each run of text and the ink width it may use (gaps already subtracted); emCap: max em allowed by height.
  // Auto: height first fills emCap, squeeze is derived from the tightest run; above range -> stop at the top (more space); below range -> stop at the bottom and reduce height.
  function solve(runs, emCap, o) {
    const [lo, hi] = o.sqRange, tr = o.track, rs = runs.filter(r => r.run.n);
    const sqAt = em => Math.min(...rs.map(({ run, A }) => run.U > 0 ? (A / em - tr * (run.n - 1)) / run.U : Infinity));
    const emAt = sq => Math.min(...rs.map(({ run, A }) => A / Math.max(1e-6, sq * run.U + tr * (run.n - 1))));
    if (!rs.length) return { em: emCap, sq: o.sqFix ?? SQ_REF, want: null };
    if (rs.some(r => r.A <= 1)) return { em: emCap * .2, sq: lo, want: null, fail: true };     // one side can't even fit its gaps: subject too wide / text area too narrow
    if (o.sqFix != null && o.emFix != null) return { em: o.emFix, sq: o.sqFix, want: null };
    if (o.sqFix != null) return { em: Math.min(emCap, emAt(o.sqFix)), sq: o.sqFix, want: null };
    if (o.emFix != null) { const w = sqAt(o.emFix); return { em: o.emFix, sq: cl(w, lo, hi), want: w }; }
    const want = sqAt(emCap);
    if (want >= lo) return { em: emCap, sq: Math.min(want, hi), want };
    return { em: Math.min(emCap, emAt(lo)), sq: lo, want };
  }

  // ---------- Layout: place a set of chars as { ch, x, base, em, row } ----------
  // Shared input o: area = { x0, x1, y0, y1 } where ink may go (space already subtracted horizontally), edges = left / right edges for gap reports [x, name],
  //   rowGap, valign, track, sqFix / emFix / sqRange, maxSize, enH(h) (height taken by the English line on name cards)

  // rows: one row per line, spanning the text area; all rows share one squeeze
  function layoutRows(lines, o) {
    const M = met(), A = o.area, aw = A.x1 - A.x0, ah = A.y1 - A.y0, gap = o.rowGap, tr = o.track, n = lines.length;
    const dsc = M.ink - M.asc;
    const info = lines.map(L => { const cs = [...L.text], run = runOf(cs);
      return { cs, run, size: L.size, sq: L.squeeze, up: Math.max(0, ...run.gs.map(g => g.t - M.asc)), dn: Math.max(0, ...run.gs.map(g => g.b - dsc)) }; });
    // Between two rows: besides the line gap, leave room for ink below the CJK baseline box in the upper row (trailing comma) and above it in the lower row
    const xtra = i => i < n - 1 ? info[i].dn + info[i + 1].up : 0;
    let xs = 0; for (let i = 0; i < n - 1; i++) xs += xtra(i);
    const k = n + (n - 1) * (gap - 1) + xs / M.ink;
    const hCap = Math.min(o.maxSize, o.enH ? o.enH.cap(ah, k) : ah / k);
    const S = solve(info.filter(I => !I.size && !I.sq).map(I => ({ run: I.run, A: aw })), hCap / M.ink, o);
    const sq = S.sq, ems = info.map(I => I.size ? I.size / M.ink : S.em);
    const hs = ems.map(e => e * M.ink), hMax = Math.max(...hs);
    let xsPx = 0; for (let i = 0; i < n - 1; i++) xsPx += info[i].dn * ems[i] + info[i + 1].up * ems[i + 1];
    const tot = hs.reduce((p, v) => p + v, 0) + (n - 1) * (gap - 1) * hMax + xsPx + (o.enH ? o.enH.of(hs[n - 1]) : 0);
    let top = o.valign === 'top' ? A.y0 : o.valign === 'bottom' ? A.y1 - tot : A.y0 + (ah - tot) / 2;
    const out = [], rowsInfo = [], gaps = [];
    lines.forEach((L, i) => {
      const I = info[i], e = ems[i], sqI = I.sq ?? sq, w = inkW(I.run, e, sqI, tr);
      const align = L.align || (n === 1 ? 'center' : i === 0 ? 'left' : i === n - 1 ? 'right' : 'center');
      let ix = align === 'left' ? A.x0 : align === 'right' ? A.x1 - w : A.x0 + (aw - w) / 2, extra = 0;
      if (align === 'justify' && I.cs.length > 1) { ix = A.x0; extra = (aw - w) / (I.cs.length - 1); }
      const ix1 = ix + w + extra * Math.max(0, I.cs.length - 1);
      const base = top + M.asc * e;
      rowsInfo.push({ x0: ix, x1: ix1, top, base, h: hs[i], em: e });
      let x = ix - e * sqI * I.run.l0;
      I.cs.forEach((ch, j) => { out.push({ ch, x, base, em: e, row: i, line: i, idx: j, ...(I.sq ? { sq: I.sq } : {}) }); x += e * (I.run.gs[j].a * sqI + tr) + extra; });
      if (o.edges) {
        const [[el, nl], [er, nr]] = o.edges;
        if (nl) gaps.push({ at: `${nl}↔line ${i + 1}`, px: Math.round(ix - el) });
        if (nr) gaps.push({ at: `line ${i + 1}↔${nr}`, px: Math.round(er - ix1) });
      }
      top += hs[i] + (gap - 1) * hMax + (i < n - 1 ? info[i].dn * e + info[i + 1].up * ems[i + 1] : 0);
    });
    return { chars: out, rows: rowsInfo, em: S.em, sq, want: S.want, gaps, fail: S.fail };
  }

  // around (lines): each line = one row "left half | subject | right half". Each half is centred in its "edge ↔ subject" space, so the two
  // gaps on a side are equal; squeeze follows the tightest half. The subject's extent is measured from the cut-out's opaque pixels at that row's height (ext(y0, y1)).
  function layoutSplit(lines, o) {
    const M = met(), A = o.area, ah = A.y1 - A.y0, gap = o.rowGap, tr = o.track, n = lines.length, G = o.G;
    const [EL, ER] = o.edgeX;                         // left / right edges used for gaps (frame edge / text-area edge)
    const parts = lines.map(L => {
      const cs = [...L.text];
      let k = L.split;
      if (k == null) {                                // split by ink width: smallest width difference; punctuation never starts the right half
        let best = 1, bd = Infinity;
        for (let j = 1; j < cs.length; j++) {
          if (NOHEAD.test(cs[j])) continue;
          const d = Math.abs(runOf(cs.slice(0, j)).U - runOf(cs.slice(j)).U);
          if (d < bd - 1e-6 || (Math.abs(d - bd) < 1e-6 && j > best)) { bd = d; best = j; }
        }
        k = best;
      }
      k = Math.max(0, Math.min(cs.length, k));
      return { cs, k, L: runOf(cs.slice(0, k)), R: runOf(cs.slice(k)) };
    });
    const kk = n + (n - 1) * (gap - 1), hCap = Math.min(o.maxSize, ah / kk), emCap = hCap / M.ink, [lo, hi] = o.sqRange;
    const bandsOf = h => { const tot = h * kk; const t0 = o.valign === 'top' ? A.y0 : o.valign === 'bottom' ? A.y1 - tot : A.y0 + (ah - tot) / 2;
      return parts.map((_, i) => [t0 + i * h * gap, t0 + i * h * gap + h]); };
    const full = o.ext(A.y0, A.y1) || o.fallback;
    // At a given text height: each row's height -> how wide the subject actually is in those rows (shoulders / base only count there) -> ink width per half -> required squeeze
    const at = em => { const ex = bandsOf(em * M.ink).map(b => o.ext(b[0], b[1]) || full);
      const runs = parts.flatMap((p, i) => [{ run: p.L, A: ex[i][0] - EL - 2 * G }, { run: p.R, A: ER - ex[i][1] - 2 * G }]).filter(r => r.run.n);
      const bad = runs.some(r => r.A <= 1);
      const w = bad ? -Infinity : Math.min(...runs.map(({ run, A }) => run.U > 0 ? (A / em - tr * (run.n - 1)) / run.U : Infinity));
      return { ex, w }; };
    // Where a half goes: with tuck, outer side at space and inner side toward the subject; otherwise the two gaps are equal
    const place = (sp, w, tk) => tk ? Math.max(G, (sp - w) / 2) : (sp - w) / 2;
    // How far a half (cs, ink left at ix) tucks behind the subject: compare each glyph row with the subject's opaque span on that row; upper (face, body) and lower (edges) tracked separately
    const penOf = (run, cs, ix, em, sq, base, side) => {
      let x = ix - em * sq * run.l0, up = -Infinity, low = -Infinity;
      cs.forEach((ch, j) => {
        for (const [yr, l, r] of glyphRows(ch)) {
          const y = base + yr * em, se = o.rowExt(y); if (!se) continue;
          const p = side === 'L' ? x + sq * em * r - se[0] : se[1] - (x + sq * em * l);
          if (y < o.zoneY) up = Math.max(up, p); else low = Math.max(low, p);
        }
        x += em * (run.gs[j].a * sq + tr);
      });
      return { up, low };
    };
    const halves = (em, sq, exs, tk) => { const h = em * M.ink, bs = bandsOf(h), out = [];
      parts.forEach((p, i) => { const base = bs[i][0] + M.asc * em;
        if (p.L.n) { const w = inkW(p.L, em, sq, tr), sp = exs[i][0] - EL, g0 = place(sp, w, tk), ix = EL + g0; out.push({ i, side: 'L', run: p.L, cs: p.cs.slice(0, p.k), w, sp, g0, ix, base }); }
        if (p.R.n) { const w = inkW(p.R, em, sq, tr), sp = ER - exs[i][1], g0 = place(sp, w, tk), ix = ER - g0 - w; out.push({ i, side: 'R', run: p.R, cs: p.cs.slice(p.k), w, sp, g0, ix, base }); }
      }); return out; };
    const tuckOK = (em, sq, exs, T) => { const h = em * M.ink;
      return halves(em, sq, exs, true).every(q => { const pn = penOf(q.run, q.cs, q.ix, em, sq, q.base, q.side); return pn.up <= -TUCK_UP * h && pn.low <= T * h; }); };
    let S, exts;
    const need = o.sqFix ?? lo, r0 = o.emFix == null ? at(emCap) : null;
    // tuck: on by default with auto squeeze (limit TUCK_LOW); a number = your own lower-part overlap limit (fraction of text height); false = off (shrink the text)
    const T = o.tuck === false ? null : typeof o.tuck === 'number' ? o.tuck : o.sqFix == null ? TUCK_LOW : null;
    if (o.emFix != null) { const r = at(o.emFix); S = { em: o.emFix, sq: o.sqFix ?? cl(r.w, lo, hi), want: r.w, fail: r.w === -Infinity }; exts = r.ex; }
    else if (r0.w < need && T != null && o.rowExt) {
      // Whitespace would shrink the text: keep the height at the cap instead, outer gap still ≥ space, inner side may come close and tuck slightly into the subject's lower part; take the widest squeeze within the limits
      for (let e = emCap, k = 0; k < 160 && !S; k++, e *= .985) {
        const exs = bandsOf(e * M.ink).map(b => o.ext(b[0], b[1]) || full);
        let sq = null;
        if (o.sqFix != null) sq = tuckOK(e, o.sqFix, exs, T) ? o.sqFix : null;
        else if (tuckOK(e, hi, exs, T)) sq = hi;
        else if (tuckOK(e, lo, exs, T)) { let a = lo, b = hi; for (let k2 = 0; k2 < 14; k2++) { const m = (a + b) / 2; if (tuckOK(e, m, exs, T)) a = m; else b = m; } sq = a; }
        if (sq != null) { S = { em: e, sq, want: r0.w, tuck: T }; exts = exs; }
      }
    }
    if (!S && o.emFix == null) {
      // Search down from the max height: the first height whose required squeeze ≥ the lower bound (or the fixed squeeze) is the largest; then bisect to refine
      let ok = null, okR = null, bad = null;
      for (let e = emCap, k = 0; k < 160; k++, e *= .985) { const r = k ? at(e) : r0; if (r.w >= need - 1e-9) { ok = e; okR = r; break; } bad = e; }
      if (ok != null && bad != null) for (let k = 0; k < 10; k++) { const m = (ok + bad) / 2, r = at(m); if (r.w >= need - 1e-9) { ok = m; okR = r; } else bad = m; }
      if (ok == null) { S = { em: emCap * .2, sq: need, want: r0.w, fail: true }; exts = r0.ex; }
      else { S = { em: ok, sq: o.sqFix ?? Math.min(okR.w, hi), want: r0.w }; exts = okR.ex; }
    }
    const sq = S.sq, em = S.em, h = em * M.ink, tk = S.tuck != null;
    const out = [], rowsInfo = [], gaps = [];
    for (const q of halves(em, sq, exts, tk)) {
      const t = q.cs.join(''), top = q.base - M.asc * em, j0 = q.side === 'L' ? 0 : parts[q.i].k;
      let x = q.ix - em * sq * q.run.l0;
      q.cs.forEach((ch, j) => { out.push({ ch, x, base: q.base, em, row: q.i, line: q.i, idx: j0 + j }); x += em * (q.run.gs[j].a * sq + tr); });
      rowsInfo.push({ x0: q.ix, x1: q.ix + q.w, top, base: q.base, h, em });
      const eo = { at: q.side === 'L' ? `${o.edgeName[0]}↔"${t}"` : `"${t}"↔${o.edgeName[1]}`, px: Math.round(q.g0) };
      let inner;
      if (tk) { const pn = penOf(q.run, q.cs, q.ix, em, sq, q.base, q.side);     // tuck: negative = how far behind the subject
        inner = [{ at: `"${t}"↔subject top`, px: Math.round(-pn.up), tucked: true }, { at: `"${t}"↔subject bottom`, px: Math.round(-pn.low), tucked: true }]; }
      else inner = [{ at: q.side === 'L' ? `"${t}"↔subject` : `subject↔"${t}"`, px: Math.round(q.sp - q.g0 - q.w) }];
      if (q.side === 'L') gaps.push(eo, ...inner); else gaps.push(...inner, eo);
    }
    return { chars: out, rows: rowsInfo, em, sq, want: S.want, gaps, subjectX: exts, fail: S.fail, tuck: S.tuck };
  }

  // flow (kept only for the unsupported `words` mode, which errors): the subject's column is cut out of the text area and chars fill the left and right cells in reading order
  function layoutFlow(tokens, o) {
    const M = met(), A = o.area, bx = A.x0, bw = A.x1 - A.x0, by = A.y0, bh = A.y1 - A.y0, sq = o.sqFix ?? SQ_REF, tr = o.track, gap = o.rowGap;
    const [c0, c1] = o.column;
    const all = tokens.map(tk => tk.map(c => ({ ...c, a: glyph(c.ch).a })));
    const cw = (c, em) => em * (c.a * sq + tr);
    function tryEm(em) {
      const pitch = em * M.ink * gap, rows = Math.max(1, Math.floor((bh + (gap - 1) * em * M.ink) / pitch)), cells = [];
      for (let r = 0; r < rows; r++) for (const [x0, x1] of [[bx, c0], [c1, bx + bw]]) if (x1 - x0 >= em * sq * .9) cells.push({ r, x0, x1, items: [], w: 0 });
      let ci = 0;
      for (const tk of all) for (const c of tk) {
        while (ci < cells.length && cells[ci].w + cw(c, em) > cells[ci].x1 - cells[ci].x0 + 1) { if (NOHEAD.test(c.ch) && cells[ci].items.length) break; ci++; }
        if (ci >= cells.length) return null;
        cells[ci].items.push(c); cells[ci].w += cw(c, em);
      }
      return cells;
    }
    let em = o.maxSize / M.ink, cells = null;
    for (let k = 0; k < 80; k++) { cells = tryEm(em); if (cells) break; em *= .97; }
    if (!cells) return { chars: [], rows: [], em, sq, gaps: [] };
    const h = em * M.ink, used = Math.max(...cells.filter(c => c.items.length).map(c => c.r)) + 1, tot = used * h + (used - 1) * (gap - 1) * h;
    const top0 = by + (bh - tot) / 2, out = [], rowsInfo = [];
    for (const c of cells) {
      if (!c.items.length) continue;
      const top = top0 + c.r * h * gap, base = top + M.asc * em;
      let x = (c.x0 + c.x1 - c.w) / 2;
      rowsInfo.push({ x0: x, x1: x + c.w, top, base, h, em });
      for (const it of c.items) { out.push({ ...it, x, base, em, row: c.r }); x += cw(it, em); }
    }
    return { chars: out, rows: rowsInfo, em, sq, gaps: [] };
  }

  // quote: wrap a paragraph to the text-area width (punctuation never starts a line), full lines justified
  function layoutQuote(chars, o) {
    const M = met(), A = o.area, bx = A.x0, bw = A.x1 - A.x0, bh = A.y1 - A.y0, sq = o.sqFix ?? SQ_REF, tr = o.track, gap = o.rowGap;
    const all = chars.map(c => ({ ...c, g: glyph(c.ch) }));
    const cw = (c, em) => em * (c.g.a * sq + tr);
    function wrap(em) {            // auto wrap; c.brk = forced break at original punctuation (such lines aren't justified)
      const lines = [[]]; let w = 0;
      for (const c of all) {
        const cur = lines[lines.length - 1];
        if (c.brk && cur.length) { cur.hard = true; lines.push([]); w = 0; }
        else if (w + cw(c, em) > bw + 1 && cur.length && !NOHEAD.test(c.ch)) { lines.push([]); w = 0; }
        lines[lines.length - 1].push(c); w += cw(c, em);
      }
      return lines;
    }
    let em = o.emFix ?? o.maxSize / M.ink, lines;
    for (let k = 0; k < 90; k++) {
      lines = wrap(em); const n = lines.length, tot = em * M.ink * (n + (n - 1) * (gap - 1));
      if (o.emFix != null || (n <= o.maxLines && tot <= bh)) break; em *= .97;
    }
    const h = em * M.ink, n = lines.length, tot = h * (n + (n - 1) * (gap - 1));
    let top = o.valign === 'top' ? A.y0 : o.valign === 'bottom' ? A.y1 - tot : A.y0 + (bh - tot) / 2;
    const out = [], rowsInfo = [], gaps = [];
    lines.forEach((ln, i) => {
      const w = ln.reduce((p, c) => p + cw(c, em), 0);
      const extra = i < n - 1 && !ln.hard && w > bw * .85 && ln.length > 1 ? (bw - w) / (ln.length - 1) : 0;
      let x = bx - em * sq * ln[0].g.l; const base = top + M.asc * em;
      rowsInfo.push({ x0: bx, x1: bx + w + extra * (ln.length - 1), top, base, h, em });
      for (const c of ln) { out.push({ ...c, x, base, em, row: i }); x += cw(c, em) + extra; }
      top += h * gap;
    });
    if (o.edges && o.edges[0][1]) gaps.push({ at: `${o.edges[0][1]}↔quote`, px: Math.round(bx - o.edges[0][0]) });
    if (o.edges && o.edges[1][1]) gaps.push({ at: `quote↔${o.edges[1][1]}`, px: Math.round(o.edges[1][0] - Math.max(...rowsInfo.map(r => r.x1))) });
    return { chars: out, rows: rowsInfo, em, sq, gaps };
  }

  // ---------- Equal-width block (layout:'block': lines forced to equal width / gap note + symmetric ornaments / blocks hard-swapped within a shot / per-line slide direction) ----------
  // Each line is scaled horizontally to the same width, so lines with fewer chars get taller (e.g. a short word ends up ~1.5× the height of a longer line).
  //   Horizontal ratio 0.60–0.78 for Latin; ink gap between lines 40–83 px, 78 px when a gap note sits between them; gap note caps about 24 px;
  //   ornaments: star ~65 × 71 px, X ~35 × 50 px, 100–230 px from the block edge, as a symmetric pair (left/right or top/bottom) or one on the block's side centre line.
  const LATIN_WT = { Fraunces: 900, AbrilFatface: 400, Anton: 400 };
  const BLOCK = {
    sqLatin: .70,          // default horizontal ratio for Latin lines (middle of the 0.60–0.78 range)
    sqCJK: .52,            // default horizontal ratio for CJK lines (same as bigType's auto squeeze cap)
    sqCJKMax: .60,         // CJK cap: a block has no subject between the text, so up to 0.60 is fine (around / rows stay 0.40–0.52)
    trackLatin: -.02,      // letter gap about 0.025 × height (nearly touching)
    gap: .16, gapMin: 36, gapMax: 90,   // ink gap between lines = average line height × 0.16, clamped to 36–90 px
    midSize: 24, midGap: 3.25,          // gap note 24 px; the gap holding it is ≥ size × 3.25
    orn: { star: 68, x: 50, dot: 30 },  // default ornament height (px)
    slide: .3,             // per-line slide duration (no overshoot)
  };
  const FMET = new Map();
  function famMet(fam, wt) {      // this font's "line height" / em: Latin from capital H ink, CJK from 国 ink; asc = baseline to ink top
    const k = fam + '|' + wt; if (FMET.has(k)) return FMET.get(k);
    const g = met().g; g.letterSpacing = '0px'; g.font = `${wt} 1000px ${fam}`;
    const cjk = fam === FAM, m = g.measureText(cjk ? '国' : 'H');
    const r = { cap: (m.actualBoundingBoxAscent + (cjk ? m.actualBoundingBoxDescent : 0)) / 1000, asc: m.actualBoundingBoxAscent / 1000 };
    if (fontsReady()) FMET.set(k, r);
    return r;
  }
  function lineInk(text, fam, wt, track) {   // left / right ink of a whole line at em = 1, unsqueezed (relative to origin)
    const g = met().g; g.font = `${wt} 1000px ${fam}`; g.letterSpacing = (track * 1000).toFixed(1) + 'px';
    const m = g.measureText(text); g.letterSpacing = '0px';
    return { l: -(m.actualBoundingBoxLeft || 0) / 1000, r: (m.actualBoundingBoxRight ?? m.width) / 1000 };
  }
  // A block: B = { lines:[{ text, fam, wt, sq, track }], mid:{ text, size, between }, gap, width }
  // area = where ink may go (space subtracted horizontally, 72% vertically). Block width first fills the area width (or width); if the lines exceed the area height the whole block scales down
  function layoutBlock(B, area, o) {
    const L = B.lines.map(l => { const fm = famMet(l.fam, l.wt), ink = lineInk(l.text, l.fam, l.wt, l.track); return { ...l, fm, ink, U: Math.max(1e-3, ink.r - ink.l) }; });
    const n = L.length, mid = B.mid && B.mid.text ? B.mid : null, mj = mid ? Math.max(0, Math.min(n - 2, mid.between ?? 0)) : -1;
    const midSize = mid ? (mid.size ?? BLOCK.midSize) : 0;
    const hsOf = Wb => L.map(l => l.fm.cap * Wb / (l.sq * l.U));
    const gapsOf = hs => { const avg = hs.reduce((p, v) => p + v, 0) / hs.length;
      return hs.slice(1).map((_, i) => { let g0 = B.gap ?? cl(avg * BLOCK.gap, BLOCK.gapMin, BLOCK.gapMax); if (i === mj || (n === 1 && mid)) g0 = Math.max(g0, midSize * BLOCK.midGap); return g0; }); };
    const tot = Wb => { const hs = hsOf(Wb); return hs.reduce((p, v) => p + v, 0) + gapsOf(hs).reduce((p, v) => p + v, 0) + (n === 1 && mid ? midSize * BLOCK.midGap + midSize : 0); };
    const aw = area.x1 - area.x0, ah = area.y1 - area.y0, Hc = Math.min(ah, B.maxH ?? Infinity);
    let Wb = Math.min(aw, B.width ?? aw);
    if (tot(Wb) > Hc) { let a = 1, b = Wb; for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (tot(m) > Hc) b = m; else a = m; } Wb = a; }
    const hs = hsOf(Wb), gs = gapsOf(hs), T = tot(Wb);
    const al = B.align || 'center';
    const x0 = al === 'left' ? area.x0 : al === 'right' ? area.x1 - Wb : area.x0 + (aw - Wb) / 2;
    let top = o.valign === 'top' ? area.y0 : o.valign === 'bottom' ? area.y1 - T : area.y0 + (ah - T) / 2;
    const top0 = top, lines = [];
    L.forEach((l, i) => { const em = Wb / (l.sq * l.U);
      lines.push({ ...l, em, h: hs[i], top, base: top + l.fm.asc * em, ox: x0 - l.ink.l * em * l.sq, x0, x1: x0 + Wb });
      top += hs[i] + (i < n - 1 ? gs[i] : 0); });
    let midPos = null;
    if (mid) midPos = n === 1 ? { x: x0 + Wb / 2, y: lines[0].top + hs[0] + midSize * BLOCK.midGap / 2 + midSize / 2 } : { x: x0 + Wb / 2, y: lines[mj].top + hs[mj] + gs[mj] / 2 };
    // The horizontal line ornaments align to by default: the gap note if any, else the first gap with 2+ lines, else the line's centre
    const cy = midPos ? midPos.y : n > 1 ? lines[0].top + hs[0] + gs[0] / 2 : lines[0].top + hs[0] / 2;
    return { lines, x0, x1: x0 + Wb, w: Wb, top: top0, bottom: top0 + T, mid: midPos && { ...mid, size: midSize, ...midPos }, cy, gaps: gs };
  }
  // Ornaments: star = solid six-petal blunt star (three flat-ended bars crossing at 60°, slightly flared ends, petal root .235h, tip .29h) | x = heavy narrow sans X | dot = solid square dot
  function drawOrnament(g, kind, cx, cy, h, col) {
    g.save(); g.fillStyle = col;
    if (kind === 'star') {
      const R = h / 2, wi = .235 * h, wo = .29 * h;
      for (const ang of [90, 30, -30]) { const th = ang * Math.PI / 180, ux = Math.cos(th), uy = -Math.sin(th), vx = -uy, vy = ux;
        const p = [[ux * R + vx * wo / 2, uy * R + vy * wo / 2], [vx * wi / 2, vy * wi / 2], [-ux * R + vx * wo / 2, -uy * R + vy * wo / 2],
          [-ux * R - vx * wo / 2, -uy * R - vy * wo / 2], [-vx * wi / 2, -vy * wi / 2], [ux * R - vx * wo / 2, uy * R - vy * wo / 2]];
        g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(cx + x, cy + y) : g.moveTo(cx + x, cy + y)); g.closePath(); g.fill(); }
    } else if (kind === 'x') {
      g.font = '400 200px Anton'; g.textBaseline = 'alphabetic'; const m = g.measureText('X');
      const iw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, ih = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, w = h * .72;
      g.translate(cx - w / 2, cy - h / 2); g.scale(w / iw, h / ih); g.fillText('X', m.actualBoundingBoxLeft, m.actualBoundingBoxAscent); XM.note('Anton', 'X');
    } else { const s = h; g.fillRect(cx - s / 2, cy - s / 2, s, s); }
    g.restore();
  }
  // Ornament placement: sides = left/right pair (on the gap line) | ends = top/bottom pair (on the block centre line) | left / right / top / bottom = single
  function ornSpots(O, b) {
    const kind = O.kind || 'star', h = O.size ?? BLOCK.orn[kind] ?? 50, place = O.place || 'sides';
    const dx = O.gap ?? cl(b.w * .16, 90, 230), dy = O.gap ?? cl((b.bottom - b.top) * .16, 60, 150);
    const cx = (b.x0 + b.x1) / 2, cy = O.y ?? b.cy;
    const L = [b.x0 - dx, cy], R = [b.x1 + dx, cy], Tp = [cx, b.top - dy], Bt = [cx, b.bottom + dy];
    const at0 = { sides: [L, R], ends: [Tp, Bt], left: [L], right: [R], top: [Tp], bottom: [Bt] }[place];
    if (!at0) { console.error(`XM.bigType: ornaments.place must be sides / ends / left / right / top / bottom, got ${place}`); return { kind, h, at: [] }; }
    // Stay out of the corner HUD band (110 px safe area): for very tall / wide blocks, ornaments move in toward the block
    const m = typeof XM.DS.SAFE === 'number' ? XM.DS.SAFE : 110, at = at0.map(([x, y]) => [cl(x, m + h / 2, W - m - h / 2), cl(y, m + h / 2, H - m - h / 2)]);
    return { kind, h, at };
  }
  // Logo name card (bigName name.img): image sized to the text area width / height, centred or against one edge; no drift
  function logoBox(R, area, nm) {
    const iw = R.img.naturalWidth || 1, ih = R.img.naturalHeight || 1, aw = area.x1 - area.x0, ah = area.y1 - area.y0;
    let w = nm.w ?? Math.min(aw * (nm.fill ?? 1), ah * (nm.maxH ?? .62) * iw / ih); const h = w * ih / iw;
    const al = nm.align || 'center';
    const x = nm.x != null ? nm.x - w / 2 : al === 'left' ? area.x0 : al === 'right' ? area.x1 - w : area.x0 + (aw - w) / 2;
    const y = nm.y != null ? nm.y - h / 2 : area.y0 + (ah - h) * (nm.vpos ?? .5);
    return [x, y, w, h];
  }

  // ---------- Subject (foreground) ----------
  // Opaque span of each row of the cut-out (alpha > 64), measured once and cached; if the canvas is tainted under file:// and pixels can't be read, fall back to the image's bounding box
  function profileOf(R) {
    if (!R || !R.ok) return null;
    if (R._prof !== undefined) return R._prof;
    try {
      const iw = R.img.naturalWidth, ih = R.img.naturalHeight, s = Math.min(1, 600 / ih);
      const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(R.img, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data, rows = new Array(h);
      for (let y = 0; y < h; y++) { let a = -1, b = -1; for (let i = 0; i < w; i++) if (d[(y * w + i) * 4 + 3] > 64) { if (a < 0) a = i; b = i; } rows[y] = a < 0 ? null : [a / w, (b + 1) / w]; }
      R._prof = rows;
    } catch (e) { R._prof = null; }
    return R._prof;
  }
  // ---------- Portrait edge texture (subject.texture) ----------
  // For portrait photos only: monochrome noise / halftone concentrated along the body outline, face kept clean. Touches only the
  // subject layer, never the text or background.
  //   kind 'grain' | 'dissolve' | 'halftone'; amount 0–1; edge = band width from the outline inward (px); size = grain / dot spacing (px);
  //   fps 0 = static (default) | n = regrain n times per second; seed; face = face box(es) [x, y, w, h] (fractions of the image) or false;
  //   halftone also takes shape 'dot' | 'line' | 'square', angle (default 45°), tone 0–1;
  //   back = only texture parts further from the camera than the face (needs a depth map next to the image, or depth: path);
  //   avoidText = leave out the area close to the big type.
  //   Expects <name>.face.json (and <name>.depth.png for back) next to the cut-out; a missing file is reported as an error.
  const TEX_KIND = { grain: { amount: .6, size: 2 }, dissolve: { amount: .5, size: 2 }, halftone: { amount: .7, size: 9 } };
  // Default (texture omitted) and texture:true use this preset. Applies only when face boxes are found for the image (objects get nothing);
  // texture:false turns it off.
  const TEX_PRESET = { kind: 'halftone', size: 5, amount: .9, edge: 40, back: true, avoidText: true };
  // Avoid text: no texture within AVOID[0] × space of the big type's ink (incl. the English line), feathered back to normal at AVOID[1] × space
  const AVOID = [1, 1.6];
  const hash3 = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const sstep = (a, b, v) => { const k = cl((v - a) / (b - a)); return k * k * (3 - 2 * k); };
  function loadJSON(url) {     // readable via XHR under file:// rendering (--allow-file-access-from-files); null if not
    return new Promise(res => { try { const x = new XMLHttpRequest(); x.open('GET', url); x.onload = () => { try { res(JSON.parse(x.responseText)); } catch (e) { res(null); } };
      x.onerror = () => res(null); x.send(); } catch (e) { res(null); } });
  }
  function textureOf(s, R, boxOf) {
    const auto = s.texture == null;                                             // omitted = on by default (face boxes decide whether it's a person)
    const T0 = auto || s.texture === true ? TEX_PRESET : s.texture, T = { ...(TEX_KIND[T0.kind] || {}), ...T0 };
    if (!TEX_KIND[T.kind]) { console.error(`XM.bigType: subject.texture.kind must be ${Object.keys(TEX_KIND).join(' / ')}, got ${T.kind}`); return null; }
    // Sidecar files are read by convention rather than probed (a missing file under file:// always logs a browser error):
    //   <name>.face.json lists face boxes (faces:[] marks an object: no texture); for people, <name>.depth.png (255 = nearest) is read
    //   once a face is confirmed. back:'face' textures parts at about the face's depth or further back:
    //   nearness ≤ face − 0.04 fully, ≥ face + 0.14 not at all. Without a face box [0.45, 0.62] is used; an explicit array also works.
    const backR = T.back ? (Array.isArray(T.back) ? T.back : 'face') : null;
    const depthSrc = T.depth || String(s.src).replace(/\.[a-z]+$/i, '.depth.png');
    let depthR = null, off = false;
    const loadDepth = () => { depthR = { img: new Image(), ok: false };
      return new Promise(res => { depthR.img.onload = () => { depthR.ok = true; res(); };
        depthR.img.onerror = () => { console.error(`XM.bigType: ${s.src} is a photo of a person; a layered halftone needs a depth map at ${depthSrc} (or set texture:false)`); res(); };
        depthR.img.src = depthSrc; }); };
    let faces = s.face === false ? [] : s.face ? (Array.isArray(s.face[0]) ? s.face : [s.face]) : null;
    if (!faces) XM.asset(loadJSON(String(s.src).replace(/\.[a-z]+$/i, '.face.json')).then(j => {
      faces = j && j.faces ? j.faces.map(f => [f.x, f.y, f.w, f.h]) : [];
      if (!j) { off = true; console.error(`XM.bigType: ${s.src} has no .face.json face-box file next to it (an object gets one with 0 faces and no halftone); or set subject.texture:false`); return; }
      if (!faces.length) { off = true; return; }                                   // object: no texture
      if (backR) return loadDepth();
    }));
    else if (!faces.length) off = true;
    else if (backR) XM.asset(loadDepth());
    let prep = null, cache = null, cacheKey = null, avoid = null;
    function prepare(w, h, box) {     // computed once: pixels at drawn size, edge distances, face weight, depth split, text avoidance
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(R.img, 0, 0, w, h);
      const src = g.getImageData(0, 0, w, h), d = src.data, N = w * h, INF = 1e9;
      const inside = new Uint8Array(N); for (let i = 0; i < N; i++) inside[i] = d[i * 4 + 3] > 128 ? 1 : 0;
      // Two-pass chamfer distance: din = distance from a subject pixel to the nearest transparent pixel; dout = from a transparent pixel to the nearest subject pixel (+ that pixel's index, for its colour). The image border doesn't count as an edge
      const din = new Float32Array(N), dout = new Float32Array(N), near = new Int32Array(N);
      for (let i = 0; i < N; i++) { din[i] = inside[i] ? INF : 0; dout[i] = inside[i] ? 0 : INF; near[i] = inside[i] ? i : -1; }
      const A = 1, B = 1.4142;
      const pass = (D, prop) => {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (D[i] === 0) continue;
          const tr = (j, c2) => { if (D[j] + c2 < D[i]) { D[i] = D[j] + c2; if (prop) near[i] = near[j]; } };
          if (x > 0) tr(i - 1, A); if (y > 0) { tr(i - w, A); if (x > 0) tr(i - w - 1, B); if (x < w - 1) tr(i - w + 1, B); } }
        for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (D[i] === 0) continue;
          const tr = (j, c2) => { if (D[j] + c2 < D[i]) { D[i] = D[j] + c2; if (prop) near[i] = near[j]; } };
          if (x < w - 1) tr(i + 1, A); if (y < h - 1) { tr(i + w, A); if (x < w - 1) tr(i + w + 1, B); if (x > 0) tr(i + w - 1, B); } }
      };
      pass(din, false); pass(dout, true);
      // Face: the detected box stops at the eyebrows, so extend upward (forehead, hair); feather outside the ellipse, no hard edge
      const face = new Float32Array(N);
      for (const [fx, fy, fw, fh] of faces || []) {
        const cx = (fx + fw / 2) * w, cy = (fy + fh * .45) * h, rx = fw * w * .5 * 1.25, ry = fh * h * .5 * 1.3;   // extend up to the forehead without covering the hair
        for (let y = Math.max(0, Math.floor(cy - ry * 1.6)); y < Math.min(h, cy + ry * 1.6); y++)
          for (let x = Math.max(0, Math.floor(cx - rx * 1.6)); x < Math.min(w, cx + rx * 1.6); x++) {
            const e = Math.hypot((x - cx) / rx, (y - cy) / ry), v = 1 - sstep(1, 1.45, e), i = y * w + x; if (v > face[i]) face[i] = v; }
      }
      let back = null;
      if (backR) {
        if (depthR && depthR.ok) { const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const g2 = c2.getContext('2d', { willReadFrequently: true });
          g2.drawImage(depthR.img, 0, 0, w, h); const dd = g2.getImageData(0, 0, w, h).data; back = new Float32Array(N);
          let br = backR;
          if (br === 'face') {          // median depth inside the face box = the face's nearness
            const vals = [];
            for (const [fx, fy, fw, fh] of faces || []) for (let y = Math.floor(fy * h); y < (fy + fh) * h; y += 2) for (let x = Math.floor(fx * w); x < (fx + fw) * w; x += 2)
              if (x >= 0 && y >= 0 && x < w && y < h && inside[y * w + x]) vals.push(dd[(y * w + x) * 4] / 255);
            vals.sort((p, q) => p - q);
            br = vals.length ? [vals[vals.length >> 1] - .04, vals[vals.length >> 1] + .14] : [.45, .62];
          }
          for (let i = 0; i < N; i++) back[i] = 1 - sstep(br[0], br[1], dd[i * 4] / 255);
          back.range = br; }
      }
      let far = null;                  // text avoidance: avoid(frame x, y) = 0 (touching text) ... 1 (far enough)
      if (avoid && T.avoidText !== false && box) { far = new Float32Array(N); const sx = box[2] / w, sy = box[3] / h;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) far[y * w + x] = avoid(box[0] + (x + .5) * sx, box[1] + (y + .5) * sy); }
      return { w, h, src, din, dout, near, face, inside, back, far };
    }
    function render(seed, bgL) {
      const { w, h, src, din, dout, near, face, inside, back, far } = prep, d = src.data, out = new ImageData(w, h), o = out.data;
      const E = T.edge ?? Math.max(12, h * .08), amt = cl(T.amount), sz = Math.max(1, T.size | 0), base = T.kind === 'grain' ? (T.base ?? .18) : 0;
      const wOf = i => { const e = din[i] < E ? Math.pow(1 - din[i] / E, 1.5) : 0; return Math.max(e, base) * (1 - face[i]) * amt * (back ? back[i] : 1) * (far ? far[i] : 1); };
      if (T.kind === 'grain') {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, k = i * 4; o[k] = d[k]; o[k + 1] = d[k + 1]; o[k + 2] = d[k + 2]; o[k + 3] = d[k + 3];
          if (!d[k + 3]) continue; const wt = wOf(i); if (wt <= 0) continue;
          const n = (hash3(x / sz | 0, y / sz | 0, seed) + hash3(x / sz | 0, y / sz | 0, seed + 7919) - 1);          // sum of two uniforms: roughly bell-shaped grain
          const L = (d[k] * .299 + d[k + 1] * .587 + d[k + 2] * .114) / 255, mid = .35 + 2.6 * L * (1 - L);
          const dv = n * wt * 120 * mid; o[k] = cl(d[k] + dv, 0, 255); o[k + 1] = cl(d[k + 1] + dv, 0, 255); o[k + 2] = cl(d[k + 2] + dv, 0, 255); }
      } else if (T.kind === 'dissolve') {
        const Eo = E * .35;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, k = i * 4, r = hash3(x / sz | 0, y / sz | 0, seed);
          if (inside[i]) { const wt = wOf(i);
            if (r < wt * .85) { o[k + 3] = 0; continue; }                                   // edge pixels break up (1-bit: either present or gone)
            o[k] = d[k]; o[k + 1] = d[k + 1]; o[k + 2] = d[k + 2]; o[k + 3] = d[k + 3]; continue; }
          if (dout[i] < Eo && near[i] >= 0) { const j = near[i], p = Math.pow(1 - dout[i] / Eo, 2) * amt * .45 * (1 - face[j]);
            if (r < p) { const q = j * 4; o[k] = d[q]; o[k + 1] = d[q + 1]; o[k + 2] = d[q + 2]; o[k + 3] = 255; } }  // grains scattered outward take the nearest subject colour
        }
      } else {                                                                              // halftone (AM: fixed spacing, dot size = coverage)
        const S = sz, th = (T.angle ?? 45) * Math.PI / 180, ca = Math.cos(th), sa = Math.sin(th), shape = T.shape || 'dot', tone = cl(T.tone ?? 0);
        const ox = seed ? hash3(seed, 1, 3) * S : 0, oy = seed ? hash3(seed, 2, 5) * S : 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, k = i * 4; if (!inside[i]) continue;
          const wt = wOf(i);
          if (wt <= .001) { o[k] = d[k]; o[k + 1] = d[k + 1]; o[k + 2] = d[k + 2]; o[k + 3] = d[k + 3]; continue; }
          let cov = 1 - wt;
          if (tone > 0) { const L = (d[k] * .299 + d[k + 1] * .587 + d[k + 2] * .114) / 255, c = Math.min(1, Math.abs(L - bgL) * 2);
            cov = 1 - wt * (1 + tone * (1 - c)); }                                                // low-contrast areas against the background break up first (smaller dots), high-contrast areas hold
          cov = Math.max(0, cov);
          const X = x + ox, Y = y + oy, u = X * ca + Y * sa, v = Y * ca - X * sa, du = u - Math.round(u / S) * S, dv = v - Math.round(v / S) * S;
          let r, dist;
          if (shape === 'line') { r = S / 2 * cov; dist = Math.abs(dv); }                           // line screen: line width = coverage
          else if (shape === 'square') { r = S / 2 * Math.sqrt(cov); dist = Math.max(Math.abs(du), Math.abs(dv)); }
          else { r = S * Math.SQRT1_2 * Math.sqrt(cov) * 1.02; dist = Math.hypot(du, dv); }          // round dot
          const a = cl((r - dist) + .5);                                                            // 1 px anti-aliased dot edge
          o[k] = d[k]; o[k + 1] = d[k + 1]; o[k + 2] = d[k + 2]; o[k + 3] = d[k + 3] * a; }
      }
      return out;
    }
    return {
      wantsAvoid: () => T.avoidText === true,
      setAvoid(fn) { avoid = fn; prep = null; },
      canvas(t, box, bgL = 0) {        // this frame's texture image (static: computed once; fps: regrain every 1/fps s); box = subject's drawn [x, y, w, h]; bgL = stage luminance
        if (off || !R || !R.ok || faces === null || (backR && !(depthR && depthR.ok))) return null;
        const w = Math.max(1, Math.round(box[2])), h = Math.max(1, Math.round(box[3]));
        if (!prep || prep.w !== w || prep.h !== h) { prep = prepare(w, h, box); cacheKey = null; }
        const seed = (T.seed ?? 1) + (T.fps ? 1 + Math.floor(t * T.fps + 1e-6) : 0);
        const key = seed + '|' + bgL.toFixed(3);
        if (cacheKey !== key) { if (!cache) { cache = document.createElement('canvas'); } cache.width = w; cache.height = h; cache.getContext('2d').putImageData(render(seed, bgL), 0, 0); cacheKey = key; }
        return cache;
      },
    };
  }

  function subjectOf(s) {
    if (!s) return null;
    if (!s.src && !s.draw) { console.error('XM.bigType: subject needs src (a cut-out transparent PNG) or draw(g, t, P, api)'); return null; }
    const R = s.src ? XM.image(s.src) : null;
    const me = {
      o: s, R,
      box() {      // drawn position [x, y, w, h]; side:'left'|'right' = against one side of the frame (name card, quote)
        if (!R || !R.ok) return s.box || [(s.x ?? W / 2), s.y ?? H, 0, 0];
        const h = s.h ?? H * .86, w = h * R.img.naturalWidth / R.img.naturalHeight, edge = s.edge ?? 40;
        const x = s.side === 'right' ? W - edge - w : s.side === 'left' ? edge : (s.x ?? W / 2) - w / 2;
        const y = (s.y ?? H) - (s.anchor === 'center' ? h / 2 : h);
        return [x, y, w, h];
      },
      // The subject's actual horizontal extent [x0, x1] within rows y0–y1; no subject pixels there -> null
      ext(y0, y1) {
        if (s.column) return s.column;
        const [bx, by, bw, bh] = me.box();
        if (!bw) return null;
        const P = profileOf(R);
        if (!P) return (y1 < by || y0 > by + bh) ? null : [bx, bx + bw];
        const n = P.length, r0 = Math.max(0, Math.floor((y0 - by) / bh * n)), r1 = Math.min(n - 1, Math.ceil((y1 - by) / bh * n));
        let a = Infinity, b = -Infinity;
        for (let r = r0; r <= r1; r++) if (P[r]) { a = Math.min(a, P[r][0]); b = Math.max(b, P[r][1]); }
        return a > b ? null : [bx + a * bw, bx + b * bw];
      },
      // The subject's opaque span [x0, x1] on frame row y (no pixels -> null): used to measure tucking
      rowExt(y) {
        const [bx, by, bw, bh] = me.box(); if (!bw || y < by || y >= by + bh) return null;
        if (s.column) return s.column;
        const P = profileOf(R); if (!P) return [bx, bx + bw];
        const r = P[Math.min(P.length - 1, Math.floor((y - by) / bh * P.length))];
        return r ? [bx + r[0] * bw, bx + r[1] * bw] : null;
      },
      // Divider y between upper (face, upper body) and lower (armrests, hands, legs, base): TUCK_ZONE of the subject's visible height (opaque top -> bottom in frame)
      zoneY() {
        const [bx, by, bw, bh] = me.box(); const P = profileOf(R);
        let top = by; if (P) { const k = P.findIndex(r => r); if (k >= 0) top = by + k / P.length * bh; }
        const bot = Math.min(by + bh, H);
        return top + (bot - top) * TUCK_ZONE;
      },
      // The subject's body centre line within rows y0–y1 (average of each row's opaque-span midpoint): the 'behind' layout centres the text on it
      axis(y0, y1) {
        if (s.axis != null) return s.axis;
        const [bx, by, bw, bh] = me.box(); if (!bw) return null;
        const P = profileOf(R); if (!P) return bx + bw / 2;
        const n = P.length, r0 = Math.max(0, Math.floor((y0 - by) / bh * n)), r1 = Math.min(n - 1, Math.ceil((y1 - by) / bh * n));
        let sum = 0, k = 0; for (let r = r0; r <= r1; r++) if (P[r]) { sum += (P[r][0] + P[r][1]) / 2; k++; }
        return k ? bx + sum / k * bw : bx + bw / 2;
      },
      ready: () => !R || R.ok,
    };
    if (s.texture != null && s.texture !== false && R) me.tex = textureOf(s, R, () => me.box());     // opt-in: needs <name>.face.json next to the image
    return me;
  }

  // ---------- Shared engine ----------
  function build(o, kind) {
    const P = { ...DS.tone(o.tone || 'ink') }, lead = (o.lead ?? 2), tail = (o.tail ?? 2);
    const fg = o.color === 'accent' ? P.accent : o.color && o.color !== 'fg' ? XK.col(o.color) : P.fg;
    const track = o.track ?? 0;
    const under = o.under || null;
    const subj = subjectOf(o.subject);
    const outT = o.out != null ? snapT(o.out) : o.until != null ? snapT(o.until - tail / fps()) : null;
    const showAt = at => snapT(at - lead / fps());
    const name = kind === 'name' ? 'bigName' : kind === 'quote' ? 'bigQuote' : 'bigType';
    const errs = m => console.error('XM.' + name + ': ' + m);
    // Optional extras: enter mode, fill, behind word, notes, subject shadow
    const EN = typeof o.enter === 'string' ? { kind: o.enter } : { kind: 'cut', ...(o.enter || {}) };
    if (!['cut', 'sweep', 'slide', 'rise'].includes(EN.kind)) errs(`enter must be 'cut' / 'sweep' / 'slide' / 'rise', got ${EN.kind}`);
    if (EN.kind !== 'cut' && kind === 'quote') errs('bigQuote already fades in sentence by sentence; enter is not for bigQuote');
    const FILL = o.fill == null || o.fill === 'flat' ? null : o.fill === 'grad' ? { grad: .35 } : o.fill;
    if (o.fill != null && o.fill !== 'flat' && !(FILL && FILL.grad > 0)) errs(`fill must be 'flat' (default) | 'grad' | { grad:k }, got ${JSON.stringify(o.fill)}`);
    if (o.behind && (!o.behind.text || CJK.test(o.behind.text))) errs('behind.text is the English italic word behind the big type: English only (CJK goes in the big type itself)');
    if (o.notes && !Array.isArray(o.notes)) errs('notes must be an array: [{ at: index or character, text, pos }]');
    (o.notes || []).forEach((n, i) => { if (!n || !n.text) errs(`notes[${i}] is missing text`); else if (CJK.test(n.text)) errs(`notes[${i}] is small English text beside a character: English only`); });

    // Squeeze: 'auto' (default) from whitespace; a number = fixed by the caller (overrides auto)
    const sqFix = typeof o.squeeze === 'number' ? o.squeeze : null;
    if (o.squeeze != null && o.squeeze !== 'auto' && sqFix == null) errs(`squeeze must be 'auto' (default, from the free space) or a number, got ${o.squeeze}`);
    if (sqFix != null && !(sqFix > .1 && sqFix <= 1.2)) errs(`squeeze ${sqFix} does not look like a width ratio (glyph width / height, typically about 0.45)`);
    const sqRange = o.squeezeRange || SQ_RANGE;
    const G = (o.space ?? SPACE) * W;

    // Text units: { ch, t (appear time), part (which spoken segment), line (which row on screen), brk (quote breaks here) }
    let units = [], mode = kind;
    const stripped = [], disp = [];       // removed punctuation; on-screen row -> which lines entry it came from
    if (kind === 'quote') {
      if (!o.parts || !o.parts.length) errs('parts (the quote split into sentences, each { text, at }) is required: set it from the video\'s script; there is no default text');
      let pend = false;          // quote: break where the original sentence had a comma (or other mid-sentence punctuation)
      (o.parts || []).forEach((p, pi) => { if (p.at == null) errs(`parts[${pi}] is missing at`);
        const C = cleanText(p.text, o.marks); stripped.push(...C.removed);
        C.segs.forEach((seg, si) => { [...seg].forEach((ch, j) => units.push({ ch, t: showAt(p.at ?? 0), part: pi, brk: j === 0 && (si > 0 || pend) })); });
        pend = C.endBreak; });
    } else if (o.words) {
      errs('words (chars popping in to fill the frame) is not supported; for lists, cut lines in one after another (each line with its own at)');
      mode = 'flow';
      o.words.forEach((wd, wi) => {
        if (wd.at == null && !wd.chars) errs(`words[${wi}] is missing at`);
        const per = wd.per ?? o.per ?? .16;
        [...String(wd.text || '')].forEach((ch, j) => units.push({ ch, t: snapT((wd.chars && wd.chars[j] != null ? wd.chars[j] : (wd.at ?? 0) + j * per) - lead / fps()), part: wi, line: wi }));
      });
    } else if (kind === 'name' && o.name && o.name.img) {
      // Logo name card: the name is an image. Subtitle hand-off defaults to keep (the logo isn't spoken words); name.text, if given, is used as its text (hand-off, checks)
      mode = 'logo';
      if (o.name.at == null) errs('name.at (when the logo appears) is required: set it from the voice-over');
      units.push({ ch: String(o.name.text || ''), t: showAt(o.name.at ?? 0), part: 0, line: 0 });
    } else if (kind !== 'name' && (o.layout === 'block' || o.blocks)) {
      // Equal-width block: blocks = several blocks hard-swapped within one shot, each with its own lines / mid / ornaments; for a single block just write lines
      mode = 'block';
      const BL = o.blocks || [{ lines: o.lines, mid: o.mid, ornaments: o.ornaments, width: o.width, align: o.blockAlign, gap: o.gap }];
      if (!BL.length) errs('blocks needs at least one block');
      let part = 0;
      BL.forEach((B, bi) => {
        const ls = (B && B.lines) || [];
        if (!ls.length || !ls.some(l => l && l.text)) errs(o.blocks ? `blocks[${bi}].lines is required: set it from the video's script; there is no default text` : 'lines is required: set it from the video\'s script; there is no default text');
        ls.forEach((L, li) => { const at = L.at ?? B.at ?? o.at; if (at == null) errs(`${o.blocks ? `blocks[${bi}] ` : ''}line ${li + 1} is missing at (when this line is spoken)`);
          if (L.from && !['left', 'right', 'top', 'bottom'].includes(L.from)) errs(`lines[${li}].from must be left / right / top / bottom, got ${L.from}`);
          const C = cleanText(L && L.text, o.marks); stripped.push(...C.removed);
          C.segs.forEach(seg => { const dl = disp.length; disp.push({ src: L || {}, single: C.segs.length === 1, block: bi });
            [...seg].forEach(ch => units.push({ ch, t: showAt(at ?? 0), part, line: dl, block: bi, color: L.color })); });
          part++; });
      });
      o._blocks = BL;
    } else {
      const lines = kind === 'name' ? (o.name ? [o.name] : []) : (o.lines || []);
      if (!lines.length || !lines.some(l => l && l.text)) errs(kind === 'name' ? 'name:{ text, at } (the concept name) is required: set it from the video\'s script; there is no default text' : 'lines is required: set it from the video\'s script; there is no default text');
      mode = kind === 'name' ? 'rows' : (o.layout || 'rows');
      if (mode !== 'rows' && mode !== 'around' && mode !== 'behind') errs(`layout must be 'rows' / 'around' / 'behind' / 'block', got ${mode}`);
      if (o.tuck != null && mode !== 'around') errs('tuck is only for around (behind already puts the whole group behind the subject)');
      if (o.tuck != null && o.tuck !== false && !(typeof o.tuck === 'number' && o.tuck >= 0 && o.tuck <= .3)) errs(`tuck must be false (off) or 0–0.3 (how far, as a share of glyph height, the subject\'s lower part may tuck into the text), got ${o.tuck}`);
      lines.forEach((L, li) => { const at = L.at ?? o.at; if (at == null) errs(`line ${li + 1} is missing at (when this line is spoken)`);
        const C = cleanText(L && L.text, o.marks); stripped.push(...C.removed);       // mid-sentence punctuation -> one line becomes several (same at, same sound, same subtitle hand-off)
        C.segs.forEach(seg => { const dl = disp.length; disp.push({ src: L || {}, single: C.segs.length === 1 });
          [...seg].forEach(ch => units.push({ ch, t: showAt(at ?? 0), part: li, line: dl, color: L.color })); }); });
    }
    if (o.en && o.en.text && CJK.test(o.en.text)) errs('en is one line with the original English name: English only');
    if (stripped.length) console.warn(`XM.${name}: big type keeps commas but drops full stops and similar marks; removed "${[...new Set(stripped)].join('')}" and broke the line where mid-sentence marks were${o.marks ? ' (marks:true kept ? and !)' : ''}`);
    if (mode === 'around' && o.subject && o.subject.draw && !o.subject.column) errs('around with a hand-drawn subject (subject.draw) needs subject.column = [x0, x1] (the horizontal span the subject really covers); the component cannot measure it');

    // Text area: text ↔ edge gaps are measured from its edges. Default the whole frame; with under, the footage window; box if given
    const region = o.box && typeof o.box !== 'function' ? o.box : under ? under.box : [0, 0, W, H];
    const logoR = mode === 'logo' ? XM.image(o.name.img) : null;
    const enO = o.en && o.en.text ? { text: o.en.text, at: o.en.at, size: o.en.size, squeeze: o.en.squeeze ?? .78, color: o.en.color, gap: o.en.gap ?? .16 } : null;
    // Height of the name-card English line (depends on big type height h), and the inverse: given total height ah and row factor k, the max big type height
    const enH = enO ? {
      size: h => enO.size || Math.max(56, h * .13),
      of: h => (enO.size || Math.max(56, h * .13)) * (enO.gap + .74),
      cap: (ah, k) => { const f = enO.gap + .74; if (enO.size) return (ah - enO.size * f) / k; const h1 = ah / (k + .13 * f); return h1 * .13 >= 56 ? h1 : (ah - 56 * f) / k; },
    } : null;

    // Where ink may go + the edges used to measure gaps
    function areaOf() {
      const [rx, ry, rw, rh] = region, vIn = rh * (1 - VFILL) / 2;
      const a = { x0: rx + G, x1: rx + rw - G, y0: ry + vIn, y1: ry + rh - vIn };
      const edgeName = o.box ? ['text-area edge', 'text-area edge'] : under ? ['window edge', 'window edge'] : ['frame left', 'frame right'];
      let edges = [[rx, edgeName[0]], [rx + rw, edgeName[1]]];
      // Name card / quote: subject against one side, overlapping the text-area edge by overlap (default 14% of subject width); no gap on that side (the overlap is the layout)
      if ((kind === 'name' || kind === 'quote') && subj && !o.box && o.subject && o.subject.side) {      // side:null = subject in the middle (logo card covers the middle, shows the ends); text area not reduced
        const sb = subj.box();
        if (sb && sb[2]) {
          const s = o.subject || {}, ov = s.overlap ?? .14;
          if ((s.side || 'right') === 'right') { a.x1 = Math.min(a.x1, sb[0] + sb[2] * ov - 24); edges = [edges[0], [a.x1, null]]; }
          else { a.x0 = Math.max(a.x0, sb[0] + sb[2] * (1 - ov) + 24); edges = [[a.x0, null], edges[1]]; }
        }
      }
      return { a, edges, edgeName };
    }

    let LAY = null, warned = false;
    // Time span of each block (hard swap on the frame the next block appears; the last block runs to outT)
    const blockSpan = mode === 'block' ? o._blocks.map((_, bi) => { const ts = units.filter(u => u.block === bi).map(u => u.t); return ts.length ? Math.min(...ts) : Infinity; }) : [];
    const blockEnd = bi => { const s = blockSpan[bi]; const nx = blockSpan.filter(v => v > s + 1e-6); return nx.length ? Math.min(...nx) : outT; };
    const latin = o.latin || 'Fraunces';
    let sqWarned = false;
    function layBlocks() {
      const { a: area } = areaOf();
      // With subject.side: the block goes on the other side with space between it and the subject's drawn edge (text column + subject)
      if (subj && o.subject && o.subject.side && !o.box) { const ex = subj.ext(area.y0, area.y1);
        if (ex) { if (o.subject.side === 'right') area.x1 = Math.min(area.x1, ex[0] - G); else area.x0 = Math.max(area.x0, ex[1] + G); } }
      if (o.maxSize) { const c = (area.y0 + area.y1) / 2; area.y0 = Math.max(area.y0, c - o.maxSize / 2); area.y1 = Math.min(area.y1, c + o.maxSize / 2); }
      const blocks = o._blocks.map((B, bi) => {
        const ls = disp.map((d, i) => ({ d, i })).filter(z => z.d.block === bi).map(({ d, i }) => {
          const text = units.filter(u => u.line === i).map(u => u.ch).join(''), cjk = CJK.test(text), sr = d.src;
          const fam = sr.font || (cjk ? FAM : latin), wt = sr.weight ?? (fam === FAM ? 900 : LATIN_WT[fam] ?? 400);
          let sq = sr.squeeze ?? (cjk ? (o.cjkSqueeze ?? BLOCK.sqCJK) : (o.latinSqueeze ?? BLOCK.sqLatin));
          if (cjk && sq > BLOCK.sqCJKMax) { if (!sqWarned) { sqWarned = true; console.warn(`XM.bigType: block CJK line "${text}" ratio ${sq} exceeds the cap ${BLOCK.sqCJKMax}; drawing at ${BLOCK.sqCJKMax}`); } sq = BLOCK.sqCJKMax; }
          return { text, fam, wt, sq, track: sr.track ?? (cjk ? track : (o.track ?? BLOCK.trackLatin)),
            t: Math.min(...units.filter(u => u.line === i).map(u => u.t)), from: sr.from, dist: sr.dist, color: sr.color, line: i };
        });
        const b = layoutBlock({ ...B, lines: ls }, { ...area }, { valign: o.valign });
        b.t0 = blockSpan[bi]; b.t1 = blockEnd(bi); b.bi = bi;
        if (B.mid && B.mid.text && CJK.test(B.mid.text) && !B.mid.font) { /* CJK notes use HeiSC */ }
        b.orn = B.ornaments ? ornSpots(B.ornaments, b) : null; b.ornO = B.ornaments || null;
        return b;
      });
      const rows = blocks.flatMap(b => b.lines.map(l => ({ x0: l.x0, x1: l.x1, top: l.top, base: l.base, h: l.h, em: l.em })));
      const b0 = blocks[0] || { lines: [] }, gaps = [];
      for (const b of blocks) { const [el, er] = [region[0], region[0] + region[2]];
        gaps.push({ at: `block ${b.bi + 1} left↔edge`, px: Math.round(b.x0 - el) }, { at: `block ${b.bi + 1} right↔edge`, px: Math.round(er - b.x1) }); }
      const R = { blocks, chars: [], rows, em: b0.lines[0] ? b0.lines[0].em : 0, sq: b0.lines[0] ? b0.lines[0].sq : 0, gaps };
      R.fit = { blocks: blocks.map(b => ({ w: Math.round(b.w), x0: Math.round(b.x0), top: Math.round(b.top), bottom: Math.round(b.bottom),
        lines: b.lines.map(l => ({ text: l.text, font: l.fam, h: Math.round(l.h), squeeze: +l.sq.toFixed(3), ratio: +(l.h / Math.min(...b.lines.map(z => z.h))).toFixed(2) })) })),
        space: Math.round(G), gaps, minGap: Math.min(...gaps.map(g => g.px)) };
      return R;
    }
    function layLogo() {
      const { a: area } = areaOf(), nm = o.name, R0 = logoR;
      if (!R0 || !R0.ok) return { chars: [], rows: [], gaps: [], fit: {} };
      const box = logoBox(R0, area, nm);
      const R = { chars: [], rows: [{ x0: box[0], x1: box[0] + box[2], top: box[1], base: box[1] + box[3], h: box[3], em: 0 }], logo: box, gaps: [] };
      // Cover the middle, show the ends: how much of the logo's first 15%, middle 70% and last 15% the subject covers (from its per-row opaque spans)
      let cov = null;
      if (subj && !o.subject.draw && subj.ready()) { const [x, y, w, h] = box, seg = [[x, x + w * .15], [x + w * .15, x + w * .85], [x + w * .85, x + w]], acc = [0, 0, 0]; let rowsN = 0;
        for (let yy = y; yy < y + h; yy += 3) { rowsN++; const e = subj.rowExt(yy); if (!e) continue; seg.forEach(([a, b], k) => { acc[k] += Math.max(0, Math.min(b, e[1]) - Math.max(a, e[0])) / (b - a); }); }
        cov = { head: +(acc[0] / rowsN).toFixed(2), mid: +(acc[1] / rowsN).toFixed(2), tail: +(acc[2] / rowsN).toFixed(2) };
        if (!warned && (cov.head > .35 || cov.tail > .35)) { warned = true; console.warn(`XM.bigName: the subject covers the ${cov.head > .35 ? 'start' : 'end'} of the logo (${Math.round(Math.max(cov.head, cov.tail) * 100)}%); cover the middle and leave both ends visible: move the subject`); } }
      R.fit = { logo: box.map(v => Math.round(v)), covered: cov, space: Math.round(G) };
      return R;
    }
    function lay() {
      if (LAY) return LAY;
      if (mode === 'block' || mode === 'logo') { const R = mode === 'block' ? layBlocks() : layLogo(); if (fontsReady() && (!subj || subj.ready()) && (mode !== 'logo' || (logoR && logoR.ok))) LAY = R; return R; }
      const { a: area, edges, edgeName } = areaOf(), gs0 = [];
      const maxSize = o.maxSize ?? (kind === 'quote' ? 300 : (area.y1 - area.y0));
      const emFix = o.size ? o.size / met().ink : null;
      const base = { area, edges, G, track, sqFix, emFix, sqRange, tuck: o.tuck, rowGap: o.rowGap ?? (kind === 'quote' ? 1.1 : 1.04), maxSize, valign: o.valign || 'center', maxLines: o.maxLines ?? 3 };
      let R;
      if (mode === 'quote') R = layoutQuote(units, base);
      else if (mode === 'flow') {
        const sb = subj ? subj.box() : null;
        const column = o.subject && o.subject.column ? o.subject.column : sb ? [sb[0] - 24, sb[0] + sb[2] + 24] : [W / 2, W / 2];
        const toks = []; let cur = null;
        for (const u of units) { if (!cur || cur.k !== u.part) { cur = { k: u.part, a: [] }; toks.push(cur); } cur.a.push(u); }
        R = layoutFlow(toks.map(t => t.a), { ...base, column });
      } else {
        // units back to rows
        const lines = []; for (const u of units) { (lines[u.line] = lines[u.line] || { text: '', u: [] }); lines[u.line].text += u.ch; lines[u.line].u.push(u); }
        const behind = mode === 'behind' && subj;
        const L2 = lines.map((l, i) => { const d = disp[i] || { src: {}, single: true }, sr = d.src;
          return { text: l.text, align: sr.align || (kind === 'name' ? 'left' : behind ? 'center' : undefined), size: sr.size, squeeze: sr.squeeze, split: d.single ? sr.split : undefined }; });
        const around = mode === 'around' && subj && L2.every(l => [...l.text].length >= 2);
        const sb0 = subj ? subj.box() : null, fallback = sb0 && sb0[2] ? [sb0[0], sb0[0] + sb0[2]] : [region[0] + region[2] / 2, region[0] + region[2] / 2];
        if (around && enO) errs('en (original English name) only works with rows / name cards; around leaves no room for the English line');
        if (around) R = layoutSplit(L2, { ...base, edgeX: [region[0], region[0] + region[2]], edgeName, fallback, ext: (y0, y1) => subj.ext(y0, y1),
          rowExt: o.subject.draw && !o.subject.column ? null : y => subj.rowExt(y), zoneY: subj.zoneY() });
        else if (behind) {        // text centred on the subject's body centre line: shrink the area to a span around that axis with ≥ space to both frame edges, then lay out as rows
          const ax = subj.axis(area.y0, area.y1) ?? (area.x0 + area.x1) / 2, half = Math.max(1, Math.min(ax - area.x0, area.x1 - ax));
          R = layoutRows(L2, { ...base, area: { ...area, x0: ax - half, x1: ax + half }, enH });
          R.axis = ax;
        }
        else R = layoutRows(L2, { ...base, enH });
        // map chars back to the units' appear times, by row and char order
        const byLine = R.chars.slice().sort((p, q) => p.line - q.line || p.idx - q.idx);
        let k = 0; for (const l of lines) for (const u of l.u) Object.assign(byLine[k++], { t: u.t, part: u.part, color: u.color });
        if (enO && R.rows.length) {        // English line: size = 0.13 × big type height (≥ 56); big type + English are already centred together via enH in layoutRows
          const last = R.rows[R.rows.length - 1];
          let es = enH.size(last.h);
          const al = (o.en && o.en.align) || 'left', ewOf = sz => { const g = met().g; g.font = `700 ${sz}px ${FAM}`; return g.measureText(enO.text).width * enO.squeeze; };
          // Horizontal room for the English line: not under the subject and not into the text-area gaps (≥ space, like the big type)
          const { a: ar } = areaOf(), sb = subj && o.subject && o.subject.side ? subj.box() : null;
          let lo = ar.x0, hi = ar.x1;
          if (sb && o.subject.side === 'left') lo = Math.max(lo, sb[0] + sb[2] + 24);
          if (sb && o.subject.side === 'right') hi = Math.min(hi, sb[0] - 24);
          let ew = ewOf(es);
          if (ew > hi - lo && !enO.size) { es = Math.max(56, es * (hi - lo) / ew); ew = ewOf(es); }
          if (ew > hi - lo + 1) console.warn(`XM.${name}: the English name is too long to fit the text area even at 56 px (${Math.round(ew)} > ${Math.round(hi - lo)} px) and will run into the gap: shorten en or make the subject smaller`);
          const ex = al === 'right' ? last.x1 - ew : al === 'center' ? (last.x0 + last.x1 - ew) / 2 : last.x0;
          const x = Math.max(lo, Math.min(ex, hi - ew));
          R.en = { x, base: last.top + last.h + es * enO.gap + es * .74, size: es };
          if (edges[0][1]) gs0.push({ at: edges[0][1] + '↔en line', px: Math.round(x - edges[0][0]) });
          if (edges[1][1]) gs0.push({ at: 'en line↔' + edges[1][1], px: Math.round(edges[1][0] - (x + ew)) });
        }
      }
      if (R.fail) errs('one side cannot fit even its two gaps: the subject is too wide or the text area too narrow (use a narrower subject, a smaller subject.h, fewer characters, or rows)');
      const gs = (R.gaps || []).concat(gs0);
      R.fit = { squeeze: +R.sq.toFixed(3), auto: sqFix == null, wanted: R.want != null && isFinite(R.want) ? +R.want.toFixed(3) : null,
        inkH: Math.round(R.em * met().ink), space: Math.round(G), gaps: gs, minGap: gs.filter(g => !g.tucked).length ? Math.min(...gs.filter(g => !g.tucked).map(g => g.px)) : null,
        ...(R.axis != null ? { axis: Math.round(R.axis) } : {}), ...(R.tuck != null ? { tuck: R.tuck } : {}) };
      if (!warned && R.fit.minGap != null && R.fit.minGap < SPACE_WARN * W - .5) {
        warned = true;
        console.warn(`XM.${name}: the smallest gap is only ${R.fit.minGap} px (aim for at least ${Math.round(SPACE_WARN * W)} px), the text is cramped. Remove a hard-coded squeeze / size, or use fewer characters`);
      }
      if (fontsReady() && (!subj || subj.ready())) LAY = R;
      return R;
    }

    // ---------- Sound ----------
    const cues = [];
    const firsts = []; { const seen = new Set();          // first appear time of each segment (line / sentence), one entry per instant
      for (const u of units) if (!seen.has(u.part)) { seen.add(u.part); if (!firsts.some(t => Math.abs(t - u.t) < 1e-6)) firsts.push(u.t); } }
    const staggered = kind !== 'quote' && firsts.length > 1;   // lines cutting in one after another
    const enterName = EN.kind === 'sweep' || EN.kind === 'rise' ? 'sparkle' : EN.kind === 'slide' ? 'pa' : null;   // sweep / rise / slide are not a "slam", so use a lighter sound
    const sfx = o.sfx === false ? null : { name: (o.sfx && o.sfx.name) || enterName || (staggered ? 'pa' : 'kacha'), gain: o.sfx && o.sfx.gain,
      each: (o.sfx && o.sfx.each) || (kind === 'quote' ? 'first' : o.words ? 'word' : 'line') };
    if (sfx && mode === 'block') {
      // Equal-width block: kacha the first time each block appears (also on each hard swap), pa for later / sliding lines in the same block; one sound per instant
      const seen = [];
      for (const u of units) { if (seen.some(s => Math.abs(s - u.t) < 1e-6)) continue; seen.push(u.t);
        const first = Math.abs(blockSpan[u.block] - u.t) < 1e-6, sl = disp[u.line] && disp[u.line].src.from;
        if (sfx.each === 'first' && cues.length) break;
        cues.push({ t: +u.t.toFixed(3), name: (o.sfx && o.sfx.name) || (first && !sl ? 'kacha' : 'pa'), ...(sfx.gain != null ? { gain: sfx.gain } : {}) }); }
    } else if (sfx) {
      const ts = sfx.each === 'first' ? firsts.slice(0, 1) : firsts;
      for (const t of ts) cues.push({ t: +t.toFixed(3), name: sfx.name, ...(sfx.gain != null ? { gain: sfx.gain } : {}) });   // no gain = the library's normalised default volume
    }

    // ---------- Subtitle hand-off ----------
    const subs = [];
    { const parts = new Map();
      for (const u of units) { const p = parts.get(u.part) || { from: u.t, text: '', block: u.block }; p.text += u.ch; p.from = Math.min(p.from, u.t); parts.set(u.part, p); }
      const mode2 = o.subtitle || (mode === 'logo' ? 'keep' : 'drop'), T0 = window.HUD_T0 || 0;
      for (const [, p] of parts) { const to = mode === 'block' ? blockEnd(p.block) : outT;     // equal-width block: hand the subtitle back on the frame the block is replaced
        subs.push({ from: +p.from.toFixed(3), to: to != null ? +to.toFixed(3) : null, text: p.text.replace(/[，！？!?\s]/g, ''), mode: mode2,
        ...(T0 ? { film_from: +(p.from + T0).toFixed(3), film_to: to != null ? +(to + T0).toFixed(3) : null } : {}) }); } }

    // ---------- Draw ----------
    const glow = o.glow ? { color: (o.glow.color && XK.col(o.glow.color)) || fg, blur: o.glow.blur, alpha: o.glow.alpha ?? .85 } : null;
    const ghost = mix(solid(P.bg), solid(fg), .2);          // light grey of a quote sentence just appearing
    const fade = o.fade ?? .4;
    const clipsR = under && under.clips ? under.clips.map(c => ({ ...c, F: XM.frames(c.dir) })) : [];
    const imgR = under && under.img ? XM.image(under.img) : null;
    const tex = under && under.texture === 'screen' ? (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 4; const x = c.getContext('2d');
      x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(0, 0, 1, 4); x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(2, 0, 1, 4); return c; })() : null;

    function cover(g, img, iw, ih, bx, by, bw, bh) {
      const s = Math.max(bw / iw, bh / ih), w = iw * s, h = ih * s;
      g.drawImage(img, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
    }
    function drawUnder(g, t) {
      const [x, y, w, h] = under.box;
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.fillStyle = DS.INK; g.fillRect(x, y, w, h);
      let cur = null; for (const c of clipsR) if (t >= c.at) cur = c;
      if (cur) { const img = cur.F.at((t - cur.at) * (cur.rate ?? 1) + (cur.from ?? 0)); if (img) cover(g, img, img.naturalWidth, img.naturalHeight, x, y, w, h); }
      else if (imgR && imgR.ok) cover(g, imgR.img, imgR.img.naturalWidth, imgR.img.naturalHeight, x, y, w, h);
      g.fillStyle = `rgba(0,0,0,${under.dim ?? .22})`; g.fillRect(x, y, w, h);
      g.restore();
    }
    // Order of each char within its segment (one line / one lines entry): sweep / slide stagger by it (lines split at commas keep counting, not restarting at 0)
    function ordOf(R) {
      if (R._ord) return R._ord;
      const m = new Map(), cnt = new Map();
      R.chars.slice().sort((p, q) => (p.part ?? 0) - (q.part ?? 0) || p.line - q.line || p.idx - q.idx)
        .forEach(c => { const k = c.part ?? c.line, n = cnt.get(k) || 0; m.set(c, n); cnt.set(k, n + 1); });
      return (R._ord = m);
    }
    // Entry: returns { a opacity, b blur px, dx, dy, smear px }, or null if not shown yet
    const SWEEP_RISE = .06, RISE_DUR = .57;     // sweep drift: whole line drifts up 6% of its height -> 0, (1-k)^2.4, about 17 frames
    function entryOf(c, ord, t) {
      if (t < c.t) return null;
      if (EN.kind === 'cut') return { a: 1, b: 0, dx: 0, dy: 0, smear: 0 };
      if (EN.kind === 'rise') {        // rise: opacity 1−(1−k)^3.63 (31 frames), drift 107.5·(1−k)^2.68 px (26 frames); small text drifts relatively more than big text
        const k = cl((t - c.t) / (EN.dur ?? 1)), kr = cl((t - c.t) / ((EN.dur ?? 1) * .85));
        return { a: 1 - Math.pow(1 - k, 3.5), b: 0, dx: 0, dy: (EN.rise ?? .3) * c.em * met().ink * Math.pow(1 - kr, 2.7), smear: 0 };
      }
      if (EN.kind === 'sweep') {
        const r = XM.tex.reveal(t, c.t, ord, EN); if (r.a <= .002) return null;
        const rise = (EN.rise ?? SWEEP_RISE) * c.em * met().ink, k = cl((t - c.t) / (EN.riseDur ?? RISE_DUR)), dy = rise * Math.pow(1 - k, 2.4);
        return { a: r.a, b: r.blur, dx: 0, dy, smear: 0 };
      }
      const S = XM.tex.SLIDE, D = { per: EN.per ?? S.per, dur: EN.dur ?? S.dur, blur: EN.blur ?? S.blur, ease: EN.ease || 'easeOut' };
      const r = XM.tex.reveal(t, c.t, ord, D); if (r.a <= .002) return null;
      const E = XM.tex.ease(D.ease), dist = (EN.dist ?? S.dist) * c.em * met().ink * ((EN.from || 'left') === 'left' ? -1 : 1);
      const kp = cl(r.k - .5 / fps() / D.dur);
      return { a: r.a, b: r.blur, dx: dist * (1 - E(r.k)), dy: 0, smear: Math.abs(dist * (E(r.k) - E(kp))) };
    }
    // Wear: sparse small specks rubbed off the text (text only, background untouched)
    let WEAR = null;
    function wearTile() {
      if (WEAR) return WEAR;
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), d = x.createImageData(256, 256), r = XM.rng(41);
      for (let i = 0; i < 256 * 256; i++) { const v = r(), py = (i / 256) | 0, px = i % 256;
        const blot = .5 + .5 * Math.sin(px * .07 + Math.sin(py * .05) * 2.2) * Math.cos(py * .061 + Math.sin(px * .043) * 1.7);
        d.data[i * 4 + 3] = v < .085 * blot ? 255 : v < .17 * blot ? 120 : 0; }
      x.putImageData(d, 0, 0); return (WEAR = c);
    }
    // ---------- Equal-width block / logo name card ----------
    const colOf = c => !c ? fg : c === 'accent' ? P.accent : c === 'mute' ? P.mute : c === 'mark' ? P.mark : c === 'fg' ? fg : XK.col(c);
    function blockLine(q, l, dx = 0, dy = 0) {        // one line, scaled by its own horizontal ratio to the block width
      q.save(); q.font = `${l.wt} ${l.em.toFixed(2)}px ${l.fam}`; q.letterSpacing = (l.track * l.em).toFixed(2) + 'px'; q.textBaseline = 'alphabetic'; q.textAlign = 'left';
      q.translate(l.ox + dx, l.base + dy); if (o.skew) q.transform(1, 0, -o.skew, 1, 0, 0); q.scale(l.sq, 1); q.fillText(l.text, 0, 0); q.restore();
    }
    function drawBlock(g, t) {
      const R = lay(); if (outT != null && t >= outT) return;
      g.save();
      if (under) { const [x, y, w, h] = under.box; g.beginPath(); g.rect(x, y, w, h); g.clip(); }
      for (const b of R.blocks || []) {
        if (t < b.t0 || (b.t1 != null && t >= b.t1)) continue;
        for (const l of b.lines) {
          if (t < l.t) continue;
          const col = colOf(l.color || o.color);
          let dx = 0, dy = 0, a = 1, smear = 0;
          if (l.from) {          // per-line slide direction: expoOut, no overshoot, fade in over the first 35%, smear along the distance travelled this frame
            const D = o.slide ?? BLOCK.slide, k = cl((t - l.t) / D), kp = cl((t - l.t - 1 / fps()) / D), E = v => v >= 1 ? 1 : 1 - Math.pow(2, -10 * v);
            const hz = l.from === 'left' || l.from === 'right', s = l.from === 'left' || l.from === 'top' ? -1 : 1;
            const dist = l.dist ?? (hz ? W * .62 : H * .55);
            const off = s * dist * (1 - E(k)); if (hz) dx = off; else dy = off;
            a = cl(k / .35); smear = Math.abs(dist * (E(k) - E(kp)));
            if (k < 1 && smear > 1.5) { const N = Math.max(2, Math.min(10, Math.ceil(smear / 6)));
              g.fillStyle = col; for (let s2 = 0; s2 < N; s2++) { const f2 = (s2 / (N - 1) - .5) * smear * -Math.sign(off || 1);
                g.globalAlpha = a * Math.min(1, 1.8 / N) * (o.alpha ?? 1); blockLine(g, l, hz ? dx + f2 : dx, hz ? dy : dy + f2); }
              g.globalAlpha = 1; continue; }
          }
          g.globalAlpha = a * (o.alpha ?? 1); g.fillStyle = col; blockLine(g, l, dx, dy); g.globalAlpha = 1;
          XM.note(l.fam, l.text);
        }
        if (b.mid && t >= (b.mid.at != null ? showAt(b.mid.at) : b.t0)) {      // gap note: real metadata (source · date · original name), not an explanation
          const fam = b.mid.font || (CJK.test(b.mid.text) ? 'HeiSC' : 'Mono');
          g.save(); g.font = `${b.mid.weight ?? 500} ${b.mid.size}px ${fam}`; g.letterSpacing = (b.mid.track ?? .06) * b.mid.size + 'px'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = colOf(b.mid.color); g.fillText(b.mid.text, b.mid.x, b.mid.y); g.restore(); XM.note(fam, b.mid.text);
        }
        if (b.orn && t >= (b.ornO.at != null ? showAt(b.ornO.at) : b.t0)) {     // symmetric ornaments: decoration of the block, not pointing at any word; default accent colour
          const c = colOf(b.ornO.color || 'accent');
          for (const [x, y] of b.orn.at) drawOrnament(g, b.orn.kind, x, y, b.orn.h, c);
        }
      }
      g.restore();
    }
    let LOGO_T = null;
    function logoImg(w, h) {    // rasterise once at drawn size (drawImage of an SVG rasterises at its own size and then scales, blurry); tint: white / accent single-colour version (omit to keep logo colours)
      w = Math.max(1, Math.round(w || logoR.img.naturalWidth)); h = Math.max(1, Math.round(h || logoR.img.naturalHeight));
      if (LOGO_T && LOGO_T.width === w && LOGO_T.height === h) return LOGO_T;
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      x.drawImage(logoR.img, 0, 0, w, h);
      if (o.name.tint) { x.globalCompositeOperation = 'source-in'; x.fillStyle = colOf(o.name.tint); x.fillRect(0, 0, w, h); }
      return (LOGO_T = c);
    }
    function drawLogo(g, t) {
      const R = lay(); if (!R.logo || (outT != null && t >= outT) || t < units[0].t) return;
      const [x, y, w, h] = R.logo;
      g.save(); g.globalAlpha = o.alpha ?? 1; g.drawImage(logoImg(w, h), x, y, w, h); g.restore();
      const md = o.mid;
      if (md && md.text && t >= (md.at != null ? showAt(md.at) : units[0].t)) {
        const sz = md.size ?? BLOCK.midSize, fam = md.font || (CJK.test(md.text) ? 'HeiSC' : 'Mono');
        g.save(); g.font = `${md.weight ?? 500} ${sz}px ${fam}`; g.letterSpacing = (md.track ?? .06) * sz + 'px'; g.textBaseline = 'top';
        const al = md.align || (o.name.align === 'left' ? 'left' : 'center'); g.textAlign = al;
        g.fillStyle = colOf(md.color); g.fillText(md.text, al === 'left' ? x : al === 'right' ? x + w : x + w / 2, y + h + (md.gap ?? sz * 1.6)); g.restore(); XM.note(fam, md.text);
      }
    }
    // Footage "in front of text" layer (under.front): moving people / objects in the footage are lifted back over the text with a matte sequence.
    // clips:[{ dir (this layer's frames, default the under footage at the same time), matte (greyscale matte sequence, white = in front), at, from, rate }]
    const frontR = under && under.front ? (under.front.clips || []).map(c => ({ ...c, F: c.dir ? XM.frames(c.dir) : null, M: XM.frames(c.matte) })) : [];
    let FC = null;
    function drawFront(g, t) {
      if (!frontR.length || (outT != null && t >= outT)) return;
      let cur = null; for (const c of frontR) if (t >= c.at) cur = c; if (!cur) return;
      const st = (t - cur.at) * (cur.rate ?? 1) + (cur.from ?? 0);
      let img = cur.F ? cur.F.at(st) : null;
      if (!cur.F) { let uc = null; for (const c of clipsR) if (t >= c.at) uc = c; if (uc) img = uc.F.at((t - uc.at) * (uc.rate ?? 1) + (uc.from ?? 0)); }
      const mk = cur.M.at(st); if (!img || !mk) return;
      const [x, y, w, h] = under.box.map(Math.round);
      if (!FC) { const mkC = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return { c, g: c.getContext('2d', { willReadFrequently: true }) }; }; FC = { a: mkC(), m: mkC() }; }
      const A = FC.a, Mk = FC.m;
      A.g.clearRect(0, 0, W, H); Mk.g.clearRect(0, 0, W, H);
      cover(A.g, img, img.naturalWidth, img.naturalHeight, x, y, w, h);
      if ((under.dim ?? .22) > 0) { A.g.fillStyle = `rgba(0,0,0,${under.dim ?? .22})`; A.g.fillRect(x, y, w, h); }
      cover(Mk.g, mk, mk.naturalWidth, mk.naturalHeight, x, y, w, h);
      const d = A.g.getImageData(x, y, w, h), m = Mk.g.getImageData(x, y, w, h).data;
      for (let i = 0; i < m.length; i += 4) d.data[i + 3] = m[i];
      A.g.putImageData(d, x, y);
      g.drawImage(A.c, 0, 0);
    }
    function drawText(g, t) {
      if (mode === 'block') return drawBlock(g, t);
      if (mode === 'logo') return drawLogo(g, t);
      const R = lay(); if (!R.chars.length) return;
      if (outT != null && t >= outT) return;
      const sq = R.sq, ord = ordOf(R), M = met();
      const wear = cl(o.wear || 0), dst = wear > 0 ? XM.canvas('xm-bigtype-wear', W, H) : null, q = dst ? dst.g : g;
      if (dst) q.setTransform(g.getTransform());
      q.save();
      if (under) { const [x, y, w, h] = under.box; q.beginPath(); q.rect(x, y, w, h); q.clip(); }
      q.textBaseline = 'alphabetic'; q.textAlign = 'left';
      let lastEm = -1;
      const pass = shadow => {
        for (const c of R.chars) {
          const e = entryOf(c, ord.get(c) ?? 0, t); if (!e) continue;
          let col = c.color ? XK.col(c.color === 'accent' ? P.accent : c.color) : fg;
          if (kind === 'quote' && fade > 0) { const k = cl((t - c.t) / fade); col = mix(ghost, solid(fg), 1 - Math.pow(1 - k, 2)); }
          if (c.em !== lastEm) { q.font = `900 ${c.em.toFixed(2)}px ${FAM}`; lastEm = c.em; }
          q.save(); q.translate(c.x + e.dx, c.base + e.dy); if (o.skew) q.transform(1, 0, -o.skew, 1, 0, 0); q.scale(c.sq ?? sq, 1);
          q.fillStyle = FILL ? XM.tex.grad(q, solid(col), -M.asc * c.em, (M.ink - M.asc) * c.em, FILL.grad) : col;
          q.filter = e.b > .25 ? `blur(${e.b.toFixed(2)}px)` : 'none';
          if (shadow) { q.shadowColor = glow.color; q.shadowBlur = glow.blur ?? c.em * M.ink * .06; q.globalAlpha = glow.alpha; }
          const N = e.smear > 1.5 ? Math.min(8, Math.ceil(e.smear / 2)) : 1, a0 = q.globalAlpha * (o.alpha ?? 1);
          for (let s = 0; s < N; s++) {        // horizontal smear: several copies along the distance travelled within the shutter
            q.globalAlpha = a0 * e.a * (N > 1 ? Math.min(1, 1.6 / N) : 1);
            q.fillText(c.ch, N > 1 ? (e.smear * (s / (N - 1) - .5)) / sq : 0, 0);
          }
          q.restore();
        }
      };
      if (glow) { q.save(); pass(true); q.restore(); lastEm = -1; }
      pass(false);
      q.restore();
      if (dst) {         // wear: rub off sparse specks, then paste back
        q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'destination-out'; q.globalAlpha = .55 + .45 * wear;
        q.scale(1.6, 1.6); q.fillStyle = q.createPattern(wearTile(), 'repeat'); q.fillRect(0, 0, W, H); q.restore();
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(dst.c, 0, 0); g.restore();
      }
      g.save();
      if (under) { const [x, y, w, h] = under.box; g.beginPath(); g.rect(x, y, w, h); g.clip(); }
      XM.note(FAM, units.map(u => u.ch).join(''));
      if (enO && R.en) {
        const at = enO.at != null ? showAt(enO.at) : Math.min(...units.map(u => u.t));
        if (t >= at) { g.save(); g.font = `700 ${R.en.size.toFixed(1)}px ${FAM}`; g.fillStyle = enO.color ? XK.col(enO.color) : fg;
          g.translate(R.en.x, R.en.base); g.scale(enO.squeeze, 1); g.fillText(enO.text, 0, 0); g.restore(); XM.note(FAM, enO.text); }
      }
      g.restore();
      if (tex) { const [x, y, w, h] = under.box; g.save(); g.fillStyle = g.createPattern(tex, 'repeat'); g.fillRect(x, y, w, h); g.restore(); }
    }
    // ---------- Huge italic English word behind the big type ----------
    // Playfair Display Italic, letters fade in one by one over ~1 s, the whole word slowly scales (zoom).
    // Colour defaults to the accent mixed halfway toward the background (one accent per video, no extra hues), no glow; may bleed off frame.
    const BH = o.behind && o.behind.text && !CJK.test(o.behind.text) ? o.behind : null;
    function blockBox() {            // ink bounds of the whole big type (the behind word centres on it by default)
      const R = lay(); if (!R.rows || !R.rows.length) return [W / 2, H / 2, 0, 0];
      const x0 = Math.min(...R.rows.map(r => r.x0)), x1 = Math.max(...R.rows.map(r => r.x1)), y0 = Math.min(...R.rows.map(r => r.top)), y1 = Math.max(...R.rows.map(r => r.top + r.h));
      return [x0, y0, x1 - x0, y1 - y0];
    }
    function drawBehind(g, t) {
      if (!BH) return; const at0 = BH.at != null ? showAt(BH.at) : (units.length ? Math.min(...units.map(u => u.t)) : 0);
      if (t < at0 || (outT != null && t >= outT)) return;
      const size = BH.size ?? H * .81, wt = BH.w ?? 800, sqz = BH.squeeze ?? 1, [bx, by, bw, bh] = blockBox();
      const cx = BH.x ?? bx + bw / 2, cy = BH.y ?? by + bh / 2;
      const col = BH.color ? XK.col(BH.color === 'accent' ? P.accent : BH.color) : mix(solid(P.accent), solid(P.bg), .5);
      g.save(); g.font = `${wt} ${size.toFixed(1)}px PlayIt`; g.textBaseline = 'alphabetic';
      const m = g.measureText(BH.text), tw = m.width * sqz, base = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
      const Z = BH.zoom ? lerp(BH.zoom[0], BH.zoom[1], XM.tex.ease('easeOut')(cl((t - at0) / Math.max(.1, (outT ?? at0 + 3) - at0)))) : 1;
      g.translate(cx, cy); g.scale(Z, Z); g.translate(-cx, -cy);
      const letters = [...BH.text]; let x = cx - tw / 2;
      for (let i = 0; i < letters.length; i++) {
        const lw = g.measureText(letters.slice(0, i + 1).join('')).width * sqz - (x - (cx - tw / 2));
        const r = (BH.enter || 'sweep') === 'cut' ? { a: 1, blur: 0 } : XM.tex.reveal(t, at0, i, { per: BH.per ?? .06, dur: BH.dur ?? 1, blur: BH.blur ?? 3, ease: 'easeOut' });
        const bl = r.blur + (BH.blur || 0);
        if (r.a > .002) { g.save(); g.globalAlpha *= r.a * (BH.alpha ?? 1); g.filter = bl > .25 ? `blur(${bl.toFixed(2)}px)` : 'none'; g.fillStyle = col;
          g.translate(x, base); g.scale(sqz, 1); g.fillText(letters[i], 0, 0); g.restore(); }
        x += lw;
      }
      XM.note('PlayIt', BH.text); g.restore();
    }
    // Ink mask of the fully revealed big type (full resolution, computed once): used to recolour the part of a note that sits on strokes
    let INK = null;
    function inkMask() {
      if (INK && LAY) return INK;
      const R0 = lay(), K = document.createElement('canvas'); K.width = W; K.height = H; const g = K.getContext('2d'); g.fillStyle = '#000'; g.textBaseline = 'alphabetic';
      for (const ch of R0.chars) { g.save(); g.font = `900 ${ch.em.toFixed(2)}px ${FAM}`; g.translate(ch.x, ch.base); if (o.skew) g.transform(1, 0, -o.skew, 1, 0, 0); g.scale(ch.sq ?? R0.sq, 1); g.fillText(ch.ch, 0, 0); g.restore(); }
      return (INK = K);
    }
    // ---------- Small English notes next to chars ----------
    function drawNotes(g, t) {
      if (!o.notes || !o.notes.length || (outT != null && t >= outT)) return;
      const R = lay(), M = met(), ord = R.chars;
      for (const n of o.notes) {
        if (!n || !n.text) continue;
        const c = typeof n.at === 'number' ? ord[n.at] : ord.find(z => z.ch === n.at);
        if (!c) { console.error(`XM.${name}: notes at "${n.at}" matches no character`); continue; }
        const e = entryOf(c, ordOf(R).get(c) ?? 0, t), tn = n.t != null ? n.t : c.t; if (!e || t < tn) continue;
        const sz = n.size ?? Math.max(44, c.em * M.ink * .09), top = c.base - M.asc * c.em, h = c.em * M.ink, w = c.em * R.sq;
        const pos = n.pos || 'on';
        let x = c.x + (pos === 'on' ? w * .04 : 0), y = pos === 'on' ? top + h * .82 : pos === 'below' ? top + h + sz * .95 : pos === 'above' ? top - sz * .35 : top + h * .35, al = 'left';
        if (pos === 'left') { x = c.x - sz * .3; al = 'right'; } if (pos === 'right') x = c.x + w + sz * .3;
        g.save(); g.font = `${n.w ?? 600} ${sz.toFixed(1)}px PlayIt`; g.textAlign = al; g.textBaseline = 'alphabetic';
        // Default colour follows what's underneath: background colour where it sits on big-type strokes, text colour where it sits on the
        // background (a note always sticks out of the stroke somewhere; this keeps every part legible). color = one colour throughout
        const nx = x + (n.dx || 0) + e.dx, ny = y + (n.dy || 0) + e.dy, A = Math.min(1, e.a * 1.4);
        if (n.color) { g.globalAlpha *= A; g.fillStyle = XK.col(n.color === 'accent' ? P.accent : n.color === 'fg' ? fg : n.color); g.fillText(n.text, nx, ny); g.restore(); XM.note('PlayIt', n.text); continue; }
        const K = XM.canvas('xm-bigtype-note', W, H), kq = K.g;
        kq.font = g.font; kq.textAlign = al; kq.textBaseline = 'alphabetic'; kq.fillStyle = solid(P.bg); kq.fillText(n.text, nx, ny);
        kq.globalCompositeOperation = 'destination-in'; kq.drawImage(inkMask(), 0, 0);
        g.globalAlpha *= A; g.fillStyle = fg; g.fillText(n.text, nx, ny); g.drawImage(K.c, 0, 0); g.restore(); XM.note('PlayIt', n.text);
      }
    }
    const bgLum = (() => { const [r, g2, b] = rgbOf(solid(P.bg)); return (r * .299 + g2 * .587 + b * .114) / 255; })();
    // Avoid text: draw the shot's final big type (fully revealed, incl. the English line) to a 1/4-size canvas and compute distance to its ink;
    // returns (x, y) -> 0 (≤ AVOID[0] × space from ink) ... 1 (≥ AVOID[1] × space), smooth in between
    let avoidSet = false, shAvoid = null;
    // Shadow avoids text: right against the ink only 22% of the shadow remains, back to full strength one space (≈ 144 px) away
    function textNear() { const f = textAvoid(); return (x, y) => .22 + .78 * f(x, y); }
    function textAvoid() {
      const R0 = lay(), q = 4, cw = Math.ceil(W / q), chh = Math.ceil(H / q), c = document.createElement('canvas'); c.width = cw; c.height = chh;
      const g = c.getContext('2d', { willReadFrequently: true }); g.scale(1 / q, 1 / q); g.fillStyle = '#000'; g.textBaseline = 'alphabetic';
      for (const ch of R0.chars) { g.save(); g.font = `900 ${ch.em.toFixed(2)}px ${FAM}`; g.translate(ch.x, ch.base); if (o.skew) g.transform(1, 0, -o.skew, 1, 0, 0); g.scale(ch.sq ?? R0.sq, 1); g.fillText(ch.ch, 0, 0); g.restore(); }
      for (const b of R0.blocks || []) for (const l of b.lines) blockLine(g, l);          // equal-width block: count the text of all blocks (portrait texture avoids it)
      if (R0.logo) g.drawImage(logoImg(R0.logo[2], R0.logo[3]), ...R0.logo);
      if (enO && R0.en) { g.save(); g.font = `700 ${R0.en.size.toFixed(1)}px ${FAM}`; g.translate(R0.en.x, R0.en.base); g.scale(enO.squeeze, 1); g.fillText(enO.text, 0, 0); g.restore(); }
      const a = g.getImageData(0, 0, cw, chh).data, N = cw * chh, D = new Float32Array(N), INF = 1e9;
      for (let i = 0; i < N; i++) D[i] = a[i * 4 + 3] > 64 ? 0 : INF;
      for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) { const i = y * cw + x; if (!D[i]) continue; let v = D[i];
        if (x > 0) v = Math.min(v, D[i - 1] + 1); if (y > 0) { v = Math.min(v, D[i - cw] + 1); if (x > 0) v = Math.min(v, D[i - cw - 1] + 1.4142); if (x < cw - 1) v = Math.min(v, D[i - cw + 1] + 1.4142); } D[i] = v; }
      for (let y = chh - 1; y >= 0; y--) for (let x = cw - 1; x >= 0; x--) { const i = y * cw + x; if (!D[i]) continue; let v = D[i];
        if (x < cw - 1) v = Math.min(v, D[i + 1] + 1); if (y < chh - 1) { v = Math.min(v, D[i + cw] + 1); if (x < cw - 1) v = Math.min(v, D[i + cw + 1] + 1.4142); if (x > 0) v = Math.min(v, D[i + cw - 1] + 1.4142); } D[i] = v; }
      const d0 = AVOID[0] * G, d1 = AVOID[1] * G;
      return (x, y) => { const ix = Math.min(cw - 1, Math.max(0, x / q | 0)), iy = Math.min(chh - 1, Math.max(0, y / q | 0)); return sstep(d0, d1, D[iy * cw + ix] * q); };
    }
    function drawSubject(g, t) {
      if (!subj) return; const s = subj.o;
      if (s.at != null && t < s.at) return; if (s.out != null && t >= s.out) return;
      if (s.draw) { s.draw(g, t, P, api); return; }
      if (!subj.R.ok) return;
      const [x, y, w, h] = subj.box();
      if (subj.tex && subj.tex.wantsAvoid() && !avoidSet && LAY) { subj.tex.setAvoid(textAvoid()); avoidSet = true; }
      const tc = subj.tex ? subj.tex.canvas(t, [x, y, w, h], bgLum) : null;     // portrait texture (optional): replaces only the subject layer
      if (s.shadow) {          // ground shadow (subject silhouette squashed and sheared), lighter near the big type: shadows close to the text stay light
        if (!shAvoid && LAY) shAvoid = textNear();
        XM.tex.shadow(g, subj.R.img, x, y, w, h, { ...(s.shadow === true ? {} : s.shadow), ground: Math.min(y + h, s.ground ?? H), avoid: shAvoid });
      }
      g.save(); if (s.alpha != null) g.globalAlpha *= s.alpha; if (s.filter) g.filter = s.filter; g.drawImage(tc || subj.R.img, x, y, w, h); g.restore();
    }
    const api = { layout: () => lay(), fit: () => lay().fit, subjectBox: () => subj && subj.box(), P, fg };

    const shot = XM.shot({ bg: P.bg, stage: 'flat', cam: o.cam }, () => (g, t) => {
      DS.stage(g, P, { light: o.light ?? !!under });           // solid by default; only the footage window gets the soft top light by default (light:false turns it off)
      if (under) {
        drawUnder(g, t);
        drawBehind(g, t);
        drawText(g, t);
        drawFront(g, t);
        if (under.frame !== false) { const [x, y, w, h] = under.box; DS.frame(g, x, y, w, h, P, { kind: 'evidence', label: under.label ?? 'FOOTAGE' }); }
      } else { drawBehind(g, t); drawText(g, t); }
      drawNotes(g, t);
      drawSubject(g, t);
      if (o.draw) o.draw(g, t, P, api);
      if (o.hud !== false) DS.hud(g, t, P, { tl: 'FIG', ...(o.hud || {}) });
    });
    shot.cues = cues;
    shot.subs = subs;
    shot.times = { in: units.length ? Math.min(...units.map(u => u.t)) : null, out: outT };
    shot.api = api;
    return shot;
  }

  function bigType(o = {}) { return build(o, 'type'); }
  // Name card / quote: subject against one side of the frame, standing on the bottom edge; text on the other side; the subject may overlap the text-area edge a little (overlap, default 14% of subject width)
  function bigName(o = {}) {
    const subject = o.subject ? { side: 'right', h: H * .9, ...o.subject } : null;
    return build({ tone: 'paper', ...o, subject }, 'name');
  }
  function bigQuote(o = {}) {
    const subject = o.subject ? { side: 'right', h: H * .92, ...o.subject } : null;
    return build({ tone: 'paper', ...o, subject }, 'quote');
  }

  Object.assign(XM, { bigType, bigName, bigQuote });
  XM.bigType.SPACE = SPACE; XM.bigType.SPACE_WARN = SPACE_WARN; XM.bigType.SQ_RANGE = SQ_RANGE; XM.bigType.SQ_REF = SQ_REF; XM.bigType.VFILL = VFILL;
})();
