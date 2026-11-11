// Redline Rush smoke test.
//
//   npm test             run it (fails on any error or behaviour change)
//   npm run test:update  accept the current behaviour as the new baseline
//
// What it does:
//   1. Serves this folder and opens the game in headless Chrome.
//   2. Boots, opens every menu screen, and fails on any page error or missing file.
//   3. Drives deterministic races with the built-in autopilot (Math.random is seeded)
//      and compares the results with test/fingerprint.json.
//
// A refactor (moving or renaming code) must keep the fingerprint identical.
// A gameplay change is expected to change it: check the game, then run test:update.
//
// Needs Chrome or Chromium. Set CHROME_PATH if it is not found automatically.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FP_FILE = path.join(ROOT, 'test', 'fingerprint.json');
const SHOTS = path.join(ROOT, 'test', 'shots');
const UPDATE = process.argv.includes('--update');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const CHROMES = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
const executablePath = CHROMES.find((c) => fs.existsSync(c));
if (!executablePath) { console.error('Chrome not found. Set CHROME_PATH.'); process.exit(2); }

const browser = await puppeteer.launch({ executablePath, headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server', '--window-size=1280,800'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push('Page error: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('Console error: ' + m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
page.on('requestfailed', (r) => errors.push('Request failed: ' + r.url()));

let failed = false;
const step = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed = true; };
fs.mkdirSync(SHOTS, { recursive: true });

try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => { const e = document.getElementById('boot-press'); return e && !e.hidden; }, { timeout: 180000 });
  step('boots', true);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.getElementById('scr-menu').hidden, { timeout: 10000 });
  step('main menu opens', true);
  await page.screenshot({ path: path.join(SHOTS, 'menu.png') });

  // every screen opens and closes
  for (const where of ['modes', 'garage', 'career', 'settings']) {
    const ok = await page.evaluate(async (w) => {
      const ui = window.__game.ui;
      ui.go(w);
      await new Promise((r) => setTimeout(r, 400));
      const id = { modes: 'scr-modes', garage: 'scr-garage', career: 'scr-career', settings: 'scr-settings' }[w];
      const shown = !document.getElementById(id).hidden;
      ui.back();
      await new Promise((r) => setTimeout(r, 300));
      return shown;
    }, where);
    step(`screen: ${where}`, ok);
  }

  // deterministic races
  const races = [['heat', 50], ['drift', 30], ['free', 20], ['daily', 20]];
  const results = {};
  for (const [mode, secs] of races) {
    const r = await page.evaluate((mode, secs) => {
      let a = 12345;
      Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const g = window.__game, I = window.__input;
      g.ui.startRun(mode);
      for (let i = 0; i < 120 * secs; i++) {
        if (g.state === 'countdown') { g.countT -= 1 / 120; if (g.countT <= 0.2) g.state = 'race'; }
        if (g.state !== 'race' && g.state !== 'countdown') break;
        const ap = g.autopilot();
        I.steer = ap.steer; I.gas = 1; I.brake = 0; I.drift = (i % 600) > 500 ? 1 : 0; I.boost = (i % 900) > 700 ? 1 : 0;
        g.step(1 / 120);
      }
      const R = g.run;
      return { state: g.state, dist: +g.p.s.toFixed(2), score: +R.score.toFixed(2), nearMiss: R.nearMiss, crashes: R.crashes, gates: R.gates, maxMult: R.maxMult };
    }, mode, secs);
    const sane = r.dist > 200 && Number.isFinite(r.score);
    step(`race: ${mode} (${secs}s autopilot)`, sane, JSON.stringify(r));
    if (mode !== 'daily') results[mode] = r; // the daily road changes every day
  }
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(SHOTS, 'race.png') });

  // results screen
  const res = await page.evaluate(async () => {
    const g = window.__game;
    g.endRun('TEST');
    for (let i = 0; i < 400 && g.state !== 'results'; i++) g.frame(1 / 60);
    await new Promise((r) => setTimeout(r, 300));
    return { state: g.state, shown: !document.getElementById('scr-results').hidden };
  });
  step('results screen', res.state === 'results' && res.shown);

  // fingerprint
  if (UPDATE || !fs.existsSync(FP_FILE)) {
    fs.writeFileSync(FP_FILE, JSON.stringify(results, null, 2) + '\n');
    console.log('Fingerprint saved to test/fingerprint.json');
  } else {
    const want = JSON.parse(fs.readFileSync(FP_FILE, 'utf8'));
    const same = JSON.stringify(want) === JSON.stringify(results);
    step('behaviour matches fingerprint', same, same ? '' : `\n  expected ${JSON.stringify(want)}\n  got      ${JSON.stringify(results)}\n  (expected after a gameplay change: check the game, then run npm run test:update)`);
  }
} catch (e) {
  step('test ran to completion', false, e.message);
}

step('no page errors or missing files', errors.length === 0, errors.slice(0, 10).join('\n  '));
console.log(`Screenshots: ${path.relative(process.cwd(), SHOTS)}/`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
