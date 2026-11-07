/**
 * Address assembly + text-fitting tests — run with:
 *     node tests\address.test.js
 *
 * Uses a deterministic stub measurer (0.5 em ≈ half the font size in mm,
 * a reasonable average for a proportional sans font) so wrapping can be
 * verified without a browser. Real rendering is measured in the browser
 * by the visual test.
 */

const {
  assembleAddress, wrapLines, computeFitStatus,
  findFittingFontSize, statusForFontSize, maxCharsForFont,
  FIT_FITS, FIT_TOO_MANY_LINES, FIT_TOO_WIDE
} = require('../js/address.js');

const ptToMm = (pt) => pt * 25.4 / 72;

/** Stub measurer: every character is half a font-size wide. */
function measure(text, fontPt) {
  return String(text).length * 0.5 * ptToMm(fontPt);
}

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) { passed += 1; console.log('  PASS  ' + name); }
  else { failed += 1; console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
}

console.log('Address assembly and fit tests\n');

// ── Assembly ────────────────────────────────────────────────────────
const full = {
  name: 'Asha Sharma',
  house: 'Flat 4B',
  building: 'Sunrise Apartments',
  street: 'MG Road',
  area: 'Kondapur',
  cityOrVillage: 'Hyderabad',
  district: 'Rangareddy',
  state: 'Telangana',
  pin: '500084'
};
const lines = assembleAddress(full, true); // sender: PIN printed as a line
check('Assembly: fields group onto the four ruled lines (postal order)',
  JSON.stringify(lines) === JSON.stringify([
    'Asha Sharma', 'Flat 4B, MG Road', 'Kondapur, Hyderabad',
    'Rangareddy, Telangana', 'PIN 500084'
  ]), JSON.stringify(lines));
check('Assembly: building is never printed',
  !lines.join('|').includes('Sunrise Apartments'), JSON.stringify(lines));

// Regression: a fully filled form used to emit 6 recipient lines, so the
// locality/state tail fell past line 4 and never printed on the card.
check('Assembly: fully filled recipient fits the 4-line card',
  assembleAddress(full, false).length === 4,
  assembleAddress(full, false).length + ' lines');

// The recipient PIN belongs in the six boxes, never as an address line.
check('Assembly: recipient PIN is NOT an address line',
  !assembleAddress(full, false).includes('PIN 500084'),
  JSON.stringify(assembleAddress(full, false)));

const minimal = { name: 'Ravi', house: '12', street: 'Station Road', cityOrVillage: 'Pune', state: 'Maharashtra' };
const minLines = assembleAddress(minimal);
check('Assembly: optional fields omitted when empty',
  JSON.stringify(minLines) === JSON.stringify(['Ravi', '12, Station Road', 'Pune', 'Maharashtra']),
  JSON.stringify(minLines));
check('Assembly: labels never appear in printed lines',
  minLines.every((l) => !/name|street|city|state|pin\s*:/i.test(l.replace('PIN ', ''))));

// Multi-line fields: each line becomes its own printed line, in order.
const multi = assembleAddress({
  name: 'Asha Sharma',
  house: 'Flat 4B\nNear Water Tank\nBlock C',
  cityOrVillage: 'Hyderabad',
  state: 'Telangana'
}, false);
check('Assembly: a multi-line field becomes several printed lines',
  JSON.stringify(multi) === JSON.stringify([
    'Asha Sharma', 'Flat 4B', 'Near Water Tank', 'Block C',
    'Hyderabad', 'Telangana'
  ]), JSON.stringify(multi));
check('Assembly: blank lines inside a field are skipped',
  assembleAddress({ name: 'A\n\n\nB' }, false).length === 2);
check('Assembly: empty address produces no lines', assembleAddress({}).length === 0);
check('Assembly: whitespace-only fields are omitted',
  assembleAddress({ name: '  ', house: '' }).length === 0);
check('Assembly: sender PIN is optional (omitted when empty)',
  assembleAddress({ name: 'X', pin: '' }).length === 1);
check('Assembly: sender PIN prints on its own line when supplied',
  assembleAddress({ name: 'X', pin: '110001' }, true).join('|').includes('PIN 110001'));
check('Assembly: non-digits stripped from PIN',
  assembleAddress({ name: 'X', pin: '50-00 84' }, true).join('|').includes('PIN 500084'));
check('Assembly: city prints with area, state with district',
  JSON.stringify(assembleAddress({ name: 'A', cityOrVillage: 'Chennai', state: 'TN' })) ===
    JSON.stringify(['A', 'Chennai', 'TN']));

// ── Wrapping (measured widths) ──────────────────────────────────────
const short = wrapLines(['Asha Sharma'], 57, 9, measure);
check('Wrapping: a short line is untouched',
  short.lines.length === 1 && short.lines[0] === 'Asha Sharma' && short.tooWide === null,
  JSON.stringify(short));

// 0.5 em per char at 9 pt = 1.59 mm/char; 57 mm fits ~35 chars.
const longLine = 'Sunrise Apartments Kondapur Hyderabad Telangana India';
const wrapped = wrapLines([longLine], 57, 9, measure);
check('Wrapping: long text wraps to multiple lines',
  wrapped.lines.length > 1, wrapped.lines.length + ' lines');
