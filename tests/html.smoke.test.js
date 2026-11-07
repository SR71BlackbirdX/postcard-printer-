/**
 * HTML/JS consistency tests — run with:  node tests/html.smoke.test.js
 * Verifies without a browser that:
 *   - every element id referenced from JS exists in index.html
 *   - every local file referenced by index.html exists on disk
 *   - the required UI elements and defaults are in place
 *   - the Print button is enabled (Stage 3+) and images are never persisted
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) { passed += 1; console.log('  PASS  ' + name); }
  else { failed += 1; console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
}

console.log('HTML / JS consistency tests\n');

// ── 1. Every id referenced from JS exists in index.html ─────────────
const htmlIds = new Set();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) htmlIds.add(m[1]);

const jsFiles = ['js/app.js', 'js/preview.js'];
const referenced = new Set();
for (const file of jsFiles) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of code.matchAll(/getElementById\('([^']+)'\)/g)) referenced.add(m[1]);
}
// IDs listed in app.js's ELEMENT_IDS array
const appCode = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const idsArray = appCode.match(/ELEMENT_IDS = \[([\s\S]*?)\]/);
if (idsArray) {
  for (const m of idsArray[1].matchAll(/'([^']+)'/g)) referenced.add(m[1]);
}
// Field ids referenced through the FIELD_IDS maps
for (const m of appCode.matchAll(/FIELD_IDS = \{([\s\S]*?)\n  \};/g)) {
  for (const mm of m[1].matchAll(/'([a-z][A-Za-z]+)'\s*:/g)) referenced.add(mm[1]);
}

const missing = [...referenced].filter((id) => !htmlIds.has(id));
check(
  'All ' + referenced.size + ' element ids referenced from JS exist in index.html',
  missing.length === 0,
  missing.join(', ')
);

// ── 1b. No duplicate element ids ────────────────────────────────────
// getElementById returns the FIRST match, so a duplicate id silently
// leaves every later copy with no handler (the Back tab's Refresh button
// was dead this way) and every getElementById target ambiguous.
const idList = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dupIds = [...new Set(idList.filter((id, i) => idList.indexOf(id) !== i))];
check('Element ids are unique in index.html (' + idList.length + ' ids)',
  dupIds.length === 0, dupIds.join(', '));

// ── 2. Every local file referenced by index.html exists ─────────────
const refs = [];
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const target = m[1];
  if (!/^(https?:|#|data:)/.test(target)) refs.push(target);
}
const missingFiles = refs
  .map((f) => f.split('?')[0])            // strip cache-busting query strings
  .filter((f) => !fs.existsSync(path.join(root, f)));
check(
  'All ' + refs.length + ' local files referenced by index.html exist',
  missingFiles.length === 0,
  missingFiles.join(', ')
);

// ── 3. Required UI elements are present ─────────────────────────────
const required = [
  'sName', 'rName', 'rPin', 'senderFontPt', 'recipientFontPt',
  'refreshBtn', 'saveBtn', 'printBtn', 'postcard', 'pinRow',
  'senderBlock', 'recipientBlock', 'previewPane', 'messageInput',
  'imageInput', 'imagePrintToggle', 'templateSelect',
  'printSideFront', 'printSideBack', 'printSideBoth',
  'printModeOverlay', 'printModeCard', 'printModeCalibration'
];
const absent = required.filter((id) => !htmlIds.has(id));
check('Required UI elements present in index.html', absent.length === 0, absent.join(', '));

// ── 4. Print button is ENABLED (printing implemented in Stage 3) ─────
const printBtnTag = html.match(/<button[^>]*id="printBtn"[^>]*>/);
const printEnabled = !!printBtnTag && !/\bdisabled\b/.test(printBtnTag[0]) &&
  /Print/.test(html.match(/<button[^>]*id="printBtn"[\s\S]*?<\/button>/)[0]);
check('Print button is enabled (Stage 3)', printEnabled);

// ── 5. Defaults ─────────────────────────────────────────────────────
const defaults = fs.readFileSync(path.join(root, 'js/settings.js'), 'utf8');
// No sample address ships with the app: a fresh card prints nothing.
check('Default sender fields are empty',
  defaults.includes('sender: emptyFields()') &&
  !/name:|house:|cityOrVillage:|state:/.test(
    defaults.slice(defaults.indexOf('const DEFAULT_SETTINGS'), defaults.indexOf('// Manual line overrides'))),
  'sample sender defaults still present');
check('Default recipient fields are empty',
  defaults.includes('recipient: emptyFields()') &&
  !defaults.includes("pin: '500001'"),
  'sample recipient defaults still present');
check('No sample address in the page placeholders',
  !/placeholder="[^"]*(Lake View|Park Street|Shivajinagar|Sunita|Ramesh|500001)/i.test(html),
  'a sample address is still pre-filled somewhere');
check('PIN Y offset default of 0.4 mm kept', /pinY:\s*0\.4/.test(defaults), 'pinY default missing');
check('Image pixels are never persisted', /never saved|session only/i.test(defaults));

// ── 6. Address module is wired into the page ────────────────────────
check('address.js script included', html.includes('js/address.js'));
const addrCode = fs.readFileSync(path.join(root, 'js/address.js'), 'utf8');
check('address.js exports its logic for tests', /module\.exports/.test(addrCode));

// ── 7. Cache-busting version stays in sync ──────────────────────────
const metaVersion = (html.match(/<meta name="app-version" content="(\d+)">/) || [])[1];
const jsVersion = (fs.readFileSync(path.join(root, 'js/app.js'), 'utf8')
  .match(/var APP_VERSION = (\d+);/) || [])[1];
check('HTML declares an app version', !!metaVersion, String(metaVersion));
check('app.js declares the matching version', metaVersion === jsVersion, metaVersion + ' vs ' + jsVersion);
check('Assets are cache-busted with a version query',
  /href="css\/style\.css\?v=\d+"/.test(html) && /src="js\/app\.js\?v=\d+"/.test(html));

// ── 8. Saved settings from an older version upgrade their defaults ───
global.window = { localStorage: { getItem: () => null, setItem: () => {} } };
const settingsMod = require(path.join(root, 'js/settings.js'));
const upgraded = settingsMod.sanitizeSettings({
  sender: { name: 'Ramesh', house: '42', cityOrVillage: 'Nagpur', state: 'MH', pin: '' },
  recipient: { name: 'S', house: '7', area: 'L', cityOrVillage: 'N', state: 'M', pin: '440001' },
  senderFontPt: 9,
  recipientFontPt: 9
  // no settingsVersion -> an old save
});
check('Old saved settings keep the user content',
  upgraded.sender.name === 'Ramesh' && upgraded.recipient.pin === '440001');
check('Old saved settings adopt the new font defaults',
  upgraded.senderFontPt === settingsMod.DEFAULT_SETTINGS.senderFontPt &&
  upgraded.recipientFontPt === settingsMod.DEFAULT_SETTINGS.recipientFontPt,
  upgraded.senderFontPt + '/' + upgraded.recipientFontPt);
const versioned = settingsMod.sanitizeSettings({
  senderFontPt: 11, recipientFontPt: 10, settingsVersion: settingsMod.SETTINGS_VERSION
});
check('Current saved settings keep their explicit font sizes',
  versioned.senderFontPt === 11 && versioned.recipientFontPt === 10);

// ── Result ──────────────────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
