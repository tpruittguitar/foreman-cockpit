if (typeof module === 'object' && module.exports) { var WriterTransactions = require('./WriterTransactions.gs'); }
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
 * Every claimed request reaches a visible terminal state (RESULT terminalStatus): SUCCESS (processed/), FAILED, PARTIAL_HOLD
 * or HOLD_ABANDONED (failed/). A new file is claimed only early in an execution (QUEUE_CLAIM_CUTOFF_MS), and a serial batch
 * starts no sub-request after the execution's deadline (QUEUE_BUDGET_MS), so a claim cannot run into the 6-minute Apps
 * Script limit. If an execution still dies holding a claim, the stale PROCESSING__ file is finalized as HOLD_ABANDONED with
 * the receipt-index state of its request IDs; it is never re-run blindly. Resubmit only after reconciling those IDs.
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
var QUEUE_BUDGET_MS = 4.5 * 60 * 1000;      // no serial-batch sub-request starts after this much of the execution has elapsed
var QUEUE_CLAIM_CUTOFF_MS = 90 * 1000;     // no new file is claimed after this; one request may take ~3 minutes, the hard limit is 6

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
    if (/^(RESULT|HOLD)__/.test(n)) continue;
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
 * Returns { busy:true } if another execution holds the lock, { file:null } if nothing is pending, else { file, original, stale }.
 * stale is { claimedAt } when the file was an abandoned PROCESSING__ claim: the caller finalizes it, it does not re-run it.
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
      var prior = file.getName(), original = prior.replace(/^PROCESSING__/, '');
      var stale = prior !== original ? { claimedAt: file.getLastUpdated().toISOString() } : null;
      file.setName('PROCESSING__' + original);
      return { busy: false, file: file, original: original, stale: stale };
    }
    return { busy: false, file: null };
  } finally {
    lock.releaseLock();
  }
}
function isPendingQueueFile_(file, folderId, now) {
  var n = file.getName(), inFolder = false, parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
  if (!inFolder || /^(RESULT|HOLD)__/.test(n)) return false;
  return !/^PROCESSING__/.test(n) || now - file.getLastUpdated().getTime() >= QUEUE_STALE_MS;
}

/** Trigger handler (also callable via GET action=process_queue). Applies pending queue files oldest first, one claim at a time. */
function processWriterQueue() {
  var started = Date.now(), f = queueFolders_(), done = [], busy = false, handled = {}, deferred = null;
  // Independent verification first: this tick is a new execution, so its fresh read shows what earlier writes really persisted.
  var verification; try { verification = verifyNow_(); } catch (ve) { verification = { ok: false, error: String(ve && ve.message || ve), errorStack: errorStack_(ve) }; }
  setWriteDeadline_(started + QUEUE_BUDGET_MS);
  try {
    while (Date.now() - started <= QUEUE_CLAIM_CUTOFF_MS) {
      var claim = claimNextQueueFile_(f.queue, handled);
      if (claim.busy) { busy = true; break; }
      if (!claim.file) break;
      var file = claim.file, original = claim.original;
      handled[file.getId()] = true;
      var entry = { file: original, fileId: file.getId(), startedAt: new Date().toISOString(), executionStartedAt: new Date(started).toISOString(), claimElapsedMs: Date.now() - started, queueWaitMs: Math.max(0, Date.now() - file.getDateCreated().getTime()) };
      var result, body = null;
      try {
        var rawQueueText = readQueueFile_(file);
        var parsed = parseQueueContent_(rawQueueText);
        entry.payloadProof = queuePayloadProof_(rawQueueText);
        if (parsed.ok) body = parsed.body;
        if (claim.stale) result = abandonedClaimResult_(claim.stale, body);
        else if (!parsed.ok) result = { ok: false, error: parsed.error };
        else if (WRITE_ACTIONS.indexOf(parsed.body.action) < 0) result = { ok: false, error: 'unsupported action ' + parsed.body.action + ' (expected one of ' + WRITE_ACTIONS.join(', ') + ')' };
        else if (parsed.body.action === 'intake' && intakeAccountingError_(parsed.body)) result = { ok: false, mode: 'INTAKE_ACCOUNTING_REJECTED', error: intakeAccountingError_(parsed.body), retryClass: 'RECONSTRUCT_FROM_SOURCE_NO_BLIND_REPLAY' };
        else { delete parsed.body.key; result = dispatchWrite_(parsed.body); }
      } catch (e) { result = claim.stale ? abandonedClaimResult_(claim.stale, body) : { ok: false, error: String(e && e.message || e), errorStack: errorStack_(e), docAccess: docAccessSummary_() }; }
      if (result && result.mode === 'WRITE_FENCE') {
        // Not a failure and nothing ran: an earlier write is unverified, this execution already wrote the master, or the
        // writer is frozen. Release the claim; if the rename fails the file goes stale and is finalized as HOLD_ABANDONED.
        try { file.setName(original); } catch (re) {}
        deferred = { file: original, reason: result.error, pendingWrites: result.pendingWrites || [] };
        break;
      }
      done.push(finalizeClaim_(f, file, original, entry, result));
    }
  } finally {
    setWriteDeadline_(0);
  }
  return { ok: true, processed: done.length, remaining: listPending_(f.queue).length, busy: busy, deferred: deferred, verification: verification, results: done };
}

