/**
 * addressbook.js — saved senders and recipients.
 *
 * Pure logic + localStorage, mirroring settings.js: no framework, no server,
 * no external service. The address book is stored under its OWN key so it
 * never collides with print settings or calibration offsets.
 *
 * A contact holds ONLY the structured address fields. Uploaded image pixels
 * are never stored in a contact (images are session-only by design).
 *
 * Every entry point tolerates missing, malformed or older stored data: it
 * falls back to an empty book instead of throwing.
 */

const ADDRESS_BOOK_KEY = 'indian-postcard-printer.addressbook.v1';
// Bump if the stored shape ever changes; older data is upgraded on load.
const ADDRESS_BOOK_VERSION = 1;

/** The nine structured address fields, in the order they are printed. */
const CONTACT_FIELDS = [
  'name', 'house', 'building', 'street', 'area',
  'cityOrVillage', 'district', 'state', 'pin'
];

/** Longest value we keep per field (a safety cap, not a printing limit). */
const CONTACT_FIELD_MAX = 300;
/** Contacts per kind — generous, but a runaway import cannot fill storage. */
const CONTACT_MAX_PER_KIND = 500;

const CONTACT_KINDS = ['recipients', 'senders'];

/** An empty field bag. */
function emptyContactFields() {
  const out = {};
  CONTACT_FIELDS.forEach((f) => { out[f] = ''; });
  return out;
}

/** A brand-new empty book. */
function emptyAddressBook() {
  return { version: ADDRESS_BOOK_VERSION, recipients: [], senders: [] };
}

/**
 * A stable, unique id for a new contact. Uses crypto.randomUUID when the
 * browser offers it, otherwise a time + random fallback that cannot collide
 * with ids already in the book.
 */
function makeContactId(existing) {
  const taken = new Set((existing || []).map((c) => c && c.id));
  let id;
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    id = crypto.randomUUID();
  } else {
    id = 'c' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 10);
  }
  // Extremely unlikely, but never reuse an id that is already in the book.
  let n = 0;
  while (taken.has(id)) {
    n += 1;
    id = 'c' + Date.now().toString(36) + '-' + n + '-' +
      Math.random().toString(36).slice(2, 10);
  }
  return id;
}

/** Digits-only PIN, at most six digits ('' when there is none). */
function sanitizePin(value) {
  return String(value == null ? '' : value).replace(/\D/g, '').slice(0, 6);
}

/** A PIN is complete when it holds exactly six digits. */
function isCompletePin(pin) {
  return /^\d{6}$/.test(sanitizePin(pin));
}

/**
 * Clean one contact. Returns null when there is nothing usable to keep
 * (no id, or every field empty) — never throws.
 */
function sanitizeContact(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const fields = emptyContactFields();
  let anyField = false;
  CONTACT_FIELDS.forEach((f) => {
    // Nested { fields: {...} } wins over flat keys: on the nested shape the
    // top-level `name` is the DISPLAY name, and it must never clobber the
    // printed address name in fields.name.
    if (typeof raw.fields === 'object' && raw.fields && typeof raw.fields[f] === 'string') {
      fields[f] = raw.fields[f].slice(0, CONTACT_FIELD_MAX);
    } else if (typeof raw[f] === 'string') {
      fields[f] = raw[f].slice(0, CONTACT_FIELD_MAX);
    }
    if (fields[f].trim()) anyField = true;
  });
  fields.pin = sanitizePin(fields.pin);

  let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 100) : null;
  let name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 120) : '';

  // Derive a display name from the address when it is missing, so nothing
  // is ever silently nameless.
  if (!name) name = (fields.name || fields.cityOrVillage || fields.house || '').trim();

  // Drop only when there is genuinely NOTHING to remember. Incomplete
  // addresses are deliberately kept — a name with no street, no PIN, or a
  // half-filled CSV row must survive a round trip.
  if (!name && !anyField) return null;
  if (!name) name = 'Unnamed contact';
  if (!id) id = makeContactId();

  return { id: id, name: name, fields: fields };
}

/**
 * Clean a whole book. Missing, malformed or older data degrades to an empty
 * book (or to whatever valid contacts could be salvaged).
 */
