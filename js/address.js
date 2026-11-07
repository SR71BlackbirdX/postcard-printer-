/**
 * address.js — address assembly and physical text-fitting logic.
 *
 * Pure logic (no DOM), so it runs in the browser AND under Node for tests.
 * ALL widths are in millimetres; font sizes in points; line spacing in mm.
 *
 * The address form feeds individual fields; this module:
 *   1. assembles them into printed lines in the correct postal order,
 *      omitting empty optional fields,
 *   2. wraps words to the available width using REAL MEASURED text width
 *      (a measuring function is injected — never a character count),
 *   3. reports fit status against the physical line capacity.
 */

const ADDRESS_FIELDS = [
  'name', 'house', 'building', 'street', 'area',
  'cityOrVillage', 'district', 'state', 'pin'
];

/**
 * Assemble address fields into printed lines, in postal order.
 * Empty optional fields are omitted. Labels are NEVER included.
 *
 * Fields group to match the card's FOUR ruled lines:
 * name / house + street / area + city / district + state.
 * One field per line emits up to 8 lines, and everything past line 4
 * falls onto the PIN row. Building is never printed.
 *
 * A field may itself contain several lines (e.g. a long house/street
 * entry): each line stays its own printed line, and a grouped value
 * continues the group's last line.
 *
 * includePinLine:
 *   sender    -> true  (the sender's optional PIN is printed as text)
 *   recipient -> false (the recipient PIN goes in the six PIN boxes,
 *                so it is never repeated as an address line)
 */
function assembleAddress(fields, includePinLine) {
  const src = fields || {};
  const clean = (v) => String(v == null ? '' : v).trim();
  /** Non-empty lines of a field, honouring its explicit line breaks. */
  const linesOf = (v) => clean(v).split('\n').map((l) => l.trim()).filter(Boolean);

  const lines = [];

  // The card has only four ruled lines — one group per line: premises
  // (house+street), locality (area+city), destination (district+state).
  // Building is deliberately not printed: there is no line for it.
  const group = (a, b) => {
    const first = linesOf(a);
    const second = linesOf(b);
    if (second.length) {
      if (first.length) first[first.length - 1] += ', ' + second.join(', ');
      else first.push.apply(first, second);
    }
    first.forEach((l) => lines.push(l));
  };

  linesOf(src.name).forEach((l) => lines.push(l));
  group(src.house, src.street);
  group(src.area, src.cityOrVillage);
  group(src.district, src.state);

  const pin = clean(src.pin).replace(/\D/g, '');
  if (includePinLine && pin) lines.push('PIN ' + pin);

  return lines;
}

/**
 * Wrap logical lines to maxWidthMm using measured text width.
 * measureWidthMm(text, fontPt) must return the rendered width in mm.
 *
 * Wrapping is word-aware: lines break at spaces and fill the whole measured
 * width, so the full line is used (a character count never cuts a line
 * short). A single word longer than maxCharsPerLine is hard-broken, and a
 * word wider than the available width is reported back as `tooWide` so the
 * UI can warn instead of silently clipping.
 */
function wrapLines(lines, maxWidthMm, fontPt, measureWidthMm, maxCharsPerLine) {
  const out = [];
  let tooWide = null;
  const limit = Number(maxCharsPerLine) > 0 ? Number(maxCharsPerLine) : Infinity;

  (lines || []).forEach((line) => {
    const text = String(line == null ? '' : line);
    if (text.trim() === '') {
      out.push('');
      return;
    }
    const words = text.split(/\s+/).filter(Boolean);
    let cur = '';

    words.forEach((rawWord) => {
      // Hard-break any word longer than the per-line character limit.
      let word = rawWord;
      while (word.length > limit) {
        if (cur) { out.push(cur); cur = ''; }
        out.push(word.slice(0, limit));
        word = word.slice(limit);
      }

      const wordWidth = measureWidthMm(word, fontPt);
      if (wordWidth > maxWidthMm && !tooWide) {
        tooWide = { word: word, widthMm: wordWidth, maxWidthMm: maxWidthMm };
      }

      const candidate = cur ? cur + ' ' + word : word;
      const fits = measureWidthMm(candidate, fontPt) <= maxWidthMm;

      if (fits) {
        cur = candidate;
      } else {
        if (cur) { out.push(cur); }
        cur = word; // keep the word whole on its own line
      }
    });
    if (cur) out.push(cur);
  });

  return { lines: out, tooWide: tooWide };
}

/** Fit status text for the UI (kept as constants for the tests). */
const FIT_FITS = 'Fits';
const FIT_TOO_MANY_LINES = 'Too many lines';
const FIT_TOO_WIDE = 'Line too wide';
const FIT_OUTSIDE = 'Outside printable area';

/** Compute the fit status from wrapped lines and the physical capacity. */
function computeFitStatus(wrappedCount, capacity, tooWide) {
  if (tooWide) return FIT_TOO_WIDE;
  if (wrappedCount > capacity) return FIT_TOO_MANY_LINES;
  return FIT_FITS;
}

/**
 * Characters per line guaranteed to fit the available width at a given font
 * size. Derived from the physical width with a safety factor for wide
 * letters — a smaller font gets more characters, so the whole line is used.
 * Never below 4.
 */
function maxCharsForFont(widthMm, fontPt) {
  const fontMm = (Number(fontPt) || 9) * 25.4 / 72;
  return Math.max(4, Math.floor(Number(widthMm) / (fontMm * 0.55)));
}

/**
 * Largest font size within [minPt, fromPt] whose wrapped text fits both the
 * width and the line capacity. Returns null if none fits.
 * Used by the explicit "Fit text" action — never applied silently.
 */
function findFittingFontSize(lines, maxWidthMm, capacity, measureWidthMm, fromPt, minPt) {
  const from = Math.round(fromPt);
  const min = Math.round(minPt || 6);
  for (let pt = from; pt >= min; pt--) {
    const maxChars = maxCharsForFont(maxWidthMm, pt);
    const wrapped = wrapLines(lines, maxWidthMm, pt, measureWidthMm, maxChars);
    if (!wrapped.tooWide && wrapped.lines.length <= capacity) return pt;
  }
  return null;
}

/** React to a font-size change: does this text still fit at the new size? */
function statusForFontSize(lines, maxWidthMm, capacity, fontPt, measureWidthMm) {
  const wrapped = wrapLines(lines, maxWidthMm, fontPt, measureWidthMm);
  return {
    fontPt: fontPt,
    lines: wrapped.lines,
    status: computeFitStatus(wrapped.lines.length, capacity, wrapped.tooWide),
    tooWide: wrapped.tooWide
  };
}

// Allow Node.js to load this file for the automated tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ADDRESS_FIELDS,
    assembleAddress,
    wrapLines,
    computeFitStatus,
    maxCharsForFont,
    findFittingFontSize,
    statusForFontSize,
    FIT_FITS, FIT_TOO_MANY_LINES, FIT_TOO_WIDE, FIT_OUTSIDE
  };
}