/** Pure: the terminal state a RESULT reports. */
function terminalStatus_(result) {
  if (result && result.mode === 'ABANDONED_CLAIM') return 'HOLD_ABANDONED';
  if (result && result.partial) return 'PARTIAL_HOLD';
  return result && result.ok ? 'SUCCESS' : 'FAILED';
}

// A partial batch is recovered only when every request in it has at least one request ID and all of
// them are COMPLETE. A request without an ID cannot be proven applied, so it keeps the batch unrecovered.
function partialHoldRecovered_(body, states) {
  var reqs = body && Array.isArray(body.requests) ? body.requests : [body];
  if (!reqs.length) return false;
  return reqs.every(function (q) {
    var ids = WriterTransactions.requestIds(q);
    return ids.length > 0 && ids.every(function (id) { return !!(states[id] && states[id].s === 'COMPLETE'); });
  });
}

/** Pure: every request ID named in a write body (ruling.requestId, requestId, request_id), in order, without duplicates. */
function requestIdsOf_(body) {
  var out = WriterTransactions.requestIds(body).slice();
  (function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    ['requestId', 'request_id'].forEach(function (k) { var id = v[k]; if (typeof id === 'string' && id.trim() && out.indexOf(id.trim()) < 0) out.push(id.trim()); });
    Object.keys(v).forEach(function (k) { if (v[k] && typeof v[k] === 'object') walk(v[k]); });
  })(body);
  return out;
}

/** An execution died holding this claim (it can only go stale past the 6-minute limit). Report, never re-run: the RESULT
 *  carries each request ID's receipt-index state (read after this tick's verification) so the operator can reconcile. */
function abandonedClaimResult_(stale, body) {
  var ids = requestIdsOf_(body), states = {}, indexError = '';
  try { var idx = readIndex_(); ids.forEach(function (id) { states[id] = (idx && idx.requests && idx.requests[id]) || null; }); }
  catch (e) { indexError = String(e && e.message || e); }
  var res = { ok: false, mode: 'ABANDONED_CLAIM', claimedAt: stale.claimedAt, requestIds: ids, requestIndexStates: states,
    error: 'claimed at ' + stale.claimedAt + ' by an execution that ended without a terminal result (most likely the 6-minute Apps Script limit); not re-run. Reconcile requestIndexStates, the receipts and the master before resubmitting.' };
  if (indexError) res.indexError = indexError;
  if (!body) res.unparsedRequest = true;
  return res;
}

