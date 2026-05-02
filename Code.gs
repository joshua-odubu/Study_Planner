/**
 * Study Planner - optional Google Apps Script Backend
 *
 * Note: Study_Planner.html currently syncs directly with Firebase.
 * Keep this file if you plan to wire Google Sheets sync back in later.
 *
 * SETUP:
 * 1. Open a new Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Paste this entire file, replacing any existing code
 * 4. Click Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Click Deploy, copy the Web App URL
 * 6. Use that URL only from frontend code that calls this Apps Script API
 *
 * Sheet tabs created automatically: Tasks | Events | Data
 */

function doGet(e) {
  const p = e.parameter;
  try {
    switch (p.action) {
      case 'load':       return load();
      case 'save_task':  return saveTask(p);
      case 'del_task':   return delTask(p.id);
      case 'save_event': return saveEvent(p);
      case 'del_event':  return delEvent(p.id);
      case 'save_blob':  return saveBlob(p.key, p.value);
      default:           return ok({message: 'Study Planner API ready'});
    }
  } catch(err) {
    return fail(err.toString());
  }
}

// ── LOAD ALL ──────────────────────────────────────────────
function load() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tSheet = getSheet(ss, 'Tasks');
  const eSheet = getSheet(ss, 'Events');
  const dSheet = getSheet(ss, 'Data');

  const tRows = tSheet.getLastRow() > 1
    ? tSheet.getRange(2, 1, tSheet.getLastRow() - 1, 9).getValues() : [];
  const eRows = eSheet.getLastRow() > 1
    ? eSheet.getRange(2, 1, eSheet.getLastRow() - 1, 7).getValues() : [];
  const dRows = dSheet.getLastRow() > 0
    ? dSheet.getRange(1, 1, dSheet.getLastRow(), 2).getValues() : [];

  const tasks = tRows.filter(r => r[0]).map(r => ({
    id: String(r[0]),
    title: String(r[1]),
    cat: String(r[2]),
    pri: String(r[3]),
    due: String(r[4] || ''),
    done: r[5] === '1' || r[5] === true || r[5] === 1,
    created: Number(r[6]) || 0,
    completedAt: r[7] ? Number(r[7]) : null,
    repeat: String(r[8] || 'none')
  }));

  const events = eRows.filter(r => r[0]).map(r => ({
    id: Number(r[0]),
    title: String(r[1]),
    date: String(r[2]),
    time: String(r[3] || ''),
    cat: String(r[4]),
    duration: Number(r[5]) || 60,
    repeat: String(r[6] || 'none')
  }));

  const blobs = {};
  dRows.forEach(r => {
    if (r[0]) {
      try { blobs[r[0]] = JSON.parse(r[1]); } catch(e) { blobs[r[0]] = null; }
    }
  });

  return ok({ tasks, events, pd: blobs['sp_pd'] || null, streak: blobs['sp_streak'] || null });
}

// ── TASKS ─────────────────────────────────────────────────
function saveTask(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheet(ss, 'Tasks');
  ensureHeader(sheet, ['id','title','cat','pri','due','done','created','completedAt','repeat']);
  upsertRow(sheet, p.id, [
    p.id, p.title, p.cat, p.pri, p.due || '',
    p.done === '1' ? '1' : '0',
    p.created || '', p.completedAt || '', p.repeat || 'none'
  ]);
  return ok({});
}

function delTask(id) {
  deleteRow(getSheet(SpreadsheetApp.getActiveSpreadsheet(), 'Tasks'), id);
  return ok({});
}

// ── EVENTS ────────────────────────────────────────────────
function saveEvent(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheet(ss, 'Events');
  ensureHeader(sheet, ['id','title','date','time','cat','duration','repeat']);
  upsertRow(sheet, p.id, [p.id, p.title, p.date, p.time || '', p.cat, p.duration || '60', p.repeat || 'none']);
  return ok({});
}

function delEvent(id) {
  deleteRow(getSheet(SpreadsheetApp.getActiveSpreadsheet(), 'Events'), id);
  return ok({});
}

// ── BLOBS (pd, streak) ────────────────────────────────────
function saveBlob(key, value) {
  const sheet = getSheet(SpreadsheetApp.getActiveSpreadsheet(), 'Data');
  const rows = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues() : [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === key) { sheet.getRange(i + 1, 2).setValue(value); return ok({}); }
  }
  sheet.appendRow([key, value]);
  return ok({});
}

// ── HELPERS ───────────────────────────────────────────────
function getSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureHeader(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsUpdate = headers.some((header, index) => String(current[index] || '') !== header);
  if (needsUpdate) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function upsertRow(sheet, id, rowData) {
  const last = sheet.getLastRow();
  if (last < 2) { sheet.appendRow(rowData); return; }
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sheet.getRange(i + 2, 1, 1, rowData.length).setValues([rowData]);
      return;
    }
  }
  sheet.appendRow(rowData);
}

function deleteRow(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) { sheet.deleteRow(i + 2); return; }
  }
}

function ok(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
