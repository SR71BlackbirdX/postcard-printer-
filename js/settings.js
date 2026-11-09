/**
 * settings.js — Save and load app settings locally.
 *
 * Storage is the browser's localStorage: no database, no cloud service.
 * The Export/Import buttons move settings between machines as plain JSON.
 * Uploaded image PIXELS are never persisted — only their placement
 * settings and the "print image" flag (see the privacy note in the UI).
 * Missing or malformed data always falls back to safe defaults.
 */

const SETTINGS_KEY = 'indian-postcard-printer.settings.v1';
// Bump when a new release changes the meaning of saved values. Settings
// saved by an older version are upgraded (old defaults are replaced) while
// the user's actual content is preserved.
const SETTINGS_VERSION = 2;

// Fonts the card may use. Only these are accepted by sanitizeSettings, so a
// hand-edited or foreign JSON file can never inject an arbitrary font name.
const CARD_FONT_FAMILIES = [
  'Arial', 'Times New Roman', 'Verdana', 'Tahoma', 'Georgia',
  'Trebuchet MS', 'Courier New', 'Comic Sans MS', 'Nirmala UI'
];

const emptyFields = () => ({
  name: '', house: '', building: '', street: '', area: '',
  cityOrVillage: '', district: '', state: '', pin: ''
});

const DEFAULT_SETTINGS = {
  // Structured address fields -> assembled into printed lines automatically.
  // Deliberately EMPTY: the app ships no sample address, so a fresh card
  // (and a cleared card) prints nothing until the user types an address.
  sender: emptyFields(),
  recipient: emptyFields(),

  // Manual line overrides (null = build from the fields above).
  senderLines: null,
  recipientLines: null,

  // Entry mode per address: 'full' = the structured 9-field form,
  // 'single' = one textarea, one line per printed line. The PIN input is
  // always separate and is not affected by the mode.
  entryModes: { sender: 'full', recipient: 'full' },
  // The text typed while in 'single' mode (kept so a re-save round-trips).
  singleText: { sender: '', recipient: '' },

  // Per-address font sizes. 9 pt was the size measured on the reference
  // card; 13 pt matches the proportion of the printed artwork in practice.
  senderFontPt: 13,
  recipientFontPt: 13,
  // Size of the 🇮🇳 flag line only (Template 1). Kept apart from the sender
  // font so the flag can print larger without changing the address.
  flagFontPt: 16,
  // Card font family. Arial is the default; the rest are offered in the
  // picker. Whitelisted in sanitizeSettings.
  fontFamily: 'Arial',
  // Bold / italic / underline for BOTH printed addresses (From + To).
  fontBold: false,
  fontItalic: false,
  fontUnderline: false,
  // Front calibration offsets in mm (shift the editable content only).
  // PIN Y defaults to +0.4 mm as requested; everything else starts at 0.
  offsets: { senderX: 0, senderY: 0, recipientX: 0, recipientY: 0, pinX: 0, pinY: 0.4 },

  // Back side (blank paper + optional message).
  message: '',
  backLayout: {
    fontPointSize: 9,
    lineSpacingMm: 7,
    marginLeftMm: 8,
    marginTopMm: 10,
    offsetXMm: 0,            // calibration offset for the message
    offsetYMm: 0,
    printImage: false        // whether an uploaded image prints with the back
  },

  // Back-image placement. IMAGE PIXELS ARE NEVER SAVED — only these
  // settings and the print flag; the image itself is re-uploaded per session.
  backImage: {
    xMm: 25, yMm: 25, wMm: 60, hMm: 40,
    rotation: 0,
    crop: { left: 0, top: 0, width: 100, height: 100 },
    aspectLocked: true
  },

  // Reusable message templates: [{ name, text }]
  templates: [],
  // Set after the first-print instructions have been acknowledged.
  printHelpSeen: false,
  // Schema version of the saved settings (see SETTINGS_VERSION).
  settingsVersion: 2
};

