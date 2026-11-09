/**
 * End-to-end workflow test — run with:  node tests\e2e.test.js
 *
 * This is the full-user-journey test. It:
 *   1. spawns the REAL server.js on a free port and verifies its HTTP
 *      behaviour (content types, 404, traversal protection, 405, headers),
 *   2. drives the real app in Microsoft Edge through the complete workflow
 *      (address forms -> smart fitting -> back message -> back image ->
 *      templates -> calibration -> print modes and sides -> settings),
 *   3. saves screenshots at each stage for eyeball review.
 *
 * Playwright is dev-only (drives your installed Edge, no download).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const zlib = require('zlib');
const { spawn, execSync } = require('child_process');

const root = path.join(__dirname, '..');
const SHOT_DIR = path.join(__dirname, 'e2e-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { passed += 1; console.log('  PASS  ' + name); }
  else { failed += 1; failures.push(name + (detail !== undefined ? ' -> ' + detail : '')); console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
}
const round = (n) => Math.round(n * 100) / 100;

/* ── Locate Playwright (local first, then global npm) ──────────────── */
let playwright;
try {
  playwright = require('playwright');
} catch (err) {
  const globalRoot = execSync('npm root -g').toString().trim();
  playwright = require(path.join(globalRoot, 'playwright'));
}