check('Wrapping: no wrapped line exceeds the available width',
  wrapped.lines.every((l) => measure(l, 9) <= 57),
  wrapped.lines.map((l) => measure(l, 9).toFixed(1)).join(', '));
check('Wrapping: all original words are preserved (none cut)',
  wrapped.lines.join(' ').split(/\s+/).sort().join(' ') === longLine.split(/\s+/).sort().join(' '));

check('Wrapping: explicit newlines create separate lines',
  wrapLines(['A', 'B'], 57, 9, measure).lines.length === 2);

// A single word wider than the line must be reported, not silently clipped.
const wordTooWide = wrapLines(['Extremelylongsinglenamethatwillnotfitanywhere'], 57, 9, measure);
check('Wrapping: an over-long word is reported as tooWide', wordTooWide.tooWide !== null);
check('Wrapping: an over-long word is still kept whole (not cut)',
  wordTooWide.lines[0] === 'Extremelylongsinglenamethatwillnotfitanywhere',
  wordTooWide.lines[0]);

// ── Fixed character limit per line ───────────────────────────────────
const atLimit = wrapLines(['ABCDEFGHIJ'], 57, 9, measure, 5);
check('Limit: lines never exceed the limit (hard break)',
  atLimit.lines.length === 2 && atLimit.lines.every((l) => l.length <= 5),
  JSON.stringify(atLimit.lines));
check('Limit: hard breaks keep every character',
  atLimit.lines.join('') === 'ABCDEFGHIJ', atLimit.lines.join(''));

const wordLimit = wrapLines(['alpha beta gamma'], 57, 9, measure, 8);
// 16 chars fit the full line while they measure within 57 mm — the
// character limit only hard-breaks a single over-long word, it never
// cuts a line short of the measured width.
check('Limit: 16 chars stay on one line while they measure within 57 mm',
  wordLimit.lines.length === 1 && wordLimit.lines[0] === 'alpha beta gamma',
  JSON.stringify(wordLimit.lines));
check('Limit: words are preserved (none cut)',
  wordLimit.lines.join(' ').split(/\s+/).sort().join(' ') ===
  'alpha beta gamma'.split(/\s+/).sort().join(' '), JSON.stringify(wordLimit.lines));

// No limit supplied -> unlimited (backwards compatible).
const noLimit = wrapLines(['ABCDEFGHIJKLMNOPQRSTUVWXYZ'], 57, 9, measure);
check('Limit: omitted limit means no character limit',
  noLimit.lines.length === 1, noLimit.lines.length + ' lines');

// A smaller font must use the whole line: the chars-per-line limit is
// derived from the physical width only, never capped by a fixed maximum.
check('Chars: default 9 pt keeps the measured 32 chars/line',
  maxCharsForFont(57, 9) === 32, maxCharsForFont(57, 9));
check('Chars: a smaller font allows MORE characters on the same line',
  maxCharsForFont(57, 6) > maxCharsForFont(57, 9) && maxCharsForFont(57, 13) < maxCharsForFont(57, 9),
  maxCharsForFont(57, 6) + ' / ' + maxCharsForFont(57, 9) + ' / ' + maxCharsForFont(57, 13));

// ── Fit status ──────────────────────────────────────────────────────
check('Status: fits when within line capacity',
  computeFitStatus(4, 4, null) === FIT_FITS);
check('Status: too many lines beyond capacity',
  computeFitStatus(5, 4, null) === FIT_TOO_MANY_LINES);
check('Status: too wide takes precedence over line count',
  computeFitStatus(1, 4, { word: 'x' }) === FIT_TOO_WIDE);

const status = statusForFontSize(['Asha Sharma', 'Flat 4B', 'Kondapur'], 57, 4, 9, measure);
check('Status: short address fits at 9 pt', status.status === FIT_FITS, status.status);

const tooMany = statusForFontSize(
  ['line one', 'line two', 'line three', 'line four', 'line five', 'line six'],
  57, 4, 9, measure);
check('Status: address exceeding 4 lines reports Too many lines',
  tooMany.status === FIT_TOO_MANY_LINES, tooMany.status + ' (' + tooMany.lines.length + ' lines)');

// ── Fit-text (explicit action) ──────────────────────────────────────
const longAddress = [
  'Asha Sharma', 'Flat 4B Sunrise Apartments Kondapur',
  'MG Road Hyderabad Rangareddy Telangana', 'Near Water Tank India'
];
const fitted = findFittingFontSize(longAddress, 57, 4, measure, 9, 6);
check('Fit text: finds a smaller font that fits when 9 pt does not',
  fitted !== null && fitted < 9, 'fitted at ' + fitted + ' pt');
check('Fit text: chosen size really fits',
  (() => {
    const r = wrapLines(longAddress, 57, fitted, measure);
    return !r.tooWide && r.lines.length <= 4;
  })(), fitted + ' pt');
check('Fit text: returns null when nothing in the range fits',
  findFittingFontSize(['a'.repeat(200)], 57, 4, measure, 9, 6) === null);
check('Fit text: no change needed when 9 pt already fits',
  findFittingFontSize(['Asha Sharma'], 57, 4, measure, 9, 6) === 9);

// ── Result ──────────────────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
