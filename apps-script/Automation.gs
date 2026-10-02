/**
 * WRITER QUEUE — Drive drop-folder access to the Authorized State Writer.
 *
 * Any AI (Grok/Scout, ChatGPT/Forge, Claude/Foreman) that can create a file in AI_Coordination can submit a canonical write
 * without HTTP and without the passphrase: save the exact JSON write body into AI_Coordination/WRITER_QUEUE.
 * A time trigger (every 1 minutes, installed once by installAutomation) applies each file through the same writer functions
 * the HTTP endpoint uses (dispatchWrite_ in Code.gs: intake | ruling | upsert_application | batch), then moves the request to
 * WRITER_QUEUE/processed (ok) or WRITER_QUEUE/failed (not ok) with a RESULT__<name>.json beside it, and appends one line to
 * WRITER_QUEUE_LOG.jsonl beside the master. Every write keeps the writer's identity, dedupe, protected-state and readback rules.
 *
 * File format: plain text or Google Doc whose content is one JSON object, e.g.
 *   {"action":"intake","run":{"SCOUT_RUN_ID":"...","GROSS_FOUND":3},"records":[...]}
 *   {"action":"ruling","ruling":{"primaryId":"V2S-...","kind":"DECLINE","code":"PAY_BELOW_FLOOR","note":"...","actor":"FORGE","requestId":"..."}}
 *   {"action":"upsert_application","event":{"COMPANY":"...","TITLE":"...","STATE":"APPLIED","EVENT_DATE":"2026-10-01","EVIDENCE":"Gmail ..."}}
 *   {"action":"batch","requests":[ ...up to 25 of the above... ]}
 * Markdown code fences around the JSON are tolerated. A "key" field is ignored (Drive access is the authorization).
 */
var QUEUE_FOLDER_NAME = 'WRITER_QUEUE';
var QUEUE_LOG_NAME = 'WRITER_QUEUE_LOG.jsonl';
var QUEUE_TRIGGER_FN = 'processWriterQueue';
var QUEUE_STALE_MS = 30 * 60 * 1000;
var QUEUE_BUDGET_MS = 4.5 * 60 * 1000;

/** Run once from the Apps Script editor (Run > installAutomation). Authorizes the trigger scope and installs the 1-minute queue trigger. Safe to re-run. */
function installAutomation() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === QUEUE_TRIGGER_FN) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(QUEUE_TRIGGER_FN).timeBased().everyMinutes(1).create();
  queueFolders_();
  var s = automationStatus_();
  Logger.log(JSON.stringify(s));
  return s;
}

function automationStatus_() {
  var f = queueFolders_();
  var triggers = [];
  try { triggers = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === QUEUE_TRIGGER_FN; }).map(function (t) { return t.getEventType() + ''; }); } catch (e) { triggers = ['UNKNOWN: ' + e.message]; }
  return { ok: true, queueFolderId: f.queue.getId(), processedFolderId: f.processed.getId(), failedFolderId: f.failed.getId(), pending: listPending_(f.queue).length, queueTriggers: triggers, triggerInstalled: triggers.length > 0, now: new Date().toISOString() };
}

function queueFolders_() {
  var parent = folder_();
  var q = childFolder_(parent, QUEUE_FOLDER_NAME);
  return { queue: q, processed: childFolder_(q, 'processed'), failed: childFolder_(q, 'failed') };
}
function childFolder_(parent, name) { var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }

function listPending_(folder) {
  var out = [], it = folder.getFiles(), now = Date.now();
  while (it.hasNext()) {
    var f = it.next(), n = f.getName();
    if (/^RESULT__/.test(n)) continue;
    if (/^PROCESSING__/.test(n) && now - f.getLastUpdated().getTime() < QUEUE_STALE_MS) continue;
    out.push(f);
  }
  out.sort(function (a, b) { return a.getDateCreated().getTime() - b.getDateCreated().getTime(); });
  return out;
}

/** Trigger handler (also callable via GET action=process_queue). Applies pending queue files oldest first. */
function processWriterQueue() {
  var started = Date.now(), f = queueFolders_(), files = listPending_(f.queue), done = [];
  for (var i = 0; i < files.length; i++) {
    if (Date.now() - started > QUEUE_BUDGET_MS) break;
    var file = files[i], original = file.getName().replace(/^PROCESSING__/, '');
    file.setName('PROCESSING__' + original);
    var entry = { file: original, fileId: file.getId(), startedAt: new Date().toISOString() };
    var result;
    try {
      var parsed = parseQueueContent_(readQueueFile_(file));
      if (!parsed.ok) result = { ok: false, error: parsed.error };
      else if (WRITE_ACTIONS.indexOf(parsed.body.action) < 0) result = { ok: false, error: 'unsupported action ' + parsed.body.action + ' (expected one of ' + WRITE_ACTIONS.join(', ') + ')' };
      else { delete parsed.body.key; result = dispatchWrite_(parsed.body); }
    } catch (e) { result = { ok: false, error: String(e && e.message || e) }; }
    var dest = result && result.ok ? f.processed : f.failed;
    entry.ok = !!(result && result.ok); entry.action = (result && result.mode) || ''; entry.finishedAt = new Date().toISOString(); entry.error = (result && result.error) || '';
    dest.createFile('RESULT__' + original.replace(/\.[A-Za-z]+$/, '') + '.json', JSON.stringify({ request_file: original, request_file_id: file.getId(), processed: entry, result: result }, null, 2), MimeType.PLAIN_TEXT);
    file.setName(original);
    file.moveTo(dest);
    appendQueueLog_(entry);
    done.push(entry);
  }
  return { ok: true, processed: done.length, remaining: Math.max(0, files.length - done.length), results: done };
}

function readQueueFile_(file) {
  if (file.getMimeType() === MimeType.GOOGLE_DOCS) return DocumentApp.openById(file.getId()).getBody().getText();
  return file.getBlob().getDataAsString('UTF-8');
}
function appendQueueLog_(entry) { var lf = findOrCreate_(QUEUE_LOG_NAME, 'text', ''); var cur = lf.getBlob().getDataAsString(); lf.setContent((cur ? cur.replace(/\n*$/, '\n') : '') + JSON.stringify(entry) + '\n'); }

/** Pure: extract one JSON object from file text (tolerates BOM, code fences, smart quotes from Docs, leading prose). */
function parseQueueContent_(text) {
  var t = String(text || '').replace(/^﻿/, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  t = t.replace(/```(?:json)?/gi, '');
  var a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return { ok: false, error: 'no JSON object found in file' };
  try { var body = JSON.parse(t.slice(a, b + 1)); } catch (e) { return { ok: false, error: 'invalid JSON: ' + e.message }; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'JSON must be an object with an action' };
  return { ok: true, body: body };
}

if (typeof module !== 'undefined') module.exports = { parseQueueContent_: parseQueueContent_ };
