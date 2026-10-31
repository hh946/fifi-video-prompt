// XM.dayStrip: calendar / version card strip. A row of rounded cards; each card holds a real screenshot, screen-recording
// frames or your own drawing, with a big date or version number and small text on it. The strip stops on the card being
// mentioned, sweeps past the others without stopping, and can whip out backwards at the end (or roll back to the earliest
// card). Use for "several days / versions / releases in a row — time is passing".
// API: XM.dayStrip(o) → { L, update, cues, times, api }; main options: cards, at, stops, hud, face, move, enter, exit, blur, sfx.
// Full docs: docs/components/strip.md
// Depends on lib.js, xk.js, xm-core.js, xm-ds.js (load them first). Canvas 2D via XM.shot; deterministic (no Math.random /
// Date / performance.now).
//
// Default feel (horizontal strip, 'cal' face):
//   · card 1110 × 891, radius 60, gap 37 (pitch 1147); a 2–4 px light-grey rim fading out over 8 px inward (thick glass edge);
//     a 44 px punch hole top-right (110 from the right edge, 63 from the top)
//   · big date top-left (digit height 218), month + year, weekday bottom-left, mini calendar bottom-right (header 15 px,
//     numbers 20 px at the reference size); stage colour outside the cards
//   · motion: enters from 3 cards away at high speed and brakes hard (~12 frames); between cards an S-curve (slow-fast-slow,
//     fully blurred for a few frames at the peak); cards passed without stopping slow to 4–13 px/frame, then speed up again;
//     the exit accelerates exponentially backwards (3.8 cards in 14 frames)
//   · motion blur from speed (180° shutter: blur ≈ per-frame shift × 0.5)
//   · dates follow the real calendar (weekday and month grid are computed); date digits in Unbounded; month / weekday ≥ 56 px;
//     today's cell in the mini calendar is highlighter yellow (the only highlight); stage colour around the cards, not pure
//     black; default pacing: hold each mentioned card ≥ 2.5 s, 0.5 s S-curve between neighbours.
//
// XM.dayStrip(o) → { L, update, cues, times, api }
//   This is a frame: how many cards, what is on them, what is inside them, which ones stop and when — all set by the caller
//   from the voiceover. The component has no default cards, dates or HUD text.
//   Content (required; missing → console.error):
//     cards : [{ … }] at least 2. Each card:
//               image (one of): src (image) + crop:[x,y,w,h] + fit:'cover' (default) | 'contain' + focus:[fx,fy]
//                                 (with cover, which point of the image to keep in view, 0..1, default [.5,.5])
//                               | clip:{ dir (frame folder from scripts/clip_frames.py), at (absolute second of the clip's first
//                                 frame), rate:1 } (real screen recording, keeps playing inside the card)
//                               | draw(g, w, h, t, P) (draw it yourself in card-local coordinates)
//               face: date:'YYYY-MM-DD' (weekday, month and mini calendar come from the real calendar; a weekday that does not
//                     match the date → console.error)
//                     big (big text, overrides the default: day of month for 'cal', M.DD for 'side'; for versions write 'v2.0'),
//                     note (one line of small text meant to be read, ≥ 56 px), label (HUD bottom-right text while stopped here)
//     at    : shot start (absolute seconds). With an entrance, the strip starts sliding in at this moment
//     stops : [{ card, at, pass, dur }] at least 1. at = when this card arrives centred — on the word in the voiceover that
//             names it. pass:true = move through this card without stopping; cards between stops that are not listed are
//             swept past automatically.
//             dur = time from the previous point to here (default move.seg × number of cards); leaving a stopped card, the
//             departure time = at − dur. sharp / skew = per-leg curve (default: from move)
//     hud   : { tl, bl, br }  corner HUD text; while stopped on a card with a label, br shows that card's label
//   Layout:
//     dir   : 'x' (default, horizontal) | 'y' (vertical, variant B)
//     next  : which side the next card is on: 'right' (default) | 'left' (dates increase to the left, the row scrolls right)
//             | 'down' (vertical default) | 'up'
//     center: [x, y] centre of the stopped card (default: frame centre)
//     card  : { w, h, gap, r } (default 1110 / 891 / 37 / 60)
//     face  : 'cal' (default: text on the image — big date top-left, month + year, weekday bottom-left, mini calendar
//             bottom-right, punch hole top-right)
//             | 'side' (variant B: text in a column beside the image, image in a rounded window — for screenshots that must
//             stay readable)
//     side  : variant B, where the text column goes: 'left' (default) | 'top'; panel: column width (default 460; height for 'top')
//     lang  : 'en' (default: WEDNESDAY / OCT 2026) | 'zh' (Chinese weekday / year-month); week0: mini calendar starts on
//             Sunday (0, default) or Monday (1)
//     cal   : true (default, drawn only when there is a date) | false; hi: true (default) highlights today's cell
//     rim / hole : glass rim and punch hole (on by default for 'cal', off for 'side')
//     dim   : how much cards away from the centre are darkened (0..1, default 0 for 'cal', .35 for 'side')
//     tone  : stage 'ink' (default) | 'paper' (variant B) | 'accent'
//   Motion:
//     move  : { seg:.5 (seconds to sweep one card), pass:.3 (speed left when passing a card, cards / s), sharp:3 (how peaked
//             the S-curve is: 2 gentle, 8 = fully blurred at the midpoint), skew:1 (>1 moves the fastest moment later: slow
//             start, fast arrival; 1.2 works well) }
//     enter : { from:-2 (slides in from this many cards before the first stop; positive = from the other side),
//             ease:'decay' | function } | false (first card is already in place at `at`). Entrance duration = stops[0].at − at
//     exit  : { at, dist:3.5 (cards to whip), dur:.55, k:7 (higher = more exponential), dir:-1 (-1 back, 1 forward) } whip out.
//             To "roll back to the past and stop on the earliest card", skip exit and add a backwards stop instead
//     blur  : { shutter:.5 (180° shutter), max:320 } | false
//     minHold: minimum hold on a stopped card in seconds (default 2.5: images should stay on screen at least 2.5 s);
//             shorter → console.warn. Set 0 for deliberately fast montage pacing
//   Sound (returns cues; in the scene: window.SFX_CUES.push(...shot.cues)):
//     sfx   : { enter:'zip' (entrance arrival, align end), roll:'ratchet' (per scroll leg, dur covers it), stop:'snap' (stop on
//             the mentioned card), exit:'whip' }; any item can be false
//   Photosensitivity: when two neighbouring cards swept quickly differ in mean brightness by ≥ .2 it counts as a flash; more
//   than 3 in any 1 s → console.error (unsafe:true downgrades it to a warning; only for deliberately fast cuts)
(() => {
  const { W, H } = XK;
  const DS = XM.DS;
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fpsOf = () => (window.VIDEO && VIDEO.fps) || 30;

  // ---------- real calendar (no Date) ----------
  const SAK = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const dow = (y, m, d) => { if (m < 3) y -= 1; return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + SAK[m - 1] + d) % 7; };   // 0 = Sunday
  const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysIn = (y, m) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const WK_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const WK_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const HD_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], HD_ZH = ['日', '一', '二', '三', '四', '五', '六'];
  const MO_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function parseDate(s) {
    if (!s) return null;
    const m = typeof s === 'string' ? s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) : null;
    const y = m ? +m[1] : s.y, mo = m ? +m[2] : s.m, d = m ? +m[3] : s.d;
    if (!(y > 0 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo))) { console.error(`XM.dayStrip: date ${JSON.stringify(s)} is not a real date (use 'YYYY-MM-DD')`); return null; }
    return { y, m: mo, d, w: dow(y, mo, d) };
  }

  // ---------- S-curve: speed = linear blend of the end speeds + a sin^q bell (integrated table) ----------
  const BELL = new Map();
  function bellTab(q) {
    if (BELL.has(q)) return BELL.get(q);
    const N = 1024, tab = new Float64Array(N + 1); let s = 0;
    for (let i = 1; i <= N; i++) { const u = (i - .5) / N; s += Math.pow(Math.sin(Math.PI * u), q); tab[i] = s; }
    for (let i = 0; i <= N; i++) tab[i] /= s;
    BELL.set(q, tab); return tab;
  }
  function bell(q, w) { const tab = bellTab(q), N = tab.length - 1, x = cl(w) * N, i = Math.min(N - 1, Math.floor(x)); return lerp(tab[i], tab[i + 1], x - i); }
  // Fraction travelled within one sub-segment (0..1): start speed v0, end speed v1 (both normalised to segment length / duration)
  // skew > 1 moves the fastest moment later (slow start, fast arrival). Only the bell part is warped; end speeds stay the same
