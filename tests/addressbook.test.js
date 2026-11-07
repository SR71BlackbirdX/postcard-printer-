/**
 * addressbook.test.js — saved contacts + CSV (Stage 7).
 *
 * Runs under Node against the browser code. A tiny localStorage is faked so
 * persistence, reload and corrupted-data paths are exercised for real.
 */

const path = require('path');
const root = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  if (ok) { passed += 1; console.log('  PASS  ' + label); }
  else {
    failed += 1;
    console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + String(detail) : ''));
  }
}

/* ── Fake localStorage (persists across "reloads" in one process) ──── */
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    get length() { return map.size; },
    _map: map
  };
}

const storage = makeStorage();
global.window = { localStorage: storage, confirm: () => true };

const book = require(path.join(root, 'js/addressbook.js'));
const settings = require(path.join(root, 'js/settings.js'));
const address = require(path.join(root, 'js/address.js'));

const K = book.ADDRESS_BOOK_KEY;
const emptyFields = () => book.emptyContactFields();

/** Convenience: a contact with a display name + the address fields. */
function contact(name, fields) {
  return { name: name, fields: Object.assign(emptyFields(), fields || {}) };
}

console.log('\n── Address book: storage & shape ──');

check('module exposes the storage key', typeof K === 'string' && K.indexOf('addressbook') >= 0, K);
check('empty book has both kinds and a version',
  book.emptyAddressBook().recipients.length === 0 &&
  book.emptyAddressBook().senders.length === 0 &&
  book.emptyAddressBook().version === book.ADDRESS_BOOK_VERSION);
check('load on empty storage returns an empty book (no throw)',
  book.loadAddressBook().recipients.length === 0);

console.log('\n── Saving, loading, editing, deleting ──');

{
  const b = book.emptyAddressBook();
  const saved = book.upsertContact(b, 'recipients',
    contact('Sunita', { name: 'Sunita Devi', house: '7 Park Street', cityOrVillage: 'Nagpur', pin: '440001' }));
  check('upsert returns the stored contact', !!saved && typeof saved.id === 'string' && saved.id.length > 0, saved && saved.id);
  check('contact added to the book', b.recipients.length === 1);
  check('found by id', book.findContact(b, 'recipients', saved.id).name === 'Sunita');
  check('unknown id returns null', book.findContact(b, 'recipients', 'nope') === null);

  // Edit in place: same id, new content.
  const edited = book.upsertContact(b, 'recipients',
    Object.assign({}, saved, { name: 'Sunita (edited)', fields: Object.assign(emptyFields(), { name: 'Sunita R', cityOrVillage: 'Pune' }) }));
  check('edit keeps the same id', edited.id === saved.id);
  check('edit replaces in place (no second entry)', b.recipients.length === 1);
  check('edited content stored', book.findContact(b, 'recipients', saved.id).fields.cityOrVillage === 'Pune');

  check('delete removes it', book.deleteContact(b, 'recipients', saved.id) && b.recipients.length === 0);
  check('delete of unknown id is a no-op', book.deleteContact(b, 'recipients', saved.id) === false);
}

console.log('\n── Duplicate names ──');
{
  const b = book.emptyAddressBook();
  const a = book.upsertContact(b, 'recipients', contact('Ramesh', { cityOrVillage: 'Nagpur' }));
  const c = book.upsertContact(b, 'recipients', contact('Ramesh', { cityOrVillage: 'Pune' }));
  check('two contacts may share a display name', b.recipients.length === 2);
  check('the duplicate is still stored (never dropped)', b.recipients.some((x) => x.id === c.id));
  check('ids stay unique', a.id !== c.id);

  // Editing a contact's own name must not suffix it (the collision is only
  // against OTHER contacts, never against itself).
  const b2 = book.emptyAddressBook();
  const solo = book.upsertContact(b2, 'recipients', contact('Solo', { cityOrVillage: 'Pune' }));
  const updated = book.upsertContact(b2, 'recipients', Object.assign({}, solo, { name: 'Solo' }));
  check('updating a contact does not rename it', updated.name === 'Solo', updated.name);
  check('the update did not add a second entry', b2.recipients.length === 1);

  // Sanitizing data that already contains duplicate names disambiguates.
  const sanit = book.sanitizeAddressBook({ recipients: [contact('Rama'), contact('Rama')], senders: [] });
  check('duplicate names on load are disambiguated',
    sanit.recipients.length === 2 && sanit.recipients[1].name !== sanit.recipients[0].name,
    sanit.recipients.map((r) => r.name).join('|'));

  const unique = book.uniqueContactName([{ name: 'Ana' }], 'Ana');
  check('uniqueContactName appends a number', unique === 'Ana (2)', unique);
}

