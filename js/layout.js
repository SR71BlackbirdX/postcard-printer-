/**
 * layout.js — Physical layout of the Indian inland postcard.
 *
 * SINGLE SOURCE OF TRUTH for every physical measurement.
 * ALL VALUES ARE IN MILLIMETRES (mm) unless the name ends in "_pt" (points).
 *
 * How mm becomes screen pixels (documented DPI):
 *   The browser uses the CSS standard screen resolution of 96 DPI,
 *   i.e. 1 inch = 96 CSS pixels and 1 inch = 25.4 mm, therefore
 *       1 mm = 96 / 25.4 = 3.7795 CSS pixels.
 * We do not convert manually: CSS understands "mm" units natively, so the
 * preview is drawn by the browser using exactly that conversion. The same
 * values are reused for print in Stage 3.
 */

const LAYOUT = {
  // ── Card ────────────────────────────────────────────────────────
  cardWidthMm: 143,
  cardHeightMm: 93,

  // ── Sections and divider ────────────────────────────────────────
  senderSectionWidthMm: 74,      // left section
  recipientSectionWidthMm: 69,   // right section (74 + 69 = 143)
  dividerXMm: 74,                // divider line, measured from the card's left edge

  // ── Typography ──────────────────────────────────────────────────
  fontPointSize: 9,              // default body font size: 9 pt

  // ── Recipient address (measured values) ─────────────────────────
  recipient: {
    marginLeftMm: 6,             // left margin inside the recipient section
    marginRightMm: 6,            // right margin inside the recipient section
    firstLineTopMm: 28.8,        // text top so each line sits ON its ruled line
                                 // (ruler: rules at 34 / 40.5 / 47 / 53.5 mm)
    lineSpacingMm: 6.5,          // ruler: 0.65 cm between the lines
    lineCount: 5,                // address lines the card ACCEPTS (5th prints
                                 // below the last rule — no 5th rule drawn)
    ruleCount: 4                 // printed ruled lines (measured card has 4)
  },

  // ── PIN code row (measured values) ──────────────────────────────
  pin: {
    defaultCode: '500001',
    boxWidthMm: 8,               // each box is 8 mm wide
    boxHeightMm: 6,              // each box is 6 mm high
    boxCount: 6,                 // six boxes
    gapMm: 0,                    // boxes touch edge-to-edge: zero gaps
    firstBoxOffsetMm: 17,        // first box, from the LEFT EDGE of the recipient section
    rowTopMm: 62,                // top of the row, measured from the card top
    fontPointSize: 14            // PROVISIONAL digit size (not yet measured) — configurable
  },

  // ── Sender address ──────────────────────────────────────────────
  // PROVISIONAL VALUES — NOT MEASURED FROM A REAL CARD.
  // These exist only so the preview can place the sender text somewhere
  // sensible. They are configurable in this one place and must be
  // confirmed against a real postcard before Stage 3 printing.
  sender: {
    coordinatesConfirmed: false, // flips to true only after measurement
    leftMm: 8,                   // provisional: text starts this far from card left
    topMm: 8,                    // provisional: first line this far from card top
    lineSpacingMm: 6.5           // provisional: same spacing as recipient
  },

  // ── Back side (blank paper + optional message) ──────────────────
  // The reverse of the real card is COMPLETELY BLANK — no printed lines,
  // headings or artwork. These values only position the optional message.
  back: {
    confirmed: false,          // true once the real reverse is measured
    marginTopMm: 10,
    marginBottomMm: 8,
    marginLeftMm: 8,
    marginRightMm: 8,
    lineSpacingMm: 7,          // message line spacing
    fontPointSize: 9           // message font
  },

  // ── Calibration sheet (test only — never printed with normal output) ──
  // Reference marks printed in "Calibration sheet" mode so physical printer
  // output can be measured with a ruler. These are diagnostic values only
  // and are NOT used to compensate anything automatically.
  calibration: {
    lineHorizontalMm: 100,
    lineVerticalMm: 50,
    rectWidthMm: 143,        // reference rectangle = exact card size
    rectHeightMm: 93,
    sheetWidthMm: 143,       // the sheet is drawn at card size for preview
    sheetHeightMm: 93,
    insetMm: 2               // rectangle inset from the sheet edge
  },

  // ── Printed artwork (approximate — traced from the reference photo) ──
  // These positions reproduce the ORIGINAL PRINTED design of the yellow
  // 50 paise inland postcard (Atal Bihari Vajpayee, AKAM 2022 issue).
  // They are decorative artwork guides, NOT measurement-grade values:
  // nudge them freely here — they never affect the address/PIN geometry
  // above, which remains the source of truth.
  artwork: {
    inkColor: '#45646c',        // dark teal ink used on the real card
    paperColor: '#f3e3bd',      // cream postcard paper
    stamp: { xMm: 105, yMm: 4, wMm: 23, hMm: 24 },
    bars: { xMm: 131.5, yMm: 5, wMm: 5.5, hMm: 21, count: 12 },
    akam: { xMm: 80, yMm: 6, wMm: 21 },
    vheading: { xMm: 75.5, yMm: 8, hMm: 52 },   // rotated text beside divider
    pinLabel: { rightMm: 89, centerYmMm: 65 },  // "पिन PIN", left of the boxes
    ruledLines: { fromXMm: 78, toXMm: 139, dropMm: 1.3 }, // sit under each address line
    bottomNote: { xMm: 74.5, yMm: 70.2, wMm: 64.5 },
    dashedLine: { xMm: 74, yMm: 73.5, toXMm: 139 }
  }
};

