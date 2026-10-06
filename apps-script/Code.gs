if(typeof module==='object'&&module.exports)var PipelinePolicy=require('../pipeline-policy');
/**
 * PIPELINE EXPLORER STATE WRITER (Google Apps Script)
 * Runs as Tim. The ONLY canonical mutations the Explorer makes go through this script, against the
 * single fixed master, with read-back verification (FORGE_AMENDMENT_58 Authorized State Writer contract).
 *
 * Actions (GET):  ping | writer_status | master | state | receipts | rules | runs | canonical_rules | scoring | events | interview_notes | documents | request_result | receipt_index | verify_pending | automation | process_queue | submit (payload=<JSON write body>)
 * Actions (POST): state | ruling | intake | upsert_application | interview_note | approve_resume | save_rules | save_scoring_model | undo_ruling | install_automation | batch | rotate_receipts | correct_receipts
 * Master writes return verification:'PENDING'. COMPLETE is only ever recorded by a LATER execution's fresh read (see "durable write verification").
 * Drive queue:    any AI may drop a JSON write body into AI_Coordination/WRITER_QUEUE; Automation.gs applies it about every 1 minute.
 *
 * ruling  = Tim disposition on one existing row by exact PRIMARY_ID (PR #3).
 * intake  = Scout discovery intake: one or a batch of proposed records -> dedupe -> append canonical rows in
 *           SCOUT_INTAKE or DISCOVERY_LEAD only; idempotent by INTAKE_KEY; never touches existing rows.
 * rules   = the NEVER_CONSIDER section extracted from active TIM_PIPELINE_RULES_CANONICAL; no standalone rule file is authoritative.
 * runs    = SCOUT_RUN_METRICS.jsonl beside the master (per-run cohort metrics, not a job store).
 *
 * DEPLOY: apps-script/README.md.  Pure functions below are unit-tested in tests/*.test.js via CommonJS export.
 */
var MASTER_ID = '19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI'; // fixed per Tim's 2026-09-29 ruling (cutover REV2)
var PASSPHRASE = 'CHANGE-ME';                                   // set your own; the page asks for it once
var STATE_FILE_NAME = 'PIPELINE_EXPLORER_STATE.json';
var RECEIPTS_DOC_NAME = 'PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS';
var DISCOVERY_REQUESTS_NAME = 'PIPELINE_DATA_DISCOVERY_REQUESTS.jsonl';
/** Runtime Never-Consider authority is the active TIM_PIPELINE_RULES_CANONICAL document (CANONICAL_RULES_DOC_ID). */
/** Every gross Scout discovery ends in exactly one of these outcomes. */
var INTAKE_OUTCOMES = ['NEVER_CONSIDER_EXCLUDED', 'SCOUT_INTAKE_WRITTEN', 'DISCOVERY_LEAD_WRITTEN', 'EXISTING_MATCH', 'WRITE_FAILED'];
var RUNS_FILE_NAME = 'SCOUT_RUN_METRICS.jsonl';
var EVENT_LOG_NAME = 'PIPELINE_EVENT_LOG.jsonl';
var CANONICAL_RULES_DOC_ID = '1uuIopBY2Et-leu_tOdxnWAJJLniKwk08rdLCypuM2BE';
var RULESET_HISTORY_NAME = 'PIPELINE_RULESET_HISTORY.jsonl';
var DOCS_ROOT_ID = '1CTLDseAewX18aTsH9Iyeq4xQvVoktFdG';
var RESUMES_FOLDER_ID = '1mzR0WY_tZUGIWNoAVBG9PTWCppoBFOUf';
var COVER_LETTERS_FOLDER_ID = '1o-mX_2HwYGNLHENPfWnQoX1jS0qUKo2v';
var SUPPORTING_DOCS_FOLDER_ID = '1DyXxGRwEw5aHWiBamS1bWD1myHkNmvLG';
var TIM_VOICE_FOLDER_ID = '1E8yeO34MazfKY0KINhUbbd6d7RrGDcB_';
var INTERVIEW_NOTES_FOLDER_ID = '1rrmZb-pW_THx-DZMcFVczYuouTlNTkKz';
var JOB_DOCS_CONFIG_NAME = 'JOB_DOCUMENTS_CANONICAL.json';
var SCORING_MODEL_NAME = 'PIPELINE_SCORING_MODEL.json';
var SCORING_MODEL_HISTORY_NAME = 'PIPELINE_SCORING_MODEL_HISTORY.jsonl';
var SCORING_MODEL_ID = 'TIM_WEIGHTED_JOB_RATING';
var SCORING_WEIGHT_KEYS = ['experience','flex','compensation','geo','ats','title','culture','ownership'];

var FIXED_N = 9;
var BUCKETS = ['SCOUT_INTAKE', 'DISCOVERY_LEAD', 'READY_TO_PURSUE', 'TIM_DECISION_REQUIRED', 'BLOCKED', 'MANUAL_RESEARCH', 'APPLIED', 'REJECTED_BY_EMPLOYER', 'DECLINED_BY_TIM', 'DUPLICATE', 'CLOSED_DEAD', 'INVALID_DISCOVERY'];
var INTAKE_ALLOWED_BUCKETS = ['SCOUT_INTAKE', 'DISCOVERY_LEAD'];
var PROTECTED_APPLICANT = ['APPLIED', 'REJECTED_BY_EMPLOYER'];

/** Identity of the deployed Writer code. deploy.sh replaces this line with the deployed commit, subject and PR number;
 *  the repo copy is the placeholder below. Reported by ping and writer_status so the Explorer can show which PR is live. */
var WRITER_BUILD = { commit: 'source', pr: null, subject: '', deployedAt: '' };

/* ================= HTTP ================= */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!auth_(p.key)) return out_({ ok: false, error: 'bad key' });
  var a = p.action || 'master';
  try {
    if (a === 'ping') return out_({ ok: true, now: new Date().toISOString(), master: MASTER_ID, build: WRITER_BUILD, actions: ['writer_status','master','state','receipts','rules','runs','canonical_rules','scoring','events','interview_notes','documents','document_text','discovery_requests','request_result','ruling','intake','data_discovery','upsert_application','interview_note','approve_resume','save_rules','save_scoring_model','undo_ruling','install_automation','batch','rotate_receipts','correct_receipts','receipt_index','verify_pending','archive','evidence','migration_status','migration','freeze_writer','unfreeze_writer','restore_archived'] });
    if (a === 'master') return out_(p.hydrate ? readMasterHydrated_(p.doc || '') : readMaster_());
    if (a === 'archive') { var stA = readMigrationState_(); return out_(stA && stA.archiveId ? { ok: true, archiveId: stA.archiveId, mode: stA.mode, text: DriveApp.getFileById(stA.archiveId).getBlob().getDataAsString() } : { ok: true, archiveId: '', text: '' }); }
    if (a === 'evidence') return out_(readEvidence_(p.primaryId || ''));
    if (a === 'migration_status') return out_({ ok: true, state: migrationSummary_(readMigrationState_()), freeze: readFreeze_() });
    if (a === 'state') return out_({ ok: true, state: readState_() });
    if (a === 'receipts') return out_({ ok: true, text: readReceipts_() });
    if (a === 'rules') { var R = readRules_(); return out_({ ok: R.status !== 'UNAVAILABLE', rules: R }); }
    if (a === 'runs') return out_({ ok: true, runs: readRuns_() });
    if (a === 'events') return out_({ ok: true, events: readEvents_(p.primaryId || '', +(p.limit || 200)) });
    if (a === 'interview_notes') return out_(readInterviewNotes_(p.primaryId || ''));
    if (a === 'documents') return out_(readJobDocuments_());
    if (a === 'document_text') return out_(readDocumentText_(p.fileId || ''));
    if (a === 'discovery_requests') return out_(readDiscoveryRequests_(p.primaryId || '', +(p.limit || 100)));
    if (a === 'request_result') return out_(findRequestResult_(p.requestId || ''));
    if (a === 'receipt_index') return out_(receiptIndexSummary_(p.requestId || ''));
    if (a === 'verify_pending') return out_(verifyNow_());
    if (a === 'canonical_rules') return out_(readCanonicalRules_());
    if (a === 'scoring') return out_(readScoringModel_());
    if (a === 'submit') { var body; try { body = JSON.parse(p.payload || ''); } catch (x) { return out_({ ok: false, error: 'payload must be URL-encoded JSON: ' + x.message }); } return out_(dispatchWrite_(body)); }
    if (a === 'automation') return out_(automationStatus_());
    if (a === 'writer_status') return out_(writerStatus_());
    if (a === 'process_queue') return out_(processWriterQueue());
    return out_({ ok: false, error: 'unknown action ' + a });
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err), errorStack: errorStack_(err) }); }
}
function doPost(e) {
  var req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return out_({ ok: false, error: 'bad JSON' }); }
  if (!auth_(req.key)) return out_({ ok: false, error: 'bad key' });
  try {
    if (req.action === 'state') { writeState_(req.state || {}); return out_({ ok: true }); }
    return out_(dispatchWrite_(req));
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err), errorStack: errorStack_(err), docAccess: docAccessSummary_() }); }
}
function auth_(k) { return PASSPHRASE && k === PASSPHRASE; }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
/** One entry point for every canonical write (HTTP POST, GET submit, Drive queue). The key is checked by the HTTP layer only. */
var WRITE_ACTIONS = ['intake', 'ruling', 'data_discovery', 'upsert_application', 'interview_note', 'approve_resume', 'save_rules', 'save_scoring_model', 'undo_ruling', 'install_automation', 'batch', 'rotate_receipts', 'correct_receipts', 'migration', 'freeze_writer', 'unfreeze_writer', 'restore_archived'];
function dispatchWrite_(req) {
  req = req || {};
  var a = String(req.action || '');
  if (a === 'intake') return applyIntakeToMaster_(req);
  if (a === 'ruling') { var shapeErr = requestShapeError_(req); if (shapeErr) return { ok: false, mode: 'REJECTED_SCHEMA', error: shapeErr }; return applyRulingToMaster_(req.ruling); }
  if (a === 'data_discovery') return applyDataDiscoveryRequest_(req);
  if (a === 'upsert_application') return applyUpsertToMaster_(req.event || req);
  if (a === 'interview_note') return saveInterviewNote_(req.note || req);
  if (a === 'approve_resume') return approveResume_(req.selection || req);
  if (a === 'save_rules') return saveCanonicalRules_(req.rules || req);
  if (a === 'save_scoring_model') return saveScoringModel_(req.model || req);
  if (a === 'undo_ruling') return undoLastRuling_(req.undo || req);
  if (a === 'rotate_receipts') return rotateReceipts_(req);
  if (a === 'migration') return migration_(req);
  if (a === 'freeze_writer') return setFreeze_(req, true);
  if (a === 'unfreeze_writer') return setFreeze_(req, false);
  if (a === 'restore_archived') return restoreArchived_(req);
  if (a === 'correct_receipts') return correctReceipts_(req);
  if (a === 'install_automation') { var ir = installAutomation(); return { ok:true, action:'install_automation', result:ir || null, installedAt:new Date().toISOString() }; }
  if (a === 'batch') {
    var list = Array.isArray(req.requests) ? req.requests : [];
    if (!list.length) return { ok: false, error: 'batch needs requests[]' };
    if (list.length > 50) return { ok: false, error: 'batch too large (max 50 requests)' };
    // Shape check first, before anything opens the master: a malformed sub-request rejects the whole batch at once.
    var malformed = [];
    list.forEach(function (sub, ix) {
      var err = !sub || typeof sub !== 'object' ? 'request must be a JSON object'
        : sub.action === 'batch' || WRITE_ACTIONS.indexOf(sub.action) < 0 ? 'unsupported action in batch: ' + sub.action
        : requestShapeError_(sub);
      if (err) malformed.push({ index: ix, ok: false, error: err });
    });
    if (malformed.length) return { ok: false, mode: 'REJECTED_SCHEMA', attempted: 0, error: malformed.length + ' of ' + list.length + ' requests are malformed; nothing was applied', results: malformed };
    var allRulings = list.every(function (sub) { return sub.action === 'ruling'; });
    if (allRulings) return applyRulingBatchToMaster_(list);
    return serialBatch_(list);
  }
  return { ok: false, error: 'unknown action ' + a + ' (expected one of ' + WRITE_ACTIONS.join(', ') + ')' };
}

/** Absolute time (ms) after which a serial batch starts no further sub-request; 0 means no deadline. The queue worker sets
 *  it so a claimed request stops cleanly, with a RESULT, before the 6-minute Apps Script limit can kill the execution. */
var WRITE_DEADLINE_AT_ = 0;
function setWriteDeadline_(t) { WRITE_DEADLINE_AT_ = +t || 0; }

/** Pure: request-shape check that needs no master read. Returns an error string, or '' when the shape is acceptable. */
function requestShapeError_(req) {
  if (String(req && req.action || '') !== 'ruling') return '';
  var r = req.ruling;
  if (!r || typeof r !== 'object' || Array.isArray(r)) {
    var flat = ['primaryId', 'primary_id', 'requestId', 'request_id', 'kind', 'fields', 'actor'].filter(function (k) { return req[k] !== undefined; });
    return 'ruling fields must be nested: {"action":"ruling","ruling":{"primaryId":"…","requestId":"…","kind":"…","actor":"…","fields":{…}}}' + (flat.length ? '; found at top level: ' + flat.join(', ') : '');
  }
  if (!String(r.primaryId || '').trim()) return 'ruling.primaryId is required' + (r.primary_id !== undefined ? ' (found primary_id; the key is primaryId)' : '');
  return '';
}

/**
 * Mixed batch: sub-requests run one at a time in this execution. It stops before a sub-request when the deadline has
 * passed or when the write fence refuses it (a second master write in one execution is always fenced). A fence on the first
 * sub-request means nothing ran, so the whole batch is returned as the fence and stays queued. Otherwise the batch ends
 * PARTIAL: the RESULT lists what ran and carries the not-attempted remainder, which is never re-run automatically.
 */
function serialBatch_(list) {
  var out = [], stoppedBy = '', stopReason = '';
  for (var i = 0; i < list.length; i++) {
    if (WRITE_DEADLINE_AT_ && Date.now() >= WRITE_DEADLINE_AT_) {
      if (!out.length) return { ok: false, mode: 'WRITE_FENCE', retryAfterMs: 60000, error: 'queue time budget reached before the batch started; it stays queued' };
      stoppedBy = 'TIME_BUDGET'; stopReason = 'queue time budget reached before request ' + i; break;
    }
    var r;
    try { r = dispatchWrite_(list[i]) || { ok: false, error: 'no result' }; }
    catch (e) { r = { ok: false, error: String(e && e.message || e), errorStack: errorStack_(e) }; }
    if (r.mode === 'WRITE_FENCE') {
      if (!out.length) return r;
      stoppedBy = 'WRITE_FENCE'; stopReason = r.error || 'write fence'; break;
    }
    r.index = i; out.push(r);
  }
  var notAttempted = [];
  for (var j = out.length; j < list.length; j++) notAttempted.push(j);
  var res = { ok: !notAttempted.length && out.every(function (x) { return x.ok; }), mode: 'SERIAL_MIXED_BATCH', results: out, attempted: out.length };
  if (notAttempted.length) {
    res.partial = true; res.stoppedBy = stoppedBy; res.notAttempted = notAttempted;
    res.error = 'PARTIAL: ran ' + out.length + ' of ' + list.length + ' requests (' + stopReason + '); the remainder was not attempted and is not re-run automatically';
    res.remainder = { action: 'batch', requests: notAttempted.map(function (k) { return list[k]; }) };
  }
  return res;
}


/* ================= fast ruling batch ================= */
/**
 * Applies a batch of ruling mutations against one master snapshot.
 * One lock, one master open, one save, one readback, one receipt append and one event-log append.
 * This is the high-throughput path used by Claude backlog ENRICH batches.
 */
function applyRulingBatchToMaster_(requests) {
  var started = Date.now(), t = { TOTAL_MS: 0, LOCK_WAIT_MS: 0, MASTER_READ_MS: 0, PLAN_MS: 0, MASTER_WRITE_MS: 0, READBACK_MS: 0, RECEIPT_MS: 0, EVENT_MS: 0 };
  var lock = LockService.getScriptLock(), lockStart = Date.now();
  lock.waitLock(30000);
  t.LOCK_WAIT_MS = Date.now() - lockStart;
  try {
    var readStart = Date.now();
    DOC_ACCESS_ = [];
    var modBefore = masterModified_();
    var M = openMaster_(), lines = M.lines, snapshot = lines.slice();
    t.MASTER_READ_MS = Date.now() - readStart;
    var fence = writeFence_(snapshot);
    if (fence) { t.TOTAL_MS = Date.now() - started; fence.timings = t; fence.docAccess = docAccessSummary_(); return fence; }

    var planStart = Date.now(), byPid = {}, duplicatePid = {}, seenBatchPid = {}, results = [], receipts = [], events = [], changed = [], identityArchive = null;
    for (var p = 0; p < lines.length; p++) {
      if (!/^\d+ \| /.test(lines[p])) continue;
      var cells = lines[p].split(' | '), pid0 = cells.length > 1 ? cells[1].trim() : '';
      if (!pid0) continue;
      if (byPid[pid0] !== undefined) duplicatePid[pid0] = true;
      else byPid[pid0] = p;
    }

    var replay = replayState_(), already = replay.done;
    var flexPolicy = readFlexPolicy_();

    for (var rix = 0; rix < requests.length; rix++) {
      var sub = requests[rix] || {}, ruling = sub.ruling || {}, pid = String(ruling.primaryId || '').trim(), requestId = String(ruling.requestId || '').trim();
      var base = { index: rix, primaryId: pid, requestId: requestId };
      if (!pid) { results.push({ index: rix, ok: false, error: 'no PRIMARY_ID in request' }); continue; }
      if (requestId && already[requestId]) { results.push({ index: rix, ok: true, mode: 'ALREADY_APPLIED', primaryId: pid, requestId: requestId }); continue; }
      if (requestId && replay.pending[requestId]) { results.push({ index: rix, ok: false, mode: 'PENDING_VERIFICATION', primaryId: pid, requestId: requestId, error: 'request already written and awaiting independent verification' }); continue; }
      if (duplicatePid[pid] || byPid[pid] === undefined) {
        var count = duplicatePid[pid] ? 2 : 0;
        if (!count && archivedPid_(pid)) { results.push({ index: rix, ok: false, mode: 'ARCHIVED_ROW', error: 'ARCHIVED_ROW: ' + pid + ' is terminal history in ' + ARCHIVE_NAME + '; POST restore_archived first (fail closed)' }); continue; }
        results.push({ index: rix, ok: false, error: 'identity not unique: ' + count + ' rows match ' + pid + ' (fail closed)' });
        continue;
      }
      if (seenBatchPid[pid]) {
        results.push({ index: rix, ok: false, error: 'duplicate PRIMARY_ID within batch: ' + pid + ' (split sequential mutations into separate requests)' });
        continue;
      }
      seenBatchPid[pid] = true;
      var li = byPid[pid], before = snapshot[li], mu = mutateRow(before, ruling, flexPolicy);
      if (!mu.ok) { results.push({ index: rix, ok: false, error: mu.error, primaryId: pid }); continue; }
      if (String(ruling.kind || '').toUpperCase() === 'IDENTITY') {
        if (!identityArchive) identityArchive = archiveRowsLive_();
        var conflict = identityConflicts_(lines, li, mu.after, ruling, identityArchive);
        if (conflict) { results.push({ index: rix, ok: false, mode: 'HOLD', error: conflict, primaryId: pid }); continue; }
      }
      mu.after = externalizeEvidence_(evidenceRouting_(), before, mu.after, String(ruling.actor || 'TIM').toUpperCase() + ':' + requestId, new Date().toISOString());
      lines[li] = mu.after;
      changed.push({ index: rix, lineIndex: li, before: before, after: mu.after, mutation: mu, ruling: ruling });
      results.push({ index: rix, ok: true, mode: 'PLANNED', primaryId: pid, requestId: requestId, changes: mu.changes });
    }

    t.PLAN_MS = Date.now() - planStart;
    if (!changed.length) {
      t.TOTAL_MS = Date.now() - started;
      return { ok: results.every(function (x) { return x.ok; }), mode: 'BATCH_RULING_NO_WRITE', results: results, timings: t, docAccess: docAccessSummary_(), flexPolicySource: flexPolicy._SOURCE || 'UNKNOWN', flexPolicyWarning: flexPolicy._WARNING || '' };
    }

    var modCheck = masterModified_();
    if (modCheck !== modBefore) {
      t.TOTAL_MS = Date.now() - started;
      return { ok: false, mode: 'BATCH_RULING_RETRY', error: 'master changed during request (' + modBefore + ' -> ' + modCheck + '); retry', results: results, timings: t, docAccess: docAccessSummary_() };
    }

    var writeStart = Date.now();
    var newCounts = recomputeCountsLine(lines), newEnd = recomputeEndLine(lines);
    flushEvidence_(evidenceRouting_());
    applyMasterEdits_(M, snapshot, changed.map(function (c) { return { index: c.lineIndex, text: c.after }; }).concat(masterTrailerEdits_(lines, newCounts, newEnd)));
    t.MASTER_WRITE_MS = Date.now() - writeStart;

    var executedAt = new Date().toISOString(), items = [];
    for (var z = 0; z < changed.length; z++) {
      var ch = changed[z], rr = ch.ruling, mm = ch.mutation, tpid = String(rr.primaryId || '').trim();
      var receipt = {
        RECEIPT: 'STATE_CHANGE_RECEIPT', REQUEST_ID: rr.requestId || '', EXECUTED_BY: 'Pipeline Explorer Apps Script (runs as Tim)',
        TARGET_CANONICAL_ID: tpid, COMPANY: mm.company, TITLE: mm.title, REQ_ID: mm.req,
        BEFORE_APPLICATION_STATE: mm.beforeState, AFTER_APPLICATION_STATE: mm.afterState,
        BEFORE_POSTING_STATE: 'n/a', AFTER_POSTING_STATE: 'n/a',
        CANONICAL_ID_PRESERVED: 'YES', HISTORY_PRESERVED: 'YES', COUNTS_UPDATED: 'YES', READBACK_VERIFIED: 'PENDING',
        TARGET_FILE_ID: MASTER_ID, COMPLETION_STATUS: 'PENDING_VERIFICATION', MASTER_MODIFIED_BEFORE: modBefore,
        EXECUTED_AT: executedAt, CHANGES: mm.changes, BATCH_MODE: 'MULTI_ROW_SINGLE_COMMIT', FLEX_POLICY_SOURCE: flexPolicy._SOURCE || 'UNKNOWN', FLEX_POLICY_WARNING: flexPolicy._WARNING || ''
      };
      receipts.push(receipt);
      items.push({ pid: tpid, op: 'REPLACE', before: ch.before, after: ch.after });
      events.push({ type: 'TIM_RULING', primaryId: tpid, actor: rr.actor || 'TIM', ts: executedAt, requestId: rr.requestId || '', kind: rr.kind || '', code: rr.code || '', note: rr.note || '', before: ch.before, after: ch.after, verified: false, verification: 'PENDING', batchMode: 'MULTI_ROW_SINGLE_COMMIT' });
      results[ch.index] = { index: ch.index, ok: true, mode: 'BATCH_RULING', verification: 'PENDING', primaryId: tpid, requestId: rr.requestId || '', before: ch.before, after: ch.after, changes: mm.changes, flexPolicySource: flexPolicy._SOURCE || 'UNKNOWN', flexPolicyWarning: flexPolicy._WARNING || '' };
    }

    var receiptStart = Date.now();
    var writeId = stageVerification_('BATCH', items, receipts, newCounts, executedAt);
    t.RECEIPT_MS = Date.now() - receiptStart;
    var eventStart = Date.now();
    events.forEach(function (e) { e.writeId = writeId; });
    appendEvents_(events);
    t.EVENT_MS = Date.now() - eventStart;
    t.TOTAL_MS = Date.now() - started;
    return { ok: results.every(function (x) { return x && x.ok; }), mode: 'BATCH_RULING_SINGLE_COMMIT', verification: 'PENDING', writeId: writeId, processed: changed.length, counts: newCounts, results: results, timings: t, docAccess: docAccessSummary_(), flexPolicySource: flexPolicy._SOURCE || 'UNKNOWN', flexPolicyWarning: flexPolicy._WARNING || '' };
  } finally { lock.releaseLock(); }
}

/**
 * Request IDs whose receipt proves a successful write: only these may be skipped as ALREADY_APPLIED.
 * Receipts are blocks from `RECEIPT=<TYPE>` to `END <TYPE>`; Docs getText() separates lines inside a block with \r and
 * blocks with \n, so both are line breaks. A block counts only when it is complete (start and matching END), has a
 * non-empty REQUEST_ID, COMPLETION_STATUS=COMPLETE and, for state-change receipts (or any receipt that records it),
 * READBACK_VERIFIED=YES. FAILED, HOLD, INCOMPLETE, STATE_CHANGE_NEEDS_RESOLUTION, missing status and malformed or
 * truncated blocks never count, so those requests are retried normally. Any one qualifying block is enough, unless an
 * appended RECEIPT_CORRECTION with CORRECTION=FALSE_COMPLETE names the request (a proven-false COMPLETE never counts).
 */
function completedReceiptRequestIds_(text) {
  var done = {}, block = null, lines = String(text || '').split(/\r\n|\r|\n/);
  var KEYS = ['RECEIPT', 'REQUEST_ID', 'COMPLETION_STATUS', 'READBACK_VERIFIED', 'CORRECTION'], falseIds = {};
  function finish(b) {
    if (!b || b.bad) return;
    var rid = String(b.f.REQUEST_ID || '').trim();
    if (rid && b.f.RECEIPT === 'RECEIPT_CORRECTION' && b.f.CORRECTION === 'FALSE_COMPLETE') { falseIds[rid] = true; return; }
    if (!rid || b.f.COMPLETION_STATUS !== 'COMPLETE') return;
    var needsReadback = b.f.RECEIPT === 'STATE_CHANGE_RECEIPT' || b.f.READBACK_VERIFIED !== undefined;
    if (needsReadback && b.f.READBACK_VERIFIED !== 'YES') return;
    done[rid] = true;
  }
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (/^RECEIPT=/.test(line)) { block = { f: {}, bad: false }; }   // a new start abandons any unterminated block
    if (!block) continue;
    var end = line.match(/^END (\S+)$/);
    if (end) { if (end[1] === block.f.RECEIPT) finish(block); block = null; continue; }
    var eq = line.indexOf('=');
    if (eq <= 0) continue;
    var k = line.slice(0, eq), v = line.slice(eq + 1).trim();
    if (KEYS.indexOf(k) >= 0) { if (block.f[k] !== undefined && block.f[k] !== v) block.bad = true; block.f[k] = v; }
  }
  Object.keys(falseIds).forEach(function (rid) { delete done[rid]; });
  return done;
}