/** RESULT, release, move and log; each step guarded so a failure in one still leaves the request in a visible state.
 *  If the move fails the file is renamed HOLD__<name> in the queue, which the worker never claims again. */
function finalizeClaim_(f, file, original, entry, result) {
  var status = terminalStatus_(result), dest = status === 'SUCCESS' ? f.processed : f.failed;
  entry.ok = status === 'SUCCESS'; entry.terminalStatus = status; entry.action = (result && result.mode) || ''; entry.finishedAt = new Date().toISOString(); entry.error = (result && result.error) || '';
  if (result && result.verification) { entry.verification = result.verification; entry.writeId = result.writeId || ''; }
  if (result && result.errorStack) entry.errorStack = result.errorStack;
  if (result && result.retryClass) entry.retryClass = result.retryClass;
  if (result && result.docAccess && result.docAccess.status !== 'INITIAL_SUCCESS') entry.docAccess = result.docAccess;
  if (result && result.partial) { entry.attempted = result.attempted; entry.notAttempted = result.notAttempted; entry.stoppedBy = result.stoppedBy; }
  entry.totalMs = new Date(entry.finishedAt).getTime() - new Date(entry.startedAt).getTime();
  if (result && result.timings) entry.writerTimings = result.timings;
  entry.records = result && (result.processed || result.results && result.results.length) || null;
  entry.writerBuild = typeof WRITER_BUILD !== 'undefined' ? WRITER_BUILD.commit : 'UNKNOWN';
  entry.storageModel='text/plain';
  try {
    dest.createFile('RESULT__' + original.replace(/\.[A-Za-z]+$/, '') + '.json', JSON.stringify({ request_file: original, request_file_id: file.getId(), terminalStatus: status, processed: entry, result: result }, null, 2), MimeType.PLAIN_TEXT);
  } catch (e) { entry.resultFileError = String(e && e.message || e); }
  try { file.setName(original); file.moveTo(dest); }
  catch (e) {
    entry.moveError = String(e && e.message || e);
    try { file.setName('HOLD__' + original); entry.terminalStatus = 'HOLD_UNMOVED'; } catch (e2) { entry.renameError = String(e2 && e2.message || e2); }
  }
  try { appendQueueLog_(entry); } catch (e) { entry.logError = String(e && e.message || e); }
  try { entry.repair = repairFailedIntake_(f, file, original, result); } catch (e) { entry.repairError = String(e && e.message || e); }
  return entry;
}

/** A failed intake is not discarded. The original stays in failed. One repair copy is queued.
 *  Stop at REPAIR2__ so a file that still fails is preserved, not looped. Never attach a rejection
 *  to a possible match: that case becomes an intake for the requested requisition. */
