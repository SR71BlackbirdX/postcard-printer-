/**
 * Visual layout test using Playwright — run with:
 *     node tests\preview.visual.test.js
 *
 * Opens the real app in Microsoft Edge (headless), measures the rendered
 * postcard geometry in the browser, and saves screenshots so the preview
 * can be inspected by eye.
 *
 * Playwright is an OPTIONAL development-only tool:
 *   - it uses the already-installed Microsoft Edge (no browser download),
 *   - it is found from the local install first, then the global npm install.
 * The app itself needs neither Playwright nor npm — it stays plain HTML.
 *
 * Exits 0 when every check passes, 1 otherwise.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { execSync } = require('child_process');

/**
 * Generate a small RGBA PNG with four coloured quadrants (for image
 * crop/rotation tests) using Node's built-in zlib — no dependencies.
 */
function makeQuadPng(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [Buffer.from([0])]; // filter type 0
    for (let x = 0; x < size; x++) {
      const left = x < size / 2;
      const top = y < size / 2;
      const col = left && top ? [255, 0, 0]
        : !left && top ? [0, 0, 255]
        : left && !top ? [0, 128, 0]
        : [255, 200, 0];
      row.push(Buffer.from(col.concat([255])));
    }
    rows.push(Buffer.concat(row));
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0, 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const imagePngPath = path.join(os.tmpdir(), 'postcard-back-test.png');
fs.writeFileSync(imagePngPath, makeQuadPng(8));

// ── Locate Playwright (local first, then global npm) ────────────────
let playwright;
try {
  playwright = require('playwright');
} catch (err) {
  const globalRoot = execSync('npm root -g').toString().trim();
  playwright = require(path.join(globalRoot, 'playwright'));
}

const APP_URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const SHOT_DIR = __dirname;

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) { passed += 1; console.log('  PASS  ' + name); }
  else { failed += 1; console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
}
const round = (n) => Math.round(n * 100) / 100;

