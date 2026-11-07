/**
 * Basic layout tests — run with:  node tests/layout.test.js
 * Verifies the measurements we agreed on (all values in mm).
 */

const { LAYOUT: L, ptToMm } = require('../js/layout.js');

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log('  PASS  ' + name);
  } else {
    failed += 1;
    console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + detail : ''));
  }
}

console.log('Postcard layout tests (all values in mm)\n');

// ── Card and sections ───────────────────────────────────────────────
check('Card width is 143 mm', L.cardWidthMm === 143, L.cardWidthMm);
check('Card height is 93 mm', L.cardHeightMm === 93, L.cardHeightMm);
check(
  'Section widths sum to 143 mm',
  L.senderSectionWidthMm + L.recipientSectionWidthMm === L.cardWidthMm,
  L.senderSectionWidthMm + ' + ' + L.recipientSectionWidthMm + ' = ' +
    (L.senderSectionWidthMm + L.recipientSectionWidthMm)
);
check(
  'Divider sits at 74 mm (equals sender section width)',
  L.dividerXMm === 74 && L.dividerXMm === L.senderSectionWidthMm,
  L.dividerXMm
);

// ── PIN row ─────────────────────────────────────────────────────────
check('PIN row width equals 48 mm', L.pin.rowWidthMm === 48, L.pin.rowWidthMm);
check('PIN boxes have zero gaps', L.pin.gapMm === 0, L.pin.gapMm);

// Boxes must be edge-to-edge: each box starts exactly where the previous ends.
const step = L.pin.boxWidthMm + L.pin.gapMm;
let contiguous = true;
for (let i = 1; i < L.pin.boxCount; i++) {
  const prevEnd = L.pin.firstBoxOffsetMm + (i - 1) * step + L.pin.boxWidthMm;
  const nextStart = L.pin.firstBoxOffsetMm + i * step;
  if (prevEnd !== nextStart) {
    contiguous = false;
    console.log('        box ' + i + ': prev ends at ' + prevEnd + ', next starts at ' + nextStart);
  }
}
check('Six PIN boxes touch edge-to-edge (no gaps)', contiguous);

check(
  'Six PIN boxes fit inside the 69 mm recipient section',
  L.pin.firstBoxOffsetMm + L.pin.rowWidthMm <= L.recipientSectionWidthMm,
  L.pin.firstBoxOffsetMm + ' + ' + L.pin.rowWidthMm + ' = ' +
    (L.pin.firstBoxOffsetMm + L.pin.rowWidthMm) + ' <= ' + L.recipientSectionWidthMm
);
check(
  'PIN row fits inside the card horizontally',
  L.pin.firstBoxXMm + L.pin.rowWidthMm <= L.cardWidthMm,
  L.pin.firstBoxXMm + ' + ' + L.pin.rowWidthMm + ' = ' +
    (L.pin.firstBoxXMm + L.pin.rowWidthMm) + ' <= ' + L.cardWidthMm
);
check(
  'PIN row starts 62 mm from the top and fits vertically',
  L.pin.rowTopMm === 62 && L.pin.rowTopMm + L.pin.boxHeightMm <= L.cardHeightMm,
  L.pin.rowTopMm + ' + ' + L.pin.boxHeightMm + ' <= ' + L.cardHeightMm
);
check('Each PIN box is 8 mm wide x 6 mm high',
  L.pin.boxWidthMm === 8 && L.pin.boxHeightMm === 6,
  L.pin.boxWidthMm + ' x ' + L.pin.boxHeightMm);
check('First PIN box is 17 mm from the recipient section left edge',
  L.pin.firstBoxOffsetMm === 17, L.pin.firstBoxOffsetMm);

// ── Recipient address ───────────────────────────────────────────────
check('Recipient first line starts 28.8 mm from the top (text sits on the rules)',
  L.recipient.firstLineTopMm === 28.8, L.recipient.firstLineTopMm);
check('Recipient line spacing is 0.65 cm (6.5 mm), ruler-measured',
  L.recipient.lineSpacingMm === 6.5, L.recipient.lineSpacingMm);
// The ruler measurements: first RULED LINE = stamp bottom + 6 mm,
// PIN row = stamp bottom + 34 mm.
const stampBottom = L.artwork.stamp.yMm + L.artwork.stamp.hMm;
check('Ruler: stamp bottom + 6 mm = first ruled line, + 34 mm = PIN row',
  Math.abs(stampBottom + 6 - L.artwork.ruledLineY(0)) < 0.01 &&
  Math.abs(stampBottom + 34 - L.pin.rowTopMm) < 0.01,
  'stamp bottom ' + stampBottom + ', rule 1 ' + L.artwork.ruledLineY(0).toFixed(2) +
  ', PIN ' + L.pin.rowTopMm);
check('Recipient accepts 5 lines but prints only 4 rules',
  L.recipient.lineCount === 5 && L.recipient.ruleCount === 4,
  L.recipient.lineCount + '/' + L.recipient.ruleCount);
check('Recipient margins are 6 mm each side',
  L.recipient.marginLeftMm === 6 && L.recipient.marginRightMm === 6,
  L.recipient.marginLeftMm + ' / ' + L.recipient.marginRightMm);

// ── Section 7 conflict: 69 mm section, 6 mm margins => 57 mm (NOT 60 mm) ──
check('Recipient address width is 57 mm (69 - 6 - 6), NOT 60 mm',
  L.recipient.widthMm === 57,
  L.recipient.widthMm + ' (expected 57)');
