if(typeof module==='object'&&module.exports)var PipelinePolicy=require('../pipeline-policy');
/**
 * PIPELINE EXPLORER STATE WRITER (Google Apps Script)
 * Runs as Tim. The ONLY canonical mutations the Explorer makes go through this script, against the
 * single fixed master, with read-back verification (FORGE_AMENDMENT_58 Authorized State Writer contract).
 *
 * Actions (GET):  ping | master | state | receipts | rules | runs | canonical_rules | scoring | events | interview_notes | documents | request_result | automation | process_queue | submit (payload=<JSON write body>)
 * Actions (POST): state | ruling | intake | upsert_application | interview_note | approve_resume | save_rules | save_scoring_model | undo_ruling | install_automation | batch
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
/** Runtime Never-Consider authority is the active TIM_PIPELINE_RULES_CANONICAL document. RULES_DOC_ID is retained as a compatibility alias for receipts/tests. */
var RULES_DOC_ID = '1uuIopBY2Et-leu_tOdxnWAJJLniKwk08rdLCypuM2BE';
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
var FINAL_BUCKETS = ['READY_TO_PURSUE', 'APPLIED', 'REJECTED_BY_EMPLOYER', 'DECLINED_BY_TIM', 'DUPLICATE', 'CLOSED_DEAD', 'INVALID_DISCOVERY'];

