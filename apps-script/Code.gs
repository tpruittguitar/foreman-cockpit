/**
 * PIPELINE EXPLORER STATE WRITER (Google Apps Script)
 * Runs as Tim. Reads the fixed canonical master and applies Tim's rulings to it in place,
 * following FORGE_AMENDMENT_58 (Authorized State Writer contract):
 *   identify the artifact, read current state, verify identity (exact PRIMARY_ID, fail closed on
 *   0 or >1 matches), perform only the requested mutation, preserve canonical ID and unrelated
 *   fields, recalculate COUNTS, read the result back, emit a STATE_CHANGE_RECEIPT.
 * Also stores the Explorer's own state (seen rows, local rulings) in a small JSON file next to the
 * master so phone and laptop agree. Nothing here runs on a schedule; it only answers requests.
 *
 * DEPLOY (one time, ~5 minutes): see apps-script/README.md in the repo.
 */
var MASTER_ID = '19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI'; // fixed per Tim's 2026-09-29 ruling (cutover REV2)
var PASSPHRASE = 'CHANGE-ME';                                   // set your own; the page asks for it once
var STATE_FILE_NAME = 'PIPELINE_EXPLORER_STATE.json';
var RECEIPTS_DOC_NAME = 'PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS';

/* ---------------- HTTP ---------------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!auth_(p.key)) return out_({ ok: false, error: 'bad key' });
  var a = p.action || 'master';
  try {
    if (a === 'ping') return out_({ ok: true, now: new Date().toISOString(), master: MASTER_ID });
    if (a === 'master') return out_(readMaster_());
    if (a === 'state') return out_({ ok: true, state: readState_() });
    if (a === 'receipts') return out_({ ok: true, text: readReceipts_() });
    return out_({ ok: false, error: 'unknown action ' + a });
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
}
function doPost(e) {
  var req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return out_({ ok: false, error: 'bad JSON' }); }
  if (!auth_(req.key)) return out_({ ok: false, error: 'bad key' });
  try {
    if (req.action === 'state') { writeState_(req.state || {}); return out_({ ok: true }); }
    if (req.action === 'ruling') return out_(applyRulingToMaster_(req.ruling || {}));
    return out_({ ok: false, error: 'unknown action ' + req.action });
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
}
function auth_(k) { return PASSPHRASE && k === PASSPHRASE; }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/* ---------------- master read ---------------- */
function readMaster_() {
  var file = DriveApp.getFileById(MASTER_ID);
  var text = DocumentApp.openById(MASTER_ID).getBody().getText();
  return { ok: true, id: MASTER_ID, title: file.getName(), modifiedTime: file.getLastUpdated().toISOString(), fetchedAt: new Date().toISOString(), bytes: text.length, text: text };
}