function sanitizeAddressBook(raw) {
  const out = emptyAddressBook();
  if (!raw || typeof raw !== 'object') return out;

  CONTACT_KINDS.forEach((kind) => {
    const list = Array.isArray(raw[kind]) ? raw[kind] : [];
    const seenIds = new Set();
    const seenNames = new Set();
    list.slice(0, CONTACT_MAX_PER_KIND).forEach((entry) => {
      const contact = sanitizeContact(entry);
      if (!contact) return;
      // Duplicate ids would break selection; give the copy its own id.
      if (seenIds.has(contact.id)) contact.id = makeContactId();
      seenIds.add(contact.id);
      // Duplicate names are legal, but the LIST needs to tell them apart,
      // so a repeat gets a numeric suffix instead of vanishing.
      let name = contact.name;
      let n = 1;
      while (seenNames.has(name.toLowerCase())) {
        n += 1;
        name = contact.name + ' (' + n + ')';
      }
      contact.name = name;
      seenNames.add(name.toLowerCase());
      out[kind].push(contact);
    });
  });

  return out;
}

/** Load the address book. Never throws — returns an empty book on any error. */
function loadAddressBook() {
  try {
    const raw = window.localStorage.getItem(ADDRESS_BOOK_KEY);
    if (!raw) return emptyAddressBook();
    return sanitizeAddressBook(JSON.parse(raw));
  } catch (err) {
    console.warn('Address book could not be loaded — starting empty.', err);
    return emptyAddressBook();
  }
}

/** Persist the address book. Returns true on success, false if blocked. */
function saveAddressBook(book) {
  try {
    window.localStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(sanitizeAddressBook(book)));
    return true;
  } catch (err) {
    console.warn('Address book could not be saved.', err);
    return false;
  }
}

/** Remove the address book only (print settings and offsets stay intact). */
function clearAddressBook() {
  try {
    window.localStorage.removeItem(ADDRESS_BOOK_KEY);
    return true;
  } catch (err) {
    console.warn('Address book could not be cleared.', err);
    return false;
  }
}

/** Find one contact by id. Returns null when it is not in the book. */
function findContact(book, kind, id) {
  if (!book || !Array.isArray(book[kind])) return null;
  return book[kind].find((c) => c && c.id === id) || null;
}

/**
 * Insert or update a contact.
 *   contact.id present + found  -> that contact is replaced in place
 *   contact.id absent/new       -> appended as a brand-new contact
 * The name is de-duplicated against the rest of the kind.
 * Returns the stored contact, or null when there was nothing to save.
 */
function upsertContact(book, kind, contact) {
  if (!book || CONTACT_KINDS.indexOf(kind) < 0) return null;
  const clean = sanitizeContact(contact);
  if (!clean) return null;
  if (!Array.isArray(book[kind])) book[kind] = [];

  const idx = book[kind].findIndex((c) => c && c.id === clean.id);
  const others = book[kind].filter((c, i) => i !== idx);
  clean.name = uniqueContactName(others, clean.name);

  if (idx >= 0) book[kind][idx] = clean;
  else book[kind].push(clean);
  return clean;
}