console.log('\n── Multiple senders + multiple recipients ──');
{
  const b = book.emptyAddressBook();
  ['Home', 'Office', "Parents' place"].forEach((n) =>
    book.upsertContact(b, 'senders', contact(n, { name: n, cityOrVillage: 'Hyderabad' })));
  book.upsertContact(b, 'recipients', contact('Friend', { name: 'Friend' }));
  check('three senders saved', b.senders.length === 3);
  check('senders and recipients are independent', b.recipients.length === 1);
  check('each sender has its own id',
    new Set(b.senders.map((s) => s.id)).size === 3);
  check('apostrophe name survives', b.senders[2].name === "Parents' place", b.senders[2].name);
}

console.log('\n── Multiline addresses, optional fields, PIN ──');
{
  const multi = book.upsertContact(book.emptyAddressBook(), 'recipients',
    contact('Meera', { name: 'Meera', house: 'Flat 4B, Sunrise Apartments\nNear Water Tank\nKondapur Main Road', cityOrVillage: 'Hyderabad', state: 'Telangana' }));
  check('multiline field stored intact', multi.fields.house.split('\n').length === 3, JSON.stringify(multi.fields.house));
  check('missing optional fields stay empty strings',
    multi.fields.building === '' && multi.fields.district === '' && multi.fields.area === '');

  // The printed lines come from the same assembler the card uses, so a
  // multi-line field reproduces its lines one for one.
  const lines = address.assembleAddress(multi.fields, false);
  check('multiline field prints as its own lines (in order)',
    lines.slice(1, 4).join('|') === 'Flat 4B, Sunrise Apartments|Near Water Tank|Kondapur Main Road',
    lines.join('|'));
  check('the name prints first and the tail last',
    lines[0] === 'Meera' && lines[lines.length - 1] === 'Telangana', lines.join('|'));
  check('recipient PIN is not printed as an address line',
    !lines.some((l) => /^\d{6}$/.test(l)));

  check('isCompletePin accepts six digits', book.isCompletePin('440001') === true);
  check('isCompletePin rejects five digits', book.isCompletePin('44001') === false);
  check('isCompletePin rejects letters', book.isCompletePin('44000a') === false);
  check('sanitizePin strips junk and caps at 6',
    book.sanitizePin(' 44-0001 ') === '440001', book.sanitizePin(' 44-0001 '));
  check('sanitizePin on null is empty', book.sanitizePin(null) === '');

  // A contact with an incomplete PIN is kept, not discarded.
  const badPin = book.upsertContact(book.emptyAddressBook(), 'recipients',
    contact('Partial', { name: 'Partial', pin: '1234' }));
  check('incomplete PIN contact is kept', badPin !== null && badPin.fields.pin === '1234', badPin && badPin.fields.pin);
  check('incomplete PIN reports false', book.isCompletePin(badPin.fields.pin) === false);
}

console.log('\n── Persistence after reload ──');
{
  storage.clear();
  const b = book.emptyAddressBook();
  book.upsertContact(b, 'recipients', contact('Persisted', { name: 'Persisted', cityOrVillage: 'Goa', pin: '403001' }));
  book.upsertContact(b, 'senders', contact('Sender', { name: 'Sender' }));
  check('saveAddressBook returns true', book.saveAddressBook(b) === true);

  const reloaded = book.loadAddressBook();
  check('recipients survive a reload', reloaded.recipients.length === 1 && reloaded.recipients[0].name === 'Persisted');
  check('senders survive a reload', reloaded.senders.length === 1 && reloaded.senders[0].name === 'Sender');
  check('reloaded PIN is intact', reloaded.recipients[0].fields.pin === '403001');
  check('reloaded id is stable across reloads',
    reloaded.recipients[0].id === b.recipients[0].id);

  // The address book lives under its OWN key, so print settings are safe.
  const SETTINGS_K = 'indian-postcard-printer.settings.v1';
  const st = settings.sanitizeSettings({
    senderFontPt: 15,
    settingsVersion: settings.SETTINGS_VERSION
  });
  storage.setItem(SETTINGS_K, JSON.stringify(st));
  check('address book key differs from the settings key', K !== SETTINGS_K, K);
  const before = storage.getItem(SETTINGS_K);
  check('clearing the address book leaves print settings untouched',
    book.clearAddressBook() === true &&
    book.loadAddressBook().recipients.length === 0 &&
    storage.getItem(SETTINGS_K) === before &&
    settings.sanitizeSettings(JSON.parse(storage.getItem(SETTINGS_K))).senderFontPt === 15);
}