function receiptBlock_(r) { return Object.keys(r).map(function (k) { return k + '=' + (typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]); }).join('\n') + '\nEND ' + r.RECEIPT; }
/** Appends receipts to the receipt log: the rotated plain-text log (synchronous Drive write) or, before rotation, the legacy Google Doc. */
function appendReceipts_(list) {
  if (!list || !list.length) return;
  var file = receiptsFile_();
  if (file && !isGoogleDoc_(file)) {
    var cur = file.getBlob().getDataAsString();
    file.setContent((cur ? cur.replace(/\n*$/, '\n\n') : '') + list.map(receiptBlock_).join('\n\n') + '\n');
    return;
  }
  if (!file) file = findOrCreate_(RECEIPTS_DOC_NAME, 'text', '\n');
  if (!isGoogleDoc_(file)) return appendReceipts_(list);
  var doc = withDocRetry_('RECEIPTS_OPEN', function () { return DocumentApp.openById(file.getId()); }), body = doc.getBody();
  for (var i = 0; i < list.length; i++) { body.appendParagraph(receiptBlock_(list[i])); body.appendParagraph(''); }
  doc.saveAndClose();
}

function appendEvents_(list) {
  if (!list || !list.length) return;
  var file = findOrCreate_(EVENT_LOG_NAME, 'text', '\n'), cur = file.getBlob().getDataAsString(), out = [];
  for (var i = 0; i < list.length; i++) {
    var rec = list[i] || {};
    if (!rec.ts) rec.ts = new Date().toISOString();
    out.push(JSON.stringify(rec));
  }
  file.setContent((cur ? cur.replace(/\n*$/, '\n') : '') + out.join('\n') + '\n');
}

/* ================= request-result recovery ================= */
function findRequestResult_(requestId) {
  var rid = String(requestId || '').trim();
  if (!rid) return { ok:false, found:false, error:'requestId required' };

  var idx = readIndex_();
  if (idx && idx.requests[rid] && idx.requests[rid].s === 'PENDING') { verifyNow_(); idx = readIndex_(); }
  if (idx && idx.requests[rid]) return { ok:true, found:true, requestId:rid, source:'index', status:idx.requests[rid].s, durable:idx.requests[rid].s === 'COMPLETE', entry:idx.requests[rid] };

  var receipts = readReceipts_();
  if (receipts && receipts.indexOf('REQUEST_ID=' + rid) >= 0) {
    return { ok:true, found:true, requestId:rid, source:'receipts' };
  }

  var events = readEvents_('', 1000);
  for (var i = 0; i < events.length; i++) {
    if (String(events[i].requestId || '') === rid) {
      return { ok:true, found:true, requestId:rid, source:'events', event:events[i] };
    }
  }
  return { ok:true, found:false, requestId:rid };
}

/* ================= transient Google document access ================= */
/* Bounded retry for READ-ONLY opens/reads of the master and receipts documents. Writes, saves and appends are never retried.
 * Only transient Docs/Drive service errors are retried (after ~1s, 2s, 4s: at most 3 retries); any other error, or exhaustion,
 * throws exactly as before, so every caller still fails closed. DOC_ACCESS_ records per-operation telemetry for the result. */
var DOC_RETRY_DELAYS_MS = [1000, 2000, 4000];
var DOC_ACCESS_ = [];
function docSleep_(ms) { Utilities.sleep(ms); }
function isTransientDocError_(e) {
  var m = String(e && e.message || e);
  if (/lock timeout/i.test(m)) return false;
  return /document is inaccessible|please try again later|service error|service unavailable|server error|internal error|backend error|temporarily unavailable/i.test(m);
}
function withDocRetry_(op, fn) {
  var started = Date.now(), attempt = 0, first = '';
  for (;;) {
    attempt++;
    try {
      var v = fn();
      DOC_ACCESS_.push({ op: op, attempts: attempt, status: attempt === 1 ? 'INITIAL_SUCCESS' : 'RECOVERED_BY_RETRY', ms: Date.now() - started, error: first });
      return v;
    } catch (e) {
      var msg = String(e && e.message || e);
      if (!first) first = msg;
      if (!isTransientDocError_(e)) { DOC_ACCESS_.push({ op: op, attempts: attempt, status: 'DETERMINISTIC_FAILURE', ms: Date.now() - started, error: msg }); throw e; }
      if (attempt > DOC_RETRY_DELAYS_MS.length) {
        DOC_ACCESS_.push({ op: op, attempts: attempt, status: 'RETRY_EXHAUSTED', ms: Date.now() - started, error: msg });
        throw new Error(msg + ' [' + op + ': retry exhausted after ' + attempt + ' attempts]');
      }
      docSleep_(DOC_RETRY_DELAYS_MS[attempt - 1]);
    }
  }
}
function docAccessSummary_() {
  var rank = { INITIAL_SUCCESS: 0, RECOVERED_BY_RETRY: 1, DETERMINISTIC_FAILURE: 2, RETRY_EXHAUSTED: 3 }, status = 'INITIAL_SUCCESS', retries = 0;
  DOC_ACCESS_.forEach(function (x) { retries += x.attempts - 1; if (rank[x.status] > rank[status]) status = x.status; });
  return { status: status, retries: retries, ops: DOC_ACCESS_.slice() };
}
function masterModified_() { return withDocRetry_('MASTER_META', function () { return DriveApp.getFileById(MASTER_ID).getLastUpdated().toISOString(); }); }
/** Fresh open of the master for a transaction: the handle used for writes plus a snapshot of every paragraph's text. */
function openMaster_() {
  return withDocRetry_('MASTER_READ', function () {
    var doc = DocumentApp.openById(MASTER_ID), body = doc.getBody(), paras = body.getParagraphs(), lines = [];
    for (var i = 0; i < paras.length; i++) lines.push(paras[i].getText());
    return { doc: doc, body: body, paras: paras, lines: lines };
  });
}
/** Independent fresh read of every master paragraph's text (post-write readback or read-only consumers). */
function readMasterLines_(op) {
  return withDocRetry_(op || 'MASTER_READBACK', function () {
    var p = DocumentApp.openById(MASTER_ID).getBody().getParagraphs(), out = [];
    for (var i = 0; i < p.length; i++) out.push(p[i].getText());
    return out;
  });
}

/* ================= durable write verification ================= */
/* Google Docs edits made by an execution are only persisted when that execution ends, and a re-open of the document inside
 * the same execution returns its own unsaved edits. An execution therefore can NOT certify its own write (2026-10-05:
 * five receipts said COMPLETE/READBACK_VERIFIED=YES while the master never changed).
 * Contract:  WRITE (one master write per execution) -> provisional receipt PENDING_VERIFICATION + pending entry in the
 * index -> execution ends -> a LATER execution reads the master fresh -> COMPLETE (or FAILED / NEEDS_RESOLUTION) receipt.
 * The index (a Drive text file, written synchronously by Drive, not by the Docs flush) is the authority for replay
 * protection; receipts are the human-readable log. Writes are fenced: no new master write is planned while an earlier one
 * is still unverified, and never twice in one execution. */
var RECEIPT_INDEX_NAME = 'PIPELINE_RECEIPT_INDEX.json';
var VERIFY_GRACE_MS = 120000;
var MASTER_WRITTEN_IN_EXECUTION_ = false;

/** Pure 53-bit string hash (cyrb53) rendered as hex + length; used to compare rows without storing their full text. */
function textHash_(s) {
  s = String(s == null ? '' : s);
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (var i = 0; i < s.length; i++) { var ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16) + ':' + s.length;
}
function emptyIndex_() { return { version: 1, updatedAt: '', rotations: [], requests: {}, pending: [] }; }
/** Reads the index. Missing file -> null (legacy mode, before the first rotation). Unreadable -> throws (fail closed). */
function readIndex_() {
  var it = folder_().getFilesByName(RECEIPT_INDEX_NAME);
  if (!it.hasNext()) return null;
  var raw = it.next().getBlob().getDataAsString(), d;
  try { d = JSON.parse(raw); } catch (e) { throw new Error('receipt index unreadable (fail closed): ' + e.message); }
  if (!d || typeof d !== 'object' || !d.requests || !Array.isArray(d.pending)) throw new Error('receipt index malformed (fail closed)');
  if (!Array.isArray(d.rotations)) d.rotations = [];
  return d;
}
function writeIndex_(d) {
  d.updatedAt = new Date().toISOString();
  var f = findOrCreate_(RECEIPT_INDEX_NAME, 'text', '{}');
  f.setContent(JSON.stringify(d));
}
/** Request IDs that must not be re-applied: proven COMPLETE (receipt log or index) or still awaiting verification. */
function replayState_() {
  var done = completedReceiptRequestIds_(readReceipts_()), pending = {}, idx = readIndex_();
  if (idx) Object.keys(idx.requests).forEach(function (rid) {
    var s = idx.requests[rid] && idx.requests[rid].s;
    if (s === 'COMPLETE') done[rid] = true;
    else if (s === 'PENDING') pending[rid] = true;
    else if (s === 'FALSE_COMPLETE' || s === 'NOT_PERSISTED') delete done[rid];
  });
  return { done: done, pending: pending };
}

function rowsByPid_(lines) {
  var m = {};
  for (var i = 0; i < lines.length; i++) if (/^\d+ \| /.test(lines[i])) { var c = lines[i].split(' | '), pid = c.length > 1 ? c[1].trim() : ''; if (pid) (m[pid] = m[pid] || []).push(lines[i]); }
  return m;
}
function countsLineOf_(lines) { for (var i = 0; i < lines.length; i++) if (/^COUNTS:/.test(lines[i])) return lines[i]; return ''; }
/** Pure: decide one pending write against a fresh master snapshot that was read in a DIFFERENT execution. */
function classifyPendingWrite_(p, lines, nowMs, graceMs) {
  var byPid = rowsByPid_(lines), countsOk = textHash_(countsLineOf_(lines)) === p.counts;
  var items = p.items.map(function (it) {
    var cur = byPid[it.pid] || [];
    if (cur.length > 1) return { pid: it.pid, state: 'AMBIGUOUS' };
    var h = cur.length ? textHash_(cur[0]) : '';
    if (h === it.a) return { pid: it.pid, state: 'PERSISTED' };
    if (it.op === 'INSERT' ? !cur.length : h === it.b) return { pid: it.pid, state: 'NOT_YET' };
    return { pid: it.pid, state: 'CHANGED' };
  });
  var every = function (s) { return items.every(function (x) { return x.state === s; }); };
  var any = function (s) { return items.some(function (x) { return x.state === s; }); };
  var young = nowMs - Date.parse(p.writtenAt) < graceMs;
  if (every('PERSISTED') && countsOk) return { decision: 'COMPLETE', items: items, countsOk: true };
  if (any('NOT_YET') && young) return { decision: 'WAIT', items: items, countsOk: countsOk };
  if (every('NOT_YET')) return { decision: 'NOT_PERSISTED', items: items, countsOk: countsOk };
  return { decision: 'NEEDS_RESOLUTION', items: items, countsOk: countsOk };
}
var RUN_WRITE_STATUS_ = { COMPLETE: 'COMPLETE', NOT_PERSISTED: 'FAILED/MASTER_NOT_PERSISTED', NEEDS_RESOLUTION: 'NEEDS_RESOLUTION' };
var VERIFY_STATUS_ = { COMPLETE: 'COMPLETE', NOT_PERSISTED: 'FAILED', NEEDS_RESOLUTION: 'STATE_CHANGE_NEEDS_RESOLUTION' };
/** Final receipts for a decided pending write. Pure. */
function verifiedReceipts_(p, v, verifiedAt) {
  return p.receipts.map(function (r) {
    var out = {}; Object.keys(r).forEach(function (k) { out[k] = r[k]; });
    out.COMPLETION_STATUS = v.decision === 'COMPLETE' ? (r.INTENDED_COMPLETION_STATUS || 'COMPLETE') : VERIFY_STATUS_[v.decision];
    if (out.WRITE_VERIFIED !== undefined) out.WRITE_VERIFIED = v.decision === 'COMPLETE' ? 'YES' : 'NO';
    if (out.READBACK_VERIFIED !== undefined || out.RECEIPT === 'STATE_CHANGE_RECEIPT') out.READBACK_VERIFIED = v.decision === 'COMPLETE' ? 'YES' : 'NO';
    out.VERIFICATION = 'POST_EXECUTION_INDEPENDENT';
    out.VERIFICATION_RESULT = v.decision;
    if (v.decision === 'NOT_PERSISTED') out.FINDING = 'MASTER_NOT_PERSISTED';
    if (v.decision === 'NEEDS_RESOLUTION') out.VERIFICATION_DETAIL = JSON.stringify({ countsOk: v.countsOk, items: v.items });
    out.WRITE_ID = p.writeId; out.WRITE_EXECUTED_AT = p.writtenAt; out.VERIFIED_AT = verifiedAt;
    return out;
  });
}
/**
 * Verifies every pending write against a fresh read. Refuses to run in an execution that wrote the master (its reads
 * would see its own unsaved edits). lines: a master snapshot read in THIS execution before any write (optional).
 */
function verifyPendingWrites_(lines) {
  if (MASTER_WRITTEN_IN_EXECUTION_) return { ok: false, skipped: 'SAME_EXECUTION_AS_WRITE', stillPending: [] };
  var idx = readIndex_();
  if (!idx || !idx.pending.length) return { ok: true, decided: [], stillPending: [] };
  lines = lines || readMasterLines_('VERIFY_READ');
  var now = Date.now(), at = new Date(now).toISOString(), keep = [], decided = [], receipts = [], events = [], idx0 = idx.pending.slice();
  idx.pending.forEach(function (p) {
    var v = classifyPendingWrite_(p, lines, now, VERIFY_GRACE_MS);
    if (v.decision === 'WAIT') { keep.push(p); return; }
    var finals = verifiedReceipts_(p, v, at);
    receipts = receipts.concat(finals);
    p.requestIds.forEach(function (rid) { if (rid) idx.requests[rid] = { s: v.decision === 'COMPLETE' ? 'COMPLETE' : v.decision, at: at, w: p.writeId }; });
    decided.push({ writeId: p.writeId, kind: p.kind, decision: v.decision, requestIds: p.requestIds, items: v.items });
    events.push({ type: 'WRITE_VERIFICATION', ts: at, writeId: p.writeId, kind: p.kind, decision: v.decision, requestIds: p.requestIds, writtenAt: p.writtenAt });
  });
  if (!decided.length) return { ok: true, decided: [], stillPending: keep.map(function (p) { return p.writeId; }) };
  idx.pending = keep;
  writeIndex_(idx);              // the authority first: replay protection reflects the verdict even if the log append fails
  appendReceipts_(receipts);
  appendEvents_(events);
  // Intake telemetry: a run is not "written" until verified. Record the durable verdict beside its run.
  decided.forEach(function (d) {
    if (d.kind !== 'INTAKE') return;
    var p0 = (idx0.filter(function (p) { return p.writeId === d.writeId; })[0] || {}), runId = ((p0.receipts || [])[0] || {}).SCOUT_RUN_ID || '';
    appendRun_({ RECORD_TYPE: 'WRITE_VERIFICATION', SCOUT_RUN_ID: runId, WRITE_ID: d.writeId, WRITE_STATUS: RUN_WRITE_STATUS_[d.decision], VERIFIED_AT: at, PRIMARY_IDS: d.items.map(function (x) { return x.pid; }) });
  });
  return { ok: true, decided: decided, stillPending: keep.map(function (p) { return p.writeId; }) };
}
/** Run at the start of every master write, on the snapshot that write just read. Returns a refusal or null. */
function writeFence_(lines) {
  var fz = readFreeze_();
  if (fz) return { ok: false, mode: 'WRITE_FENCE', frozen: true, retryAfterMs: 300000, error: 'Writer frozen for a governed migration: ' + (fz.reason || '') + ' (requests stay queued)' };
  if (MASTER_WRITTEN_IN_EXECUTION_) return { ok: false, mode: 'WRITE_FENCE', retryAfterMs: 60000, error: 'this execution already wrote the master; the next write must run in a new execution after verification' };
  var v = verifyPendingWrites_(lines);
  if (v.stillPending.length) return { ok: false, mode: 'WRITE_FENCE', retryAfterMs: 30000, pendingWrites: v.stillPending, error: 'an earlier master write is not yet independently verified; retry after it is' };
  return null;
}
/** Records a committed write as PENDING_VERIFICATION: index entry first (authority), then the provisional receipts. */
function stageVerification_(kind, items, receipts, countsLine, writtenAt) {
  var idx = readIndex_() || emptyIndex_();
  var writeId = 'W-' + writtenAt.replace(/[^0-9]/g, '').slice(0, 17) + '-' + textHash_(JSON.stringify(items)).slice(0, 6);
  var rids = receipts.map(function (r) { return String(r.REQUEST_ID || ''); });
  idx.pending.push({ writeId: writeId, kind: kind, writtenAt: writtenAt, counts: textHash_(countsLine), requestIds: rids,
    items: items.map(function (x) { return { pid: x.pid, op: x.op || 'REPLACE', b: x.op === 'INSERT' ? '' : textHash_(x.before), a: textHash_(x.after) }; }), receipts: receipts });
  rids.forEach(function (rid) { if (rid) idx.requests[rid] = { s: 'PENDING', at: writtenAt, w: writeId }; });
  writeIndex_(idx);
  appendReceipts_(receipts.map(function (r) {
    var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; });
    o.COMPLETION_STATUS = 'PENDING_VERIFICATION'; o.READBACK_VERIFIED = 'PENDING'; o.VERIFICATION = 'POST_EXECUTION_REQUIRED'; o.WRITE_ID = writeId;
    return o;
  }));
  return writeId;
}
/** Applies paragraph edits located in the snapshot (no post-edit scan of every paragraph) and saves. No retry: a failed
 *  or unpersisted commit is caught by independent verification, never by a same-execution re-read. */
function applyMasterEdits_(M, snapshot, edits) {
  MASTER_WRITTEN_IN_EXECUTION_ = true;
  for (var i = 0; i < edits.length; i++) if (snapshot[edits[i].index] !== edits[i].text) M.paras[edits[i].index].setText(edits[i].text);
  M.doc.saveAndClose();
}
function masterTrailerEdits_(lines, newCounts, newEnd) {
  var out = [];
  for (var k = 0; k < lines.length; k++) {
    if (/^COUNTS:/.test(lines[k])) out.push({ index: k, text: newCounts });
    else if (newEnd && /^END V2_CURRENT_POPULATION_MASTER/.test(lines[k])) out.push({ index: k, text: newEnd });
  }
  return out;
}
/** First lines of a JS stack (Apps Script V8: "at fn (Code:LINE:COL)") so a failure names its line. */
function errorStack_(e) { return String(e && e.stack || '').split('\n').slice(0, 6).map(function (s) { return s.trim(); }).join(' | ').slice(0, 1200); }

/** GET verify_pending: verification in its own execution (never one that wrote the master). */
function verifyNow_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, busy: true, error: 'writer busy; verification will run on the next queue tick' };
  try { DOC_ACCESS_ = []; var v = verifyPendingWrites_(); v.docAccess = docAccessSummary_(); return v; } finally { lock.releaseLock(); }
}
function receiptIndexSummary_(rid) {
  var idx = readIndex_();
  if (!idx) return { ok: true, exists: false };
  var by = {}; Object.keys(idx.requests).forEach(function (k) { var st = idx.requests[k].s; by[st] = (by[st] || 0) + 1; });
  var out = { ok: true, exists: true, updatedAt: idx.updatedAt, rotations: idx.rotations, statusCounts: by, pending: idx.pending.map(function (p) { return { writeId: p.writeId, kind: p.kind, writtenAt: p.writtenAt, requestIds: p.requestIds, rows: p.items.length }; }) };
  if (rid) out.request = idx.requests[rid] || null;
  return out;
}

/* ================= receipt log rotation ================= */
/* The original receipts Google Doc (~1.1M chars) is past Google's 1,024,000-character document limit. Rotation freezes it as
 * an archive (renamed, same file ID), records every request it proves COMPLETE in the index, and starts a new receipt log
 * under the canonical name as a plain Drive text file (synchronous writes, no Docs flush, no Docs size limit). */
function receiptsFile_() { var it = folder_().getFilesByName(RECEIPTS_DOC_NAME); return it.hasNext() ? it.next() : null; }
function isGoogleDoc_(f) { return String(f.getMimeType()) === 'application/vnd.google-apps.document'; }
function rotateReceipts_(req) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var f = receiptsFile_();
    if (f && !isGoogleDoc_(f)) return { ok: true, mode: 'ALREADY_ROTATED', receiptLogId: f.getId() };
    if (!f) return { ok: false, error: 'no receipt log found under ' + RECEIPTS_DOC_NAME + ' (fail closed)' };
    var text = withDocRetry_('RECEIPTS_READ', function () { return DocumentApp.openById(f.getId()).getBody().getText(); });
    var done = completedReceiptRequestIds_(text), ids = Object.keys(done), at = new Date().toISOString();
    var idx = readIndex_() || emptyIndex_();
    ids.forEach(function (rid) { if (!idx.requests[rid]) idx.requests[rid] = { s: 'COMPLETE', at: at, src: 'LEGACY_RECEIPTS' }; });
    var archiveName = RECEIPTS_DOC_NAME + '__ARCHIVE_' + at.slice(0, 10);
    var rot = { rotatedAt: at, archiveId: f.getId(), archiveName: archiveName, archiveChars: text.length, completeIds: ids.length, by: String((req && req.actor) || 'TIM') };
    idx.rotations.push(rot);
    writeIndex_(idx);                                   // replay protection is carried by the index BEFORE the log moves
    f.setName(archiveName);
    var header = 'RECEIPT=RECEIPT_LOG_ROTATION\nROTATED_AT=' + at + '\nARCHIVE_FILE_ID=' + f.getId() + '\nARCHIVE_NAME=' + archiveName + '\nARCHIVE_CHARS=' + text.length + '\nCOMPLETE_REQUEST_IDS_INDEXED=' + ids.length + '\nINDEX_FILE=' + RECEIPT_INDEX_NAME + '\nEND RECEIPT_LOG_ROTATION\n\n';
    var nf = folder_().createFile(RECEIPTS_DOC_NAME, header, MimeType.PLAIN_TEXT);
    rot.receiptLogId = nf.getId(); writeIndex_(idx);
    appendEvents_([{ type: 'RECEIPT_LOG_ROTATED', ts: at, archiveId: f.getId(), archiveName: archiveName, receiptLogId: nf.getId(), completeIds: ids.length }]);
    return { ok: true, mode: 'ROTATED', rotation: rot };
  } finally { lock.releaseLock(); }
}

/* ================= receipt corrections ================= */
/* Appends (never edits) a RECEIPT_CORRECTION for a request whose COMPLETE receipt is proven false by a fresh read in this
 * execution: the event log's recorded result row is absent from the master. The index then stops treating it as done. */
function correctReceipts_(req) {
  var list = (req && req.corrections) || [], actor = String((req && req.actor) || 'TIM');
  if (!list.length) return { ok: false, error: 'corrections[] required' };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    if (MASTER_WRITTEN_IN_EXECUTION_) return { ok: false, error: 'cannot verify in an execution that wrote the master' };
    var lines = readMasterLines_('MASTER_READ'), byPid = rowsByPid_(lines), replay = replayState_(), events = readEvents_('', 5000);
    var idx = readIndex_() || emptyIndex_(), at = new Date().toISOString(), receipts = [], results = [], evOut = [];
    list.forEach(function (c) {
      var rid = String(c.requestId || '').trim(), ev = events.filter(function (e) { return e.requestId === rid && e.after; })[0];
      if (!rid || String(c.correction || '') !== 'FALSE_COMPLETE') { results.push({ requestId: rid, ok: false, error: 'requestId and correction FALSE_COMPLETE required' }); return; }
      if (!replay.done[rid]) { results.push({ requestId: rid, ok: false, error: 'no COMPLETE receipt to correct' }); return; }
      if (!ev) { results.push({ requestId: rid, ok: false, error: 'no event with the receipted result row; cannot prove' }); return; }
      var cur = byPid[ev.primaryId] || [];
      if (cur.length === 1 && cur[0] === ev.after) { results.push({ requestId: rid, ok: false, error: 'master contains the receipted result; receipt is not false' }); return; }
      var finding = cur.length === 1 && cur[0] === ev.before ? 'MASTER_NOT_PERSISTED' : 'RESULT_ROW_ABSENT';
      receipts.push({ RECEIPT: 'RECEIPT_CORRECTION', REQUEST_ID: rid, CORRECTS: 'STATE_CHANGE_RECEIPT COMPLETE', CORRECTION: 'FALSE_COMPLETE', FINDING: finding, DISPOSITION: 'SUPERSEDED',
        TARGET_CANONICAL_ID: ev.primaryId, ORIGINAL_EXECUTED_AT: ev.ts, EVIDENCE: 'Fresh master read ' + at + ': row ' + ev.primaryId + (finding === 'MASTER_NOT_PERSISTED' ? ' equals the pre-write row' : ' does not equal the receipted result') + ' (result hash ' + textHash_(ev.after) + ', current hash ' + (cur.length ? textHash_(cur[0]) : 'none') + ').',
        REPLACEMENT: 'Resubmit under a new request ID after independent verification is live.', REASON: String(c.reason || req.reason || ''), CORRECTED_BY: actor, CORRECTED_AT: at, COMPLETION_STATUS: 'CORRECTION' });
      idx.requests[rid] = { s: 'FALSE_COMPLETE', at: at, finding: finding };
      evOut.push({ type: 'RECEIPT_CORRECTION', ts: at, requestId: rid, primaryId: ev.primaryId, correction: 'FALSE_COMPLETE', finding: finding, actor: actor });
      results.push({ requestId: rid, ok: true, finding: finding });
    });
    if (receipts.length) { writeIndex_(idx); appendReceipts_(receipts); appendEvents_(evOut); }
    return { ok: results.every(function (r) { return r.ok; }), results: results };
  } finally { lock.releaseLock(); }
}