/** Clamp helper that keeps numbers finite and inside a range. */
function clampNum(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * Clean up anything broken in a hand-edited or imported file.
 * Never throws — always returns a complete, valid settings object.
 */
function sanitizeSettings(raw) {
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (!raw || typeof raw !== 'object') return out;

  // ── Address fields ──────────────────────────────────────────────
  ['sender', 'recipient'].forEach((key) => {
    const src = (typeof raw[key] === 'object' && raw[key]) || {};
    Object.keys(out[key]).forEach((f) => {
      if (typeof src[f] === 'string') out[key][f] = src[f].slice(0, 300);
    });
    // PIN is digits only (6 max for recipient; sender optional).
    out[key].pin = out[key].pin.replace(/\D/g, '').slice(0, 6);
    // Migration: older versions stored plain address text.
    if (typeof raw[key === 'sender' ? 'senderAddress' : 'recipientAddress'] === 'string' &&
        !raw.senderLines && !raw.recipientLines) {
      out[key + 'Lines'] = raw[key === 'sender' ? 'senderAddress' : 'recipientAddress']
        .split('\n').map((l) => l.trim()).filter(Boolean);
    }
  });

  // ── Manual line overrides ───────────────────────────────────────
  if (Array.isArray(raw.senderLines)) {
    out.senderLines = raw.senderLines.filter((l) => typeof l === 'string').slice(0, 20).map((l) => l.slice(0, 200));
  }
  if (Array.isArray(raw.recipientLines)) {
    out.recipientLines = raw.recipientLines.filter((l) => typeof l === 'string').slice(0, 20).map((l) => l.slice(0, 200));
  }

  // ── Entry mode (full form vs single box) ────────────────────────
  // Anything unknown falls back to 'full' — the mode that has always existed.
  const rawModes = (typeof raw.entryModes === 'object' && raw.entryModes) || {};
  ['sender', 'recipient'].forEach((k) => {
    out.entryModes[k] = rawModes[k] === 'single' ? 'single' : 'full';
  });
  const rawSingle = (typeof raw.singleText === 'object' && raw.singleText) || {};
  ['sender', 'recipient'].forEach((k) => {
    out.singleText[k] = typeof rawSingle[k] === 'string' ? rawSingle[k].slice(0, 4000) : '';
  });

  // ── Fonts ───────────────────────────────────────────────────────
  // Settings saved before SETTINGS_VERSION keep their content but adopt the
  // new font defaults (the old 9 pt default was replaced by 13 pt).
  const oldSave = !raw.settingsVersion || Number(raw.settingsVersion) < SETTINGS_VERSION;
  out.settingsVersion = SETTINGS_VERSION;
  out.senderFontPt = oldSave ? DEFAULT_SETTINGS.senderFontPt
    : clampNum(raw.senderFontPt, 6, 20, DEFAULT_SETTINGS.senderFontPt);
  out.recipientFontPt = oldSave ? DEFAULT_SETTINGS.recipientFontPt
    : clampNum(raw.recipientFontPt, 6, 20, DEFAULT_SETTINGS.recipientFontPt);
  // Older saves have no flag size — fall back to the default, never NaN.
  out.flagFontPt = clampNum(raw.flagFontPt, 6, 30, DEFAULT_SETTINGS.flagFontPt);
  out.fontFamily = CARD_FONT_FAMILIES.includes(raw.fontFamily)
    ? raw.fontFamily : DEFAULT_SETTINGS.fontFamily;
  // Style toggles: anything but a real `true` is off (never truthy strings).
  out.fontBold = raw.fontBold === true;
  out.fontItalic = raw.fontItalic === true;
  out.fontUnderline = raw.fontUnderline === true;

  // ── Calibration offsets (front) ─────────────────────────────────
  const rawOffsets = (typeof raw.offsets === 'object' && raw.offsets) || {};
  out.offsets = {};
  Object.keys(DEFAULT_SETTINGS.offsets).forEach((key) => {
    const v = Number(rawOffsets[key]);
    // ±50 mm: must exceed the ~30 mm that makes the recipient's
    // "Outside printable area" guard reachable, and match readForm exactly.
    const clamped = Number.isFinite(v)
      ? Math.min(50, Math.max(-50, v))
      : DEFAULT_SETTINGS.offsets[key];
    out.offsets[key] = Math.round(clamped * 10) / 10;
  });

  // ── Back-side message layout ────────────────────────────────────
  out.message = typeof raw.message === 'string' ? raw.message.slice(0, 4000) : '';
  const bl = (typeof raw.backLayout === 'object' && raw.backLayout) || {};
  out.backLayout.fontPointSize = clampNum(bl.fontPointSize, 6, 20, 9);
  out.backLayout.lineSpacingMm = clampNum(bl.lineSpacingMm, 4, 12, 7);
  out.backLayout.marginLeftMm = clampNum(bl.marginLeftMm, 0, 30, 8);
  out.backLayout.marginTopMm = clampNum(bl.marginTopMm, 0, 40, 10);
  out.backLayout.offsetXMm = Math.round(clampNum(bl.offsetXMm, -20, 20, 0) * 10) / 10;
  out.backLayout.offsetYMm = Math.round(clampNum(bl.offsetYMm, -20, 20, 0) * 10) / 10;
  out.backLayout.printImage = bl.printImage === true;

  // ── Back-image placement (never the pixels) ──────────────────────
  const img = (typeof raw.backImage === 'object' && raw.backImage) || {};
  out.backImage.xMm = clampNum(img.xMm, -50, 200, 25);
  out.backImage.yMm = clampNum(img.yMm, -50, 200, 25);
  out.backImage.wMm = clampNum(img.wMm, 5, 300, 60);
  out.backImage.hMm = clampNum(img.hMm, 5, 300, 40);
  out.backImage.rotation = clampNum(img.rotation, -360, 360, 0);
  const crop = (typeof img.crop === 'object' && img.crop) || {};
  out.backImage.crop = {
    left: clampNum(crop.left, 0, 99, 0),
    top: clampNum(crop.top, 0, 99, 0),
    width: clampNum(crop.width, 1, 100, 100),
    height: clampNum(crop.height, 1, 100, 100)
  };
  out.backImage.aspectLocked = img.aspectLocked !== false;

  // ── Templates ───────────────────────────────────────────────────
  out.templates = Array.isArray(raw.templates)
    ? raw.templates
        .filter((t) => t && typeof t.name === 'string' && typeof t.text === 'string')
        .slice(0, 50)
        .map((t) => ({ name: t.name.slice(0, 60), text: t.text.slice(0, 2000) }))
    : [];

  out.printHelpSeen = raw.printHelpSeen === true;

  return out;
}

/** Load settings. Returns defaults if the stored value is missing or broken. */
function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    return sanitizeSettings(JSON.parse(raw));
  } catch (err) {
    console.warn('Settings could not be loaded — using defaults.', err);
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

/** Save settings. Returns true on success, false if storage is blocked. */
function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (err) {
    console.warn('Settings could not be saved.', err);
    return false;
  }
}

/** Remove all locally saved data (addresses, message, templates). */
function clearSavedSettings() {
  try {
    window.localStorage.removeItem(SETTINGS_KEY);
    return true;
  } catch (err) {
    console.warn('Saved data could not be cleared.', err);
    return false;
  }
}

/** Download the current settings as a JSON file (no image pixels). */
function exportSettingsFile(settings) {
  const data = JSON.stringify(settings, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'postcard-printer-settings.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read an imported JSON settings file. Returns a Promise<object>. */
function importSettingsFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      try {
        resolve(sanitizeSettings(JSON.parse(String(reader.result))));
      } catch (err) {
        reject(new Error('That file is not valid settings JSON.'));
      }
    };
    reader.readAsText(file);
  });
}

// Allow Node.js to load this file for the automated tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SETTINGS, SETTINGS_VERSION, CARD_FONT_FAMILIES,
    sanitizeSettings, clearSavedSettings
  };
}