console.log('\n── Corrupted / older stored data ──');
{
  const cases = [
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'not json at all'],
    ['an array', []],
    ['a string that parses but is wrong-shaped', '"just a string"'],
    ['an object with the wrong value types', { recipients: 'nope', senders: 7 }],
    ['recipients containing junk entries', { recipients: [null, 3, 'x', {}, { name: 'OnlyName' }] }],
    ['a contact with a nested fields object', { recipients: [{ id: 'a', fields: { name: 'Nested', cityOrVillage: 'Pune' } }] }],
    ['a contact with numeric fields', { recipients: [{ id: 'b', name: 'Num', fields: { name: 7, house: 12 } }] }]
  ];
  cases.forEach(([label, raw]) => {
    let out = null;
    let threw = false;
    try { out = book.sanitizeAddressBook(raw); } catch (e) { threw = true; }
    check('sanitizes ' + label + ' without throwing',
      !threw && out && Array.isArray(out.recipients) && Array.isArray(out.senders));
  });

  // Truly malformed JSON in storage must degrade to an empty book.
  storage.setItem(K, '{{{ not json');
  const fromGarbage = book.loadAddressBook();
  check('malformed JSON in storage -> empty book, no throw',
    fromGarbage.recipients.length === 0 && fromGarbage.senders.length === 0);

  // Salvage what is valid.
  const salvaged = book.sanitizeAddressBook({ recipients: [null, { id: 'ok', name: 'Good', fields: { name: 'Good' } }] });
  check('valid contacts are salvaged from junk', salvaged.recipients.length === 1 && salvaged.recipients[0].name === 'Good');

  // Duplicate ids in stored data are repaired.
  const dupeIds = book.sanitizeAddressBook({ recipients: [contact('A'), contact('A')], senders: [] });
  check('duplicate stored ids are repaired',
    dupeIds.recipients.length === 2 && dupeIds.recipients[0].id !== dupeIds.recipients[1].id);

  // A contact with no id gets one; a contact with no name gets a name.
  const noId = book.sanitizeAddressBook({ recipients: [{ name: '', fields: { cityOrVillage: 'Pune' } }] });
  check('missing id is generated', typeof noId.recipients[0].id === 'string' && noId.recipients[0].id.length > 0);
  check('missing name is derived from the address', noId.recipients[0].name === 'Pune', noId.recipients[0].name);

  // Incomplete contacts are KEPT — the spec is explicit that a contact with
  // an incomplete address must never be discarded.
  const nameOnly = book.sanitizeAddressBook({ recipients: [{ id: 'x', name: 'OnlyName' }] });
  check('a name-only contact is kept, not discarded',
    nameOnly.recipients.length === 1 && nameOnly.recipients[0].name === 'OnlyName',
    nameOnly.recipients.length);

  // …but a record carrying nothing at all is still junk and is dropped.
  const nothing = book.sanitizeAddressBook({ recipients: [{ id: 'y' }, {}, { name: '', fields: {} }] });
  check('a record with no name and no address is dropped', nothing.recipients.length === 0,
    nothing.recipients.length);

  storage.clear();
}

