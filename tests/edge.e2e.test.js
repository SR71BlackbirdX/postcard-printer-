'use strict';
/**
 * Edge-case and failure-path test — run with:  node tests\edge.e2e.test.js
 *
 * Covers the paths the happy-path suites never touch: a non-image file in
 * the image input, corrupt settings JSON on import, HTML/unicode/emoji typed
 * into an address, a 600-character line, rapid tab switching, and corrupt
 * localStorage for both settings and the address book. After each one the
 * app must still be alive and must report the failure rather than swallow it,
 * and no uncaught page or console error may occur anywhere in the run.
 *
 * Playwright is dev-only (drives your installed Edge, no download).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
let playwright;
try { playwright = require('playwright'); } catch (e) {
  const g = execSync('npm root -g').toString().trim();
  playwright = require(path.join(g, 'playwright'));
}
const APP_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

const tmp = os.tmpdir();
const txtAsImage = path.join(tmp, 'not-an-image.png');   // plain text with a .png name
const badJson = path.join(tmp, 'broken-settings.json');
const weirdName = path.join(tmp, 'weird (1) & <b>.png');
fs.writeFileSync(txtAsImage, 'this is definitely not a PNG');
fs.writeFileSync(badJson, '{ "offsets": [oops');

let pass = 0; let fail = 0; const failures = [];
const check = (n, ok, d) => {
  if (ok) { pass++; console.log('  PASS  ' + n); }
  else { fail++; failures.push(n + (d ? ' -> ' + d : '')); console.log('  FAIL  ' + n + (d ? '  -> ' + d : '')); }
};

(async () => {
  const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const status = () => page.evaluate(() => document.getElementById('status').textContent);

  // ── 1. Non-image file into the image input ────────────────────────
  await page.goto(APP_URL);
  await page.waitForSelector('#postcard');
  await page.setInputFiles('#imageInput', txtAsImage);
  await page.waitForTimeout(500);
  const s1 = await status();
  check('Bad image file: reports an error', /could not be loaded/i.test(s1), s1.slice(0, 90));
  const stillAlive = await page.evaluate(() => !!document.getElementById('postcard'));
  check('Bad image file: app still alive', stillAlive === true);

  // ── 2. Corrupt settings JSON import ───────────────────────────────
  await page.setInputFiles('#importFile', badJson);
  await page.waitForTimeout(600);
  const s2 = await status();
  check('Corrupt settings import: reports an error', /not valid|error|could not/i.test(s2), s2.slice(0, 90));
  check('Corrupt settings import: app still alive',
    (await page.evaluate(() => !!document.getElementById('postcard'))) === true);

  // ── 3. Unicode / emoji / HTML in the address ──────────────────────
  const XSS = '<img src=x onerror="window.__xss=1">';
  await page.fill('#rName', XSS + ' Ünïcödé 🇮🇳 name');
  await page.fill('#rHouse', 'Line with <script>alert(1)</script>');
  await page.waitForTimeout(250);
  const xss = await page.evaluate(() => ({
    xss: typeof window.__xss,
    injected: document.querySelectorAll('.card-content img').length,
    text: document.getElementById('recipientBlock').textContent.slice(0, 60)
  }));
  check('Injection in address: no element created', xss.injected === 0, JSON.stringify(xss));
  check('Injection in address: no handler ran', xss.xss === 'undefined', xss.xss);
  check('Injection in address: text shown literally', /<img/.test(xss.text), xss.text);

  // ── 4. Very long single-line text ─────────────────────────────────
  await page.fill('#rName', 'A'.repeat(600));
  await page.waitForTimeout(400);
  const long = await page.evaluate(() => ({
    fit: document.getElementById('recipientFit').textContent,
    crash: !!document.getElementById('postcard')
  }));
  check('600-char line: flagged, not silent', long.fit !== 'Fits', long.fit);
  check('600-char line: app still alive', long.crash === true);

  // ── 5. Rapid tab switching ────────────────────────────────────────
  for (let i = 0; i < 12; i++) {
    await page.click(i % 3 === 0 ? '#tabBackBtn' : i % 3 === 1 ? '#tabPrintBtn' : '#tabFrontBtn');
  }
  await page.waitForTimeout(200);
  check('Rapid tab switching: no crash', (await page.evaluate(() => !!document.getElementById('postcard'))) === true);

  // ── 6. Corrupt localStorage: settings ─────────────────────────────
  await page.evaluate(() => localStorage.setItem('indian-postcard-printer.settings.v1', '{ definitely : not json'));
  await page.goto(APP_URL);
  await page.waitForSelector('#postcard');
  check('Corrupt settings storage: app still starts',
    (await page.evaluate(() => !!document.getElementById('postcard'))) === true);

  // ── 7. Corrupt localStorage: address book ─────────────────────────
  await page.evaluate(() => localStorage.setItem('indian-postcard-printer.addressbook.v1', '[1,2,{oops'));
  await page.goto(APP_URL);
  await page.waitForSelector('#postcard');
  const abWorks = await page.evaluate(() => {
    try { return typeof loadAddressBook === 'function' && !!loadAddressBook(); }
    catch (e) { return false; }
  });
  check('Corrupt address book storage: app still starts', abWorks === true);

  check('No uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
  check('No console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log(failures.map((f) => ' - ' + f).join('\n'));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
