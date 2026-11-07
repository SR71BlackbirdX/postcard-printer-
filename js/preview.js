/**
 * preview.js — renders the postcard preview (front addresses, back message,
 * optional back image) using the physical layout in layout.js.
 *
 * Geometry arrives as CSS custom properties in millimetres; the browser
 * draws mm at the CSS standard 96 DPI. Window scaling is a CSS transform
 * only — the underlying mm geometry never changes.
 *
 * Text fitting uses REAL MEASURED text width (canvas), never a character
 * count, and is limited by the physical line capacity of each area.
 */

/* ── Text measurement (canvas: accurate, no DOM thrash) ──────────── */

// Template 1's first line is just the 🇮🇳 emoji; it carries its own size.
const FLAG_LINE_RE = /^\u{1F1EE}\u{1F1F3}\s*$/u;
const DEFAULT_FLAG_PT = 16;
const measureCtx = document.createElement('canvas').getContext('2d');

// Family + weight used to MEASURE text. Must match the CSS the card draws
// with, or wrap/fit maths breaks for any non-Arial or bold/italic choice.
let cardFontFamily = 'Arial';
let cardFontBold = false;
let cardFontItalic = false;
function setCardFont(family, bold, italic) {
  cardFontFamily = family || 'Arial';
  cardFontBold = bold === true;
  cardFontItalic = italic === true;
}

/** Rendered width of text in mm for a given font size in points. */
function measureTextWidthMm(text, fontPt) {
  const style = (cardFontItalic ? 'italic ' : '') + (cardFontBold ? 'bold ' : '');
  measureCtx.font = style + Math.round(fontPt * 96 / 72) + 'px "' + cardFontFamily + '", Arial';
  return measureCtx.measureText(String(text)).width * 25.4 / 96;
}

/** Copy every layout measurement into CSS custom properties (mm units). */
function applyLayoutToCss() {
  const s = document.documentElement.style;
  const L = LAYOUT;

  s.setProperty('--card-w', L.cardWidthMm + 'mm');
  s.setProperty('--card-h', L.cardHeightMm + 'mm');
  s.setProperty('--divider-x', L.dividerXMm + 'mm');

  // Recipient address block (measured values).
  s.setProperty('--recipient-left', L.recipient.leftMm + 'mm');
  s.setProperty('--recipient-top', L.recipient.firstLineTopMm + 'mm');
  s.setProperty('--recipient-w', L.recipient.widthMm + 'mm');
  s.setProperty('--line-spacing', L.recipient.lineSpacingMm + 'mm');

  // PIN row: six touching boxes.
  s.setProperty('--pin-left', L.pin.firstBoxXMm + 'mm');
  s.setProperty('--pin-top', L.pin.rowTopMm + 'mm');
  s.setProperty('--pin-box-w', L.pin.boxWidthMm + 'mm');
  s.setProperty('--pin-box-h', L.pin.boxHeightMm + 'mm');
  s.setProperty('--pin-font-size', L.pin.fontPointSize + 'pt');

  // Printed artwork (approximate, traced from the reference photo).
  const a = L.artwork;
  s.setProperty('--ink', a.inkColor);
  s.setProperty('--paper', a.paperColor);
  s.setProperty('--stamp-x', a.stamp.xMm + 'mm');
  s.setProperty('--stamp-y', a.stamp.yMm + 'mm');
  s.setProperty('--stamp-w', a.stamp.wMm + 'mm');
  s.setProperty('--stamp-h', a.stamp.hMm + 'mm');
  s.setProperty('--bars-x', a.bars.xMm + 'mm');
  s.setProperty('--bars-y', a.bars.yMm + 'mm');
  s.setProperty('--bars-w', a.bars.wMm + 'mm');
  s.setProperty('--bars-h', a.bars.hMm + 'mm');
  s.setProperty('--akam-x', a.akam.xMm + 'mm');
  s.setProperty('--akam-y', a.akam.yMm + 'mm');
  s.setProperty('--akam-w', a.akam.wMm + 'mm');
  s.setProperty('--vheading-x', a.vheading.xMm + 'mm');
  s.setProperty('--vheading-y', a.vheading.yMm + 'mm');
  s.setProperty('--vheading-h', a.vheading.hMm + 'mm');
  s.setProperty('--pin-label-right', a.pinLabel.rightMm + 'mm');
  s.setProperty('--pin-label-cy', a.pinLabel.centerYmMm + 'mm');
  s.setProperty('--ruled-from', a.ruledLines.fromXMm + 'mm');
  s.setProperty('--ruled-to', a.ruledLines.toXMm + 'mm');
  s.setProperty('--note-x', a.bottomNote.xMm + 'mm');
  s.setProperty('--note-y', a.bottomNote.yMm + 'mm');
  s.setProperty('--note-w', a.bottomNote.wMm + 'mm');
  s.setProperty('--dashed-x', a.dashedLine.xMm + 'mm');
  s.setProperty('--dashed-y', a.dashedLine.yMm + 'mm');
  s.setProperty('--dashed-to', a.dashedLine.toXMm + 'mm');
}

