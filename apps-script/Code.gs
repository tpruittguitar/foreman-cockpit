/**
 * PIPELINE EXPLORER STATE WRITER (Google Apps Script)
 * Runs as Tim. The ONLY canonical mutations the Explorer makes go through this script, against the
 * single fixed master, with read-back verification (FORGE_AMENDMENT_58 Authorized State Writer contract).
 *
 * Actions (GET):  ping | master | state | receipts | rules | runs
 * Actions (POST): state | ruling | intake
 *
 * ruling  = Tim disposition on one existing row by exact PRIMARY_ID (PR #3).
 * intake  = Scout discovery intake: one or a batch of proposed records -> dedupe -> append canonical rows in
 *           SCOUT_INTAKE or DISCOVERY_LEAD only; idempotent by INTAKE_KEY; never touches existing rows.
 * rules   = the canonical Google Doc TIM_NEVER_CONSIDER_RULES in AI_Coordination (fixed ID), read-only here.
 * runs    = SCOUT_RUN_METRICS.jsonl beside the master (per-run cohort metrics, not a job store).
 *
 * DEPLOY: apps-script/README.md.  Pure functions below are unit-tested in tests/*.test.js via CommonJS export.
 */
var MASTER_ID = '19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI'; // fixed per Tim's 2026-09-29 ruling (cutover REV2)
var PASSPHRASE = 'CHANGE-ME';                                   // set your own; the page asks for it once
var STATE_FILE_NAME = 'PIPELINE_EXPLORER_STATE.json';
var RECEIPTS_DOC_NAME = 'PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS';
/** Canonical never-consider configuration: the Google Doc TIM_NEVER_CONSIDER_RULES in AI_Coordination (fixed ID, read-only here). Configuration only; never a job store. */
var RULES_DOC_ID = '1qLeVwmW76Cm_lHdleb342sE7_ej4dqTfODR1TcnF5os';
/** Every gross Scout discovery ends in exactly one of these outcomes. */
var INTAKE_OUTCOMES = ['NEVER_CONSIDER_EXCLUDED', 'SCOUT_INTAKE_WRITTEN', 'DISCOVERY_LEAD_WRITTEN', 'EXISTING_MATCH', 'WRITE_FAILED'];
var RUNS_FILE_NAME = 'SCOUT_RUN_METRICS.jsonl';

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
    if (a === 'ping') return out_({ ok: true, now: new Date().toISOString(), master: MASTER_ID, actions: ['master', 'state', 'receipts', 'rules', 'runs', 'ruling', 'intake'] });
    if (a === 'master') return out_(readMaster_());
    if (a === 'state') return out_({ ok: true, state: readState_() });
    if (a === 'receipts') return out_({ ok: true, text: readReceipts_() });
    if (a === 'rules') { var R = readRules_(); return out_({ ok: R.status !== 'UNAVAILABLE', rules: R }); }
    if (a === 'runs') return out_({ ok: true, runs: readRuns_() });
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
    if (req.action === 'intake') return out_(applyIntakeToMaster_(req));
    return out_({ ok: false, error: 'unknown action ' + req.action });
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
}
function auth_(k) { return PASSPHRASE && k === PASSPHRASE; }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

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
    var res = mutateRow(before, ruling);
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
    return { ok: verified, receipt: receipt, before: before, after: res.after, counts: newCounts };
  } finally { lock.releaseLock(); }
}
function fail_(msg, ruling) {
  var receipt = { RECEIPT: 'STATE_CHANGE_RECEIPT', REQUEST_ID: (ruling && ruling.requestId) || '', EXECUTED_BY: 'Pipeline Explorer Apps Script', TARGET_CANONICAL_ID: (ruling && ruling.primaryId) || '', COMPLETION_STATUS: 'STATE_CHANGE_NEEDS_RESOLUTION', REASON: msg, EXECUTED_AT: new Date().toISOString() };
  try { appendReceipt_(receipt); } catch (e) {}
  return { ok: false, error: msg, receipt: receipt };
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
      RECORDS_RECEIVED: (req.records || []).length, COUNTERS: counters, RULES_STATUS: rules.status, RULES_DOC_ID: RULES_DOC_ID,
      DISCOVERY_LEAD_AMBIGUOUS: plan.summary.AMBIGUOUS_LEAD, NEVER_CONSIDER_REVIEW_NEEDED: plan.summary.NEVER_CONSIDER_REVIEW_NEEDED,
      NEW_PRIMARY_IDS: plan.newLines.map(function (l) { return l.split(' | ')[1]; }),
      COUNTS_UPDATED: 'YES', END_UPDATED: newEnd ? 'YES' : 'NO_END_LINE', READBACK_VERIFIED: verified ? 'YES' : 'NO',
      TARGET_FILE_ID: MASTER_ID, COMPLETION_STATUS: verified ? 'COMPLETE' : 'FAILED', MASTER_MODIFIED_BEFORE: modBefore, EXECUTED_AT: new Date().toISOString()
    };
    appendReceipt_(receipt);
    // telemetry beside the master (SCOUT_RUN_METRICS.jsonl): counters + exclusion audit. Not candidate state; never a second ledger.
    appendRun_({ SCOUT_RUN_ID: receipt.SCOUT_RUN_ID, RECEIVED_AT: receipt.EXECUTED_AT, RUN: req.run || {}, COUNTERS: counters, GROSS_FOUND: counters.GROSS_FOUND, NEVER_CONSIDER_EXCLUDED: counters.NEVER_CONSIDER_EXCLUDED,
      EXCLUSIONS: scoutExclusions_(req.run || {}, rules).concat(plan.excluded), RESULTS: plan.results.map(function (r) { return { INTAKE_KEY: r.INTAKE_KEY, result: r.result, PRIMARY_ID: r.PRIMARY_ID, BUCKET: r.BUCKET, NEVER_CONSIDER_REVIEW_NEEDED: r.NEVER_CONSIDER_REVIEW_NEEDED }; }), COMPLETION_STATUS: receipt.COMPLETION_STATUS });
    return { ok: verified, receipt: receipt, results: plan.results, counts: newCounts, endLine: newEnd };
  } finally { lock.releaseLock(); }
}