/* ================= HTTP ================= */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!auth_(p.key)) return out_({ ok: false, error: 'bad key' });
  var a = p.action || 'master';
  try {
    if (a === 'ping') return out_({ ok: true, now: new Date().toISOString(), master: MASTER_ID, actions: ['master','state','receipts','rules','runs','canonical_rules','scoring','events','interview_notes','documents','document_text','discovery_requests','request_result','ruling','intake','data_discovery','upsert_application','interview_note','approve_resume','save_rules','save_scoring_model','undo_ruling','install_automation','batch'] });
    if (a === 'master') return out_(readMaster_());
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
    if (a === 'canonical_rules') return out_(readCanonicalRules_());
    if (a === 'scoring') return out_(readScoringModel_());
    if (a === 'submit') { var body; try { body = JSON.parse(p.payload || ''); } catch (x) { return out_({ ok: false, error: 'payload must be URL-encoded JSON: ' + x.message }); } return out_(dispatchWrite_(body)); }
    if (a === 'automation') return out_(automationStatus_());
    if (a === 'process_queue') return out_(processWriterQueue());
    return out_({ ok: false, error: 'unknown action ' + a });
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
}
function doPost(e) {
  var req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return out_({ ok: false, error: 'bad JSON' }); }
  if (!auth_(req.key)) return out_({ ok: false, error: 'bad key' });
  try {
    if (req.action === 'state') { writeState_(req.state || {}); return out_({ ok: true }); }
    return out_(dispatchWrite_(req));
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
}
function auth_(k) { return PASSPHRASE && k === PASSPHRASE; }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
/** One entry point for every canonical write (HTTP POST, GET submit, Drive queue). The key is checked by the HTTP layer only. */
var WRITE_ACTIONS = ['intake', 'ruling', 'data_discovery', 'upsert_application', 'interview_note', 'approve_resume', 'save_rules', 'save_scoring_model', 'undo_ruling', 'install_automation', 'batch'];
function dispatchWrite_(req) {
  req = req || {};
  var a = String(req.action || '');
  if (a === 'intake') return applyIntakeToMaster_(req);
  if (a === 'ruling') return applyRulingToMaster_(req.ruling || {});
  if (a === 'data_discovery') return applyDataDiscoveryRequest_(req);
  if (a === 'upsert_application') return applyUpsertToMaster_(req.event || req);
  if (a === 'interview_note') return saveInterviewNote_(req.note || req);
  if (a === 'approve_resume') return approveResume_(req.selection || req);
  if (a === 'save_rules') return saveCanonicalRules_(req.rules || req);
  if (a === 'save_scoring_model') return saveScoringModel_(req.model || req);
  if (a === 'undo_ruling') return undoLastRuling_(req.undo || req);
  if (a === 'install_automation') { var ir = installAutomation(); return { ok:true, action:'install_automation', result:ir || null, installedAt:new Date().toISOString() }; }
  if (a === 'batch') {
    var list = Array.isArray(req.requests) ? req.requests : [];
    if (!list.length) return { ok: false, error: 'batch needs requests[]' };
    if (list.length > 50) return { ok: false, error: 'batch too large (max 50 requests)' };
    var allRulings = list.every(function (sub) { return sub && sub.action === 'ruling' && sub.ruling; });
    if (allRulings) return applyRulingBatchToMaster_(list);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var sub = list[i] || {};
      if (sub.action === 'batch' || WRITE_ACTIONS.indexOf(sub.action) < 0) { out.push({ index: i, ok: false, error: 'unsupported action in batch: ' + sub.action }); continue; }
      try { var r = dispatchWrite_(sub); r.index = i; out.push(r); } catch (e) { out.push({ index: i, ok: false, error: String(e && e.message || e) }); }
    }
    return { ok: out.every(function (r) { return r.ok; }), mode: 'SERIAL_MIXED_BATCH', results: out };
  }
  return { ok: false, error: 'unknown action ' + a + ' (expected one of ' + WRITE_ACTIONS.join(', ') + ')' };
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
    var file = DriveApp.getFileById(MASTER_ID), modBefore = file.getLastUpdated().toISOString();
    var doc = DocumentApp.openById(MASTER_ID), body = doc.getBody(), paras = body.getParagraphs(), lines = [];
    for (var i = 0; i < paras.length; i++) lines.push(paras[i].getText());
    t.MASTER_READ_MS = Date.now() - readStart;

    var planStart = Date.now(), byPid = {}, duplicatePid = {}, seenBatchPid = {}, results = [], receipts = [], events = [], changed = [];
    for (var p = 0; p < lines.length; p++) {
      if (!/^\d+ \| /.test(lines[p])) continue;
      var cells = lines[p].split(' | '), pid0 = cells.length > 1 ? cells[1].trim() : '';
      if (!pid0) continue;
      if (byPid[pid0] !== undefined) duplicatePid[pid0] = true;
      else byPid[pid0] = p;
    }

    var already = completedReceiptRequestIds_(readReceipts_());
    var flexPolicy = readFlexPolicy_();

    for (var rix = 0; rix < requests.length; rix++) {
      var sub = requests[rix] || {}, ruling = sub.ruling || {}, pid = String(ruling.primaryId || '').trim(), requestId = String(ruling.requestId || '').trim();
      var base = { index: rix, primaryId: pid, requestId: requestId };
      if (!pid) { results.push({ index: rix, ok: false, error: 'no PRIMARY_ID in request' }); continue; }
      if (requestId && already[requestId]) { results.push({ index: rix, ok: true, mode: 'ALREADY_APPLIED', primaryId: pid, requestId: requestId }); continue; }
      if (duplicatePid[pid] || byPid[pid] === undefined) {
        var count = duplicatePid[pid] ? 2 : 0;
        results.push({ index: rix, ok: false, error: 'identity not unique: ' + count + ' rows match ' + pid + ' (fail closed)' });
        continue;
      }
      if (seenBatchPid[pid]) {
        results.push({ index: rix, ok: false, error: 'duplicate PRIMARY_ID within batch: ' + pid + ' (split sequential mutations into separate requests)' });
        continue;
      }
      seenBatchPid[pid] = true;
      var li = byPid[pid], before = lines[li], mu = mutateRow(before, ruling, flexPolicy);
      if (!mu.ok) { results.push({ index: rix, ok: false, error: mu.error, primaryId: pid }); continue; }
      lines[li] = mu.after;
      changed.push({ index: rix, lineIndex: li, before: before, after: mu.after, mutation: mu, ruling: ruling });
      results.push({ index: rix, ok: true, mode: 'PLANNED', primaryId: pid, requestId: requestId, changes: mu.changes });
    }

    t.PLAN_MS = Date.now() - planStart;
    if (!changed.length) {
      t.TOTAL_MS = Date.now() - started;
      return { ok: results.every(function (x) { return x.ok; }), mode: 'BATCH_RULING_NO_WRITE', results: results, timings: t };
    }

    var modCheck = DriveApp.getFileById(MASTER_ID).getLastUpdated().toISOString();
    if (modCheck !== modBefore) {
      t.TOTAL_MS = Date.now() - started;
      return { ok: false, mode: 'BATCH_RULING_RETRY', error: 'master changed during request (' + modBefore + ' -> ' + modCheck + '); retry', results: results, timings: t };
    }

    var writeStart = Date.now();
    for (var cw = 0; cw < changed.length; cw++) paras[changed[cw].lineIndex].setText(changed[cw].after);
    var newCounts = recomputeCountsLine(lines), newEnd = recomputeEndLine(lines);
    for (var k = 0; k < paras.length; k++) {
      var tk = paras[k].getText();
      if (/^COUNTS:/.test(tk)) paras[k].setText(newCounts);
      else if (newEnd && /^END V2_CURRENT_POPULATION_MASTER/.test(tk)) paras[k].setText(newEnd);
    }
    doc.saveAndClose();
    t.MASTER_WRITE_MS = Date.now() - writeStart;

    var rbStart = Date.now(), p2 = DocumentApp.openById(MASTER_ID).getBody().getParagraphs(), backByPid = {}, countsBack = null;
    for (var m = 0; m < p2.length; m++) {
      var tt = p2[m].getText();
      if (/^COUNTS:/.test(tt)) countsBack = tt;
      if (/^\d+ \| /.test(tt)) {
        var cc = tt.split(' | '), id = cc.length > 1 ? cc[1].trim() : '';
        if (id) backByPid[id] = tt;
      }
    }
    var countsVerified = countsBack === newCounts;
    t.READBACK_MS = Date.now() - rbStart;

    var executedAt = new Date().toISOString();
    for (var z = 0; z < changed.length; z++) {
      var ch = changed[z], rr = ch.ruling, mm = ch.mutation, verified = countsVerified && backByPid[String(rr.primaryId || '').trim()] === ch.after;
      var receipt = {
        RECEIPT: 'STATE_CHANGE_RECEIPT', REQUEST_ID: rr.requestId || '', EXECUTED_BY: 'Pipeline Explorer Apps Script (runs as Tim)',
        TARGET_CANONICAL_ID: String(rr.primaryId || '').trim(), COMPANY: mm.company, TITLE: mm.title, REQ_ID: mm.req,
        BEFORE_APPLICATION_STATE: mm.beforeState, AFTER_APPLICATION_STATE: mm.afterState,
        BEFORE_POSTING_STATE: 'n/a', AFTER_POSTING_STATE: 'n/a',
        CANONICAL_ID_PRESERVED: 'YES', HISTORY_PRESERVED: 'YES', COUNTS_UPDATED: 'YES', READBACK_VERIFIED: verified ? 'YES' : 'NO',
        TARGET_FILE_ID: MASTER_ID, COMPLETION_STATUS: verified ? 'COMPLETE' : 'FAILED', MASTER_MODIFIED_BEFORE: modBefore,
        EXECUTED_AT: executedAt, CHANGES: mm.changes, BATCH_MODE: 'MULTI_ROW_SINGLE_COMMIT'
      };
      receipts.push(receipt);
      events.push({ type: 'TIM_RULING', primaryId: String(rr.primaryId || '').trim(), actor: rr.actor || 'TIM', ts: executedAt, requestId: rr.requestId || '', kind: rr.kind || '', code: rr.code || '', note: rr.note || '', before: ch.before, after: ch.after, verified: verified, batchMode: 'MULTI_ROW_SINGLE_COMMIT' });
      results[ch.index] = { index: ch.index, ok: verified, mode: 'BATCH_RULING', primaryId: String(rr.primaryId || '').trim(), requestId: rr.requestId || '', before: ch.before, after: ch.after, changes: mm.changes, verified: verified };
    }

    var receiptStart = Date.now();
    appendReceipts_(receipts);
    t.RECEIPT_MS = Date.now() - receiptStart;
    var eventStart = Date.now();
    appendEvents_(events);
    t.EVENT_MS = Date.now() - eventStart;
    t.TOTAL_MS = Date.now() - started;
    return { ok: results.every(function (x) { return x && x.ok; }), mode: 'BATCH_RULING_SINGLE_COMMIT', processed: changed.length, counts: newCounts, results: results, timings: t };
  } finally { lock.releaseLock(); }
}