/* ---------------- master write (Amendment 58 contract) ---------------- */
function applyRulingToMaster_(ruling) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var file = DriveApp.getFileById(MASTER_ID);
    var modBefore = file.getLastUpdated().toISOString();
    var doc = DocumentApp.openById(MASTER_ID);
    var body = doc.getBody();
    var paras = body.getParagraphs();
    var pid = String(ruling.primaryId || '').trim();
    if (!pid) return fail_('no PRIMARY_ID in request', ruling);
    var hits = [];
    for (var i = 0; i < paras.length; i++) {
      var t = paras[i].getText();
      if (/^\d+ \| /.test(t)) { var cells = t.split(' | '); if (cells.length > 2 && cells[1].trim() === pid) hits.push(i); }
    }
    if (hits.length !== 1) return fail_('identity not unique: ' + hits.length + ' rows match ' + pid + ' (fail closed)', ruling);
    var before = paras[hits[0]].getText();
    var res = mutateRow(before, ruling);
    if (!res.ok) return fail_(res.error, ruling);
    // concurrency: re-read modifiedTime immediately before committing (REV2 protocol)
    var modCheck = DriveApp.getFileById(MASTER_ID).getLastUpdated().toISOString();
    if (modCheck !== modBefore) return fail_('master changed during request (' + modBefore + ' -> ' + modCheck + '); retry', ruling);
    paras[hits[0]].setText(res.after);
    // recount from row BUCKET values
    var lines = [];
    for (var j = 0; j < paras.length; j++) lines.push(paras[j].getText());
    var newCounts = recomputeCountsLine(lines);
    for (var k = 0; k < paras.length; k++) { if (/^COUNTS:/.test(paras[k].getText())) { paras[k].setText(newCounts); break; } }
    doc.saveAndClose();
    // read back
    var doc2 = DocumentApp.openById(MASTER_ID);
    var p2 = doc2.getBody().getParagraphs();
    var readback = null, countsBack = null;
    for (var m = 0; m < p2.length; m++) { var tt = p2[m].getText(); if (tt === res.after) readback = tt; if (/^COUNTS:/.test(tt)) countsBack = tt; }
    var verified = readback === res.after && countsBack === newCounts;
    var receipt = {
      RECEIPT: 'STATE_CHANGE_RECEIPT', REQUEST_ID: ruling.requestId || '', EXECUTED_BY: 'Pipeline Explorer Apps Script (runs as Tim)',
      TARGET_CANONICAL_ID: pid, COMPANY: res.company, TITLE: res.title, REQ_ID: res.req,
      BEFORE_APPLICATION_STATE: res.beforeState, AFTER_APPLICATION_STATE: res.afterState,
      BEFORE_POSTING_STATE: 'n/a', AFTER_POSTING_STATE: 'n/a',
      CANONICAL_ID_PRESERVED: 'YES', HISTORY_PRESERVED: 'YES', COUNTS_UPDATED: 'YES', READBACK_VERIFIED: verified ? 'YES' : 'NO',
      TARGET_FILE_ID: MASTER_ID, COMPLETION_STATUS: verified ? 'COMPLETE' : 'FAILED', MASTER_MODIFIED_BEFORE: modBefore,
      EXECUTED_AT: new Date().toISOString(), CHANGES: res.changes
    };
    appendReceipt_(receipt);
    return { ok: verified, receipt: receipt, before: before, after: res.after, counts: newCounts };
  } finally { lock.releaseLock(); }
}
function fail_(msg, ruling) {
  var receipt = { RECEIPT: 'STATE_CHANGE_RECEIPT', REQUEST_ID: ruling.requestId || '', EXECUTED_BY: 'Pipeline Explorer Apps Script', TARGET_CANONICAL_ID: ruling.primaryId || '', COMPLETION_STATUS: 'STATE_CHANGE_NEEDS_RESOLUTION', REASON: msg, EXECUTED_AT: new Date().toISOString() };
  try { appendReceipt_(receipt); } catch (e) {}
  return { ok: false, error: msg, receipt: receipt };
}