/* ================= master archive + evidence companion (Tim decision 2026-10-05, option A) ================= */
/* The canonical master keeps every live row and every decision-driving field (identity, bucket/disposition, application
 * state, salary, FLEX, degree, fit score/confidence, liveness, URLs). Two companions hold what was making it too large:
 *   V2_TERMINAL_ARCHIVE.txt     terminal rows (CLOSED_DEAD, DUPLICATE, DECLINED_BY_TIM, REJECTED_BY_EMPLOYER), verbatim,
 *                               read-only history; the Writer still dedupes intake/upserts against it.
 *   V2_EVIDENCE_COMPANION.jsonl narrative/evidence prose of live rows, keyed by PRIMARY_ID, append-only records
 *                               {pid, v, base, ts, src, f:{KEY:VALUE}}. A row's EVIDENCE_REF=EVC1:<v> names its head record;
 *                               resolve by following base links to 0 and merging oldest -> newest. Records not on the chain
 *                               (e.g. from a write whose master edit never persisted) are ignored, so the master pointer
 *                               decides which evidence is canonical. The companion is never a second master.
 * Both are plain Drive text files: synchronous writes, no Google Docs size limit. */
var ARCHIVE_NAME = 'V2_TERMINAL_ARCHIVE.txt';
var COMPANION_NAME = 'V2_EVIDENCE_COMPANION.jsonl';
var MIGRATION_STATE_NAME = 'PIPELINE_MIGRATION_STATE.json';
var FREEZE_NAME = 'WRITER_FREEZE.json';
var ARCHIVE_BUCKETS = ['CLOSED_DEAD', 'DUPLICATE', 'DECLINED_BY_TIM', 'REJECTED_BY_EMPLOYER'];
var EVIDENCE_SCHEMA = 'EVC1';
/** Narrative/evidence keys moved out of live rows (78 keys, 351K chars on 2026-10-05). Reviewed: none is read by decision logic. */
var EVIDENCE_KEYS = ['ANALYSIS_ACTOR', 'ANALYSIS_ASOF', 'ANALYSIS_BASIS', 'ANALYSIS_CONFIDENCE', 'ANALYSIS_NOTE', 'AUDIT_B2', 'AUDIT_B3', 'AUDIT_B4', 'AUDIT_B5', 'AUDIT_FINAL', 'AUDIT_FINAL2', 'CANDIDATE_COMPANY_SOURCE_URL_EVIDENCE_QUOTE', 'CLAUDE_CANDIDATE_LIVENESS_QUOTE', 'CLAUDE_COMP_ANALYSIS', 'CLAUDE_COMP_NOTE', 'CLAUDE_DEDUP_NOTE', 'CLAUDE_ENRICH_NOTE', 'CLAUDE_FLEX_ANALYSIS', 'CLAUDE_FLEX_NOTE', 'CLAUDE_GEOGRAPHY_NOTE', 'CLAUDE_NC_ANALYSIS', 'CLAUDE_REVIEW_EVIDENCE_QUOTE', 'CLAUDE_REVIEW_NOTE', 'CLAUDE_SCOPE_ANALYSIS', 'COMPANY_SOURCE_NOTE', 'COMPANY_SOURCE_URL_EVIDENCE_QUOTE', 'COMPANY_SOURCE_URL_NOTE', 'CONFLICTING_EVIDENCE', 'EMPLOYER_IDENTITY_EVIDENCE_QUOTE', 'EMPLOYER_REQ_ID_EVIDENCE_QUOTE', 'ENRICH_NOTE', 'EVIDENCE_IDENTITY_NOTE', 'EXPERIENCE_FIT_BASIS', 'FIT_BASIS', 'FIT_EVIDENCE', 'FIT_NOTE', 'FLEX_EVIDENCE', 'FLEX_NOTE', 'GROK_FIT_BASIS', 'GROK_FIT_EVIDENCE', 'GROK_NOTE', 'GROK_REPAIR_NOTE', 'IDENTITY_NOTE', 'INITIATING_URL_NOTE', 'LEGACY_FLOOR_AUDIT', 'LIVENESS_EVIDENCE_QUOTE', 'LIVENESS_EVIDENCE_QUOTE_2', 'LIVENESS_NOTE', 'LOCATION_CONFLICT_NOTE', 'LOCATION_EVIDENCE_QUOTE', 'LOCATION_NOTE', 'NC_NOTE', 'POSTING_REQUIREMENT_NOTE', 'PRIOR_DECLINE_REASON_CODE', 'PRIOR_DECLINE_REASON_TEXT', 'PRIOR_REOPEN_TRIGGER', 'PRIOR_SIGNAL', 'RECRUITER_SOURCE_EVIDENCE_QUOTE', 'REQ_ID_EVIDENCE', 'RESOLUTION_NOTE', 'RESOLVER_NOTE', 'SALARY_AGGREGATOR_EVIDENCE_QUOTE', 'SALARY_AGGREGATOR_NOTE', 'SALARY_AGGREGATOR_QUOTE', 'SALARY_AUDIT', 'SALARY_AUDIT_LOCATION', 'SALARY_EVIDENCE_QUOTE', 'SALARY_NOTE', 'SALARY_REASON', 'SCOPE_EVIDENCE_QUOTE', 'SCOPE_FIT_NOTE', 'SCOPE_NOTE', 'SCOPE_SUMMARY', 'SCORING_EVIDENCE', 'SCOUT_NOTES', 'TITLE_NOTE', 'WORK_ARRANGEMENT_EVIDENCE_QUOTE', 'WORK_ARRANGEMENT_NOTE'];
/** Decision-driving keys that stay inline even if a future key pattern would match. */
var EVIDENCE_KEEP = ['NOTE','TIM_NOTE','FLEX_BASIS','SALARY_BASIS','LIVENESS_BASIS','REOPEN_BASIS','PROPOSED_DISPOSITION','PROPOSED_DECLINE_REASON_CODE','PROPOSED_DECLINE_REASON_TEXT','RESEARCH_REQUEST',
  'APP_STATUS_EVIDENCE','APP_EVIDENCE','REJECTION_EVIDENCE','CLAUDE_APPLICATION_EVIDENCE','POSTING_STATUS_EVIDENCE','DECLINE_REASON_TEXT','DECLINE_REASON_CODE','REOPEN_TRIGGER','INVALID_REASON','NEVER_CONSIDER_REASON','EVIDENCE_REF'];
function isEvidenceKey_(k) {
  if (EVIDENCE_KEEP.indexOf(k) >= 0 || /_URL(_\d+)?$/.test(k) || /^(DEGREE|SALARY_BASE|TIM_|APP_|FLEX_CLASS|FLEX_MODIFIER)/.test(k)) return false;
  return EVIDENCE_KEYS.indexOf(k) >= 0 || /(^|_)(NOTE|NOTES|ANALYSIS|QUOTE)(_\d+)?$/.test(k);
}
function rowParts_(line) {
  var c = String(line).split(' | '); if (c.length < FIXED_N + 1 || !/^\d+$/.test(c[0])) return null;
  var pp = parsePayload(c.slice(FIXED_N).join(' | ')); return { fixed: c.slice(0, FIXED_N), lead: pp.lead, P: pp.payload, O: pp.order };
}
function evidenceRefOf_(line) { var r = rowParts_(line); var m = r && String(r.P.EVIDENCE_REF || '').match(/^EVC1:(\d+)$/); return m ? +m[1] : 0; }
/** Pure: strip evidence keys from one row. With moved fields the pointer becomes EVC1:<ref>; otherwise the row is unchanged. */
function splitRowEvidence_(line, ref) {
  var r = rowParts_(line); if (!r) return { line: line, fields: {}, count: 0 };
  var fields = {}, O = [], n = 0;
  r.O.forEach(function (k) { if (isEvidenceKey_(k)) { fields[k] = r.P[k]; n++; } else O.push(k); });
  if (!n) return { line: line, fields: {}, count: 0 };
  if (O.indexOf('EVIDENCE_REF') < 0) O.push('EVIDENCE_REF');
  r.P.EVIDENCE_REF = EVIDENCE_SCHEMA + ':' + ref;
  return { line: r.fixed.join(' | ') + ' | ' + buildPayload(r.lead, r.P, O), fields: fields, count: n };
}
function parseCompanion_(text) {
  var recs = [];
  String(text || '').split('\n').forEach(function (l, i) {
    if (!l.trim()) return; var o;
    try { o = JSON.parse(l); } catch (e) { throw new Error('evidence companion line ' + (i + 1) + ' unreadable (fail closed): ' + e.message); }
    if (o && o.pid) recs.push(o);
  });
  return recs;
}
/** Pure: merged evidence for pid at head version ref, following base links. null = broken chain (never guessed). */
function resolveEvidence_(recs, pid, ref) {
  var by = {}; recs.forEach(function (r) { if (r.pid === pid && !by[r.v]) by[r.v] = r; });
  var chain = [], v = ref, guard = 0;
  while (v && by[v] && guard++ < 10000) { chain.unshift(by[v]); v = by[v].base || 0; }
  if (v) return null;
  var out = {}; chain.forEach(function (r) { Object.keys(r.f || {}).forEach(function (k) { out[k] = r.f[k]; }); });
  return out;
}
function nextEvidenceVersion_(recs, pid) { var m = 0; recs.forEach(function (r) { if (r.pid === pid && r.v > m) m = r.v; }); return m + 1; }
function parseArchive_(text) {
  var rows = [], restored = {};
  String(text || '').split('\n').forEach(function (l) {
    if (/^\d+ \| /.test(l)) rows.push(l);
    else { var m = l.match(/^RESTORED\|([^|]+)\|(\d+)\|/); if (m) restored[m[1] + '#' + m[2]] = true; }
  });
  return rows.filter(function (l) { var c = l.split(' | '); return !restored[c[1].trim() + '#' + c[0]]; });
}
function rowKey_(line) { var c = String(line).split(' | '); return c[1].trim() + '#' + c[0]; }
/** Pure: the hydrated view = live rows with their evidence merged back + archived rows (read-only) under their bucket headings. */
function hydrateLines_(masterLines, archiveRows, recs) {
  var inMaster = {}, out = [];
  masterLines.forEach(function (l) {
    var r = rowParts_(l);
    if (!r) { out.push(l); return; }
    inMaster[rowKey_(l)] = true;
    var ref = evidenceRefOf_(l); if (!ref) { out.push(l); return; }
    var f = resolveEvidence_(recs, r.fixed[1].trim(), ref), O = r.O.slice();
    if (!f) { r.P.EVIDENCE_UNRESOLVED = 'YES'; O.push('EVIDENCE_UNRESOLVED'); }
    else Object.keys(f).forEach(function (k) { if (r.P[k] === undefined) { r.P[k] = f[k]; O.push(k); } });
    out.push(r.fixed.join(' | ') + ' | ' + buildPayload(r.lead, r.P, O));
  });
  var extra = archiveRows.filter(function (l) { return !inMaster[rowKey_(l)]; });
  if (extra.length) {
    var endAt = -1; for (var i = out.length - 1; i >= 0; i--) if (/^END V2_CURRENT_POPULATION_MASTER/.test(out[i])) { endAt = i; break; }
    if (endAt < 0) endAt = out.length;
    var block = [];
    ARCHIVE_BUCKETS.forEach(function (b) {
      var g = extra.filter(function (l) { return l.split(' | ')[4] === b; }); if (!g.length) return;
      block.push('=== ' + b + ' (' + g.length + ') ===');
      g.forEach(function (l) { block.push(l + '; ARCHIVE_STATE=ARCHIVED_TERMINAL'); });
    });
    extra.filter(function (l) { return ARCHIVE_BUCKETS.indexOf(l.split(' | ')[4]) < 0; }).forEach(function (l) { block.push(l + '; ARCHIVE_STATE=ARCHIVED_TERMINAL'); });
    Array.prototype.splice.apply(out, [endAt, 0].concat(block));
  }
  var counts = recomputeCountsLine(out), end = recomputeEndLine(out);
  return out.map(function (l) { return /^COUNTS:/.test(l) ? counts : (end && /^END V2_CURRENT_POPULATION_MASTER/.test(l) ? end : l); });
}
function archiveHeader_(at, sourceId) { return ['V2_TERMINAL_ARCHIVE (read-only terminal history; not a population)', 'CREATED_AT=' + at, 'SOURCE_MASTER_ID=' + sourceId, 'BUCKETS=' + ARCHIVE_BUCKETS.join(','), 'ROW FORMAT = the canonical master row format, verbatim; RESTORED|<PRIMARY_ID>|<INV>|<ts>|<requestId> lines mark rows moved back to the master.', '================================================================'].join('\n'); }
function companionHeader_(at, sourceId) { return JSON.stringify({ type: 'HEADER', schema: EVIDENCE_SCHEMA, createdAt: at, sourceMasterId: sourceId, rule: 'Narrative/evidence only. The canonical master is authoritative for identity, bucket/disposition, application state, salary, FLEX, degree, fit score/confidence, liveness and URLs. Resolve a row via EVIDENCE_REF=EVC1:<v>: follow base links to 0, merge oldest -> newest; ignore records off the chain.' }); }
function evidenceContractLine_(archiveId, companionId) {
  return 'EVIDENCE_COMPANION_2026-10-05 (schema EVC1): Narrative/evidence prose of live rows (notes, analyses, evidence quotes, prior/legacy audit text) is in ' + COMPANION_NAME + ' (Drive ' + companionId + ') keyed by PRIMARY_ID; a row\'s EVIDENCE_REF=EVC1:<n> names its head record (follow base links). Terminal history (' + ARCHIVE_BUCKETS.join(', ') + ') is read-only in ' + ARCHIVE_NAME + ' (Drive ' + archiveId + '); the Writer still dedupes against it. This master stays authoritative for identity, bucket/disposition, application state, salary, FLEX, degree, fit score/confidence, liveness and URLs. Full view: Writer GET action=master&hydrate=1.';
}

/** Pure migration plan: what the canonical master becomes, what goes to the archive and companion, and a full reconciliation. */
function planMasterMigration_(lines, opts) {
  opts = opts || {}; var at = opts.at || new Date().toISOString(), src = opts.src || 'MIGRATION';
  var archive = [], live = [], recs = [], target = [], removeKeys = {}, rows = 0;
  lines.forEach(function (l) {
    var r = rowParts_(l);
    if (!r) { target.push(l); return; }
    rows++;
    if (ARCHIVE_BUCKETS.indexOf(r.fixed[4].trim()) >= 0) { archive.push(l); removeKeys[rowKey_(l)] = true; return; }
    var s = splitRowEvidence_(l, 1);
    if (s.count) { recs.push({ pid: r.fixed[1].trim(), v: 1, base: 0, ts: at, src: src, f: s.fields }); live.push({ key: rowKey_(l), before: l, after: s.line }); }
    target.push(s.line);
  });
  var counts = recomputeCountsLine(target), end = recomputeEndLine(target);
  target = target.map(function (l) { return /^COUNTS:/.test(l) ? counts : (end && /^END V2_CURRENT_POPULATION_MASTER/.test(l) ? end : l); });
  var countsAt = -1; for (var i = 0; i < target.length; i++) if (/^COUNTS:/.test(target[i])) { countsAt = i; break; }
  var contract = evidenceContractLine_(opts.archiveId || '<archive-id>', opts.companionId || '<companion-id>');
  target.splice(countsAt >= 0 ? countsAt : 0, 0, contract);
  // reconciliation: every row is exactly once in target-live or archive; every moved field is recoverable exactly
  var problems = [], liveKeys = {}, pidsLive = {};
  target.forEach(function (l) { if (rowParts_(l)) { var k = rowKey_(l); if (liveKeys[k]) problems.push('duplicate live row ' + k); liveKeys[k] = true; pidsLive[l.split(' | ')[1].trim()] = (pidsLive[l.split(' | ')[1].trim()] || 0) + 1; } });
  Object.keys(pidsLive).forEach(function (p) { if (pidsLive[p] > 1) problems.push('PRIMARY_ID not unique among live rows: ' + p); });
  archive.forEach(function (l) { if (liveKeys[rowKey_(l)]) problems.push('row both live and archived ' + rowKey_(l)); });
  if (Object.keys(liveKeys).length + archive.length !== rows) problems.push('row count mismatch: ' + rows + ' != ' + Object.keys(liveKeys).length + ' + ' + archive.length);
  var byPid = {}; recs.forEach(function (r) { if (byPid[r.pid]) problems.push('duplicate evidence pid ' + r.pid); byPid[r.pid] = r; });
  live.forEach(function (x) {
    var b = rowParts_(x.before), a = rowParts_(x.after), f = resolveEvidence_(recs, a.fixed[1].trim(), evidenceRefOf_(x.after));
    if (!f) { problems.push('unresolvable evidence ' + x.key); return; }
    var rebuilt = {}; Object.keys(a.P).forEach(function (k) { if (k !== 'EVIDENCE_REF') rebuilt[k] = a.P[k]; }); Object.keys(f).forEach(function (k) { rebuilt[k] = f[k]; });
    var bk = Object.keys(b.P).sort(), rk = Object.keys(rebuilt).sort();
    if (bk.join('|') !== rk.join('|') || bk.some(function (k) { return b.P[k] !== rebuilt[k]; }) || a.fixed.join(' | ') !== b.fixed.join(' | ')) problems.push('evidence split not lossless for ' + x.key);
  });
  Object.keys(byPid).forEach(function (p) { if (!pidsLive[p]) problems.push('orphan evidence for ' + p); });
  var cnt = counts.match(/UNACCOUNTED=(\d+)/);
  if (!cnt || cnt[1] !== '0') problems.push('UNACCOUNTED not 0: ' + counts);
  var text = target.join('\n');
  return { target: target, archive: archive, live: live, records: recs, counts: counts, end: end, contract: contract,
    reconciliation: { ok: !problems.length, problems: problems.slice(0, 50), problemCount: problems.length, sourceRows: rows, liveRows: Object.keys(liveKeys).length, archivedRows: archive.length,
      rowsWithEvidence: recs.length, evidenceFields: recs.reduce(function (n, r) { return n + Object.keys(r.f).length; }, 0), sourceChars: lines.join('\n').length, targetChars: text.length,
      targetHash: textHash_(text), sourceHash: textHash_(lines.join('\n')), archiveHash: textHash_(archive.join('\n')), companionHash: textHash_(JSON.stringify(recs)) } };
}
/** Pure: ordered chunks of paragraph operations that turn the source into the target (removals first, then rewrites, then trailer). */
function migrationChunks_(plan, opts) {
  opts = opts || {}; var rs = opts.removeChunk || 60, ws = opts.rewriteChunk || 40, chunks = [];
  for (var i = 0; i < plan.archive.length; i += rs) chunks.push({ kind: 'REMOVE', items: plan.archive.slice(i, i + rs).map(function (l) { return { key: rowKey_(l), b: textHash_(l) }; }) });
  for (var j = 0; j < plan.live.length; j += ws) chunks.push({ kind: 'REWRITE', items: plan.live.slice(j, j + ws).map(function (x) { return { key: x.key, b: textHash_(x.before), a: textHash_(x.after), after: x.after }; }) });
  chunks.push({ kind: 'TRAILER', counts: plan.counts, end: plan.end, contract: plan.contract });
  return chunks.map(function (c, n) { c.n = n; return c; });
}
/** Pure: state of one chunk on a fresh read of the target document. DONE | PENDING (nothing landed) | MIXED. */
function chunkState_(chunk, lines) {
  var byKey = {}; lines.forEach(function (l) { if (rowParts_(l)) { var k = rowKey_(l); (byKey[k] = byKey[k] || []).push(l); } });
  if (chunk.kind === 'TRAILER') {
    var hasContract = lines.indexOf(chunk.contract) >= 0, countsOk = lines.some(function (l) { return l === chunk.counts; });
    return hasContract && countsOk ? 'DONE' : (!hasContract ? 'PENDING' : 'MIXED');
  }
  var done = 0, pending = 0;
  chunk.items.forEach(function (it) {
    var cur = byKey[it.key] || [];
    if (chunk.kind === 'REMOVE') { if (!cur.length) done++; else if (cur.length === 1 && textHash_(cur[0]) === it.b) pending++; }
    else { if (cur.length === 1 && textHash_(cur[0]) === it.a) done++; else if (cur.length === 1 && textHash_(cur[0]) === it.b) pending++; }
  });
  return done === chunk.items.length ? 'DONE' : (pending === chunk.items.length ? 'PENDING' : 'MIXED');
}

/* ----- impure: files, freeze, routing ----- */
function textFileByName_(name) { var it = folder_().getFilesByName(name); return it.hasNext() ? it.next() : null; }
function readMigrationState_() { var f = textFileByName_(MIGRATION_STATE_NAME); if (!f) return null; try { return JSON.parse(f.getBlob().getDataAsString()); } catch (e) { throw new Error('migration state unreadable (fail closed): ' + e.message); } }
function writeMigrationState_(s) { s.updatedAt = new Date().toISOString(); findOrCreate_(MIGRATION_STATE_NAME, 'text', '{}').setContent(JSON.stringify(s)); }
function readFreeze_() {
  var f = textFileByName_(FREEZE_NAME); if (!f) return null;
  try { var d = JSON.parse(f.getBlob().getDataAsString() || '{}'); return d && d.frozen ? d : null; } catch (e) { return { frozen: true, reason: 'freeze file unreadable (fail closed)' }; }
}
function setFreeze_(req, frozen) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var d = { frozen: !!frozen, reason: String((req && req.reason) || ''), by: String((req && req.actor) || 'TIM'), at: new Date().toISOString() };
    findOrCreate_(FREEZE_NAME, 'text', '{}').setContent(JSON.stringify(d));
    appendEvents_([{ type: frozen ? 'WRITER_FROZEN' : 'WRITER_UNFROZEN', ts: d.at, actor: d.by, reason: d.reason }]);
    return { ok: true, freeze: d };
  } finally { lock.releaseLock(); }
}
var EVIDENCE_ROUTING_ = null;
/** After the live cutover, every write routes narrative keys to the companion so the master cannot regrow. */
function evidenceRouting_() {
  if (EVIDENCE_ROUTING_) return EVIDENCE_ROUTING_;
  var st = readMigrationState_(), on = !!(st && st.mode === 'LIVE' && st.status === 'CUTOVER_COMPLETE');
  EVIDENCE_ROUTING_ = { active: on, companionId: on ? st.companionId : '', recs: null, appended: [] };
  return EVIDENCE_ROUTING_;
}
function loadCompanionRecs_(ctx) { if (!ctx.recs) ctx.recs = parseCompanion_(DriveApp.getFileById(ctx.companionId).getBlob().getDataAsString()); return ctx.recs; }
/** Route the narrative keys of a row being written into a new companion record; returns the row to write. */
function externalizeEvidence_(ctx, beforeLine, afterLine, src, at) {
  if (!ctx || !ctx.active) return afterLine;
  var s = splitRowEvidence_(afterLine, 0); if (!s.count) return afterLine;
  var pid = rowParts_(afterLine).fixed[1].trim(), recs = loadCompanionRecs_(ctx).concat(ctx.appended);
  var v = nextEvidenceVersion_(recs, pid), base = beforeLine ? evidenceRefOf_(beforeLine) : 0;
  ctx.appended.push({ pid: pid, v: v, base: base, ts: at, src: src, f: s.fields });
  return splitRowEvidence_(afterLine, v).line;
}
/** Persist routed evidence BEFORE the master commit (synchronous Drive write). If the master edit never persists, the
 *  record is simply off the chain and ignored. */
function flushEvidence_(ctx) {
  if (!ctx || !ctx.active || !ctx.appended.length) return 0;
  var f = DriveApp.getFileById(ctx.companionId), cur = f.getBlob().getDataAsString(), n = ctx.appended.length;
  f.setContent((cur ? cur.replace(/\n*$/, '\n') : '') + ctx.appended.map(function (r) { return JSON.stringify(r); }).join('\n') + '\n');
  ctx.recs = (ctx.recs || []).concat(ctx.appended); ctx.appended = [];
  return n;
}
/** GET evidence&primaryId=: the resolved narrative for one live row (companion chain at the master's EVIDENCE_REF). */
function readEvidence_(pid) {
  pid = String(pid || '').trim(); if (!pid) return { ok: false, error: 'primaryId required' };
  var st = readMigrationState_(); if (!st || st.mode !== 'LIVE' || st.status !== 'CUTOVER_COMPLETE') return { ok: true, active: false, primaryId: pid, fields: {} };
  var rowsP = rowsByPid_(readMasterLines_('MASTER_READ'))[pid] || [];
  if (rowsP.length !== 1) return { ok: false, error: 'identity not unique: ' + rowsP.length + ' live rows match ' + pid };
  var ref = evidenceRefOf_(rowsP[0]), f = ref ? resolveEvidence_(parseCompanion_(DriveApp.getFileById(st.companionId).getBlob().getDataAsString()), pid, ref) : {};
  return { ok: f !== null, active: true, primaryId: pid, evidenceRef: ref ? EVIDENCE_SCHEMA + ':' + ref : '', fields: f || {}, error: f === null ? 'evidence chain unresolved' : '' };
}
function archivedPid_(pid) { try { return archiveRowsLive_().some(function (l) { return l.split(' | ')[1].trim() === pid; }); } catch (e) { return false; } }
/** A live archive exists from the moment the live migration is prepared (the master may be partly migrated while frozen). */
function liveArchiveState_(st) { return !!(st && st.mode === 'LIVE' && st.archiveId && st.status !== 'ABANDONED'); }
function archiveRowsLive_() { var st = readMigrationState_(); if (!liveArchiveState_(st)) return []; return parseArchive_(DriveApp.getFileById(st.archiveId).getBlob().getDataAsString()); }