/** Build the printed ruled lines (one under each recipient address line). */
function buildRuledLines() {
  const host = document.getElementById('ruledLines');
  if (!host) return;
  host.innerHTML = '';
  // Only the measured 4 rules print; the 5th accepted line sits below them.
  for (let i = 0; i < LAYOUT.recipient.ruleCount; i++) {
    const line = document.createElement('div');
    line.className = 'ruled-line';
    line.style.top = LAYOUT.artwork.ruledLineY(i) + 'mm';
    host.appendChild(line);
  }
}

/**
 * Build the mm rulers: tick marks along the card's top + left edges in the
 * preview, and along the reference rectangle on the printed calibration
 * sheet. Ticks are every millimetre; every 10 mm is longer and labelled.
 */
function buildRulers() {
  const W = LAYOUT.cardWidthMm;
  const H = LAYOUT.cardHeightMm;

  const build = (host, edgeInset) => {
    if (!host) return;
    host.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let mm = 0; mm <= W; mm++) {
      const major = mm % 10 === 0;
      const t = document.createElement('div');
      t.className = 'ruler-tick h' + (major ? ' major' : '');
      t.style.left = mm + 'mm';
      frag.appendChild(t);
      if (major) {
        const l = document.createElement('span');
        l.className = 'ruler-label';
        l.style.left = mm + 'mm';
        l.textContent = String(mm);
        frag.appendChild(l);
      }
    }
    for (let mm = 0; mm <= H; mm++) {
      const major = mm % 10 === 0;
      const t = document.createElement('div');
      t.className = 'ruler-tick v' + (major ? ' major' : '');
      t.style.top = mm + 'mm';
      frag.appendChild(t);
      if (major) {
        const l = document.createElement('span');
        l.className = 'ruler-label';
        l.style.top = mm + 'mm';
        l.textContent = String(mm);
        frag.appendChild(l);
      }
    }
    // The corner label would collide; drop the vertical 0.
    host.appendChild(frag);
  };

  build(document.getElementById('cardRuler'), 0);
  build(document.getElementById('calibRuler'), 0);
}

/** Build the printed PIN box outlines (artwork) + digit slots (content). */
function buildPinBoxes() {
  const art = document.getElementById('artPinRow');
  if (art) {
    art.innerHTML = '';
    for (let i = 0; i < LAYOUT.pin.boxCount; i++) {
      const b = document.createElement('div');
      b.className = 'art-pin-box';
      art.appendChild(b);
    }
  }
  const row = document.getElementById('pinRow');
  row.innerHTML = '';
  for (let i = 0; i < LAYOUT.pin.boxCount; i++) {
    const box = document.createElement('div');
    box.className = 'pin-box';
    row.appendChild(box);
  }
}