/* ---------------- pure functions (unit-tested in tests/writer.test.js) ---------------- */
var FIXED_N = 9;
function today_(ts) { return String(ts || new Date().toISOString()).slice(0, 10); }
function parsePayload(rest) {
  var segs = rest.split('; '), payload = {}, order = [], lead = [], last = null;
  for (var i = 0; i < segs.length; i++) {
    var m = segs[i].match(/^([A-Z][A-Z0-9_]*)=([\s\S]*)$/);
    if (m) { last = m[1]; if (order.indexOf(last) < 0) order.push(last); payload[last] = (payload[last] !== undefined ? payload[last] + '; ' : '') + m[2]; }
    else if (last) payload[last] += '; ' + segs[i];
    else lead.push(segs[i]);
  }
  return { lead: lead.join('; ').replace(/;\s*$/, ''), payload: payload, order: order };
}
function buildPayload(lead, payload, order) {
  var parts = lead ? [lead] : [];
  for (var i = 0; i < order.length; i++) parts.push(order[i] + '=' + payload[order[i]]);
  return parts.join('; ');
}
/** Apply one Tim ruling to one master row line. Returns {ok, after, changes, beforeState, afterState, company, title, req} */
function mutateRow(line, ruling) {
  var cells = line.split(' | ');
  if (cells.length < FIXED_N + 1) return { ok: false, error: 'row has fewer than 10 cells' };
  var fixed = cells.slice(0, FIXED_N), rest = cells.slice(FIXED_N).join(' | ');
  var pp = parsePayload(rest), P = pp.payload, O = pp.order;
  function set(k, v) { if (O.indexOf(k) < 0) O.push(k); P[k] = String(v).replace(/[\r\n]+/g, ' ').replace(/; /g, ', '); }
  var ts = ruling.ts || new Date().toISOString(), d = today_(ts), kind = String(ruling.kind || '').toUpperCase(), val = String(ruling.value || '').toUpperCase();
  var note = String(ruling.note || '').replace(/[\r\n]+/g, ' ').trim();
  var beforeState = fixed[4] + ' / ' + fixed[5];
  var changes = [];
  var tags = fixed[6] === '-' ? [] : fixed[6].split(';').map(function (s) { return s.trim(); }).filter(Boolean);
  if (kind === 'NOTE') {
    if (!note) return { ok: false, error: 'empty note' };
    set('TIM_NOTE', note + ' [Tim ' + d + ']'); changes.push('TIM_NOTE');
  } else if (kind === 'APPLY_NOW' && val === 'YES') {
    if (fixed[4] === 'APPLIED' || fixed[4] === 'REJECTED_BY_EMPLOYER') return { ok: false, error: 'cannot mark pursue on ' + fixed[4] + ' (protected applicant state)' };
    fixed[4] = 'READY_TO_PURSUE'; fixed[5] = 'RESOLVED/PURSUE_CANDIDATE';
    set('TIM_RULING', 'PURSUE'); tags.push('TIM_OVERRIDE_PURSUE_' + d); changes.push('BUCKET', 'DISPOSITION', 'TIM_RULING');
    if (P.DECLINE_REASON_CODE) { set('DECLINE_REASON_CODE_PRIOR', P.DECLINE_REASON_CODE); delete P.DECLINE_REASON_CODE; O.splice(O.indexOf('DECLINE_REASON_CODE'), 1); }
    if (note) { set('TIM_NOTE', note + ' [Tim ' + d + ']'); changes.push('TIM_NOTE'); }
  } else if ((kind === 'APPLY_NOW' && val === 'NO') || kind === 'DECLINE') {
    if (fixed[4] === 'APPLIED' || fixed[4] === 'REJECTED_BY_EMPLOYER') return { ok: false, error: 'cannot decline a row in ' + fixed[4] + ' (protected applicant state)' };
    fixed[4] = 'DECLINED_BY_TIM'; fixed[5] = 'RESOLVED/DECLINED_BY_TIM';
    set('TIM_RULING', 'DO_NOT_PURSUE');
    set('DECLINE_REASON_CODE', ruling.code || 'TIM_EXPLICIT_DECLINE');
    set('DECLINE_REASON_TEXT', note || 'Tim explicit decline via Pipeline Explorer');
    set('REOPEN_TRIGGER', 'Tim explicitly overrides.');
    set('TIM_DISPOSITION', 'TIM_PASS_' + d + '_EXPLORER');
    tags.push('TIM_DECLINE_' + d); changes.push('BUCKET', 'DISPOSITION', 'DECLINE_REASON_CODE', 'DECLINE_REASON_TEXT', 'REOPEN_TRIGGER', 'TIM_DISPOSITION');
  } else if (kind === 'APPLIED') {
    fixed[4] = 'APPLIED'; fixed[5] = 'RESOLVED/APPLIED_CONFIRMED';
    set('APP_DATE', d); set('APP_STATUS_EVIDENCE', 'Tim direct statement via Pipeline Explorer ' + d + (note ? ': ' + note : ''));
    set('ANTI_RESURRECTION', 'YES'); set('TIM_RULING', 'APPLIED'); tags.push('TIM_APPLIED_' + d);
    changes.push('BUCKET', 'DISPOSITION', 'APP_DATE', 'APP_STATUS_EVIDENCE', 'ANTI_RESURRECTION');
  } else return { ok: false, error: 'unknown ruling kind ' + kind + ' ' + val };
  set('STATE_SOURCE', 'TIM_EXPLORER:' + (ruling.requestId || 'no-id'));
  set('STATE_UPDATED_AT', ts);
  fixed[6] = tags.length ? tags.filter(function (t, i) { return tags.indexOf(t) === i; }).join('; ') : '-';
  var after = fixed.join(' | ') + ' | ' + buildPayload(pp.lead, P, O);
  return { ok: true, after: after, changes: changes, beforeState: beforeState, afterState: fixed[4] + ' / ' + fixed[5], company: fixed[2], title: fixed[3], req: fixed[7] };
}
/** Recompute the COUNTS: line from row BUCKET cells, preserving the existing key order. */
function recomputeCountsLine(lines) {
  var counts = {}, total = 0, unaccounted = 0, existing = null;
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i];
    if (/^COUNTS:/.test(t)) existing = t;
    else if (/^\d+ \| /.test(t)) { var c = t.split(' | '); var b = (c[4] || '').trim(); if (c.length >= FIXED_N + 1 && b) { counts[b] = (counts[b] || 0) + 1; total++; } else unaccounted++; }
  }
  var order = [];
  if (existing) existing.replace(/^COUNTS:\s*/, '').split(/\s+/).forEach(function (tok) { var m = tok.match(/^([A-Z_]+)=/); if (m && m[1] !== 'TOTAL' && m[1] !== 'UNACCOUNTED' && order.indexOf(m[1]) < 0) order.push(m[1]); });
  Object.keys(counts).forEach(function (b) { if (order.indexOf(b) < 0) order.push(b); });
  return 'COUNTS: TOTAL=' + total + ' ' + order.map(function (b) { return b + '=' + (counts[b] || 0); }).join(' ') + ' UNACCOUNTED=' + unaccounted;
}