/** GET master&hydrate=1: the canonical master with its evidence merged back and the archive appended (read-only view). */
function readMasterHydrated_(docParam) {
  DOC_ACCESS_ = [];
  var st = readMigrationState_(), id = MASTER_ID, archiveId = '', companionId = '';
  if (liveArchiveState_(st)) { archiveId = st.archiveId; companionId = st.companionId; }
  if (docParam && st && st.mode === 'REHEARSAL' && docParam === st.targetDocId) { id = st.targetDocId; archiveId = st.archiveId; companionId = st.companionId; }
  else if (docParam && docParam !== MASTER_ID) return { ok: false, error: 'hydrate doc must be the master or the current rehearsal copy' };
  var text = withDocRetry_('MASTER_READ', function () { return DocumentApp.openById(id).getBody().getText(); }), file = DriveApp.getFileById(id);
  if (!archiveId) return { ok: true, hydrated: false, id: id, title: file.getName(), modifiedTime: file.getLastUpdated().toISOString(), fetchedAt: new Date().toISOString(), bytes: text.length, text: text, docAccess: docAccessSummary_() };
  var lines = text.split(/\r?\n/), archive = parseArchive_(DriveApp.getFileById(archiveId).getBlob().getDataAsString()), recs = parseCompanion_(DriveApp.getFileById(companionId).getBlob().getDataAsString());
  var out = hydrateLines_(lines, archive, recs).join('\n');
  return { ok: true, hydrated: true, id: id, title: file.getName(), modifiedTime: file.getLastUpdated().toISOString(), fetchedAt: new Date().toISOString(), canonicalBytes: text.length, bytes: out.length, archiveRows: archive.length, evidenceRecords: recs.length, text: out, docAccess: docAccessSummary_() };
}

/* ----- impure: migration engine (one target-document write per execution; every chunk verified by a later execution) ----- */
function readDocLines_(id, op) { return withDocRetry_(op || 'MIGRATION_READ', function () { var p = DocumentApp.openById(id).getBody().getParagraphs(), out = []; for (var i = 0; i < p.length; i++) out.push(p[i].getText()); return out; }); }
function migration_(req) {
  var op = String((req && req.op) || ''), lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    DOC_ACCESS_ = [];
    if (op === 'plan') { var pl = planMasterMigration_(readDocLines_(MASTER_ID), { at: new Date().toISOString() }); return { ok: pl.reconciliation.ok, op: op, reconciliation: pl.reconciliation, chunks: migrationChunks_(pl, req).map(function (c) { return { n: c.n, kind: c.kind, items: c.items ? c.items.length : 0 }; }) }; }
    if (op === 'prepare') return migrationPrepare_(req);
    if (op === 'step') return migrationStep_(req);
    if (op === 'status') return { ok: true, state: migrationSummary_(readMigrationState_()) };
    return { ok: false, error: 'migration op must be plan | prepare | step | status' };
  } finally { lock.releaseLock(); }
}
function migrationSummary_(st) { if (!st) return null; var c = st.chunks || []; return { migrationId: st.migrationId, mode: st.mode, status: st.status, targetDocId: st.targetDocId, archiveId: st.archiveId, companionId: st.companionId, rollback: st.rollback, next: st.next, chunks: c.length, verified: c.filter(function (x) { return x.state === 'DONE'; }).length, reconciliation: st.reconciliation, final: st.final || null, updatedAt: st.updatedAt }; }
function migrationPrepare_(req) {
  var mode = String(req.mode || ''), at = new Date().toISOString(), stamp = at.replace(/[^0-9]/g, '').slice(0, 14), cur = readMigrationState_();
  if (mode !== 'REHEARSAL' && mode !== 'LIVE') return { ok: false, error: 'mode must be REHEARSAL or LIVE' };
  if (cur && cur.status !== 'CUTOVER_COMPLETE' && cur.status !== 'REHEARSAL_COMPLETE' && cur.status !== 'ABANDONED' && !req.replace) return { ok: false, error: 'a migration is in progress (' + cur.migrationId + ' ' + cur.status + ')' };
  if (cur && cur.mode === 'LIVE' && cur.status === 'CUTOVER_COMPLETE') return { ok: false, error: 'live cutover already complete' };
  if (cur && cur.mode === 'LIVE' && cur.status !== 'ABANDONED') return { ok: false, error: 'a live migration exists (' + cur.status + '); it can never be replaced' };
  if (mode === 'LIVE' && !readFreeze_()) return { ok: false, error: 'freeze the Writer first (POST freeze_writer)' };
  if (mode === 'LIVE') { var v = verifyPendingWrites_(); if (v.stillPending.length) return { ok: false, error: 'pending writes not yet verified: ' + v.stillPending.join(',') }; }
  var master = DriveApp.getFileById(MASTER_ID), folder = folder_(), prefix = mode === 'LIVE' ? '' : 'REHEARSAL_' + stamp + '__';
  var lines = readDocLines_(MASTER_ID), srcText = lines.join('\n'), rollback = {};
  var snap = folder.createFile('V2_MASTER_PRE_MIGRATION_' + stamp + (mode === 'LIVE' ? '' : '_REHEARSAL') + '.txt', srcText, MimeType.PLAIN_TEXT);
  rollback.textSnapshotId = snap.getId(); rollback.textSnapshotHash = textHash_(srcText);
  var targetId = MASTER_ID;
  if (mode === 'LIVE') { rollback.docCopyId = master.makeCopy('V2_CURRENT_POPULATION_MASTER__PRE_MIGRATION_ROLLBACK_' + stamp, folder).getId(); }
  else targetId = master.makeCopy('REHEARSAL_' + stamp + '__V2_CURRENT_POPULATION_MASTER', folder).getId();
  var archiveFile = folder.createFile(prefix + ARCHIVE_NAME, '', MimeType.PLAIN_TEXT), companionFile = folder.createFile(prefix + COMPANION_NAME, '', MimeType.PLAIN_TEXT);
  var plan = planMasterMigration_(lines, { at: at, src: 'MIGRATION-' + stamp, archiveId: archiveFile.getId(), companionId: companionFile.getId() });
  if (!plan.reconciliation.ok) return { ok: false, error: 'plan does not reconcile; nothing written to the master', reconciliation: plan.reconciliation, rollback: rollback };
  archiveFile.setContent(archiveHeader_(at, MASTER_ID) + '\n' + plan.archive.join('\n') + '\n');
  companionFile.setContent(companionHeader_(at, MASTER_ID) + '\n' + plan.records.map(function (r) { return JSON.stringify(r); }).join('\n') + '\n');
  if (mode === 'LIVE') {
    rollback.archiveInitialId = folder.createFile('V2_TERMINAL_ARCHIVE__INITIAL_' + stamp + '.txt', archiveFile.getBlob().getDataAsString(), MimeType.PLAIN_TEXT).getId();
    rollback.companionInitialId = folder.createFile('V2_EVIDENCE_COMPANION__INITIAL_' + stamp + '.jsonl', companionFile.getBlob().getDataAsString(), MimeType.PLAIN_TEXT).getId();
  }
  var st = { migrationId: 'MIG-' + stamp, mode: mode, status: 'PREPARED', startedAt: at, targetDocId: targetId, archiveId: archiveFile.getId(), companionId: companionFile.getId(), rollback: rollback,
    sourceHash: plan.reconciliation.sourceHash, targetHash: plan.reconciliation.targetHash, reconciliation: plan.reconciliation, chunks: migrationChunks_(plan, req), next: 0 };
  writeMigrationState_(st);
  appendEvents_([{ type: 'MIGRATION_PREPARED', ts: at, migrationId: st.migrationId, mode: mode, targetDocId: targetId, archiveId: st.archiveId, companionId: st.companionId, rollback: rollback, reconciliation: plan.reconciliation }]);
  return { ok: true, op: 'prepare', state: migrationSummary_(st) };
}
/** Verifies the previous chunk from this execution's fresh read, then applies the next chunk (one document write). */
function migrationStep_(req) {
  var st = readMigrationState_();
  if (!st || (st.status !== 'PREPARED' && st.status !== 'IN_PROGRESS')) return { ok: false, error: 'no migration in progress', state: migrationSummary_(st) };
  if (st.mode === 'LIVE' && !readFreeze_()) return { ok: false, error: 'Writer must stay frozen during the live migration' };
  var lines = readDocLines_(st.targetDocId), now = Date.now(), prev = st.next > 0 ? st.chunks[st.next - 1] : null;
  if (prev && prev.state !== 'DONE') {
    var ps = chunkState_(prev, lines);
    if (ps === 'DONE') { prev.state = 'DONE'; prev.verifiedAt = new Date(now).toISOString(); }
    else if (ps === 'PENDING' && now - Date.parse(prev.writtenAt) < VERIFY_GRACE_MS) { writeMigrationState_(st); return { ok: false, mode: 'WAIT', error: 'previous chunk ' + prev.n + ' not yet visible; retry', state: migrationSummary_(st) }; }
    else if (ps === 'PENDING') { prev.state = 'NOT_PERSISTED'; st.next = prev.n; }
    else { st.status = 'HALTED'; prev.state = 'MIXED'; writeMigrationState_(st); return { ok: false, error: 'chunk ' + prev.n + ' partially applied; migration halted for resolution', state: migrationSummary_(st) }; }
  }
  if (st.next >= st.chunks.length) {
    var text = lines.join('\n'), ok = textHash_(text) === st.targetHash;
    st.final = { verifiedAt: new Date(now).toISOString(), chars: text.length, hash: textHash_(text), matchesPlan: ok, counts: countsLineOf_(lines) };
    st.status = ok ? (st.mode === 'LIVE' ? 'CUTOVER_COMPLETE' : 'REHEARSAL_COMPLETE') : 'HALTED';
    writeMigrationState_(st);
    appendEvents_([{ type: ok ? 'MIGRATION_COMPLETE' : 'MIGRATION_FINAL_MISMATCH', ts: st.final.verifiedAt, migrationId: st.migrationId, mode: st.mode, final: st.final }]);
    return { ok: ok, op: 'step', done: true, state: migrationSummary_(st) };
  }
  var ch = st.chunks[st.next], cs = chunkState_(ch, lines);
  if (cs === 'DONE') { ch.state = 'DONE'; ch.verifiedAt = new Date(now).toISOString(); st.next++; st.status = 'IN_PROGRESS'; writeMigrationState_(st); return { ok: true, op: 'step', applied: false, alreadyDone: ch.n, state: migrationSummary_(st) }; }
  if (cs !== 'PENDING') { st.status = 'HALTED'; ch.state = 'MIXED'; writeMigrationState_(st); return { ok: false, error: 'chunk ' + ch.n + ' target rows changed before apply; halted', state: migrationSummary_(st) }; }
  var doc = DocumentApp.openById(st.targetDocId), body = doc.getBody(), paras = body.getParagraphs();
  MASTER_WRITTEN_IN_EXECUTION_ = true;
  if (ch.kind === 'REMOVE') {
    var want = {}; ch.items.forEach(function (it) { want[it.key] = it.b; });
    for (var i = paras.length - 1; i >= 0; i--) { var l = lines[i]; if (rowParts_(l) && want[rowKey_(l)] === textHash_(l)) paras[i].removeFromParent(); }
  } else if (ch.kind === 'REWRITE') {
    var to = {}; ch.items.forEach(function (it) { to[it.key] = it; });
    for (var j = 0; j < paras.length; j++) { var l2 = lines[j]; if (rowParts_(l2)) { var it2 = to[rowKey_(l2)]; if (it2 && textHash_(l2) === it2.b) paras[j].setText(it2.after); } }
  } else {
    var cAt = -1;
    for (var k = 0; k < paras.length; k++) { if (/^COUNTS:/.test(lines[k])) { paras[k].setText(ch.counts); if (cAt < 0) cAt = k; } else if (ch.end && /^END V2_CURRENT_POPULATION_MASTER/.test(lines[k])) paras[k].setText(ch.end); }
    body.insertParagraph(cAt >= 0 ? cAt : 0, ch.contract);
  }
  doc.saveAndClose();
  ch.state = 'WRITTEN'; ch.writtenAt = new Date().toISOString(); st.next++; st.status = 'IN_PROGRESS';
  writeMigrationState_(st);
  return { ok: true, op: 'step', applied: ch.n, kind: ch.kind, items: ch.items ? ch.items.length : 1, verification: 'PENDING (verified by the next step)', state: migrationSummary_(st) };
}

/** Moves one archived row back into the canonical master (an INSERT, verified like any write). */
function restoreArchived_(req) {
  var pid = String((req && req.primaryId) || '').trim(); if (!pid) return { ok: false, error: 'primaryId required' };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    DOC_ACCESS_ = [];
    var st = readMigrationState_(); if (!st || st.mode !== 'LIVE' || st.status !== 'CUTOVER_COMPLETE') return { ok: false, error: 'no live archive' };
    var M = openMaster_(), snapshot = M.lines.slice(), fence = writeFence_(snapshot); if (fence) return fence;
    var rows = archiveRowsLive_().filter(function (l) { return l.split(' | ')[1].trim() === pid && (!req.inv || l.split(' | ')[0] === String(req.inv)); });
    if (rows.length !== 1) return { ok: false, error: 'archived identity not unique: ' + rows.length + ' archived rows match ' + pid + (req.inv ? '#' + req.inv : '') + ' (pass inv)' };
    if (snapshot.some(function (l) { return rowParts_(l) && rowKey_(l) === rowKey_(rows[0]); })) return { ok: false, error: 'row already in the master' };
    var at = new Date().toISOString(), rid = String(req.requestId || '') || ('RESTORE-' + at.replace(/[^0-9]/g, '').slice(0, 14) + '-' + pid);
    var ctx = evidenceRouting_(), line = externalizeEvidence_(ctx, '', rows[0], 'RESTORE:' + rid, at);
    var endIdx = -1; for (var e = snapshot.length - 1; e >= 0; e--) if (/^END V2_CURRENT_POPULATION_MASTER/.test(snapshot[e])) { endIdx = e; break; }
    var pos = endIdx >= 0 ? endIdx : snapshot.length, all = snapshot.slice(); all.splice(pos, 0, line);
    var counts = recomputeCountsLine(all), end = recomputeEndLine(all);
    flushEvidence_(ctx);
    MASTER_WRITTEN_IN_EXECUTION_ = true;
    M.body.insertParagraph(pos, line); var p1 = M.body.getParagraphs();
    masterTrailerEdits_(all, counts, end).forEach(function (x) { p1[x.index].setText(x.text); });
    M.doc.saveAndClose();
    var af = DriveApp.getFileById(st.archiveId), cur = af.getBlob().getDataAsString();
    af.setContent(cur.replace(/\n*$/, '\n') + 'RESTORED|' + pid + '|' + rows[0].split(' | ')[0] + '|' + at + '|' + rid + '\n');
    var receipt = { RECEIPT: 'STATE_CHANGE_RECEIPT', REQUEST_ID: rid, EXECUTED_BY: 'Authorized State Writer (runs as Tim)', TARGET_CANONICAL_ID: pid, CHANGES: ['RESTORED_FROM_ARCHIVE'], READBACK_VERIFIED: 'PENDING', TARGET_FILE_ID: MASTER_ID, COMPLETION_STATUS: 'PENDING_VERIFICATION', EXECUTED_AT: at, ACTOR: String(req.actor || 'TIM') };
    var writeId = stageVerification_('RESTORE', [{ pid: pid, op: 'INSERT', after: line }], [receipt], counts, at);
    return { ok: true, verification: 'PENDING', writeId: writeId, primaryId: pid, receipt: receipt };
  } finally { lock.releaseLock(); }
}

/* ================= master read ================= */
function readMaster_() {
  DOC_ACCESS_ = [];
  var file = DriveApp.getFileById(MASTER_ID);
  var text = withDocRetry_('MASTER_READ', function () { return DocumentApp.openById(MASTER_ID).getBody().getText(); });
  return { ok: true, docAccess: docAccessSummary_(), id: MASTER_ID, title: file.getName(), modifiedTime: file.getLastUpdated().toISOString(), fetchedAt: new Date().toISOString(), bytes: text.length, text: text };
}

/* ================= ruling (one existing row, exact PRIMARY_ID) ================= */
function applyRulingToMaster_(ruling) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    DOC_ACCESS_ = [];
    var modBefore = masterModified_();
    var M = openMaster_(), snapshot = M.lines.slice();
    var fence = writeFence_(snapshot);
    if (fence) { fence.docAccess = docAccessSummary_(); return fence; }
    var pid = String(ruling.primaryId || '').trim();
    if (!pid) return fail_('no PRIMARY_ID in request', ruling);
    var rid = String(ruling.requestId || '').trim();
    if (rid) {
      var replay = replayState_();
      if (replay.done[rid]) return { ok: true, mode: 'ALREADY_APPLIED', primaryId: pid, requestId: rid };
      if (replay.pending[rid]) return { ok: false, mode: 'PENDING_VERIFICATION', primaryId: pid, requestId: rid, error: 'request already written and awaiting independent verification' };
    }
    var hits = [];
    for (var i = 0; i < snapshot.length; i++) {
      var t = snapshot[i];
      if (/^\d+ \| /.test(t)) { var cells = t.split(' | '); if (cells.length > 2 && cells[1].trim() === pid) hits.push(i); }
    }
    if (!hits.length && archivedPid_(pid)) return { ok: false, mode: 'ARCHIVED_ROW', error: 'ARCHIVED_ROW: ' + pid + ' is terminal history in ' + ARCHIVE_NAME + '; POST restore_archived first (fail closed)' };
    if (hits.length !== 1) return fail_('identity not unique: ' + hits.length + ' rows match ' + pid + ' (fail closed)', ruling);
    var before = snapshot[hits[0]];
    var flexPolicy = readFlexPolicy_();
    var res = mutateRow(before, ruling, flexPolicy);
    if (!res.ok) return fail_(res.error, ruling);
    if (String(ruling.kind || '').toUpperCase() === 'IDENTITY') { var idConflict = identityConflicts_(snapshot, hits[0], res.after, ruling, archiveRowsLive_()); if (idConflict) return { ok: false, mode: 'HOLD', error: idConflict, primaryId: pid }; }
    var routing = evidenceRouting_();
    res.after = externalizeEvidence_(routing, before, res.after, String(ruling.actor || 'TIM').toUpperCase() + ':' + (ruling.requestId || 'no-id'), new Date().toISOString());
    var modCheck = masterModified_();
    if (modCheck !== modBefore) return fail_('master changed during request (' + modBefore + ' -> ' + modCheck + '); retry', ruling);
    var lines = snapshot.slice(); lines[hits[0]] = res.after;
    var newCounts = recomputeCountsLine(lines), newEnd = recomputeEndLine(lines);
    flushEvidence_(routing);
    applyMasterEdits_(M, snapshot, [{ index: hits[0], text: res.after }].concat(masterTrailerEdits_(lines, newCounts, newEnd)));
    var executedAt = new Date().toISOString();
    var receipt = {
      RECEIPT: 'STATE_CHANGE_RECEIPT', REQUEST_ID: ruling.requestId || '', EXECUTED_BY: 'Pipeline Explorer Apps Script (runs as Tim)',
      TARGET_CANONICAL_ID: pid, COMPANY: res.company, TITLE: res.title, REQ_ID: res.req,
      BEFORE_APPLICATION_STATE: res.beforeState, AFTER_APPLICATION_STATE: res.afterState,
      BEFORE_POSTING_STATE: 'n/a', AFTER_POSTING_STATE: 'n/a',
      CANONICAL_ID_PRESERVED: 'YES', HISTORY_PRESERVED: 'YES', COUNTS_UPDATED: 'YES', READBACK_VERIFIED: 'PENDING',
      TARGET_FILE_ID: MASTER_ID, COMPLETION_STATUS: 'PENDING_VERIFICATION', MASTER_MODIFIED_BEFORE: modBefore,
      EXECUTED_AT: executedAt, CHANGES: res.changes, FLEX_POLICY_SOURCE: flexPolicy._SOURCE || 'UNKNOWN', FLEX_POLICY_WARNING: flexPolicy._WARNING || ''
    };
    var writeId = stageVerification_('RULING', [{ pid: pid, op: 'REPLACE', before: before, after: res.after }], [receipt], newCounts, executedAt);
    receipt.WRITE_ID = writeId;
    appendEvent_({ type: 'TIM_RULING', primaryId: pid, actor: ruling.actor || 'TIM', ts: executedAt, requestId: ruling.requestId || '', kind: ruling.kind || '', code: ruling.code || '', note: ruling.note || '', before: before, after: res.after, verified: false, verification: 'PENDING', writeId: writeId });
    return { ok: true, verification: 'PENDING', writeId: writeId, receipt: receipt, before: before, after: res.after, counts: newCounts, docAccess: docAccessSummary_(), flexPolicySource: flexPolicy._SOURCE || 'UNKNOWN', flexPolicyWarning: flexPolicy._WARNING || '' };
  } finally { lock.releaseLock(); }
}
/* ================= AI data-discovery request queue ================= */
/* The button creates a durable request; it does not mutate the master or become a second job store. */
function applyDataDiscoveryRequest_(req) {
  req = req || {};
  var list = Array.isArray(req.requests) ? req.requests : (req.request ? [req.request] : []);
  if (!list.length) return { ok:false, error:'data_discovery requires requests[]' };
  if (list.length > 50) return { ok:false, error:'data_discovery batch too large (max 50)' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var paras = readMasterLines_('MASTER_READ'), rows = {};
    for (var i=0;i<paras.length;i++) {
      var t=paras[i]; if (!/^\d+ \| /.test(t)) continue;
      var c=t.split(' | '); if (c.length < FIXED_N + 1) continue;
      rows[c[1].trim()] = { primaryId:c[1].trim(), company:c[2].trim(), title:c[3].trim(), bucket:c[4].trim(), req:c[7].trim(), location:c[8].trim() };
    }
    var f=findOrCreate_(DISCOVERY_REQUESTS_NAME,'text',''), out=[], accepted=0, now=new Date().toISOString();
    for (var j=0;j<list.length;j++) {
      var x=list[j]||{}, pid=String(x.primaryId||x.PRIMARY_ID||'').trim(), row=rows[pid];
      if (!row) { out.push({ok:false,primaryId:pid,error:'PRIMARY_ID not found in current master'}); continue; }
      var requested=Array.isArray(x.fields)?x.fields.map(function(v){return String(v||'').trim().toUpperCase()}).filter(Boolean):['SALARY','SOURCE_URL','FLEX'];
      requested=requested.filter(function(v,n,a){return a.indexOf(v)===n&&['SALARY','SOURCE_URL','FLEX','DEGREE','REMOTE_HYBRID','REQ_ID','POSTING_DATE'].indexOf(v)>=0});
      if (!requested.length) { out.push({ok:false,primaryId:pid,error:'no supported missing fields requested'}); continue; }
      var rid=String(x.requestId||'').trim()||('DD-'+now.replace(/[-:.TZ]/g,'')+'-'+pid.slice(-8));
      var rec={type:'DATA_DISCOVERY_REQUEST',requestId:rid,requestedAt:now,actor:String(x.actor||'TIM').toUpperCase(),primaryId:pid,company:row.company,title:row.title,req:row.req,location:row.location,bucket:row.bucket,fields:requested,priority:String(x.priority||'NORMAL'),instructions:clean_(x.instructions||'Research only the missing fields; preserve the same canonical row and do not invent unknowns.')};
      appendJsonLine_(f,rec); appendEvent_({type:'DATA_DISCOVERY_REQUESTED',requestId:rid,primaryId:pid,actor:rec.actor,ts:now,fields:requested,company:row.company,title:row.title});
      out.push({ok:true,requestId:rid,primaryId:pid,fields:requested}); accepted++;
    }
    return {ok:out.every(function(v){return v.ok}),requested:accepted,results:out,pendingFile:DISCOVERY_REQUESTS_NAME};
  } finally { lock.releaseLock(); }
}
function fail_(msg, ruling) {
  var receipt = { RECEIPT: 'STATE_CHANGE_RECEIPT', REQUEST_ID: (ruling && ruling.requestId) || '', EXECUTED_BY: 'Pipeline Explorer Apps Script', TARGET_CANONICAL_ID: (ruling && ruling.primaryId) || '', COMPLETION_STATUS: 'STATE_CHANGE_NEEDS_RESOLUTION', REASON: msg, EXECUTED_AT: new Date().toISOString() };
  try { appendReceipt_(receipt); } catch (e) {}
  return { ok: false, error: msg, receipt: receipt };
}

/* ================= email-confirmed application/rejection upsert ================= */
function applyUpsertToMaster_(ev) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    DOC_ACCESS_ = [];
    var modBefore = masterModified_();
    var M = openMaster_(), snapshot = M.lines.slice(), lines = M.lines.slice();
    var fence = writeFence_(snapshot);
    if (fence) { fence.docAccess = docAccessSummary_(); return fence; }
    var now = new Date().toISOString();
    var flexPolicy = readFlexPolicy_();
    var archived = archiveRowsLive_();
    var plan = planUpsertApplication(lines.concat(archived), ev, { now: now, flexPolicy: flexPolicy });
    if (plan.ok && plan.mode === 'UPDATE' && plan.index >= lines.length) plan = { ok: false, mode: 'HOLD', error: 'ARCHIVED_MATCH: the email matches archived terminal row ' + plan.primaryId + '; POST restore_archived first, then resend with TARGET_PRIMARY_ID', upsertKey: plan.upsertKey };
    var routing = evidenceRouting_();
    if (plan.ok && plan.mode === 'UPDATE') plan.after = externalizeEvidence_(routing, snapshot[plan.index], plan.after, 'UPSERT:' + (plan.upsertKey || ''), now);
    if (plan.ok && plan.mode === 'CREATE') plan.newLine = externalizeEvidence_(routing, '', plan.newLine, 'UPSERT:' + (plan.upsertKey || ''), now);
    var base = { RECEIPT: 'UPSERT_RECEIPT', REQUEST_ID: (ev && ev.requestId) || plan.upsertKey || '', EXECUTED_BY: 'Authorized State Writer (runs as Tim)', COMPANY: (ev && ev.COMPANY) || '', TITLE: (ev && ev.TITLE) || '', STATE: (ev && (ev.STATE || ev.state)) || '', MODE: plan.mode, TARGET_FILE_ID: MASTER_ID, MASTER_MODIFIED_BEFORE: modBefore, EXECUTED_AT: now, FLEX_POLICY_SOURCE: flexPolicy._SOURCE || 'UNKNOWN', FLEX_POLICY_WARNING: flexPolicy._WARNING || '' };
    if (!plan.ok) { base.COMPLETION_STATUS = plan.mode === 'HOLD' ? 'HOLD' : 'FAILED'; base.REASON = plan.error; base.POSSIBLE_MATCHES = plan.possibleMatches || []; try { appendReceipt_(base); } catch (e) {} return { ok: false, mode: plan.mode, error: plan.error, possibleMatches: plan.possibleMatches || [], receipt: base }; }
    if (plan.mode === 'ALREADY_APPLIED') { base.COMPLETION_STATUS = 'NO_CHANGE_REQUIRED'; base.PRIMARY_ID = plan.primaryId; return { ok: true, mode: plan.mode, primaryId: plan.primaryId, receipt: base }; }
    if (masterModified_() !== modBefore) return { ok: false, mode: 'RETRY', error: 'master changed during request; retry' };
    var expect, item, all = snapshot.slice(), edits = [];
    flushEvidence_(routing);
    MASTER_WRITTEN_IN_EXECUTION_ = true;
    if (plan.mode === 'UPDATE') {
      all[plan.index] = plan.after; expect = plan.after; edits.push({ index: plan.index, text: plan.after });
      item = { pid: plan.primaryId, op: 'REPLACE', before: snapshot[plan.index], after: plan.after };
    } else {
      var endIdx = -1; for (var e2 = snapshot.length - 1; e2 >= 0; e2--) if (/^END V2_CURRENT_POPULATION_MASTER/.test(snapshot[e2])) { endIdx = e2; break; }
      var at = endIdx >= 0 ? endIdx : snapshot.length;
      M.body.insertParagraph(at, plan.newLine); all.splice(at, 0, plan.newLine); expect = plan.newLine;
      item = { pid: plan.primaryId, op: 'INSERT', after: plan.newLine };
    }
    var newCounts = recomputeCountsLine(all), newEnd = recomputeEndLine(all), p1 = M.body.getParagraphs();
    edits.concat(masterTrailerEdits_(all, newCounts, newEnd).filter(function (x) { return all[x.index] !== x.text; })).forEach(function (x) { p1[x.index].setText(x.text); });
    M.doc.saveAndClose();
    base.PRIMARY_ID = plan.primaryId; base.MATCHED_BY = plan.matchedBy || ''; base.UPSERT_KEY = plan.upsertKey; base.READBACK_VERIFIED = 'PENDING'; base.COUNTS_AFTER = newCounts; base.COMPLETION_STATUS = 'PENDING_VERIFICATION';
    var writeId = stageVerification_('UPSERT', [item], [base], newCounts, now);
    base.WRITE_ID = writeId;
    return { ok: true, verification: 'PENDING', writeId: writeId, mode: plan.mode, primaryId: plan.primaryId, matchedBy: plan.matchedBy || '', row: expect, counts: newCounts, endLine: newEnd, docAccess: docAccessSummary_(), receipt: base };
  } finally { lock.releaseLock(); }
}