function repairFailedIntake_(f, file, original, result) {
  if (terminalStatus_(result) === 'SUCCESS' || /^REPAIR2__/.test(original)) return { queued: false, reason: 'repair cap' };
  var err = String(result && result.error || '');
  var parsed = { ok: false };
  try { parsed = parseQueueContent_(readQueueFile_(file)); } catch (e) {}
  var body = parsed.ok ? parsed.body : null;
  var next = null, reason = '';
  if (/invalid JSON/i.test(err) && body) { next = body; reason = 'reserialized JSON'; }
  else if (/batch too large/i.test(err) && body && Array.isArray(body.requests)) {
    var chunks = [], size = 49;
    for (var i = 0; i < body.requests.length; i += size) chunks.push(body.requests.slice(i, i + size));
    var names = [];
    chunks.forEach(function (chunk, n) {
      var part = { action: body.action || 'batch', requestId: (body.requestId || original) + '-S' + (n + 1), requests: chunk };
      names.push(queueRepair_(f, original, part, n + 1));
    });
    return { queued: names.length > 0, files: names, reason: 'split at 49' };
  } else if (/Service error: Drive|document is inaccessible|migration state unreadable/i.test(err) && body) {
    next = body; reason = 'transient Drive retry';
  } else if (result && result.partial && body && Array.isArray(body.requests) && result.notAttempted) {
    next = { action: 'batch', requestId: (body.requestId || original) + '-REMAINDER', requests: result.notAttempted.map(function (i) { return body.requests[i]; }).filter(Boolean) };
    reason = 'unattempted remainder only';
  } else if (/identity ambiguous/i.test(err) && body) {
    var ev = body.event || body;
    if (ev && ev.COMPANY && ev.TITLE && ev.SOURCE_URL && !ev.TARGET_PRIMARY_ID) {
      next = { action: 'intake', run: { SCOUT_RUN_ID: 'REPAIR-' + (ev.requestId || original) }, records: [{ COMPANY: ev.COMPANY, TITLE: ev.TITLE, LOCATION: ev.LOCATION || '', REQ_ID: ev.REQ_ID || '', SOURCE_URL: ev.SOURCE_URL, DISCOVERY_SOURCE: 'FAILED_UPSERT_REPAIR', SCOUT_NOTES: 'Repair intake. Do not attach to a possible match. Rejection evidence stays on the failed file until this row exists. ' + (ev.EVIDENCE || '') }] };
      reason = 'distinct requisition intake; rejection not attached';
    }
  }
  if (!next) return { queued: false, reason: 'no safe repair' };
  return { queued: true, file: queueRepair_(f, original, next, 0), reason: reason };
}
function queueRepair_(f, original, body, part) {
  var stem = original.replace(/\.[A-Za-z]+$/, '');
  var name = (/^REPAIR1__/.test(original) ? 'REPAIR2__' : 'REPAIR1__') + stem + (part ? '-S' + part : '') + '.json';
  f.queue.createFile(name, JSON.stringify(body), MimeType.PLAIN_TEXT);
  return name;
}

/* ================= writer state monitor (read-only) ================= */
var STATUS_CLAIM_WARN_MS = 4 * 60 * 1000;        // a claim this old is running long; past QUEUE_STALE_MS it is abandoned
var STATUS_BACKLOG_WARN_MS = 10 * 60 * 1000;     // a pending file this old means the trigger is not draining the queue
var STATUS_UNVERIFIED_WARN_MS = 5 * 60 * 1000;   // a master write still unverified after this needs a look
var STATUS_UNVERIFIED_CRIT_MS = 20 * 60 * 1000;
var STATUS_FREEZE_CRIT_MS = 30 * 60 * 1000;
var STATUS_RECENT_HOLD_MS = 24 * 60 * 60 * 1000;