/** Scout-side exclusions reported in run.NEVER_CONSIDER_EXCLUDED, normalized to the audit contract and checked against the canonical file. */
function scoutExclusions_(run, R) {
  var list = Array.isArray(run.NEVER_CONSIDER_EXCLUDED) ? run.NEVER_CONSIDER_EXCLUDED : [];
  return list.map(function (x) { x = x || {}; var id = clean_(x.NEVER_CONSIDER_RULE_ID || x.RULE_ID || ''); var rule = ruleById(R, id);
    return { SCOUT_RUN_ID: clean_(run.SCOUT_RUN_ID || ''), DISCOVERED_AT_ET: clean_(x.DISCOVERED_AT_ET || ''), COMPANY: clean_(x.COMPANY || x.EMPLOYER || ''), TITLE: clean_(x.TITLE || ''), LOCATION: clean_(x.LOCATION || ''), SOURCE: clean_(x.SOURCE || ''), SOURCE_URL: clean_(x.SOURCE_URL || ''),
      NEVER_CONSIDER_RULE_ID: id, EXCLUSION_CONFIDENCE: clean_(x.EXCLUSION_CONFIDENCE || 'HIGH').toUpperCase(), EXCLUSION_REASON: clean_(x.EXCLUSION_REASON || x.REASON || ''), TIM_OVERRIDE: 'NO', BASIS: 'SCOUT_PRE_INTAKE', RULE_VALID: rule && rule.active ? 'YES' : 'NO' }; });
}
/** Run-level counters in the canonical vocabulary. GROSS_FOUND comes from Scout when supplied, else records + Scout exclusions. Per-rule counts use the ACTIVE rule ids from the canonical file. */
function runCounters_(run, plan, R, verified) {
  var scoutEx = scoutExclusions_(run, R); var s = plan.summary;
  var c = { GROSS_FOUND: num_(run.GROSS_FOUND) || (plan.results.length + scoutEx.length), NEVER_CONSIDER_EXCLUDED: scoutEx.length + s.NEVER_CONSIDER_EXCLUDED };
  (R.rules || []).forEach(function (r) { c[r.RULE_ID + '_COUNT'] = 0; });
  scoutEx.concat(plan.excluded).forEach(function (x) { var rule = ruleById(R, x.NEVER_CONSIDER_RULE_ID); var k = (rule && rule.active ? rule.RULE_ID : 'UNKNOWN_RULE') + '_COUNT'; c[k] = (c[k] || 0) + 1; });  // never a count under a category the canonical file does not carry as ACTIVE
  c.ENTERED_MASTER = verified ? s.ENTERED_MASTER : 0; c.SCOUT_INTAKE_WRITTEN = verified ? s.SCOUT_INTAKE_WRITTEN : 0; c.DISCOVERY_LEAD_WRITTEN = verified ? s.DISCOVERY_LEAD_WRITTEN : 0;
  c.EXISTING_MATCH = s.EXISTING_MATCH; c.WRITE_FAILED = s.WRITE_FAILED + (verified ? 0 : s.ENTERED_MASTER); c.NEVER_CONSIDER_REVIEW_NEEDED = s.NEVER_CONSIDER_REVIEW_NEEDED;
  return c;
}
/* ================= pure functions: row mutation ================= */
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
function mutateRow(line, ruling) {
  var cells = line.split(' | ');
  if (cells.length < FIXED_N + 1) return { ok: false, error: 'row has fewer than 10 cells' };
  var fixed = cells.slice(0, FIXED_N), rest = cells.slice(FIXED_N).join(' | ');
  var pp = parsePayload(rest), P = pp.payload, O = pp.order;
  function set(k, v) { if (O.indexOf(k) < 0) O.push(k); P[k] = clean_(v); }
  var ts = ruling.ts || new Date().toISOString(), d = today_(ts), kind = String(ruling.kind || '').toUpperCase(), val = String(ruling.value || '').toUpperCase();
  var note = clean_(ruling.note || '');
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
    fixed[4] = 'APPLIED'; fixed[5] = 'RESOLVED/APPLIED_CONFIRMED';
    set('APP_DATE', d); set('APP_STATUS_EVIDENCE', 'Tim direct statement via Pipeline Explorer ' + d + (note ? ': ' + note : ''));
    set('ANTI_RESURRECTION', 'YES'); set('TIM_RULING', 'APPLIED'); tags.push('TIM_APPLIED_' + d);
    changes.push('BUCKET', 'DISPOSITION', 'APP_DATE', 'APP_STATUS_EVIDENCE', 'ANTI_RESURRECTION');
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
  set('STATE_SOURCE', 'TIM_EXPLORER:' + (ruling.requestId || 'no-id'));
  set('STATE_UPDATED_AT', ts);
  fixed[6] = tags.length ? tags.filter(function (t, i) { return tags.indexOf(t) === i; }).join('; ') : '-';
  var after = fixed.join(' | ') + ' | ' + buildPayload(pp.lead, P, O);
  return { ok: true, after: after, changes: changes, beforeState: beforeState, afterState: fixed[4] + ' / ' + fixed[5], company: fixed[2], title: fixed[3], req: fixed[7] };
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
  if (rc && rc.length >= 5) { var byReq = idx.filter(function (r) { return r.reqCores.indexOf(rc) >= 0; }); if (byReq.length === 1) return { kind: 'exact', rows: byReq, by: 'REQ_ID' }; if (byReq.length > 1) return { kind: 'ambiguous', rows: byReq, by: 'REQ_ID' }; }
  var cu = canonUrl(rec.SOURCE_URL || '');
  if (cu && !/^(linkedin\.com\/jobs\/search|indeed\.com\/jobs)/.test(cu) && cu.length > 12) { var byUrl = idx.filter(function (r) { return r.urls.indexOf(cu) >= 0; }); if (byUrl.length === 1) return { kind: 'exact', rows: byUrl, by: 'SOURCE_URL' }; if (byUrl.length > 1) return { kind: 'ambiguous', rows: byUrl, by: 'SOURCE_URL' }; }
  var ne = normEmployer(rec.COMPANY), nt = normTitle(rec.TITLE), nl = normLocation(rec.LOCATION);
  if (ne && nt) {
    var byId = idx.filter(function (r) { return r.ne === ne && r.nt === nt; });
    if (byId.length === 1) {
      // a single employer+title candidate: exact only when the locations do not conflict (either side unstated counts as no conflict)
      var only = byId[0];
      if (!nl || !only.nl || only.nl === nl) return { kind: 'exact', rows: byId, by: 'EMPLOYER_TITLE_LOCATION' };
      return { kind: 'ambiguous', rows: byId, by: 'EMPLOYER_TITLE (location differs)' };
    }
    if (byId.length > 1) {
      // several candidates: an unstated location on either side never resolves identity; fail closed
      var sameLoc = byId.filter(function (r) { return nl && r.nl && r.nl === nl; });
      if (sameLoc.length === 1) return { kind: 'exact', rows: sameLoc, by: 'EMPLOYER_TITLE_LOCATION' };
      return { kind: 'ambiguous', rows: sameLoc.length > 1 ? sameLoc : byId, by: sameLoc.length > 1 ? 'EMPLOYER_TITLE_LOCATION' : 'EMPLOYER_TITLE (location differs or unstated)' };
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
function ruleById(R, id) { id = String(id || '').trim().toUpperCase(); for (var i = 0; i < (R.rules || []).length; i++) if (String(R.rules[i].RULE_ID).toUpperCase() === id) return R.rules[i]; return null; }
/** Words of a CATEGORY (e.g. FOOD_OR_BEVERAGE_MANUFACTURER) that may hint at the domain. Used only to flag a review, never to exclude. */
function categoryTerms(cat) { var stop = { OR: 1, AND: 1, MANUFACTURER: 1, SERVICE: 1, OF: 1, THE: 1 }; return String(cat || '').toUpperCase().split(/[^A-Z]+/).filter(function (w) { return w && !stop[w] && w.length > 3; }).map(function (w) { return w.toLowerCase(); }); }
var NEG_HINT_RE = /\b(supplier|supplies|serving|serves|customers? in|for the|equipment for|automation for|to the|vendor|integrator|consult|software|logistics|component)\b/;
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
    if (conf === 'HIGH') return { outcome: 'EXCLUDE', ruleId: rule.RULE_ID, confidence: 'HIGH', reason: reason || rule.REASON, basis: 'SCOUT_CLASSIFICATION' };
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
  ['INTAKE_KEY', 'COMPANY', 'TITLE', 'LOCATION', 'REQ_ID', 'SOURCE', 'SOURCE_URL', 'SOURCE_PROVIDER', 'DISCOVERY_SOURCE', 'DISCOVERED_AT_ET', 'IDENTITY_CONFIDENCE', 'PROPOSED_BUCKET', 'EMPLOYER_PRIMARY_BUSINESS', 'NEVER_CONSIDER_RULE_ID', 'NEVER_CONSIDER_REASON', 'EXCLUSION_CONFIDENCE', 'EXCLUSION_REASON'].concat(INTAKE_FACT_KEYS).forEach(function (k) { if (rec[k] !== undefined && rec[k] !== null) out[k] = clean_(rec[k]).slice(0, 400); });
  var unk = rec.INITIAL_UNKNOWN_FIELDS; out.INITIAL_UNKNOWN_FIELDS = Array.isArray(unk) ? unk.map(clean_).filter(Boolean).join(',') : clean_(unk || '');
  if (out.SOURCE_URL && !/^https?:\/\//i.test(out.SOURCE_URL)) out.SOURCE_URL = '';
  if (out.SOURCE && !out.DISCOVERY_SOURCE) out.DISCOVERY_SOURCE = out.SOURCE;
  return out;
}
function planIntake(lines, records, rulesObj, ctx) {
  ctx = ctx || {}; var results = [], newLines = [], excluded = [], summary = { NEVER_CONSIDER_EXCLUDED: 0, SCOUT_INTAKE_WRITTEN: 0, DISCOVERY_LEAD_WRITTEN: 0, EXISTING_MATCH: 0, WRITE_FAILED: 0, ENTERED_MASTER: 0, NEVER_CONSIDER_REVIEW_NEEDED: 0, REPLAY: 0, AMBIGUOUS_LEAD: 0 }, byRule = {};
  var R = rulesObj && rulesObj.rules ? rulesObj : { status: 'UNAVAILABLE', rules: [], activeIds: [] };
  if (!Array.isArray(records)) return { ok: false, error: 'records must be an array' };
  if (records.length > 200) return { ok: false, error: 'batch too large (max 200)' };
  var idx = indexExisting(lines);
  var maxInv = 0, seenIds = {}; idx.forEach(function (r) { if (r.inv > maxInv) maxInv = r.inv; seenIds[r.id] = true; });
  var run = ctx.run || {}; var runId = clean_(run.SCOUT_RUN_ID || ''); var now = ctx.now || new Date().toISOString(); var nowET = ctx.nowET || '';
  var batchKeys = {};
  for (var i = 0; i < records.length; i++) {
    var rec = sanitizeRecord(records[i]);
    var res = { index: i, INTAKE_KEY: '', result: '', PRIMARY_ID: '', INV: null, BUCKET: '', matchedBy: '', detail: '', NEVER_CONSIDER_RULE_ID: '', NEVER_CONSIDER_REVIEW_NEEDED: '' };
    if (!rec || !rec.COMPANY || !rec.TITLE) { res.result = 'WRITE_FAILED'; res.detail = 'INVALID_INPUT: COMPANY and TITLE are required'; summary.WRITE_FAILED++; results.push(res); continue; }
    if (!rec.INTAKE_KEY) rec.INTAKE_KEY = 'IK-' + hashHex([runId, normEmployer(rec.COMPANY), normTitle(rec.TITLE), normLocation(rec.LOCATION), reqCore(rec.REQ_ID), canonUrl(rec.SOURCE_URL)].join('|')).slice(0, 16);
    res.INTAKE_KEY = rec.INTAKE_KEY;
    if (batchKeys[rec.INTAKE_KEY]) { res.result = 'EXISTING_MATCH'; res.PRIMARY_ID = batchKeys[rec.INTAKE_KEY]; res.matchedBy = 'INTAKE_KEY (same batch)'; res.detail = 'REPLAY'; summary.EXISTING_MATCH++; summary.REPLAY++; results.push(res); continue; }
    var nc = classifyNeverConsider(rec, R);
    if (nc.outcome === 'EXCLUDE') {
      res.result = 'NEVER_CONSIDER_EXCLUDED'; res.NEVER_CONSIDER_RULE_ID = nc.ruleId; res.detail = nc.ruleId + ' ' + nc.confidence + ' (' + nc.basis + ')'; summary.NEVER_CONSIDER_EXCLUDED++; byRule[nc.ruleId] = (byRule[nc.ruleId] || 0) + 1;
      excluded.push({ SCOUT_RUN_ID: runId || 'UNSPECIFIED', DISCOVERED_AT_ET: rec.DISCOVERED_AT_ET || nowET, COMPANY: rec.COMPANY, TITLE: rec.TITLE, LOCATION: rec.LOCATION || 'NOT_STATED', SOURCE: rec.DISCOVERY_SOURCE || 'Scout', SOURCE_URL: rec.SOURCE_URL || '', NEVER_CONSIDER_RULE_ID: nc.ruleId, EXCLUSION_CONFIDENCE: nc.confidence, EXCLUSION_REASON: nc.reason, TIM_OVERRIDE: 'NO', INTAKE_KEY: rec.INTAKE_KEY, BASIS: nc.basis });
      results.push(res); continue;
    }
    if (nc.outcome === 'REVIEW') { res.NEVER_CONSIDER_REVIEW_NEEDED = nc.ruleId; summary.NEVER_CONSIDER_REVIEW_NEEDED++; }
    var m = matchExisting(rec, idx);
    if (m.kind === 'exact') { res.result = 'EXISTING_MATCH'; res.PRIMARY_ID = m.rows[0].id; res.INV = m.rows[0].inv; res.BUCKET = m.rows[0].bucket; res.matchedBy = m.by; if (m.by === 'INTAKE_KEY') { res.detail = 'REPLAY'; summary.REPLAY++; } summary.EXISTING_MATCH++; results.push(res); continue; }
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
    set('SOURCE_URL', rec.SOURCE_URL); set('SOURCE_PROVIDER', rec.SOURCE_PROVIDER); set('REQ_ID', rec.REQ_ID); set('IDENTITY_CONFIDENCE', conf);
    set('INITIAL_UNKNOWN_FIELDS', rec.INITIAL_UNKNOWN_FIELDS || 'UNSPECIFIED'); if (m.kind === 'ambiguous') set('POSSIBLE_MATCHES', m.rows.map(function (r) { return r.id; }).join(','));
    INTAKE_FACT_KEYS.forEach(function (k) { set(k, rec[k]); }); set('EMPLOYER_PRIMARY_BUSINESS', rec.EMPLOYER_PRIMARY_BUSINESS);
    if (nc.outcome === 'REVIEW') { set('NEVER_CONSIDER_REVIEW_NEEDED', nc.ruleId + ' ' + nc.confidence + ' (' + nc.basis + ')'); set('NEVER_CONSIDER_REASON', nc.reason); }
    set('DATE_ADDED', today_(now)); set('NOTIFICATION_SOURCE', rec.SOURCE_PROVIDER || rec.DISCOVERY_SOURCE || 'Scout');
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
/** Read the canonical never-consider Doc (fixed ID). Read-only: the Doc is opened and never saved, so its modifiedTime is untouched. Edits are Tim's, in the Doc. */
function readRules_() {
  try {
    var text = DocumentApp.openById(RULES_DOC_ID).getBody().getText();
    var R = parseRulesText(text); R.id = RULES_DOC_ID; R.raw = text;
    try { R.modifiedTime = DriveApp.getFileById(RULES_DOC_ID).getLastUpdated().toISOString(); } catch (e2) { R.modifiedTime = ''; }
    return R;
  } catch (e) { return { source: 'TIM_NEVER_CONSIDER_RULES', id: RULES_DOC_ID, status: 'UNAVAILABLE', defaultAction: 'ALLOW_INTAKE', header: {}, rules: [], activeIds: [], error: String(e && e.message || e) }; }
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
if (typeof module !== 'undefined') module.exports = { mutateRow: mutateRow, recomputeCountsLine: recomputeCountsLine, recomputeEndLine: recomputeEndLine, parsePayload: parsePayload, planIntake: planIntake, applyPlanToLines: applyPlanToLines, parseRulesText: parseRulesText, ruleById: ruleById, categoryTerms: categoryTerms, scoutExclusions_: scoutExclusions_, runCounters_: runCounters_, RULES_DOC_ID: RULES_DOC_ID, INTAKE_OUTCOMES: INTAKE_OUTCOMES, matchExisting: matchExisting, indexExisting: indexExisting, classifyNeverConsider: classifyNeverConsider, normEmployer: normEmployer, normTitle: normTitle, normLocation: normLocation, canonUrl: canonUrl, reqCore: reqCore, sanitizeRecord: sanitizeRecord, BUCKETS: BUCKETS, FINAL_BUCKETS: FINAL_BUCKETS };