function segF(w, v0, v1, q, sk = 1) { const A = Math.max(0, 1 - (v0 + v1) / 2); return v0 * (w - w * w / 2) + v1 * w * w / 2 + A * bell(q, sk === 1 ? w : Math.pow(w, sk)); }
  // Entrance hard brake (speed decays by about .74 per frame)
  const EASE = {
    decay: k => (1 - Math.exp(-3.7 * k)) / (1 - Math.exp(-3.7)),
    expo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    out: k => 1 - Math.pow(1 - k, 3), linear: k => k,
  };
  const ez = e => (typeof e === 'function' ? e : EASE[e] || EASE.decay);

  // ---------- helpers ----------
  let _probe = null;
  function probe(w, h) { if (!_probe || _probe.canvas.width !== w || _probe.canvas.height !== h) { const c = document.createElement('canvas'); c.width = w; c.height = h; _probe = c.getContext('2d', { willReadFrequently: true }); } _probe.setTransform(1, 0, 0, 1, 0, 0); _probe.clearRect(0, 0, w, h); return _probe; }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
  let _asc = {};
  function digitAscent(g, fam, w) {          // digit ink height / font size (measured once)
    const k = fam + w; if (_asc[k]) return _asc[k];
    g.save(); g.font = `${w} 200px ${XM.FAM[fam] || fam}`; const m = g.measureText('0123456789'); g.restore();
    const r = (m.actualBoundingBoxAscent || 145) / 200; if (document.fonts && document.fonts.check(`${w} 20px ${XM.FAM[fam] || fam}`)) _asc[k] = r; return r;
  }

  function dayStrip(o = {}) {
    // ---------- required ----------
    const cards = Array.isArray(o.cards) ? o.cards : [];
    if (cards.length < 2) console.error('XM.dayStrip: cards is required (≥ 2: a real screenshot / screen-recording frame + a date or version number each), set by the video\'s script; there are no default cards');
    cards.forEach((c, i) => { if (!c || !(c.src || c.clip || c.draw)) console.error(`XM.dayStrip: cards[${i}] needs a picture: src (image) | clip:{ dir, at } (screen-recording frames) | draw(g, w, h, t, P)`);
      if (c && !c.date && c.big == null) console.error(`XM.dayStrip: cards[${i}] needs date:'YYYY-MM-DD' or big (version / index); a card cannot be blank`); });
    if (o.at == null) console.error('XM.dayStrip: at (absolute start time of the shot) is required, set it from the voice-over');
    const stops0 = Array.isArray(o.stops) ? o.stops : [];
    if (!stops0.length) console.error('XM.dayStrip: stops (which card to stop on and when: [{ card, at }]) is required, set it from the voice-over');
    if (!o.hud) console.error('XM.dayStrip: hud text (tl shot number / bl chapter / br what is shown) is required; there are no default words');
    const at = o.at ?? 0, fps = fpsOf();
    const P = { ...DS.tone(o.tone || 'ink') };
    const dir = o.dir || 'x', next = o.next || (dir === 'y' ? 'down' : 'right');
    const sgn = next === 'left' || next === 'up' ? -1 : 1;
    const face = o.face || 'cal', isCal = face === 'cal';
    const CD = { w: 1110, h: 891, gap: 37, r: 60, ...(o.card || {}) };
    const along = dir === 'y' ? CD.h : CD.w, pitch = along + CD.gap;
    const C0 = o.center || [W / 2, H / 2];
    const lang = o.lang || 'en', week0 = o.week0 ?? 0;
    const rim = o.rim ?? isCal, hole = o.hole ?? isCal, dim = o.dim ?? (isCal ? 0 : .35);
    const sideAt = o.side || 'left', panel = o.panel ?? (sideAt === 'top' ? 200 : 460);
    const MV = { seg: .5, pass: .3, sharp: 3, skew: 1, ...(o.move || {}) };
    const BL = o.blur === false ? null : { shutter: .5, max: 320, ...(o.blur || {}) };
    const minHold = o.minHold ?? 2.5;
    const D = cards.map((c, i) => {
      const d = parseDate(c.date);
      if (d && c.weekday != null) { const wk = typeof c.weekday === 'number' ? c.weekday : WK_EN.indexOf(String(c.weekday).toUpperCase());
        if (wk !== d.w) console.error(`XM.dayStrip: cards[${i}] ${c.date} is a ${WK_EN[d.w]}, which does not match weekday ${c.weekday}; dates must be real`); }
      return d;
    });

    // ---------- motion: stop / pass points → position function pos(t) (unit: cards; pos = i means card i is centred) ----------
    const pts = stops0.map(s => ({ card: s.card, at: s.at, pass: !!s.pass, dur: s.dur, sharp: s.sharp, skew: s.skew })).sort((a, b) => a.at - b.at);
    pts.forEach((p, i) => { if (!(p.card >= 0 && p.card < cards.length)) console.error(`XM.dayStrip: stops[${i}].card = ${p.card} is not in 0..${cards.length - 1}`); });
    // each leg: from a to b over [ts, te]
    const legs = [];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], n = Math.max(1, Math.round(Math.abs(b.card - a.card)));
      const dur = b.dur ?? n * MV.seg;
      let ts = a.pass ? a.at : Math.max(a.at, b.at - dur);
      if (b.at - ts < 1 / fps) ts = b.at - 1 / fps;
      legs.push({ a, b, n, ts, te: b.at });
    }
    const E = o.enter === false || !pts.length ? null : { from: -2, ease: 'decay', ...(o.enter || {}) };
    const EX = o.exit ? { dist: 3.5, dur: .55, k: 7, dir: -1, ...o.exit } : null;
    const lastPt = pts[pts.length - 1];
    function basePos(t) {
      if (!pts.length) return 0;
      const p0 = pts[0];
      if (t < p0.at) {
        if (!E || p0.at - at < 1 / fps) return p0.card;
        const k = cl((t - at) / (p0.at - at));
        return p0.card + E.from * (1 - ez(E.ease)(k));
      }
      for (const L of legs) {
        if (t >= L.te) continue;
        if (t < L.ts) return L.a.card;
        const u = (t - L.ts) / (L.te - L.ts), x = u * L.n, j = Math.min(L.n - 1, Math.floor(x)), w = x - j, sd = (L.te - L.ts) / L.n;
        const vp = MV.pass * sd;                                   // passing a card without stopping: cards/s → normalised to this sub-segment
        const v0 = j === 0 ? (L.a.pass ? vp : 0) : vp, v1 = j === L.n - 1 ? (L.b.pass ? vp : 0) : vp;
        return L.a.card + (L.b.card - L.a.card) * (j + segF(w, v0, v1, L.b.sharp ?? MV.sharp, L.b.skew ?? MV.skew)) / L.n;
      }
      return lastPt.card;
    }
    function pos(t) {
      if (EX && t > EX.at) { const tau = t - EX.at; return basePos(EX.at) + EX.dir * EX.dist * (Math.exp(EX.k * tau) - 1) / (Math.exp(EX.k * EX.dur) - 1); }
      return basePos(t);
    }
    const speedPx = t => { const h = .5 / fps; return (pos(t + h) - pos(t - h)) / (2 * h) * pitch / fps; };   // shift per frame (px)

    // held long enough? (images should stay on screen at least 2.5 s)
    pts.forEach((p, i) => {
      if (p.pass) return;
      const L = legs.find(l => l.a === p), end = L ? L.ts : EX ? EX.at : null;
      if (end != null && end - p.at < minHold - 1e-6) console.warn(`XM.dayStrip: card ${p.card} only holds ${(end - p.at).toFixed(2)} s (images should stay at least ${minHold} s); for deliberately fast pacing set minHold:0`);
    });

    // ---------- media ----------
    const IMG = cards.map(c => (c.src ? XM.image(c.src) : null));
    const CLP = cards.map(c => (c.clip ? XM.frames(c.clip.dir) : null));
    function contentRect(i) {     // image window, card-local coordinates
      if (isCal) return [0, 0, CD.w, CD.h];
      if (sideAt === 'top') return [0, panel, CD.w, CD.h - panel];
      return [panel, 0, CD.w - panel, CD.h];
    }
    // Resolution check: on-screen upscale of a screenshot should be ≤ 1.1 (error above 1.25)
    let hdChecked = false;
    function hdCheck() {
      if (hdChecked || !IMG.every(im => !im || im.ok)) return; hdChecked = true;
      cards.forEach((c, i) => { const im = IMG[i]; if (!im) return; const [, , cw, ch] = contentRect(i), cr = c.crop || [0, 0, im.img.naturalWidth, im.img.naturalHeight];
        const s = (c.fit === 'contain' ? Math.min : Math.max)(cw / cr[2], ch / cr[3]);
        if (s > 1.1) (s > 1.25 ? console.error : console.warn)(`XM.dayStrip: cards[${i}] ${c.src} is scaled up ${s.toFixed(2)}× in the card and will look blurry (keep it ≤ 1.1): use a sharper image or a larger crop`); });
    }

    // ---------- draw one card (card-local coordinates, origin = card top-left) ----------
    function drawMedia(g, i, x, y, w, h, t) {
      const c = cards[i];
      g.save(); g.fillStyle = P.stage === 'paper' ? '#d9d4ca' : '#1b1c20'; g.fillRect(x, y, w, h);
      if (c.draw) { g.translate(x, y); c.draw(g, w, h, t, P); g.restore(); return; }
      let img = null, iw = 0, ih = 0;
      if (IMG[i] && IMG[i].ok) { img = IMG[i].img; iw = img.naturalWidth; ih = img.naturalHeight; }
      else if (CLP[i] && CLP[i].ok) { img = CLP[i].at((t - (c.clip.at ?? at)) * (c.clip.rate ?? 1)); if (img) { iw = img.naturalWidth; ih = img.naturalHeight; } }
      if (img) {
        const cr = c.crop || [0, 0, iw, ih], cont = c.fit === 'contain';
        const s = (cont ? Math.min : Math.max)(w / cr[2], h / cr[3]), dw = cr[2] * s, dh = cr[3] * s, f = c.focus || [.5, .5];
        const dx = x + (w - dw) * (cont ? .5 : f[0]), dy = y + (h - dh) * (cont ? .5 : f[1]);
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(img, cr[0], cr[1], cr[2], cr[3], dx, dy, dw, dh);
      }
      g.restore();
    }
    function miniCal(g, d, x0, y0, cw, rh, o2) {    // mini calendar (bottom-right or side column): header + numbers; today's cell highlighter yellow
      const heads = lang === 'zh' ? HD_ZH : HD_EN, first = dow(d.y, d.m, 1), nd = daysIn(d.y, d.m);
      const colF = o2.col, faint = o2.faint, fs = o2.size;
      for (let c = 0; c < 7; c++) XM.txt(g, heads[(c + week0) % 7], x0 + (c + .5) * cw, y0, { fam: 'mono', size: fs * .82, w: 500, col: faint, align: 'center' });
      const off = (first - week0 + 7) % 7;
      for (let n = 1; n <= nd; n++) {
        const k = off + n - 1, r = Math.floor(k / 7), c = k % 7, cx = x0 + (c + .5) * cw, by = y0 + (r + 1) * rh;
        const today = n === d.d && o.hi !== false;
        if (today) { g.save(); g.fillStyle = P.mark; rr(g, cx - cw * .46, by - fs * 1.02, cw * .92, fs * 1.38, 6); g.fill(); g.restore(); }
        XM.txt(g, String(n), cx, by, { fam: 'mono', size: fs, w: 500, col: today ? DS.INK : colF, align: 'center' });
      }
    }
    function drawFaceCal(g, i, t) {
      const c = cards[i], d = D[i], w = CD.w, h = CD.h, sc = h / 891, fg = DS.PAPER;
      // Text sits on the image: a faint darkening top-left and along the bottom (a backing for the text, not a text shadow)
      g.save();
      let gr = g.createLinearGradient(0, 0, w * .5, h * .62); gr.addColorStop(0, 'rgba(0,0,0,.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      gr = g.createLinearGradient(0, h * .55, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.restore();
      const big = c.big != null ? String(c.big) : d ? String(d.d) : '';
      const bh = (o.bigH ?? 218) * sc, fw = o.bigW ?? 500, size = bh / digitAscent(g, 'unb', fw);
      XM.txt(g, big, 80 * sc, 130 * sc + bh, { fam: 'unb', size, w: fw, col: fg, ls: -size * .02 });
      const lab = Math.max(56, 56 * sc);
      if (d) XM.txt(g, lang === 'zh' ? `${d.y} 年 ${d.m} 月` : `${MO_EN[d.m - 1]} ${d.y}`, 84 * sc, 130 * sc + bh + 34 * sc + lab * .9, { fam: lang === 'zh' ? 'zh' : 'unb', size: lab, w: 500, col: fg });
      if (c.note) XM.txt(g, c.note, 84 * sc, 130 * sc + bh + 34 * sc + lab * 2.15, { fam: 'zh', size: lab, w: 700, col: fg });
      if (d) XM.txt(g, lang === 'zh' ? WK_ZH[d.w] : WK_EN[d.w], 84 * sc, h - 92 * sc, { fam: lang === 'zh' ? 'zh' : 'unb', size: lab, w: 600, col: fg });
      if (d && o.cal !== false) {
        const cw = 66 * sc, x0 = w - 70 * sc - cw * 7, fs = Math.max(20, 24 * sc), rh = fs * 1.95;
        const rows = Math.ceil(((dow(d.y, d.m, 1) - week0 + 7) % 7 + daysIn(d.y, d.m)) / 7);
        miniCal(g, d, x0, h - 86 * sc - rows * rh, cw, rh, { col: fg, faint: 'rgba(236,232,223,.62)', size: fs });
      }
    }
    function drawFaceSide(g, i, t) {
      const c = cards[i], d = D[i], top = sideAt === 'top';
      const fg = P.fg, mute = P.mute;
      const big = c.big != null ? String(c.big) : d ? `${d.m}.${String(d.d).padStart(2, '0')}` : '';
      const bh = o.bigH ?? 120, fw = o.bigW ?? 500, size = bh / digitAscent(g, 'unb', fw);
      if (top) {
        XM.txt(g, big, 0, bh + 20, { fam: 'unb', size, w: fw, col: fg, ls: -size * .02 });
        let x = XM.measure(g, big, { fam: 'unb', size, w: fw, ls: -size * .02 }) + 40;
        if (d) { x += XM.txt(g, lang === 'zh' ? WK_ZH[d.w] : WK_EN[d.w], x, bh + 20, { fam: lang === 'zh' ? 'zh' : 'unb', size: 56, w: 700, col: fg }) + 32; }
        if (c.note) XM.txt(g, c.note, x, bh + 20, { fam: 'zh', size: 56, w: 500, col: mute });
        return;
      }
      const x0 = 0; let y = 6 + bh;
      XM.txt(g, big, x0, y, { fam: 'unb', size, w: fw, col: fg, ls: -size * .02 });
      y += 26;
      if (d) { y += 60; XM.txt(g, (lang === 'zh' ? WK_ZH[d.w] : WK_EN[d.w]) + (lang === 'zh' ? ` · ${d.y}` : ` ${d.y}`), x0, y, { fam: lang === 'zh' ? 'zh' : 'unb', size: 56, w: 700, col: fg }); }
      if (c.note) { y += 74; XM.txt(g, c.note, x0, y, { fam: 'zh', size: 56, w: 500, col: mute }); }
      if (d && o.cal !== false) {
        const cw = Math.min(56, (panel - 60) / 7), fs = 21, rh = fs * 1.75;
        const rows = Math.ceil(((dow(d.y, d.m, 1) - week0 + 7) % 7 + daysIn(d.y, d.m)) / 7);
        miniCal(g, d, x0, CD.h - 8 - rows * rh, cw, rh, { col: fg, faint: P.mute, size: fs });
      }
    }
    function drawCard(g, i, t, k) {           // k = distance from the centre in cards (for dimming)
      const w = CD.w, h = CD.h, [mx, my, mw, mh] = contentRect(i);
      const R = isCal ? CD.r : (o.r ?? 28);
      // image window
      g.save();
      if (!isCal && P.stage === 'paper') { g.save(); g.shadowColor = 'rgba(40,30,10,.18)'; g.shadowBlur = 40; g.shadowOffsetY = 14; g.fillStyle = P.bg; rr(g, mx, my, mw, mh, R); g.fill(); g.restore(); }
      rr(g, mx, my, mw, mh, R); g.clip();
      drawMedia(g, i, mx, my, mw, mh, t);
      if (isCal) drawFaceCal(g, i, t);
      if (rim) {      // thick glass edge: brightest on the outer ring, fading over 8 px inward
        for (let j = 0; j < 8; j++) { g.strokeStyle = `rgba(232,230,224,${(.78 * Math.pow(1 - j / 8, 1.6)).toFixed(3)})`; g.lineWidth = 1.2; rr(g, mx + .6 + j, my + .6 + j, mw - 1.2 - 2 * j, mh - 1.2 - 2 * j, Math.max(4, R - j)); g.stroke(); }
      } else if (!isCal) { g.strokeStyle = P.line; g.lineWidth = 2; rr(g, mx + 1, my + 1, mw - 2, mh - 2, R - 1); g.stroke(); }
      g.restore();
      if (hole) { const sc = h / 891; g.save(); g.fillStyle = P.bg; g.beginPath(); g.arc(mx + mw - 110 * sc, my + 63 * sc, 22 * sc, 0, Math.PI * 2); g.fill(); g.restore(); }
      if (!isCal) drawFaceSide(g, i, t);
      if (dim > 0 && k > .02) { g.save(); g.globalAlpha = dim * cl(k); g.fillStyle = P.bg; g.fillRect(-4, -4, w + 8, h + 8); g.restore(); }
    }
    // top-left corner of card i (screen coordinates) at position p
    const cardXY = (i, p) => { const u = sgn * (i - p) * pitch; return dir === 'y' ? [C0[0] - CD.w / 2, C0[1] + u - CD.h / 2] : [C0[0] + u - CD.w / 2, C0[1] - CD.h / 2]; };
    function drawStrip(g, p, t, padA) {      // padA: extra margin drawn on both sides along the motion (for blur)
      for (let i = 0; i < cards.length; i++) {
        const [x, y] = cardXY(i, p);
        if (dir === 'y' ? (y > H + padA || y + CD.h < -padA) : (x > W + padA || x + CD.w < -padA)) continue;
        g.save(); g.translate(x, y); drawCard(g, i, t, Math.abs(i - p)); g.restore();
      }
    }

    // ---------- photosensitivity check: brightness jump between neighbouring cards swept quickly ----------
    let flashChecked = false;
    function flashCheck() {
      if (flashChecked || !IMG.every(im => !im || im.ok)) return; flashChecked = true;
      const Lm = cards.map((c, i) => { const im = IMG[i]; if (!im) return null; const q = probe(32, 24), cr = c.crop || [0, 0, im.img.naturalWidth, im.img.naturalHeight];
        q.drawImage(im.img, cr[0], cr[1], cr[2], cr[3], 0, 0, 32, 24); const dd = q.getImageData(0, 0, 32, 24).data; let s = 0;
        for (let j = 0; j < dd.length; j += 4) s += (dd[j] * .2126 + dd[j + 1] * .7152 + dd[j + 2] * .0722) / 255; return s / (dd.length / 4); });
      const fl = [];
      for (const L of legs) { const sd = (L.te - L.ts) / L.n, st = Math.sign(L.b.card - L.a.card);
        for (let j = 1; j <= L.n; j++) { const i0 = L.a.card + st * (j - 1), i1 = L.a.card + st * j;
          if (Lm[i0] != null && Lm[i1] != null && Math.abs(Lm[i1] - Lm[i0]) >= .2 && sd < .33) fl.push(L.ts + j * sd); } }
      let worst = 0; for (const t0 of fl) worst = Math.max(worst, fl.filter(t1 => t1 >= t0 && t1 < t0 + 1).length);
      const msg = `XM.dayStrip: the fast sweep has ${fl.length} full-card brightness jumps (mean brightness change ≥ .2 between neighbouring cards), up to ${worst} within 1 s: don't alternate dark and light screenshots in a fast roll`;
      if (worst > 3) (o.unsafe ? console.warn : console.error)(msg); else if (worst > 0) console.warn(msg);
      api.lum = Lm;
    }

    // ---------- sound ----------
    const SF = { enter: DS.SFX.dash, roll: 'ratchet', stop: DS.SFX.land, exit: DS.SFX.wipe, ...(o.sfx || {}) }, cues = [];
    const cue = (t, name, x = {}) => { if (name && isFinite(t)) cues.push({ t: +t.toFixed(3), name, ...x }); };
    if (E && pts.length && pts[0].at - at >= 1 / fps) cue(pts[0].at, SF.enter, { align: 'end' });
    let chain = null;
    for (const L of legs) { if (!L.a.pass) chain = L.ts; if (!L.b.pass) { cue(chain ?? L.ts, SF.roll, { dur: +(L.te - (chain ?? L.ts)).toFixed(3) }); cue(L.te, SF.stop); chain = null; } }
    if (EX) cue(EX.at, SF.exit);

    const api = { pos, speedPx, legs, pts, cardXY, lum: null };
    const shot = XM.shot({ bg: P.bg, stage: 'flat', cam: o.cam }, () => (g, t) => {
      hdCheck(); flashCheck();
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); DS.stage(g, P); g.restore();
      const p = pos(t), v = BL ? Math.abs(speedPx(t)) : 0, Lb = BL ? Math.min(BL.max, v * BL.shutter) : 0;
      if (Lb < 1.5) drawStrip(g, p, t, 0);
      else {
        const pad = Math.ceil(Lb / 2) + 8, horiz = dir !== 'y';
        const S = XM.canvas('ds-strip', horiz ? W + 2 * pad : W, horiz ? H : H + 2 * pad), q = S.g;
        q.setTransform(1, 0, 0, 1, 0, 0); q.fillStyle = P.bg; q.fillRect(0, 0, S.c.width, S.c.height);
        q.save(); q.translate(horiz ? pad : 0, horiz ? 0 : pad); drawStrip(q, p, t, pad); q.restore();
        const A = XM.canvas('ds-acc'), a = A.g, n = cl(Math.ceil(Lb / 3), 2, 48);
        a.setTransform(1, 0, 0, 1, 0, 0);
        for (let j = 0; j < n; j++) { const off = -Lb / 2 + Lb * j / (n - 1); a.globalAlpha = 1 / (j + 1);
          a.drawImage(S.c, horiz ? -pad + off : 0, horiz ? 0 : -pad + off); }
        a.globalAlpha = 1;
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(A.c, 0, 0); g.restore();
      }
      // HUD: while stopped on a card with a label, bottom-right shows that label
      const hud = { ...(o.hud || {}) }, ci = Math.round(p);
      if (cards[ci] && cards[ci].label && Math.abs(p - ci) < .5 && Lb < 30) hud.br = cards[ci].label;
      if (o.hud !== false) DS.hud(g, t, P, hud);
    });
    shot.cues = cues; shot.api = api;
    shot.times = { stops: pts.filter(p => !p.pass).map(p => p.at), legs: legs.map(L => [L.ts, L.te]), exit: EX && EX.at, exitEnd: EX && EX.at + EX.dur };
    return shot;
  }
  dayStrip.dow = dow; dayStrip.daysIn = daysIn;
  Object.assign(XM, { dayStrip });
})();