console.log('\n── CSV: parse ──');
{
  const rows = book.parseCsv('Name,City\nRavi,Hderabad\n');
  check('basic parse', rows.length === 2 && rows[1][0] === 'Ravi');

  const quoted = book.parseCsv('Name,Address\n"Ravi, Kumar","12 MG Road, Hyderabad"\n');
  check('commas inside quoted fields', quoted[1][1] === '12 MG Road, Hyderabad', quoted[1][1]);
  check('comma in a name survives', quoted[1][0] === 'Ravi, Kumar', quoted[1][0]);

  const esc = book.parseCsv('Name,Note\n"He said ""hi""","line1\nline2"\n');
  check('escaped double quotes', esc[1][0] === 'He said "hi"', esc[1][0]);
  check('newline inside quotes', esc[1][1] === 'line1\nline2', JSON.stringify(esc[1][1]));

  const bom = book.parseCsv('\uFEFFName,City\nA,B\n');
  check('UTF-8 BOM is stripped', bom[0][0] === 'Name', JSON.stringify(bom[0][0]));

  const uni = book.parseCsv('Name,City\nरवि कुमार,भारत\n');
  check('Unicode content', uni[1][0] === 'रवि कुमार', uni[1][0]);

  check('empty input parses to []', book.parseCsv('').length === 0 && book.parseCsv('   ').length === 0);

  let threw = false;
  try { book.parseCsv('Name,"unterminated'); } catch (e) { threw = true; }
  check('unterminated quote throws a readable error', threw);

  // Excel's CRLF line endings.
  const crlf = book.parseCsv('A,B\r\n1,2\r\n3,4\r\n');
  check('CRLF endings parse', crlf.length === 3 && crlf[2][1] === '4', JSON.stringify(crlf));

  // A trailing newline must not create a phantom row.
  const trail = book.parseCsv('A,B\n1,2\n');
  check('trailing newline adds no empty row', trail.length === 2, trail.length);
}

console.log('\n── CSV: round trip ──');
{
  const original = [
    contact('Plain', { name: 'Plain', house: '1 MG Road', cityOrVillage: 'Pune', pin: '411001' }),
    contact('Comma', { name: 'Comma, friend', house: '10 "Big" Lane', cityOrVillage: 'Delhi, New Delhi', state: 'Delhi' }),
    contact('Multiline', { house: 'Flat 4B\nNear Water Tank\nKondapur', cityOrVillage: 'Hyderabad' }),
    contact('Unicode', { name: 'रवि कुमार', cityOrVillage: 'भारत', state: 'Telangana' })
  ];
  const csv = book.contactsToCsv(original, true);
  check('export starts with a UTF-8 BOM for Excel', csv.charCodeAt(0) === 0xFEFF);
  check('export uses CRLF row endings', csv.indexOf('\r\n') > 0);

  const parsed = book.csvToContacts(csv, []);
  check('round trip keeps every row', parsed.contacts.length === original.length,
    parsed.contacts.length + ' vs ' + original.length);

  const back = parsed.contacts;
  // The Contact column round-trips the display name; the Name column
  // round-trips what actually prints on the card. Keep the two apart.
  check('round trip: display name', back[1].name === 'Comma', back[1].name);
  check('round trip: comma in a printed name',
    back[1].fields.name === 'Comma, friend', back[1].fields.name);
  check('round trip: quotes in a house', back[1].fields.house === '10 "Big" Lane', back[1].fields.house);
  check('round trip: comma in a city', back[1].fields.cityOrVillage === 'Delhi, New Delhi', back[1].fields.cityOrVillage);
  check('round trip: multiline field', back[2].fields.house.split('\n').length === 3, JSON.stringify(back[2].fields.house));
  check('round trip: Unicode printed name', back[3].fields.name === 'रवि कुमार', back[3].fields.name);
  check('round trip: Unicode city', back[3].fields.cityOrVillage === 'भारत', back[3].fields.cityOrVillage);
  check('round trip: PIN survives', back[0].fields.pin === '411001', back[0].fields.pin);

  // A contact with no printed name must NOT gain one on a round trip.
  check('round trip: blank Name column stays blank',
    back[2].fields.name === '', JSON.stringify(back[2].fields.name));

  // The printed address is byte-identical after a round trip.
  const before = address.assembleAddress(original[0].fields, false).join('\n');
  const after = address.assembleAddress(back[0].fields, false).join('\n');
  check('printed lines identical after round trip', before === after, after);

  // Header order may vary — map by name.
  const reordered = 'State,City,Name,PIN\nTelangana,Hyderabad,Asha,500002\n';
  const r = book.csvToContacts(reordered, []);
  check('columns map by header, not position',
    r.contacts.length === 1 && r.contacts[0].name === 'Asha' &&
    r.contacts[0].fields.cityOrVillage === 'Hyderabad' &&
    r.contacts[0].fields.state === 'Telangana' &&
    r.contacts[0].fields.pin === '500002',
    JSON.stringify(r.contacts[0] && r.contacts[0].fields));

  // Unknown columns are ignored rather than breaking the import.
  const extra = book.csvToContacts('Name,City,Phone\nAsha,Hyderabad,9999999999\n', []);
  check('unknown columns ignored', extra.contacts.length === 1 && extra.contacts[0].fields.cityOrVillage === 'Hyderabad');

  // Blank rows are skipped.
  const blanks = book.csvToContacts('Name,City\n\nAsha,Hyderabad\n\n', []);
  check('blank rows skipped', blanks.contacts.length === 1, blanks.contacts.length);
}

