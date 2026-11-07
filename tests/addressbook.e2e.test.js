/**
 * Address book end-to-end test — run with:  node tests\addressbook.e2e.test.js
 *
 * Drives the real app in Microsoft Edge (via the same server + Playwright
 * harness as e2e.test.js) through the Stage 7 workflow:
 *   save / duplicate names / select-to-load (preview + PIN boxes) /
 *   edit-without-touching-the-card / delete-with-confirm / new contact /
 *   multiple senders / persistence after reload / corrupted storage /
 *   CSV import with preview + duplicate handling / CSV export / clear data.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execSync } = require('child_process');

const root = path.join(__dirname, '..');
const SHOT_DIR = path.join(__dirname, 'e2e-ab-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const AB_KEY = 'indian-postcard-printer.addressbook.v1';
const SETTINGS_KEY = 'indian-postcard-printer.settings.v1';

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { passed += 1; console.log('  PASS  ' + name); }
  else {
    failed += 1;
    failures.push(name + (detail !== undefined ? ' -> ' + detail : ''));
    console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + detail : ''));
  }
}

/* ── Locate Playwright (local first, then global npm) ──────────────── */
let playwright;
try {
  playwright = require('playwright');
} catch (err) {
  const globalRoot = execSync('npm root -g').toString().trim();
  playwright = require(path.join(globalRoot, 'playwright'));
}

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

/** Current contents of one localStorage key in the page. */
const lsGet = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