/** GET action=writer_status: one cheap snapshot for the Explorer's writer monitor. Reads only; each part fails soft. */
function writerStatus_() {
  var now = Date.now(), s = { ok: true, now: new Date(now).toISOString(), build: typeof WRITER_BUILD !== 'undefined' ? WRITER_BUILD : null, errors: [] };
  function part(name, fn) { try { fn(); } catch (e) { s.errors.push(name + ': ' + String(e && e.message || e)); } }
  part('freeze', function () { s.freeze = readFreeze_(); });
  part('migration', function () { var st = readMigrationState_(); s.migration = st ? { migrationId: st.migrationId || '', mode: st.mode || '', status: st.status || '', updatedAt: st.updatedAt || '' } : null; });
  part('queue', function () {
    var f = queueFolders_(), it = f.queue.getFiles(), q = { pending: 0, oldestPendingAt: '', processing: [], hold: [] };
    while (it.hasNext()) {
      var file = it.next(), n = file.getName();
      if (/^RESULT__/.test(n)) continue;
      if (/^HOLD__/.test(n)) { q.hold.push(n); continue; }
      if (/^PROCESSING__/.test(n)) { var at = file.getLastUpdated().getTime(); q.processing.push({ file: n.replace(/^PROCESSING__/, ''), claimedAt: new Date(at).toISOString(), ageMs: now - at }); continue; }
      q.pending++; var c = file.getDateCreated().toISOString(); if (!q.oldestPendingAt || c < q.oldestPendingAt) q.oldestPendingAt = c;
    }
    s.queue = q;
  });
  part('trigger', function () { s.triggerInstalled = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === QUEUE_TRIGGER_FN; }); });
  part('recentRuns', function () {
    var lf = findOrCreate_(QUEUE_LOG_NAME, 'text', ''), lines = String(lf.getBlob().getDataAsString() || '').split('\n').filter(Boolean);
    var runs = lines.map(function (l) { try { var e = JSON.parse(l); return { file: e.file, fileId: e.fileId || '', terminalStatus: e.terminalStatus || (e.ok ? 'SUCCESS' : 'FAILED'), action: e.action || '', finishedAt: e.finishedAt || '', totalMs: e.totalMs || 0, docAccess:e.docAccess||null, writerTimings:e.writerTimings||null, records:e.records||null, writerBuild:e.writerBuild||'UNKNOWN', storageModel:e.storageModel||'UNKNOWN', error: String(e.error || '').slice(0, 240) }; } catch (x) { return null; } }).filter(Boolean);
    s.recentRuns = runs.slice(-8).reverse();
    // Warnings follow the 24-hour policy window, not queue traffic: every HOLD-type result that finished
    // inside the window is kept, however many runs came after it. An unparseable finishedAt counts as recent.
    s.recentHolds = runs.filter(function (r) { var t = Date.parse(r.finishedAt); return /HOLD/.test(r.terminalStatus) && (isNaN(t) || now - t < STATUS_RECENT_HOLD_MS); }).reverse();
    // FAILED runs (usually a governance rejection: nothing was written) inside the same window, newest first.
    s.recentFailed = runs.filter(function (r) { var t = Date.parse(r.finishedAt); return r.terminalStatus === 'FAILED' && (isNaN(t) || now - t < STATUS_RECENT_HOLD_MS); }).reverse();
    // PARTIAL_HOLD is an audit fact, not necessarily an active fault. If every request in the
    // original failed batch carries a request ID that is now COMPLETE in the durable receipt index,
    // keep it in history but mark it recovered so the Explorer no longer raises an active warning.
    // Fail closed: the exact logged file is read by ID; a missing ID, an unreadable file or any
    // request without a COMPLETE ID leaves the run unrecovered and its warning in place.
    var partials = s.recentHolds.concat(s.recentRuns).filter(function (r, i, all) { return /^(PARTIAL_HOLD|SUCCESS)$/.test(r.terminalStatus) && all.indexOf(r) === i; });
    if (partials.length) {
      var idx = readIndex_(), states = (idx && idx.requests) || {};
      partials.forEach(function (r) {
        r.recovered = false;
        if (!r.fileId) return;
        try {
          var parsed = parseQueueContent_(readQueueFile_(DriveApp.getFileById(r.fileId)));
          r.recovered = parsed.ok && partialHoldRecovered_(parsed.body, states);
        } catch (x) { r.recoveryError = String(x && x.message || x).slice(0, 160); }
      });
    }
  });
  part('unverified', function () {
    var idx = readIndex_(), pend = (idx && idx.pending) || [];
    s.unverified = { count: pend.length, oldestWrittenAt: pend.reduce(function (m, p) { return !m || p.writtenAt < m ? p.writtenAt : m; }, '') };
  });
  s.workload={state:'UNKNOWN',productionBenchmark:'NOT_TESTED',reason:'No independently approved production capacity profile',measurements:(s.recentRuns||[]).map(function(r){return {elapsedMs:r.totalMs,records:r.records,ok:r.terminalStatus==='SUCCESS',environment:'production',operation:r.action,build:r.writerBuild,storageModel:r.storageModel};})};
  s.warnings = writerWarnings_(s, now);
  s.level = s.warnings.some(function (w) { return w.level === 'critical'; }) ? 'critical' : s.warnings.some(function (w) { return w.level === 'warn'; }) ? 'warn' : 'ok';
  return s;
}