console.log('\n── CSV: never silently overwrite + PIN validation ──');
{
  const existing = [contact('Asha', { name: 'Asha', cityOrVillage: 'Hyderabad', pin: '500001' })];
  const dup = 'Name,City,PIN\nAsha,Hyderabad,500001\nAsha,Mumbai,400001\n';
  const r = book.csvToContacts(dup, existing);
  check('duplicate name is not overwritten', r.contacts.length === 2);
  check('duplicate imported under a new name',
    r.contacts[0].name === 'Asha (2)', r.contacts[0].name);
  check('the existing contact was not touched', existing[0].name === 'Asha' && existing[0].fields.cityOrVillage === 'Hyderabad');
  check('a duplicate warning is reported', r.warnings.some((w) => /Duplicate name/.test(w)), r.warnings.join(' | '));

  // A bad PIN keeps the contact but flags it.
  const bad = book.csvToContacts('Name,City,PIN\nRavi,Pune,123\n', []);
  check('contact with a short PIN is kept', bad.contacts.length === 1 && bad.contacts[0].fields.pin === '123');
  check('short PIN is reported, not dropped', bad.warnings.some((w) => /not six digits/.test(w)), bad.warnings.join(' | '));

  // An empty PIN keeps the contact and reports nothing scary.
  const noPin = book.csvToContacts('Name,City,PIN\nRavi,Pune,\n', []);
  check('missing PIN keeps the contact', noPin.contacts.length === 1 && noPin.contacts[0].fields.pin === '');
  check('missing PIN is not reported as invalid', !noPin.warnings.some((w) => /not six digits/.test(w)));

  // No Name column: still importable, name derived from the address.
  const noName = book.csvToContacts('City,State\nPune,Maharashtra\n', []);
  check('missing Name column still imports', noName.contacts.length === 1);
  check('name derived from the city', noName.contacts[0].fields.cityOrVillage === 'Pune');
  check('a warning explains the missing column',
    noName.warnings.some((w) => /Name/.test(w)), noName.warnings.join(' | '));

  // A file with no usable rows.
  const junk = book.csvToContacts('Name,City\n,\n', []);
  check('no usable rows -> no contacts', junk.contacts.length === 0);
  check('and a warning says so', junk.warnings.some((w) => /No usable rows/.test(w)));

  // Near-duplicate detection used by the confirm screen.
  const b = book.emptyAddressBook();
  book.upsertContact(b, 'recipients', contact('Asha', { name: 'Asha', pin: '500001', cityOrVillage: 'Hyderabad' }));
  const sim = book.findSimilarContacts(b, 'recipients', { name: 'Asha', pin: '500001' });
  check('same PIN + name is reported as similar', sim.length === 1);
  check('an unrelated address is not similar',
    book.findSimilarContacts(b, 'recipients', { name: 'Zed', pin: '600001' }).length === 0);
}

console.log('\n── Settings still ignore address-book data ──');
{
  const s = settings.sanitizeSettings({
    addressBook: 'garbage',
    recipients: [{ name: 'x' }],
    senderFontPt: 11,
    settingsVersion: settings.SETTINGS_VERSION
  });
  check('print settings are unaffected by address-book keys',
    s.addressBook === undefined && s.senderFontPt === 11);
  check('settings keep their own schema version', s.settingsVersion === settings.SETTINGS_VERSION);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