/* ---------------- explorer state file + receipts (next to the master) ---------------- */
function folder_() { var it = DriveApp.getFileById(MASTER_ID).getParents(); return it.hasNext() ? it.next() : DriveApp.getRootFolder(); }
function findOrCreate_(name, mime, initial) {
  var f = folder_(); var it = f.getFilesByName(name);
  if (it.hasNext()) return it.next();
  if (mime === 'doc') { var d = DocumentApp.create(name); var file = DriveApp.getFileById(d.getId()); f.addFile(file); try { DriveApp.getRootFolder().removeFile(file); } catch (e) {} return file; }
  return f.createFile(name, initial || '{}', MimeType.PLAIN_TEXT);
}
function readState_() { var f = findOrCreate_(STATE_FILE_NAME, 'text', '{"seen":{},"rulings":{}}'); try { return JSON.parse(f.getBlob().getDataAsString() || '{}'); } catch (e) { return { seen: {}, rulings: {} }; } }
function writeState_(state) { var f = findOrCreate_(STATE_FILE_NAME, 'text', '{}'); f.setContent(JSON.stringify(state)); }
function appendReceipt_(r) {
  var file = findOrCreate_(RECEIPTS_DOC_NAME, 'doc');
  var doc = DocumentApp.openById(file.getId()); var body = doc.getBody();
  var lines = Object.keys(r).map(function (k) { return k + '=' + (typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]); });
  body.appendParagraph(lines.join('\n') + '\nEND ' + r.RECEIPT); body.appendParagraph('');
  doc.saveAndClose();
}
function readReceipts_() { var it = folder_().getFilesByName(RECEIPTS_DOC_NAME); if (!it.hasNext()) return ''; return DocumentApp.openById(it.next().getId()).getBody().getText(); }

// CommonJS export for unit tests (ignored by Apps Script)
if (typeof module !== 'undefined') module.exports = { mutateRow: mutateRow, recomputeCountsLine: recomputeCountsLine, parsePayload: parsePayload };