/**
 * Request IDs whose receipt proves a successful write: only these may be skipped as ALREADY_APPLIED.
 * Receipts are blocks from `RECEIPT=<TYPE>` to `END <TYPE>`; Docs getText() separates lines inside a block with \r and
 * blocks with \n, so both are line breaks. A block counts only when it is complete (start and matching END), has a
 * non-empty REQUEST_ID, COMPLETION_STATUS=COMPLETE and, for state-change receipts (or any receipt that records it),
 * READBACK_VERIFIED=YES. FAILED, HOLD, INCOMPLETE, STATE_CHANGE_NEEDS_RESOLUTION, missing status and malformed or
 * truncated blocks never count, so those requests are retried normally. Any one qualifying block is enough.
 */
function completedReceiptRequestIds_(text) {
  var done = {}, block = null, lines = String(text || '').split(/\r\n|\r|\n/);
  var KEYS = ['RECEIPT', 'REQUEST_ID', 'COMPLETION_STATUS', 'READBACK_VERIFIED'];
  function finish(b) {
    if (!b || b.bad) return;
    var rid = String(b.f.REQUEST_ID || '').trim();
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
  return done;
}

function appendReceipts_(list) {
  if (!list || !list.length) return;
  var file = findOrCreate_(RECEIPTS_DOC_NAME, 'doc'), doc = DocumentApp.openById(file.getId()), body = doc.getBody();
  for (var i = 0; i < list.length; i++) {
    var r = list[i], lines = Object.keys(r).map(function (k) { return k + '=' + (typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]); });
    body.appendParagraph(lines.join('\n') + '\nEND ' + r.RECEIPT);
    body.appendParagraph('');
  }
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

/* ================= master read ================= */
function readMaster_() {
  var file = DriveApp.getFileById(MASTER_ID);
  var text = DocumentApp.openById(MASTER_ID).getBody().getText();
  return { ok: true, id: MASTER_ID, title: file.getName(), modifiedTime: file.getLastUpdated().toISOString(), fetchedAt: new Date().toISOString(), bytes: text.length, text: text };
}

/* ================= ruling (one existing row, exact PRIMARY_ID) ================= */
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
    var res = mutateRow(before, ruling, readFlexPolicy_());
    if (!res.ok) return fail_(res.error, ruling);
    var modCheck = DriveApp.getFileById(MASTER_ID).getLastUpdated().toISOString();
    if (modCheck !== modBefore) return fail_('master changed during request (' + modBefore + ' -> ' + modCheck + '); retry', ruling);
    paras[hits[0]].setText(res.after);
    var lines = [];
    for (var j = 0; j < paras.length; j++) lines.push(paras[j].getText());
    var newCounts = recomputeCountsLine(lines), newEnd = recomputeEndLine(lines);
    for (var k = 0; k < paras.length; k++) { var tk = paras[k].getText(); if (/^COUNTS:/.test(tk)) paras[k].setText(newCounts); else if (newEnd && /^END V2_CURRENT_POPULATION_MASTER/.test(tk)) paras[k].setText(newEnd); }
    doc.saveAndClose();
    var p2 = DocumentApp.openById(MASTER_ID).getBody().getParagraphs();
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
    appendEvent_({ type: 'TIM_RULING', primaryId: pid, actor: ruling.actor || 'TIM', ts: receipt.EXECUTED_AT, requestId: ruling.requestId || '', kind: ruling.kind || '', code: ruling.code || '', note: ruling.note || '', before: before, after: res.after, verified: verified });
    return { ok: verified, receipt: receipt, before: before, after: res.after, counts: newCounts };
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
    var paras = DocumentApp.openById(MASTER_ID).getBody().getParagraphs(), rows = {};
    for (var i=0;i<paras.length;i++) {
      var t=paras[i].getText(); if (!/^\d+ \| /.test(t)) continue;
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
    var modBefore = DriveApp.getFileById(MASTER_ID).getLastUpdated().toISOString();
    var doc = DocumentApp.openById(MASTER_ID), body = doc.getBody(), paras = body.getParagraphs(), lines = [];
    for (var i = 0; i < paras.length; i++) lines.push(paras[i].getText());
    var now = new Date().toISOString();
    var plan = planUpsertApplication(lines, ev, { now: now, flexPolicy: readFlexPolicy_() });
    var base = { RECEIPT: 'UPSERT_RECEIPT', REQUEST_ID: (ev && ev.requestId) || plan.upsertKey || '', EXECUTED_BY: 'Authorized State Writer (runs as Tim)', COMPANY: (ev && ev.COMPANY) || '', TITLE: (ev && ev.TITLE) || '', STATE: (ev && (ev.STATE || ev.state)) || '', MODE: plan.mode, TARGET_FILE_ID: MASTER_ID, MASTER_MODIFIED_BEFORE: modBefore, EXECUTED_AT: now };
    if (!plan.ok) { base.COMPLETION_STATUS = plan.mode === 'HOLD' ? 'HOLD' : 'FAILED'; base.REASON = plan.error; base.POSSIBLE_MATCHES = plan.possibleMatches || []; try { appendReceipt_(base); } catch (e) {} return { ok: false, mode: plan.mode, error: plan.error, possibleMatches: plan.possibleMatches || [], receipt: base }; }
    if (plan.mode === 'ALREADY_APPLIED') { base.COMPLETION_STATUS = 'NO_CHANGE_REQUIRED'; base.PRIMARY_ID = plan.primaryId; return { ok: true, mode: plan.mode, primaryId: plan.primaryId, receipt: base }; }
    if (DriveApp.getFileById(MASTER_ID).getLastUpdated().toISOString() !== modBefore) return { ok: false, mode: 'RETRY', error: 'master changed during request; retry' };
    var expect;
    if (plan.mode === 'UPDATE') { paras[plan.index].setText(plan.after); expect = plan.after; }
    else {
      var endIdx = -1; for (var e2 = paras.length - 1; e2 >= 0; e2--) if (/^END V2_CURRENT_POPULATION_MASTER/.test(paras[e2].getText())) { endIdx = e2; break; }
      body.insertParagraph(endIdx >= 0 ? endIdx : paras.length, plan.newLine); expect = plan.newLine;
    }
    var p1 = body.getParagraphs(), all = []; for (var q = 0; q < p1.length; q++) all.push(p1[q].getText());
    var newCounts = recomputeCountsLine(all), newEnd = recomputeEndLine(all);
    for (var k = 0; k < p1.length; k++) { var tk = p1[k].getText(); if (/^COUNTS:/.test(tk)) p1[k].setText(newCounts); else if (newEnd && /^END V2_CURRENT_POPULATION_MASTER/.test(tk)) p1[k].setText(newEnd); }
    doc.saveAndClose();
    var p2 = DocumentApp.openById(MASTER_ID).getBody().getParagraphs(), found = 0, countsBack = null;
    for (var m = 0; m < p2.length; m++) { var tt = p2[m].getText(); if (tt === expect) found++; if (/^COUNTS:/.test(tt)) countsBack = tt; }
    var verified = found === 1 && countsBack === newCounts;
    base.PRIMARY_ID = plan.primaryId; base.MATCHED_BY = plan.matchedBy || ''; base.UPSERT_KEY = plan.upsertKey; base.READBACK_VERIFIED = verified ? 'YES' : 'NO'; base.COUNTS_AFTER = newCounts; base.COMPLETION_STATUS = verified ? 'COMPLETE' : 'FAILED';
    appendReceipt_(base);
    return { ok: verified, mode: plan.mode, primaryId: plan.primaryId, matchedBy: plan.matchedBy || '', row: expect, counts: newCounts, endLine: newEnd, receipt: base };
  } finally { lock.releaseLock(); }
}