/** Position the calibration guides (only visible when toggled on). */
function positionGuides() {
  const y36 = document.getElementById('guideH36');
  const y62 = document.getElementById('guideH62');
  const x74 = document.getElementById('guideV74');
  if (y36) y36.style.top = LAYOUT.recipient.firstLineTopMm + 'mm';
  if (y62) y62.style.top = LAYOUT.pin.rowTopMm + 'mm';
  if (x74) x74.style.left = LAYOUT.dividerXMm + 'mm';
}

/** Apply calibration offsets (mm) to the editable content layer only. */
function applyOffsets(offsets) {
  const o = offsets || {};
  const sender = document.querySelector('.sender-block');
  const recip = document.querySelector('.recipient-block');
  const pin = document.querySelector('.pin-row');

  if (sender) sender.style.transform = 'translate(' + (o.senderX || 0) + 'mm,' + (o.senderY || 0) + 'mm)';
  if (recip) recip.style.transform = 'translate(' + (o.recipientX || 0) + 'mm,' + (o.recipientY || 0) + 'mm)';
  if (pin) pin.style.transform = 'translate(' + (o.pinX || 0) + 'mm,' + (o.pinY || 0) + 'mm)';
}

/** Show a fit badge with the right colour class. */
function showFit(badgeId, detailId, status, detail) {
  const badge = document.getElementById(badgeId);
  const det = document.getElementById(detailId);
  if (!badge) return;
  badge.textContent = status;
  badge.className = 'fit-badge' + (status === 'Fits' ? '' : (status === 'Line too wide' || status === 'Outside printable area' ? ' bad' : ' warn'));
  if (det) det.textContent = detail || '';
}

/* ── Front: assemble, wrap and render both addresses ───────────────── */

/**
 * Logical lines for an address: manual override when present,
 * otherwise assembled from the individual fields (empty ones omitted).
 */
function addressLines(kind, state) {
  const override = kind === 'sender' ? state.senderLines : state.recipientLines;
  if (override && override.length) return override.slice();
  // Single-box mode: what was typed is exactly what prints, line for line.
  // (The PIN never comes from here — the sender's prints as its own line
  // from the separate PIN input, the recipient's lives in the six boxes.)
  if (state.entryModes && state.entryModes[kind] === 'single') {
    const text = (state.singleText && state.singleText[kind]) || '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    // The PIN input stays separate in both modes, and the sender's PIN has
    // always printed as its own trailing line — keep that identical.
    if (kind === 'sender') {
      const pin = String((state.sender && state.sender.pin) || '').replace(/\D/g, '');
      if (pin && !lines.some((l) => l.replace(/\s+/g, '') === 'PIN' + pin)) lines.push('PIN ' + pin);
    }
    return lines;
  }
  // Full form: assemble the structured fields in postal order.
  // Sender PIN prints as text; the recipient PIN goes in the six boxes.
  return assembleAddress(state[kind], kind === 'sender');
}

/**
 * Wrap and render one address block; returns its fit status.
 * Only `capacity` lines are shown, but overflow is reported loudly —
 * text is never allowed to overlap the next line or leave the area.
 */
/**
 * Characters per line that are guaranteed to fit the available width at the
 * given font size. Derived from the physical width with a safety factor for
 * wide letters — a smaller font gets more characters, so the whole line is
 * used. (Lives in address.js so it can be unit-tested; re-declared here
 * would be a duplicate, so this comment simply documents the shared
 * function.)
 */