/* ================= intake (Scout discovery -> canonical rows) ================= */
function applyIntakeToMaster_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    DOC_ACCESS_ = [];
    var modBefore = masterModified_();
    var M = openMaster_(), snapshot = M.lines.slice();
    var lines = M.lines.slice();
    var fence = writeFence_(snapshot);
    if (fence) { fence.results = []; fence.docAccess = docAccessSummary_(); return fence; }
    var rules = readRules_();
    // Dedupe (and next INV numbering) against live rows AND archived terminal history, so a declined/closed/rejected job is not re-admitted.
    var plan = planIntake(lines.concat(archiveRowsLive_()), req.records || [], rules, { run: req.run || {}, now: new Date().toISOString(), nowET: nowET_() });
    if (!plan.ok) return { ok: false, error: plan.error, results: plan.results || [] };
    var routing = evidenceRouting_(), routedAt = new Date().toISOString(), routedMap = {};
    plan.newLines = plan.newLines.map(function (l) { var r = externalizeEvidence_(routing, '', l, 'INTAKE:' + ((req.run && req.run.SCOUT_RUN_ID) || ''), routedAt); routedMap[l] = r; return r; });
    plan.insertLines = plan.insertLines.map(function (l) { return routedMap[l] || l; });
    var modCheck = masterModified_();
    if (modCheck !== modBefore) return { ok: false, error: 'master changed during request (' + modBefore + ' -> ' + modCheck + '); retry', results: [] };
    // append: before END marker if present, else at end. Positions come from the snapshot, not a post-edit re-read.
    var endIdx = -1;
    for (var e = snapshot.length - 1; e >= 0; e--) if (/^END V2_CURRENT_POPULATION_MASTER/.test(snapshot[e])) { endIdx = e; break; }
    var toInsert = plan.insertLines, at = endIdx >= 0 ? endIdx : snapshot.length, all = snapshot.slice();
    flushEvidence_(routing);
    MASTER_WRITTEN_IN_EXECUTION_ = true;
    for (var n = 0; n < toInsert.length; n++) { M.body.insertParagraph(at + n, toInsert[n]); }
    Array.prototype.splice.apply(all, [at, 0].concat(toInsert));
    var newCounts = recomputeCountsLine(all), newEnd = recomputeEndLine(all), p1 = M.body.getParagraphs();
    masterTrailerEdits_(all, newCounts, newEnd).forEach(function (x) { p1[x.index].setText(x.text); });
    M.doc.saveAndClose();
    // Written, not yet durable: a later execution verifies every inserted row (independent post-execution readback).
    var verified = true;
    var counters = runCounters_(req.run || {}, plan, rules, verified);
    var executedAt = new Date().toISOString();
    var receipt = {
      RECEIPT: 'INTAKE_RECEIPT', SCOUT_RUN_ID: (req.run && req.run.SCOUT_RUN_ID) || '', EXECUTED_BY: 'Pipeline Explorer Apps Script (runs as Tim)',
      RECORDS_RECEIVED: (req.records || []).length, COUNTERS: counters, RULES_STATUS: rules.status, RULES_DOC_ID: CANONICAL_RULES_DOC_ID,
      DISCOVERY_LEAD_AMBIGUOUS: plan.summary.AMBIGUOUS_LEAD, NEVER_CONSIDER_REVIEW_NEEDED: plan.summary.NEVER_CONSIDER_REVIEW_NEEDED,
      NEW_PRIMARY_IDS: plan.newLines.map(function (l) { return l.split(' | ')[1]; }),
      COUNTS_UPDATED: 'YES', END_UPDATED: newEnd ? 'YES' : 'NO_END_LINE', READBACK_VERIFIED: 'PENDING',
      RUN_ACCOUNTING: counters.RUN_ACCOUNTING, DISCOVERY_UNACCOUNTED: counters.DISCOVERY_UNACCOUNTED, WRITE_VERIFIED: 'PENDING',
      INTENDED_COMPLETION_STATUS: counters.RUN_ACCOUNTING === 'RECONCILED' ? 'COMPLETE' : 'INCOMPLETE',
      TARGET_FILE_ID: MASTER_ID, COMPLETION_STATUS: 'PENDING_VERIFICATION', MASTER_MODIFIED_BEFORE: modBefore, EXECUTED_AT: executedAt
    };
    var items = plan.newLines.map(function (l) { return { pid: l.split(' | ')[1].trim(), op: 'INSERT', after: l }; });
    if (items.length) receipt.WRITE_ID = stageVerification_('INTAKE', items, [receipt], newCounts, executedAt);
    else { receipt.COMPLETION_STATUS = receipt.INTENDED_COMPLETION_STATUS; receipt.READBACK_VERIFIED = 'NOT_APPLICABLE'; receipt.WRITE_VERIFIED = 'NOT_APPLICABLE'; appendReceipt_(receipt); }
    // telemetry beside the master (SCOUT_RUN_METRICS.jsonl): counters + exclusion audit. Not candidate state; never a second ledger.
    appendRun_({ SCOUT_RUN_ID: receipt.SCOUT_RUN_ID, RECEIVED_AT: receipt.EXECUTED_AT, RUN: req.run || {}, COUNTERS: counters, GROSS_FOUND: counters.GROSS_FOUND, NEVER_CONSIDER_EXCLUDED: counters.NEVER_CONSIDER_EXCLUDED,
      EXCLUSIONS: plan.excluded, RESULTS: plan.results.map(function (r) { var w = r.result === 'SCOUT_INTAKE_WRITTEN' || r.result === 'DISCOVERY_LEAD_WRITTEN'; return { INTAKE_KEY: r.INTAKE_KEY, SUBMITTED_VIA: r.SUBMITTED_VIA, result: r.result, WRITE_STATUS: w ? 'PENDING' : 'NOT_WRITTEN', PRIMARY_ID: r.PRIMARY_ID, BUCKET: r.BUCKET, NEVER_CONSIDER_REVIEW_NEEDED: r.NEVER_CONSIDER_REVIEW_NEEDED }; }),
      WRITE_STATUS: items.length ? 'PENDING' : 'NOT_APPLICABLE', WRITE_VERIFIED: items.length ? 'PENDING' : 'NOT_APPLICABLE', WRITE_ID: receipt.WRITE_ID || '', COMPLETION_STATUS: receipt.COMPLETION_STATUS });
    var resp = intakeResponse_(verified, counters, receipt, plan, newCounts, newEnd);
    if (items.length) { resp.verification = 'PENDING'; resp.writeId = receipt.WRITE_ID; resp.WRITE_ACCEPTED = true; resp.WRITE_VERIFIED = false; resp.COMPLETION_STATUS = 'PENDING_VERIFICATION'; }
    return resp;
  } finally { lock.releaseLock(); }
}

/** run.NEVER_CONSIDER_EXCLUDED entries (legacy transport) normalized into input candidates. They are never accepted as excluded; the writer adjudicates each one. */
function preExclusionCandidates(run) {
  var list = Array.isArray(run.NEVER_CONSIDER_EXCLUDED) ? run.NEVER_CONSIDER_EXCLUDED : [];
  return list.map(function (x) { x = x || {}; return {
    SUBMITTED_VIA: 'RUN_PRE_EXCLUSION', COMPANY: x.COMPANY || x.EMPLOYER || '', TITLE: x.TITLE || '', LOCATION: x.LOCATION || '', SOURCE: x.SOURCE || '', SOURCE_URL: x.SOURCE_URL || '', DISCOVERED_AT_ET: x.DISCOVERED_AT_ET || '', REQ_ID: x.REQ_ID || '',
    EMPLOYER_DOMAIN_HINT: x.EMPLOYER_DOMAIN_HINT || '', EMPLOYER_PRIMARY_BUSINESS: x.EMPLOYER_PRIMARY_BUSINESS || '',
    NEVER_CONSIDER_RULE_ID: x.NEVER_CONSIDER_RULE_ID || x.RULE_ID || '', EXCLUSION_CONFIDENCE: x.EXCLUSION_CONFIDENCE || 'HIGH', EXCLUSION_REASON: x.EXCLUSION_REASON || x.REASON || '' }; });
}
/** Run-level counters in the canonical vocabulary. Every outcome comes from the writer's own adjudication of every submitted candidate (records + legacy pre-exclusion entries). */
function runCounters_(run, plan, R, verified) {
  var s = plan.summary; var results = plan.results || [];
  var c = { GROSS_FOUND: num_(run.GROSS_FOUND) || results.length, CANDIDATES_SUBMITTED: results.length, PRE_EXCLUSION_ENTRIES: results.filter(function (r) { return r.SUBMITTED_VIA === 'RUN_PRE_EXCLUSION'; }).length, NEVER_CONSIDER_EXCLUDED: s.NEVER_CONSIDER_EXCLUDED };
  (R.rules || []).forEach(function (r) { c[r.RULE_ID + '_COUNT'] = 0; });
  (plan.excluded || []).forEach(function (x) { var k = x.NEVER_CONSIDER_RULE_ID + '_COUNT'; c[k] = (c[k] || 0) + 1; });
  c.ENTERED_MASTER = verified ? s.ENTERED_MASTER : 0; c.SCOUT_INTAKE_WRITTEN = verified ? s.SCOUT_INTAKE_WRITTEN : 0; c.DISCOVERY_LEAD_WRITTEN = verified ? s.DISCOVERY_LEAD_WRITTEN : 0;
  c.EXISTING_MATCH = s.EXISTING_MATCH; c.WRITE_FAILED = s.WRITE_FAILED + (verified ? 0 : s.ENTERED_MASTER); c.NEVER_CONSIDER_REVIEW_NEEDED = s.NEVER_CONSIDER_REVIEW_NEEDED;
  // full-accounting invariant: GROSS_FOUND = NEVER_CONSIDER_EXCLUDED + SCOUT_INTAKE_WRITTEN + DISCOVERY_LEAD_WRITTEN + EXISTING_MATCH + WRITE_FAILED
  var accounted = c.NEVER_CONSIDER_EXCLUDED + c.SCOUT_INTAKE_WRITTEN + c.DISCOVERY_LEAD_WRITTEN + c.EXISTING_MATCH + c.WRITE_FAILED;
  c.DISCOVERY_ACCOUNTED = accounted; c.DISCOVERY_UNACCOUNTED = c.GROSS_FOUND - accounted;
  c.RUN_ACCOUNTING = c.DISCOVERY_UNACCOUNTED === 0 ? 'RECONCILED' : (c.DISCOVERY_UNACCOUNTED > 0 ? 'INCOMPLETE' : 'OVERREPORTED');
  return c;
}
/** Caller-facing response: ok means the WHOLE intake contract completed (readback verified AND run reconciled). WRITE_VERIFIED is kept separate. */
function intakeResponse_(verified, counters, receipt, plan, newCounts, newEnd) {
  var reconciled = counters.RUN_ACCOUNTING === 'RECONCILED';
  return { ok: !!verified && reconciled, WRITE_VERIFIED: !!verified, RUN_ACCOUNTING: counters.RUN_ACCOUNTING, DISCOVERY_UNACCOUNTED: counters.DISCOVERY_UNACCOUNTED,
    COMPLETION_STATUS: !verified ? 'FAILED' : (reconciled ? 'COMPLETE' : 'INCOMPLETE'),
    error: !verified ? 'readback did not verify' : (reconciled ? '' : 'run does not reconcile: GROSS_FOUND ' + counters.GROSS_FOUND + ' vs ' + counters.DISCOVERY_ACCOUNTED + ' accounted (' + counters.RUN_ACCOUNTING + '); rows already written are canonical, do not retry them; submit the missing discoveries as records'),
    receipt: receipt, results: plan.results, counts: newCounts, endLine: newEnd };
}
/* ================= pure functions: row mutation ================= *//* ================= pure functions: row mutation ================= */
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
function clean_(v) { return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').replace(/; /g, ', ').replace(/ \| /g, ' / ').trim(); }
/** Apply one Tim ruling to one master row line. */
/* ================= governed identity correction (ruling kind IDENTITY) ================= */
var IDENTITY_FIXED_KEYS = ['COMPANY', 'TITLE', 'REQ', 'LOCATION'];
var IDENTITY_FIXED_INDEX = { COMPANY: 2, TITLE: 3, REQ: 7, LOCATION: 8 };
var IDENTITY_PLACEHOLDER_RE = /^(UNKNOWN|UNCAPTURED|NOT_STATED|N\/A|NONE|TBD|-|CONFIDENTIAL)$/i;
/**
 * Pure: one identity correction on a parsed row, all or nothing.
 * - ruling.identity {COMPANY?, TITLE?, REQ?, LOCATION?} rewrites the fixed columns; each prior value is kept as
 *   IDENTITY_PRIOR_<KEY>; placeholders are refused.
 * - ruling.evidence (text) and ruling.evidenceUrl (http/https) are required.
 * - A payload copy of COMPANY/TITLE/LOCATION/REQ that differs from the fixed column is removed (kept as
 *   IDENTITY_PRIOR_PAYLOAD_<KEY>), so the row can never carry two identities.
 * - POSSIBLE_MATCHES is cleared only when ruling.reconciled names every listed PRIMARY_ID with a verdict DISTINCT: <why>
 *   or DUPLICATE_RESOLVED: <why>; the list and verdicts are kept (IDENTITY_PRIOR_POSSIBLE_MATCHES, POSSIBLE_MATCHES_RECONCILED).
 *   Whether the reconciled rows really allow that is checked against the master by identityConflicts_.
 */
function identityChange_(fixed, P, O, set, ruling) {
  var changed = [], idn = ruling.identity || {}, rec = ruling.reconciled || {};
  if (typeof idn !== 'object' || Array.isArray(idn)) return { ok: false, error: 'IDENTITY identity must be an object {COMPANY?, TITLE?, REQ?, LOCATION?}' };
  var evidence = clean_(ruling.evidence || ''), evidenceUrl = String(ruling.evidenceUrl || '').trim();
  if (evidence.length < 20) return { ok: false, error: 'IDENTITY requires evidence (what the source shows, at least 20 characters)' };
  if (!/^https?:\/\/[^\s]+$/i.test(evidenceUrl)) return { ok: false, error: 'IDENTITY requires evidenceUrl (the http(s) page the evidence comes from)' };
  var keys = Object.keys(idn);
  for (var i = 0; i < keys.length; i++) {
    var k = String(keys[i]).trim().toUpperCase();
    if (IDENTITY_FIXED_KEYS.indexOf(k) < 0) return { ok: false, error: 'IDENTITY identity key ' + keys[i] + ' is not one of ' + IDENTITY_FIXED_KEYS.join(', ') };
    var v = clean_(idn[keys[i]]);
    if (!v || IDENTITY_PLACEHOLDER_RE.test(v)) return { ok: false, error: 'IDENTITY ' + k + ' must be a real value, not a placeholder (' + JSON.stringify(v) + ')' };
    var at = IDENTITY_FIXED_INDEX[k];
    if (fixed[at] !== v) { set('IDENTITY_PRIOR_' + k, fixed[at]); fixed[at] = v; changed.push(k); }
  }
  ['COMPANY', 'TITLE', 'LOCATION', 'REQ'].forEach(function (k) {
    if (P[k] !== undefined && String(P[k]).trim() !== String(fixed[IDENTITY_FIXED_INDEX[k]]).trim()) {
      set('IDENTITY_PRIOR_PAYLOAD_' + k, P[k]); delete P[k]; O.splice(O.indexOf(k), 1); changed.push('PAYLOAD_' + k + '_REMOVED');
    }
  });
  var listed = String(P.POSSIBLE_MATCHES || '').split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  var recKeys = Object.keys(rec);
  for (var r = 0; r < recKeys.length; r++) if (!/^(DISTINCT|DUPLICATE_RESOLVED):\s*\S.{9,}/.test(String(rec[recKeys[r]] || ''))) return { ok: false, error: 'IDENTITY reconciled[' + recKeys[r] + '] must read "DISTINCT: <evidence>" or "DUPLICATE_RESOLVED: <evidence>"' };
  if (listed.length) {
    var missing = listed.filter(function (p) { return !rec[p]; });
    if (missing.length) return { ok: false, error: 'IDENTITY cannot clear POSSIBLE_MATCHES: not reconciled ' + missing.join(', ') + ' (reconcile every listed row first)' };
    set('IDENTITY_PRIOR_POSSIBLE_MATCHES', P.POSSIBLE_MATCHES);
    set('POSSIBLE_MATCHES_RECONCILED', listed.map(function (p) { return p + ' ' + String(rec[p]).split(':')[0]; }).join(', '));
    delete P.POSSIBLE_MATCHES; O.splice(O.indexOf('POSSIBLE_MATCHES'), 1); changed.push('POSSIBLE_MATCHES_CLEARED');
  }
  set('IDENTITY_EVIDENCE', evidence); set('IDENTITY_EVIDENCE_URL', evidenceUrl); changed.push('IDENTITY_EVIDENCE');
  return { ok: true, changed: changed };
}
/**
 * Pure: after an IDENTITY mutation, does the row's identity collide with another live or archived row that the ruling
 * did not reconcile? Uses the intake matcher (matchExisting) on the corrected identity. Also checks that every
 * DUPLICATE_RESOLVED reconciliation names a row that really is DUPLICATE. Returns '' or the refusal reason.
 */
function identityConflicts_(lines, lineIndex, after, ruling, archiveRows) {
  var c = after.split(' | '), P = parsePayload(c.slice(FIXED_N).join(' | ')).payload, rec = ruling.reconciled || {}, self = c[1].trim();
  var others = lines.filter(function (l, i) { return i !== lineIndex; }).concat(archiveRows || []);
  var bucketOf = {}; others.forEach(function (l) { if (/^\d+ \| /.test(l)) { var x = l.split(' | '); if (x.length > 4) bucketOf[x[1].trim()] = x[4]; } });
  var badDup = Object.keys(rec).filter(function (p) { return /^DUPLICATE_RESOLVED/.test(rec[p]) && bucketOf[p] !== 'DUPLICATE'; });
  if (badDup.length) return 'DUPLICATE_RESOLVED requires the other row to be DUPLICATE already: ' + badDup.map(function (p) { return p + ' is ' + (bucketOf[p] || 'missing'); }).join(', ');
  var usable = function (v) { v = String(v || '').trim(); return !!v && !IDENTITY_PLACEHOLDER_RE.test(v); };
  var m = matchExisting({ COMPANY: c[2], TITLE: c[3], LOCATION: c[8], REQ_ID: usable(c[7]) ? c[7] : (P.REQ_ID || ''), SOURCE_URL: P.COMPANY_SOURCE_URL || P.SOURCE_URL || '' }, indexExisting(others));
  if (m.kind === 'none') return '';
  var hit = m.rows.map(function (r) { return r.id; }).filter(function (id) { return id !== self && !rec[id]; });
  return hit.length ? 'IDENTITY_COLLISION: corrected identity matches ' + hit.join(', ') + ' by ' + m.by + ' (reconcile it as DISTINCT or resolve the duplicate first)' : '';
}
function mutateRow(line, ruling, flexPolicy) {
  var cells = line.split(' | ');
  if (cells.length < FIXED_N + 1) return { ok: false, error: 'row has fewer than 10 cells' };
  var fixed = cells.slice(0, FIXED_N), rest = cells.slice(FIXED_N).join(' | ');
  var pp = parsePayload(rest), P = pp.payload, O = pp.order;
  function set(k, v) { if (O.indexOf(k) < 0) O.push(k); P[k] = clean_(v); }
  var ts = ruling.ts || new Date().toISOString(), d = today_(ts), kind = String(ruling.kind || '').toUpperCase(), val = String(ruling.value || '').toUpperCase();
  var note = clean_(ruling.note || '');
  var evDate = /^\d{4}-\d{2}-\d{2}/.test(String(ruling.eventDate || '')) ? String(ruling.eventDate).slice(0, 10) : d;
  var evidence = clean_(ruling.evidence || '');
  var beforeState = fixed[4] + ' / ' + fixed[5];
  var changes = [];
  var tags = fixed[6] === '-' ? [] : fixed[6].split(';').map(function (s) { return s.trim(); }).filter(Boolean);
  var isProtected = PROTECTED_APPLICANT.indexOf(fixed[4]) >= 0;
  function guardProtected(action) { if (isProtected) return { ok: false, error: 'cannot ' + action + ' a row in ' + fixed[4] + ' (protected applicant state)' }; return null; }
  var g;
  if (kind === 'NOTE') {
    if (!note) return { ok: false, error: 'empty note' };
    set('TIM_NOTE', note + ' [Tim ' + d + ']'); changes.push('TIM_NOTE');
  } else if (kind === 'APPLY_NOW' && val === 'YES') {
    if ((g = guardProtected('mark pursue on'))) return g;
    if(PipelinePolicy.flex(P,flexPolicy).blocked&&String(ruling.actor||'').toUpperCase()!=='TIM')return {ok:false,error:'STRICT requires explicit Tim override'};
    if(PipelinePolicy.flex(P,flexPolicy).blocked)set('TIM_FLEX_OVERRIDE','YES');
    fixed[4] = 'READY_TO_PURSUE'; fixed[5] = 'RESOLVED/PURSUE_CANDIDATE';
    set('TIM_RULING', 'PURSUE'); tags.push('TIM_OVERRIDE_PURSUE_' + d); changes.push('BUCKET', 'DISPOSITION', 'TIM_RULING');
    if (P.DECLINE_REASON_CODE) { set('DECLINE_REASON_CODE_PRIOR', P.DECLINE_REASON_CODE); delete P.DECLINE_REASON_CODE; O.splice(O.indexOf('DECLINE_REASON_CODE'), 1); }
    if (note) { set('TIM_NOTE', note + ' [Tim ' + d + ']'); changes.push('TIM_NOTE'); }
  } else if ((kind === 'APPLY_NOW' && val === 'NO') || kind === 'DECLINE') {
    if ((g = guardProtected('decline'))) return g;
    fixed[4] = 'DECLINED_BY_TIM'; fixed[5] = 'RESOLVED/DECLINED_BY_TIM';
    set('TIM_RULING', 'DO_NOT_PURSUE');
    set('DECLINE_REASON_CODE', ruling.code || 'TIM_EXPLICIT_DECLINE');
    set('DECLINE_REASON_TEXT', note || 'Tim explicit decline via Pipeline Explorer');
    set('REOPEN_TRIGGER', 'Tim explicitly overrides.');
    set('TIM_DISPOSITION', 'TIM_PASS_' + d + '_EXPLORER');
    tags.push('TIM_DECLINE_' + d); changes.push('BUCKET', 'DISPOSITION', 'DECLINE_REASON_CODE', 'DECLINE_REASON_TEXT', 'REOPEN_TRIGGER', 'TIM_DISPOSITION');
  } else if (kind === 'APPLIED') {
    if (fixed[4] === 'REJECTED_BY_EMPLOYER' && !ruling.force) return { ok: false, error: 'row is REJECTED_BY_EMPLOYER; APPLIED would regress it (send force:true only with new-application evidence)' };
    fixed[4] = 'APPLIED'; fixed[5] = 'RESOLVED/APPLIED_CONFIRMED';
    set('APP_DATE', evDate); set('APP_STATUS_EVIDENCE', evidence || ('Tim direct statement via Pipeline Explorer ' + d + (note ? ': ' + note : '')));
    set('ANTI_RESURRECTION', 'YES'); set('TIM_RULING', 'APPLIED'); tags.push((evidence ? 'APPLIED_' : 'TIM_APPLIED_') + evDate);
    changes.push('BUCKET', 'DISPOSITION', 'APP_DATE', 'APP_STATUS_EVIDENCE', 'ANTI_RESURRECTION');
  } else if (kind === 'REJECTED_BY_EMPLOYER') {
    if (!evidence && !note) return { ok: false, error: 'REJECTED_BY_EMPLOYER requires evidence (e.g. Gmail id + sender + subject)' };
    fixed[4] = 'REJECTED_BY_EMPLOYER'; fixed[5] = 'RESOLVED/REJECTED_BY_EMPLOYER';
    set('REJECTION_DATE', evDate); set('REJECTION_EVIDENCE', evidence || note);
    set('STATE_SEMANTICS', 'Employer rejected Tim/application; distinct from DECLINED_BY_TIM'); set('ANTI_RESURRECTION', 'YES');
    tags.push('EMPLOYER_REJECTION_' + evDate);
    changes.push('BUCKET', 'DISPOSITION', 'REJECTION_DATE', 'REJECTION_EVIDENCE', 'ANTI_RESURRECTION');
  } else if (kind === 'ENRICH') {
    if (!ruling.fields || typeof ruling.fields !== 'object' || !Object.keys(ruling.fields).length) return { ok: false, error: 'ENRICH requires fields {KEY: value}' };
    var deniedKeys = Object.keys(ruling.fields).filter(function (k) { return isEnrichDenied_(k); });
    if (deniedKeys.length) return { ok: false, error: 'ENRICH cannot set state, application or Tim ruling fields: ' + deniedKeys.join(', ') + ' (use the matching ruling kind or upsert_application)' };
    if (note) { set('ENRICH_NOTE', note); changes.push('ENRICH_NOTE'); }
  } else if (kind === 'IDENTITY') {
    if ((g = guardProtected('correct the identity of'))) return g;
    var idc = identityChange_(fixed, P, O, set, ruling); if (!idc.ok) return idc;
    changes = changes.concat(idc.changed);
  } else if (kind === 'MANUAL_RESEARCH') {
    if ((g = guardProtected('send to research'))) return g;
    fixed[4] = 'MANUAL_RESEARCH'; fixed[5] = 'RESOLVED/NEEDS_RESOLUTION';
    set('TIM_RULING', 'MANUAL_RESEARCH'); if (note) set('RESEARCH_REQUEST', note + ' [Tim ' + d + ']'); tags.push('TIM_RESEARCH_' + d);
    changes.push('BUCKET', 'DISPOSITION', 'TIM_RULING');
  } else if (kind === 'DUPLICATE') {
    if ((g = guardProtected('mark duplicate'))) return g;
    var dupOf = clean_(ruling.dupOf || ''); if (!dupOf) return { ok: false, error: 'DUPLICATE requires dupOf (the PRIMARY_ID of the row it duplicates)' };
    fixed[4] = 'DUPLICATE'; fixed[5] = 'DUPLICATE_CANDIDATE/DUP_OF ' + dupOf;
    set('TIM_RULING', 'DUPLICATE'); set('DUP_OF', dupOf); if (note) set('TIM_NOTE', note + ' [Tim ' + d + ']'); tags.push('TIM_DUPLICATE_' + d);
    changes.push('BUCKET', 'DISPOSITION', 'DUP_OF');
  } else if (kind === 'CLOSED_DEAD') {
    if ((g = guardProtected('close'))) return g;
    fixed[4] = 'CLOSED_DEAD'; fixed[5] = 'RESOLVED/CLOSED_DEAD';
    set('TIM_RULING', 'CLOSED_DEAD'); set('POSTING_STATE', note || 'Closed per Tim ' + d); set('TIM_DISPOSITION', 'TIM_CLOSED_' + d + '_EXPLORER'); tags.push('TIM_CLOSED_' + d);
    changes.push('BUCKET', 'DISPOSITION', 'POSTING_STATE', 'TIM_DISPOSITION');
  } else if (kind === 'INVALID_DISCOVERY') {
    if ((g = guardProtected('invalidate'))) return g;
    fixed[4] = 'INVALID_DISCOVERY'; fixed[5] = 'RESOLVED/INVALID_DISCOVERY';
    set('TIM_RULING', 'INVALID_DISCOVERY'); set('INVALID_REASON', note || 'Not a distinct usable job record (Tim ' + d + ')'); tags.push('TIM_INVALID_' + d);
    changes.push('BUCKET', 'DISPOSITION', 'INVALID_REASON');
  } else return { ok: false, error: 'unknown ruling kind ' + kind + ' ' + val };
  var fr = applyFields_(ruling.fields, P, O, set, flexPolicy);
  if (!fr.ok) return fr;
  changes = changes.concat(fr.changed);
  var actor = String(ruling.actor || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
  var source = (actor || 'TIM_EXPLORER') + ':' + (ruling.requestId || 'no-id');
  // ENRICH is data-only: keep the row's state provenance exactly as it was (absent stays absent) and record the enrichment separately.
  if (kind === 'ENRICH') { set('ENRICH_SOURCE', source); set('ENRICH_UPDATED_AT', ts); }
  else if (kind === 'IDENTITY') { set('IDENTITY_SOURCE', source); set('IDENTITY_UPDATED_AT', ts); }
  else { set('STATE_SOURCE', source); set('STATE_UPDATED_AT', ts); }
  fixed[6] = tags.length ? tags.filter(function (t, i) { return tags.indexOf(t) === i; }).join('; ') : '-';
  var after = fixed.join(' | ') + ' | ' + buildPayload(pp.lead, P, O);
  return { ok: true, after: after, changes: changes, beforeState: beforeState, afterState: fixed[4] + ' / ' + fixed[5], company: fixed[2], title: fixed[3], req: fixed[7] };
}
/** Payload keys a write may never set directly (writer-owned) and intake keys whose prior value is kept as INTAKE_<KEY> when changed. */
var FIELD_DENY = ['STATE_SOURCE', 'STATE_UPDATED_AT', 'PRIMARY_ID', 'BUCKET', 'DISPOSITION', 'ENRICH_SOURCE', 'ENRICH_UPDATED_AT', 'IDENTITY_SOURCE', 'IDENTITY_UPDATED_AT'];
/** Keys an ENRICH may never set: bucket/disposition reasons, application/rejection state, and anything Tim-ruled (TIM_*). Those change only through ruling kinds or upsert_application. */
var ENRICH_DENY = ['DECLINE_REASON_CODE', 'DECLINE_REASON_CODE_PRIOR', 'DECLINE_REASON_TEXT', 'REOPEN_TRIGGER', 'DUP_OF', 'INVALID_REASON', 'RESEARCH_REQUEST', 'POSTING_STATE',
  'APP_DATE', 'APP_STATUS_EVIDENCE', 'APPLICATION_STATUS', 'APPLICATION_RECEIPT_GMAIL_ID', 'REJECTION_DATE', 'REJECTION_EVIDENCE', 'STATE_SEMANTICS', 'ANTI_RESURRECTION', 'UPSERT_KEY'];
function isEnrichDenied_(k) { k = String(k).trim().toUpperCase(); return /^TIM_/.test(k) || ENRICH_DENY.indexOf(k) >= 0; }
var INTAKE_PRESERVE = ['INTAKE_KEY', 'SCOUT_RUN_ID', 'DISCOVERED_AT_ET', 'DISCOVERY_SOURCE', 'SOURCE_URL', 'SOURCE_PROVIDER', 'REQ_ID', 'IDENTITY_CONFIDENCE', 'INITIAL_UNKNOWN_FIELDS', 'DATE_ADDED', 'NOTIFICATION_SOURCE'];
/** Merge {KEY: value} into a parsed payload. Empty values are ignored (nothing is deleted); changed intake keys keep their old value under INTAKE_<KEY>. */
function applyFields_(fields, P, O, set, flexPolicy) {
  var changed = [];
  if (!fields) return { ok: true, changed: changed };
  if (typeof fields !== 'object' || Array.isArray(fields)) return { ok: false, error: 'fields must be an object {KEY: value}' };
  var keys = Object.keys(fields);
  if (keys.length > 60) return { ok: false, error: 'too many fields (max 60)' };
  for (var i = 0; i < keys.length; i++) {
    var k = String(keys[i]).trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,60}$/.test(k)) return { ok: false, error: 'bad field name ' + keys[i] };
    if (FIELD_DENY.indexOf(k) >= 0) return { ok: false, error: 'field ' + k + ' is writer-owned and cannot be set' };
    if (IDENTITY_FIXED_KEYS.indexOf(k) >= 0 || k === 'POSSIBLE_MATCHES') return { ok: false, error: 'field ' + k + ' cannot be set through fields: identity columns and POSSIBLE_MATCHES change only through kind IDENTITY (fixed columns + evidence + reconciliation), so a payload copy can never contradict the row' };
    var v = fields[keys[i]]; if (v === undefined || v === null) continue;
    v = clean_(Array.isArray(v) ? v.join(',') : (typeof v === 'object' ? JSON.stringify(v) : v)).slice(0, 1500);
    if (v === '') continue;
    if (['SOURCE_URL','INITIATING_URL','COMPANY_SOURCE_URL'].indexOf(k)>=0 && !/^https?:\/\/[^\s]+$/i.test(v)) return { ok: false, error: 'URL must be a usable http(s) initiating or company source link' };
    if ((k === 'FLEX' || k === 'FLEX_HINT') && !/^(YES|HIGH_FLEX|SOFT|SOFT_FLEX|NO|NO_FLEX|STRICT_NO|STRICT|UNKNOWN)$/i.test(v)) return { ok: false, error: k + ' must be YES, SOFT, NO, STRICT_NO, or UNKNOWN' };
    if(k==='INITIATING_URL'&&P.INITIATING_URL&&P.INITIATING_URL!==v)return {ok:false,error:'INITIATING_URL is immutable; retain the original link'};
    if(k==='SOURCE_URL'&&!P.INITIATING_URL)set('INITIATING_URL',PipelinePolicy.links(P).initiating||v);
    if (P[k] === v) continue;
    if (INTAKE_PRESERVE.indexOf(k) >= 0 && P[k] && P['INTAKE_' + k] === undefined) set('INTAKE_' + k, P[k]);
    set(k, v); changed.push(k);
  }
  // FLEX is derived only when this write actually changes FLEX/degree evidence.
  // Unrelated ENRICH writes must preserve existing FLEX_CLASS/FLEX_MODIFIER byte-for-byte
  // and must not create UNKNOWN/0 placeholders.
  // A direct FLEX_CLASS/FLEX_MODIFIER write is also FLEX evidence: derive it so the pair stays valid and consistent.
  var flexEvidenceKeys = ['FLEX','FLEX_HINT','DEGREE_TEXT','DEGREE_REQ','DEGREE','REQUIREMENTS_REVIEWED','DEGREE_SINGLE_PATH_CONFIRMED','FLEX_CLASS','FLEX_MODIFIER'];
  var inputKeys = keys.map(function (rawKey) { return String(rawKey).trim().toUpperCase(); });
  var flexEvidenceChanged = inputKeys.some(function (k) { return flexEvidenceKeys.indexOf(k) >= 0; });
  if (flexEvidenceChanged) {
    var directFlexChanged = inputKeys.some(function (k) { return ['FLEX','FLEX_HINT','FLEX_CLASS','FLEX_MODIFIER'].indexOf(k) >= 0; });
    var degreeEvidenceChanged = inputKeys.some(function (k) { return ['DEGREE_TEXT','DEGREE_REQ','DEGREE','REQUIREMENTS_REVIEWED','DEGREE_SINGLE_PATH_CONFIRMED'].indexOf(k) >= 0; });
    if (inputKeys.indexOf('FLEX') >= 0 || inputKeys.indexOf('FLEX_HINT') >= 0) delete P.FLEX_CLASS;
    var normalizedPolicy = PipelinePolicy.normalizeFlexPolicy ? PipelinePolicy.normalizeFlexPolicy(flexPolicy || {}) : (flexPolicy || {});
    var f = PipelinePolicy.flex(P, normalizedPolicy);
    if (normalizedPolicy.FRESH_DEGREE_OVERRIDES_STALE_CLASS === 'YES' && degreeEvidenceChanged && !directFlexChanged) {
      // Fresh degree evidence replaces the stale class only when it is conclusive; inconclusive text never wipes a known class (or a STRICT hold) to UNKNOWN.
      var flexInput = {};
      Object.keys(P).forEach(function (pk) { flexInput[pk] = P[pk]; });
      delete flexInput.FLEX_CLASS;
      delete flexInput.FLEX;
      delete flexInput.FLEX_HINT;
      var fresh = PipelinePolicy.flex(flexInput, normalizedPolicy);
      if (fresh.known) f = fresh;
    }
    set('FLEX_CLASS', f.class);
    set('FLEX_MODIFIER', String(f.modifier));
  }
  var raw=Number(P.SCOPE_FIT_RAW||P.RAW_FIT);if((P.SCOPE_FIT_RAW||P.RAW_FIT)!==undefined&&isFinite(raw)){var a=PipelinePolicy.assess(P,raw,flexPolicy);set('ADJUSTED_FIT',String(a.adjustedFit));set('PURSUIT_STATUS',a.decision);}
  return { ok: true, changed: changed };
}
/**
 * Email-confirmed application/rejection upsert (Tim directive DIRECTIVE_EMAIL_CONFIRMED_UPSERT_2026-09-29).
 * ev = { COMPANY, TITLE, STATE: APPLIED|REJECTED_BY_EMPLOYER, EVENT_DATE (YYYY-MM-DD), EVIDENCE, REQ_ID?, LOCATION?, SOURCE_URL?, TARGET_PRIMARY_ID?, NOTE?, actor?, requestId? }
 * Exactly one existing row (TARGET_PRIMARY_ID, else req/URL/employer+title+location identity) -> that row is ruled in place.
 * No match -> one new row in the target bucket. Ambiguous -> HOLD (nothing written; resend with TARGET_PRIMARY_ID).
 * Replays are no-ops: the UPSERT_KEY is stored on the row.
 */