/* ================= intake (Scout discovery -> canonical rows) ================= */
function applyIntakeToMaster_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var file = DriveApp.getFileById(MASTER_ID);
    var modBefore = file.getLastUpdated().toISOString();
    var doc = DocumentApp.openById(MASTER_ID);
    var body = doc.getBody();
    var paras = body.getParagraphs();
    var lines = [];
    for (var i = 0; i < paras.length; i++) lines.push(paras[i].getText());
    var rules = readRules_();
    var plan = planIntake(lines, req.records || [], rules, { run: req.run || {}, now: new Date().toISOString(), nowET: nowET_() });
    if (!plan.ok) return { ok: false, error: plan.error, results: plan.results || [] };
    var modCheck = DriveApp.getFileById(MASTER_ID).getLastUpdated().toISOString();
    if (modCheck !== modBefore) return { ok: false, error: 'master changed during request (' + modBefore + ' -> ' + modCheck + '); retry', results: [] };
    // append: before END marker if present, else at end. Rows are grouped under their own bucket headings.
    var endIdx = -1;
    for (var e = paras.length - 1; e >= 0; e--) if (/^END V2_CURRENT_POPULATION_MASTER/.test(paras[e].getText())) { endIdx = e; break; }
    var toInsert = plan.insertLines;
    if (toInsert.length) {
      var at = endIdx >= 0 ? endIdx : paras.length;
      for (var n = 0; n < toInsert.length; n++) body.insertParagraph(at + n, toInsert[n]);
    }
    var all = [];
    var p1 = body.getParagraphs();
    for (var q = 0; q < p1.length; q++) all.push(p1[q].getText());
    var newCounts = recomputeCountsLine(all), newEnd = recomputeEndLine(all);
    for (var k = 0; k < p1.length; k++) { var tk = p1[k].getText(); if (/^COUNTS:/.test(tk)) p1[k].setText(newCounts); else if (newEnd && /^END V2_CURRENT_POPULATION_MASTER/.test(tk)) p1[k].setText(newEnd); }
    doc.saveAndClose();
    // read back every inserted line
    var p2 = DocumentApp.openById(MASTER_ID).getBody().getParagraphs();
    var have = {};
    for (var m = 0; m < p2.length; m++) have[p2[m].getText()] = true;
    var missing = plan.newLines.filter(function (l) { return !have[l]; });
    var countsBack = null;
    for (var c = 0; c < p2.length; c++) if (/^COUNTS:/.test(p2[c].getText())) countsBack = p2[c].getText();
    var verified = missing.length === 0 && countsBack === newCounts;
    if (!verified) plan.results.forEach(function (r) { if (r.result === 'SCOUT_INTAKE_WRITTEN' || r.result === 'DISCOVERY_LEAD_WRITTEN') { r.result = 'WRITE_FAILED'; r.detail = 'readback did not verify'; } });
    var counters = runCounters_(req.run || {}, plan, rules, verified);
    var receipt = {
      RECEIPT: 'INTAKE_RECEIPT', SCOUT_RUN_ID: (req.run && req.run.SCOUT_RUN_ID) || '', EXECUTED_BY: 'Pipeline Explorer Apps Script (runs as Tim)',
      RECORDS_RECEIVED: (req.records || []).length, COUNTERS: counters, RULES_STATUS: rules.status, RULES_DOC_ID: CANONICAL_RULES_DOC_ID,
      DISCOVERY_LEAD_AMBIGUOUS: plan.summary.AMBIGUOUS_LEAD, NEVER_CONSIDER_REVIEW_NEEDED: plan.summary.NEVER_CONSIDER_REVIEW_NEEDED,
      NEW_PRIMARY_IDS: plan.newLines.map(function (l) { return l.split(' | ')[1]; }),
      COUNTS_UPDATED: 'YES', END_UPDATED: newEnd ? 'YES' : 'NO_END_LINE', READBACK_VERIFIED: verified ? 'YES' : 'NO',
      RUN_ACCOUNTING: counters.RUN_ACCOUNTING, DISCOVERY_UNACCOUNTED: counters.DISCOVERY_UNACCOUNTED, WRITE_VERIFIED: verified ? 'YES' : 'NO',
      TARGET_FILE_ID: MASTER_ID, COMPLETION_STATUS: !verified ? 'FAILED' : (counters.RUN_ACCOUNTING === 'RECONCILED' ? 'COMPLETE' : 'INCOMPLETE'), MASTER_MODIFIED_BEFORE: modBefore, EXECUTED_AT: new Date().toISOString()
    };
    appendReceipt_(receipt);
    // telemetry beside the master (SCOUT_RUN_METRICS.jsonl): counters + exclusion audit. Not candidate state; never a second ledger.
    appendRun_({ SCOUT_RUN_ID: receipt.SCOUT_RUN_ID, RECEIVED_AT: receipt.EXECUTED_AT, RUN: req.run || {}, COUNTERS: counters, GROSS_FOUND: counters.GROSS_FOUND, NEVER_CONSIDER_EXCLUDED: counters.NEVER_CONSIDER_EXCLUDED,
      EXCLUSIONS: plan.excluded, RESULTS: plan.results.map(function (r) { return { INTAKE_KEY: r.INTAKE_KEY, SUBMITTED_VIA: r.SUBMITTED_VIA, result: r.result, PRIMARY_ID: r.PRIMARY_ID, BUCKET: r.BUCKET, NEVER_CONSIDER_REVIEW_NEEDED: r.NEVER_CONSIDER_REVIEW_NEEDED }; }), WRITE_VERIFIED: verified, COMPLETION_STATUS: receipt.COMPLETION_STATUS });
    return intakeResponse_(verified, counters, receipt, plan, newCounts, newEnd);
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
    if(PipelinePolicy.flex(P).blocked&&String(ruling.actor||'').toUpperCase()!=='TIM')return {ok:false,error:'STRICT requires explicit Tim override'};
    if(PipelinePolicy.flex(P).blocked)set('TIM_FLEX_OVERRIDE','YES');
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
  else { set('STATE_SOURCE', source); set('STATE_UPDATED_AT', ts); }
  fixed[6] = tags.length ? tags.filter(function (t, i) { return tags.indexOf(t) === i; }).join('; ') : '-';
  var after = fixed.join(' | ') + ' | ' + buildPayload(pp.lead, P, O);
  return { ok: true, after: after, changes: changes, beforeState: beforeState, afterState: fixed[4] + ' / ' + fixed[5], company: fixed[2], title: fixed[3], req: fixed[7] };
}
/** Payload keys a write may never set directly (writer-owned) and intake keys whose prior value is kept as INTAKE_<KEY> when changed. */
var FIELD_DENY = ['STATE_SOURCE', 'STATE_UPDATED_AT', 'PRIMARY_ID', 'BUCKET', 'DISPOSITION', 'ENRICH_SOURCE', 'ENRICH_UPDATED_AT'];
/** Keys an ENRICH may never set: bucket/disposition reasons, application/rejection state, and anything Tim-ruled (TIM_*). Those change only through ruling kinds or upsert_application. */
var ENRICH_DENY = ['DECLINE_REASON_CODE', 'DECLINE_REASON_CODE_PRIOR', 'DECLINE_REASON_TEXT', 'REOPEN_TRIGGER', 'DUP_OF', 'INVALID_REASON', 'RESEARCH_REQUEST', 'POSTING_STATE',
  'APP_DATE', 'APP_STATUS_EVIDENCE', 'APPLICATION_STATUS', 'APPLICATION_RECEIPT_GMAIL_ID', 'REJECTION_DATE', 'REJECTION_EVIDENCE', 'STATE_SEMANTICS', 'ANTI_RESURRECTION', 'UPSERT_KEY'];