(async () => {
  const PORT = await freePort();
  console.log('Address book end-to-end test\n');
  console.log('  Starting server on http://127.0.0.1:' + PORT + '/ …');

  const server = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const serverOut = [];
  server.stdout.on('data', (d) => serverOut.push(d.toString()));
  server.stderr.on('data', (d) => serverOut.push(d.toString()));

  const BASE = 'http://127.0.0.1:' + PORT + '/';
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try { if ((await fetch(BASE)).ok) up = true; } catch (e) { await sleep(250); }
  }
  check('Server starts and serves the homepage', up);

  const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') jsErrors.push(m.text()); });

  // Delete always asks first; the test decides per step what the user answers.
  let dialogMode = 'accept';
  let lastDialogMessage = '';
  page.on('dialog', (d) => {
    lastDialogMessage = d.message();
    if (dialogMode === 'accept') d.accept(); else d.dismiss();
  });

  await page.goto(BASE);
  await page.waitForSelector('#postcard');
  await sleep(400);

  /* ── 1. Empty state ────────────────────────────────────────────── */
  const empty = await page.evaluate(() => ({
    counts: [
      document.getElementById('abRecipientCount').textContent,
      document.getElementById('abSenderCount').textContent
    ],
    recipientOptions: document.getElementById('abRecipientSelect').options.length,
    loadDisabled: document.getElementById('abRecipientLoadBtn').disabled,
    editDisabled: document.getElementById('abRecipientEditBtn').disabled,
    deleteDisabled: document.getElementById('abRecipientDeleteBtn').disabled,
    editPanelHidden: document.getElementById('abEditPanel').hidden
  }));
  check('Empty book: both counts are 0',
    empty.counts[0] === '0' && empty.counts[1] === '0', JSON.stringify(empty.counts));
  check('Empty book: selects start with only a placeholder option',
    empty.recipientOptions === 1, String(empty.recipientOptions));
  check('Empty book: Load/Edit/Delete are disabled',
    empty.loadDisabled && empty.editDisabled && empty.deleteDisabled);
  check('Edit panel starts hidden', empty.editPanelHidden === true);

  // The section must be usable in the app's normal window (no sideways scroll).
  const layoutOk = await page.evaluate(() => {
    const panel = document.querySelector('.panel');
    const book = document.getElementById('addressBook');
    return {
      noPageHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
      bookFitsPanel: book.getBoundingClientRect().width <= panel.getBoundingClientRect().width + 1
    };
  });
  check('Address book fits the panel (no horizontal overflow)',
    layoutOk.noPageHScroll && layoutOk.bookFitsPanel, JSON.stringify(layoutOk));
  await page.screenshot({ path: path.join(SHOT_DIR, '01-empty-book.png') });

  /* ── 2. Save the current recipient ─────────────────────────────── */
  const settingsRaw = await lsGet(page, SETTINGS_KEY); // before any save
  await page.fill('#rName', 'Asha Sharma');
  await page.fill('#rHouse', 'Flat 4B, Door 12');
  await page.fill('#rArea', 'Kondapur, Hyderabad');
  await page.fill('#rDistrict', 'Telangana');
  await page.fill('#rPin', '500084');
  await sleep(250);
  await page.fill('#abRecipientName', 'Asha (friend)');
  await page.click('#abRecipientSaveBtn');
  await sleep(300);

  const afterSave = await page.evaluate(() => ({
    count: document.getElementById('abRecipientCount').textContent,
    options: document.getElementById('abRecipientSelect').options.length,
    nameCleared: document.getElementById('abRecipientName').value === '',
    status: document.getElementById('status').textContent
  }));
  check('Saving a recipient bumps the count to 1', afterSave.count === '1', afterSave.count);
  check('Saved contact appears in the select', afterSave.options === 2, String(afterSave.options));
  check('Save clears the display-name input', afterSave.nameCleared === true);
  check('Save reports success', /Saved/.test(afterSave.status), afterSave.status);

  /* ── Round-trip: the saved contact must reproduce the printed card ──
     Saving a recipient has to capture the WHOLE address, so loading it
     back needs no retyping: the printed card must come out identical. */
  const printedBeforeSave = await page.evaluate(() => ({
    card: document.getElementById('recipientBlock').textContent,
    pin: [...document.querySelectorAll('#pinRow .pin-box')].map((b) => b.textContent).join(''),
    fields: ['rName', 'rHouse', 'rArea', 'rDistrict', 'rPin']
      .map((id) => document.getElementById(id).value)
  }));
  // Wipe every field the form can show, then load the contact back.
  await page.fill('#rName', '');
  await page.fill('#rHouse', '');
  await page.fill('#rArea', '');
  await page.fill('#rDistrict', '');
  await page.fill('#rPin', '');
  await sleep(200);
  await page.click('#abRecipientLoadBtn');
  await sleep(300);
  const afterRoundTrip = await page.evaluate(() => ({
    card: document.getElementById('recipientBlock').textContent,
    pin: [...document.querySelectorAll('#pinRow .pin-box')].map((b) => b.textContent).join(''),
    fields: ['rName', 'rHouse', 'rArea', 'rDistrict', 'rPin']
      .map((id) => document.getElementById(id).value)
  }));
  check('Saved recipient loads back the exact printed card (no retyping)',
    afterRoundTrip.card === printedBeforeSave.card,
    JSON.stringify(printedBeforeSave.card) + ' vs ' + JSON.stringify(afterRoundTrip.card));
  check('Saved recipient restores the PIN boxes',
    afterRoundTrip.pin === printedBeforeSave.pin,
    printedBeforeSave.pin + ' vs ' + afterRoundTrip.pin);
  check('Saved recipient refills every address field',
    JSON.stringify(afterRoundTrip.fields) === JSON.stringify(printedBeforeSave.fields),
    JSON.stringify(printedBeforeSave.fields) + ' vs ' + JSON.stringify(afterRoundTrip.fields));
  // Regression: the saved contact is selected only AFTER its <option> is
  // rebuilt — otherwise Load/Edit/Delete would stay disabled after saving.
  const selectionAfterSave = await page.evaluate(() => ({
    value: document.getElementById('abRecipientSelect').value,
    editEnabled: !document.getElementById('abRecipientEditBtn').disabled,
    deleteEnabled: !document.getElementById('abRecipientDeleteBtn').disabled,
    loadEnabled: !document.getElementById('abRecipientLoadBtn').disabled
  }));
  check('Saving selects the new contact (Load/Edit/Delete become usable)',
    selectionAfterSave.value !== '' && selectionAfterSave.editEnabled &&
    selectionAfterSave.deleteEnabled && selectionAfterSave.loadEnabled,
    JSON.stringify(selectionAfterSave));

  const abKeyNow = await lsGet(page, AB_KEY);
  check('Address book uses its own storage key',
    abKeyNow !== null && JSON.parse(abKeyNow).recipients.length === 1);
  // Saving a contact must not create or alter the settings key (which is only
  // written by the explicit Save settings button).
  check('Saving a contact never touches the settings key',
    (await lsGet(page, SETTINGS_KEY)) === settingsRaw);

  /* ── 3. Duplicate display name ─────────────────────────────────── */
  await page.fill('#rName', 'Asha (office)');
  await page.fill('#rHouse', 'Plot 9, Road 5');
  await page.fill('#rArea', 'Hyderabad');
  await page.fill('#rDistrict', 'Telangana');
  await page.fill('#rPin', '500001');
  await page.fill('#abRecipientName', 'Asha (friend)');
  await page.click('#abRecipientSaveBtn');
  await sleep(300);
  const dupe = await page.evaluate(() => ({
    count: document.getElementById('abRecipientCount').textContent,
    status: document.getElementById('status').textContent,
    names: [...document.getElementById('abRecipientSelect').options].map((o) => o.textContent)
  }));
  check('Duplicate display name keeps BOTH contacts (count 2)',
    dupe.count === '2', dupe.count);
  check('Duplicate gets a numeric suffix, nothing overwritten',
    dupe.names.some((n) => n.indexOf('(2)') >= 0), JSON.stringify(dupe.names));
  check('Save explains the rename',
    /already used|number was added/.test(dupe.status), dupe.status);

  /* ── 4. Persistence after reload ───────────────────────────────── */
  await page.reload();
  await page.waitForSelector('#postcard');
  await sleep(400);
  const afterReload = await page.evaluate(() => ({
    count: document.getElementById('abRecipientCount').textContent,
    options: document.getElementById('abRecipientSelect').options.length
  }));
  check('Contacts survive a page reload',
    afterReload.count === '2' && afterReload.options === 3,
    JSON.stringify(afterReload));
  await page.screenshot({ path: path.join(SHOT_DIR, '02-after-reload.png') });

  /* ── 5. Selecting a contact loads it immediately ───────────────── */
  const firstId = await page.evaluate(() =>
    document.getElementById('abRecipientSelect').options[1].value);
  await page.selectOption('#abRecipientSelect', firstId);
  await sleep(350);
  const loaded = await page.evaluate(() => ({
    rName: document.getElementById('rName').value,
    rHouse: document.getElementById('rHouse').value,
    rPin: document.getElementById('rPin').value,
    preview: document.getElementById('recipientBlock').textContent,
    pin: [...document.querySelectorAll('#pinRow .pin-box')].map((b) => b.textContent).join(''),
    loadEnabled: !document.getElementById('abRecipientLoadBtn').disabled
  }));
  check('Selecting a contact fills the To fields immediately',
    loaded.rName === 'Asha Sharma' && loaded.rHouse === 'Flat 4B, Door 12',
    loaded.rName + ' / ' + loaded.rHouse);
  check('Preview updates immediately (name + multiline-safe lines)',
    loaded.preview.indexOf('Asha Sharma') >= 0 &&
    loaded.preview.indexOf('Flat 4B, Door 12') >= 0, JSON.stringify(loaded.preview));
  check('PIN boxes update to the contact PIN', loaded.pin === '500084', loaded.pin);
  check('Load/Edit/Delete enable once a contact is selected', loaded.loadEnabled === true);
  await page.screenshot({ path: path.join(SHOT_DIR, '03-contact-loaded.png') });

  /* ── 6. Editing a contact does not touch the card until Load ───── */
  const contactId = firstId;
  await page.click('#abRecipientEditBtn');
  await sleep(250);
  const editOpen = await page.evaluate(() => ({
    hidden: document.getElementById('abEditPanel').hidden,
    house: document.getElementById('abEditField_house').value
  }));
  check('Edit opens the panel with the contact fields',
    editOpen.hidden === false && editOpen.house === 'Flat 4B, Door 12',
    JSON.stringify(editOpen));

  await page.fill('#abEditField_house', 'Flat 7C, Tower B');
  await page.click('#abEditSaveBtn');
  await sleep(300);
  const afterEdit = await page.evaluate(() => ({
    rHouse: document.getElementById('rHouse').value,
    preview: document.getElementById('recipientBlock').textContent,
    status: document.getElementById('status').textContent
  }));
  check('Editing a contact does NOT change the loaded card by itself',
    afterEdit.rHouse === 'Flat 4B, Door 12' &&
    afterEdit.preview.indexOf('Flat 4B, Door 12') >= 0, JSON.stringify(afterEdit));
  check('Edit explains the card is unchanged until Load',
    /click Load/i.test(afterEdit.status), afterEdit.status);

  await page.click('#abRecipientLoadBtn');
  await sleep(300);
  const afterLoadEdited = await page.evaluate(() => ({
    rHouse: document.getElementById('rHouse').value,
    preview: document.getElementById('recipientBlock').textContent
  }));
  check('Load puts the edited contact on the card',
    afterLoadEdited.rHouse === 'Flat 7C, Tower B' &&
    afterLoadEdited.preview.indexOf('Flat 7C, Tower B') >= 0,
    JSON.stringify(afterLoadEdited));

  // The stored contact really changed — a reload keeps the edit.
  const storedContact = await page.evaluate((id) => {
    const book = JSON.parse(localStorage.getItem('indian-postcard-printer.addressbook.v1') || '{}');
    const c = (book.recipients || []).find((x) => x.id === id);
    return c ? c.fields.house : null;
  }, contactId);
  check('The edited value is what got stored',
    storedContact === 'Flat 7C, Tower B', storedContact);

  /* ── 7. Delete always confirms ─────────────────────────────────── */
  dialogMode = 'dismiss';
  await page.click('#abRecipientDeleteBtn');
  await sleep(300);
  const kept = await page.evaluate(() => document.getElementById('abRecipientCount').textContent);
  check('Delete asks first — cancelling keeps the contact',
    kept === '2' && /Delete/.test(lastDialogMessage), kept + ' / ' + lastDialogMessage);

  dialogMode = 'accept';
  await page.click('#abRecipientDeleteBtn');
  await sleep(300);
  const gone = await page.evaluate(() => ({
    count: document.getElementById('abRecipientCount').textContent,
    card: document.getElementById('recipientBlock').textContent
  }));
  check('Confirming removes exactly that contact',
    gone.count === '1', gone.count);
  check('Deleting does not clear the card form', gone.card.indexOf('Asha Sharma') >= 0);

  /* ── 8. New recipient (blank edit panel) ───────────────────────── */
  await page.click('#abRecipientNewBtn');
  await sleep(250);
  const newPanel = await page.evaluate(() => ({
    hidden: document.getElementById('abEditPanel').hidden,
    legend: document.getElementById('abEditLegend').textContent,
    blank: document.getElementById('abEditField_name').value === ''
  }));
  check('New recipient opens a BLANK edit panel',
    newPanel.hidden === false && newPanel.legend === 'New recipient' && newPanel.blank,
    JSON.stringify(newPanel));
  await page.fill('#abEditName', 'Cousin Vinod');
  await page.fill('#abEditField_house', '9 Mall Road');
  await page.fill('#abEditField_cityOrVillage', 'Pune');
  await page.fill('#abEditField_state', 'Maharashtra');
  await page.fill('#abEditField_pin', '411001');
  await page.click('#abEditSaveBtn');
  await sleep(300);
  const newSaved = await page.evaluate(() => ({
    count: document.getElementById('abRecipientCount').textContent,
    panelClosed: document.getElementById('abEditPanel').hidden
  }));
  check('A brand-new contact saves and the panel closes',
    newSaved.count === '2' && newSaved.panelClosed, JSON.stringify(newSaved));

  /* ── 9. Multiple senders, default untouched ────────────────────── */
  const defaultsUntouched = await page.evaluate(() =>
    document.getElementById('sName').value);
  check('Sender stays empty until explicitly saved/loaded (no sample address)',
    defaultsUntouched === '', JSON.stringify(defaultsUntouched));

  await page.fill('#sName', 'Me (home)');
  await page.fill('#sHouse', '12 Lake Road');
  await page.fill('#sArea', 'Nagpur');
  await page.fill('#sDistrict', 'Maharashtra');
  await page.fill('#abSenderName', 'Home');
  await page.click('#abSenderSaveBtn');
  await sleep(250);
  await page.fill('#sName', 'Me (office)');
  await page.fill('#sHouse', 'Plot 5, MIDC');
  await page.fill('#sArea', 'Mumbai');
  await page.fill('#sDistrict', 'Maharashtra');
  await page.fill('#abSenderName', 'Office');
  await page.click('#abSenderSaveBtn');
  await sleep(300);
  const sendersSaved = await page.evaluate(() => ({
    count: document.getElementById('abSenderCount').textContent,
    options: document.getElementById('abSenderSelect').options.length
  }));
  check('Two senders are saved side by side',
    sendersSaved.count === '2' && sendersSaved.options === 3,
    JSON.stringify(sendersSaved));

  // Wipe the From form, then load "Home" back.
  await page.fill('#sName', '');
  await page.fill('#sHouse', '');
  await page.fill('#sArea', '');
  await page.fill('#sDistrict', '');
  await sleep(200);
  const homeId = await page.evaluate(() =>
    document.getElementById('abSenderSelect').options[1].value);
  await page.selectOption('#abSenderSelect', homeId);
  await sleep(300);
  const senderLoaded = await page.evaluate(() => ({
    sName: document.getElementById('sName').value,
    preview: document.getElementById('senderBlock').textContent,
    pin: document.getElementById('sPin').value
  }));
  check('A saved sender loads back into the From fields',
    senderLoaded.sName === 'Me (home)' && senderLoaded.preview.indexOf('12 Lake Road') >= 0,
    JSON.stringify(senderLoaded));
  check('Sender PIN round-trips', senderLoaded.pin === '', JSON.stringify(senderLoaded.pin));

  /* ── 10. CSV import: preview, Unicode, multiline, dupes, PINs ──── */
  // Recipients right now: "Asha (friend) (2)" (Name "Asha (office)",
  // PIN 500001, Hyderabad — the original "Asha (friend)" was deleted above)
  // and "Cousin Vinod" (PIN 411001). So row B duplicates the survivor.
  const csv = '\uFEFF' +
    'Contact,Name,House,Building,Street,Area,City,District,State,PIN\n' +
    '"NRI uncle","मोहन लाल","Flat 4B, Door 12",,,Kondapur,Hyderabad,,Kerala,682001\n' +
    '"Asha dup","Asha (office)","Plot 9, Road 5",,,Kondapur,Hyderabad,,Telangana,500001\n' +
    '"Old aunt","Savitri","7 Park Street\nopp. the school",,,Shivajinagar,Nagpur,,Maharashtra,1234\n';
  const CSV_PATH = path.join(require('os').tmpdir(), 'ab-e2e-import.csv');
  fs.writeFileSync(CSV_PATH, csv, 'utf8');

  const beforeImportCount = Number(await page.evaluate(() =>
    document.getElementById('abRecipientCount').textContent));
  await page.setInputFiles('#abCsvFile', CSV_PATH);
  await sleep(500);
  const preview = await page.evaluate(() => ({
    hidden: document.getElementById('abCsvPreview').hidden,
    count: document.getElementById('abCsvCount').textContent,
    rows: document.querySelectorAll('#abCsvTable tbody tr').length,
    warnings: document.getElementById('abCsvWarnings').textContent,
    status: document.getElementById('status').textContent
  }));
  check('CSV preview appears and shows every row',
    preview.hidden === false && preview.rows === 3, JSON.stringify(preview));
  check('Preview asks for confirmation before saving anything',
    /confirm/i.test(preview.status), preview.status);
  check('Invalid PIN 1234 is warned about but the row is kept',
    /1234/.test(preview.warnings), preview.warnings);
  const flagged = await page.evaluate(() =>
    [...document.querySelectorAll('#abCsvTable tbody tr')]
      .some((tr) => /Matches an existing contact/.test(tr.textContent)));
  check('The existing look-alike is flagged in the preview', flagged);
  check('Import count still unchanged until confirm',
    (await page.evaluate(() =>
      document.getElementById('abRecipientCount').textContent)) === String(beforeImportCount));

  await page.screenshot({ path: path.join(SHOT_DIR, '04-csv-preview.png') });

  // Skip-duplicates is the default: confirm and check what got in.
  await page.click('#abCsvConfirmBtn');
  await sleep(400);
  const imported = await page.evaluate(() => ({
    count: document.getElementById('abRecipientCount').textContent,
    status: document.getElementById('status').textContent,
    previewHidden: document.getElementById('abCsvPreview').hidden,
    stored: JSON.parse(localStorage.getItem('indian-postcard-printer.addressbook.v1') || '{}')
  }));
  check('Confirm imports the NEW rows and skips the duplicate',
    imported.status.indexOf('Imported 2') >= 0 && imported.status.indexOf('skipped 1') >= 0,
    imported.status);
  check('Book grows by exactly the two new contacts',
    imported.count === String(beforeImportCount + 2), imported.count);
  check('Preview closes after import', imported.previewHidden === true);

  const importedUnicode = imported.stored.recipients.find((c) => c.name === 'NRI uncle');
  check('Unicode contact is stored correctly',
    !!importedUnicode && importedUnicode.fields.name === 'मोहन लाल',
    JSON.stringify(importedUnicode));
  check('Quoted comma inside the address survived',
    !!importedUnicode && importedUnicode.fields.house === 'Flat 4B, Door 12');
  const importedMulti = imported.stored.recipients.find((c) => c.name === 'Old aunt');
  check('Multiline quoted value survived (line break kept)',
    !!importedMulti && importedMulti.fields.house.indexOf('\nopp. the school') >= 0,
    JSON.stringify(importedMulti && importedMulti.fields.house));
  check('Incomplete PIN is kept, not discarded',
    !!importedMulti && importedMulti.fields.pin === '1234');

  const untouched = imported.stored.recipients.find((c) => c.name === 'Asha (friend) (2)');
  check('Existing contact was NOT changed or duplicated by the import',
    !!untouched && untouched.fields.house === 'Plot 9, Road 5' &&
    imported.stored.recipients.filter((c) => c.name.indexOf('Asha (friend)') === 0).length === 1,
    JSON.stringify(imported.stored.recipients.map((c) => c.name)));

  // Cancel path: preview again, then cancel — nothing saved.
  await page.setInputFiles('#abCsvFile', CSV_PATH);
  await sleep(500);
  const beforeCancel = Number(await page.evaluate(() =>
    document.getElementById('abRecipientCount').textContent));
  await page.click('#abCsvCancelBtn');
  await sleep(300);
  const cancelled = await page.evaluate(() => ({
    count: document.getElementById('abRecipientCount').textContent,
    hidden: document.getElementById('abCsvPreview').hidden,
    status: document.getElementById('status').textContent
  }));
  check('Cancelling the import saves nothing',
    cancelled.count === String(beforeCancel) && cancelled.hidden &&
    /cancelled/i.test(cancelled.status), JSON.stringify(cancelled));

  /* ── 11. CSV export round-trip ─────────────────────────────────── */
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#abCsvExportBtn')
  ]);
  const exportPath = path.join(require('os').tmpdir(), 'ab-e2e-export.csv');
  await download.saveAs(exportPath);
  const exported = fs.readFileSync(exportPath, 'utf8');
  check('Export writes a UTF-8 BOM for Excel',
    exported.charCodeAt(0) === 0xFEFF, 'first code unit ' + exported.charCodeAt(0));
  check('Export uses the documented header row',
    exported.slice(1).split('\n')[0].replace(/\r$/, '') ===
    'Contact,Name,House,Building,Street,Area,City,District,State,PIN',
    exported.slice(0, 90));
  check('Export contains the saved contacts',
    exported.indexOf('NRI uncle') >= 0 && exported.indexOf('मोहन लाल') >= 0);

  // Export -> import must round-trip: import the export into a clean book.
  await page.evaluate((key) => localStorage.removeItem(key), AB_KEY);
  await page.reload();
  await page.waitForSelector('#postcard');
  await sleep(400);
  await page.setInputFiles('#abCsvFile', exportPath);
  await sleep(500);
  await page.click('#abCsvConfirmBtn');
  await sleep(400);
  const roundTrip = await page.evaluate(() => ({
    count: document.getElementById('abRecipientCount').textContent,
    stored: JSON.parse(localStorage.getItem('indian-postcard-printer.addressbook.v1') || '{}')
  }));
  const rtUnicode = (roundTrip.stored.recipients || []).find((c) => c.name === 'NRI uncle');
  check('Export/import round-trip restores every contact',
    Number(roundTrip.count) >= 3 && !!rtUnicode, roundTrip.count);
  check('Round-trip keeps Unicode and commas intact',
    !!rtUnicode && rtUnicode.fields.name === 'मोहन लाल' &&
    rtUnicode.fields.house === 'Flat 4B, Door 12');

  /* ── 12. Clear data clears the book too ────────────────────────── */
  await page.click('#tabPrintBtn');
  await sleep(200);
  await page.click('#clearDataBtn');
  await sleep(300);
  await page.click('#tabFrontBtn');
  await sleep(200);
  const cleared = await page.evaluate(() => ({
    count: document.getElementById('abRecipientCount').textContent,
    senderCount: document.getElementById('abSenderCount').textContent,
    abKey: localStorage.getItem('indian-postcard-printer.addressbook.v1'),
    sName: document.getElementById('sName').value
  }));
  check('Clear saved data empties the address book as well',
    cleared.count === '0' && cleared.senderCount === '0' && cleared.abKey === null,
    JSON.stringify(cleared));
  check('Clear still restores an empty sender',
    cleared.sName === '', JSON.stringify(cleared.sName));

  /* ── 13. Corrupted stored book degrades gracefully ─────────────── */
  await page.evaluate((key) => localStorage.setItem(key, '{this is not json'), AB_KEY);
  await page.reload();
  await page.waitForSelector('#postcard');
  await sleep(400);
  const corrupt = await page.evaluate(() => ({
    status: document.getElementById('status').textContent,
    count: document.getElementById('abRecipientCount').textContent,
    options: document.getElementById('abRecipientSelect').options.length
  }));
  check('Corrupted stored data: app still loads Ready',
    corrupt.status.indexOf('Ready') === 0, corrupt.status);
  check('Corrupted stored data: book starts empty, UI usable',
    corrupt.count === '0' && corrupt.options === 1, JSON.stringify(corrupt));

  // And saving after corruption works again.
  await page.fill('#rName', 'Fresh Start');
  await page.fill('#rArea', 'Goa');
  await page.fill('#abRecipientName', 'Fresh');
  await page.click('#abRecipientSaveBtn');
  await sleep(300);
  const recovered = await page.evaluate(() =>
    document.getElementById('abRecipientCount').textContent);
  check('Saving still works after corrupted data', recovered === '1', recovered);

  /* ── 13b. What you SEE on the card is what gets saved ───────────────
     Typing straight onto the card writes the manual line override, NOT the
     form fields. Saving must capture those printed lines — otherwise the
     contact saves stale fields and the card comes back different. */
  await page.click('#recipientBlock');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Card Typed Name');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Card Line 2, Pune');
  await page.click('#sName');                       // blur -> writes the override
  await sleep(300);
  const cardShown = await page.evaluate(() =>
    document.getElementById('recipientBlock').innerText.replace(/\s+$/, ''));
  // Display name left blank: the printed name must be used instead.
  await page.fill('#abRecipientName', '');
  await page.click('#abRecipientSaveBtn');
  await sleep(300);
  const cardSave = await page.evaluate(() => ({
    status: document.getElementById('status').textContent,
    options: [...document.getElementById('abRecipientSelect').options].map((o) => o.textContent)
  }));
  check('Saving after an on-card edit still succeeds',
    /Saved/.test(cardSave.status), cardSave.status);
  check('Blank display name is taken from the name printed on the card',
    cardSave.options.some((o) => o.indexOf('Card Typed Name') >= 0),
    JSON.stringify(cardSave.options));

  // Wipe the card entirely, load the contact back, compare with the card.
  await page.fill('#rName', '');
  await page.fill('#rHouse', '');
  await page.fill('#rArea', '');
  await page.fill('#rDistrict', '');
  await page.fill('#rPin', '');
  await sleep(200);
  await page.click('#abRecipientLoadBtn');
  await sleep(300);
  const cardReloaded = await page.evaluate(() =>
    document.getElementById('recipientBlock').innerText.replace(/\s+$/, ''));
  check('A card-typed address round-trips exactly (no retyping)',
    cardReloaded === cardShown, JSON.stringify(cardShown) + ' vs ' + JSON.stringify(cardReloaded));

  /* ── 14. No JS errors during the whole workflow ────────────────── */
  check('No JavaScript errors during the whole workflow',
    jsErrors.length === 0, JSON.stringify(jsErrors));

  await page.screenshot({ path: path.join(SHOT_DIR, '05-final.png') });
  await browser.close();

  server.kill();
  await new Promise((r) => server.on('exit', r));
  check('Server stops cleanly', true);

  console.log('\n============================================================');
  console.log('ADDRESS BOOK E2E RESULT: ' + passed + ' passed, ' + failed + ' failed');
  console.log('Screenshots: ' + SHOT_DIR);
  console.log('============================================================');
  if (failed) {
    failures.forEach((f) => console.log('  FAILED: ' + f));
    process.exit(1);
  }
  process.exit(0);
})().catch((err) => {
  console.error('Address book e2e crashed:', err);
  process.exit(1);
});