/** Y position of printed ruled line i (just under address line i). */
LAYOUT.artwork.ruledLineY = function (i) {
  return LAYOUT.recipient.firstLineTopMm +
         LAYOUT.recipient.lineSpacingMm * (i + 1) -
         LAYOUT.artwork.ruledLines.dropMm;
};

// ── Derived values (calculated — never edit by hand) ─────────────────
// Back side: usable message area and how many writing lines fit in it.
LAYOUT.back.widthMm = LAYOUT.cardWidthMm - LAYOUT.back.marginLeftMm - LAYOUT.back.marginRightMm;
LAYOUT.back.heightMm = LAYOUT.cardHeightMm - LAYOUT.back.marginTopMm - LAYOUT.back.marginBottomMm;
LAYOUT.back.lineCapacity = Math.floor(LAYOUT.back.heightMm / LAYOUT.back.lineSpacingMm);
// Sender message area: lines that fit above the card's bottom margin.
LAYOUT.sender.lineCapacity =
  Math.floor((LAYOUT.cardHeightMm - LAYOUT.sender.topMm - 6) / LAYOUT.sender.lineSpacingMm);
// Sender text width (provisional, same coordinate as the preview box).
LAYOUT.sender.widthMm =
  LAYOUT.dividerXMm - LAYOUT.sender.leftMm - 6;
// PIN row width: 6 boxes × 8 mm = 48 mm (boxes touch, gap 0).
LAYOUT.pin.rowWidthMm = LAYOUT.pin.boxWidthMm * LAYOUT.pin.boxCount;
// First PIN box measured from the card's left edge: 74 mm + 17 mm = 91 mm.
LAYOUT.pin.firstBoxXMm = LAYOUT.dividerXMm + LAYOUT.pin.firstBoxOffsetMm;
// Recipient text block, measured from the card's left edge: 74 mm + 6 mm = 80 mm.
LAYOUT.recipient.leftMm = LAYOUT.dividerXMm + LAYOUT.recipient.marginLeftMm;
// Recipient text width: 69 mm − 6 mm − 6 mm = 57 mm.
LAYOUT.recipient.widthMm =
  LAYOUT.recipientSectionWidthMm - LAYOUT.recipient.marginLeftMm - LAYOUT.recipient.marginRightMm;

/** Convert points to millimetres (1 pt = 1/72 inch, 1 inch = 25.4 mm). */
function ptToMm(pt) {
  return (pt * 25.4) / 72;
}

// Allow Node.js to load this file for the automated layout tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LAYOUT, ptToMm };
}