function isEnrichDenied_(k) { k = String(k).trim().toUpperCase(); return /^TIM_/.test(k) || ENRICH_DENY.indexOf(k) >= 0; }
var INTAKE_PRESERVE = ['INTAKE_KEY', 'SCOUT_RUN_ID', 'DISCOVERED_AT_ET', 'DISCOVERY_SOURCE', 'SOURCE_URL', 'SOURCE_PROVIDER', 'REQ_ID', 'IDENTITY_CONFIDENCE', 'INITIAL_UNKNOWN_FIELDS', 'POSSIBLE_MATCHES', 'DATE_ADDED', 'NOTIFICATION_SOURCE'];
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
  var flexEvidenceChanged = keys.some(function (rawKey) { return flexEvidenceKeys.indexOf(String(rawKey).trim().toUpperCase()) >= 0; });
  if (flexEvidenceChanged) {
    if (fields.FLEX !== undefined || fields.FLEX_HINT !== undefined) delete P.FLEX_CLASS;
    var f = PipelinePolicy.flex(P, flexPolicy);
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
    var urls = urlsIn(c[7]).concat(urlsIn(pp.payload.SOURCE || ''), urlsIn(pp.payload.SOURCE_URL || ''), urlsIn(pp.payload.JOB_URL || ''), urlsIn(pp.payload.CANONICAL_URL || ''));
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
    newLines.push(line); idx.push({ inv: inv, id: pid, company: rec.COMPANY, title: rec.TITLE, bucket: bucket, location: rec.LOCATION, reqTokens: reqTokens(rec.REQ_ID), reqCores: reqTokens(rec.REQ_ID).map(function (x) { return x.replace(/^(LI|GH|WD|JR|R|REQ)/, ''); }), urls: urlsIn(rec.SOURCE_URL), ne: normEmployer(rec.COMPANY), nt: normTitle(rec.TITLE), nl: normLocation(rec.LOCATION), intakeKey: rec.INTAKE_KEY });
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
  var ev=readEvents_('',1000), by={}; ev.forEach(function(e){if(e.requestId)by[e.requestId]=e});
  rows=rows.map(function(r){var e=by[r.requestId];return Object.assign({},r,e&&e.type==='TIM_RULING'?{lastEventType:e.type,lastEventAt:e.ts,lastActor:e.actor||'',status:e.verified?'ENRICHED':'SUBMITTED'}:{status:'REQUESTED'})});
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
function readFlexPolicy_() {
  var defaults = PipelinePolicy.normalizeFlexPolicy ? PipelinePolicy.normalizeFlexPolicy({}) : {};
  try {
    var text = DocumentApp.openById(CANONICAL_RULES_DOC_ID).getBody().getText();
    var sec = String(text || '').match(/(?:^|\n)SECTION=DEGREE_FLEX\s*\n([\s\S]*?)(?=\nSECTION=|$)/);
    if (!sec) return defaults;
    var raw = {};
    sec[1].split(/\r?\n/).forEach(function (line) {
      var m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) return;
      if (defaults[m[1]] !== undefined) raw[m[1]] = m[2];
    });
    return PipelinePolicy.normalizeFlexPolicy ? PipelinePolicy.normalizeFlexPolicy(raw) : raw;
  } catch (e) {
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
    model.modelVersion = String(model.modelVersion || '2026-10-03.1');
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
  var ev=readEvents_(pid,200).filter(function(e){return e.type==='TIM_RULING' && e.before && e.after && e.verified;})[0];
  if(!ev) return {ok:false,error:'no verified Tim ruling to undo'};
  var lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var doc=DocumentApp.openById(MASTER_ID), body=doc.getBody(), paras=body.getParagraphs(), hit=-1;
    for(var i=0;i<paras.length;i++) if(paras[i].getText()===ev.after) { hit=i; break; }
    if(hit<0) return {ok:false,error:'current row no longer matches last Tim ruling; fail closed'};
    paras[hit].setText(ev.before);
    var all=[]; for(var j=0;j<paras.length;j++) all.push(paras[j].getText());
    var counts=recomputeCountsLine(all), end=recomputeEndLine(all);
    for(var k=0;k<paras.length;k++){var t=paras[k].getText(); if(/^COUNTS:/.test(t)) paras[k].setText(counts); else if(end && /^END V2_CURRENT_POPULATION_MASTER/.test(t)) paras[k].setText(end);}
    doc.saveAndClose();
    appendEvent_({type:'TIM_RULING_UNDO',primaryId:pid,actor:'TIM',ts:new Date().toISOString(),requestId:String(u.requestId||''),undoneEventTs:ev.ts,before:ev.after,after:ev.before});
    return {ok:true,primaryId:pid,restored:ev.before,counts:counts};
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
function readRuns_() { var it = folder_().getFilesByName(RUNS_FILE_NAME); if (!it.hasNext()) return []; var txt = it.next().getBlob().getDataAsString(); return txt.split('\n').filter(Boolean).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); }
function appendRun_(rec) { var f = findOrCreate_(RUNS_FILE_NAME, 'text', ''); var cur = f.getBlob().getDataAsString(); f.setContent((cur ? cur.replace(/\n*$/, '\n') : '') + JSON.stringify(rec) + '\n'); }
function appendReceipt_(r) {
  var file = findOrCreate_(RECEIPTS_DOC_NAME, 'doc');
  var doc = DocumentApp.openById(file.getId()); var body = doc.getBody();
  var lines = Object.keys(r).map(function (k) { return k + '=' + (typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]); });
  body.appendParagraph(lines.join('\n') + '\nEND ' + r.RECEIPT); body.appendParagraph('');
  doc.saveAndClose();
}
function readReceipts_() { var it = folder_().getFilesByName(RECEIPTS_DOC_NAME); if (!it.hasNext()) return ''; return DocumentApp.openById(it.next().getId()).getBody().getText(); }