function renderAddressBlock(kind, state, badgeId, detailId) {
  const block = document.getElementById(kind === 'sender' ? 'senderBlock' : 'recipientBlock');
  const fontPt = kind === 'sender' ? state.senderFontPt : state.recipientFontPt;
  const widthMm = kind === 'sender' ? LAYOUT.sender.widthMm : LAYOUT.recipient.widthMm;
  const capacity = kind === 'sender' ? LAYOUT.sender.lineCapacity : LAYOUT.recipient.lineCount;
  const maxChars = maxCharsForFont(widthMm, fontPt);

  const logical = addressLines(kind, state);
  const wrapped = wrapLines(logical, widthMm, fontPt, measureTextWidthMm, maxChars);
  const needed = wrapped.lines.length;
  const visible = wrapped.lines.slice(0, capacity);

  // The flag line stays plain emoji text so the value round-trips as text.
  // While the block itself is being edited on the card, leave it alone —
  // otherwise a re-render would stomp the caret mid-keystroke.
  if (document.activeElement !== block) {
    block.textContent = '';
    visible.forEach((line, i) => {
      if (i > 0) block.appendChild(document.createTextNode('\n'));
      if (i === 0 && FLAG_LINE_RE.test(line)) {
        // Template 1's 🇮🇳 line prints at its own size (click it on the card).
        const flag = document.createElement('span');
        flag.className = 'flag-line';
        flag.style.fontSize = (state.flagFontPt || DEFAULT_FLAG_PT) + 'pt';
        flag.textContent = line;
        block.appendChild(flag);
      } else {
        block.appendChild(document.createTextNode(line));
      }
    });
  }
  block.style.fontSize = fontPt + 'pt';
  // Bold / italic / underline: same three toggles for BOTH addresses, and
  // measurement above already used the matching weight/style.
  block.style.fontWeight = state.fontBold ? 'bold' : 'normal';
  block.style.fontStyle = state.fontItalic ? 'italic' : 'normal';
  block.style.textDecoration = state.fontUnderline ? 'underline' : 'none';
  block.dataset.neededLines = String(needed);
  block.dataset.capacityLines = String(capacity);
  block.dataset.fontPt = String(fontPt);
  // Loud marker right on the card for lines that will never print.
  const cut = needed - capacity;
  block.classList.toggle('overflow', cut > 0);
  if (cut > 0) {
    block.dataset.overflow = cut + ' more line' + (cut > 1 ? 's' : '') + ' will NOT print';
  } else {
    delete block.dataset.overflow;
  }

  let status = computeFitStatus(needed, capacity, wrapped.tooWide);
  let detail = needed + ' of max ' + capacity + ' lines · ' + maxChars + ' chars/line';
  if (wrapped.tooWide) {
    status = 'Line too wide';
    detail = '"' + wrapped.tooWide.word + '" is wider than ' +
      Math.round(wrapped.tooWide.maxWidthMm) + ' mm — shorten it or reduce the font.';
  } else if (needed > capacity) {
    status = 'Too many lines';
    detail = needed + ' lines needed, only ' + capacity + ' fit' +
      (wrapped.lines.length > capacity ? ' — the rest is NOT printed.' : '');
  }
  // Does the rendered block stay inside the card after calibration offsets?
  const off = state.offsets[kind === 'sender' ? 'senderY' : 'recipientY'] || 0;
  const topMm = (kind === 'sender' ? LAYOUT.sender.topMm : LAYOUT.recipient.firstLineTopMm) + off;
  if (topMm + Math.min(needed, capacity) * LAYOUT.recipient.lineSpacingMm > LAYOUT.cardHeightMm - 2) {
    status = 'Outside printable area';
    detail = 'Address would run off the card — reset the offsets.';
  }
  showFit(badgeId, detailId, status, detail);
  return status;
}

/** Render the front card content (both addresses + PIN digits). */
function renderFront(state) {
  // Card font: the CSS variable the card draws with, and the family the
  // measurement maths uses — they must agree or wrapping lies.
  const fam = state.fontFamily || 'Arial';
  document.documentElement.style.setProperty('--card-font', fam);
  setCardFont(fam, state.fontBold, state.fontItalic);

  renderAddressBlock('sender', state, 'senderFit', 'senderFitDetail');
  renderAddressBlock('recipient', state, 'recipientFit', 'recipientFitDetail');

  // PIN digits come from the recipient PIN field; one digit per box.
  const code = String((state.recipient && state.recipient.pin) || '').replace(/\D/g, '');
  const boxes = document.querySelectorAll('#pinRow .pin-box');
  boxes.forEach((box, i) => { box.textContent = code[i] || ''; });

  applyOffsets(state.offsets);
}