/** Pure: warnings for the writer monitor. A freeze is expected only while a LIVE migration is preparing or stepping. */
function writerWarnings_(s, now) {
  var w = [], age = function (iso) { var t = Date.parse(iso || ''); return isNaN(t) ? 0 : now - t; }, min = function (ms) { return Math.round(ms / 60000) + ' min'; };
  if (s.freeze && s.freeze.frozen) {
    var mg = s.migration || {}, expected = mg.mode === 'LIVE' && (mg.status === 'PREPARED' || mg.status === 'IN_PROGRESS'), fa = age(s.freeze.at);
    w.push({ level: !expected || fa > STATUS_FREEZE_CRIT_MS ? 'critical' : 'warn', code: expected ? 'FROZEN_FOR_MIGRATION' : 'FROZEN_UNEXPECTED',
      message: 'Writer frozen' + (fa ? ' for ' + min(fa) : '') + ' by ' + (s.freeze.by || '?') + ': ' + (s.freeze.reason || 'no reason') + (expected ? ' (migration ' + mg.status + ')' : '. No migration is running: every write is being refused.') });
  }
  var q = s.queue || {};
  (q.processing || []).forEach(function (p) {
    if (p.ageMs >= QUEUE_STALE_MS) w.push({ level: 'critical', code: 'CLAIM_ABANDONED', message: p.file + ' has been PROCESSING for ' + min(p.ageMs) + '; its execution ended without a result. The next tick finalizes it as HOLD_ABANDONED.' });
    else if (p.ageMs >= STATUS_CLAIM_WARN_MS) w.push({ level: 'warn', code: 'CLAIM_RUNNING_LONG', message: p.file + ' has been PROCESSING for ' + min(p.ageMs) + '.' });
  });
  if (q.hold && q.hold.length) w.push({ level: 'warn', code: 'QUEUE_HOLD', message: q.hold.length + ' request(s) held in the queue folder (could not be moved): ' + q.hold.join(', ') });
  if (q.pending && age(q.oldestPendingAt) > STATUS_BACKLOG_WARN_MS) w.push({ level: 'warn', code: 'QUEUE_BACKLOG', message: q.pending + ' request(s) waiting; oldest for ' + min(age(q.oldestPendingAt)) + '.' });
  if (s.triggerInstalled === false) w.push({ level: 'critical', code: 'TRIGGER_MISSING', message: 'The queue trigger is not installed; queued requests are not processed.' });
  var u = s.unverified || {}, ua = age(u.oldestWrittenAt);
  if (u.count && ua > STATUS_UNVERIFIED_WARN_MS) w.push({ level: ua > STATUS_UNVERIFIED_CRIT_MS ? 'critical' : 'warn', code: 'WRITE_UNVERIFIED', message: u.count + ' master write(s) not yet independently verified; oldest ' + min(ua) + ' ago. New master writes are fenced until it resolves.' });
  // recentHolds covers the whole 24-hour window; recentRuns (last 8) is only a fallback for an older status shape.
  (Array.isArray(s.recentHolds) ? s.recentHolds : (s.recentRuns || [])).forEach(function (r) {
    if (/HOLD/.test(r.terminalStatus) && !r.recovered && age(r.finishedAt) < STATUS_RECENT_HOLD_MS) w.push({ level: 'warn', code: r.terminalStatus, message: r.file + ' ended ' + r.terminalStatus + ' at ' + r.finishedAt + '. See its RESULT in WRITER_QUEUE/failed before resubmitting.' });
  });
  // One notice for FAILED runs in the window. Notice level never raises s.level: a FAILED run wrote nothing, but
  // whoever submitted it should know it was refused and why.
  var failed = (Array.isArray(s.recentFailed) ? s.recentFailed : []).filter(function (r) { return age(r.finishedAt) < STATUS_RECENT_HOLD_MS; });
  if (failed.length) { var f0 = failed[0]; w.push({ level: 'notice', code: 'FAILED', message: failed.length + ' request(s) FAILED in the last 24 h; nothing was written for them. Latest: ' + f0.file + ' at ' + f0.finishedAt + (f0.error ? ': ' + f0.error : '') + '. See WRITER_QUEUE/failed.' }); }
  (s.errors || []).forEach(function (e) { w.push({ level: 'warn', code: 'STATUS_PART_UNAVAILABLE', message: e }); });
  return w;
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

/** Fingerprint the EXACT bytes read before any permissive normalization. Never include secrets or payload contents in logs. */
function queuePayloadProof_(text) {
  var raw=String(text||''),bytes=Utilities.newBlob(raw,'text/plain').getBytes();
  var digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes);
  return {rawByteLength:bytes.length,rawSha256:digest.map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join(''),parserStage:'QUEUE_READ'};
}
/** Legacy intake may have more discoveries than records only when an explicit source ledger accounts for each.
 * Stop BEFORE dispatch; the writer must not partially write 20 and then discover that 8 vanished.
 */