/** A name that is not already used (case-insensitively) by `others`. */
function uniqueContactName(others, name) {
  const base = String(name || 'Unnamed contact').trim() || 'Unnamed contact';
  const taken = new Set((others || [])
    .filter(Boolean)
    .map((c) => String(c.name || '').toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 1;
  let candidate;
  do {
    n += 1;
    candidate = base + ' (' + n + ')';
  } while (taken.has(candidate.toLowerCase()));
  return candidate;
}

/** Remove a contact by id. Returns true when something was removed. */
function deleteContact(book, kind, id) {
  if (!book || !Array.isArray(book[kind])) return false;
  const idx = book[kind].findIndex((c) => c && c.id === id);
  if (idx < 0) return false;
  book[kind].splice(idx, 1);
  return true;
}

/**
 * Find contacts matching `fields` (used to warn about near-duplicates on
 * save). Compares the PIN and the assembled name/city so an almost-identical
 * address is easy to spot. Returns matches, best first.
 */
function findSimilarContacts(book, kind, fields) {
  if (!book || !Array.isArray(book[kind])) return [];
  const f = fields || {};
  const pin = sanitizePin(f.pin);
  const name = String(f.name || '').trim().toLowerCase();
  const city = String(f.cityOrVillage || '').trim().toLowerCase();
  const score = (c) => {
    if (!c || !c.fields) return -1;
    let s = 0;
    if (pin && sanitizePin(c.fields.pin) === pin) s += 3;
    if (name && String(c.fields.name || '').trim().toLowerCase() === name) s += 2;
    if (city && String(c.fields.cityOrVillage || '').trim().toLowerCase() === city) s += 1;
    return s;
  };
  return book[kind]
    .map((c) => ({ contact: c, score: score(c) }))
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.contact);
}

/* ── CSV ────────────────────────────────────────────────────────────
   A dependency-free RFC 4180 reader/writer: quoted fields, commas and
   newlines inside quotes, "" as a literal quote, UTF-8 throughout and a
   UTF-8 BOM on export so Excel opens it correctly.                    */

/** The exact column order used by export and expected by import. */
const CONTACT_CSV_COLUMNS = [
  { key: 'name', header: 'Name' },
  { key: 'house', header: 'House' },
  { key: 'building', header: 'Building' },
  { key: 'street', header: 'Street' },
  { key: 'area', header: 'Area' },
  { key: 'cityOrVillage', header: 'City' },
  { key: 'district', header: 'District' },
  { key: 'state', header: 'State' },
  { key: 'pin', header: 'PIN' }
];

/**
 * Parse one CSV document into rows of cells.
 * Returns [] for empty input; throws a descriptive Error on unterminated
 * quotes so the UI can show a real message instead of importing garbage.
 */
function parseCsv(text) {
  let s = String(text == null ? '' : text);
  // Strip a UTF-8 BOM (Excel adds one).
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  if (!s.trim()) return [];

  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      cell += ch; i += 1; continue;
    }
    if (ch === '"') {
      // A quote only opens a quoted field at the start of a cell.
      if (cell === '') { inQuotes = true; i += 1; continue; }
      cell += ch; i += 1; continue;
    }
    if (ch === ',') { row.push(cell); cell = ''; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 1; continue; }
    cell += ch; i += 1;
  }
  if (inQuotes) throw new Error('The file ends inside a quoted field — please check it.');
  row.push(cell);
  rows.push(row);

  // A trailing newline produces one empty trailing row; drop it.
  if (rows.length > 1) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === '') rows.pop();
  }
  return rows;
}