/* ── Back: message + optional image ────────────────────────────────── */

/** Estimate wrapped line count for the message. */
function estimateBackLines(message, layout) {
  const fontMm = ptToMm(Number(layout.fontPointSize) || LAYOUT.back.fontPointSize);
  const textWidthMm = LAYOUT.back.widthMm;
  const charsPerLine = Math.max(8, Math.floor(textWidthMm / (fontMm * 0.5)));
  let total = 0;
  String(message || '').split('\n').forEach((line) => {
    total += Math.max(1, Math.ceil(line.length / charsPerLine));
  });
  return total;
}

/** Render the back message and its fit badge. */
function renderBackMessage(state) {
  const msg = document.getElementById('backMessage');
  const layout = state.backLayout;
  const fontPt = Number(layout.fontPointSize) || 9;
  const spacing = Number(layout.lineSpacingMm) || 7;
  const left = Number(layout.marginLeftMm);
  const top = Number(layout.marginTopMm);
  const offX = Number(layout.offsetXMm) || 0;
  const offY = Number(layout.offsetYMm) || 0;

  msg.textContent = state.message || '';
  msg.style.left = left + 'mm';
  msg.style.top = top + 'mm';
  msg.style.width = LAYOUT.back.widthMm + 'mm';
  msg.style.fontSize = fontPt + 'pt';
  msg.style.lineHeight = spacing + 'mm';
  msg.style.transform = 'translate(' + offX + 'mm,' + offY + 'mm)';

  const capacity = Math.floor((LAYOUT.cardHeightMm - top - LAYOUT.back.marginBottomMm) / spacing);
  const needed = state.message
    ? wrapLines(String(state.message).split('\n'), LAYOUT.back.widthMm, fontPt, measureTextWidthMm).lines.length
    : 0;
  const status = needed > capacity ? 'Too many lines' : 'Fits';
  const detail = state.message
    ? needed + ' of max ' + capacity + ' lines'
    : 'Blank reverse — nothing will print';
  showFit('messageFit', 'messageFitDetail', status, detail);
}

/**
 * Draw the optional back image into its canvas at ~300 DPI so print quality
 * is preserved (the source image is decoded once and drawn, never re-encoded).
 * Crop is applied in percentages of the source image.
 */
function drawBackImage(imgEl, settings) {
  const canvas = document.getElementById('backImageCanvas');
  if (!canvas) return;
  if (!imgEl) {
    canvas.hidden = true;
    document.getElementById('imageFitDetail').textContent = '';
    return;
  }
  canvas.hidden = false;

  const w = Number(settings.wMm) || 60;
  const h = Number(settings.hMm) || 40;
  const x = Number(settings.xMm) || 0;
  const y = Number(settings.yMm) || 0;
  const pxPerMm = 300 / 25.4; // high-resolution canvas for print

  canvas.style.left = x + 'mm';
  canvas.style.top = y + 'mm';
  canvas.style.width = w + 'mm';
  canvas.style.height = h + 'mm';
  canvas.width = Math.max(1, Math.round(w * pxPerMm));
  canvas.height = Math.max(1, Math.round(h * pxPerMm));
  canvas.dataset.printImage = settings.printImage ? 'on' : 'off';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const crop = settings.crop || { left: 0, top: 0, width: 100, height: 100 };
  const iw = imgEl.naturalWidth || imgEl.width;
  const ih = imgEl.naturalHeight || imgEl.height;
  const sx = (iw * crop.left) / 100;
  const sy = (ih * crop.top) / 100;
  const sw = Math.max(1, (iw * crop.width) / 100);
  const sh = Math.max(1, (ih * crop.height) / 100);

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(((Number(settings.rotation) || 0) * Math.PI) / 180);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imgEl, sx, sy, sw, sh,
    -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  ctx.restore();

  // Warn when the image (or its rotated extent) leaves the card.
  const rot = Math.abs(((Number(settings.rotation) || 0) * Math.PI) / 180);
  const extW = (Math.abs(w * Math.cos(rot)) + Math.abs(h * Math.sin(rot)));
  const extH = (Math.abs(w * Math.sin(rot)) + Math.abs(h * Math.cos(rot)));
  const out = x < -0.5 || y < -0.5 || x + extW > 143.5 || y + extH > 93.5;
  showFit('imageFit', 'imageFitDetail',
    out ? 'Outside printable area' : 'Fits',
    out ? 'Part of the image falls outside the card and will be clipped.'
        : Math.round(x) + ',' + Math.round(y) + ' mm · ' + Math.round(w) + ' × ' + Math.round(h) + ' mm');
  if (settings.crop) {
    const cropInfo = document.getElementById('cropInfo');
    if (cropInfo) {
      cropInfo.textContent = 'Crop ' + Math.round(crop.width) + '% × ' +
        Math.round(crop.height) + '% at ' + Math.round(crop.left) + ',' + Math.round(crop.top);
    }
  }
}