check('Recipient address width fits the section',
  L.recipient.widthMm === L.recipientSectionWidthMm - 12,
  L.recipient.widthMm);

const lastLineTop = L.recipient.firstLineTopMm + (L.recipient.lineCount - 1) * L.recipient.lineSpacingMm;
const lastLineBottom = lastLineTop + ptToMm(L.fontPointSize);
check(
  'Fifth address line clears the PIN row (top ' + L.pin.rowTopMm + ' mm)',
  lastLineBottom < L.pin.rowTopMm,
  'line bottom ' + lastLineBottom.toFixed(2) + ' < ' + L.pin.rowTopMm
);

// ── Typography and sender honesty ───────────────────────────────────
check('Default font size is 9 pt', L.fontPointSize === 9, L.fontPointSize);
check('9 pt = 3.18 mm', Math.abs(ptToMm(9) - 3.175) < 0.001, ptToMm(9));
check('Sender coordinates marked provisional (not measured)',
  L.sender.coordinatesConfirmed === false, L.sender.coordinatesConfirmed);

// ── Back side (provisional until the reverse photo is provided) ────
const b = L.back;
check('Back: card height accommodates the message area',
  b.marginTopMm + b.marginBottomMm < L.cardHeightMm,
  b.marginTopMm + ' + ' + b.marginBottomMm + ' < ' + L.cardHeightMm);
check('Back: message width inside the card',
  b.widthMm > 0 && b.marginLeftMm + b.marginRightMm < L.cardWidthMm,
  b.widthMm + ' mm wide');
check('Back: line capacity at 7 mm spacing (75 mm / 7 = 10 lines)',
  b.lineCapacity === 10, b.lineCapacity);
check('Back: line spacing leaves room for at least 8 lines', b.lineCapacity >= 8, b.lineCapacity);
check('Back: marked provisional (reverse not yet measured)',
  b.confirmed === false, b.confirmed);
check('Back: no printed-line option exists (reverse is blank)',
  b.layout === undefined, JSON.stringify(b.layout));

// ── Printed artwork (approximate, from the reference photo) ─────────
// These are decorative; the only hard requirement is that they stay
// inside the card so nothing is clipped.
const a = L.artwork;
check('Artwork: stamp inside the card',
  a.stamp.xMm >= 0 && a.stamp.yMm >= 0 &&
  a.stamp.xMm + a.stamp.wMm <= L.cardWidthMm &&
  a.stamp.yMm + a.stamp.hMm <= L.cardHeightMm,
  a.stamp.xMm + ',' + a.stamp.yMm + ' ' + a.stamp.wMm + 'x' + a.stamp.hMm);
check('Artwork: sorter bars inside the card',
  a.bars.xMm >= 0 && a.bars.xMm + a.bars.wMm <= L.cardWidthMm &&
  a.bars.yMm + a.bars.hMm <= L.cardHeightMm,
  a.bars.xMm + ',' + a.bars.yMm);
check('Artwork: AKAM logo block does not cross the divider',
  a.akam.xMm >= L.dividerXMm && a.akam.xMm + a.akam.wMm <= L.cardWidthMm,
  a.akam.xMm + ' to ' + (a.akam.xMm + a.akam.wMm));
check('Artwork: vertical heading sits beside the divider (right of 74 mm)',
  a.vheading.xMm > L.dividerXMm && a.vheading.xMm < L.dividerXMm + 6,
  a.vheading.xMm);
check('Artwork: PIN label left of the PIN boxes',
  a.pinLabel.rightMm <= L.pin.firstBoxXMm && a.pinLabel.rightMm > L.dividerXMm,
  a.pinLabel.rightMm + ' vs box at ' + L.pin.firstBoxXMm);
check('Artwork: PIN label vertically centred on the PIN row',
  Math.abs(a.pinLabel.centerYmMm - (L.pin.rowTopMm + L.pin.boxHeightMm / 2)) < 0.6,
  a.pinLabel.centerYmMm + ' vs ' + (L.pin.rowTopMm + L.pin.boxHeightMm / 2));
check('Artwork: bottom dashed line inside the card',
  a.dashedLine.yMm < L.cardHeightMm && a.dashedLine.toXMm <= L.cardWidthMm,
  a.dashedLine.yMm);
check('Artwork: bottom note above the dashed line',
  a.bottomNote.yMm < a.dashedLine.yMm,
  a.bottomNote.yMm + ' < ' + a.dashedLine.yMm);
check('Artwork: bottom note below the PIN row (do-not-write zone)',
  a.bottomNote.yMm > L.pin.rowTopMm + L.pin.boxHeightMm,
  a.bottomNote.yMm + ' > ' + (L.pin.rowTopMm + L.pin.boxHeightMm));

// Ruled lines: one under each recipient address line, clear of the PIN row.
// Only `ruleCount` rules print — the accepted 5th line has no rule.
for (let i = 0; i < L.recipient.ruleCount; i++) {
  const ruleY = a.ruledLineY(i);
  const lineTop = L.recipient.firstLineTopMm + i * L.recipient.lineSpacingMm;
  check('Artwork: ruled line ' + (i + 1) + ' under address line ' + (i + 1) +
        ' (' + ruleY.toFixed(1) + ' mm)',
    ruleY > lineTop && ruleY <= L.pin.rowTopMm,
    ruleY.toFixed(2) + ' (line at ' + lineTop + ', PIN at ' + L.pin.rowTopMm + ')');
}

// ── Result ──────────────────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
