// Screenshot a real web page as evidence footage (e.g. for XS evidence shots): URL or local HTML -> sharp PNG.
// Usage:
//   node capture.js <url|local.html> <out.png> [--width 1440] [--height 900] [--scale 2] [--selector "css"] [--full]
//                    [--text "a sentence on the page"] (wait for it to appear and scroll it into view) [--wait 1500]
// Writes a .json next to the PNG with the source URL, capture time, viewport and selector, for source records.
// Public pages only: no login, no cookies stored.
const path = require('path');
const fs = require('fs');
const a = process.argv.slice(2);
if (a.length < 2) { console.error('Usage: node capture.js <url|file.html> <out.png> [--width 1440] [--height 900] [--scale 2] [--selector css] [--full] [--text sentence] [--wait ms]'); process.exit(2); }
const opt = (k, d) => { const i = a.indexOf(k); return i < 0 ? d : a[i + 1]; };
const has = k => a.includes(k);
function loadPlaywright() {
  for (const base of [__dirname, process.cwd()]) { try { return require(require.resolve('playwright-core', { paths: [base] })); } catch (e) { /* next */ } }
  console.error('playwright-core not found'); process.exit(2);
}
const CH = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ ...(CH ? { executablePath: CH } : {}), args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: +opt('--width', 1440), height: +opt('--height', 900) }, deviceScaleFactor: +opt('--scale', 2), locale: opt('--locale', 'en-US') });
  const src = a[0], url = /^https?:/.test(src) ? src : 'file://' + path.resolve(src);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.error('Page did not finish loading (capturing anyway):', e.message));
  await page.waitForTimeout(+opt('--wait', 1200));
  const text = opt('--text', null);
  if (text) { const loc = page.getByText(text, { exact: false }).first(); await loc.waitFor({ timeout: 15000 }); await loc.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); }
  const sel = opt('--selector', null), out = path.resolve(a[1]);
  if (sel) await page.locator(sel).first().screenshot({ path: out });
  else await page.screenshot({ path: out, fullPage: has('--full') });
  fs.writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify({ source: src, captured: new Date().toISOString(), viewport: [+opt('--width', 1440), +opt('--height', 900)], scale: +opt('--scale', 2), selector: sel, text }, null, 1));
  console.log('Screenshot ->', out);
  await browser.close();
})();