function intakeAccountingError_(body) {
  if(!body||body.action!=='intake')return '';
  if(!Array.isArray(body.records))return 'INTAKE_RECORDS_NOT_ARRAY';
  var run=body.run||{},gross=Number(run.GROSS_FOUND),ledger=run.DISPOSITION_LEDGER;
  if(!isFinite(gross)||gross<0||Math.floor(gross)!==gross)return 'GROSS_FOUND_INVALID';
  if(!Array.isArray(ledger)){
    return gross===body.records.length?'':'COUNT_MISMATCH: GROSS_FOUND '+gross+' versus records '+body.records.length+'; no disposition ledger; source reconstruction required';
  }
  var submitted=0,accounted=0,seen={};
  for(var i=0;i<ledger.length;i++){
    var x=ledger[i]||{},id=String(x.candidateId||'');
    if(!id||seen[id]||!x.sourceMessageId||!x.initiatingUrl)return 'DISPOSITION_LEDGER_IDENTITY_OR_SOURCE_INVALID index '+i;
    seen[id]=true;
    if(['SUBMITTED','EXISTING','NEVER_CONSIDER','IDENTITY_HOLD','UNRESOLVED','CARRY_FORWARD'].indexOf(x.disposition)<0){
      if(x.disposition==='OFF_TARGET_PRE_GROSS')continue;
      return 'DISPOSITION_LEDGER_STATUS_INVALID index '+i;
    }
    accounted++;if(x.disposition==='SUBMITTED')submitted++;
  }
  if(accounted!==gross||submitted!==body.records.length)return 'COUNT_MISMATCH: GROSS_FOUND '+gross+' ledger '+accounted+' submitted '+submitted+' records '+body.records.length;
  return '';
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

if (typeof module !== 'undefined') module.exports = { intakeAccountingError_: intakeAccountingError_, queuePayloadProof_: queuePayloadProof_, parseQueueContent_: parseQueueContent_, claimNextQueueFile_: claimNextQueueFile_, listPending_: listPending_, appendQueueLog_: appendQueueLog_, processWriterQueue: processWriterQueue, writerWarnings_: writerWarnings_, writerStatus_: writerStatus_, terminalStatus_: terminalStatus_, requestIdsOf_: requestIdsOf_, partialHoldRecovered_: partialHoldRecovered_, QUEUE_CLAIM_CUTOFF_MS: QUEUE_CLAIM_CUTOFF_MS, QUEUE_BUDGET_MS: QUEUE_BUDGET_MS };
