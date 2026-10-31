// Render a project frame by frame in headless Chrome, with automatic checks.
// Usage:
//   node render_frames.js <project dir>                     all frames -> <project>/frames/frame_0000.png ...
//   node render_frames.js <project dir> --stills 2 6 10.5   QA stills only -> <project>/qa/t_<sec>.png
//   optional: --workers 4
// Both modes check font loading, page errors, missing glyphs and text overflowing the frame, and write
// build/sfx_cues.json (video spec, sound cues, music, mute windows) for sfx.py / music.py / mux.py.
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) { console.error('Usage: node render_frames.js <project dir> [--stills t1 t2 ...] [--workers N]'); process.exit(2); }
const PROJ = path.resolve(args[0]);
const opt = (name) => { const i = args.indexOf(name); return i < 0 ? null : i; };
const si = opt('--stills');
const STILLS = si === null ? null : args.slice(si + 1).filter(a => !a.startsWith('--'));
const wi = opt('--workers');
const WORKERS = wi === null ? 4 : parseInt(args[wi + 1], 10);

function loadPlaywright() {
  for (const base of [PROJ, __dirname, process.cwd()]) {
    try { return require(require.resolve('playwright-core', { paths: [base] })); } catch (e) { /* try next */ }
  }
  console.error(`playwright-core not found. Install it once in the skill directory (shared by all projects): cd "${path.dirname(__dirname)}" && npm i playwright-core`);
  process.exit(2);
}
function findChrome() {
  const c = [process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find(p => p && fs.existsSync(p)) || null;   // null -> Playwright's bundled Chromium (needs: npx playwright-core install chromium)
}

// Runs in the page: collect visible text per font family and check for text outside the frame
function inspectPage() {
  const W = window.VIDEO.width, H = window.VIDEO.height, out = { text: {}, off: [] };
  for (const e of document.querySelectorAll('text, tspan')) {
    const s = e.textContent;
    if (!s || !s.trim()) continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;      // display:none
    let op = 1;
    for (let n = e; n && n.nodeType === 1; n = n.parentNode) op *= parseFloat(getComputedStyle(n).opacity || 1);
    if (op < 0.05) continue;
    const fam = getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (e.closest('[data-crop-ok]')) { out.text[fam] = (out.text[fam] || '') + s; continue; }   // [data-crop-ok]: cropping by a camera push-in is intentional; only check glyphs, not overflow
    out.text[fam] = (out.text[fam] || '') + s;
    const m = 4;
    const onScreen = r.right > 0 && r.bottom > 0 && r.left < W && r.top < H;   // fully off-screen = invisible, not an overflow
    if (onScreen && (r.left < -m || r.top < -m || r.right > W + m || r.bottom > H + m))
      out.off.push({ text: s.slice(0, 24), box: [r.left, r.top, r.right, r.bottom].map(Math.round) });
  }
  // Canvas 2D projects register drawn text in window.CANVAS_TEXT = { family: string } during render; checked for glyphs only
  const ct = window.CANVAS_TEXT || {};
  for (const fam in ct) out.text[fam] = (out.text[fam] || '') + ct[fam];
  return out;
}
// Runs in the page: find glyphs missing from a font. Measure against two fallback fonts; if both widths match the
// fallback, the fallback was used, so the glyph is missing.
function missingGlyphs(byFam) {
  const cv = document.createElement('canvas').getContext('2d'), res = {};
  for (const fam in byFam) {
    const miss = [];
    for (const ch of new Set([...byFam[fam]])) {
      if (/\s/.test(ch)) continue;
      const w = f => { cv.font = f; return cv.measureText(ch).width; };
      if (w(`40px "${fam}", monospace`) === w('40px monospace') && w(`40px "${fam}", serif`) === w('40px serif')) miss.push(ch);
    }
    if (miss.length) res[fam] = miss.join('');
  }
  return res;
}

(async () => {
  const { chromium } = loadPlaywright();
  const exe = findChrome();
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--allow-file-access-from-files', '--font-render-hinting=none', ...(process.env.CHROME_ARGS || '').split(' ').filter(Boolean)] });   // heavy WebGL: CHROME_ARGS='--use-angle=metal --enable-gpu --ignore-gpu-blocklist' to use the GPU (macOS; on other OSes pick the matching --use-angle backend)
  let failed = false;
  const textByFam = {}, offscreen = new Map();
  let V;

  async function openPage() {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => { console.error('Page error:', e.message); failed = true; });
    page.on('console', m => { if (m.type() === 'error') { console.error('console:', m.text()); failed = true; } });
    await page.goto('file://' + path.join(PROJ, 'index.html'));
    const fonts = await page.evaluate(() => window.ready);
    V = await page.evaluate(() => window.VIDEO);
    if (V.width !== 1920 || V.height !== 1080) await page.setViewportSize({ width: V.width, height: V.height });
    if (!fonts.length) { console.error('No @font-face took effect. Check that no font-family name collides with a generic keyword such as serif / sans-serif / monospace'); failed = true; }
    const bad = fonts.filter(s => !s.endsWith(':loaded'));
    if (bad.length) { console.error('Fonts failed to load:', bad.join(' '), '- check the file names in fonts/ and the @font-face rules'); failed = true; }
    return { page, fonts };
  }
  async function shoot(page, t, file) {
    await page.evaluate(t => window.render(t), t);
    const ins = await page.evaluate(inspectPage);
    for (const k in ins.text) textByFam[k] = (textByFam[k] || '') + ins.text[k];
    for (const o of ins.off) { if (!offscreen.has(o.text)) offscreen.set(o.text, []); offscreen.get(o.text).push({ t, box: o.box }); }
    // Heavy frames (WebGL + big filters + big fonts) occasionally time out with several workers: allow 120 s, then retry once
    try { await page.screenshot({ path: file, timeout: 120000 }); }
    catch (e) { console.error(`Screenshot timed out, retrying: ${path.basename(file)}`); await page.evaluate(t => window.render(t), t); await page.screenshot({ path: file, timeout: 180000 }); }
  }

  const { page, fonts } = await openPage();
  console.log('Fonts', fonts.join(' '));
  fs.mkdirSync(path.join(PROJ, 'build'), { recursive: true });
  const cues = await page.evaluate(() => window.SFX_CUES || []);
  const music = await page.evaluate(() => window.MUSIC || null);   // background music spec, read by music.py
  const mute = await page.evaluate(() => window.MUTE || []);        // true-silence windows (hard-cut by sfx.py)
  const bgmKey = await page.evaluate(() => window.BGM_KEY || null);  // optional musical key of an external BGM; pitched sound effects snap to it
  const sfxKit = await page.evaluate(() => window.SFX_KIT || null);  // per-project sound-kit tint for sfx_kit.py: { pitch, bright, len, seed }
  fs.writeFileSync(path.join(PROJ, 'build', 'sfx_cues.json'), JSON.stringify({ video: V, cues, music, mute, bgm_key: bgmKey, kit: sfxKit }, null, 1));
  console.log(`Video ${V.width}x${V.height} ${V.fps}fps ${V.duration}s; ${cues.length} sound cues -> build/sfx_cues.json`);
  // Subtitle gaps: components whose big text repeats the spoken line (e.g. XM.bigType) return shot.subs, and scene.js pushes
  // them to window.SUB_GAPS. When subtitles are generated, those words are left out during these time ranges.
  const subGaps = await page.evaluate(() => window.SUB_GAPS || []);
  if (subGaps.length) { fs.writeFileSync(path.join(PROJ, 'build', 'sub_gaps.json'), JSON.stringify({ hud_t0: await page.evaluate(() => window.HUD_T0 || 0), gaps: subGaps }, null, 1)); console.log(`${subGaps.length} subtitle gaps -> build/sub_gaps.json`); }

  if (STILLS) {
    fs.mkdirSync(path.join(PROJ, 'qa'), { recursive: true });
    for (const a of STILLS) await shoot(page, parseFloat(a), path.join(PROJ, 'qa', `t_${a}.png`));
    console.log('QA stills ->', path.join(PROJ, 'qa'));
  } else {
    const TOTAL = Math.round(V.duration * V.fps);
    const dir = path.join(PROJ, 'frames');
    fs.rmSync(dir, { recursive: true, force: true });   // clear old frames so none are left over when the frame count shrinks
    fs.mkdirSync(dir, { recursive: true });
    const pages = [page];
    for (let w = 1; w < WORKERS; w++) pages.push((await openPage()).page);
    const t0 = Date.now(); let done = 0;
    await Promise.all(pages.map(async (pg, w) => {
      for (let i = w; i < TOTAL; i += WORKERS) {
        await shoot(pg, i / V.fps, path.join(dir, `frame_${String(i).padStart(4, '0')}.png`));
        if (++done % 100 === 0) console.log(`${done}/${TOTAL} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
    }));
    const n = fs.readdirSync(dir).filter(f => f.endsWith('.png')).length;
    console.log(`Done ${n}/${TOTAL} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (n !== TOTAL) { console.error('Wrong frame count'); failed = true; }
  }

  const miss = await page.evaluate(missingGlyphs, textByFam);
  for (const fam in miss) { console.error(`Missing glyphs: font ${fam} has no "${miss[fam]}" (they will render in a system fallback font)`); failed = true; }
  // Text overflow: group consecutive frames into episodes. >= 0.5 s means text sits outside the frame: fail.
  // Shorter episodes are entrances / exits / camera moves: summarised only.
  if (offscreen.size) {
    const gap = 1.5 / V.fps, longs = [], shorts = [];
    for (const [txt, arr] of offscreen) {
      arr.sort((a, b) => a.t - b.t);
      let ep = [arr[0]];
      const flush = () => {
        const d = ep[ep.length - 1].t - ep[0].t;
        (d >= 0.5 ? longs : shorts).push(`"${txt}" ${ep[0].t.toFixed(2)}s–${ep[ep.length - 1].t.toFixed(2)}s  box ${ep[0].box.join(',')}`);
      };
      for (let i = 1; i < arr.length; i++) { if (arr[i].t - arr[i - 1].t <= gap) ep.push(arr[i]); else { flush(); ep = [arr[i]]; } }
      flush();
    }
    if (longs.length) {
      console.error('Text outside the frame for >= 0.5 s (must fix: move it, shrink it, or remove it before the camera pushes in):');
      longs.forEach(l => console.error('  ' + l));
      failed = true;
    }
    if (shorts.length) {
      console.warn(`Text briefly outside the frame in ${shorts.length} places (< 0.5 s, usually entrances / exits / camera moves; usually fine${STILLS ? '; stills mode cannot measure duration, check the images' : ''}):`);
      shorts.slice(0, 8).forEach(l => console.warn('  ' + l));
      if (shorts.length > 8) console.warn('  …');
    }
  }
  await browser.close();
  if (failed) { console.error('Render checks failed'); process.exit(1); }
})();
