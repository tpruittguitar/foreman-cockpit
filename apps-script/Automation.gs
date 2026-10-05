/**
 * WRITER QUEUE — Drive drop-folder access to the Authorized State Writer.
 *
 * Any AI (Grok/Scout, ChatGPT/Forge, Claude/Foreman) that can create a file in AI_Coordination can submit a canonical write
 * without HTTP and without the passphrase: save the exact JSON write body into AI_Coordination/WRITER_QUEUE.
 * A time trigger (every 1 minutes, installed once by installAutomation) applies each file through the same writer functions
 * the HTTP endpoint uses (dispatchWrite_ in Code.gs: intake | ruling | upsert_application | batch), then moves the request to
 * WRITER_QUEUE/processed (ok) or WRITER_QUEUE/failed (not ok) with a RESULT__<name>.json beside it, and appends one line to
 * WRITER_QUEUE_LOG.jsonl beside the master. Every write keeps the writer's identity, dedupe, protected-state and readback rules.
 * Each tick first verifies earlier writes from a fresh read (a write is never verified by its own execution); master writes
 * return verification PENDING and become COMPLETE only then. At most one master write per tick: a fenced request stays queued.
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
var QUEUE_STALE_MS = 8 * 60 * 1000; // safely above normal Apps Script execution; recovers abandoned claims much faster than the old 30-minute window
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

/**
 * Claims the oldest pending request by renaming it PROCESSING__<original> while holding the script lock, so two
 * overlapping trigger runs can never pick the same file. The lock covers only list + rename and is released before the
 * request is applied: dispatchWrite_ takes the same script lock for the actual master write.
 * Folder listings can lag behind renames/moves, so each candidate is re-read by ID and must still be a pending file in
 * this folder before it is claimed. skipIds holds files this run already handled.
 * Returns { busy:true } if another execution holds the lock, { file:null } if nothing is pending, else { file, original }.
 */
function claimNextQueueFile_(folder, skipIds) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return { busy: true, file: null };
  try {
    var pending = listPending_(folder), folderId = folder.getId();
    for (var i = 0; i < pending.length; i++) {
      var id = pending[i].getId();
      if (skipIds && skipIds[id]) continue;
      var file = DriveApp.getFileById(id);
      if (!isPendingQueueFile_(file, folderId, Date.now())) continue;
      var original = file.getName().replace(/^PROCESSING__/, '');
      file.setName('PROCESSING__' + original);
      return { busy: false, file: file, original: original };
    }
    return { busy: false, file: null };
  } finally {
    lock.releaseLock();
  }
}
function isPendingQueueFile_(file, folderId, now) {
  var n = file.getName(), inFolder = false, parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
  if (!inFolder || /^RESULT__/.test(n)) return false;
  return !/^PROCESSING__/.test(n) || now - file.getLastUpdated().getTime() >= QUEUE_STALE_MS;
}

/** Trigger handler (also callable via GET action=process_queue). Applies pending queue files oldest first, one claim at a time. */
function processWriterQueue() {
  var started = Date.now(), f = queueFolders_(), done = [], busy = false, handled = {}, deferred = null;
  // Independent verification first: this tick is a new execution, so its fresh read shows what earlier writes really persisted.
  var verification; try { verification = verifyNow_(); } catch (ve) { verification = { ok: false, error: String(ve && ve.message || ve), errorStack: errorStack_(ve) }; }
  while (Date.now() - started <= QUEUE_BUDGET_MS) {
    var claim = claimNextQueueFile_(f.queue, handled);
    if (claim.busy) { busy = true; break; }
    if (!claim.file) break;
    var file = claim.file, original = claim.original;
    handled[file.getId()] = true;
    var entry = { file: original, fileId: file.getId(), startedAt: new Date().toISOString(), queueWaitMs: Math.max(0, Date.now() - file.getDateCreated().getTime()) };
    var result;
    try {
      var parsed = parseQueueContent_(readQueueFile_(file));
      if (!parsed.ok) result = { ok: false, error: parsed.error };
      else if (WRITE_ACTIONS.indexOf(parsed.body.action) < 0) result = { ok: false, error: 'unsupported action ' + parsed.body.action + ' (expected one of ' + WRITE_ACTIONS.join(', ') + ')' };
      else { delete parsed.body.key; result = dispatchWrite_(parsed.body); }
    } catch (e) { result = { ok: false, error: String(e && e.message || e), errorStack: errorStack_(e), docAccess: docAccessSummary_() }; }
    if (result && result.mode === 'WRITE_FENCE') {
      // Not a failure: an earlier write is unverified, or this execution already wrote the master. Leave it queued.
      file.setName(original);
      deferred = { file: original, reason: result.error, pendingWrites: result.pendingWrites || [] };
      break;
    }
    var dest = result && result.ok ? f.processed : f.failed;
    entry.ok = !!(result && result.ok); entry.action = (result && result.mode) || ''; entry.finishedAt = new Date().toISOString(); entry.error = (result && result.error) || '';
    if (result && result.verification) { entry.verification = result.verification; entry.writeId = result.writeId || ''; }
    if (result && result.errorStack) entry.errorStack = result.errorStack;
    if (result && result.docAccess && result.docAccess.status !== 'INITIAL_SUCCESS') entry.docAccess = result.docAccess;
    entry.totalMs = new Date(entry.finishedAt).getTime() - new Date(entry.startedAt).getTime();
    if (result && result.timings) entry.writerTimings = result.timings;
    dest.createFile('RESULT__' + original.replace(/\.[A-Za-z]+$/, '') + '.json', JSON.stringify({ request_file: original, request_file_id: file.getId(), processed: entry, result: result }, null, 2), MimeType.PLAIN_TEXT);
    file.setName(original);
    file.moveTo(dest);
    appendQueueLog_(entry);
    done.push(entry);
  }
  return { ok: true, processed: done.length, remaining: listPending_(f.queue).length, busy: busy, deferred: deferred, verification: verification, results: done };
}

function readQueueFile_(file) {
  if (file.getMimeType() === MimeType.GOOGLE_DOCS) return DocumentApp.openById(file.getId()).getBody().getText();
  return file.getBlob().getDataAsString('UTF-8');
}
/** Read + append + write under the script lock so two runs finishing together cannot overwrite each other's line.
 *  Called after dispatchWrite_ has released its lock, so this never nests inside another script-lock hold. */
function appendQueueLog_(entry) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var lf = findOrCreate_(QUEUE_LOG_NAME, 'text', ''); var cur = lf.getBlob().getDataAsString();
    lf.setContent((cur ? cur.replace(/\n*$/, '\n') : '') + JSON.stringify(entry) + '\n');
  } finally {
    lock.releaseLock();
  }
}

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

if (typeof module !== 'undefined') module.exports = { parseQueueContent_: parseQueueContent_, claimNextQueueFile_: claimNextQueueFile_, listPending_: listPending_, appendQueueLog_: appendQueueLog_ };
