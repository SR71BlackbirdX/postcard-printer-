/**
 * app.js — connects the forms, the preview, the back image and printing.
 * Three tabs: Front (addresses), Back (message + image), Print.
 */

(function () {
  'use strict';

  /* ── Stale-file detection ─────────────────────────────────────
     If the HTML and the JS disagree about the app version, the browser
     is serving a cached copy of one of them and the app cannot work
     reliably — say so loudly instead of failing silently. */
  var APP_VERSION = 10;
  var meta = document.querySelector('meta[name="app-version"]');
  if (meta && meta.content !== String(APP_VERSION)) {
    var banner = document.createElement('div');
    banner.className = 'stale-warning';
    banner.innerHTML = '<strong>Cached files detected.</strong> ' +
      'Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> to hard-refresh, ' +
      'or restart the server (node server.js) and reload.';
    document.body.prepend(banner);
    console.warn('App version mismatch: HTML ' + meta.content + ' vs JS ' + APP_VERSION);
  }

  // Field id prefixes for the two address forms.
  // Field ids per address. ONE field per printed line: street / city /
  // state have no input — their text belongs inside the neighbouring
  // field (see loadContact, which folds a contact's stored columns in).
  const FIELD_IDS = {
    sender:   { name: 'sName', house: 'sHouse',
                area: 'sArea', district: 'sDistrict', pin: 'sPin' },
    recipient: { name: 'rName', house: 'rHouse',
                 area: 'rArea', district: 'rDistrict', pin: 'rPin' }
  };
  // Columns the form no longer shows. Folded into the line they print on
  // when a contact is loaded, and always cleared on read — so a stale
  // value can never print behind a field the user cannot see.
  const HIDDEN_LINE_FIELDS = ['street', 'cityOrVillage', 'state'];

  // Current values shown in the UI (deep copy — never mutate the defaults).
  const state = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  const el = {};
  const ELEMENT_IDS = [
    // Tab chrome
    'tabFrontBtn', 'tabBackBtn', 'tabPrintBtn',
    'panelFront', 'panelBack', 'panelPrint',
    // Front form
    'senderFit', 'senderFitDetail', 'recipientFit', 'recipientFitDetail',
    'senderCharHint', 'recipientCharHint',
    'senderFontPt', 'recipientFontPt', 'flagFontPt', 'fitTextBtn', 'sTemplateBtn',
    // Entry mode (Full form vs Single box), per address.
    'sEntryFull', 'sEntrySingle', 'rEntryFull', 'rEntrySingle',
    'sFullGrid', 'rFullGrid', 'sSingleBox', 'rSingleBox',
    'sSingleInput', 'rSingleInput', 'senderFields', 'recipientFields',
    'senderLinesInput', 'recipientLinesInput', 'resetLinesBtn', 'resetCalibBtn',
    'overrideBadge',
    'guidesBtn', 'actualBtn',
    // Back form
    'messageInput', 'messageFit', 'messageFitDetail', 'messageFitTextBtn',
    'backFontSize', 'backLineSpacing', 'backMarginLeft', 'backMarginTop',
    'backOffX', 'backOffY',
    'imageUploadBtn', 'imageInput', 'imageRemoveBtn', 'imageResetBtn',
    'imagePrintToggle', 'imageInfo', 'imageFit', 'imageFitDetail', 'cropInfo',
    'imgX', 'imgY', 'imgW', 'imgH', 'imgRotate', 'imgAspectLock',
    'cropLeft', 'cropTop',
    'templateSelect', 'templateName', 'sFullGrid',
    'templateApplyBtn', 'templateSaveBtn', 'templateDeleteBtn',
    'gotoPrintBackBtn',
    // Address book (Stage 7)
    'addressBook',
    'abRecipientSelect', 'abRecipientCount', 'abRecipientName',
    'abRecipientLoadBtn', 'abRecipientEditBtn', 'abRecipientDeleteBtn',
    'abRecipientSaveBtn', 'abRecipientNewBtn',
    'abSenderSelect', 'abSenderCount', 'abSenderName',
    'abSenderLoadBtn', 'abSenderEditBtn', 'abSenderDeleteBtn',
    'abSenderSaveBtn', 'abSenderNewBtn',
    'abEditPanel', 'abEditLegend', 'abEditNotice', 'abEditName', 'abEditFields',
    'abEditPinBadge', 'abEditSummary',
    'abEditSaveBtn', 'abEditLoadBtn', 'abEditCancelBtn',
    'abCsvExportBtn', 'abCsvImportBtn', 'abCsvFile', 'abCsvHint',
    'abCsvPreview', 'abCsvCount', 'abCsvIntro', 'abCsvTable', 'abCsvWarnings',
    'abCsvSkipDupes', 'abCsvConfirmBtn', 'abCsvCancelBtn',
    // Print tab
    'printSideFront', 'printSideBack', 'printSideBoth',
    'printModeOverlay', 'printModeCard', 'printModeCalibration', 'printModeHint',
    'printBtn', 'printHelp', 'printNowBtn', 'printCancelBtn', 'offsetSummary',
    'clearDataBtn',
    // Shared
    'refreshBtn', 'refreshBackBtn', 'saveBtn', 'saveCalibBtn', 'exportBtn', 'importBtn', 'importFile',
    'fontFamily', 'fontBold', 'fontItalic', 'fontUnderline',
    'status', 'previewPane', 'previewScaler', 'postcard', 'backcard',
    'calibSheet', 'backImageCanvas'
  ];

  // Front calibration inputs -> keys in state.offsets.
  const OFFSET_KEYS = {
    offSenderXMm: 'senderX', offSenderYMm: 'senderY',
    offRecipXMm: 'recipientX', offRecipYMm: 'recipientY',
    offPinXMm: 'pinX', offPinYMm: 'pinY'
  };
  // The PIN row is applied +0.4 mm down by default. The PIN Y field shows
  // the offset RELATIVE to that default (so 0 means "the default 0.4 mm")
  // while all calculations use the real value.
  const PIN_Y_BASE_MM = 0.4;
  // Back-image control ids.
  const IMG_IDS = ['imgX', 'imgY', 'imgW', 'imgH', 'imgRotate', 'imgAspectLock'];

  let activeTab = 'front';

  function cacheElements() {
    ELEMENT_IDS.forEach((id) => { el[id] = document.getElementById(id); });
    Object.keys(FIELD_IDS.sender).forEach((f) => {
      el['s_' + f] = document.getElementById(FIELD_IDS.sender[f]);
      el['r_' + f] = document.getElementById(FIELD_IDS.recipient[f]);
    });
  }

  function setStatus(text, kind) {
    el.status.textContent = text;
    el.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function fmtMm(v) {
    const n = Math.round((Number(v) || 0) * 10) / 10;
    return Object.is(n, -0) ? '0' : String(n);
  }

  function clampNum(v, min, max, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  /* ── Tabs and preview side ─────────────────────────────────────── */

  function showPreview(what) {
    setPreviewMode(what === 'both' ? 'both' : what);
    el.postcard.hidden = what === 'back' || what === 'calibration';
    el.backcard.hidden = what !== 'back' && what !== 'both';
    el.calibSheet.hidden = what !== 'calibration';
    fitPreview(el.previewPane.classList.contains('actual-size'));
  }

  function showTab(name) {
    activeTab = name;
    const tabs = { front: el.tabFrontBtn, back: el.tabBackBtn, print: el.tabPrintBtn };
    const panels = { front: el.panelFront, back: el.panelBack, print: el.panelPrint };
    Object.keys(tabs).forEach((key) => {
      tabs[key].classList.toggle('active', key === name);
      tabs[key].setAttribute('aria-selected', key === name ? 'true' : 'false');
      panels[key].hidden = key !== name;
    });
    if (name === 'print') showPrintPreview();
    else showPreview(name === 'back' ? 'back' : 'front');
  }

  /* ── Entry mode: Full form vs Single box ────────────────────────── */

  /** Show/hide the right group for one address. Pure view update. */
  function applyEntryMode(kind) {
    const single = state.entryModes[kind] === 'single';
    const s = kind === 'sender';
    (s ? el.sFullGrid : el.rFullGrid).hidden = single;
    (s ? el.sSingleBox : el.rSingleBox).hidden = !single;
    (s ? el.senderFields : el.recipientFields).classList.toggle('single-mode', single);
  }

  /**
   * Switch an address between Full form and Single box.
   * The mode being LEFT is cleared (that is the point of one box), so the
   * user is warned first and nothing happens if they decline. The PIN input
   * lives outside the toggle and is never cleared.
   */
  function switchEntryMode(kind, next) {
    const prev = state.entryModes[kind];
    if (next === prev) return;
    const label = kind === 'sender' ? 'From' : 'To';
    const fieldF = (f) => (kind === 'sender' ? 's_' : 'r_') + f;
    const leaving = prev === 'full'
      ? 'the address fields you typed in ' + label
      : 'the text in the ' + label + ' single box';
    const hasContent = prev === 'full'
      ? ADDRESS_FIELDS.some((f) => f !== 'pin' && String(state[kind][f] || '').trim())
      : String(state.singleText[kind] || '').trim().length > 0;

    if (hasContent) {
      const ok = window.confirm(
        'Switch the ' + label + ' address to ' +
        (next === 'single' ? 'Single box' : 'Full form') + '?\n\n' +
        'This clears ' + leaving + '. The ' + label +
        ' PIN box is kept as it is.\n\nContinue?');
      if (!ok) {
        // Put the radio back exactly where it was.
        const back = prev === 'full'
          ? (kind === 'sender' ? el.sEntryFull : el.rEntryFull)
          : (kind === 'sender' ? el.sEntrySingle : el.rEntrySingle);
        back.checked = true;
        setStatus('Entry mode unchanged.');
        return;
      }
    }

    // Clear the mode we are leaving. The PIN input is deliberately skipped,
    // and only fields the form still has are cleared (a saved contact may
    // hold more, e.g. building — that value must survive in state).
    if (prev === 'full') {
      Object.keys(FIELD_IDS[kind]).forEach((f) => {
        if (f === 'pin') return;
        state[kind][f] = '';
        el[fieldF(f)].value = '';
      });
    } else {
      state.singleText[kind] = '';
      (kind === 'sender' ? el.sSingleInput : el.rSingleInput).value = '';
    }

    state.entryModes[kind] = next;
    applyEntryMode(kind);
    updatePreview();
    setStatus(label + ' address switched to ' +
      (next === 'single' ? 'Single box' : 'Full form') +
      '. The PIN box was left untouched.' + (hasContent ? '' : ' (Nothing was cleared.)'));
  }

  /* ── Form <-> state ────────────────────────────────────────────── */

  function readForm() {
    // Structured address fields.
    ['sender', 'recipient'].forEach((kind) => {
      Object.keys(FIELD_IDS[kind]).forEach((f) => {
        state[kind][f] = el[(kind === 'sender' ? 's_' : 'r_') + f].value;
      });
      // The form is the source of truth for the printed lines, so the
      // columns it no longer shows are emptied here. A contact's street /
      // city / state are folded into their line by loadContact first, so
      // nothing is lost — but a leftover can never print unseen.
      HIDDEN_LINE_FIELDS.forEach((f) => { state[kind][f] = ''; });
      state[kind].pin = state[kind].pin.replace(/\D/g, '').slice(0, 6);
    });

    // Manual line overrides (blank textarea = rebuild from fields).
    const sLines = el.senderLinesInput.value.trim();
    const rLines = el.recipientLinesInput.value.trim();
    state.senderLines = sLines ? sLines.split('\n').map((l) => l.trim()).filter(Boolean) : null;
    state.recipientLines = rLines ? rLines.split('\n').map((l) => l.trim()).filter(Boolean) : null;

    // Entry mode + the text typed in Single-box mode. The PIN inputs are
    // read with the fields above, so they are unaffected by the mode.
    state.entryModes = {
      sender: el.sEntrySingle.checked ? 'single' : 'full',
      recipient: el.rEntrySingle.checked ? 'single' : 'full'
    };
    state.singleText = {
      sender: el.sSingleInput.value,
      recipient: el.rSingleInput.value
    };

    // Per-address fonts.
    state.senderFontPt = clampNum(el.senderFontPt.value, 6, 20, 9);
    state.recipientFontPt = clampNum(el.recipientFontPt.value, 6, 20, 9);
    // Only whitelisted families are accepted, matching sanitizeSettings.
    state.fontFamily = CARD_FONT_FAMILIES.includes(el.fontFamily.value)
      ? el.fontFamily.value : DEFAULT_SETTINGS.fontFamily;
    state.flagFontPt = clampNum(el.flagFontPt.value, 6, 30, DEFAULT_SETTINGS.flagFontPt);
    // Bold / italic / underline: one set of toggles for BOTH addresses.
    state.fontBold = el.fontBold.checked === true;
    state.fontItalic = el.fontItalic.checked === true;
    state.fontUnderline = el.fontUnderline.checked === true;

    // Calibration offsets.
    Object.keys(OFFSET_KEYS).forEach((id) => {
      const raw = Number(document.getElementById(id).value);
      if (!Number.isFinite(raw)) {
        state.offsets[OFFSET_KEYS[id]] = DEFAULT_SETTINGS.offsets[OFFSET_KEYS[id]];
        return;
      }
      // PIN Y is entered relative to its 0.4 mm default.
      const value = id === 'offPinYMm' ? raw + PIN_Y_BASE_MM : raw;
      state.offsets[OFFSET_KEYS[id]] = Math.round(value * 10) / 10;
    });

    // Back-side message layout.
    state.message = el.messageInput.value;
    state.backLayout.fontPointSize = clampNum(el.backFontSize.value, 6, 20, 9);
    state.backLayout.lineSpacingMm = clampNum(el.backLineSpacing.value, 4, 12, 7);
    state.backLayout.marginLeftMm = clampNum(el.backMarginLeft.value, 0, 30, 8);
    state.backLayout.marginTopMm = clampNum(el.backMarginTop.value, 0, 40, 10);
    state.backLayout.offsetXMm = clampNum(el.backOffX.value, -20, 20, 0);
    state.backLayout.offsetYMm = clampNum(el.backOffY.value, -20, 20, 0);
    state.backLayout.printImage = el.imagePrintToggle.checked;

    // Back-image placement (pixels stay in memory only).
    state.backImage.xMm = clampNum(el.imgX.value, -50, 200, 25);
    state.backImage.yMm = clampNum(el.imgY.value, -50, 200, 25);
    state.backImage.wMm = clampNum(el.imgW.value, 5, 300, 60);
    state.backImage.hMm = clampNum(el.imgH.value, 5, 300, 40);
    state.backImage.rotation = clampNum(el.imgRotate.value, -360, 360, 0);
    state.backImage.aspectLocked = el.imgAspectLock.checked;
    state.backImage.crop = {
      left: clampNum(el.cropLeft.value, 0, 99, 0),
      top: clampNum(el.cropTop.value, 0, 99, 0),
      width: clampNum(100 - Number(el.cropLeft.value), 1, 100, 100),
      height: clampNum(100 - Number(el.cropTop.value), 1, 100, 100)
    };
  }

  function fillForm() {
    ['sender', 'recipient'].forEach((kind) => {
      Object.keys(FIELD_IDS[kind]).forEach((f) => {
        el[(kind === 'sender' ? 's_' : 'r_') + f].value = state[kind][f] || '';
      });
    });
    el.senderLinesInput.value = (state.senderLines || []).join('\n');
    el.recipientLinesInput.value = (state.recipientLines || []).join('\n');

    // Entry mode: radios, single-box text, and which group is visible.
    el.sEntryFull.checked = state.entryModes.sender !== 'single';
    el.sEntrySingle.checked = state.entryModes.sender === 'single';
    el.rEntryFull.checked = state.entryModes.recipient !== 'single';
    el.rEntrySingle.checked = state.entryModes.recipient === 'single';
    el.sSingleInput.value = (state.singleText && state.singleText.sender) || '';
    el.rSingleInput.value = (state.singleText && state.singleText.recipient) || '';
    applyEntryMode('sender');
    applyEntryMode('recipient');

    el.senderFontPt.value = state.senderFontPt;
    el.recipientFontPt.value = state.recipientFontPt;
    el.fontFamily.value = CARD_FONT_FAMILIES.includes(state.fontFamily)
      ? state.fontFamily : DEFAULT_SETTINGS.fontFamily;
    el.flagFontPt.value = state.flagFontPt;
    el.fontBold.checked = state.fontBold === true;
    el.fontItalic.checked = state.fontItalic === true;
    el.fontUnderline.checked = state.fontUnderline === true;
    Object.keys(OFFSET_KEYS).forEach((id) => {
      const v = state.offsets[OFFSET_KEYS[id]];
      // PIN Y is shown relative to its 0.4 mm default, so the field reads 0.
      document.getElementById(id).value =
        fmtMm(id === 'offPinYMm' ? v - PIN_Y_BASE_MM : v);
    });

    el.messageInput.value = state.message || '';
    el.backFontSize.value = state.backLayout.fontPointSize;
    el.backLineSpacing.value = state.backLayout.lineSpacingMm;
    el.backMarginLeft.value = state.backLayout.marginLeftMm;
    el.backMarginTop.value = state.backLayout.marginTopMm;
    el.backOffX.value = fmtMm(state.backLayout.offsetXMm);
    el.backOffY.value = fmtMm(state.backLayout.offsetYMm);
    el.imagePrintToggle.checked = state.backLayout.printImage === true;

    // Image controls (only enabled while an image is loaded).
    const has = !!window.__backImageEl;
    IMG_IDS.concat(['cropLeft', 'cropTop']).forEach((id) => { el[id].disabled = !has; });
    el.imgX.value = state.backImage.xMm;
    el.imgY.value = state.backImage.yMm;
    el.imgW.value = state.backImage.wMm;
    el.imgH.value = state.backImage.hMm;
    el.imgRotate.value = state.backImage.rotation;
    el.imgAspectLock.checked = state.backImage.aspectLocked !== false;
    el.cropLeft.value = state.backImage.crop.left;
    el.cropTop.value = state.backImage.crop.top;
    el.imageRemoveBtn.disabled = !has;
    el.imageResetBtn.disabled = !has;
    el.imageInfo.textContent = has
      ? 'Image loaded (' + window.__backImageEl.naturalWidth + ' × ' +
        window.__backImageEl.naturalHeight + ' px) — kept in this session only.'
      : 'No image uploaded. (Images are never saved with settings.)';

    fillTemplateSelect();
    refreshOffsetSummary();
    refreshOverrideBadge();
    refreshCharHints();
  }

  /* ── Rendering ─────────────────────────────────────────────────── */

  function updatePreview() {
    readForm();
    renderFront(state);
    renderBack(state);
    refreshOverrideBadge();
    if (activeTab === 'print') refreshOffsetSummary();
  }

  /* ── Fit text (explicit action — never automatic) ───────────────── */

  function fitText() {
    readForm();
    const measure = measureTextWidthMm;
    let changed = [];

    ['sender', 'recipient'].forEach((kind) => {
      const logical = addressLines(kind, state);
      const widthMm = kind === 'sender' ? LAYOUT.sender.widthMm : LAYOUT.recipient.widthMm;
      const capacity = kind === 'sender' ? LAYOUT.sender.lineCapacity : LAYOUT.recipient.lineCount;
      const current = kind === 'sender' ? state.senderFontPt : state.recipientFontPt;
      const maxChars = maxCharsForFont(widthMm, current);
      const wrapped = wrapLines(logical, widthMm, current, measure, maxChars);
      const fits = !wrapped.tooWide && wrapped.lines.length <= capacity;
      if (!fits) {
        const pt = findFittingFontSize(logical, widthMm, capacity, measure, current, 6);
        if (pt !== null && pt < current) {
          if (kind === 'sender') state.senderFontPt = pt; else state.recipientFontPt = pt;
          changed.push((kind === 'sender' ? 'From' : 'To') + ' font set to ' + pt + ' pt');
        } else {
          changed.push((kind === 'sender' ? 'From' : 'To') +
            ' address cannot fit even at 6 pt — please shorten it');
        }
      }
    });

    // Reflect the new font sizes back into the inputs.
    el.senderFontPt.value = state.senderFontPt;
    el.recipientFontPt.value = state.recipientFontPt;
    updatePreview();
    setStatus(changed.length ? changed.join('; ') : 'Both addresses already fit — nothing changed.');
  }

  /* ── Message templates ─────────────────────────────────────────── */

  /** Fit the back message: largest font that fits the available lines. */
  function fitMessageText() {
    readForm();
    const logical = String(state.message || '').split('\n');
    const spacing = state.backLayout.lineSpacingMm;
    const capacity = Math.floor(
      (LAYOUT.cardHeightMm - state.backLayout.marginTopMm - LAYOUT.back.marginBottomMm) / spacing);
    const current = state.backLayout.fontPointSize;
    const pt = findFittingFontSize(logical, LAYOUT.back.widthMm, capacity,
      measureTextWidthMm, current, 6);
    if (pt !== null && pt < current) {
      state.backLayout.fontPointSize = pt;
      el.backFontSize.value = pt;
      updatePreview();
      setStatus('Message font set to ' + pt + ' pt so the text fits.');
    } else if (pt !== null) {
      setStatus('The message already fits — nothing changed.');
    } else {
      setStatus('The message cannot fit even at 6 pt — please shorten it.');
    }
  }

  /** Show the fixed characters-per-line limits on both address forms. */
  function refreshCharHints() {
    const sLimit = maxCharsForFont(LAYOUT.sender.widthMm, state.senderFontPt);
    const rLimit = maxCharsForFont(LAYOUT.recipient.widthMm, state.recipientFontPt);
    if (el.senderCharHint) {
      el.senderCharHint.textContent = 'About ' + sLimit + ' characters per printed line ' +
        '(' + LAYOUT.sender.lineCapacity + ' lines max). Longer text wraps at words.';
    }
    if (el.recipientCharHint) {
      el.recipientCharHint.textContent = 'About ' + rLimit + ' characters per printed line ' +
        '(exactly ' + LAYOUT.recipient.lineCount + ' lines fit). Longer text wraps at words.';
    }
  }

  /** Refresh the "manual lines active" badge next to the lines editor. */  function refreshOverrideBadge() {
    const active = !!(state.senderLines && state.senderLines.length) ||
                   !!(state.recipientLines && state.recipientLines.length);
    el.overrideBadge.hidden = !active;
    el.overrideBadge.title = active
      ? 'Printed lines are taken from the manual editor, not the fields above.'
      : '';
  }

  /**
   * A saved manual line override makes the address form inert. Editing any
   * address field clears that override so the fields take effect again.
   * Returns true when an override was cleared.
   */
  function clearOverrideOnFieldEdit(kind) {
    const had = kind === 'sender' ? state.senderLines : state.recipientLines;
    if (had && had.length) {
      if (kind === 'sender') {
        state.senderLines = null;
        el.senderLinesInput.value = '';
      } else {
        state.recipientLines = null;
        el.recipientLinesInput.value = '';
      }
      refreshOverrideBadge();
      setStatus('Manual line override cleared — the ' +
        (kind === 'sender' ? 'From' : 'To') + ' address is building from the fields again.');
      return true;
    }
    return false;
  }

  function fillTemplateSelect() {
    el.templateSelect.innerHTML = '<option value="">— saved templates —</option>';
    (state.templates || []).forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = t.name;
      el.templateSelect.appendChild(opt);
    });
  }

  function saveTemplate() {
    const name = el.templateName.value.trim();
    if (!name) { setStatus('Give the template a name first.', 'error'); return; }
    readForm();
    const existing = (state.templates || []).findIndex((t) => t.name === name);
    if (existing >= 0) state.templates[existing].text = state.message;
    else state.templates.push({ name: name, text: state.message });
    fillTemplateSelect();
    setStatus('Template "' + name + '" saved. Remember to Save settings too.');
  }

  /** The selected template, or null when the placeholder is showing.
   *  The placeholder's value is "" and Number("") === 0, so an explicit
   *  string check is required — otherwise "— saved templates —" silently
   *  inserts the FIRST template. */
  function selectedTemplate() {
    const raw = el.templateSelect.value;
    if (raw === '') return null;
    const idx = Number(raw);
    return Number.isInteger(idx) && state.templates[idx] ? state.templates[idx] : null;
  }

  function applyTemplate() {
    const t = selectedTemplate();
    if (!t) {
      setStatus((state.templates || []).length
        ? 'Choose a template from the list first.'
        : 'No templates yet — type a message, give it a name and click "Save current".', 'error');
      return;
    }
    el.messageInput.value = t.text;
    updatePreview();
    setStatus('Template "' + t.name + '" inserted.');
  }

  function deleteTemplate() {
    const raw = el.templateSelect.value;
    const t = selectedTemplate();
    if (!t) {
      setStatus(raw === '' && (state.templates || []).length
        ? 'Choose a template from the list first.'
        : 'There are no saved templates to delete.', 'error');
      return;
    }
    state.templates.splice(Number(raw), 1);
    fillTemplateSelect();
    setStatus('Template "' + t.name + '" deleted.');
  }

  /* ── Offset summary (Print tab) ────────────────────────────────── */

  function refreshOffsetSummary() {
    const rows = [
      ['From (front)', state.offsets.senderX, state.offsets.senderY],
      ['To (front)', state.offsets.recipientX, state.offsets.recipientY],
      ['PIN (front)', state.offsets.pinX, state.offsets.pinY],
      ['Message (back)', state.backLayout.offsetXMm, state.backLayout.offsetYMm]
    ];
    const sign = (v) => (v > 0 ? '+' : '') + v + ' mm';
    el.offsetSummary.innerHTML = rows.map((r) =>
      '<div><dt>' + r[0] + '</dt><dd>X ' + sign(r[1]) + ', Y ' + sign(r[2]) + '</dd></div>'
    ).join('');
  }

  /* ── Printing ───────────────────────────────────────────────────── */

  function selectedPrintSide() {
    if (el.printSideBoth.checked) return 'both';
    return el.printSideBack.checked ? 'back' : 'front';
  }

  function selectedPrintMode() {
    if (el.printModeCalibration.checked) return 'calibration';
    if (el.printModeCard.checked) return 'card';
    return 'overlay';
  }

  /**
   * Set the print @page rule for the chosen mode/side.
   *   overlay + one side -> the printer's own paper, content at 100%
   *                        (no scaling) so it lands on the real card.
   *   overlay + both     -> two exact 143 x 93 mm pages (custom size).
   *   card               -> exact 143 x 93 mm page.
   *   calibration        -> printer's own paper with a 12 mm margin.
   */
  function applyPrintPageRule(mode, side) {
    const style = document.getElementById('printPageRule');
    if (!style) return;
    let rule = '@page { size: auto; margin: 0; }';
    if (mode === 'card' || (mode === 'overlay' && side === 'both')) {
      rule = '@page { size: 143mm 93mm; margin: 0; }';
    } else if (mode === 'calibration') {
      rule = '@page { size: auto; margin: 12mm; }';
    }
    style.textContent = rule;
    document.body.dataset.printMode = mode;
    document.body.dataset.printSide = side;
  }

  const MODE_HINTS = {
    overlay: 'Prints only your content on the existing postcard: text always, the image only when "Print image" is on. No background, artwork, rules or PIN borders.',
    card: 'Prints the complete card (artwork + text) at 143 × 93 mm on blank paper stock, or a custom 143 × 93 mm page.',
    calibration: 'Prints a 100 mm line, a 50 mm line and a 143 × 93 mm rectangle. Measure them with a ruler and report — no automatic correction is applied.'
  };

  /** Print-tab preview follows the selected mode and side. */
  function showPrintPreview() {
    const mode = selectedPrintMode();
    document.body.dataset.printSide = selectedPrintSide();
    el.printModeHint.textContent = MODE_HINTS[mode] || '';
    if (mode === 'calibration') {
      showPreview('calibration');
    } else {
      showPreview(selectedPrintSide());
    }
  }

  function doPrint() {
    const mode = selectedPrintMode();
    const side = selectedPrintSide();
    // The back goes blank-side-up in the tray; 'both' prints the front page
    // first, then the flipped card. Ask before anything reaches the printer.
    if (side !== 'front') {
      const place = side === 'both'
        ? 'TRAY PLACEMENT — printing BOTH sides (2 pages)\n\n' +
          'Page 1 (front): design side facing UP.\n' +
          'Page 2 (back): FLIP the card, blank side facing UP.\n' +
          'Top edge first, landscape, scale 100%.\n\n' +
          'OK = print now, Cancel = stop'
        : 'TRAY PLACEMENT — printing the BACK side\n\n' +
          'Place the card in the tray:\n\n' +
          '• BLANK side facing UP (the side being printed)\n' +
          '• Top (short) edge enters the printer first\n' +
          '• Landscape, scale 100%, no Fit-to-page\n\n' +
          'OK = print now, Cancel = stop';
      if (!confirm(place)) {
        setStatus('Print cancelled — place the card as instructed and try again.');
        return;
      }
    }
    document.body.dataset.printSide = side;
    document.body.dataset.printMode = mode;
    applyPrintPageRule(mode, side);
    window.print();
  }

  /* ── Back image ─────────────────────────────────────────────────── */

  function enableImageControls(enabled) {
    ['imgX', 'imgY', 'imgW', 'imgH', 'imgRotate', 'imgAspectLock', 'cropLeft', 'cropTop']
      .forEach((id) => { el[id].disabled = !enabled; });
    el.imageRemoveBtn.disabled = !enabled;
    el.imageResetBtn.disabled = !enabled;
  }

  function loadImageFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      window.__backImageEl = img;
      window.__backImageObjectUrl = url;
      // Default placement: centred, 60 x 40 mm, aspect from the source.
      const aspect = img.naturalWidth / img.naturalHeight || 1.5;
      state.backImage.wMm = 60;
      state.backImage.hMm = Math.round((60 / aspect) * 10) / 10;
      state.backImage.xMm = Math.round((143 - 60) / 2);
      state.backImage.yMm = Math.round((93 - state.backImage.hMm) / 2);
      state.backImage.rotation = 0;
      state.backImage.crop = { left: 0, top: 0, width: 100, height: 100 };
      readForm();
      fillForm();
      enableImageControls(true);
      el.imageInfo.textContent = 'Image loaded (' + img.naturalWidth + ' × ' +
        img.naturalHeight + ' px) — kept in this session only, never uploaded.';
      renderBack(state);
      setStatus('Image loaded — place it with the mm controls, then enable "Print image" if it should print.');
    };
    img.onerror = () => setStatus('That file could not be loaded as an image.', 'error');
    img.src = url;
  }

  function removeImage() {
    if (window.__backImageObjectUrl) URL.revokeObjectURL(window.__backImageObjectUrl);
    window.__backImageEl = null;
    window.__backImageObjectUrl = null;
    enableImageControls(false);
    el.imageInfo.textContent = 'No image uploaded. (Images are never saved with settings.)';
    drawBackImage(null, state.backImage);
    setStatus('Image removed — the back now prints only the message.');
  }

  function resetImage() {
    state.backImage.rotation = 0;
    state.backImage.crop = { left: 0, top: 0, width: 100, height: 100 };
    if (window.__backImageEl) {
      const aspect = window.__backImageEl.naturalWidth / window.__backImageEl.naturalHeight || 1.5;
      state.backImage.wMm = 60;
      state.backImage.hMm = Math.round((60 / aspect) * 10) / 10;
      state.backImage.xMm = Math.round((143 - 60) / 2);
      state.backImage.yMm = Math.round((93 - state.backImage.hMm) / 2);
    }
    fillForm();
    renderBack(state);
    setStatus('Image reset to its original placement.');
  }

  /** Keep the aspect ratio when width/height change (if locked). */
  function onImageSizeChange(changed) {
    const img = window.__backImageEl;
    if (!img || !el.imgAspectLock.checked) return;
    const aspect = img.naturalWidth / img.naturalHeight || 1.5;
    if (changed === 'w') {
      el.imgH.value = Math.round((Number(el.imgW.value) / aspect) * 10) / 10;
    } else {
      el.imgW.value = Math.round((Number(el.imgH.value) * aspect) * 10) / 10;
    }
  }

  /* ── Address book (Stage 7) ────────────────────────────────────── */

  // The address book lives in its OWN localStorage key, so it never mixes
  // with print settings or calibration offsets. It stores address TEXT
  // only — never image pixels, never anything that leaves this browser.
  let addressBook = emptyAddressBook();
  // Edit panel state: the kind it edits, the contact id (null = creating a
  // new contact) and whether the panel is open.
  let abEdit = { kind: 'recipients', id: null, open: false };
  // A parsed CSV held for the confirmation step (null = nothing pending).
  let abCsvPending = null;

  const AB_KIND_LABEL = { recipients: 'recipient', senders: 'sender' };
  const AB_FIELD_LABELS = {
    name: 'Name (printed on the card)',
    house: 'House / Flat / Door no.',
    building: 'Building (optional)',
    street: 'Street / Road',
    area: 'Area / Locality',
    cityOrVillage: 'City / Town',
    district: 'District (optional)',
    state: 'State',
    pin: 'PIN code (6 digits)'
  };

  /** Element id of one field inside the edit panel. */
  function abEditFieldId(field) { return 'abEditField_' + field; }

  /** The DOM node for one kind's list, count and name input. */
  function abPartsFor(kind) {
    return kind === 'recipients'
      ? { select: el.abRecipientSelect, count: el.abRecipientCount, nameInput: el.abRecipientName }
      : { select: el.abSenderSelect, count: el.abSenderCount, nameInput: el.abSenderName };
  }

  /** Build the nine edit fields once, in the printed order. */
  function buildAbEditFields() {
    const wrap = el.abEditFields;
    wrap.innerHTML = '';
    CONTACT_FIELDS.forEach((f) => {
      const label = document.createElement('label');
      label.setAttribute('for', abEditFieldId(f));
      label.textContent = AB_FIELD_LABELS[f] || f;
      const input = document.createElement('textarea');
      input.id = abEditFieldId(f);
      input.rows = 2;
      input.spellcheck = false;
      input.autocomplete = 'off';
      if (f === 'pin') { input.maxLength = 6; input.wrap = 'off'; }
      wrap.appendChild(label);
      wrap.appendChild(input);
    });
  }

  /** Enable/disable the Load/Edit/Delete buttons from the current selection. */
  function updateAbSelectionStates() {
    ['recipients', 'senders'].forEach((kind) => {
      const hasSelection = !!abPartsFor(kind).select.value;
      (kind === 'recipients'
        ? [el.abRecipientLoadBtn, el.abRecipientEditBtn, el.abRecipientDeleteBtn]
        : [el.abSenderLoadBtn, el.abSenderEditBtn, el.abSenderDeleteBtn]
      ).forEach((btn) => { btn.disabled = !hasSelection; });
    });
  }

  /** Rebuild both lists and every count/button state from `addressBook`. */
  function refreshAddressBookUI() {
    ['recipients', 'senders'].forEach((kind) => {
      const parts = abPartsFor(kind);
      const list = addressBook[kind] || [];
      const previous = parts.select.value;
      parts.select.innerHTML = '';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = list.length
        ? '— select a saved ' + AB_KIND_LABEL[kind] + ' —'
        : '— none saved yet —';
      parts.select.appendChild(placeholder);

      list.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        // The PIN is shown in the list only when it is complete, so the
        // list doubles as a quick "is this address finished?" check.
        opt.textContent = c.name + (isCompletePin(c.fields.pin) ? '  ·  ' + c.fields.pin : '');
        parts.select.appendChild(opt);
      });

      // Keep the current selection when the contact still exists.
      parts.select.value = list.some((c) => c.id === previous) ? previous : '';
      parts.count.textContent = String(list.length);
    });
    updateAbSelectionStates();
  }

  /**
   * Fill the To/From form from a saved contact and refresh the preview and
   * PIN boxes. This is the ONLY way a contact ever reaches the card, and it
   * always requires an explicit click.
   */
  function loadContact(kind, id) {
    const contact = findContact(addressBook, kind, id);
    if (!contact) {
      setStatus('That contact is no longer in the address book.', 'error');
      refreshAddressBookUI();
      return;
    }
    const target = kind === 'recipients' ? 'recipient' : 'sender';
    const prefix = target === 'recipient' ? 'r_' : 's_';
    CONTACT_FIELDS.forEach((f) => {
      state[target][f] = contact.fields[f] || '';
      // A contact may hold fields the form no longer shows (building):
      // keep the value in state so the next save never destroys it.
      if (el[prefix + f]) el[prefix + f].value = state[target][f];
    });
    // The form now has ONE field per printed line, so a contact's stored
    // street / city / state fold into the field whose line they print on.
    // The printed text is unchanged; only the form's grouping differs.
    [['street', 'house'], ['cityOrVillage', 'area'], ['state', 'district']]
      .forEach(([hidden, host]) => {
        const extra = String(state[target][hidden] || '').trim();
        if (!extra) return;
        const base = String(state[target][host] || '').trim();
        state[target][host] = base ? base + ', ' + extra : extra;
        state[target][hidden] = '';
        if (el[prefix + host]) el[prefix + host].value = state[target][host];
      });
    // A contact is structured, so loading it switches that address back to
    // Full form (otherwise the fields would be filled behind a hidden view).
    // The single box is replaced too — that is said plainly in the status.
    const wasSingle = state.entryModes[target] === 'single';
    if (wasSingle) {
      state.singleText[target] = '';
      (kind === 'recipients' ? el.rSingleInput : el.sSingleInput).value = '';
      state.entryModes[target] = 'full';
      applyEntryMode(target);
    }
    // A manual line override would hide the loaded address, so clear it.
    if (target === 'sender' && state.senderLines && state.senderLines.length) {
      state.senderLines = null;
      el.senderLinesInput.value = '';
    }
    if (target === 'recipient' && state.recipientLines && state.recipientLines.length) {
      state.recipientLines = null;
      el.recipientLinesInput.value = '';
    }
    // Select it so Edit/Delete act on the contact just loaded.
    abPartsFor(kind).select.value = contact.id;
    updatePreview();
    refreshAddressBookUI();
    setStatus('Loaded "' + contact.name + '" into the ' +
      (kind === 'recipients' ? 'To' : 'From') +
      ' address — the preview, PIN boxes and fit badges are updated.' +
      (wasSingle ? ' The address is now in Full form mode (the single box was replaced).' : ''));
  }

  /**
   * Save the fields currently in the form as a NEW contact. It never
   * overwrites: a repeated display name gets a numeric suffix and the status
   * says so. Changing a saved contact is the Edit panel's job.
   */
  function saveCurrentContact(kind) {
    readForm();
    const parts = abPartsFor(kind);
    const source = kind === 'recipients' ? state.recipient : state.sender;
    const fields = {};
    CONTACT_FIELDS.forEach((f) => { fields[f] = source[f] || ''; });

    // What the CARD shows is what gets saved, in the same order the printer
    // uses: a manual line override (typing on the card writes one) or the
    // Single-box text wins over the structured fields. Line 1 is the name,
    // the rest follow in order — a multi-line "house" prints back line for
    // line, unchanged.
    // The PIN input is separate in both modes and already holds its value.
    const override = kind === 'recipients' ? state.recipientLines : state.senderLines;
    const lines = (override && override.length) ? override.slice()
      : state.entryModes[kind] === 'single'
        ? String(state.singleText[kind] || '').split('\n').map((l) => l.trim()).filter(Boolean)
        : null;
    if (lines && lines.length) {
      fields.name = lines[0];
      fields.house = lines.slice(1).join('\n');
      ['building', 'street', 'area', 'cityOrVillage', 'district', 'state']
        .forEach((f) => { fields[f] = ''; });
    }

    // The display name is only a list label — when it is left blank the
    // printed name on the card is used, so nothing is retyped.
    const name = parts.nameInput.value.trim() ||
      [fields.name, fields.house, fields.cityOrVillage]
        .map((v) => String(v || '').split('\n')[0].trim()).find(Boolean) || '';
    if (!name) {
      setStatus('Give the contact a display name first — or type a name on the card.', 'error');
      parts.nameInput.focus();
      return;
    }

    const saved = upsertContact(addressBook, kind, { name: name, fields: fields });
    if (!saved) { setStatus('That contact could not be saved.', 'error'); return; }
    const stored = saveAddressBook(addressBook);
    const renamed = saved.name !== name;
    const total = (addressBook[kind] || []).length;

    parts.nameInput.value = '';
    // Refresh first: the new contact's <option> must exist before the
    // selection can point at it (setting it earlier is silently ignored).
    refreshAddressBookUI();
    abPartsFor(kind).select.value = saved.id;
    updateAbSelectionStates();
    setStatus('Saved "' + saved.name + '" — ' + total + ' saved ' +
      AB_KIND_LABEL[kind] + (total === 1 ? '' : 's') + ' now' +
      (renamed ? ' (the name was already used, so a number was added)' : '') +
      '. Saved as a NEW contact: use Edit to change an existing one.' +
      (stored ? '' : ' (Browser storage is blocked — kept for this session only.)'),
      stored ? '' : 'error');
  }

  /** Open the edit panel for one contact, or blank for a new one. */
  function openAbEdit(kind, id) {
    abEdit.kind = kind;
    abEdit.id = id || null;
    abEdit.open = true;
    const label = AB_KIND_LABEL[kind];
    const contact = id ? findContact(addressBook, kind, id) : null;

    el.abEditLegend.textContent = (contact ? 'Edit ' : 'New ') + label;
    el.abEditNotice.innerHTML = contact
      ? 'Changes here edit the <strong>saved contact "' + escapeHtml(contact.name) +
        '" only</strong>. The card above keeps showing the address you last loaded until ' +
        'you click <strong>Load onto card</strong>.'
      : 'Nothing is saved until you click <strong>Save to address book</strong>, and the ' +
        'card above is not changed by anything you type here.';

    el.abEditName.value = contact ? contact.name : '';
    CONTACT_FIELDS.forEach((f) => {
      document.getElementById(abEditFieldId(f)).value = contact ? (contact.fields[f] || '') : '';
    });
    el.abEditPanel.hidden = false;
    refreshAbEditSummary();
    el.abEditName.focus();
  }

  function closeAbEdit() {
    abEdit.open = false;
    abEdit.id = null;
    el.abEditPanel.hidden = true;
  }

  /** Small HTML-escape for names shown via innerHTML. */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Live PIN validity + a preview of the lines the contact would print. */
  function refreshAbEditSummary() {
    const fields = {};
    CONTACT_FIELDS.forEach((f) => {
      fields[f] = document.getElementById(abEditFieldId(f)).value;
    });
    const pin = sanitizePin(fields.pin);
    const badge = el.abEditPinBadge;
    if (!pin) {
      badge.textContent = 'PIN —';
      badge.className = 'fit-badge warn';
    } else if (isCompletePin(pin)) {
      badge.textContent = 'PIN ' + pin;
      badge.className = 'fit-badge';
    } else {
      badge.textContent = 'PIN "' + pin + '" — needs 6 digits';
      badge.className = 'fit-badge warn';
    }
    // Matches exactly how the card assembles each kind (sender PIN prints
    // as a line; the recipient PIN lives in the six boxes).
    const lines = assembleAddress(fields, abEdit.kind === 'senders');
    el.abEditSummary.textContent = lines.length
      ? 'Prints as: ' + lines.join(' / ')
      : 'Nothing to print yet — add at least one address field.';
  }

  /** Persist the edit panel's contact (new or changed) into the book. */
  function saveAbEdit() {
    const kind = abEdit.kind;
    const fields = {};
    let anyValue = false;
    CONTACT_FIELDS.forEach((f) => {
      const raw = document.getElementById(abEditFieldId(f)).value;
      fields[f] = f === 'pin' ? sanitizePin(raw) : raw;
      if (f !== 'pin' && raw.trim()) anyValue = true;
    });
    const name = el.abEditName.value.trim();
    if (!name && !anyValue) {
      setStatus('Enter a display name and at least one address field.', 'error');
      el.abEditName.focus();
      return;
    }
    const saved = upsertContact(addressBook, kind, {
      id: abEdit.id || undefined,
      name: name,
      fields: fields
    });
    if (!saved) { setStatus('That contact could not be saved.', 'error'); return; }
    const stored = saveAddressBook(addressBook);
    const wasEdit = !!abEdit.id;

    closeAbEdit();
    // Refresh first, then select — the option must exist before it can be
    // selected (same reason as in saveCurrentContact).
    refreshAddressBookUI();
    abPartsFor(kind).select.value = saved.id;
    updateAbSelectionStates();
    setStatus('Contact "' + saved.name + '" ' + (wasEdit ? 'updated' : 'saved') + '. ' +
      'The card is unchanged — click Load to put it on the postcard.' +
      (stored ? '' : ' (Browser storage is blocked — kept for this session only.)'),
      stored ? '' : 'error');
  }

  /** Delete the selected contact, always asking first. */
  function deleteSelectedContact(kind) {
    const parts = abPartsFor(kind);
    const contact = findContact(addressBook, kind, parts.select.value);
    if (!contact) return;
    const ok = window.confirm('Delete "' + contact.name + '" from the saved ' +
      AB_KIND_LABEL[kind] + 's?\n\nThis removes it from this browser only and cannot be undone.');
    if (!ok) { setStatus('Delete cancelled.'); return; }
    deleteContact(addressBook, kind, contact.id);
    saveAddressBook(addressBook);
    if (abEdit.open && abEdit.id === contact.id) closeAbEdit();
    refreshAddressBookUI();
    // The card deliberately keeps whatever address was loaded — deleting a
    // contact never changes the postcard by itself.
    setStatus('Deleted "' + contact.name + '". The card still shows the address you had loaded.');
  }

  /* ── CSV import / export (recipients) ──────────────────────────── */

  function exportContactsCsv() {
    const list = addressBook.recipients || [];
    if (!list.length) { setStatus('There are no saved recipients to export yet.', 'error'); return; }
    // UTF-8 BOM so Excel opens the non-ASCII text correctly.
    downloadTextFile('postcard-recipients.csv', contactsToCsv(list, true), 'text/csv');
    setStatus('Exported ' + list.length + ' recipient(s) as CSV (UTF-8 with BOM).');
  }

  function importContactsCsv(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => {
      setStatus('That file could not be read.', 'error');
      el.abCsvFile.value = '';
    };
    reader.onload = () => {
      el.abCsvFile.value = '';
      let parsed;
      try {
        parsed = csvToContacts(String(reader.result), addressBook.recipients);
      } catch (err) {
        setStatus('CSV import failed: ' + err.message, 'error');
        return;
      }
      if (!parsed.contacts.length) {
        setStatus(parsed.warnings[0] || 'No contacts could be read from that file.', 'error');
        return;
      }
      abCsvPending = parsed;
      renderCsvPreview(parsed);
      setStatus('Review the ' + parsed.contacts.length +
        ' contact(s) below, then confirm — nothing is saved until you do.');
    };
    reader.readAsText(file, 'utf-8');
  }

  /** Fill the confirmation table. Nothing is stored at this point. */
  function renderCsvPreview(parsed) {
    const tbody = el.abCsvTable.querySelector('tbody');
    tbody.innerHTML = '';
    parsed.contacts.forEach((c) => {
      const tr = document.createElement('tr');
      const addr = assembleAddress(c.fields, false)
        .filter((l) => l !== c.fields.name)
        .join('\n');
      const pin = sanitizePin(c.fields.pin);
      const pinCell = document.createElement('td');
      pinCell.textContent = pin || '—';
      pinCell.className = pin
        ? (isCompletePin(pin) ? 'ab-pin-ok' : 'ab-pin-bad')
        : 'ab-pin-none';

      const looksFamiliar = findSimilarContacts(addressBook, 'recipients', c.fields).length > 0;
      const statusCell = document.createElement('td');
      statusCell.textContent = looksFamiliar ? 'Matches an existing contact' : 'New';
      if (looksFamiliar) statusCell.className = 'ab-pin-bad';

      [c.name, addr || '—'].forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });
      tr.appendChild(pinCell);
      tr.appendChild(statusCell);
      tbody.appendChild(tr);
    });

    el.abCsvCount.textContent = parsed.contacts.length + ' row(s)';
    el.abCsvIntro.textContent =
      'Columns found in the file are mapped by header name. Contacts with an ' +
      'incomplete PIN are kept (the PIN is simply flagged below), never discarded.';
    el.abCsvWarnings.textContent = parsed.warnings.length
      ? parsed.warnings.slice(0, 12).join('  ') +
        (parsed.warnings.length > 12 ? '  (+' + (parsed.warnings.length - 12) + ' more)' : '')
      : '';
    el.abCsvPreview.hidden = false;
  }

  function confirmCsvImport() {
    if (!abCsvPending) return;
    const skipDupes = el.abCsvSkipDupes.checked;
    let added = 0;
    let skipped = 0;
    abCsvPending.contacts.forEach((c) => {
      // "Skip" is the default; with it off, the row is imported as a NEW
      // contact (its name gets a suffix) — existing contacts are untouched.
      if (skipDupes && findSimilarContacts(addressBook, 'recipients', c.fields).length) {
        skipped += 1;
        return;
      }
      upsertContact(addressBook, 'recipients', c);
      added += 1;
    });
    const stored = saveAddressBook(addressBook);
    abCsvPending = null;
    el.abCsvPreview.hidden = true;
    refreshAddressBookUI();
    setStatus('Imported ' + added + ' recipient(s)' +
      (skipped ? ', skipped ' + skipped + ' that matched an existing contact' : '') + '. ' +
      'Existing contacts were not changed.' +
      (stored ? '' : ' (Browser storage is blocked — kept for this session only.)'),
      stored ? '' : 'error');
  }

  function cancelCsvImport() {
    abCsvPending = null;
    el.abCsvPreview.hidden = true;
    setStatus('CSV import cancelled — nothing was saved.');
  }

  /* ── Init ───────────────────────────────────────────────────────── */

  function init() {
    cacheElements();
    Object.assign(state, JSON.parse(JSON.stringify(loadSettings())));

    applyLayoutToCss();
    buildRuledLines();
    buildRulers();
    buildPinBoxes();
    positionGuides();
    fillForm();
    showTab('front');
    renderFront(state);
    renderBack(state);
    fitPreview();

    const liveInputs = []
      .concat(Object.keys(FIELD_IDS.sender).map((f) => el['s_' + f]))
      .concat(Object.keys(FIELD_IDS.recipient).map((f) => el['r_' + f]))
      .concat([el.senderFontPt, el.recipientFontPt, el.fontFamily, el.flagFontPt,
               el.fontBold, el.fontItalic, el.fontUnderline,
               el.messageInput,
               el.backFontSize, el.backLineSpacing, el.backMarginLeft, el.backMarginTop,
               el.senderLinesInput, el.recipientLinesInput,
               el.sSingleInput, el.rSingleInput]);
    liveInputs.forEach((input) => input.addEventListener('input', updatePreview));

    // Entry mode toggle: Full form <-> Single box, with a warning first.
    [[el.sEntryFull, 'sender', 'full'], [el.sEntrySingle, 'sender', 'single'],
     [el.rEntryFull, 'recipient', 'full'], [el.rEntrySingle, 'recipient', 'single']]
      .forEach((spec) => {
        spec[0].addEventListener('change', () => {
          if (spec[0].checked) switchEntryMode(spec[1], spec[2]);
        });
      });
    // The single box defeats a saved manual override, exactly like the fields do.
    [[el.sSingleInput, 'sender'], [el.rSingleInput, 'recipient']].forEach((spec) => {
      spec[0].addEventListener('input', () => {
        if (clearOverrideOnFieldEdit(spec[1])) updatePreview();
      });
    });

    // Editing an address field must defeat any saved manual line override,
    // otherwise the fields appear to do nothing.
    Object.keys(FIELD_IDS.sender).forEach((f) => {
      el['s_' + f].addEventListener('input', () => {
        if (clearOverrideOnFieldEdit('sender')) updatePreview();
      });
      el['r_' + f].addEventListener('input', () => {
        if (clearOverrideOnFieldEdit('recipient')) updatePreview();
      });
    });

    // Enter does nothing in the From form. A stray Enter would only add an
    // empty printed line, so swallow it. The single box is deliberately
    // EXCLUDED — there Enter is how you start a new line.
    el.sFullGrid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });

    // On-card editing: typing straight onto the address block writes the
    // lines back through the manual-line override, so the card and the
    // lines editor never disagree. Blur (not each keystroke) so the caret
    // isn't yanked away mid-word by a re-render.
    [['senderBlock', 'sender'], ['recipientBlock', 'recipient']].forEach((spec) => {
      const block = document.getElementById(spec[0]);
      // Remember the text at focus so a click with no typing never turns the
      // card into a silent manual override (which would freeze the fields).
      block.addEventListener('focus', () => { block.dataset.original = block.innerText; });
      block.addEventListener('blur', () => {
        const lines = block.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
        const original = (block.dataset.original || '').split('\n')
          .map((l) => l.trim()).filter(Boolean);
        if (JSON.stringify(lines) === JSON.stringify(original)) return;
        const input = spec[1] === 'sender' ? el.senderLinesInput : el.recipientLinesInput;
        input.value = lines.join('\n');
        updatePreview();
        setStatus('Address edited on the card — ' +
          (spec[1] === 'sender' ? 'From' : 'To') + ' lines updated.');
      });
      // Plain text only: a paste must never drag formatting onto the card.
      block.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
      });
    });

    // PIN boxes typeable on the card: click the six boxes, type the digits.
    // The row (not a single box) holds focus, so each re-render just rewrites
    // the box text and the caret never moves. Digits fill left to right.
    const pinRow = document.getElementById('pinRow');
    const pinField = el['r_pin'];   // cached by FIELD_IDS, not by its id
    const setPinFromCard = (code) => {
      pinField.value = code;
      updatePreview();
    };
    pinRow.addEventListener('keydown', (e) => {
      const cur = String(pinField.value || '').replace(/\D/g, '');
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        if (cur.length < 6) setPinFromCard(cur + e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPinFromCard(cur.slice(0, -1));
      } else if (e.key.length === 1) {
        e.preventDefault();   // a PIN is digits only — never letters
      }
    });
    pinRow.addEventListener('focus', () => {
      setStatus('Click the PIN boxes on the card and type 6 digits.');
    });

    // Clicking the 🇮🇳 line on the card adjusts its size: the caret would be
    // useless inside a one-emoji line, so aim the user at the Flag field.
    const senderBlock = document.getElementById('senderBlock');
    // The Template 1 button draws the same vector flag as the card.
    const btnFlag = el.sTemplateBtn.querySelector('.btn-flag');
    if (btnFlag) btnFlag.innerHTML = flagInnerSvg();
    const flagTarget = (e) => (e.target.closest ? e.target.closest('.flag-line') : null);
    senderBlock.addEventListener('mousedown', (e) => {
      if (flagTarget(e)) e.preventDefault();   // never park the caret on the flag
    });
    senderBlock.addEventListener('click', (e) => {
      if (!flagTarget(e)) return;
      el.flagFontPt.focus();
      el.flagFontPt.select();
      setStatus('Flag size in points — the 🇮🇳 line prints at this size.');
    });

    // Template 1 for the From address: 🇮🇳 flag + "From" as the first two
    // printed lines — click again to remove it.
    el.sTemplateBtn.addEventListener('click', () => {
      const field = state.entryModes.sender === 'single' ? el.sSingleInput : el['s_name'];
      const val = field.value.replace(/^\s+/, '');
      const T1 = /^\u{1F1EE}\u{1F1F3}\s*\r?\n?\s*From\b\s*/u;
      const applied = !T1.test(val);
      field.value = applied ? '🇮🇳\nFrom' + (val ? '\n' + val : '')
                            : val.replace(T1, '');
      const hadOverride = clearOverrideOnFieldEdit('sender');
      updatePreview();
      if (!hadOverride) {
        setStatus(applied
          ? 'Template 1 applied — 🇮🇳 and "From" print as the first two lines.'
          : 'Template 1 removed from the From address.');
      }
    });

    // Offsets + image controls update live.
    Object.keys(OFFSET_KEYS).forEach((id) => {
      document.getElementById(id).addEventListener('input', updatePreview);
      // Committing a value persists it, so a reload keeps the calibration.
      document.getElementById(id).addEventListener('change', () => {
        readForm();
        saveSettings(state);
      });
    });
    [el.backOffX, el.backOffY].forEach((i) => i.addEventListener('input', updatePreview));
    ['imgX', 'imgY', 'imgRotate', 'cropLeft', 'cropTop'].forEach((id) =>
      el[id].addEventListener('input', updatePreview));
    el.imgW.addEventListener('input', () => { onImageSizeChange('w'); updatePreview(); });
    el.imgH.addEventListener('input', () => { onImageSizeChange('h'); updatePreview(); });
    el.imagePrintToggle.addEventListener('change', () => { updatePreview(); });

    // Tabs.
    el.tabFrontBtn.addEventListener('click', () => showTab('front'));
    el.tabBackBtn.addEventListener('click', () => showTab('back'));
    el.tabPrintBtn.addEventListener('click', () => { showTab('print'); });

  // Rebuild printed lines from the fields.
  el.resetLinesBtn.addEventListener('click', () => {
    el.senderLinesInput.value = '';
    el.recipientLinesInput.value = '';
    updatePreview();
    refreshOverrideBadge();
    setStatus('Addresses rebuilt from the fields.');
  });

    // Fit text (explicit).
    el.fitTextBtn.addEventListener('click', fitText);

    // Explicit save, for when the user wants to confirm the values are stored.
    el.saveCalibBtn.addEventListener('click', () => {
      readForm();
      const ok = saveSettings(state);
      setStatus(ok ? 'Calibration offsets saved in this browser.'
                   : 'Could not save (browser storage blocked) — use Export JSON instead.',
        ok ? '' : 'error');
    });

    // Reset calibration offsets to the defaults (PIN Y = +0.4 mm).
    el.resetCalibBtn.addEventListener('click', () => {
      Object.keys(OFFSET_KEYS).forEach((id) => {
        const v = DEFAULT_SETTINGS.offsets[OFFSET_KEYS[id]];
        document.getElementById(id).value =
          fmtMm(id === 'offPinYMm' ? v - PIN_Y_BASE_MM : v);
      });
      updatePreview();
      // Persist the cleared values, otherwise a reload restores the old ones.
      const ok = saveSettings(state);
      setStatus(ok ? 'Calibration offsets cleared and saved.'
                   : 'Offsets cleared, but could not save (browser storage blocked).',
        ok ? '' : 'error');
    });

    // Guides and actual size.
    el.guidesBtn.addEventListener('click', () => {
      const shown = toggleGuides();
      el.guidesBtn.textContent = shown ? 'Hide guides' : 'Show guides';
      el.guidesBtn.classList.toggle('active', shown);
      setStatus(shown ? 'Calibration guides shown.' : 'Calibration guides hidden.');
    });
    el.actualBtn.addEventListener('click', () => {
      const actual = toggleActualSize();
      el.actualBtn.textContent = actual ? 'Fit to window' : 'Actual size';
      el.actualBtn.classList.toggle('active', actual);
      setStatus(actual
        ? 'Actual size (1:1, 96 DPI) — hold the card against the screen to compare.'
        : 'Preview fitted to window.');
    });

    // Back image controls.
    el.imageUploadBtn.addEventListener('click', () => el.imageInput.click());
    el.imageInput.addEventListener('change', () => {
      loadImageFile(el.imageInput.files[0]);
      el.imageInput.value = '';
    });
    el.imageRemoveBtn.addEventListener('click', removeImage);
    el.imageResetBtn.addEventListener('click', resetImage);

    // Fit the back message text (explicit action).
    el.messageFitTextBtn.addEventListener('click', fitMessageText);

    // Templates.
    el.templateSaveBtn.addEventListener('click', saveTemplate);
    el.templateApplyBtn.addEventListener('click', applyTemplate);
    el.templateDeleteBtn.addEventListener('click', deleteTemplate);

    // ── Address book ──────────────────────────────────────────────
    buildAbEditFields();
    addressBook = loadAddressBook();
    refreshAddressBookUI();

    // Recipients.
    el.abRecipientSaveBtn.addEventListener('click', () => saveCurrentContact('recipients'));
    el.abRecipientNewBtn.addEventListener('click', () => openAbEdit('recipients', null));
    el.abRecipientLoadBtn.addEventListener('click', () =>
      loadContact('recipients', el.abRecipientSelect.value));
    el.abRecipientEditBtn.addEventListener('click', () =>
      openAbEdit('recipients', el.abRecipientSelect.value));
    el.abRecipientDeleteBtn.addEventListener('click', () => deleteSelectedContact('recipients'));
    // Selecting a contact loads it onto the card immediately (fields, PIN
    // boxes and preview all update). The explicit Load button remains for
    // re-loading after an edit — same id means no change event fires.
    el.abRecipientSelect.addEventListener('change', () => {
      updateAbSelectionStates();
      if (el.abRecipientSelect.value) loadContact('recipients', el.abRecipientSelect.value);
    });

    // Senders.
    el.abSenderSaveBtn.addEventListener('click', () => saveCurrentContact('senders'));
    el.abSenderNewBtn.addEventListener('click', () => openAbEdit('senders', null));
    el.abSenderLoadBtn.addEventListener('click', () =>
      loadContact('senders', el.abSenderSelect.value));
    el.abSenderEditBtn.addEventListener('click', () =>
      openAbEdit('senders', el.abSenderSelect.value));
    el.abSenderDeleteBtn.addEventListener('click', () => deleteSelectedContact('senders'));
    el.abSenderSelect.addEventListener('change', () => {
      updateAbSelectionStates();
      if (el.abSenderSelect.value) loadContact('senders', el.abSenderSelect.value);
    });

    // Edit panel (edits the SAVED contact only — never the card).
    el.abEditSaveBtn.addEventListener('click', saveAbEdit);
    el.abEditLoadBtn.addEventListener('click', () => {
      if (abEdit.id) loadContact(abEdit.kind, abEdit.id);
      else setStatus('Save this contact first, then load it.', 'error');
    });
    el.abEditCancelBtn.addEventListener('click', () => {
      closeAbEdit();
      setStatus('Edit cancelled — the saved contact and the card are unchanged.');
    });
    el.abEditName.addEventListener('input', refreshAbEditSummary);
    Array.prototype.forEach.call(el.abEditFields.querySelectorAll('input, textarea'), (input) => {
      input.addEventListener('input', refreshAbEditSummary);
    });

    // CSV.
    el.abCsvExportBtn.addEventListener('click', exportContactsCsv);
    el.abCsvImportBtn.addEventListener('click', () => el.abCsvFile.click());
    el.abCsvFile.addEventListener('change', () => importContactsCsv(el.abCsvFile.files[0]));
    el.abCsvConfirmBtn.addEventListener('click', confirmCsvImport);
    el.abCsvCancelBtn.addEventListener('click', cancelCsvImport);

    // Jump from the Back tab to printing that side.
    el.gotoPrintBackBtn.addEventListener('click', () => {
      el.printSideBack.checked = true;
      showTab('print');
      setStatus('Print tab ready — side set to Back (message + optional image).');
    });

    // Print tab: side + mode changes.
    [el.printSideFront, el.printSideBack, el.printSideBoth].forEach((radio) => {
      radio.addEventListener('change', showPrintPreview);
    });
    [el.printModeOverlay, el.printModeCard, el.printModeCalibration].forEach((radio) => {
      radio.addEventListener('change', () => {
        applyPrintPageRule(selectedPrintMode(), selectedPrintSide());
        showPrintPreview();
      });
    });

    // Print flow: instructions on first use, then straight to the dialog.
    el.printBtn.addEventListener('click', () => {
      readForm();
      if (state.printHelpSeen) { doPrint(); return; }
      el.printHelp.hidden = false;
      setStatus('Read the print settings, then click "Print now".');
    });
    el.printNowBtn.addEventListener('click', () => {
      state.printHelpSeen = true;
      saveSettings(state);
      el.printHelp.hidden = true;
      setStatus('Opening the print dialog — check scale (100%), orientation (landscape).');
      setTimeout(doPrint, 60);
    });
    el.printCancelBtn.addEventListener('click', () => {
      el.printHelp.hidden = true;
      setStatus('Printing cancelled.');
    });

    // Explicit refresh (front panel + Back panel each have their own).
    [el.refreshBtn, el.refreshBackBtn].forEach((btn) => btn.addEventListener('click', () => {
      updatePreview();
      fitPreview();
      setStatus('Preview updated — layout approximation, not print-calibrated.');
    }));

    // Settings.
    el.saveBtn.addEventListener('click', () => {
      readForm();
      const ok = saveSettings(state);
      setStatus(ok ? 'Settings saved in this browser (no image pixels).'
                   : 'Could not save (browser storage blocked) — use Export JSON instead.',
        ok ? '' : 'error');
    });
    el.exportBtn.addEventListener('click', () => {
      readForm();
      exportSettingsFile(state);
      setStatus('Settings exported (placement only — images are not exported).');
    });
    el.importBtn.addEventListener('click', () => el.importFile.click());
    el.importFile.addEventListener('change', () => {
      const file = el.importFile.files[0];
      if (!file) return;
      importSettingsFile(file)
        .then((imported) => {
          Object.assign(state, imported);
          fillForm();
          renderFront(state);
          renderBack(state);
          setStatus('Settings imported and saved.');
        })
        .catch((err) => setStatus(err.message, 'error'))
        .finally(() => { el.importFile.value = ''; });
    });

    // Clear all locally saved data (print settings AND the address book).
    el.clearDataBtn.addEventListener('click', () => {
      const settingsOk = clearSavedSettings();
      const bookOk = clearAddressBook();
      addressBook = emptyAddressBook();
      closeAbEdit();
      el.abCsvPreview.hidden = true;
      abCsvPending = null;
      refreshAddressBookUI();
      setStatus(settingsOk && bookOk
        ? 'All saved data cleared from this browser — settings, calibration and the address book.'
        : 'Could not clear all saved data (browser storage may be blocked).',
        settingsOk && bookOk ? '' : 'error');
    });

    // Keep the preview fitted when the window changes size.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => fitPreview(el.previewPane.classList.contains('actual-size')))
        .observe(el.previewPane);
    }
    window.addEventListener('resize', () =>
      fitPreview(el.previewPane.classList.contains('actual-size')));

    // Default print setup.
    document.body.dataset.printSide = 'front';
    applyPrintPageRule(selectedPrintMode(), selectedPrintSide());
    el.printModeHint.textContent = MODE_HINTS[selectedPrintMode()];
    enableImageControls(!!window.__backImageEl);

    setStatus('Ready — the preview updates as you type.');
  }

  init();
})();