// CommonJS export for unit tests (ignored by Apps Script)
if (typeof module !== 'undefined') module.exports = { protectedCaseEvidence: protectedCaseEvidence, mutateRow: mutateRow, recomputeCountsLine: recomputeCountsLine, recomputeEndLine: recomputeEndLine, parsePayload: parsePayload, planIntake: planIntake, applyPlanToLines: applyPlanToLines, parseRulesText: parseRulesText, parseCanonicalNeverConsiderRules: parseCanonicalNeverConsiderRules, ruleById: ruleById, categoryTerms: categoryTerms, preExclusionCandidates: preExclusionCandidates, runCounters_: runCounters_, intakeResponse_: intakeResponse_, RULES_DOC_ID: RULES_DOC_ID, INTAKE_OUTCOMES: INTAKE_OUTCOMES, matchExisting: matchExisting, indexExisting: indexExisting, classifyNeverConsider: classifyNeverConsider, normEmployer: normEmployer, normTitle: normTitle, normLocation: normLocation, canonUrl: canonUrl, reqCore: reqCore, sanitizeRecord: sanitizeRecord, BUCKETS: BUCKETS, FINAL_BUCKETS: FINAL_BUCKETS, planUpsertApplication: planUpsertApplication, applyFields_: applyFields_, completedReceiptRequestIds_: completedReceiptRequestIds_, dispatchWrite_: dispatchWrite_, validateScoringModel_: validateScoringModel_, SCORING_MODEL_ID: SCORING_MODEL_ID, SCORING_WEIGHT_KEYS: SCORING_WEIGHT_KEYS, WRITE_ACTIONS: WRITE_ACTIONS };