/** A small RGBA PNG generator (four coloured quadrants) for image tests. */
function makeQuadPng(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [Buffer.from([0])];
    for (let x = 0; x < size; x++) {
      const left = x < size / 2;
      const top = y < size / 2;
      row.push(Buffer.from(
        (left && top ? [255, 0, 0]
          : !left && top ? [0, 0, 255]
          : left && !top ? [0, 128, 0]
          : [255, 200, 0]).concat([255])));
    }
    rows.push(Buffer.concat(row));
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0, 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
const IMAGE_PNG = path.join(os.tmpdir(), 'e2e-back-image.png');
fs.writeFileSync(IMAGE_PNG, makeQuadPng(16));

/** Ask the OS for a free TCP port. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* ── 1. Start the real server ──────────────────────────────────── */
  const PORT = await freePort();
  console.log('End-to-end workflow test\n');
  console.log('  Starting server on http://127.0.0.1:' + PORT + '/ …');

  const server = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe']
  });
  const serverOut = [];
  server.stdout.on('data', (d) => serverOut.push(d.toString()));
  server.stderr.on('data', (d) => serverOut.push(d.toString()));

  const BASE = 'http://127.0.0.1:' + PORT + '/';
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) up = true;
    } catch (e) { await sleep(250); }
  }
  check('Server starts and serves the homepage', up);

  /* ── 2. HTTP behaviour ─────────────────────────────────────────── */
  const home = await fetch(BASE);
  const homeHtml = await home.text();
  check('Homepage is 200 HTML', home.status === 200 && (home.headers.get('content-type') || '').includes('text/html'));
  check('Homepage has the app title', homeHtml.includes('Indian Postcard Printer'));
  check('Responses are marked no-store (no stale caching)',
    /no-store/.test(home.headers.get('cache-control') || ''), home.headers.get('cache-control'));

  const css = await fetch(BASE + 'css/style.css');
  check('CSS served with correct type', (css.headers.get('content-type') || '').includes('text/css'));
  for (const f of ['js/layout.js', 'js/settings.js', 'js/address.js', 'js/preview.js', 'js/app.js', 'server.js']) {
    const r = await fetch(BASE + f);
    check('Serves ' + f + ' (' + r.status + ')', r.status === 200);
  }

  const notFound = await fetch(BASE + 'does-not-exist.txt');
  check('Missing file returns 404', notFound.status === 404);

  const traversal = await fetch(BASE + '..%2f..%2f..%2fwindows%2fwin.ini');
  check('Directory traversal blocked (403/404)', traversal.status === 403 || traversal.status === 404, String(traversal.status));

  const post = await fetch(BASE, { method: 'POST' });
  check('Non-GET method returns 405', post.status === 405, String(post.status));

  const serverBoundToLoopback = await new Promise((resolve) => {
    const probe = net.connect({ host: '127.0.0.1', port: PORT }, () => { probe.end(); resolve(true); });
    probe.on('error', () => resolve(false));
  });
  check('Server reachable on 127.0.0.1', serverBoundToLoopback === true);

  /* ── 3. Drive the full workflow in the browser ─────────────────── */
  const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') jsErrors.push(m.text()); });

  await page.goto(BASE);
  await page.waitForSelector('#postcard');
  await sleep(400);

  // 3a. Defaults render.
  const defaults = await page.evaluate(() => ({
    sender: document.getElementById('senderBlock').textContent,
    recipient: document.getElementById('recipientBlock').textContent,
    pin: [...document.querySelectorAll('#pinRow .pin-box')].map((b) => b.textContent).join(''),
    senderFit: document.getElementById('senderFit').textContent,
    recipientFit: document.getElementById('recipientFit').textContent,
    status: document.getElementById('status').textContent
  }));
  check('App loads ready with defaults', defaults.status.startsWith('Ready'), defaults.status);
  // No sample address ships with the app — a fresh card starts blank.
  check('Default sender is empty (no sample address)', defaults.sender === '', JSON.stringify(defaults.sender));
  check('Default recipient is empty (no sample address)', defaults.recipient === '', JSON.stringify(defaults.recipient));
  check('Default PIN boxes are empty', defaults.pin === '', defaults.pin);
  check('Both addresses fit by default', defaults.senderFit === 'Fits' && defaults.recipientFit === 'Fits');
  await page.screenshot({ path: path.join(SHOT_DIR, '01-front-defaults.png') });

  // 3a2. The panel is the scroller: with all this content the LEFT PANEL
  // must scroll inside itself while the page (and the card) stay put.
  const layout = await page.evaluate(() => {
    const doc = document.documentElement;
    const panel = document.querySelector('.panel');
    return {
      pageScroll: doc.scrollHeight - window.innerHeight,
      panelScrolls: panel.scrollHeight > panel.clientHeight,
      panelClipped: panel.getBoundingClientRect().bottom <= window.innerHeight + 1
    };
  });
  check('The whole page does NOT scroll (panel scrolls instead)',
    layout.pageScroll <= 1, 'page overflows by ' + layout.pageScroll + 'px');
  check('The control panel scrolls its own content',
    layout.panelScrolls && layout.panelClipped, JSON.stringify(layout));

  // 3b. Fill a realistic address (multi-line From entry).
  await page.fill('#sName', 'Ramesh Gupta');
  await page.fill('#sHouse', '42 Lake View Apts\nNear Shivaji Park');
  await page.fill('#sArea', 'Nagpur');
  await page.fill('#sDistrict', 'Maharashtra');
  await page.fill('#rName', 'Sunita Devi');
  await page.fill('#rHouse', '7 Park Street');
  await page.fill('#rArea', 'Shivajinagar, Nagpur');
  await page.fill('#rDistrict', 'Maharashtra');
  await page.fill('#rPin', '440001');
  await sleep(300);
  const filled = await page.evaluate(() => ({
    sender: document.getElementById('senderBlock').textContent,
    recipient: document.getElementById('recipientBlock').textContent,
    pin: [...document.querySelectorAll('#pinRow .pin-box')].map((b) => b.textContent).join('')
  }));
  check('From address updates live (multi-line too)',
    filled.sender === 'Ramesh Gupta\n42 Lake View Apts\nNear Shivaji Park\nNagpur\nMaharashtra',
    JSON.stringify(filled.sender));
  check('To address updates live',
    filled.recipient === 'Sunita Devi\n7 Park Street\nShivajinagar, Nagpur\nMaharashtra',
    JSON.stringify(filled.recipient));
  check('PIN digits update to 440001', filled.pin === '440001', filled.pin);
  await page.screenshot({ path: path.join(SHOT_DIR, '02-front-filled.png') });

  // 3c. Overflow + Fit text. Capacity is 5 lines, so the address must wrap
  // to at least 6 lines before the overflow warning can appear.
  await page.fill('#rHouse', 'Sunrise Apartments Near Water Tank Road Opposite Main Bus Stand Kondapur');
  await page.fill('#rDistrict', 'Nagpur');
  await sleep(250);
  const over = await page.evaluate(() => document.getElementById('recipientFit').textContent);
  check('Long address reports overflow', over !== 'Fits', over);
  const overChip = await page.evaluate(() => {
    const b = document.getElementById('recipientBlock');
    return { on: b.classList.contains('overflow'), msg: b.dataset.overflow || '' };
  });
  check('Card marks the lines that will NOT print',
    overChip.on && /will NOT print/.test(overChip.msg), JSON.stringify(overChip));
  await page.screenshot({ path: path.join(SHOT_DIR, '03-overflow-warning.png') });
  await page.click('#fitTextBtn');
  await sleep(300);
  const fitted = await page.evaluate(() => ({
    pt: document.getElementById('recipientFontPt').value,
    fit: document.getElementById('recipientFit').textContent,
    status: document.getElementById('status').textContent
  }));
  check('Fit text either fits the text or says it cannot',
    fitted.fit === 'Fits' || /cannot fit|shorten/.test(fitted.status),
    fitted.pt + ' pt / ' + fitted.fit + ' / ' + fitted.status);
  await page.fill('#rHouse', '7 Park Street');
  await page.fill('#rDistrict', '');
  await page.fill('#recipientFontPt', '9');
  await sleep(200);

  // 3d. Manual line override (open the <details> panel first).
  await page.click('.lines-editor summary');
  await sleep(200);
  await page.fill('#recipientLinesInput', 'Sunita Devi\n7 Park Street\nShivajinagar\nNagpur, Maharashtra');
  await sleep(250);
  const manual = await page.evaluate(() => document.getElementById('recipientBlock').textContent);
  check('Manual line override renders', manual === 'Sunita Devi\n7 Park Street\nShivajinagar\nNagpur, Maharashtra', JSON.stringify(manual));
  await page.click('#resetLinesBtn');
  await sleep(200);
  const rebuilt = await page.evaluate(() => document.getElementById('recipientBlock').textContent);
  check('Rebuild from fields restores field-based lines', rebuilt.includes('Shivajinagar, Nagpur'), JSON.stringify(rebuilt));

  // 3e. Back: message + blank state.
  await page.click('#tabBackBtn');
  await sleep(200);
  // The Back tab has its OWN Refresh button (a duplicate id once left it dead).
  const backRefreshBefore = await page.evaluate(() => document.getElementById('status').textContent);
  await page.click('#refreshBackBtn');
  await sleep(200);
  const backRefreshAfter = await page.evaluate(() => document.getElementById('status').textContent);
  check('Back tab Refresh button works',
    backRefreshAfter !== backRefreshBefore && /Preview updated/.test(backRefreshAfter),
    JSON.stringify(backRefreshBefore) + ' -> ' + JSON.stringify(backRefreshAfter));
  await page.fill('#messageInput', '');
  await sleep(200);
  const blankBack = await page.evaluate(() => document.getElementById('backMessage').textContent);
  check('Empty message prints a blank back', blankBack === '', JSON.stringify(blankBack));
  await page.fill('#messageInput', 'Dear Sunita,\nWishing you a very happy new year!');
  await sleep(250);
  const msg = await page.evaluate(() => ({
    text: document.getElementById('backMessage').textContent,
    fit: document.getElementById('messageFit').textContent
  }));
  check('Back message renders', msg.text === 'Dear Sunita,\nWishing you a very happy new year!', JSON.stringify(msg.text));
  check('Back message fits', msg.fit === 'Fits', msg.fit);
  await page.locator('#backcard').screenshot({ path: path.join(SHOT_DIR, '04-back-message.png') });

  // 3f. Back image: upload, place, crop, rotate, toggle, remove.
  await page.setInputFiles('#imageInput', IMAGE_PNG);
  await sleep(500);
  const img = await page.evaluate(() => ({
    hidden: document.getElementById('backImageCanvas').hidden,
    w: document.getElementById('imgW').value,
    printImage: document.getElementById('backImageCanvas').dataset.printImage
  }));
  check('Image uploads and renders on the back', img.hidden === false);
  await page.fill('#imgX', '30');
  await page.fill('#imgY', '28');
  await page.fill('#imgRotate', '15');
  await page.fill('#cropLeft', '25');
  await sleep(300);
  check('Image position/size/rotation/crop accepted',
    await page.evaluate(() => document.getElementById('imageFit').textContent) !== '');
  await page.click('#imagePrintToggle');
  await sleep(250);
  const printOn = await page.evaluate(() =>
    document.getElementById('backImageCanvas').dataset.printImage);
  check('Print-image toggle enables image printing', printOn === 'on', printOn);
  await page.locator('#backcard').screenshot({ path: path.join(SHOT_DIR, '05-back-with-image.png') });
  await page.click('#imageRemoveBtn');
  await sleep(250);
  check('Image can be removed',
    await page.evaluate(() => document.getElementById('backImageCanvas').hidden) === true);

  // 3g. Templates round-trip.
  await page.fill('#messageInput', 'Happy birthday! Many happy returns.');
  await page.fill('#templateName', 'Birthday');
  await page.click('#templateSaveBtn');
  await page.fill('#messageInput', '');
  await page.selectOption('#templateSelect', '0');
  await page.click('#templateApplyBtn');
  await sleep(250);
  check('Template save + insert round-trip',
    (await page.evaluate(() => document.getElementById('messageInput').value)) === 'Happy birthday! Many happy returns.');

  // Placeholder selected: Insert must NOT silently write template #0
  // (Number('') === 0) — it has to say what to do instead.
  await page.fill('#messageInput', 'KEEP THIS TEXT');
  await page.selectOption('#templateSelect', '');        // "— saved templates —"
  await page.click('#templateApplyBtn');
  await sleep(250);
  const placeholder = await page.evaluate(() => ({
    msg: document.getElementById('messageInput').value,
    status: document.getElementById('status').textContent
  }));
  check('Insert with nothing selected leaves the message alone and explains why',
    placeholder.msg === 'KEEP THIS TEXT' &&
    /Choose a template/.test(placeholder.status),
    JSON.stringify(placeholder));
  await page.click('#templateDeleteBtn');
  await sleep(200);
  const delPlaceholder = await page.evaluate(() => ({
    count: document.getElementById('templateSelect').options.length,
    status: document.getElementById('status').textContent
  }));
  check('Delete with nothing selected deletes nothing and explains why',
    delPlaceholder.count === 2 && /Choose a template/.test(delPlaceholder.status),
    JSON.stringify(delPlaceholder));

  // 3h. Print tab: side selection and page setup.
  await page.click('#tabPrintBtn');
  await sleep(200);
  const sideStates = {};
  for (const [label, sel] of [['front', '#printSideFront'], ['back', '#printSideBack'], ['both', '#printSideBoth']]) {
    await page.click(sel);
    await sleep(180);
    sideStates[label] = await page.evaluate(() => ({
      side: document.body.dataset.printSide,
      front: !document.getElementById('postcard').hidden,
      back: !document.getElementById('backcard').hidden
    }));
  }
  // 3d2. REGRESSION: a saved manual line override must never make the
  // address fields silently inert (the "only the PIN updates" bug).
  await page.click('#tabFrontBtn');
  await sleep(150);
  const linesPanelOpen = await page.evaluate(() =>
    document.querySelector('.lines-editor').open);
  if (!linesPanelOpen) {
    await page.click('.lines-editor summary');
    await sleep(150);
  }
  await page.fill('#senderLinesInput', 'Stale Manual Line One\nStale Manual Line Two');
  await sleep(250);
  const overrideState = await page.evaluate(() => ({
    block: document.getElementById('senderBlock').textContent,
    badgeShown: !document.getElementById('overrideBadge').hidden
  }));
  check('Regression: manual override shows its badge',
    overrideState.badgeShown === true, JSON.stringify(overrideState));
  check('Regression: override renders from the manual lines',
    overrideState.block.includes('Stale Manual Line'), JSON.stringify(overrideState.block));

  await page.fill('#sName', 'Fields Are Back');
  await sleep(300);
  const clearedState = await page.evaluate(() => ({
    block: document.getElementById('senderBlock').textContent,
    badgeHidden: document.getElementById('overrideBadge').hidden,
    linesInput: document.getElementById('senderLinesInput').value
  }));
  check('Regression: editing a field clears the override',
    clearedState.badgeHidden === true && clearedState.linesInput === '',
    JSON.stringify(clearedState));
  check('Regression: preview updates from fields after clearing',
    clearedState.block.includes('Fields Are Back'), JSON.stringify(clearedState.block));

  // Return to the Print tab for the side-selection checks.
  await page.click('#tabPrintBtn');
  await sleep(150);

  check('Print tab Front selects the front', sideStates.front.side === 'front' && sideStates.front.front && !sideStates.front.back, JSON.stringify(sideStates.front));
  check('Print tab Back selects the back', sideStates.back.side === 'back' && sideStates.back.back && !sideStates.back.front, JSON.stringify(sideStates.back));
  check('Print tab Both selects both', sideStates.both.side === 'both' && sideStates.both.front && sideStates.both.back, JSON.stringify(sideStates.both));
  await page.click('#printSideFront');
  await sleep(150);

  // 3i. All three print modes — screenshots taken in PRINT media so they
  // show exactly what the printer receives (not the on-screen preview).
  for (const [label, sel, asset] of [
    ['card', '#printModeCard', '06-print-card.png'],
    ['overlay', '#printModeOverlay', '07-print-overlay.png'],
    ['calibration', '#printModeCalibration', '08-print-calibration.png']
  ]) {
    await page.click(sel);
    await sleep(150);
    await page.emulateMedia({ media: 'print' });
    await sleep(250);
    await page.locator('#' + (label === 'calibration' ? 'calibSheet' : 'postcard'))
      .screenshot({ path: path.join(SHOT_DIR, asset) });
    await page.emulateMedia({ media: 'screen' });
    await sleep(150);
  }
  // Back to a card-printing mode before the print-output measurements.
  await page.click('#printModeOverlay');
  await sleep(200);
  await page.emulateMedia({ media: 'print' });
  await sleep(250);
  const printState = await page.evaluate(() => {
    const card = document.getElementById('postcard');
    const cs = getComputedStyle(card);
    const sheet = document.getElementById('calibSheet');
    return {
      cardW: card.offsetWidth,
      cardH: card.offsetHeight,
      transform: cs.transform,
      shadow: cs.boxShadow,
      header: getComputedStyle(document.querySelector('body > header')).display,
      panel: getComputedStyle(document.querySelector('.panel')).display,
      sheetVisible: getComputedStyle(sheet).display !== 'none',
      mode: document.body.dataset.printMode,
      side: document.body.dataset.printSide
    };
  });
  const pxW = 143 * 96 / 25.4, pxH = 93 * 96 / 25.4;
  check('Print: card is exactly 143 x 93 mm',
    Math.abs(printState.cardW - pxW) < 2 && Math.abs(printState.cardH - pxH) < 2,
    printState.cardW + 'x' + printState.cardH);
  check('Print: no preview transform', printState.transform === 'none', printState.transform);
  check('Print: no shadow', printState.shadow === 'none', printState.shadow);
  check('Print: UI hidden', printState.header === 'none' && printState.panel === 'none');
  check('Print: calibration marks hidden in card mode', printState.sheetVisible === false);
  await page.emulateMedia({ media: 'screen' });

  // Calibration marks visible only in calibration mode.
  await page.click('#printModeCalibration');
  await sleep(150);
  await page.emulateMedia({ media: 'print' });
  await sleep(200);
  const calib = await page.evaluate(() => {
    const mm = (el) => { const r = el.getBoundingClientRect(); return { w: r.width * 25.4 / 96, h: r.height * 25.4 / 96 }; };
    return {
      sheet: getComputedStyle(document.getElementById('calibSheet')).display !== 'none',
      h: mm(document.querySelector('.calib-hline')).w,
      v: mm(document.querySelector('.calib-vline')).h,
      rect: mm(document.querySelector('.calib-rect'))
    };
  });
  check('Calibration: sheet shows only in calibration mode', calib.sheet === true);
  check('Calibration: 100 mm horizontal line', Math.abs(calib.h - 100) < 1, round(calib.h));
  check('Calibration: 50 mm vertical line', Math.abs(calib.v - 50) < 1, round(calib.v));
  check('Calibration: 143 x 93 mm rectangle',
    Math.abs(calib.rect.w - 143) < 1 && Math.abs(calib.rect.h - 93) < 1,
    round(calib.rect.w) + 'x' + round(calib.rect.h));
  await page.emulateMedia({ media: 'screen' });
  await page.click('#printModeOverlay');
  await sleep(150);

  const pageRule = await page.evaluate(() =>
    document.getElementById('printPageRule').textContent.trim());
  check('Overlay mode requests the printer\'s own paper (no scaling)',
    /auto/.test(pageRule), pageRule);

  // 3i-b. Printing the back must show the tray-placement popup first, and the
  // From address gets "Template 1" (🇮🇳 + From) with one click, toggle off again.
  await page.evaluate(() => {
    window.__prints = 0;
    window.print = () => { window.__prints += 1; };
  });
  let trayMode = 'dismiss';
  const trayDialogs = [];
  page.on('dialog', async (d) => {
    if (/TRAY PLACEMENT/.test(d.message())) {
      trayDialogs.push(d.message());
      if (trayMode === 'accept') await d.accept(); else await d.dismiss();
    } else {
      await d.dismiss();   // same as Playwright's default for every other confirm
    }
  });

  await page.click('#printSideBack');
  await page.click('#printBtn');            // first use: instructions panel
  await sleep(150);
  check('First Print click shows the instruction panel, not a dialog',
    (await page.evaluate(() => document.getElementById('printHelp').hidden)) === false);
  await page.click('#printNowBtn');
  await sleep(400);
  check('Back print opens the tray-placement popup',
    trayDialogs.length === 1 && /BLANK side facing UP/.test(trayDialogs[0]),
    JSON.stringify(trayDialogs[0] || null));
  const afterDismiss = await page.evaluate(() => ({
    prints: window.__prints,
    status: document.getElementById('status').textContent
  }));
  check('Dismissing the popup cancels the print',
    afterDismiss.prints === 0 && /cancelled/i.test(afterDismiss.status),
    afterDismiss.prints + ' / ' + afterDismiss.status);

  trayMode = 'accept';
  await page.click('#printBtn');            // help already seen -> direct print
  await sleep(300);
  const acceptedPrints = await page.evaluate(() => window.__prints);
  check('Accepting the popup prints', acceptedPrints === 1, String(acceptedPrints));

  await page.click('#printSideFront');
  await page.click('#printBtn');            // front side: no popup
  await sleep(300);
  const frontPrints = await page.evaluate(() => window.__prints);
  check('Front print needs no popup and goes straight through',
    frontPrints === 2 && trayDialogs.length === 2,
    frontPrints + ' prints / ' + trayDialogs.length + ' popups');

  // Template 1 for the From address.
  await page.click('#tabFrontBtn');
  await sleep(150);
  const stripNl = (s) => s.replace(/\n+$/, '');
  const tplBefore = await page.evaluate(() => document.getElementById('senderBlock').textContent);
  const tplLines = stripNl(tplBefore) === '' ? [] : stripNl(tplBefore).split('\n');
  await page.click('#sTemplateBtn');
  const tplAfter = await page.evaluate(() => document.getElementById('senderBlock').textContent);
  check('Template 1: prints the flag then "From" as the first two lines',
    stripNl(tplAfter).startsWith('🇮🇳\nFrom'),
    JSON.stringify(stripNl(tplAfter).slice(0, 40)));
  check('Template 1: keeps the address below it',
    stripNl(tplAfter) === ['🇮🇳', 'From'].concat(tplLines).join('\n'),
    JSON.stringify(stripNl(tplAfter)));
  const tplFlag = await page.evaluate(() => ({
    svg: !!document.querySelector('#senderBlock .flag-line .flag-glyph'),
    bands: document.querySelectorAll('#senderBlock .flag-glyph rect').length,
    chakra: document.querySelectorAll('#senderBlock .flag-glyph circle').length,
    emoji: (document.querySelector('#senderBlock .flag-line') || {}).textContent
  }));
  check('Template 1: flag draws as a vector (tricolour + chakra, not the letters IN)',
    tplFlag.svg && tplFlag.bands === 3 && tplFlag.chakra >= 1, JSON.stringify(tplFlag));
  check('Template 1: emoji text is kept so the value still round-trips',
    !!tplFlag.emoji && tplFlag.emoji.includes('\u{1F1EE}\u{1F1F3}'),
    JSON.stringify(tplFlag.emoji));
  await page.click('#sTemplateBtn');
  const tplRestored = await page.evaluate(() => ({
    text: document.getElementById('senderBlock').textContent,
    img: !!document.querySelector('#senderBlock .in-flag img')
  }));
  check('Template 1: second click removes it and restores the address',
    stripNl(tplRestored.text) === stripNl(tplBefore) && !tplRestored.img,
    JSON.stringify(tplRestored));

  // 3i. Flag size: click the 🇮🇳 on the card, change its size, card follows.
  await page.click('#sTemplateBtn');                 // Template 1 back on
  await sleep(150);
  const flagClick = await page.evaluate(() => {
    const f = document.querySelector('#senderBlock .flag-line');
    if (!f) return { found: false };
    f.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    f.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return {
      found: true,
      focused: document.activeElement && document.activeElement.id,
      pt: f.style.fontSize
    };
  });
  check('Flag line renders on the card as its own sized span',
    flagClick.found && flagClick.pt === '16pt', JSON.stringify(flagClick));
  check('Clicking the flag puts focus in the Flag (pt) field',
    flagClick.focused === 'flagFontPt', String(flagClick.focused));
  await page.fill('#flagFontPt', '24');
  await sleep(200);
  const flagSized = await page.evaluate(() => ({
    pt: document.querySelector('#senderBlock .flag-line').style.fontSize,
    // The flag grows alone; the From/address lines keep the sender font.
    addr: document.getElementById('senderFontPt').value
  }));
  check('Flag size change re-renders the flag at the new size',
    flagSized.pt === '24pt' && flagSized.addr !== '24',
    JSON.stringify(flagSized));

  // 3j. On-card editing: type straight onto the To address, it takes over.
  const ocardBefore = await page.evaluate(() => ({
    lines: document.getElementById('recipientLinesInput').value
  }));
  await page.click('#recipientBlock');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('ON CARD LINE 1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('ON CARD LINE 2');
  await page.click('#sName');                        // blur the block
  await sleep(250);
  const ocard = await page.evaluate(() => ({
    lines: document.getElementById('recipientLinesInput').value,
    card: document.getElementById('recipientBlock').innerText.trim(),
    badge: document.getElementById('overrideBadge').hidden,
    status: document.getElementById('status').textContent
  }));
  check('Editing on the card writes the lines back to the manual lines box',
    ocard.lines.indexOf('ON CARD LINE 1') >= 0, JSON.stringify(ocard.lines));
  check('The card shows what was typed on the card',
    ocard.card.indexOf('ON CARD LINE 1') === 0, JSON.stringify(ocard.card));
  check('On-card edit marks the manual override as active',
    ocard.badge === false, 'badge hidden=' + ocard.badge);

  // 3k. mm rulers exist on the card border and on the calibration sheet.
  const rulers = await page.evaluate(() => {
    const c = document.getElementById('cardRuler');
    const b = document.getElementById('calibRuler');
    return {
      card: c ? c.querySelectorAll('.ruler-tick').length : -1,
      cardLabels: c ? c.querySelectorAll('.ruler-label').length : -1,
      calib: b ? b.querySelectorAll('.ruler-tick').length : -1
    };
  });
  // 144 horizontal ticks + 94 vertical ticks per ruler (both edges, 0..W/H).
  check('Card ruler draws a tick for every millimetre on both edges',
    rulers.card === 144 + 94, String(rulers.card));
  check('Card ruler labels every 10 mm',
    rulers.cardLabels === 15 + 10, String(rulers.cardLabels));
  check('Calibration sheet carries the same mm ruler',
    rulers.calib === 144 + 94, String(rulers.calib));

  // 3k2. New this round: 5-line capacity, typeable PIN, real flag emoji,
  // and the bold/italic/underline toggles for BOTH addresses.
  await page.fill('#rName', 'Five Line Test');
  await page.fill('#rHouse', 'Line two\nLine three\nLine four');
  await page.fill('#rArea', 'Line five');
  await page.fill('#rDistrict', '');
  await sleep(250);
  const five = await page.evaluate(() => ({
    fit: document.getElementById('recipientFit').textContent,
    needed: document.getElementById('recipientBlock').dataset.neededLines,
    capacity: document.getElementById('recipientBlock').dataset.capacityLines,
    rules: document.querySelectorAll('#ruledLines .ruled-line').length
  }));
  check('Card accepts 5 printed lines (capacity 5, still 4 rules)',
    five.fit === 'Fits' && five.needed === '5' && five.capacity === '5' && five.rules === 4,
    JSON.stringify(five));

  // PIN boxes on the card take digits straight from the keyboard.
  await page.fill('#rPin', '');              // start empty, like a fresh card
  await page.evaluate(() => document.getElementById('pinRow').focus());
  await page.keyboard.type('44');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('400011x');   // the 'x' must never get in
  await sleep(250);
  const pinCard = await page.evaluate(() => ({
    field: document.getElementById('rPin').value,
    boxes: [...document.querySelectorAll('#pinRow .pin-box')].map((b) => b.textContent).join('')
  }));
  check('Typing on the card fills the PIN boxes and the form field',
    pinCard.boxes === '440001' && pinCard.field === '440001', JSON.stringify(pinCard));

  // The flag must render as a real emoji font, not the letters "IN".
  const flagFont = await page.evaluate(() => {
    const f = document.querySelector('#senderBlock .flag-line');
    return f ? getComputedStyle(f).fontFamily : '';
  });
  check('Flag line uses an emoji font (real 🇮🇳, not the letters IN)',
    /Segoe UI Emoji|Noto Color Emoji|Apple Color Emoji/.test(flagFont), flagFont);

  // Bold / italic / underline: one set, applied to From AND To.
  for (const [id, prop, want] of [['fontBold', 'fontWeight', '700'],
                                  ['fontItalic', 'fontStyle', 'italic'],
                                  ['fontUnderline', 'textDecorationLine', 'underline']]) {
    await page.click('#' + id + ' + span');
    await sleep(150);
    const styled = await page.evaluate((p) => {
      const s = (id) => getComputedStyle(document.getElementById(id))[p];
      return { sender: s('senderBlock'), recipient: s('recipientBlock') };
    }, prop);
    const on = styled.sender.indexOf(want) >= 0 && styled.recipient.indexOf(want) >= 0;
    check('Toggle ' + id + ' styles both addresses', on, JSON.stringify(styled));
    await page.click('#' + id + ' + span');   // off again
    await sleep(100);
  }

  // 3j. Actual size + guides.
  await page.click('#tabFrontBtn');
  await sleep(150);
  await page.click('#actualBtn');
  await sleep(250);
  const actual = await page.evaluate(() => ({
    w: document.getElementById('postcard').offsetWidth,
    btn: document.getElementById('actualBtn').textContent
  }));
  check('Actual size renders 1:1 (143 mm)',
    Math.abs(actual.w - pxW) < 2, round(actual.w) + ' px, button=' + actual.btn);
  await page.click('#guidesBtn');
  await sleep(200);
  check('Calibration guides can be shown',
    (await page.evaluate(() => document.getElementById('cardGuides').hidden)) === false);
  await page.screenshot({ path: path.join(SHOT_DIR, '09-actual-size-guides.png') });
  await page.click('#guidesBtn');
  await page.click('#actualBtn');
  await sleep(200);

  // 3k. Settings persistence + clear.
  await page.fill('#sName', 'Persist Test');
  await page.click('#saveBtn');
  await sleep(200);
  await page.reload();
  await page.waitForSelector('#postcard');
  await sleep(500);
  const persisted = await page.evaluate(() => document.getElementById('sName').value);
  check('Settings persist after reload', persisted === 'Persist Test', persisted);
  await page.click('#tabPrintBtn');
  await page.click('#clearDataBtn');
  await sleep(200);
  await page.reload();
  await page.waitForSelector('#postcard');
  await sleep(500);
  const cleared = await page.evaluate(() => document.getElementById('sName').value);
  check('Clear saved data restores empty defaults', cleared === '', JSON.stringify(cleared));

  // 3l. Export / import.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#tabFrontBtn').then(() => page.click('#exportBtn'))
  ]);
  const exportPath = path.join(os.tmpdir(), 'e2e-export.json');
  await download.saveAs(exportPath);
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  check('Export produces a valid settings JSON',
    !!exported.sender && typeof exported.sender.name === 'string' && !JSON.stringify(exported).includes('base64'),
    Object.keys(exported).slice(0, 6).join(','));
  await page.setInputFiles('#importFile', exportPath);
  await sleep(400);
  check('Import restores settings without error',
    (await page.evaluate(() => document.getElementById('status').textContent)).includes('imported'));

  check('No JavaScript errors during the whole workflow', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));

  await page.screenshot({ path: path.join(SHOT_DIR, '10-final-front.png') });
  await browser.close();
  server.kill();
  await sleep(300);
  check('Server stops cleanly', true);

  /* ── Report ─────────────────────────────────────────────────────── */
  console.log('\n' + '='.repeat(60));
  console.log('E2E RESULT: ' + passed + ' passed, ' + failed + ' failed');
  console.log('Screenshots: ' + SHOT_DIR);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  console.log('='.repeat(60));
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('E2E test could not run:', err.message);
  process.exit(1);
});