function planUpsertApplication(lines, ev, ctx) {
  ctx = ctx || {}; ev = ev || {};
  var state = String(ev.STATE || ev.state || '').toUpperCase();
  if (state === 'REJECTED') state = 'REJECTED_BY_EMPLOYER';
  if (state !== 'APPLIED' && state !== 'REJECTED_BY_EMPLOYER') return { ok: false, mode: 'INVALID', error: 'STATE must be APPLIED or REJECTED_BY_EMPLOYER' };
  var company = clean_(ev.COMPANY || ''), title = clean_(ev.TITLE || ''), evidence = clean_(ev.EVIDENCE || '');
  if (!evidence) return { ok: false, mode: 'INVALID', error: 'EVIDENCE is required (e.g. Gmail id, sender, subject, date)' };
  var now = ctx.now || new Date().toISOString();
  var evDate = /^\d{4}-\d{2}-\d{2}/.test(String(ev.EVENT_DATE || '')) ? String(ev.EVENT_DATE).slice(0, 10) : today_(now);
  var upsertKey = 'UK-' + hashHex([state, normEmployer(company), normTitle(title), reqCore(ev.REQ_ID), evidence].join('|')).slice(0, 16);
  var ruling = { kind: state, eventDate: evDate, evidence: evidence, note: ev.NOTE || '', ts: now, actor: ev.actor || ev.ACTOR || 'EMAIL_UPSERT', requestId: ev.requestId || upsertKey, fields: { UPSERT_KEY: upsertKey } };
  var target = String(ev.TARGET_PRIMARY_ID || '').trim(), hits = [];
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i]; if (!/^\d+ \| /.test(t)) continue;
    if (t.indexOf('UPSERT_KEY=' + upsertKey) >= 0) return { ok: true, mode: 'ALREADY_APPLIED', index: i, primaryId: t.split(' | ')[1], upsertKey: upsertKey };
    if (target && t.split(' | ')[1].trim() === target) hits.push(i);
  }
  if (target) {
    if (hits.length !== 1) return { ok: false, mode: 'HOLD', error: 'TARGET_PRIMARY_ID ' + target + ' matches ' + hits.length + ' rows (fail closed)' };
    var mt = mutateRow(lines[hits[0]], ruling, ctx.flexPolicy); if (!mt.ok) return { ok: false, mode: 'HOLD', error: mt.error };
    return { ok: true, mode: 'UPDATE', index: hits[0], primaryId: target, matchedBy: 'TARGET_PRIMARY_ID', after: mt.after, mutation: mt, upsertKey: upsertKey };
  }
  if (!company || !title) return { ok: false, mode: 'INVALID', error: 'COMPANY and TITLE are required (or TARGET_PRIMARY_ID)' };
  var idx = indexExisting(lines);
  var m = matchExisting({ COMPANY: company, TITLE: title, LOCATION: ev.LOCATION || '', REQ_ID: ev.REQ_ID || '', SOURCE_URL: ev.SOURCE_URL || '' }, idx);
  if (m.kind === 'ambiguous') return { ok: false, mode: 'HOLD', error: 'identity ambiguous (' + m.by + '); resend with TARGET_PRIMARY_ID', possibleMatches: m.rows.map(function (r) { return r.id + ' [' + r.bucket + '] ' + r.location; }) };
  if (m.kind === 'exact') {
    var row = m.rows[0], li = -1;
    for (var j = 0; j < lines.length; j++) if (/^\d+ \| /.test(lines[j]) && lines[j].split(' | ')[1].trim() === row.id) { if (li >= 0) return { ok: false, mode: 'HOLD', error: 'PRIMARY_ID ' + row.id + ' is not unique (fail closed)' }; li = j; }
    var mu = mutateRow(lines[li], ruling, ctx.flexPolicy); if (!mu.ok) return { ok: false, mode: 'HOLD', error: mu.error };
    return { ok: true, mode: 'UPDATE', index: li, primaryId: row.id, matchedBy: m.by, after: mu.after, mutation: mu, upsertKey: upsertKey };
  }
  var eventUrl=PipelinePolicy.links(ev).preferred;if(!eventUrl)return {ok:false,mode:'HOLD',error:'SOURCE_URL_REQUIRED: provide the initiating posting or email click-through URL for a new row'};
  var maxInv = 0, seen = {}; idx.forEach(function (r) { if (r.inv > maxInv) maxInv = r.inv; seen[r.id] = true; });
  var inv = maxInv + 1, pid = 'V2E-' + hashHex(upsertKey + '|' + inv).slice(0, 12).toUpperCase();
  while (seen[pid]) pid = 'V2E-' + hashHex(pid + '|x').slice(0, 12).toUpperCase();
  var P = {}, O = [];
  function set(k, v) { if (v === undefined || v === null || v === '') return; if (O.indexOf(k) < 0) O.push(k); P[k] = clean_(v); }
  set('UPSERT_KEY', upsertKey);
  if (state === 'APPLIED') { set('APP_DATE', evDate); set('APP_STATUS_EVIDENCE', evidence); }
  else { set('REJECTION_DATE', evDate); set('REJECTION_EVIDENCE', evidence); set('STATE_SEMANTICS', 'Employer rejected Tim/application; distinct from DECLINED_BY_TIM'); }
  set('SOURCE_URL', eventUrl); set('INITIATING_URL',eventUrl); set('REQ_ID', ev.REQ_ID); set('ANTI_RESURRECTION', 'YES');
  if (ev.NOTE) set('NOTE', ev.NOTE);
  var fr = applyFields_(ev.fields, P, O, set, ctx.flexPolicy); if (!fr.ok) return { ok: false, mode: 'INVALID', error: fr.error };
  set('DATE_ADDED', today_(now)); set('MASTER_LOADED_AT', now); set('NOTIFICATION_SOURCE', 'EMAIL'); set('STATE_SOURCE', String(ruling.actor).toUpperCase().replace(/[^A-Z0-9_]/g, '') + ':' + ruling.requestId); set('STATE_UPDATED_AT', now);
  var disp = state === 'APPLIED' ? 'RESOLVED/APPLIED_CONFIRMED' : 'RESOLVED/REJECTED_BY_EMPLOYER';
  var tag = (state === 'APPLIED' ? 'APPLIED_' : 'EMPLOYER_REJECTION_') + evDate;
  var line = [String(inv), pid, company, title, state, disp, 'EMAIL_UPSERT_' + today_(now) + '; ' + tag + '; ANTI_RESURRECTION', clean_(ev.REQ_ID || '') || 'UNCAPTURED', clean_(ev.LOCATION || '') || 'NOT_STATED'].join(' | ') + ' | ' + buildPayload('EMAIL_CONFIRMED_UPSERT', P, O);
  return { ok: true, mode: 'CREATE', primaryId: pid, inv: inv, newLine: line, upsertKey: upsertKey };
}
/** COUNTS: line from row BUCKET cells, preserving existing key order, adding new buckets. */
function recomputeCountsLine(lines) {
  var counts = {}, total = 0, unaccounted = 0, existing = null;
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i];
    if (/^COUNTS:/.test(t)) existing = t;
    else if (/^\d+ \| /.test(t)) { var c = t.split(' | '); var b = (c[4] || '').trim(); if (c.length >= FIXED_N + 1 && b) { counts[b] = (counts[b] || 0) + 1; total++; } else unaccounted++; }
  }
  var order = [];
  if (existing) existing.replace(/^COUNTS:\s*/, '').split(/\s+/).forEach(function (tok) { var m = tok.match(/^([A-Z_]+)=/); if (m && m[1] !== 'TOTAL' && m[1] !== 'UNACCOUNTED' && order.indexOf(m[1]) < 0) order.push(m[1]); });
  BUCKETS.forEach(function (b) { if (order.indexOf(b) < 0 && counts[b]) order.push(b); }); // new buckets appear once they have rows; a master without them keeps its COUNTS line byte-identical
  Object.keys(counts).forEach(function (b) { if (order.indexOf(b) < 0) order.push(b); });
  return 'COUNTS: TOTAL=' + total + ' ' + order.map(function (b) { return b + '=' + (counts[b] || 0); }).join(' ') + ' UNACCOUNTED=' + unaccounted;
}
/** END V2_CURRENT_POPULATION_MASTER (N rows) from well-formed rows; null if the file has no END line. */
function recomputeEndLine(lines) {
  var has = false, n = 0;
  for (var i = 0; i < lines.length; i++) { var t = lines[i]; if (/^END V2_CURRENT_POPULATION_MASTER/.test(t)) has = true; else if (/^\d+ \| /.test(t) && t.split(' | ').length >= FIXED_N + 1 && (t.split(' | ')[4] || '').trim()) n++; }
  return has ? 'END V2_CURRENT_POPULATION_MASTER (' + n + ' rows)' : null;
}

/* ================= pure functions: identity + dedupe ================= */
function normEmployer(s) {
  s = String(s || '').toLowerCase().split(' / ')[0].split(' (')[0];
  s = s.replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(inc|llc|l l c|corp|corporation|co|company|ltd|limited|plc|group|holdings|the|careers)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}