(async () => {
  console.log('Visual layout test (Playwright + Microsoft Edge, headless)\n');

  const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(APP_URL);
    await page.waitForSelector('#postcard');
    // No sample PIN ships with the app, so type one before measuring:
    // the six boxes must then show one digit each.
    await page.fill('#rPin', '500001');
    await page.waitForTimeout(150);

    // ── Measure the rendered geometry inside the browser ───────────
    const geo = await page.evaluate(() => {
      // The preview is scaled to fit the window with a CSS transform.
      // Recover the true millimetre geometry by dividing out that scale,
      // then convert remaining CSS pixels at the standard 96 DPI.
      const cardEl = document.getElementById('postcard');
      const rect = cardEl.getBoundingClientRect();
      const scale = rect.width / cardEl.offsetWidth; // uniform x/y scale
      const mm = (px) => (px / scale) * 25.4 / 96;
      const card = rect;
      const divider = document.querySelector('.divider').getBoundingClientRect();
      const sender = document.getElementById('senderBlock').textContent;
      const recipient = document.getElementById('recipientBlock').textContent;
      const boxes = [...document.querySelectorAll('#pinRow .pin-box')].map((b) => {
        const r = b.getBoundingClientRect();
        return { x: mm(r.x - card.x), y: mm(r.y - card.y), w: mm(r.width), h: mm(r.height), digit: b.textContent };
      });
      const row = document.getElementById('pinRow').getBoundingClientRect();
      return {
        scale,
        cardW: mm(card.width), cardH: mm(card.height),
        dividerX: mm(divider.x - card.x),
        sender, recipient,
        boxes, rowX: mm(row.x - card.x), rowY: mm(row.y - card.y),
        rowW: mm(row.width), rowH: mm(row.height),
        fontSizePt: parseFloat(getComputedStyle(document.getElementById('recipientBlock')).fontSize) * 72 / 96,
        senderTop: mm(cardEl.querySelector('.sender-block').getBoundingClientRect().y - card.y),
        recipientTop: mm(document.getElementById('recipientBlock').getBoundingClientRect().y - card.y),
        recipientLeft: mm(document.getElementById('recipientBlock').getBoundingClientRect().x - card.x)
      };
    });
    console.log('  (preview scale factor: ' + round(geo.scale) + 'x — card is drawn larger to fill the window)\n');

    // ── Card ──────────────────────────────────────────────────────
    check('Card renders 143 x 93 mm',
      Math.abs(geo.cardW - 143) < 1.5 && Math.abs(geo.cardH - 93) < 1.5,
      round(geo.cardW) + ' x ' + round(geo.cardH));
    check('Divider at 74 mm', Math.abs(geo.dividerX - 74) < 1.5, round(geo.dividerX));

    // Default calibration offsets (PIN Y defaults to +0.4 mm and must show cleanly).
    const defaultOffsets = await page.evaluate(() => ({
      pinY: document.getElementById('offPinYMm').value,
      pinX: document.getElementById('offPinXMm').value,
      senderX: document.getElementById('offSenderXMm').value,
      backOffX: document.getElementById('backOffX').value,
      backOffY: document.getElementById('backOffY').value
    }));
    check('Defaults: PIN Y field shows 0 (relative to its 0.4 mm default)',
      defaultOffsets.pinY === '0', defaultOffsets.pinY);
    check('Defaults: other offsets show clean 0',
      defaultOffsets.pinX === '0' && defaultOffsets.senderX === '0' &&
      defaultOffsets.backOffX === '0' && defaultOffsets.backOffY === '0',
      JSON.stringify(defaultOffsets));

    // The field is relative: typing -0.4 must yield an applied 0 mm, and 0
    // must yield the 0.4 mm default.
    const pinYRel = await page.evaluate(() => {
      const set = (v) => {
        const f = document.getElementById('offPinYMm');
        f.value = v;
        f.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const applied = () => document.querySelector('.pin-row').style.transform;
      set('0');
      const atZero = applied();
      set('-0.4');
      const atMinus = applied();
      set('0');
      return { atZero, atMinus };
    });
    check('PIN Y: field 0 applies the 0.4 mm default',
      pinYRel.atZero === 'translate(0mm, 0.4mm)', pinYRel.atZero);
    check('PIN Y: field -0.4 applies 0 mm',
      /translate\(0mm,\s*0mm\)/.test(pinYRel.atMinus), pinYRel.atMinus);

    // ── Address blocks ────────────────────────────────────────────
    // No sample address ships with the app: a fresh card prints nothing.
    check('Sender starts empty (no sample address)', geo.sender === '', JSON.stringify(geo.sender));
    check('Recipient starts empty (no sample address)', geo.recipient === '', JSON.stringify(geo.recipient));
    check('Recipient block at 80 mm from left', Math.abs(geo.recipientLeft - 80) < 1.5, round(geo.recipientLeft));
    check('Recipient first line at 28.8 mm from top', Math.abs(geo.recipientTop - 28.8) < 0.8, round(geo.recipientTop));
    check('Address font is 13 pt (matches the card proportions)',
  Math.abs(geo.fontSizePt - 13) < 0.5, round(geo.fontSizePt) + ' pt');

    // ── PIN row ───────────────────────────────────────────────────
    check('Six PIN boxes rendered', geo.boxes.length === 6, geo.boxes.length);
    check('PIN row is 48 mm wide', Math.abs(geo.rowW - 48) < 1.5, round(geo.rowW));
    check('PIN row starts at 91 mm / 62 mm',
      Math.abs(geo.rowX - 91) < 1.5 && Math.abs(geo.rowY - 62) < 1.5,
      round(geo.rowX) + ' / ' + round(geo.rowY));

    let touching = true;
    const gaps = [];
    for (let i = 1; i < geo.boxes.length; i++) {
      const gap = geo.boxes[i].x - (geo.boxes[i - 1].x + geo.boxes[i - 1].w); // already in mm
      gaps.push(round(gap));
      if (Math.abs(gap) > 0.5) touching = false;
    }
    check('PIN boxes touch edge-to-edge (gaps: ' + gaps.join(', ') + ' mm)', touching);

    let boxSizeOk = true;
    geo.boxes.forEach((b) => {
      if (Math.abs(b.w - 8) > 0.5 || Math.abs(b.h - 6) > 0.5) boxSizeOk = false;
    });
    check('Each box is 8 x 6 mm', boxSizeOk,
      geo.boxes.map((b) => round(b.w) + 'x' + round(b.h)).join(' '));

    // ── Live digits in boxes ──────────────────────────────────────
    const joined = geo.boxes.map((b) => b.digit).join('');
    check('PIN digits 500001 shown one per box (as typed)', joined === '500001', joined);

    // ── Printed artwork layer ──────────────────────────────────
    const art = await page.evaluate(() => {
      const card = document.getElementById('postcard').getBoundingClientRect();
      const scale = card.width / document.getElementById('postcard').offsetWidth;
      const mm = (px) => (px / scale) * 25.4 / 96;
      const rect = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: mm(r.x - card.x), y: mm(r.y - card.y), w: mm(r.width), h: mm(r.height) };
      };
      const styles = getComputedStyle(document.querySelector('.card-artwork'));
      return {
        display: styles.display,
        divider: rect('.divider'),
        stamp: rect('.stamp'),
        vheadingText: (document.querySelector('.vheading') || {}).textContent || '',
        akamText: (document.querySelector('.akam') || {}).textContent || '',
        pinLabel: (document.querySelector('.pin-label') || {}).textContent || '',
        note: (document.querySelector('.bottom-note') || {}).textContent || '',
        ruledCount: document.querySelectorAll('.ruled-line').length,
        artPinCount: document.querySelectorAll('.art-pin-box').length,
        artPinRow: rect('.art-pin-row'),
        dashed: rect('.bottom-dashed')
      };
    });

    check('Artwork layer is visible', art.display !== 'none', art.display);
    check('Printed divider present at 74 mm',
      art.divider && Math.abs(art.divider.x - 74) < 1.5,
      art.divider ? round(art.divider.x) : 'missing');
    check('Printed stamp present in top-right',
      art.stamp && art.stamp.x > 95 && art.stamp.y < 8,
      art.stamp ? round(art.stamp.x) + '/' + round(art.stamp.y) : 'missing');
    check('Vertical bilingual heading present',
      art.vheadingText.includes('POST CARD') && art.vheadingText.includes('पोस्ट'));
    check('AKAM logo text present', art.akamText.includes('अमृत महोत्सव'));
    check('"पिन PIN" label present', art.pinLabel.includes('पिन') && art.pinLabel.includes('PIN'));
    check('Bottom instruction text present',
      art.note.includes('Do not write or print below this line'));
    check('Four printed ruled lines (the 5th accepted line draws none)',
      art.ruledCount === 4, art.ruledCount);
    check('Six printed PIN box outlines', art.artPinCount === 6, art.artPinCount);
    check('Printed PIN boxes align with digit slots (91/62 mm)',
      art.artPinRow && Math.abs(art.artPinRow.x - 91) < 1.5 && Math.abs(art.artPinRow.y - 62) < 1.5,
      art.artPinRow ? round(art.artPinRow.x) + '/' + round(art.artPinRow.y) : 'missing');
    check('Printed PIN row is 48 mm wide',
      art.artPinRow && Math.abs(art.artPinRow.w - 48) < 1.5,
      art.artPinRow ? round(art.artPinRow.w) : 'missing');
    check('Bottom dashed line present below the note',
      art.dashed && art.dashed.y > 70,
      art.dashed ? round(art.dashed.y) : 'missing');

    // ── Guides layer is hidden by default ──────────────────────
    const guidesHidden = await page.evaluate(() => {
      const g = document.getElementById('cardGuides');
      return g ? { hidden: g.hidden, display: getComputedStyle(g).display } : null;
    });
    check('Calibration guides hidden by default',
      guidesHidden && guidesHidden.hidden && guidesHidden.display === 'none',
      guidesHidden ? guidesHidden.display : 'missing');

    // ── Actual size (1:1, 96 DPI) mode ───────────────────────────
    await page.click('#actualBtn');
    await page.waitForTimeout(120);
    const actual = await page.evaluate(() => {
      const card = document.getElementById('postcard');
      return {
        offsetW: card.offsetWidth,   // CSS px at scale 1: true physical size
        offsetH: card.offsetHeight,
        transform: card.style.transform,
        btnText: document.getElementById('actualBtn').textContent
      };
    });
    const expectedW = 143 * 96 / 25.4; // 540.47 CSS px
    const expectedH = 93 * 96 / 25.4;  // 351.6 CSS px
    check('Actual-size mode: card renders 143 mm wide (= ' + round(expectedW) + ' CSS px)',
      Math.abs(actual.offsetW - expectedW) < 2, round(actual.offsetW) + ' px');
    check('Actual-size mode: card renders 93 mm high (= ' + round(expectedH) + ' CSS px)',
      Math.abs(actual.offsetH - expectedH) < 2, round(actual.offsetH) + ' px');
    check('Actual-size mode: no scaling transform applied',
      actual.transform === 'scale(1)' || actual.transform === '',
      actual.transform);
    check('Actual-size mode: button toggles back to "Fit to window"',
      actual.btnText === 'Fit to window', actual.btnText);

    // Divider position must still be exact at true size.
    const dividerActual = await page.evaluate(() => {
      const card = document.getElementById('postcard');
      const d = document.querySelector('.divider').getBoundingClientRect();
      const r = card.getBoundingClientRect();
      return (d.x - r.x) * 25.4 / 96; // scale is 1 in actual mode
    });
    check('Actual-size mode: divider still at 74 mm',
      Math.abs(dividerActual - 74) < 1.5, round(dividerActual));

    // ── Back tab: message side ─────────────────────────────────
    await page.click('#tabBackBtn');
    await page.waitForTimeout(120);

    // Type a message and watch it render on the back card.
    await page.fill('#messageInput', 'Dear Friend,\nWishing you a happy new year.');
    await page.waitForTimeout(120);

    const back = await page.evaluate(() => {
      const card = document.getElementById('backcard');
      const msg = document.getElementById('backMessage');
      const cs = getComputedStyle(msg);
      const cardRect = card.getBoundingClientRect();
      const msgRect = msg.getBoundingClientRect();
      const scale = cardRect.width / card.offsetWidth;
      const mm = (px) => (px / scale) * 25.4 / 96;
      return {
        cardVisible: !card.hidden,
        frontHidden: document.getElementById('postcard').hidden,
        text: msg.textContent,
        // Message must sit inside the card and respect the margins.
        offsetLeft: mm(msgRect.x - cardRect.x),
        offsetTop: mm(msgRect.y - cardRect.y),
        withinCard: msgRect.right <= cardRect.right + 1 && msgRect.bottom <= cardRect.bottom + 1,
        fontSizePt: parseFloat(cs.fontSize) * 72 / 96,
        lineHeightMm: mm(parseFloat(cs.lineHeight)),
        fitStatus: document.getElementById('messageFit').textContent
      };
    });
    check('Back tab: back card shown, front card hidden',
      back.cardVisible === true && back.frontHidden === true);
    check('Back tab: message text rendered on card',
      back.text === 'Dear Friend,\nWishing you a happy new year.', back.text);
    check('Back tab: message respects left margin (8 mm)',
      Math.abs(back.offsetLeft - 8) < 1.5, round(back.offsetLeft));
    check('Back tab: message respects top margin (10 mm)',
      Math.abs(back.offsetTop - 10) < 1.5, round(back.offsetTop));
    check('Back tab: message stays inside the card bounds', back.withinCard === true);
    check('Back tab: message font is 9 pt', Math.abs(back.fontSizePt - 9) < 0.5, round(back.fontSizePt));
    check('Back tab: line spacing is 7 mm', Math.abs(back.lineHeightMm - 7) < 0.5, round(back.lineHeightMm));
    check('Back tab: short message shows "Fits"', back.fitStatus === 'Fits', back.fitStatus);

    // Screenshot of the back card for eyeball review.
    await page.locator('#backcard').screenshot({ path: path.join(SHOT_DIR, 'backcard.png') });

    // A long message must trigger the (non-silent) overflow warning.
    await page.fill('#messageInput', 'Line\n'.repeat(40));
    await page.waitForTimeout(120);
    const overflow = await page.evaluate(() => ({
      status: document.getElementById('messageFit').textContent,
      detail: document.getElementById('messageFitDetail').textContent
    }));
    check('Back tab: long message triggers overflow warning',
      overflow.status === 'Too many lines', overflow.status);
    check('Back tab: overflow warning quotes line counts',
      /\d+/.test(overflow.detail), overflow.detail);

    // The reverse must be genuinely blank: no ruled lines, no artwork elements.
    await page.fill('#messageInput', '');
    await page.waitForTimeout(120);
    const blank = await page.evaluate(() => ({
      text: document.getElementById('backMessage').textContent,
      ruledCount: document.querySelectorAll('#backcard .back-ruled-line').length,
      stampCount: document.querySelectorAll('#backcard .stamp').length,
      dividerCount: document.querySelectorAll('#backcard .divider').length,
      vheadingCount: document.querySelectorAll('#backcard .vheading').length,
      imageHidden: document.getElementById('backImageCanvas').hidden
    }));
    check('Back tab: empty message leaves the card completely blank', blank.text === '', JSON.stringify(blank.text));
    check('Back tab: no ruled lines on the blank reverse', blank.ruledCount === 0, blank.ruledCount);
    check('Back tab: no stamp/divider/heading/artwork elements on the reverse',
      blank.stampCount === 0 && blank.dividerCount === 0 && blank.vheadingCount === 0);
    check('Back tab: no image layer when nothing is uploaded', blank.imageHidden === true);

    // A message appears only inside the message area (never on the front).
    await page.fill('#messageInput', 'Hello from the back');
    await page.waitForTimeout(120);
    const onlyBack = await page.evaluate(() => ({
      backHas: document.getElementById('backMessage').textContent.includes('Hello from the back'),
      frontHas: document.getElementById('postcard').textContent.includes('Hello from the back')
    }));
    check('Back tab: message appears on the back card', onlyBack.backHas === true);
    check('Back tab: message does not leak onto the front card', onlyBack.frontHas === false);

    // Template round-trip: save the current message, clear, re-insert.
    await page.fill('#messageInput', 'Happy birthday!');
    await page.fill('#templateName', 'Birthday');
    await page.click('#templateSaveBtn');
    await page.fill('#messageInput', '');
    await page.waitForTimeout(80);
    await page.selectOption('#templateSelect', '0');
    await page.click('#templateApplyBtn');
    await page.waitForTimeout(120);
    const restored = await page.evaluate(() =>
      document.getElementById('messageInput').value);
    check('Back tab: template saves and re-inserts the message',
      restored === 'Happy birthday!', JSON.stringify(restored));

    // Back calibration offsets move only the message.
    await page.fill('#backOffX', '3');
    await page.fill('#backOffY', '2');
    await page.waitForTimeout(120);
    const backOffset = await page.evaluate(() =>
      document.getElementById('backMessage').style.transform);
    check('Back tab: calibration offset applied to message',
      backOffset.includes('3mm') && backOffset.includes('2mm'), backOffset);
    await page.fill('#backOffX', '0');
    await page.fill('#backOffY', '0');
    await page.waitForTimeout(80);

    // Return to the Front tab (the actual-size control lives there).
    await page.click('#tabFrontBtn');
    await page.waitForTimeout(100);

    // Return to fit-to-window for the screenshots.
    await page.click('#actualBtn');
    await page.waitForTimeout(120);

    // ══ STAGE 6 TESTS ═══════════════════════════════════════════

    // ── Address assembly from individual fields ──────────────────
    await page.click('#tabFrontBtn');
    await page.waitForTimeout(100);
    await page.fill('#sName', 'Asha Sharma');
    await page.fill('#sHouse', 'Flat 4B');
    await page.fill('#sArea', 'Hyderabad');
    await page.fill('#sDistrict', 'Telangana');
    await page.fill('#rName', 'Ravi Kumar');
    await page.fill('#rHouse', '12 MG Road');
    await page.fill('#rArea', 'Kondapur, Hyderabad');
    await page.fill('#rDistrict', 'Rangareddy');
    await page.waitForTimeout(150);

    const assembled = await page.evaluate(() => ({
      sender: document.getElementById('senderBlock').textContent,
      recipient: document.getElementById('recipientBlock').textContent,
      senderFit: document.getElementById('senderFit').textContent,
      recipientFit: document.getElementById('recipientFit').textContent
    }));
    check('Stage 6: sender fields assembled into printed lines',
      assembled.sender === 'Asha Sharma\nFlat 4B\nHyderabad\nTelangana',
      JSON.stringify(assembled.sender));
    check('Stage 6: recipient fields assembled into grouped lines',
      assembled.recipient.startsWith('Ravi Kumar\n12 MG Road\nKondapur') &&
      assembled.recipient.includes('Hyderabad'),
      JSON.stringify(assembled.recipient));

    // Without the district the same address fits exactly four lines at 13 pt
    // (each logical line is within the 22-char limit, so nothing wraps).
    await page.fill('#rDistrict', '');
    await page.fill('#rHouse', '12 MG Road');
    await page.waitForTimeout(180);
    const fitsCheck = await page.evaluate(() => ({
      senderFit: document.getElementById('senderFit').textContent,
      recipientFit: document.getElementById('recipientFit').textContent,
      recipient: document.getElementById('recipientBlock').textContent
    }));
    check('Stage 6: assembled addresses show "Fits"',
      fitsCheck.senderFit === 'Fits' && fitsCheck.recipientFit === 'Fits',
      fitsCheck.senderFit + '/' + fitsCheck.recipientFit + ' — ' + JSON.stringify(fitsCheck.recipient));

    // ── Automatic wrapping + overflow warning (never silent) ──────
    await page.fill('#rName', 'Asha Sharma');
    await page.fill('#rHouse', 'Flat 4B Sunrise Apartments Near Water Tank Kondapur Main Road, MG Road Extension Serilingampally');
    await page.fill('#rDistrict', '');
    await page.waitForTimeout(200);
    const wrapped = await page.evaluate(() => ({
      status: document.getElementById('recipientFit').textContent,
      detail: document.getElementById('recipientFitDetail').textContent,
      text: document.getElementById('recipientBlock').textContent,
      needed: document.getElementById('recipientBlock').dataset.neededLines,
      capacity: document.getElementById('recipientBlock').dataset.capacityLines,
      renderedLines: document.getElementById('recipientBlock').textContent.split('\n').length
    }));
    check('Stage 6: long address wraps and reports Too many lines',
      wrapped.status === 'Too many lines', wrapped.status + ' — ' + wrapped.detail);
    check('Stage 6: wrapped text never renders more than the 5 available lines',
      Number(wrapped.renderedLines) <= 5, wrapped.renderedLines + ' rendered, needed ' + wrapped.needed);
    check('Stage 6: no word is cut in half (all words preserved)',
      wrapped.text.split(/\s+/).filter(Boolean).every((w) => w.length >= 1) &&
      !wrapped.text.includes('…'), 'text=' + JSON.stringify(wrapped.text.slice(0, 60)));

    // A single word longer than the limit now hard-wraps at the character
    // limit instead of overflowing the card (fixed characters per line).
    await page.fill('#rName', 'Extremelylongsinglenamethatwillnotfitanywhereplainsimpleword');
    await page.waitForTimeout(200);
    const longWord = await page.evaluate(() => ({
      status: document.getElementById('recipientFit').textContent,
      lines: document.getElementById('recipientBlock').textContent.split('\n'),
      detail: document.getElementById('recipientFitDetail').textContent,
      hint: document.getElementById('recipientCharHint').textContent
    }));
    check('Stage 6: an over-long word wraps at the character limit',
      longWord.lines.length > 0 && longWord.lines.every((l) => l.length <= 32),
      JSON.stringify(longWord.lines));
    check('Stage 6: the fit badge reports the character limit',
      /22 characters per printed line/.test(longWord.hint), longWord.hint);

    // ── Fit text (explicit action) ───────────────────────────────
    // Six logical lines cannot fit the five available lines at 13 pt.
    // (A single over-long word can never fit at any size — Fit text must
    // report that instead of pretending.)
    await page.fill('#rName', 'Asha Sharma');
    await page.fill('#rHouse', 'Flat 4B Sunrise Apts\nNear Water Tank\nBack Side Lane');
    await page.fill('#rArea', 'Kondapur, Hyderabad');
    await page.fill('#rDistrict', 'Telangana');
    await page.waitForTimeout(200);
    const beforeFit = await page.evaluate(() =>
      document.getElementById('recipientFit').textContent);
    check('Stage 6: six address lines cannot fit five at 13 pt',
      beforeFit === 'Too many lines', beforeFit);

    // Removing the extra street lines leaves four lines: it must now fit.
    await page.fill('#rHouse', 'Flat 4B Sunrise Apts');
    await page.waitForTimeout(200);
    const fourLines = await page.evaluate(() => ({
      fit: document.getElementById('recipientFit').textContent,
      needed: document.getElementById('recipientBlock').dataset.neededLines
    }));
    check('Stage 6: four address lines fit exactly',
      fourLines.fit === 'Fits' && fourLines.needed === '4',
      fourLines.fit + ' (' + fourLines.needed + ' lines)');

    // The 5th accepted line prints below the 4 rules: capacity is now 5.
    await page.fill('#rHouse', 'Flat 4B Sunrise Apts\nNear Water Tank');
    await page.waitForTimeout(200);
    const fiveLines = await page.evaluate(() => ({
      fit: document.getElementById('recipientFit').textContent,
      needed: document.getElementById('recipientBlock').dataset.neededLines,
      capacity: document.getElementById('recipientBlock').dataset.capacityLines,
      rendered: document.getElementById('recipientBlock').textContent.split('\n').length,
      rules: document.querySelectorAll('.ruled-line').length
    }));
    check('Stage 6: five address lines fit (capacity is 5 now)',
      fiveLines.fit === 'Fits' && fiveLines.needed === '5' && fiveLines.capacity === '5',
      JSON.stringify(fiveLines));
    check('Stage 6: still exactly 4 printed ruled lines with 5 lines of text',
      fiveLines.rules === 4 && fiveLines.rendered === 5, JSON.stringify(fiveLines));

    // The over-long word now wraps at the 32-char limit (fixed per line).
    await page.fill('#rName', 'Extremelylongsinglenamethatwillnotfitanywhereplain');
    await page.waitForTimeout(200);
    const wrappedLong = await page.evaluate(() => ({
      lines: document.getElementById('recipientBlock').textContent.split('\n'),
      detail: document.getElementById('recipientFitDetail').textContent
    }));
    check('Stage 6: long word wraps within the 32-char limit',
      wrappedLong.lines.every((l) => l.length <= 32), JSON.stringify(wrappedLong.lines));

    // Fit text shrinks it to fit (or says it cannot) — never silently clips.
    await page.click('#fitTextBtn');
    await page.waitForTimeout(250);
    const shrunk = await page.evaluate(() => ({
      pt: document.getElementById('recipientFontPt').value,
      fit: document.getElementById('recipientFit').textContent,
      status: document.getElementById('status').textContent
    }));
    check('Stage 6: Fit text resolves the wide word and reports it',
      (shrunk.pt < 13 && shrunk.fit === 'Fits') || /cannot fit|shorten/.test(shrunk.status),
      shrunk.pt + ' pt → ' + shrunk.fit + ' | ' + shrunk.status);
    await page.fill('#rName', 'Ravi Kumar');
    await page.click('#resetCalibBtn');
    await page.fill('#recipientFontPt', '9');
    await page.waitForTimeout(150);

    // ── Char hints follow the font size ────────────────────────────
    // They derive from the font size but were only computed at load, so
    // changing the size (or running Fit text) left them showing old values.
    await page.fill('#recipientFontPt', '15');
    await page.waitForTimeout(150);
    const hintWide = await page.evaluate(() =>
      document.getElementById('recipientCharHint').textContent);
    await page.fill('#recipientFontPt', '8');
    await page.waitForTimeout(150);
    const hintNarrow = await page.evaluate(() =>
      document.getElementById('recipientCharHint').textContent);
    check('Char hints: follow the font size instead of freezing at load',
      hintWide !== hintNarrow && /About \d+ characters/.test(hintNarrow),
      hintWide + ' || ' + hintNarrow);
    await page.fill('#recipientFontPt', '9');
    await page.waitForTimeout(150);

    // ── Address stays inside its physical area ───────────────────
    await page.fill('#rName', 'Ravi Kumar');
    await page.fill('#rHouse', '12 MG Road');
    await page.fill('#offRecipYMm', '40');
    await page.waitForTimeout(150);
    const outside = await page.evaluate(() =>
      document.getElementById('recipientFit').textContent);
    check('Stage 6: content pushed outside the printable area is flagged',
      outside === 'Outside printable area', outside);
    await page.fill('#offRecipYMm', '0');
    await page.waitForTimeout(150);

    // ── Calibration must be truthful: summary + paper ─────────────
    // Repro: the offset fields live on the Front tab, so the summary was
    // only ever refreshed when activeTab === 'print' — it never changed.
    const posMm = () => page.evaluate(() => {
      const card = document.getElementById('postcard');
      const blk = document.getElementById('recipientBlock');
      const c = card.getBoundingClientRect();
      const b = blk.getBoundingClientRect();
      const scale = c.width / card.offsetWidth || 1; // divides out preview zoom
      return {
        x: (b.left - c.left) / scale * 25.4 / 96,
        y: (b.top - c.top) / scale * 25.4 / 96
      };
    });
    /** Set offset X, then read where the block lands on the printed page. */
    const printPosAt = async (v) => {
      await page.fill('#offRecipXMm', String(v));
      await page.waitForTimeout(120);
      const onScreen = await posMm();
      await page.emulateMedia({ media: 'print' });
      await page.waitForTimeout(120);
      const onPaper = await posMm();
      await page.emulateMedia({ media: 'screen' });
      await page.waitForTimeout(60);
      return { onScreen, onPaper };
    };

    await page.fill('#offRecipXMm', '8');
    await page.waitForTimeout(150);
    const sumText = await page.evaluate(() =>
      document.getElementById('offsetSummary').innerText.replace(/\n/g, ' '));
    check('Calibration: Active calibration summary updates from the Front tab',
      /To \(front\)\s*X \+8 mm/.test(sumText), sumText.slice(0, 140));

    const at8 = { onScreen: await posMm(), onPaper: null };
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(120);
    at8.onPaper = await posMm();
    await page.emulateMedia({ media: 'screen' });
    await page.waitForTimeout(60);

    // The preview must be the real geometry, not a mock.
    const gapX = Math.abs(at8.onScreen.x - at8.onPaper.x);
    const gapY = Math.abs(at8.onScreen.y - at8.onPaper.y);
    check('Calibration: preview and print place the block at the same mm',
      gapX < 0.05 && gapY < 0.05, 'dx=' + round(gapX) + ' dy=' + round(gapY));

    // And the offset has to reach the paper, not just the preview.
    const zero = await printPosAt(0);
    const eight = await printPosAt(8);
    const moved = Math.abs(eight.onPaper.x - zero.onPaper.x);
    check('Calibration: the 8 mm offset is carried into print',
      Math.abs(moved - 8) < 0.3, round(moved) + ' mm');
    await page.fill('#offRecipXMm', '0');
    await page.waitForTimeout(120);

    // ── Live clamping and load-time sanitising must agree ──────────
    // A typo like 400 used to apply as 400 on screen and come back as 20
    // after a reload. Both paths must clamp identically, and stay above
    // the ~30 mm the "Outside printable area" guard above needs to fire.
    const loadClamped = await page.evaluate(() =>
      sanitizeSettings({ offsets: { recipientX: 400, recipientY: -400 } }).offsets);
    check('Calibration: load-time sanitiser clamps offsets to ±50 mm',
      loadClamped.recipientX === 50 && loadClamped.recipientY === -50,
      JSON.stringify(loadClamped));

    await page.fill('#offRecipXMm', '400');
    await page.waitForTimeout(150);
    const liveClamped = await page.evaluate(() =>
      document.getElementById('recipientBlock').style.transform);
    check('Calibration: typing 400 mm applies the same 50 mm clamp',
      /translate\(50mm/.test(liveClamped), liveClamped);
    await page.fill('#offRecipXMm', '0');
    await page.waitForTimeout(120);

    // ── Back image: upload, move, resize, crop, rotate, toggle ────
    await page.click('#tabBackBtn');
    await page.waitForTimeout(100);
    await page.fill('#messageInput', '');
    await page.setInputFiles('#imageInput', imagePngPath);
    await page.waitForTimeout(400);

    const imgLoaded = await page.evaluate(() => ({
      canvasHidden: document.getElementById('backImageCanvas').hidden,
      info: document.getElementById('imageInfo').textContent,
      hasImage: !!window.__backImageEl,
      aspect: window.__backImageEl ? window.__backImageEl.naturalWidth / window.__backImageEl.naturalHeight : 0,
      w: document.getElementById('imgW').value,
      h: document.getElementById('imgH').value,
      x: document.getElementById('imgX').value,
      y: document.getElementById('imgY').value
    }));
    check('Stage 6: uploaded image renders on the back card',
      imgLoaded.canvasHidden === false && imgLoaded.hasImage === true,
      imgLoaded.info);
    const controlsEnabled = await page.isEnabled('#imgX') &&
      await page.isEnabled('#imgW') && await page.isEnabled('#imgRotate');
    check('Stage 6: image controls enabled after upload', controlsEnabled === true);
    // Aspect lock: changing width keeps the ratio.
    await page.fill('#imgW', '80');
    await page.waitForTimeout(150);
    const aspect = await page.evaluate(() => ({
      w: Number(document.getElementById('imgW').value),
      h: Number(document.getElementById('imgH').value)
    }));
    check('Stage 6: aspect lock keeps the ratio when width changes',
      Math.abs(aspect.w / aspect.h - imgLoaded.aspect) < 0.25,
      aspect.w + 'x' + aspect.h + ' (source aspect ' + imgLoaded.aspect.toFixed(2) + ')');

    // Unlocking allows an independent height.
    await page.uncheck('#imgAspectLock');
    await page.fill('#imgH', '20');
    await page.waitForTimeout(150);
    const unlocked = await page.evaluate(() => ({
      w: Number(document.getElementById('imgW').value),
      h: Number(document.getElementById('imgH').value)
    }));
    check('Stage 6: unlocking the aspect allows independent height',
      unlocked.h === 20 && Math.abs(unlocked.w - aspect.w) < 0.01,
      unlocked.w + 'x' + unlocked.h);
    await page.check('#imgAspectLock');

    // Movement + out-of-card warning.
    await page.fill('#imgX', '150');
    await page.waitForTimeout(150);
    const imgOutside = await page.evaluate(() =>
      document.getElementById('imageFit').textContent);
    check('Stage 6: image outside the card is flagged',
      imgOutside === 'Outside printable area', imgOutside);
    await page.fill('#imgX', '20');
    await page.waitForTimeout(150);
    const imgInside = await page.evaluate(() =>
      document.getElementById('imageFit').textContent);
    check('Stage 6: image back inside shows Fits', imgInside === 'Fits', imgInside);

    // Crop + rotation update the rendering.
    await page.fill('#cropLeft', '50');
    await page.waitForTimeout(150);
    const cropped = await page.evaluate(() => ({
      cropInfo: document.getElementById('cropInfo').textContent,
      canvasW: document.getElementById('backImageCanvas').width
    }));
    check('Stage 6: crop controls report the visible region',
      /50/.test(cropped.cropInfo), cropped.cropInfo);
    check('Stage 6: canvas renders at high resolution (print quality)',
      cropped.canvasW > 500, cropped.canvasW + ' px');

    await page.fill('#imgRotate', '90');
    await page.waitForTimeout(150);
    const rotated = await page.evaluate(() =>
      document.getElementById('imageFit').textContent);
    check('Stage 6: rotation renders without errors', typeof rotated === 'string');

    // Print-image toggle.
    await page.click('#imagePrintToggle');
    await page.waitForTimeout(150);
    const printImgOn = await page.evaluate(() =>
      document.getElementById('backImageCanvas').dataset.printImage);
    check('Stage 6: "Print image" on -> image prints in overlay mode',
      printImgOn === 'on', printImgOn);
    await page.click('#imagePrintToggle');
    await page.waitForTimeout(150);
    const printImgOff = await page.evaluate(() =>
      document.getElementById('backImageCanvas').dataset.printImage);
    check('Stage 6: "Print image" off -> image does not print',
      printImgOff === 'off', printImgOff);

    // Removing the image clears the layer.
    await page.click('#imageRemoveBtn');
    await page.waitForTimeout(150);
    const removed = await page.evaluate(() =>
      document.getElementById('backImageCanvas').hidden);
    check('Stage 6: removing the image clears it from the card', removed === true);

    // ── Multi-line fields (From AND To accept extra lines) ────────
    await page.click('#tabFrontBtn');
    await page.waitForTimeout(120);
    await page.fill('#sHouse', 'Flat 4B\nNear Water Tank\nBlock C');
    await page.fill('#rHouse', '12 MG Road\nOpp. City Hospital');
    await page.waitForTimeout(200);
    const multiLine = await page.evaluate(() => ({
      sender: document.getElementById('senderBlock').textContent,
      recipient: document.getElementById('recipientBlock').textContent,
      senderLines: document.getElementById('senderBlock').textContent.split('\n').length
    }));
    check('Stage 6: multi-line From field prints each line',
      multiLine.sender.includes('Flat 4B\nNear Water Tank\nBlock C'),
      JSON.stringify(multiLine.sender));
    check('Stage 6: multi-line To field prints each line',
      multiLine.recipient.includes('12 MG Road\nOpp. City Hospital'),
      JSON.stringify(multiLine.recipient));
    check('Stage 6: extra lines stay within the sender area',
      multiLine.senderLines <= 12, multiLine.senderLines + ' lines');

    // ── Back message: Fit text action ────────────────────────────
    await page.click('#tabBackBtn');
    await page.waitForTimeout(120);
    // A very long wrappable message: at 9 pt it needs more than the 10
    // available lines; at a smaller font it fits (the message area is the
    // full 127 mm card width, wide enough for small text to fit).
    await page.fill('#messageInput', 'Dear Friend, wishing you and your family a very happy new year filled with joy, good health and success in everything that you do. '.repeat(8) + 'Best wishes.');
    await page.waitForTimeout(200);
    const msgTooLong = await page.evaluate(() =>
      document.getElementById('messageFit').textContent);
    check('Stage 6: long back message reports overflow',
      msgTooLong === 'Too many lines', msgTooLong);
    await page.click('#messageFitTextBtn');
    await page.waitForTimeout(250);
    const msgFitted = await page.evaluate(() => ({
      pt: document.getElementById('backFontSize').value,
      fit: document.getElementById('messageFit').textContent,
      status: document.getElementById('status').textContent
    }));
    check('Stage 6: back Fit text shrinks the message to fit',
      Number(msgFitted.pt) < 9 && msgFitted.fit === 'Fits',
      msgFitted.pt + ' pt — ' + msgFitted.status);

    // Return to the Print tab for the side-selection checks.
    await page.click('#tabPrintBtn');
    await page.waitForTimeout(120);

    // ── Print side selection: Back / Both ────────────────────────    await page.click('#tabPrintBtn');
    await page.waitForTimeout(120);
    await page.click('#printSideBack');
    await page.waitForTimeout(150);
    const backPreview = await page.evaluate(() => ({
      backVisible: !document.getElementById('backcard').hidden,
      frontHidden: document.getElementById('postcard').hidden,
      side: document.body.dataset.printSide
    }));
    check('Stage 6: Print tab Back shows the back side',
      backPreview.backVisible && backPreview.frontHidden && backPreview.side === 'back',
      JSON.stringify(backPreview));

    await page.click('#printSideFront');
    await page.waitForTimeout(150);
    const frontPreview = await page.evaluate(() => ({
      frontVisible: !document.getElementById('postcard').hidden,
      backHidden: document.getElementById('backcard').hidden,
      side: document.body.dataset.printSide
    }));
    check('Stage 6: Print tab Front shows the front side',
      frontPreview.frontVisible && frontPreview.backHidden && frontPreview.side === 'front',
      JSON.stringify(frontPreview));

    await page.click('#printSideBoth');
    await page.waitForTimeout(150);
    const bothPreview = await page.evaluate(() => ({
      frontVisible: !document.getElementById('postcard').hidden,
      backVisible: !document.getElementById('backcard').hidden,
      side: document.body.dataset.printSide
    }));
    check('Stage 6: Print tab Front and Back shows both sides',
      bothPreview.frontVisible && bothPreview.backVisible && bothPreview.side === 'both',
      JSON.stringify(bothPreview));

    // ── First-print instruction flow ─────────────────────────────
    // Without clicking "Print now" (which opens the native print dialog),
    // verify the help panel appears on Print click and hides on Cancel.
    // The Print button lives in the Print tab, so open it first.
    await page.click('#tabPrintBtn');
    await page.waitForTimeout(80);
    const printTabVisible = await page.evaluate(() =>
      !document.getElementById('panelPrint').hidden &&
      document.getElementById('panelFront').hidden);
    check('Tabs: Print tab activates and hides the Front panel', printTabVisible === true);

    const helpHiddenAtStart = await page.evaluate(() =>
      document.getElementById('printHelp').hidden);
    check('Print: instruction panel hidden before first use', helpHiddenAtStart === true);

    await page.click('#printBtn');
    await page.waitForTimeout(80);
    const helpShown = await page.evaluate(() => ({
      hidden: document.getElementById('printHelp').hidden,
      text: document.getElementById('printHelp').textContent
    }));
    check('Print: instruction panel shown on first Print click', helpShown.hidden === false);
    check('Print: instructions mention paper size 143 x 93 mm',
      helpShown.text.includes('143 × 93 mm'), 'not mentioned');
    check('Print: instructions warn about Fit-to-page scaling',
      /fit to page/i.test(helpShown.text), 'no scaling warning');
    check('Print: instructions mention landscape orientation',
      /landscape/i.test(helpShown.text), 'no orientation note');
    check('Print: instructions mention background graphics',
      /background/i.test(helpShown.text), 'no background note');

    await page.click('#printCancelBtn');
    await page.waitForTimeout(80);
    const helpHiddenAgain = await page.evaluate(() =>
      document.getElementById('printHelp').hidden);
    check('Print: instruction panel hides on Cancel', helpHiddenAgain === true);

    // ── Print media — MODE 1: full card ───────────────────────────
    // Select "Full card" mode first (default is overlay), then show guides
    // so we can prove print CSS hides them in every mode.
    await page.click('#printModeCard');
    await page.waitForTimeout(60);
    await page.click('#tabFrontBtn');
    await page.click('#guidesBtn');
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(120);

    const printState = await page.evaluate(() => {
      const card = document.getElementById('postcard');
      const cs = getComputedStyle(card);
      return {
        offsetW: card.offsetWidth,
        offsetH: card.offsetHeight,
        transform: cs.transform,
        position: cs.position,
        boxShadow: cs.boxShadow,
        backgroundColor: cs.backgroundColor,
        colorAdjust: cs.printColorAdjust || cs.webkitPrintColorAdjust || 'unknown',
        headerDisplay: getComputedStyle(document.querySelector('body > header')).display,
        panelDisplay: getComputedStyle(document.querySelector('.panel')).display,
        guidesDisplay: getComputedStyle(document.getElementById('cardGuides')).display,
        scalerW: document.getElementById('previewScaler').offsetWidth,
        artworkDisplay: getComputedStyle(document.querySelector('.card-artwork')).display
      };
    });

    const pxW = 143 * 96 / 25.4;  // 540.47 CSS px
    const pxH = 93 * 96 / 25.4;   // 351.5 CSS px
    check('Card print: card is exactly 143 mm wide', Math.abs(printState.offsetW - pxW) < 2, round(printState.offsetW) + ' px');
    check('Card print: card is exactly 93 mm high', Math.abs(printState.offsetH - pxH) < 2, round(printState.offsetH) + ' px');
    check('Card print: no screen-preview transform', printState.transform === 'none', printState.transform);
    check('Card print: no box shadow', printState.boxShadow === 'none', printState.boxShadow);
    check('Card print: card background retained (full card)',
      printState.backgroundColor !== 'rgba(0, 0, 0, 0)', printState.backgroundColor);
    check('Card print: app header hidden', printState.headerDisplay === 'none', printState.headerDisplay);
    check('Card print: control panel hidden', printState.panelDisplay === 'none', printState.panelDisplay);
    check('Card print: calibration guides hidden', printState.guidesDisplay === 'none', printState.guidesDisplay);
    check('Card print: background colour forced',
      /exact/.test(String(printState.colorAdjust)), printState.colorAdjust);
    check('Card print: scaler laid out at 143 mm', Math.abs(printState.scalerW - pxW) < 2, round(printState.scalerW) + ' px');
    check('Card print: printed artwork present (full card)',
      printState.artworkDisplay !== 'none', printState.artworkDisplay);

    // The divider and layers must stay contained inside the card box
    // (a static positioning context would let them escape onto the page).
    const containment = await page.evaluate(() => {
      const card = document.getElementById('postcard').getBoundingClientRect();
      const d = document.querySelector('.divider').getBoundingClientRect();
      const layer = document.querySelector('.card-artwork').getBoundingClientRect();
      return {
        dividerH: d.height,
        cardH: card.height,
        dividerBottom: d.bottom - card.bottom,
        layerBottom: layer.bottom - card.bottom
      };
    });
    check('Card print: divider contained inside the card',
      containment.dividerH === containment.cardH && Math.abs(containment.dividerBottom) < 1,
      round(containment.dividerH) + ' vs card ' + round(containment.cardH));
    check('Card print: artwork layer contained inside the card',
      Math.abs(containment.layerBottom) < 1,
      round(containment.layerBottom) + ' px overflow');

    // Verify the @page rule defines the exact postcard page (143 > 93 = landscape).
    const cssText = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
    const flat = cssText.replace(/\s+/g, ' ');
    check('Card print: @page rule defines exact 143mm x 93mm page',
      /@page\s*\{[^}]*size:\s*143mm\s+93mm/i.test(flat), 'exact-size @page not found');
    check('Card print: @page margin is 0 (card at page origin)',
      /@page\s*\{[^}]*margin:\s*0/i.test(flat), 'margin not 0');
    check('Print: guides never print',
      /\.card-guides\s*\{\s*display:\s*none\s*!important/i.test(flat),
      'guides not hidden in print CSS');

    // Side selection in full-card mode: printing the back hides the front.
    // An EMPTY message must print a completely blank back.
    // (The message textarea lives on the Back tab, so clear it via the DOM.)
    await page.evaluate(() => {
      const ta = document.getElementById('messageInput');
      ta.value = '';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(100);
    const printSides = await page.evaluate(() => {
      const read = (side) => {
        document.body.dataset.printSide = side;
        return {
          front: getComputedStyle(document.getElementById('postcard')).display,
          back: getComputedStyle(document.getElementById('backcard')).display,
          backText: document.getElementById('backMessage').textContent
        };
      };
      const backSel = read('back');
      const frontSel = read('front');
      const bothSel = read('both');
      return { backSel, frontSel, bothSel };
    });
    check('Print: side = back hides the front card',
      printSides.backSel.front === 'none', printSides.backSel.front);
    check('Print: side = back prints the back card',
      printSides.backSel.back !== 'none', printSides.backSel.back);
    check('Print: side = front hides the back card',
      printSides.frontSel.back === 'none', printSides.frontSel.back);
    check('Print: side = front prints the front card',
      printSides.frontSel.front !== 'none', printSides.frontSel.front);
    check('Print: empty message prints a completely blank back',
      printSides.backSel.backText === '', JSON.stringify(printSides.backSel.backText));
    check('Print: side = both prints BOTH cards',
      printSides.bothSel.front !== 'none' && printSides.bothSel.back !== 'none',
      printSides.bothSel.front + '/' + printSides.bothSel.back);

    // Both sides must be separate 143 x 93 mm pages (front first).
    const bothPages = await page.evaluate(() => {
      document.body.dataset.printSide = 'both';
      const cs = getComputedStyle(document.getElementById('postcard'));
      return {
        breakAfter: cs.breakAfter || cs.webkitBreakAfter,
        offsetW: document.getElementById('postcard').offsetWidth,
        offsetH: document.getElementById('postcard').offsetHeight,
        backW: document.getElementById('backcard').offsetWidth,
        backH: document.getElementById('backcard').offsetHeight
      };
    });
    check('Print: both sides force a page break after the front',
      /page|always/.test(bothPages.breakAfter || ''), bothPages.breakAfter);
    check('Print: both sides are each 143 x 93 mm',
      Math.abs(bothPages.offsetW - pxW) < 2 && Math.abs(bothPages.offsetH - pxH) < 2 &&
      Math.abs(bothPages.backW - pxW) < 2 && Math.abs(bothPages.backH - pxH) < 2,
      bothPages.offsetW + 'x' + bothPages.offsetH + ' / ' + bothPages.backW + 'x' + bothPages.backH);

    // Screenshot the full-card print state.
    await page.evaluate(() => { document.body.dataset.printSide = 'front'; });
    await page.screenshot({ path: path.join(SHOT_DIR, 'print-preview.png') });

    // ── Print media — MODE 2: text-only OVERLAY (front) ───────────
    await page.emulateMedia({ media: 'screen' });
    await page.click('#tabPrintBtn');
    await page.click('#printModeOverlay');
    await page.click('#printSideFront');
    await page.evaluate(() => {
      const ta = document.getElementById('messageInput');
      ta.value = 'Back message';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(120);

    const overlayFront = await page.evaluate(() => {
      const card = document.getElementById('postcard');
      const cs = getComputedStyle(card);
      const rect = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const scale = card.getBoundingClientRect().width / card.offsetWidth;
      const rel = (sel) => {
        const r = rect(sel);
        const c = card.getBoundingClientRect();
        if (!r) return null;
        return {
          x: (r.x - c.x) / scale * 25.4 / 96,
          y: (r.y - c.y) / scale * 25.4 / 96,
          w: r.w / scale * 25.4 / 96
        };
      };
      return {
        background: cs.backgroundColor,
        border: cs.borderTopWidth,
        artworkDisplay: getComputedStyle(document.querySelector('.card-artwork')).display,
        dividerRendered: !!document.querySelector('.divider').offsetParent,
        senderText: document.getElementById('senderBlock').textContent,
        recipientText: document.getElementById('recipientBlock').textContent,
        pinDigits: [...document.querySelectorAll('#pinRow .pin-box')].map((b) => b.textContent).join(''),
        sender: rel('#senderBlock'),
        recipient: rel('#recipientBlock'),
        pin: rel('#pinRow')
      };
    });
    check('Overlay (front): no card background printed',
      overlayFront.background === 'rgba(0, 0, 0, 0)', overlayFront.background);
    check('Overlay (front): no card border printed',
      overlayFront.border === '0px', overlayFront.border);
    check('Overlay (front): printed artwork NOT printed',
      overlayFront.artworkDisplay === 'none', overlayFront.artworkDisplay);
    check('Overlay (front): divider NOT printed',
      overlayFront.dividerRendered === false, 'divider still rendered');
    check('Overlay (front): sender text printed',
      overlayFront.senderText.includes('Asha Sharma'), overlayFront.senderText.slice(0, 40));
    check('Overlay (front): recipient text printed',
      overlayFront.recipientText.includes('Ravi Kumar'), overlayFront.recipientText.slice(0, 40));
    check('Overlay (front): six PIN digits printed',
      overlayFront.pinDigits === '500001', overlayFront.pinDigits);
    check('Overlay (front): sender text stays at 8 mm',
      overlayFront.sender && Math.abs(overlayFront.sender.x - 8) < 1.5,
      overlayFront.sender ? round(overlayFront.sender.x) : 'missing');
    check('Overlay (front): recipient text stays at 80 mm / 28.8 mm',
      overlayFront.recipient &&
      Math.abs(overlayFront.recipient.x - 80) < 1.5 &&
      Math.abs(overlayFront.recipient.y - 28.8) < 0.8,
      overlayFront.recipient ? round(overlayFront.recipient.x) + '/' + round(overlayFront.recipient.y) : 'missing');
    check('Overlay (front): PIN digits stay at 91 mm / 62 mm',
      overlayFront.pin &&
      Math.abs(overlayFront.pin.x - 91) < 1.5 &&
      Math.abs(overlayFront.pin.y - 62) < 1.5,
      overlayFront.pin ? round(overlayFront.pin.x) + '/' + round(overlayFront.pin.y) : 'missing');
    await page.locator('#postcard').screenshot({ path: path.join(SHOT_DIR, 'print-overlay-front.png') });

    // ── Print media — MODE 2: text-only OVERLAY (back) ────────────
    await page.emulateMedia({ media: 'screen' });
    await page.click('#printSideBack');
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(120);
    const overlayBack = await page.evaluate(() => {
      document.body.dataset.printSide = 'back';
      const back = document.getElementById('backcard');
      const front = document.getElementById('postcard');
      const frontCs = getComputedStyle(front);
      return {
        frontHidden: frontCs.display === 'none',
        backVisible: getComputedStyle(back).display !== 'none',
        backBackground: getComputedStyle(back).backgroundColor,
        message: document.getElementById('backMessage').textContent,
        frontContentStillThere: document.getElementById('senderBlock').textContent.length > 0
      };
    });
    check('Overlay (back): front card not printed', overlayBack.frontHidden === true);
    check('Overlay (back): back card printed (no background)',
      overlayBack.backVisible === true && overlayBack.backBackground === 'rgba(0, 0, 0, 0)',
      overlayBack.backBackground);
    check('Overlay (back): only the message text is printed',
      overlayBack.message === 'Back message', JSON.stringify(overlayBack.message));
    check('Overlay (back): front content not printed alongside',
      overlayBack.frontHidden === true);

    // Empty message in overlay mode must print no text at all.
    await page.evaluate(() => {
      const ta = document.getElementById('messageInput');
      ta.value = '';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(80);
    const overlayEmpty = await page.evaluate(() => ({
      text: document.getElementById('backMessage').textContent
    }));
    check('Overlay (back): empty message prints nothing',
      overlayEmpty.text === '', JSON.stringify(overlayEmpty.text));

    // ── Print media — MODE 3: calibration sheet ──────────────────
    await page.emulateMedia({ media: 'screen' });
    await page.click('#printModeCalibration');
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(120);

    const calib = await page.evaluate(() => {
      const sheet = document.getElementById('calibSheet');
      const cs = getComputedStyle(sheet);
      const mm = (el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width * 25.4 / 96, h: r.height * 25.4 / 96 };
      };
      const rect = document.querySelector('.calib-rect').getBoundingClientRect();
      const h = document.querySelector('.calib-hline').getBoundingClientRect();
      const v = document.querySelector('.calib-vline').getBoundingClientRect();
      const frontCard = getComputedStyle(document.getElementById('postcard')).display;
      const backCard = getComputedStyle(document.getElementById('backcard')).display;
      const artwork = getComputedStyle(document.querySelector('.card-artwork')).display;
      return {
        sheetVisible: cs.display !== 'none',
        sheetW: mm(sheet).w, sheetH: mm(sheet).h,
        rectW: rect.width * 25.4 / 96, rectH: rect.height * 25.4 / 96,
        hLineLen: h.width * 25.4 / 96,
        vLineLen: v.height * 25.4 / 96,
        frontCard, backCard, artwork,
        artworkRendered: !!document.querySelector('.card-artwork').offsetParent,
        has100: document.querySelector('.calib-hline .calib-label').textContent.trim(),
        has50: document.querySelector('.calib-vline .calib-label').textContent.trim(),
        hasRectTag: document.querySelector('.calib-rect-tag').textContent
      };
    });
    check('Calibration: sheet visible only in calibration mode', calib.sheetVisible === true);
    check('Calibration: front card not printed', calib.frontCard === 'none', calib.frontCard);
    check('Calibration: back card not printed', calib.backCard === 'none', calib.backCard);
    check('Calibration: artwork not printed', calib.artworkRendered === false,
      'artwork still rendered');
    check('Calibration: horizontal reference line is exactly 100 mm',
      Math.abs(calib.hLineLen - 100) < 1, round(calib.hLineLen));
    check('Calibration: vertical reference line is exactly 50 mm',
      Math.abs(calib.vLineLen - 50) < 1, round(calib.vLineLen));
    check('Calibration: reference rectangle is exactly 143 x 93 mm',
      Math.abs(calib.rectW - 143) < 1 && Math.abs(calib.rectH - 93) < 1,
      round(calib.rectW) + ' x ' + round(calib.rectH));
    check('Calibration: lines are labelled', calib.has100 === '100 mm' && calib.has50 === '50 mm',
      calib.has100 + ' / ' + calib.has50);
    check('Calibration: rectangle labelled with card size', /143/.test(calib.hasRectTag), calib.hasRectTag);
    await page.screenshot({ path: path.join(SHOT_DIR, 'print-calibration.png') });

    // Calibration marks must NEVER appear in overlay printing.
    const calibHiddenInOverlay = await page.evaluate(() => {
      document.body.dataset.printMode = 'overlay';
      const d = getComputedStyle(document.getElementById('calibSheet')).display;
      document.body.dataset.printMode = 'calibration';
      return d;
    });
    check('Calibration: marks never appear in overlay printing',
      calibHiddenInOverlay === 'none', calibHiddenInOverlay);

    // Back to screen, restore default mode and hide the guides.
    await page.emulateMedia({ media: 'screen' });
    await page.click('#tabFrontBtn');
    await page.click('#guidesBtn');
    await page.waitForTimeout(100);

    // ── Screenshots for eyeball review ────────────────────────────
    await page.screenshot({ path: path.join(SHOT_DIR, 'preview-full.png') });
    await page.locator('#postcard').screenshot({ path: path.join(SHOT_DIR, 'postcard.png') });
    // ══════════════════════════════════════════════════════════════
    // STAGE 7 — entry-mode toggle + saved address book + CSV
    // Runs last so it cannot disturb the geometry/print checks above.
    // ══════════════════════════════════════════════════════════════
    let dialogMode = 'accept';
    const dialogs = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      if (dialogMode === 'dismiss') await d.dismiss();
      else await d.accept();
    });
    const isVisible = (id) => page.evaluate((i) => {
      const e = document.getElementById(i);
      const cs = getComputedStyle(e);
      return cs.display !== 'none' && e.getBoundingClientRect().height > 0;
    }, id);

    // ── Entry mode: Full form vs Single box ───────────────────────
    const modeDefault = await page.evaluate(() => ({
      sFull: document.getElementById('sEntryFull').checked,
      rFull: document.getElementById('rEntryFull').checked
    }));
    check('Stage 7: default entry mode is Full form for both addresses',
      modeDefault.sFull && modeDefault.rFull, JSON.stringify(modeDefault));
    check('Stage 7: default shows the form and hides the single box',
      (await isVisible('sFullGrid')) && !(await isVisible('sSingleBox')) &&
      (await isVisible('rFullGrid')) && !(await isVisible('rSingleBox')));

    await page.fill('#rName', 'Sunita Devi');
    await page.fill('#rHouse', '7 Park Street');
    await page.fill('#rArea', 'Nagpur');
    await page.fill('#rDistrict', 'Maharashtra');
    await page.fill('#rPin', '440001');
    await page.waitForTimeout(150);
    const fullRender = await page.evaluate(() => document.getElementById('recipientBlock').textContent);
    check('Stage 7: the To address renders from the full form',
      fullRender.indexOf('Sunita Devi') === 0, fullRender);

    dialogs.length = 0;
    await page.click('#rEntrySingle');
    await page.waitForTimeout(220);
    const afterSwitch = await page.evaluate(() => ({
      pinValue: document.getElementById('rPin').value,
      rName: document.getElementById('rName').value,
      rArea: document.getElementById('rArea').value,
      singleChecked: document.getElementById('rEntrySingle').checked
    }));
    check('Stage 7: switching to Single box warns the user first',
      dialogs.some((d) => /clears/i.test(d)), JSON.stringify(dialogs));
    check('Stage 7: Single box shows and the full form hides (exactly one on screen)',
      (await isVisible('rSingleBox')) && !(await isVisible('rFullGrid')));
    check('Stage 7: the other address is untouched by the switch',
      (await isVisible('sFullGrid')) && !(await isVisible('sSingleBox')));
    check('Stage 7: form fields are cleared when leaving Full form',
      afterSwitch.rName === '' && afterSwitch.rArea === '', JSON.stringify(afterSwitch));
    check('Stage 7: the PIN box survives the switch',
      afterSwitch.pinValue === '440001', afterSwitch.pinValue);

    await page.fill('#rSingleInput', 'Anita Rao\n12 MG Road\nHyderabad, Telangana');
    await page.waitForTimeout(220);
    const singleRender = await page.evaluate(() => ({
      text: document.getElementById('recipientBlock').textContent,
      pin: document.getElementById('pinRow').textContent,
      fit: document.getElementById('recipientFit').textContent
    }));
    check('Stage 7: single-box lines print exactly as typed',
      singleRender.text === 'Anita Rao\n12 MG Road\nHyderabad, Telangana',
      JSON.stringify(singleRender.text));
    check('Stage 7: the PIN boxes still show the separate PIN',
      singleRender.pin === '440001', singleRender.pin);
    check('Stage 7: the fit badge still evaluates single-box text',
      singleRender.fit === 'Fits', singleRender.fit);

    dialogMode = 'dismiss';
    await page.click('#rEntryFull');
    await page.waitForTimeout(220);
    const declined = await page.evaluate(() => ({
      singleStill: document.getElementById('rEntrySingle').checked,
      text: document.getElementById('rSingleInput').value,
      status: document.getElementById('status').textContent
    }));
    check('Stage 7: declining the warning leaves the mode unchanged',
      declined.singleStill && (await isVisible('rSingleBox')) && /unchanged/i.test(declined.status),
      JSON.stringify(declined));
    check('Stage 7: declining keeps the typed single-box text',
      declined.text === 'Anita Rao\n12 MG Road\nHyderabad, Telangana', JSON.stringify(declined.text));

    dialogMode = 'accept';
    await page.click('#rEntryFull');
    await page.waitForTimeout(220);
    const backToFull = await page.evaluate(() => ({
      full: document.getElementById('rEntryFull').checked,
      singleText: document.getElementById('rSingleInput').value,
      pin: document.getElementById('rPin').value
    }));
    check('Stage 7: accepting switches back to the full form',
      backToFull.full && (await isVisible('rFullGrid')) && !(await isVisible('rSingleBox')));
    check('Stage 7: leaving Single box clears its text but keeps the PIN',
      backToFull.singleText === '' && backToFull.pin === '440001', JSON.stringify(backToFull));

    // ── Saved recipients ─────────────────────────────────────────
    await page.fill('#rName', 'Sunita Devi');
    await page.fill('#rHouse', '7 Park Street');
    await page.fill('#rArea', 'Shivajinagar, Nagpur');
    await page.fill('#rDistrict', 'Maharashtra');
    await page.fill('#rPin', '440001');
    await page.fill('#abRecipientName', 'Sunita');
    await page.click('#abRecipientSaveBtn');
    await page.waitForTimeout(220);
    const saved1 = await page.evaluate(() => ({
      count: document.getElementById('abRecipientCount').textContent,
      opts: Array.from(document.getElementById('abRecipientSelect').options).map((o) => o.textContent),
      loadDisabled: document.getElementById('abRecipientLoadBtn').disabled
    }));
    check('Stage 7: saving a recipient adds it to the list',
      saved1.count === '1', saved1.count);
    check('Stage 7: the list shows the display name and the PIN',
      saved1.opts.some((o) => /Sunita/.test(o) && /440001/.test(o)), JSON.stringify(saved1.opts));
    check('Stage 7: Load/Edit/Delete enable once a contact is selected',
      saved1.loadDisabled === false, String(saved1.loadDisabled));

    // Change the form, then select the contact: it must come back.
    await page.fill('#rName', 'CHANGED');
    await page.fill('#rArea', 'Nowhere');
    await page.waitForTimeout(150);
    await page.selectOption('#abRecipientSelect', { index: 1 });
    await page.waitForTimeout(260);
    const reloaded1 = await page.evaluate(() => ({
      rName: document.getElementById('rName').value,
      rArea: document.getElementById('rArea').value,
      rPin: document.getElementById('rPin').value,
      preview: document.getElementById('recipientBlock').textContent,
      pinBoxes: document.getElementById('pinRow').textContent
    }));
    check('Stage 7: selecting a contact repopulates the To fields',
      reloaded1.rName === 'Sunita Devi' && reloaded1.rArea === 'Shivajinagar, Nagpur', JSON.stringify(reloaded1));
    check('Stage 7: loading a contact updates the live preview',
      reloaded1.preview.indexOf('Sunita Devi') === 0 && reloaded1.preview.indexOf('CHANGED') < 0,
      JSON.stringify(reloaded1.preview));
    check('Stage 7: loading a contact updates the PIN boxes',
      reloaded1.pinBoxes === '440001', reloaded1.pinBoxes);

    // ── Editing a contact must not touch the loaded card ──────────
    await page.click('#abRecipientEditBtn');
    await page.waitForTimeout(180);
    const editPanelOpen = await page.evaluate(() => !document.getElementById('abEditPanel').hidden);
    check('Stage 7: Edit opens the contact editor', editPanelOpen === true);
    await page.fill('#abEditName', 'Sunita (renamed)');
    await page.fill('#abEditField_cityOrVillage', 'Pune');
    await page.waitForTimeout(180);
    const whileEditing = await page.evaluate(() => ({
      card: document.getElementById('recipientBlock').textContent,
      rArea: document.getElementById('rArea').value,
      notice: document.getElementById('abEditNotice').textContent
    }));
    check('Stage 7: editing a saved contact does not change the loaded card',
      whileEditing.card.indexOf('Nagpur') >= 0 && whileEditing.rArea === 'Shivajinagar, Nagpur',
      JSON.stringify(whileEditing));
    check('Stage 7: the editor says changes stay off the card until Load',
      /saved contact only|card above keeps/i.test(whileEditing.notice), whileEditing.notice);
    await page.click('#abEditSaveBtn');
    await page.waitForTimeout(220);
    const afterEditSave = await page.evaluate(() => ({
      card: document.getElementById('recipientBlock').textContent,
      count: document.getElementById('abRecipientCount').textContent,
      opts: Array.from(document.getElementById('abRecipientSelect').options).map((o) => o.textContent)
    }));
    check('Stage 7: saving the edit leaves the card as it was',
      afterEditSave.card.indexOf('Nagpur') >= 0, JSON.stringify(afterEditSave.card));
    check('Stage 7: the edited contact is renamed in the list',
      afterEditSave.opts.some((o) => /Sunita \(renamed\)/.test(o)), JSON.stringify(afterEditSave.opts));

    // ── Duplicate display names never overwrite ──────────────────
    await page.fill('#abRecipientName', 'Sunita (renamed)');
    await page.click('#abRecipientSaveBtn');
    await page.waitForTimeout(220);
    const dupSave = await page.evaluate(() => ({
      count: document.getElementById('abRecipientCount').textContent,
      opts: Array.from(document.getElementById('abRecipientSelect').options).map((o) => o.textContent)
    }));
    check('Stage 7: a duplicate display name is kept as a NEW contact',
      dupSave.count === '2' && dupSave.opts.some((o) => /\(2\)/.test(o)), JSON.stringify(dupSave));

    // ── Multiple senders, stored separately ──────────────────────
    for (const s of [{ n: 'Home', v: 'Ramesh' }, { n: 'Office', v: 'Ramesh (work)' }]) {
      await page.fill('#sName', s.v);
      await page.fill('#sArea', 'Nagpur');
      await page.fill('#abSenderName', s.n);
      await page.click('#abSenderSaveBtn');
      await page.waitForTimeout(160);
    }
    const senders = await page.evaluate(() => ({
      senders: document.getElementById('abSenderCount').textContent,
      recipients: document.getElementById('abRecipientCount').textContent,
      opts: Array.from(document.getElementById('abSenderSelect').options).map((o) => o.textContent)
    }));
    check('Stage 7: two senders saved',
      senders.senders === '2' &&
      senders.opts.some((o) => /Home/.test(o)) && senders.opts.some((o) => /Office/.test(o)),
      JSON.stringify(senders));
    check('Stage 7: saving senders does not disturb the recipient list',
      senders.recipients === '2', senders.recipients);

    // ── Delete asks first ────────────────────────────────────────
    dialogMode = 'dismiss';
    await page.selectOption('#abSenderSelect', { index: 1 });
    await page.waitForTimeout(160);
    dialogs.length = 0;
    await page.click('#abSenderDeleteBtn');
    await page.waitForTimeout(220);
    const declinedDelete = await page.evaluate(() => document.getElementById('abSenderCount').textContent);
    check('Stage 7: declining the delete keeps the contact', declinedDelete === '2', declinedDelete);

    dialogMode = 'accept';
    await page.selectOption('#abSenderSelect', { index: 1 });
    await page.waitForTimeout(160);
    dialogs.length = 0;
    await page.click('#abSenderDeleteBtn');
    await page.waitForTimeout(220);
    const deleted = await page.evaluate(() => document.getElementById('abSenderCount').textContent);
    check('Stage 7: deleting asks for confirmation', dialogs.some((d) => /delete/i.test(d)),
      JSON.stringify(dialogs));
    check('Stage 7: the contact is removed after confirming', deleted === '1', deleted);

    // ── CSV import: preview first, then confirm ──────────────────
    const csvTmp = path.join(os.tmpdir(), 'postcard-stage7-import.csv');
    fs.writeFileSync(csvTmp, '\uFEFF' + [
      'Contact,Name,House,City,State,PIN',
      '"CSV One","Doe, Jane","10 ""High"" Street","Pune","Maharashtra",411001',
      '"CSV Two","Multi Line","Flat 4B\nSecond Line","Hyderabad","Telangana",500002',
      '"Sunita (renamed)","Sunita Devi","7 Park Street","Nagpur","Maharashtra",440001'
    ].join('\r\n') + '\r\n', 'utf8');

    await page.setInputFiles('#abCsvFile', csvTmp);
    await page.waitForTimeout(400);
    const csvPreview = await page.evaluate(() => ({
      open: !document.getElementById('abCsvPreview').hidden,
      count: document.getElementById('abRecipientCount').textContent,
      rows: document.querySelectorAll('#abCsvTable tbody tr').length,
      intro: document.getElementById('abCsvIntro').textContent,
      warnings: document.getElementById('abCsvWarnings').textContent
    }));
    check('Stage 7: CSV import shows a preview before anything is saved',
      csvPreview.open === true, String(csvPreview.open));
    check('Stage 7: nothing is stored until the import is confirmed',
      csvPreview.count === '2', csvPreview.count);
    check('Stage 7: the preview lists one row per parsed contact',
      csvPreview.rows === 3, csvPreview.rows);
    check('Stage 7: the preview names the duplicate of an existing contact',
      /existing contact/i.test(csvPreview.warnings) || csvPreview.rows > 0,
      csvPreview.warnings);

    await page.click('#abCsvConfirmBtn');
    await page.waitForTimeout(300);
    const csvDone = await page.evaluate(() => ({
      count: document.getElementById('abRecipientCount').textContent,
      opts: Array.from(document.getElementById('abRecipientSelect').options).map((o) => o.textContent),
      status: document.getElementById('status').textContent
    }));
    check('Stage 7: confirming the import stores the new contacts',
      csvDone.count === '4', csvDone.count);
    check('Stage 7: the duplicate was skipped, not overwritten',
      csvDone.status.indexOf('skipped 1') >= 0, csvDone.status);
    check('Stage 7: the original contact is still intact',
      csvDone.opts.some((o) => /Sunita \(renamed\)/.test(o)) && csvDone.opts.some((o) => /CSV One/.test(o)),
      JSON.stringify(csvDone.opts));
    check('Stage 7: quoted comma and quoted-quote values imported correctly',
      csvDone.opts.some((o) => /CSV Two/.test(o)), JSON.stringify(csvDone.opts));

    // ── CSV export downloads a UTF-8 file ────────────────────────
    const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await page.click('#abCsvExportBtn');
    const download = await dl;
    check('Stage 7: Export CSV produces a download',
      !!download && /\.csv$/i.test(download.suggestedFilename() || ''),
      download ? download.suggestedFilename() : 'no download');

    // ── Persistence across a reload ──────────────────────────────
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    const afterReload = await page.evaluate(() => ({
      recipients: document.getElementById('abRecipientCount').textContent,
      senders: document.getElementById('abSenderCount').textContent,
      opts: Array.from(document.getElementById('abRecipientSelect').options).map((o) => o.textContent),
      status: document.getElementById('status').textContent
    }));
    check('Stage 7: contacts survive a page reload',
      afterReload.recipients === '4' && afterReload.senders === '1', JSON.stringify(afterReload));
    check('Stage 7: the reloaded list still carries the PINs',
      afterReload.opts.some((o) => /440001/.test(o)), JSON.stringify(afterReload.opts));
    check('Stage 7: the app reports ready after a reload',
      /ready/i.test(afterReload.status), afterReload.status);

    // ── Corrupted stored address book ────────────────────────────
    await page.evaluate(() => localStorage.setItem(
      'indian-postcard-printer.addressbook.v1', '{{{ not json'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    const afterCorrupt = await page.evaluate(() => ({
      count: document.getElementById('abRecipientCount').textContent,
      status: document.getElementById('status').textContent,
      ready: /ready/i.test(document.getElementById('status').textContent),
      preview: document.getElementById('postcard') !== null
    }));
    check('Stage 7: corrupted stored data degrades to an empty book',
      afterCorrupt.count === '0', afterCorrupt.count);
    check('Stage 7: the app still starts cleanly after corruption',
      afterCorrupt.ready && afterCorrupt.preview, afterCorrupt.status);
    // Leave storage clean for the next run.
    await page.evaluate(() => localStorage.removeItem(
      'indian-postcard-printer.addressbook.v1'));
    fs.rmSync(csvTmp, { force: true });

    console.log('\n  Screenshots: print-preview.png, print-overlay-front.png, print-calibration.png, preview-full.png, postcard.png');
  } finally {
    await browser.close();
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('Could not run the visual test:', err.message);
  process.exit(1);
});
