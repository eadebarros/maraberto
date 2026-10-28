// Google Apps Script bound to the destination spreadsheet.
// Extensions → Apps Script → paste this → Deploy → New deployment → Web app
// (Execute as: Me, Who has access: Anyone). Put the /exec URL in VITE_SHEETS_URL.
const SHEET_NAME = 'Inscrições';
const HEADERS = ['Data', 'Nome', 'E-mail', 'WhatsApp', 'Aceitou termos', 'Origem'];

function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.website) return respond({ ok: true }); // honeypot filled → bot

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    sheet.appendRow([
      new Date(),
      clean(p.nome, 120),
      clean(p.email, 160),
      clean(p.whatsapp, 20),
      p.termos === 'sim' ? 'Sim' : 'Não',
      clean(p.origem, 300),
    ]);
    return respond({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// Keeps values as plain text and blocks formula injection (=, +, -, @).
function clean(value, max) {
  const s = String(value || '').trim().slice(0, max);
  return /^[=+\-@]/.test(s) || /^\(/.test(s) ? "'" + s : s;
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