function normTitle(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|of|and|a|an|sr|senior|jr)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
function normLocation(s) { s = String(s || '').toLowerCase(); if (!s || /not_stated|not stated|unknown|^-$/.test(s)) return ''; return s.replace(/\b(metropolitan area|metro area|area|united states|usa|us)\b/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function reqTokens(s) { var out = []; String(s || '').replace(/[A-Za-z]*[-_ ]?\d{5,}[A-Za-z0-9-]*/g, function (m) { out.push(m.replace(/[^A-Za-z0-9]/g, '').toUpperCase()); }); return out; }
function reqCore(s) { var t = reqTokens(s); return t.length ? t[0].replace(/^(LI|GH|WD|JR|R|REQ)/, '') : ''; }
function canonUrl(u) {
  u = String(u || '').trim(); if (!/^https?:\/\//i.test(u)) return '';
  var m = u.match(/^https?:\/\/([^\/?#]+)([^?#]*)/i); if (!m) return '';
  var host = m[1].toLowerCase().replace(/^www\./, ''), path = (m[2] || '/').replace(/\/+$/, '').toLowerCase();
  var lj = u.match(/linkedin\.com\/jobs\/view\/(?:[^\/?#]*-)?(\d{6,})/i); if (lj) return 'linkedin.com/jobs/view/' + lj[1];
  var ij = u.match(/indeed\.com\/.*[?&]jk=([a-z0-9]+)/i); if (ij) return 'indeed.com/jk/' + ij[1];
  // Glassdoor and Greenhouse-embedded career pages carry the job id in the query; host+path alone names every job on that page
  var gd = u.match(/glassdoor\.[a-z.]+\/[^#]*[?&](?:jobListingId|jl)=(\d+)/i); if (gd) return 'glassdoor.com/job/' + gd[1];
  if (/(^|\.)glassdoor\./.test(host) && /joblisting\.htm$/.test(path)) return '';
  var gh = u.match(/[?&]gh_jid=(\d+)/i); if (gh) return host + path + '?gh_jid=' + gh[1];
  return host + path;
}
function urlsIn(text) { var out = []; String(text || '').replace(/https?:\/\/[^\s"<>|;]+/gi, function (m) { var c = canonUrl(m); if (c) out.push(c); }); return out; }
function hashHex(s) {
  if (typeof Utilities !== 'undefined') { var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8); return d.map(function (b) { b = (b + 256) % 256; return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
  return require('crypto').createHash('sha256').update(String(s), 'utf8').digest('hex');
}
function nowET_() {
  if (typeof Utilities !== 'undefined') return Utilities.formatDate(new Date(), 'America/New_York', "yyyy-MM-dd HH:mm 'ET'");
  var p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date()); var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
  return o.year + '-' + o.month + '-' + o.day + ' ' + (o.hour % 24 < 10 ? '0' : '') + (o.hour % 24) + ':' + o.minute + ' ET';
}
function num_(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
/** Index existing rows for dedupe. */
function indexExisting(lines) {
  var rows = [];
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i]; if (!/^\d+ \| /.test(t)) continue;
    var c = t.split(' | '); if (c.length < FIXED_N + 1) continue;
    var pp = parsePayload(c.slice(FIXED_N).join(' | '));
    // Every URL field the Writer reads or writes on a row takes part in dedupe; SOURCE is the legacy reader (22 live rows).
    var urls = urlsIn(c[7]).concat(urlsIn(pp.payload.SOURCE || ''), urlsIn(pp.payload.SOURCE_URL || ''), urlsIn(pp.payload.INITIATING_URL || ''), urlsIn(pp.payload.COMPANY_SOURCE_URL || ''), urlsIn(pp.payload.INTAKE_SOURCE_URL || ''));
    rows.push({ inv: parseInt(c[0], 10), id: c[1].trim(), company: c[2], title: c[3], bucket: c[4], location: c[8], reqTokens: reqTokens(c[7]), reqCores: reqTokens(c[7]).map(function (x) { return x.replace(/^(LI|GH|WD|JR|R|REQ)/, ''); }), urls: urls, ne: normEmployer(c[2]), nt: normTitle(c[3]), nl: normLocation(c[8]), intakeKey: pp.payload.INTAKE_KEY || '' });
  }
  return rows;
}
/** Find matches for one intake record. Returns {kind:'none'|'exact'|'ambiguous', rows:[...], by:''} */
function matchExisting(rec, idx) {
  var key = rec.INTAKE_KEY;
  if (key) { var k = idx.filter(function (r) { return r.intakeKey === key; }); if (k.length) return { kind: 'exact', rows: k, by: 'INTAKE_KEY' }; }
  var rc = reqCore(rec.REQ_ID || '');
  var ne = normEmployer(rec.COMPANY), nt = normTitle(rec.TITLE), nl = normLocation(rec.LOCATION);
  var cu = canonUrl(rec.SOURCE_URL || '');
  if (rc && rc.length >= 5) {
    // requisition ids are employer-local: exact only with the same normalized employer, or when the record's canonical URL binds it to that row
    var byReq = idx.filter(function (r) { return r.reqCores.indexOf(rc) >= 0; });
    var byReqEmp = byReq.filter(function (r) { return ne && r.ne === ne; });
    var byReqUrl = byReq.filter(function (r) { return cu && r.urls.indexOf(cu) >= 0; });
    if (byReqEmp.length === 1) return { kind: 'exact', rows: byReqEmp, by: 'REQ_ID' };
    if (byReqEmp.length > 1) return { kind: 'ambiguous', rows: byReqEmp, by: 'REQ_ID' };
    if (byReqUrl.length === 1) return { kind: 'exact', rows: byReqUrl, by: 'REQ_ID+SOURCE_URL' };
    if (byReq.length) return { kind: 'ambiguous', rows: byReq, by: 'REQ_ID (employer differs)' };
  }
  if (cu && !/^(linkedin\.com\/jobs\/search|indeed\.com\/jobs)/.test(cu) && cu.length > 12) { var byUrl = idx.filter(function (r) { return r.urls.indexOf(cu) >= 0; }); if (byUrl.length === 1) return { kind: 'exact', rows: byUrl, by: 'SOURCE_URL' }; if (byUrl.length > 1) return { kind: 'ambiguous', rows: byUrl, by: 'SOURCE_URL' }; }
  if (ne && nt) {
    // employer+title is a provisional identity: exact only when BOTH normalized locations are present and equal and exactly one row matches.
    // A missing location on either side never resolves identity (a later distinct req at the same employer/title must not be swallowed); fail closed.
    var byId = idx.filter(function (r) { return r.ne === ne && r.nt === nt; });
    if (byId.length) {
      var sameLoc = byId.filter(function (r) { return nl && r.nl && r.nl === nl; });
      if (sameLoc.length === 1) return { kind: 'exact', rows: sameLoc, by: 'EMPLOYER_TITLE_LOCATION' };
      if (sameLoc.length > 1) return { kind: 'ambiguous', rows: sameLoc, by: 'EMPLOYER_TITLE_LOCATION' };
      return { kind: 'ambiguous', rows: byId, by: nl && byId.every(function (r) { return r.nl; }) ? 'EMPLOYER_TITLE (location differs)' : 'EMPLOYER_TITLE (location unstated)' };
    }
  }
  return { kind: 'none', rows: [], by: '' };
}
/* ================= pure functions: never-consider rules ================= */
/**
 * Parse the canonical TIM_NEVER_CONSIDER_RULES text (KEY=VALUE lines; rule blocks start at RULE_ID=).
 * Returns { status, defaultAction, header:{...}, rules:[{RULE_ID, CATEGORY, ACTION, MATCH, DO_NOT_MATCH, REASON, EXCEPTION, STATUS, active}], activeIds:[] }.
 * The Doc is the only authority: nothing is invented here, no category is hard-coded, an unreadable file yields status UNAVAILABLE and default ALLOW_INTAKE.
 */
function parseRulesText(text) {
  var out = { source: 'TIM_NEVER_CONSIDER_RULES', status: 'UNAVAILABLE', defaultAction: 'ALLOW_INTAKE', header: {}, rules: [], activeIds: [], error: '' };
  if (!text || typeof text !== 'string') { out.error = 'empty rules text'; return out; }
  var lines = text.replace(/\\_/g, '_').split(/\r?\n/), cur = null, inRules = false;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].trim(); if (!l) continue;
    if (/^ACTIVE RULES$/i.test(l)) { inRules = true; continue; }
    if (/^(SCOUT REQUIRED OUTPUT|RUN-LEVEL COUNTERS|QUALITY PRINCIPLE|CHANGE CONTROL|END TIM_NEVER_CONSIDER_RULES)/i.test(l)) { if (cur) { out.rules.push(cur); cur = null; } inRules = false; continue; }
    var m = l.match(/^([A-Z][A-Z0-9_\-]*)=(.*)$/); if (!m) continue;
    var k = m[1], v = m[2].trim();
    if (k === 'RULE_ID') { if (cur) out.rules.push(cur); cur = { RULE_ID: v, CATEGORY: '', ACTION: '', MATCH: '', DO_NOT_MATCH: '', REASON: '', EXCEPTION: '', STATUS: '' }; continue; }
    if (cur) { cur[k] = v; continue; }
    if (!inRules) out.header[k] = v;
  }
  if (cur) out.rules.push(cur);
  out.rules.forEach(function (r) { r.active = String(r.STATUS || '').toUpperCase() === 'ACTIVE'; if (r.active) out.activeIds.push(r.RULE_ID); });
  out.defaultAction = out.header.DEFAULT_ACTION || 'ALLOW_INTAKE';
  out.status = out.rules.length ? (String(out.header.STATUS || 'ACTIVE').toUpperCase()) : 'UNAVAILABLE';
  if (!out.rules.length) out.error = 'no RULE_ID blocks found';
  return out;
}
function parseCanonicalNeverConsiderRules(text) {
  var out = { source: 'TIM_PIPELINE_RULES_CANONICAL', status: 'UNAVAILABLE', defaultAction: 'ALLOW_INTAKE', header: {}, rules: [], activeIds: [], error: '' };
  if (!text || typeof text !== 'string') { out.error = 'empty canonical rules text'; return out; }
  var lines = text.replace(/\\_/g, '_').split(/\r?\n/), inSection = false;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].trim(); if (!l) continue;
    var hm = l.match(/^([A-Z][A-Z0-9_\-]*)=(.*)$/);
    if (hm && !inSection) out.header[hm[1]] = hm[2].trim();
    if (/^SECTION=NEVER_CONSIDER$/i.test(l)) { inSection = true; continue; }
    if (inSection && /^SECTION=/i.test(l)) break;
    if (!inSection) continue;
    if (/^DEFAULT_ACTION=/i.test(l)) { out.defaultAction = l.split('=').slice(1).join('=').trim() || 'ALLOW_INTAKE'; continue; }
    var m = l.match(/^[-*]\s+(NC-\d+)\s+([A-Z0-9_\-]+):\s*(.+)$/i);
    if (!m) continue;
    var rule = {
      RULE_ID: String(m[1]).toUpperCase(),
      CATEGORY: String(m[2]).toUpperCase(),
      ACTION: 'DO_NOT_ADD',
      MATCH: m[3].trim(),
      DO_NOT_MATCH: 'Industrial suppliers, equipment makers, automation/integration firms, software vendors, logistics providers, component suppliers, consulting firms, and engineering firms are not excluded merely because they serve this industry.',
      REASON: m[3].trim(),
      EXCEPTION: 'Tim may override explicitly.',
      STATUS: 'ACTIVE',
      active: true
    };
    out.rules.push(rule); out.activeIds.push(rule.RULE_ID);
  }
  var status = String(out.header.STATUS || '').toUpperCase();
  if (status !== 'ACTIVE') {
    out.status = 'UNAVAILABLE';
    out.error = 'canonical rules STATUS is not ACTIVE';
    out.rules.forEach(function(r){ r.active = false; r.STATUS = 'INACTIVE'; });
    out.activeIds = [];
    return out;
  }
  out.status = out.rules.length ? 'ACTIVE' : 'UNAVAILABLE';
  if (!out.rules.length) out.error = 'no NC rule lines found in SECTION=NEVER_CONSIDER';
  return out;
}
function ruleById(R, id) { id = String(id || '').trim().toUpperCase(); for (var i = 0; i < (R.rules || []).length; i++) if (String(R.rules[i].RULE_ID).toUpperCase() === id) return R.rules[i]; return null; }
/** Words of a CATEGORY (e.g. FOOD_OR_BEVERAGE_MANUFACTURER) that may hint at the domain. Used only to flag a review, never to exclude. */
function categoryTerms(cat) { var stop = { OR: 1, AND: 1, MANUFACTURER: 1, SERVICE: 1, OF: 1, THE: 1 }; return String(cat || '').toUpperCase().split(/[^A-Z]+/).filter(function (w) { return w && !stop[w] && w.length > 3; }).map(function (w) { return w.toLowerCase(); }); }
/** Evidence that the employer is one of the cases every rule's DO_NOT_MATCH / general rule 2 protects: supplier, equipment/machine maker, automation, software, integrator, consultancy, engineering firm, logistics, component supplier, or "serving" an industry. */
var PROTECTED_CASE_RE = /\b(supplier|supplies|serving|serves|customers? in|for the|equipment for|equipment maker|equipment manufacturer|packaging equipment|process equipment|machine builder|automation|integrator|integration|consult(ing|ancy)?|software|logistics|component|engineering firm|contract engineering|vendor|to the)\b/;
var NEG_HINT_RE = PROTECTED_CASE_RE;
function protectedCaseEvidence(rec) { var e = String((rec.EMPLOYER_DOMAIN_HINT || '') + ' ' + (rec.EMPLOYER_PRIMARY_BUSINESS || '')).toLowerCase(); var m = e.match(PROTECTED_CASE_RE); return m ? m[0] : ''; }
/**
 * Classify one record. Outcome EXCLUDE only when Scout cites an ACTIVE rule with EXCLUSION_CONFIDENCE=HIGH (the file says Scout classifies;
 * the writer verifies against the canonical file). MED/LOW, an unknown rule id, an unavailable file, or a writer-side domain hint all
 * yield REVIEW (admit + NEVER_CONSIDER_REVIEW_NEEDED). Unknown/incomplete information is never a basis. Title is never a basis.
 */
function classifyNeverConsider(rec, R) {
  R = R || { status: 'UNAVAILABLE', rules: [] };
  var cited = String(rec.NEVER_CONSIDER_RULE_ID || '').trim().toUpperCase();
  var conf = String(rec.EXCLUSION_CONFIDENCE || '').trim().toUpperCase(); if (conf === 'MEDIUM') conf = 'MED';
  var reason = rec.EXCLUSION_REASON || rec.NEVER_CONSIDER_REASON || '';
  if (cited) {
    var rule = ruleById(R, cited);
    if (R.status === 'UNAVAILABLE') return { outcome: 'REVIEW', ruleId: cited, confidence: conf || 'UNSPECIFIED', reason: reason, basis: 'RULES_UNAVAILABLE' };
    if (!rule) return { outcome: 'REVIEW', ruleId: cited, confidence: conf || 'UNSPECIFIED', reason: reason, basis: 'UNKNOWN_RULE_ID' };
    if (!rule.active) return { outcome: 'REVIEW', ruleId: cited, confidence: conf || 'UNSPECIFIED', reason: reason, basis: 'RULE_INACTIVE' };
    if (String(rule.ACTION || '').toUpperCase() !== 'DO_NOT_ADD') return { outcome: 'REVIEW', ruleId: cited, confidence: conf || 'UNSPECIFIED', reason: reason, basis: 'RULE_ACTION_' + (rule.ACTION || 'UNSET') };
    if (conf === 'HIGH') {
      // HIGH is necessary, not sufficient: supplied employer evidence that names a protected case (DO_NOT_MATCH) wins over the classification
      var pc = protectedCaseEvidence(rec);
      if (pc) return { outcome: 'REVIEW', ruleId: rule.RULE_ID, confidence: 'HIGH', reason: reason, basis: 'EVIDENCE_CONFLICT_DO_NOT_MATCH:' + pc };
      return { outcome: 'EXCLUDE', ruleId: rule.RULE_ID, confidence: 'HIGH', reason: reason || rule.REASON, basis: 'SCOUT_CLASSIFICATION' };
    }
    return { outcome: 'REVIEW', ruleId: rule.RULE_ID, confidence: conf || 'UNSPECIFIED', reason: reason, basis: 'CONFIDENCE_NOT_HIGH' };
  }
  // writer-side hint: the employer's stated primary business mentions a category word and does not read as a supplier/vendor to it
  var hint = String(rec.EMPLOYER_DOMAIN_HINT || rec.EMPLOYER_PRIMARY_BUSINESS || '').toLowerCase();
  if (hint && R.status !== 'UNAVAILABLE' && !NEG_HINT_RE.test(hint)) {
    for (var i = 0; i < R.rules.length; i++) { var r = R.rules[i]; if (!r.active) continue;
      var terms = categoryTerms(r.CATEGORY); for (var j = 0; j < terms.length; j++) { if (new RegExp('(^|[^a-z])' + terms[j] + '([^a-z]|$)').test(hint)) return { outcome: 'REVIEW', ruleId: r.RULE_ID, confidence: 'MED', reason: 'employer primary business mentions "' + terms[j] + '"', basis: 'DOMAIN_HINT' }; } }
  }
  return { outcome: 'ALLOW', ruleId: '', confidence: '', reason: '', basis: '' };
}
/* ================= pure functions: intake planning ================= */
var INTAKE_FACT_KEYS = ['PAY_POSTED', 'DEGREE_TEXT', 'FLEX_HINT', 'REPORTING_LEVEL', 'EMPLOYER_DOMAIN_HINT', 'SCOUT_NOTES', 'POSTING_DATE', 'REMOTE_HYBRID'];
function sanitizeRecord(rec) {
  var out = {}; if (!rec || typeof rec !== 'object') return null;
  ['INTAKE_KEY', 'COMPANY', 'TITLE', 'LOCATION', 'REQ_ID', 'SOURCE', 'SOURCE_URL', 'INITIATING_URL', 'COMPANY_SOURCE_URL', 'SOURCE_PROVIDER', 'DISCOVERY_SOURCE', 'DISCOVERED_AT_ET', 'IDENTITY_CONFIDENCE', 'PROPOSED_BUCKET', 'EMPLOYER_PRIMARY_BUSINESS', 'NEVER_CONSIDER_RULE_ID', 'NEVER_CONSIDER_REASON', 'EXCLUSION_CONFIDENCE', 'EXCLUSION_REASON'].concat(INTAKE_FACT_KEYS).forEach(function (k) { if (rec[k] !== undefined && rec[k] !== null) out[k] = clean_(rec[k]).slice(0, 400); });
  var unk = rec.INITIAL_UNKNOWN_FIELDS; out.INITIAL_UNKNOWN_FIELDS = Array.isArray(unk) ? unk.map(clean_).filter(Boolean).join(',') : clean_(unk || '');
  out.SOURCE_URL=PipelinePolicy.links(out).preferred;
  if (out.SOURCE_URL && !/^https?:\/\//i.test(out.SOURCE_URL)) out.SOURCE_URL = '';
  if (out.SOURCE && !out.DISCOVERY_SOURCE) out.DISCOVERY_SOURCE = out.SOURCE;
  return out;
}
function planIntake(lines, records, rulesObj, ctx) {
  ctx = ctx || {}; var results = [], newLines = [], excluded = [], summary = { NEVER_CONSIDER_EXCLUDED: 0, SCOUT_INTAKE_WRITTEN: 0, DISCOVERY_LEAD_WRITTEN: 0, EXISTING_MATCH: 0, WRITE_FAILED: 0, ENTERED_MASTER: 0, NEVER_CONSIDER_REVIEW_NEEDED: 0, REPLAY: 0, AMBIGUOUS_LEAD: 0 }, byRule = {};
  var R = rulesObj && rulesObj.rules ? rulesObj : { status: 'UNAVAILABLE', rules: [], activeIds: [] };
  if (!Array.isArray(records)) return { ok: false, error: 'records must be an array' };
  // Scout's pre-excluded list is NOT accepted as already excluded: every entry is a candidate that goes through the same
  // classification/admission path below (the writer, not Scout, owns NEVER_CONSIDER_EXCLUDED). Kept for backward compatibility only.
  var pre = preExclusionCandidates(ctx.run || {});
  records = records.map(function (r) { return r; }).concat(pre);
  if (records.length > 200) return { ok: false, error: 'batch too large (max 200 including run.NEVER_CONSIDER_EXCLUDED entries)' };
  var idx = indexExisting(lines);
  var maxInv = 0, seenIds = {}; idx.forEach(function (r) { if (r.inv > maxInv) maxInv = r.inv; seenIds[r.id] = true; });
  var run = ctx.run || {}; var runId = clean_(run.SCOUT_RUN_ID || ''); var now = ctx.now || new Date().toISOString(); var nowET = ctx.nowET || '';
  var batchKeys = {};
  for (var i = 0; i < records.length; i++) {
    var rec = sanitizeRecord(records[i]);
    var via = records[i] && records[i].SUBMITTED_VIA === 'RUN_PRE_EXCLUSION' ? 'RUN_PRE_EXCLUSION' : 'RECORDS';
    var res = { index: i, SUBMITTED_VIA: via, INTAKE_KEY: '', result: '', PRIMARY_ID: '', INV: null, BUCKET: '', matchedBy: '', detail: '', NEVER_CONSIDER_RULE_ID: '', NEVER_CONSIDER_REVIEW_NEEDED: '' };
    if (!rec || !rec.COMPANY || !rec.TITLE) { res.result = 'WRITE_FAILED'; res.detail = 'INVALID_INPUT: COMPANY and TITLE are required' + (via === 'RUN_PRE_EXCLUSION' ? ' (pre-excluded entry lacks them; resubmit as a record)' : ''); summary.WRITE_FAILED++; results.push(res); continue; }
    if (!rec.INTAKE_KEY) rec.INTAKE_KEY = 'IK-' + hashHex([runId, normEmployer(rec.COMPANY), normTitle(rec.TITLE), normLocation(rec.LOCATION), reqCore(rec.REQ_ID), canonUrl(rec.SOURCE_URL)].join('|')).slice(0, 16);
    res.INTAKE_KEY = rec.INTAKE_KEY;
    if (batchKeys[rec.INTAKE_KEY]) { res.result = 'EXISTING_MATCH'; res.PRIMARY_ID = batchKeys[rec.INTAKE_KEY]; res.matchedBy = 'INTAKE_KEY (same batch)'; res.detail = 'REPLAY'; summary.EXISTING_MATCH++; summary.REPLAY++; results.push(res); continue; }
    var nc = classifyNeverConsider(rec, R);
    if (nc.outcome === 'EXCLUDE') {
      res.result = 'NEVER_CONSIDER_EXCLUDED'; res.NEVER_CONSIDER_RULE_ID = nc.ruleId; res.detail = nc.ruleId + ' ' + nc.confidence + ' (' + nc.basis + ')'; summary.NEVER_CONSIDER_EXCLUDED++; byRule[nc.ruleId] = (byRule[nc.ruleId] || 0) + 1;
      excluded.push({ SCOUT_RUN_ID: runId || 'UNSPECIFIED', DISCOVERED_AT_ET: rec.DISCOVERED_AT_ET || nowET, COMPANY: rec.COMPANY, TITLE: rec.TITLE, LOCATION: rec.LOCATION || 'NOT_STATED', SOURCE: rec.DISCOVERY_SOURCE || 'Scout', SOURCE_URL: rec.SOURCE_URL || '', NEVER_CONSIDER_RULE_ID: nc.ruleId, EXCLUSION_CONFIDENCE: nc.confidence, EXCLUSION_REASON: nc.reason, TIM_OVERRIDE: 'NO', INTAKE_KEY: rec.INTAKE_KEY, BASIS: nc.basis, SUBMITTED_VIA: via, DECIDED_BY: 'WRITER' });
      results.push(res); continue;
    }
    if (nc.outcome === 'REVIEW') { res.NEVER_CONSIDER_REVIEW_NEEDED = nc.ruleId; summary.NEVER_CONSIDER_REVIEW_NEEDED++; }
    var m = matchExisting(rec, idx);
    if (m.kind === 'exact') { res.result = 'EXISTING_MATCH'; res.PRIMARY_ID = m.rows[0].id; res.INV = m.rows[0].inv; res.BUCKET = m.rows[0].bucket; res.matchedBy = m.by; if (m.by === 'INTAKE_KEY') { res.detail = 'REPLAY'; summary.REPLAY++; } summary.EXISTING_MATCH++; results.push(res); continue; }
    if(!PipelinePolicy.validUrl(rec.SOURCE_URL)){res.result='WRITE_FAILED';res.detail='SOURCE_URL_REQUIRED: retain initiating job-board, email click-through, or ATS link';summary.WRITE_FAILED++;results.push(res);continue;}
    var proposed = String(rec.PROPOSED_BUCKET || '').toUpperCase(); var conf = String(rec.IDENTITY_CONFIDENCE || '').toUpperCase() || (rec.REQ_ID || rec.SOURCE_URL ? 'MEDIUM' : 'LOW');
    var bucket;
    if (m.kind === 'ambiguous') { bucket = 'DISCOVERY_LEAD'; conf = 'LOW'; res.matchedBy = 'AMBIGUOUS:' + m.by; res.detail = 'possible matches ' + m.rows.map(function (r) { return r.id; }).join(','); summary.AMBIGUOUS_LEAD++; }
    else { bucket = INTAKE_ALLOWED_BUCKETS.indexOf(proposed) >= 0 ? proposed : (conf === 'LOW' || (!rec.REQ_ID && !rec.SOURCE_URL) ? 'DISCOVERY_LEAD' : 'SCOUT_INTAKE'); }
    if (INTAKE_ALLOWED_BUCKETS.indexOf(bucket) < 0) bucket = 'DISCOVERY_LEAD';
    maxInv += 1; var inv = maxInv;
    var pid = 'V2I-' + hashHex(rec.INTAKE_KEY + '|' + inv + '|' + now).slice(0, 12).toUpperCase();
    while (seenIds[pid]) pid = 'V2I-' + hashHex(pid + '|x').slice(0, 12).toUpperCase();
    seenIds[pid] = true; batchKeys[rec.INTAKE_KEY] = pid;
    var tags = ['SCOUT_INTAKE_' + today_(now)]; if (runId) tags.push('RUN_' + runId);
    var P = {}, O = [];
    function set(k, v) { if (v === undefined || v === null || v === '') return; if (O.indexOf(k) < 0) O.push(k); P[k] = clean_(v); }
    set('INTAKE_KEY', rec.INTAKE_KEY); set('SCOUT_RUN_ID', runId || 'UNSPECIFIED'); set('DISCOVERED_AT_ET', rec.DISCOVERED_AT_ET || nowET); set('DISCOVERY_SOURCE', rec.DISCOVERY_SOURCE || 'Scout');
    set('SOURCE_URL', rec.SOURCE_URL); set('INITIATING_URL',rec.INITIATING_URL||rec.SOURCE_URL); set('COMPANY_SOURCE_URL',rec.COMPANY_SOURCE_URL); set('SOURCE_PROVIDER', rec.SOURCE_PROVIDER); set('REQ_ID', rec.REQ_ID); set('IDENTITY_CONFIDENCE', conf);
    set('INITIAL_UNKNOWN_FIELDS', rec.INITIAL_UNKNOWN_FIELDS || 'UNSPECIFIED'); if (m.kind === 'ambiguous') set('POSSIBLE_MATCHES', m.rows.map(function (r) { return r.id; }).join(','));
    INTAKE_FACT_KEYS.forEach(function (k) { set(k, rec[k]); }); set('EMPLOYER_PRIMARY_BUSINESS', rec.EMPLOYER_PRIMARY_BUSINESS);
    if (nc.outcome === 'REVIEW') { set('NEVER_CONSIDER_REVIEW_NEEDED', nc.ruleId + ' ' + nc.confidence + ' (' + nc.basis + ')'); set('NEVER_CONSIDER_REASON', nc.reason); }
    set('DATE_ADDED', today_(now)); set('MASTER_LOADED_AT', now); set('NOTIFICATION_SOURCE', rec.SOURCE_PROVIDER || rec.DISCOVERY_SOURCE || 'Scout');
    set('STATE_SOURCE', 'SCOUT_INTAKE:' + (runId || 'UNSPECIFIED')); set('STATE_UPDATED_AT', now);
    var disposition = bucket === 'SCOUT_INTAKE' ? 'INTAKE/AWAITING_ANALYSIS' : 'INTAKE/IDENTITY_UNRESOLVED';
    var line = [String(inv), pid, rec.COMPANY, rec.TITLE, bucket, disposition, tags.join('; '), rec.REQ_ID || 'UNCAPTURED', rec.LOCATION || 'NOT_STATED'].join(' | ') + ' | ' + buildPayload('SCOUT_INTAKE_PENDING (Claude analysis, then Forge verification)', P, O);
    newLines.push(line); idx.push({ inv: inv, id: pid, company: rec.COMPANY, title: rec.TITLE, bucket: bucket, location: rec.LOCATION, reqTokens: reqTokens(rec.REQ_ID), reqCores: reqTokens(rec.REQ_ID).map(function (x) { return x.replace(/^(LI|GH|WD|JR|R|REQ)/, ''); }), urls: urlsIn(rec.SOURCE_URL).concat(urlsIn(rec.COMPANY_SOURCE_URL || ''), urlsIn(rec.INITIATING_URL || '')), ne: normEmployer(rec.COMPANY), nt: normTitle(rec.TITLE), nl: normLocation(rec.LOCATION), intakeKey: rec.INTAKE_KEY });
    res.result = bucket === 'SCOUT_INTAKE' ? 'SCOUT_INTAKE_WRITTEN' : 'DISCOVERY_LEAD_WRITTEN'; res.PRIMARY_ID = pid; res.INV = inv; res.BUCKET = bucket; summary[res.result]++; summary.ENTERED_MASTER++; results.push(res);
  }
  // Insert block: rows grouped by bucket, each group under its own heading, so a SCOUT_INTAKE row never sits under
  // a DISCOVERY_LEAD heading (row BUCKET stays authoritative; headings are presentation and may repeat).
  var headingLines = [], insertLines = [];
  INTAKE_ALLOWED_BUCKETS.forEach(function (b) {
    var group = newLines.filter(function (l) { return l.split(' | ')[4] === b; }); if (!group.length) return;
    var h = '=== ' + b + ' (' + group.length + ') ==='; headingLines.push(h); insertLines.push(h); insertLines = insertLines.concat(group);
  });
  return { ok: true, results: results, newLines: newLines, headingLines: headingLines, insertLines: insertLines, summary: summary, excluded: excluded, byRule: byRule, rulesStatus: R.status };
}
/** Apply a plan to an array of lines (used by tests and by any non-Docs backend): insert before END, recount. */
function applyPlanToLines(lines, plan) {
  var out = lines.slice(); var endIdx = -1;
  for (var i = out.length - 1; i >= 0; i--) if (/^END V2_CURRENT_POPULATION_MASTER/.test(out[i])) { endIdx = i; break; }
  var ins = plan.insertLines;
  if (endIdx >= 0) out.splice.apply(out, [endIdx, 0].concat(ins)); else out = out.concat(ins);
  var counts = recomputeCountsLine(out), end = recomputeEndLine(out);
  for (var k = 0; k < out.length; k++) { if (/^COUNTS:/.test(out[k])) out[k] = counts; else if (end && /^END V2_CURRENT_POPULATION_MASTER/.test(out[k])) out[k] = end; }
  return out;
}


/* ================= v5 shared history / Tim workspace ================= */
function appendJsonLine_(file, rec) {
  var cur = file.getBlob().getDataAsString();
  file.setContent((cur ? cur.replace(/\n*$/, '\n') : '') + JSON.stringify(rec) + '\n');
}
function appendEvent_(rec) {
  rec = rec || {};
  if (!rec.ts) rec.ts = new Date().toISOString();
  appendJsonLine_(findOrCreate_(EVENT_LOG_NAME, 'text', '\n'), rec);
}
function readEvents_(primaryId, limit) {
  var it = folder_().getFilesByName(EVENT_LOG_NAME);
  if (!it.hasNext()) return [];
  var rows = it.next().getBlob().getDataAsString().split('\n').filter(Boolean).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  if (primaryId) rows = rows.filter(function (r) { return String(r.primaryId || '') === String(primaryId); });
  rows.sort(function (a,b) { return String(b.ts||'').localeCompare(String(a.ts||'')); });
  return rows.slice(0, Math.max(1, Math.min(limit || 200, 1000)));
}
function readDiscoveryRequests_(primaryId, limit) {
  var it=folder_().getFilesByName(DISCOVERY_REQUESTS_NAME), rows=[];
  if (it.hasNext()) rows=it.next().getBlob().getDataAsString().split('\n').filter(Boolean).map(function(l){try{return JSON.parse(l)}catch(e){return null}}).filter(Boolean);
  if (primaryId) rows=rows.filter(function(r){return String(r.primaryId||'')===String(primaryId)});
  var ev=readEvents_('',1000), by={}, idxD=readIndex_(); ev.forEach(function(e){if(e.requestId&&e.type==='TIM_RULING')by[e.requestId]=e});
  rows=rows.map(function(r){var e=by[r.requestId];return Object.assign({},r,e&&e.type==='TIM_RULING'?{lastEventType:e.type,lastEventAt:e.ts,lastActor:e.actor||'',status:(e.verified===true||(idxD&&idxD.requests[r.requestId]&&idxD.requests[r.requestId].s==='COMPLETE'))?'ENRICHED':'SUBMITTED'}:{status:'REQUESTED'})});
  rows.sort(function(a,b){return String(b.requestedAt||'').localeCompare(String(a.requestedAt||''))});
  return {ok:true,fileName:DISCOVERY_REQUESTS_NAME,requests:rows.slice(0,Math.max(1,Math.min(limit||100,500)))};
}
function safeName_(s) { return String(s || '').replace(/[\\\/:*?"<>|#%{}~]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 140); }
function interviewFile_(primaryId, createIfMissing) {
  var folder = DriveApp.getFolderById(INTERVIEW_NOTES_FOLDER_ID);
  var name = safeName_(primaryId) + '__INTERVIEW_NOTES.txt';
  var it = folder.getFilesByName(name);
  if (it.hasNext()) return it.next();
  return createIfMissing ? folder.createFile(name, '', MimeType.PLAIN_TEXT) : null;
}
function saveInterviewNote_(n) {
  var pid = String(n.primaryId || '').trim(), text = String(n.text || '').trim();
  if (!pid) return { ok:false, error:'primaryId required' };
  if (!text) return { ok:false, error:'note text required' };
  var ts = n.ts || new Date().toISOString(), actor = String(n.actor || 'TIM').trim() || 'TIM';
  var f = interviewFile_(pid, true);
  var entry = ['---','TIMESTAMP='+ts,'ACTOR='+actor,'PRIMARY_ID='+pid,'NOTE='+text.replace(/[\r\n]+/g,' ').trim(),''].join('\n');
  var cur = f.getBlob().getDataAsString();
  f.setContent((cur ? cur.replace(/\n*$/, '\n') : '') + entry);
  appendEvent_({ type:'INTERVIEW_NOTE', primaryId:pid, actor:actor, ts:ts, requestId:String(n.requestId||''), note:text, fileId:f.getId(), fileName:f.getName() });
  return { ok:true, primaryId:pid, ts:ts, fileId:f.getId(), fileName:f.getName(), text:text };
}
function readInterviewNotes_(primaryId) {
  var pid = String(primaryId || '').trim();
  if (!pid) return { ok:false, error:'primaryId required' };
  var f = interviewFile_(pid, false);
  return { ok:true, primaryId:pid, fileId:f ? f.getId() : '', fileName:f ? f.getName() : '', text:f ? f.getBlob().getDataAsString() : '' };
}
function listFolderFiles_(id) {
  var out=[], it=DriveApp.getFolderById(id).getFiles();
  while(it.hasNext()) {
    var f=it.next();
    out.push({ id:f.getId(), name:f.getName(), mimeType:f.getMimeType(), modifiedTime:f.getLastUpdated().toISOString(), url:f.getUrl(), size:f.getSize() });
  }
  out.sort(function(a,b){ return String(b.modifiedTime).localeCompare(String(a.modifiedTime)); });
  return out;
}
function docsConfigFile_() {
  var folder=DriveApp.getFolderById(DOCS_ROOT_ID), it=folder.getFilesByName(JOB_DOCS_CONFIG_NAME);
  if (it.hasNext()) return it.next();
  return folder.createFile(JOB_DOCS_CONFIG_NAME, JSON.stringify({ resume_folder_id:RESUMES_FOLDER_ID, cover_letter_folder_id:COVER_LETTERS_FOLDER_ID, supporting_docs_folder_id:SUPPORTING_DOCS_FOLDER_ID, tim_voice_folder_id:TIM_VOICE_FOLDER_ID, interview_notes_folder_id:INTERVIEW_NOTES_FOLDER_ID, latest_approved_resume_file_id:'', latest_approved_resume_name:'', approved_at_et:'', approved_by:'TIM' }, null, 2), MimeType.PLAIN_TEXT);
}
function readDocsConfig_() { try { return JSON.parse(docsConfigFile_().getBlob().getDataAsString() || '{}'); } catch(e) { return {}; } }
function readJobDocuments_() {
  return { ok:true, config:readDocsConfig_(), resumes:listFolderFiles_(RESUMES_FOLDER_ID), coverLetters:listFolderFiles_(COVER_LETTERS_FOLDER_ID), supporting:listFolderFiles_(SUPPORTING_DOCS_FOLDER_ID), timVoice:listFolderFiles_(TIM_VOICE_FOLDER_ID), interviewNotes:listFolderFiles_(INTERVIEW_NOTES_FOLDER_ID) };
}
function readDocumentText_(fileId) {
  var id=String(fileId||'').trim(); if(!id) return {ok:false,error:'fileId required'};
  var f; try { f=DriveApp.getFileById(id); } catch(e) { return {ok:false,error:'document not found'}; }
  var mime=String(f.getMimeType()||''), text='', method='';
  try {
    if(mime==='application/vnd.google-apps.document') { text=DocumentApp.openById(id).getBody().getText(); method='google-doc'; }
    else if(mime.indexOf('text/')===0 || mime==='application/json') { text=f.getBlob().getDataAsString(); method='text'; }
    else return {ok:true,fileId:id,name:f.getName(),mimeType:mime,text:'',available:false,reason:'Text extraction is not available for '+mime};
  } catch(e2) { return {ok:false,error:'document text unavailable: '+String(e2&&e2.message||e2)}; }
  return {ok:true,fileId:id,name:f.getName(),mimeType:mime,text:String(text||''),available:true,method:method};
}
function approveResume_(sel) {
  var id=String(sel.fileId||'').trim(); if(!id) return {ok:false,error:'fileId required'};
  var file; try { file=DriveApp.getFileById(id); } catch(e){ return {ok:false,error:'resume file not found'}; }
  var okParent=false, ps=file.getParents(); while(ps.hasNext()) if(ps.next().getId()===RESUMES_FOLDER_ID) okParent=true;
  if(!okParent) return {ok:false,error:'selected file is not in canonical Resumes folder'};
  var cfg=readDocsConfig_(), ts=sel.ts||new Date().toISOString();
  cfg.resume_folder_id=RESUMES_FOLDER_ID; cfg.cover_letter_folder_id=COVER_LETTERS_FOLDER_ID; cfg.supporting_docs_folder_id=SUPPORTING_DOCS_FOLDER_ID; cfg.tim_voice_folder_id=TIM_VOICE_FOLDER_ID; cfg.interview_notes_folder_id=INTERVIEW_NOTES_FOLDER_ID;
  cfg.latest_approved_resume_file_id=id; cfg.latest_approved_resume_name=file.getName(); cfg.approved_at_et=ts; cfg.approved_by='TIM';
  docsConfigFile_().setContent(JSON.stringify(cfg,null,2));
  appendEvent_({type:'APPROVED_RESUME_CHANGED',actor:'TIM',ts:ts,requestId:String(sel.requestId||''),fileId:id,fileName:file.getName()});
  return {ok:true,config:cfg};
}
/** Global FLEX policy from the structured keys in SECTION=DEGREE_FLEX of TIM_PIPELINE_RULES_CANONICAL. Read once per Writer transaction; absent or unreadable keys fall back to the production defaults. */
function readFlexPolicy_() {
  var defaults = PipelinePolicy.normalizeFlexPolicy ? PipelinePolicy.normalizeFlexPolicy({}) : {};
  try {
    var text = DocumentApp.openById(CANONICAL_RULES_DOC_ID).getBody().getText();
    var sec = String(text || '').match(/(?:^|\n)SECTION=DEGREE_FLEX\s*\n([\s\S]*?)(?=\nSECTION=|$)/);
    if (!sec) {
      defaults._SOURCE = 'CANONICAL_DEFAULTS';
      defaults._WARNING = 'SECTION=DEGREE_FLEX not found; production defaults used';
      return defaults;
    }
    var raw = {}, structured = 0;
    sec[1].split(/\r?\n/).forEach(function (line) {
      var m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) return;
      if (defaults[m[1]] !== undefined) { raw[m[1]] = m[2]; structured++; }
    });
    var policy = PipelinePolicy.normalizeFlexPolicy ? PipelinePolicy.normalizeFlexPolicy(raw) : raw;
    policy._SOURCE = structured ? 'CANONICAL_STRUCTURED' : 'CANONICAL_DEFAULTS';
    policy._WARNING = structured ? '' : 'No structured FLEX policy keys found; production defaults used';
    return policy;
  } catch (e) {
    defaults._SOURCE = 'DEFAULT_FALLBACK';
    defaults._WARNING = 'Canonical FLEX policy read failed: ' + String(e && e.message || e).replace(/\s+/g, ' ');
    return defaults;
  }
}
function readCanonicalRules_() {
  try {
    var file=DriveApp.getFileById(CANONICAL_RULES_DOC_ID), text=DocumentApp.openById(CANONICAL_RULES_DOC_ID).getBody().getText();
    return {ok:true,id:CANONICAL_RULES_DOC_ID,title:file.getName(),modifiedTime:file.getLastUpdated().toISOString(),text:text};
  } catch(e){ return {ok:false,error:String(e&&e.message||e)}; }
}
function saveCanonicalRules_(r) {
  var text=String(r.text||'').trim(); if(!text) return {ok:false,error:'rules text required'};
  if(text.indexOf('TIM_PIPELINE_RULES_CANONICAL')<0) return {ok:false,error:'missing TIM_PIPELINE_RULES_CANONICAL header'};
  var doc=DocumentApp.openById(CANONICAL_RULES_DOC_ID), body=doc.getBody(), before=body.getText(), ts=r.ts||new Date().toISOString();
  body.clear(); body.setText(text); doc.saveAndClose();
  var after=DocumentApp.openById(CANONICAL_RULES_DOC_ID).getBody().getText();
  var ok=after===text;
  var hist={type:'RULESET_SAVED',actor:'TIM',ts:ts,requestId:String(r.requestId||''),verified:ok,priorHash:Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,before)).slice(0,16),newHash:Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,after)).slice(0,16),note:String(r.note||'')};
  appendJsonLine_(findOrCreate_(RULESET_HISTORY_NAME,'text','\n'),hist); appendEvent_(hist);
  return {ok:ok,id:CANONICAL_RULES_DOC_ID,modifiedTime:DriveApp.getFileById(CANONICAL_RULES_DOC_ID).getLastUpdated().toISOString(),history:hist};
}
/* ================= shared weighted scoring model ================= */
function validateScoringModel_(m) {
  m = m || {};
  var w = m.weights || {}, missing = [], bad = [];
  for (var i = 0; i < SCORING_WEIGHT_KEYS.length; i++) {
    var k = SCORING_WEIGHT_KEYS[i];
    if (w[k] === undefined || w[k] === null || w[k] === '') missing.push(k);
    else if (!isFinite(+w[k]) || +w[k] < 0 || +w[k] > 100) bad.push(k);
  }
  var total = 0;
  for (var j = 0; j < SCORING_WEIGHT_KEYS.length; j++) total += +(w[SCORING_WEIGHT_KEYS[j]] || 0);
  if (missing.length) return {ok:false,error:'weights missing: '+missing.join(', '),weightTotal:total};
  if (bad.length) return {ok:false,error:'weights must be numbers from 0 to 100: '+bad.join(', '),weightTotal:total};
  if (Math.abs(total - 100) > 0.01) return {ok:false,error:'weights must total 100 (received '+total+')',weightTotal:total};
  if (m.modelId && String(m.modelId) !== SCORING_MODEL_ID) return {ok:false,error:'unsupported scoring model '+m.modelId,weightTotal:total};
  return {ok:true,weightTotal:total};
}
function scoringModelFile_() {
  var it = folder_().getFilesByName(SCORING_MODEL_NAME);
  return it.hasNext() ? it.next() : null;
}
function readScoringModel_() {
  try {
    var file = scoringModelFile_();
    if (!file) return {ok:true,exists:false,modelId:SCORING_MODEL_ID};
    var raw = file.getBlob().getDataAsString() || '{}', model = JSON.parse(raw), check = validateScoringModel_(model);
    if (!check.ok) return {ok:false,exists:true,error:'published scoring model is invalid: '+check.error,id:file.getId(),fileName:file.getName()};
    return {ok:true,exists:true,id:file.getId(),fileName:file.getName(),url:file.getUrl(),modifiedTime:file.getLastUpdated().toISOString(),model:model,weightTotal:check.weightTotal};
  } catch (e) { return {ok:false,error:String(e && e.message || e)}; }
}
function saveScoringModel_(input) {
  var candidate = input || {}, check = validateScoringModel_(candidate);
  if (!check.ok) return {ok:false,error:check.error,weightTotal:check.weightTotal};
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var oldFile = scoringModelFile_(), old = null, revision = 0;
    if (oldFile) { try { old = JSON.parse(oldFile.getBlob().getDataAsString() || '{}'); revision = +(old.publishedRevision || 0) || 0; } catch (e) {} }
    var now = new Date().toISOString(), model = JSON.parse(JSON.stringify(candidate));
    model.modelId = SCORING_MODEL_ID;
    model.modelVersion = String(model.modelVersion || '2026-10-04.1');
    model.publishedRevision = revision + 1;
    model.publishedAt = now;
    model.publishedBy = String(model.publishedBy || 'TIM').toUpperCase();
    model.updatedAt = now;
    model.weightTotal = check.weightTotal;
    var file = oldFile || folder_().createFile(SCORING_MODEL_NAME, '{}', MimeType.PLAIN_TEXT);
    file.setContent(JSON.stringify(model, null, 2));
    var readback = JSON.parse(file.getBlob().getDataAsString() || '{}'), rb = validateScoringModel_(readback);
    var verified = rb.ok && JSON.stringify(readback) === JSON.stringify(model);
    var hist = {type:'SCORING_MODEL_PUBLISHED',modelId:SCORING_MODEL_ID,modelVersion:model.modelVersion,publishedRevision:model.publishedRevision,actor:model.publishedBy,ts:now,requestId:String(candidate.requestId || ''),verified:verified,weightTotal:check.weightTotal};
    appendJsonLine_(findOrCreate_(SCORING_MODEL_HISTORY_NAME, 'text', '\n'), hist); appendEvent_(hist);
    return {ok:verified,id:file.getId(),fileName:file.getName(),url:file.getUrl(),model:model,history:hist};
  } finally { lock.releaseLock(); }
}
function undoLastRuling_(u) {
  var pid=String(u.primaryId||'').trim(); if(!pid) return {ok:false,error:'primaryId required'};
  var idx=readIndex_();
  // Only a ruling proven durable may be undone: legacy events carry verified:true; new ones need an index COMPLETE verdict.
  var ev=readEvents_(pid,200).filter(function(e){return e.type==='TIM_RULING' && e.before && e.after && (e.verified===true || (idx && e.requestId && idx.requests[e.requestId] && idx.requests[e.requestId].s==='COMPLETE'));})[0];
  if(!ev) return {ok:false,error:'no verified Tim ruling to undo'};
  var lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    DOC_ACCESS_ = [];
    var M=openMaster_(), snapshot=M.lines.slice();
    var fence=writeFence_(snapshot); if(fence) return fence;
    var hit=-1; for(var i=0;i<snapshot.length;i++) if(snapshot[i]===ev.after) { hit=i; break; }
    if(hit<0) return {ok:false,error:'current row no longer matches last Tim ruling; fail closed'};
    var all=snapshot.slice(); all[hit]=ev.before;
    var counts=recomputeCountsLine(all), end=recomputeEndLine(all);
    applyMasterEdits_(M, snapshot, [{index:hit,text:ev.before}].concat(masterTrailerEdits_(all,counts,end)));
    var ts=new Date().toISOString(), rid=String(u.requestId||'') || ('UNDO-'+ts.replace(/[^0-9]/g,'').slice(0,14)+'-'+pid);
    var receipt={RECEIPT:'STATE_CHANGE_RECEIPT',REQUEST_ID:rid,EXECUTED_BY:'Pipeline Explorer Apps Script (runs as Tim)',TARGET_CANONICAL_ID:pid,UNDOES_REQUEST_ID:ev.requestId||'',CHANGES:['UNDO_TIM_RULING'],READBACK_VERIFIED:'PENDING',TARGET_FILE_ID:MASTER_ID,COMPLETION_STATUS:'PENDING_VERIFICATION',EXECUTED_AT:ts};
    var writeId=stageVerification_('UNDO',[{pid:pid,op:'REPLACE',before:ev.after,after:ev.before}],[receipt],counts,ts);
    appendEvent_({type:'TIM_RULING_UNDO',primaryId:pid,actor:'TIM',ts:ts,requestId:rid,undoneEventTs:ev.ts,before:ev.after,after:ev.before,verification:'PENDING',writeId:writeId});
    return {ok:true,verification:'PENDING',writeId:writeId,primaryId:pid,restored:ev.before,counts:counts,receipt:receipt};
  } finally { lock.releaseLock(); }
}

/* ================= files beside the master ================= */
function folder_() { var it = DriveApp.getFileById(MASTER_ID).getParents(); return it.hasNext() ? it.next() : DriveApp.getRootFolder(); }
function findOrCreate_(name, mime, initial) {
  var f = folder_(); var it = f.getFilesByName(name);
  if (it.hasNext()) return it.next();
  if (mime === 'doc') { var d = DocumentApp.create(name); var file = DriveApp.getFileById(d.getId()); f.addFile(file); try { DriveApp.getRootFolder().removeFile(file); } catch (e) {} return file; }
  return f.createFile(name, initial || '{}', MimeType.PLAIN_TEXT);
}
function readState_() { var f = findOrCreate_(STATE_FILE_NAME, 'text', '{"seen":{},"rulings":{}}'); try { return JSON.parse(f.getBlob().getDataAsString() || '{}'); } catch (e) { return { seen: {}, rulings: {} }; } }
function writeState_(state) { var f = findOrCreate_(STATE_FILE_NAME, 'text', '{}'); f.setContent(JSON.stringify(state)); }
/** Extract the runtime Never-Consider rules from active TIM_PIPELINE_RULES_CANONICAL.
 * The historical standalone TIM_NEVER_CONSIDER_RULES file is no longer consulted at runtime.
 */
function readRules_() {
  try {
    var text = DocumentApp.openById(CANONICAL_RULES_DOC_ID).getBody().getText();
    var R = parseCanonicalNeverConsiderRules(text); R.id = CANONICAL_RULES_DOC_ID; R.raw = text;
    try { R.modifiedTime = DriveApp.getFileById(CANONICAL_RULES_DOC_ID).getLastUpdated().toISOString(); } catch (e2) { R.modifiedTime = ''; }
    return R;
  } catch (e) { return { source: 'TIM_PIPELINE_RULES_CANONICAL', id: CANONICAL_RULES_DOC_ID, status: 'UNAVAILABLE', defaultAction: 'ALLOW_INTAKE', header: {}, rules: [], activeIds: [], error: String(e && e.message || e) }; }
}
function readRuns_() { var it = folder_().getFilesByName(RUNS_FILE_NAME); if (!it.hasNext()) return []; var txt = it.next().getBlob().getDataAsString(); return foldRunVerifications_(txt.split('\n').filter(Boolean).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean)); }
/** Pure: apply WRITE_VERIFICATION records to their run (by WRITE_ID); runs written before durable verification stay as recorded. */
function foldRunVerifications_(recs) {
  var byWrite = {}; recs.forEach(function (r) { if (r.RECORD_TYPE === 'WRITE_VERIFICATION' && r.WRITE_ID) byWrite[r.WRITE_ID] = r; });
  return recs.filter(function (r) { return r.RECORD_TYPE !== 'WRITE_VERIFICATION'; }).map(function (r) {
    var v = r.WRITE_ID && byWrite[r.WRITE_ID]; if (!v) return r;
    var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; });
    o.WRITE_STATUS = v.WRITE_STATUS; o.WRITE_VERIFIED = v.WRITE_STATUS === 'COMPLETE' ? 'YES' : 'NO'; o.WRITE_VERIFIED_AT = v.VERIFIED_AT;
    o.RESULTS = (r.RESULTS || []).map(function (x) { if (x.WRITE_STATUS !== 'PENDING') return x; var y = {}; Object.keys(x).forEach(function (k) { y[k] = x[k]; }); y.WRITE_STATUS = v.WRITE_STATUS; return y; });
    return o;
  });
}
function appendRun_(rec) { var f = findOrCreate_(RUNS_FILE_NAME, 'text', ''); var cur = f.getBlob().getDataAsString(); f.setContent((cur ? cur.replace(/\n*$/, '\n') : '') + JSON.stringify(rec) + '\n'); }
function appendReceipt_(r) { appendReceipts_([r]); }
function readReceipts_() {
  var f = receiptsFile_(); if (!f) return '';
  if (!isGoogleDoc_(f)) return f.getBlob().getDataAsString();
  var id = f.getId(); return withDocRetry_('RECEIPTS_READ', function () { return DocumentApp.openById(id).getBody().getText(); });
}

// CommonJS export for unit tests (ignored by Apps Script)
if (typeof module !== 'undefined') module.exports = { protectedCaseEvidence: protectedCaseEvidence, mutateRow: mutateRow, recomputeCountsLine: recomputeCountsLine, recomputeEndLine: recomputeEndLine, parsePayload: parsePayload, planIntake: planIntake, applyPlanToLines: applyPlanToLines, parseRulesText: parseRulesText, parseCanonicalNeverConsiderRules: parseCanonicalNeverConsiderRules, ruleById: ruleById, categoryTerms: categoryTerms, preExclusionCandidates: preExclusionCandidates, runCounters_: runCounters_, intakeResponse_: intakeResponse_, INTAKE_OUTCOMES: INTAKE_OUTCOMES, matchExisting: matchExisting, indexExisting: indexExisting, classifyNeverConsider: classifyNeverConsider, normEmployer: normEmployer, normTitle: normTitle, normLocation: normLocation, canonUrl: canonUrl, reqCore: reqCore, sanitizeRecord: sanitizeRecord, BUCKETS: BUCKETS, planUpsertApplication: planUpsertApplication, applyFields_: applyFields_, completedReceiptRequestIds_: completedReceiptRequestIds_, dispatchWrite_: dispatchWrite_, identityChange_: identityChange_, identityConflicts_: identityConflicts_, requestShapeError_: requestShapeError_, setWriteDeadline_: setWriteDeadline_, withDocRetry_: withDocRetry_, isTransientDocError_: isTransientDocError_, DOC_RETRY_DELAYS_MS: DOC_RETRY_DELAYS_MS, isEvidenceKey_: isEvidenceKey_, splitRowEvidence_: splitRowEvidence_, resolveEvidence_: resolveEvidence_, foldRunVerifications_: foldRunVerifications_, readRuns_: readRuns_, parseCompanion_: parseCompanion_, parseArchive_: parseArchive_, hydrateLines_: hydrateLines_, readMasterHydrated_: readMasterHydrated_, readEvidence_: readEvidence_, planMasterMigration_: planMasterMigration_, migrationChunks_: migrationChunks_, chunkState_: chunkState_, evidenceRefOf_: evidenceRefOf_, EVIDENCE_KEYS: EVIDENCE_KEYS, ARCHIVE_BUCKETS: ARCHIVE_BUCKETS, textHash_: textHash_, classifyPendingWrite_: classifyPendingWrite_, verifiedReceipts_: verifiedReceipts_, verifyPendingWrites_: verifyPendingWrites_, replayState_: replayState_, rotateReceipts_: rotateReceipts_, correctReceipts_: correctReceipts_, errorStack_: errorStack_, resetExecution_: function () { MASTER_WRITTEN_IN_EXECUTION_ = false; }, VERIFY_GRACE_MS: VERIFY_GRACE_MS, validateScoringModel_: validateScoringModel_, SCORING_MODEL_ID: SCORING_MODEL_ID, SCORING_WEIGHT_KEYS: SCORING_WEIGHT_KEYS, WRITE_ACTIONS: WRITE_ACTIONS };