/** Escape one cell for CSV output. */
function csvEscape(value) {
  const v = String(value == null ? '' : value);
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/**
 * Write rows (array of arrays) to a CSV document.
 * withBom adds the UTF-8 byte-order mark Excel needs for non-ASCII text.
 */
function toCsv(rows, withBom) {
  const body = (rows || [])
    .map((r) => (r || []).map(csvEscape).join(','))
    .join('\r\n');
  return (withBom ? '\uFEFF' : '') + body + '\r\n';
}

/**
 * Turn contacts into a CSV document (headers + one row per contact).
 * The first column is the display name ("Contact"); the nine address
 * fields follow in their printed order.
 */
function contactsToCsv(contacts, withBom) {
  const rows = [['Contact'].concat(CONTACT_CSV_COLUMNS.map((c) => c.header))];
  (contacts || []).filter(Boolean).forEach((c) => {
    rows.push([(c.name || '')].concat(
      CONTACT_CSV_COLUMNS.map((col) => (c.fields && c.fields[col.key]) || '')));
  });
  return toCsv(rows, withBom !== false);
}

/**
 * Read a CSV document into contacts.
 * The header row is matched by name so column order may vary; unknown
 * columns are ignored. A contact is never discarded for an incomplete or
 * invalid PIN — the PIN is simply cleaned and reported.
 * Returns { contacts, warnings } (throws only on a malformed document).
 */
function csvToContacts(text, existing) {
  const rows = parseCsv(text);
  const warnings = [];
  if (!rows.length) return { contacts: [], warnings: ['The file has no rows.'] };

  // Header aliases. `contact` is the display name; everything else maps an
  // address field. Column order may vary — matched by name.
  const ALIASES = {
    contact: ['contact', 'contact name', 'display name', 'displayname', 'label'],
    name: ['name', 'recipient', 'contact name (printed)', 'name (printed on the card)'],
    house: ['house', 'house / flat / door no.', 'house/flat', 'house / flat / door'],
    building: ['building'],
    street: ['street', 'street / road', 'road'],
    area: ['area', 'area / locality', 'locality'],
    cityOrVillage: ['city', 'city / town', 'village / city / town', 'cityortown', 'city / village / town'],
    district: ['district'],
    state: ['state'],
    pin: ['pin', 'pin code', 'pincode', 'pincode (6 digits)', 'postal code']
  };
  const header = rows[0].map((h) => String(h || '').trim().toLowerCase());
  const indexOfAny = (names) => {
    for (let n = 0; n < names.length; n++) {
      const idx = header.indexOf(names[n]);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const colIndexes = {};
  let matchedColumns = 0;
  CONTACT_CSV_COLUMNS.forEach((col) => {
    colIndexes[col.key] = indexOfAny(ALIASES[col.key] || [col.header.toLowerCase()]);
    if (colIndexes[col.key] >= 0) matchedColumns += 1;
  });
  const contactIdx = indexOfAny(ALIASES.contact);

  // A headerless file must not lose its first row: when NOT ONE known
  // column name is present, the first row is data in the documented order.
  let startRow = 1;
  if (matchedColumns === 0 && contactIdx < 0) {
    startRow = 0;
    CONTACT_CSV_COLUMNS.forEach((col, i) => { colIndexes[col.key] = i; });
    warnings.push('No header row found — columns read in the documented order.');
  }

  const nameIdx = colIndexes.name;
  if (nameIdx < 0 && contactIdx < 0 && startRow === 1) {
    warnings.push('No "Name" column was found — using the address for the display name.');
  }

  const taken = new Set((existing || []).map((c) => String((c && c.name) || '').toLowerCase()));
  const contacts = [];
  let unnamed = 0;

  rows.slice(startRow).forEach((row) => {
    if (!row || !row.join('').trim()) return; // blank line
    const fields = emptyContactFields();
    CONTACT_CSV_COLUMNS.forEach((col) => {
      const idx = colIndexes[col.key];
      if (idx >= 0 && row[idx] != null) fields[col.key] = String(row[idx]).slice(0, CONTACT_FIELD_MAX);
    });
    fields.pin = sanitizePin(fields.pin);
    // A file with a Contact (display) column but NO Name column still gets
    // the person's name on the printed address line. When a Name column does
    // exist its value is authoritative — a blank one stays blank, so an
    // exported address round-trips without gaining a printed name line.
    if (nameIdx < 0 && contactIdx >= 0 && row[contactIdx] != null && !fields.name.trim()) {
      const explicit = String(row[contactIdx]).trim();
      if (explicit) fields.name = explicit.slice(0, CONTACT_FIELD_MAX);
    }
    if (fields.pin && !isCompletePin(fields.pin)) {
      warnings.push('PIN "' + fields.pin + '" is not six digits — kept, but check it.');
    }
    // Keep ANY row that carries address content — an incomplete address
    // (no state, no PIN, name only…) is imported, never discarded.
    if (!CONTACT_FIELDS.some((f) => fields[f].trim())) return;

    // Display name: the Contact column when present, else the Name column,
    // else whatever the address itself says.
    let name = '';
    if (contactIdx >= 0) name = String(row[contactIdx] || '').trim();
    if (!name && nameIdx >= 0) name = String(row[nameIdx] || '').trim();
    if (!name) {
      unnamed += 1;
      name = (fields.name || fields.cityOrVillage || 'Imported ' + unnamed).trim();
    }
    // Never overwrite: a repeated name becomes "Name (2)".
    let finalName = name;
    let n = 1;
    while (taken.has(finalName.toLowerCase())) {
      n += 1;
      finalName = name + ' (' + n + ')';
    }
    taken.add(finalName.toLowerCase());
    if (n > 1) warnings.push('Duplicate name "' + name + '" imported as "' + finalName + '".');

    contacts.push({ id: makeContactId(), name: finalName, fields: fields });
  });

  if (!contacts.length) warnings.push('No usable rows were found in the file.');
  return { contacts: contacts, warnings: warnings };
}

/** Download a text file (used by the CSV export). */
function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: (mime || 'text/csv') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Allow Node.js to load this file for the automated tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ADDRESS_BOOK_KEY, ADDRESS_BOOK_VERSION, CONTACT_FIELDS, CONTACT_KINDS,
    CONTACT_CSV_COLUMNS, CONTACT_MAX_PER_KIND,
    emptyContactFields, emptyAddressBook, makeContactId, sanitizePin, isCompletePin,
    sanitizeContact, sanitizeAddressBook, loadAddressBook, saveAddressBook,
    clearAddressBook, findContact, upsertContact, deleteContact,
    uniqueContactName, findSimilarContacts,
    parseCsv, csvEscape, toCsv, contactsToCsv, csvToContacts
  };
}
