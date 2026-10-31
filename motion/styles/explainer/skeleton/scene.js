// Build every shot once, then put them in order with XK.seq. All times come from T (timeline.js).
// Pick components from docs/components/; each page has a snippet you can paste here.
XK.theme('night', { accent: '#ff4f3a', accent2: '#ffd84a' });   // background: night / paper / lab, plus this video's accent colors

const SH = {};
// SH.title = XM.bigType({ lines: [{ text: 'HELLO,', at: T.intro }, { text: 'WORLD', at: T.intro + .6 }] });
// window.SFX_CUES.push(...SH.title.cues);

XK.seq([
  // { shot: SH.title, t0: T.intro, tin: 'cut' },
]);