/** Whole-back renderer. */
function renderBack(state) {
  renderBackMessage(state);
  const imgSettings = Object.assign({}, state.backImage, {
    printImage: state.backLayout.printImage === true
  });
  drawBackImage(window.__backImageEl || null, imgSettings);
}

/* ── Preview scaling ───────────────────────────────────────────────── */

let previewMode = 'front';

/** 'front' | 'back' | 'both' | 'calibration' — set by the tab logic. */
function setPreviewMode(mode) {
  previewMode = mode;
}

/**
 * Scale the card so it fits the preview pane.
 * actual = true renders at TRUE PHYSICAL SIZE (1 CSS mm = 1 mm at 96 DPI).
 */
function fitPreview(actual) {
  const pane = document.getElementById('previewPane');
  const scaler = document.getElementById('previewScaler');
  const card = document.getElementById('postcard');
  if (!pane || !scaler || !card) return;

  const CSS_PX_PER_MM = 96 / 25.4;
  const cardPxW = LAYOUT.cardWidthMm * CSS_PX_PER_MM;
  const cardPxH = LAYOUT.cardHeightMm * CSS_PX_PER_MM;

  let scale;
  if (actual) {
    scale = 1;
  } else {
    const stack = previewMode === 'both' ? 2 : 1; // two cards stacked in preview
    const availW = pane.clientWidth - 48;
    const availH = (pane.clientHeight - 56) / stack;
    scale = Math.min(availW / cardPxW, availH / cardPxH);
    scale = Math.max(0.15, Math.min(scale, 2));
  }

  const frontT = 'scale(' + scale + ')';
  card.style.transform = frontT;
  const backCard = document.getElementById('backcard');
  if (backCard) {
    // In "both" mode the back card sits directly below the front card.
    const offsetY = previewMode === 'both' ? Math.round(cardPxH * scale) + 'px' : '0px';
    backCard.style.transform = 'translateY(' + offsetY + ') ' + frontT;
  }

  scaler.style.width = Math.round(cardPxW * scale) + 'px';
  scaler.style.height = Math.round(cardPxH * scale * (previewMode === 'both' ? 2 : 1)) + 'px';
  return scale;
}

/** Toggle calibration-guides layer. Returns true if guides are now shown. */
function toggleGuides() {
  const guides = document.getElementById('cardGuides');
  if (!guides) return false;
  guides.hidden = !guides.hidden;
  return !guides.hidden;
}

/** Toggle actual-size (1:1) preview. Returns true if actual size is now on. */
function toggleActualSize() {
  const pane = document.getElementById('previewPane');
  if (!pane) return false;
  const nowActual = !pane.classList.contains('actual-size');
  pane.classList.toggle('actual-size', nowActual);
  fitPreview(nowActual);
  return nowActual;
}
