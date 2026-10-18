// Utsav Wedding Tracker - write-back API.
// Paste this into the Google Sheet: Extensions > Apps Script. Full steps are in README.md.

const TAB = { guests: "FINAL", works: "works to do", advances: "Advances" };
// Only these guest columns can be changed from the website.
const GUEST_FIELDS = [
  "Category Relative/Friend", "Expect. PAX", "Invitation", "Marriage function",
  "Rooms Required day-I", "Rooms Required Day-II", "Sweets", "Return Gift",
  "Invitation Sent on WA", "Shirt Size", "Sarees"
];

function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim(); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// Health check: open the web app URL in a browser and you should see {"ok":true,...}
function doGet() { return out({ ok: true, service: "utsav-tracker" }); }

// Run this ONCE from the editor (select setup > Run) to create the password property.
// Then change the value in Project Settings > Script properties to your own password.
function setup() {
  PropertiesService.getScriptProperties().setProperty("EDIT_PASSWORD", "CHANGE-ME");
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse(e.postData.contents);
    const pw = PropertiesService.getScriptProperties().getProperty("EDIT_PASSWORD");
    if (!pw || body.password !== pw) return out({ ok: false, error: "Wrong password" });
    if (body.action === "updateGuest") return out(updateGuest(body.name, body.fields));
    if (body.action === "addGuest") return out(addGuest(body.name, body.fields));
    if (body.action === "updateWork") return out(updateWork(body.task, body.status));
    if (body.action === "updateAdvance") return out(updateAdvance(body.purpose, body.paid, body.date));
    return out({ ok: false, error: "Unknown action" });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function headerMap(sh) {
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const m = {};
  h.forEach((t, i) => { const k = norm(t); if (k && !(k in m)) m[k] = i + 1; });
  return m;
}
function findRow(sh, col, value) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const vals = sh.getRange(2, col, n, 1).getValues();
  const target = norm(value);
  for (let i = 0; i < vals.length; i++) if (norm(vals[i][0]) === target) return i + 2;
  return 0;
}
function writeFields(sh, row, hm, fields) {
  Object.keys(fields || {}).forEach((h) => {
    if (GUEST_FIELDS.indexOf(h) === -1) return;
    const c = hm[norm(h)];
    if (c) sh.getRange(row, c).setValue(fields[h]);
  });
}

function updateGuest(name, fields) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.guests);
  const hm = headerMap(sh);
  const row = findRow(sh, hm[norm("Name")], name);
  if (!row) return { ok: false, error: "Guest not found: " + name };
  writeFields(sh, row, hm, fields);
  return { ok: true };
}

function addGuest(name, fields) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.guests);
  const hm = headerMap(sh);
  if (findRow(sh, hm[norm("Name")], name)) return { ok: false, error: "Already in the guest list" };
  // Add after the last guest name, so the totals row at the bottom is not overwritten.
  const names = sh.getRange(2, hm[norm("Name")], sh.getLastRow() - 1, 1).getValues();
  let last = 1;
  names.forEach((r, i) => { if (String(r[0]).trim() !== "") last = i + 2; });
  sh.insertRowAfter(last);
  const row = last + 1;
  sh.getRange(row, hm[norm("Name")]).setValue(name);
  writeFields(sh, row, hm, fields);
  return { ok: true };
}

function updateWork(task, status) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.works);
  const hm = headerMap(sh);
  const row = findRow(sh, hm[norm("Pending work")], task);
  if (!row) return { ok: false, error: "Task not found: " + task };
  sh.getRange(row, hm[norm("Final or pending")]).setValue(status);
  return { ok: true };
}

function updateAdvance(purpose, paid, date) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.advances);
  const hm = headerMap(sh);
  const row = findRow(sh, hm[norm("Purpose")], purpose);
  if (!row) return { ok: false, error: "Payment row not found: " + purpose };
  sh.getRange(row, hm[norm("Advance paid")]).setValue(paid);
  if (date && hm[norm("date of Advance Pymnt")]) sh.getRange(row, hm[norm("date of Advance Pymnt")]).setValue(date);
  return { ok: true };
}
