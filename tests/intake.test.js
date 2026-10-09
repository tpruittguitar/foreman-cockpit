// Intake (Scout discovery -> canonical rows) tests. Run: node tests/intake.test.js [path-to-real-export]
const fs = require('fs'), path = require('path');
const W = require('../apps-script/Code.gs'); const P = require('../pipeline-parser.js'); const G = require('./gen_population.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const size = 562 + Math.floor(Math.random() * 40) + 1;   // never a fixed population
const master = G.generate(size, 7); const lines0 = master.split('\n');
const base = P.parse(master);
ok(base.checksum.ok && base.rows.length === base.counts.TOTAL && base.endCount === base.rows.length, 'synthetic fixture of ' + base.rows.length + ' rows parses with COUNTS and END consistent (size not hard-coded)');
const rules = W.parseRulesText(fs.readFileSync(path.join(__dirname, 'fixtures', 'TIM_NEVER_CONSIDER_RULES.sample.txt'), 'utf8'));
ok(rules.status === 'ACTIVE' && rules.activeIds.length === 4, 'canonical never-consider rules loaded from the Doc-format fixture');
const ctx = { run: { SCOUT_RUN_ID: 'RUN-TEST-1', GROSS_FOUND: 9 }, now: '2026-10-01T12:00:00.000Z', nowET: '2026-10-01 08:00 ET' };
const existing = base.rows.find(r => r.REQ.startsWith('LI-') && r.BUCKET === 'READY_TO_PURSUE') || base.rows.find(r => r.REQ.startsWith('LI-'));
const existingUrlRow = base.rows.find(r => (r.payload.SOURCE || '').includes('greenhouse'));
const records = [
  { COMPANY: 'Nova Forge Robotics', TITLE: 'Director of Manufacturing', LOCATION: 'Huntsville, AL', REQ_ID: 'GH-7777777001', SOURCE_URL: 'https://job-boards.greenhouse.io/novaforge/jobs/7777777001', SOURCE_PROVIDER: 'Greenhouse', DISCOVERY_SOURCE: 'Scout direct ATS', IDENTITY_CONFIDENCE: 'HIGH', INITIAL_UNKNOWN_FIELDS: ['PAY', 'DEGREE', 'FLEX', 'FIT', 'LIVENESS', 'REPORTING_LEVEL'] },
  { SOURCE: 'https://example.test/initiating/0', COMPANY: 'Quiet Signal Systems', TITLE: 'Head of Production', LOCATION: '', SOURCE_PROVIDER: 'LinkedIn', IDENTITY_CONFIDENCE: 'LOW', INITIAL_UNKNOWN_FIELDS: 'REQ,URL,PAY,DEGREE,FLEX,FIT,LIVENESS' },   // -> DISCOVERY_LEAD
  { COMPANY: existing.COMPANY, TITLE: 'Totally Different Title', LOCATION: 'Nowhere', REQ_ID: existing.REQ },                                    // exact req dup -> EXISTING_MATCH
  { COMPANY: 'X', TITLE: 'Y', SOURCE_URL: existingUrlRow.payload.SOURCE },                                                                          // url dup -> EXISTING_MATCH
  { COMPANY: 'Pillcorp Therapeutics', TITLE: 'Director of Manufacturing', LOCATION: 'Boston, MA', SOURCE: 'LinkedIn', SOURCE_URL: 'https://www.linkedin.com/jobs/view/4488888801', DISCOVERED_AT_ET: '2026-10-01 07:55 ET', NEVER_CONSIDER_RULE_ID: 'NC-001', EXCLUSION_CONFIDENCE: 'HIGH', EXCLUSION_REASON: 'pharmaceutical manufacturer (primary business)', REQ_ID: 'R-123456789' }, // never-consider, HIGH
  { SOURCE: 'https://example.test/initiating/1', COMPANY: 'Steel Automation Partners', TITLE: 'Plant Manager', LOCATION: 'Dayton, OH', EMPLOYER_DOMAIN_HINT: 'industrial automation supplier serving pharmaceutical plants', REQ_ID: 'WD-555555501', PROPOSED_BUCKET: 'READY_TO_PURSUE' }, // supplier is NOT pharma; proposed final bucket must be refused
  { COMPANY: '', TITLE: 'no company' },                                                                                                             // invalid
  { COMPANY: 'Nova Forge Robotics', TITLE: 'Director of Manufacturing', LOCATION: 'Huntsville, AL', REQ_ID: 'GH-7777777001', SOURCE_URL: 'https://job-boards.greenhouse.io/novaforge/jobs/7777777001' } // same-batch replay
];
const plan = W.planIntake(lines0, records, rules, ctx);
ok(plan.ok, 'plan ok');
const R = plan.results;
ok(R[0].result === 'SCOUT_INTAKE_WRITTEN' && R[0].BUCKET === 'SCOUT_INTAKE' && /^V2I-[0-9A-F]{12}$/.test(R[0].PRIMARY_ID), 'SCOUT_INTAKE row created with V2I PRIMARY_ID: ' + R[0].PRIMARY_ID);
ok(R[1].result === 'DISCOVERY_LEAD_WRITTEN' && R[1].BUCKET === 'DISCOVERY_LEAD', 'weak identity -> DISCOVERY_LEAD');
ok(R[2].result === 'EXISTING_MATCH' && R[2].PRIMARY_ID === existing.PRIMARY_ID && R[2].matchedBy === 'REQ_ID', 'exact req duplicate returns EXISTING_MATCH with the existing PRIMARY_ID');
ok(R[3].outcome === 'IDENTITY_CONFLICT' && R[3].candidateIds.includes(existingUrlRow.PRIMARY_ID), 'cross-employer URL collision remains an explicit preserved conflict');
ok(R[4].result === 'NEVER_CONSIDER_EXCLUDED' && R[4].NEVER_CONSIDER_RULE_ID === 'NC-001', 'pharma employer excluded by rule NC-001 (HIGH), reported with rule id');
const ex = plan.excluded[0];
ok(ex && ex.SCOUT_RUN_ID === 'RUN-TEST-1' && ex.DISCOVERED_AT_ET === '2026-10-01 07:55 ET' && ex.COMPANY === 'Pillcorp Therapeutics' && ex.TITLE && ex.LOCATION === 'Boston, MA' && ex.SOURCE === 'LinkedIn' && /linkedin/.test(ex.SOURCE_URL) && ex.NEVER_CONSIDER_RULE_ID === 'NC-001' && ex.EXCLUSION_CONFIDENCE === 'HIGH' && ex.EXCLUSION_REASON && ex.TIM_OVERRIDE === 'NO', 'exclusion audit record carries the full contract (run, time, company, title, location, source, url, rule, confidence, reason, TIM_OVERRIDE=NO)');
ok(plan.byRule['NC-001'] === 1 && !plan.byRule['NC-002'], 'per-rule count NC-001=1');
ok(R[5].result === 'SCOUT_INTAKE_WRITTEN' && R[5].BUCKET === 'SCOUT_INTAKE' && !R[5].NEVER_CONSIDER_REVIEW_NEEDED, 'automation supplier to pharma is NOT excluded (no review flag); proposed READY_TO_PURSUE refused, admitted as SCOUT_INTAKE');
ok(R[6].result === 'WRITE_FAILED' && /INVALID_INPUT/.test(R[6].detail), 'malformed record -> WRITE_FAILED (explicit outcome), master untouched');
ok(R[7].result === 'EXISTING_MATCH' && R[7].detail === 'REPLAY' && R[7].PRIMARY_ID === R[0].PRIMARY_ID, 'same record twice in one batch is EXISTING_MATCH (replay), no second row');
ok(plan.newLines.length === 3 && plan.summary.ENTERED_MASTER === 3 && plan.summary.SCOUT_INTAKE_WRITTEN === 2 && plan.summary.DISCOVERY_LEAD_WRITTEN === 1 && plan.summary.EXISTING_MATCH === 2 && plan.summary.NEVER_CONSIDER_EXCLUDED === 1 && plan.summary.WRITE_FAILED === 2, 'exactly three rows minted; every record has one explicit outcome: ' + JSON.stringify(plan.summary));
ok(R.every(r => W.INTAKE_OUTCOMES.indexOf(r.result) >= 0), 'every result is one of ' + W.INTAKE_OUTCOMES.join('|'));
// run-level counters in the canonical vocabulary (as the writer logs them), including Scout's own pre-intake exclusions
// run-level counters in the canonical vocabulary. The writer, not Scout, owns NEVER_CONSIDER_EXCLUDED: entries in
// run.NEVER_CONSIDER_EXCLUDED (legacy transport) are candidates that go through the same adjudication as records.
const preEx = [
  { COMPANY: 'Burger Barn', TITLE: 'GM', NEVER_CONSIDER_RULE_ID: 'NC-004', EXCLUSION_CONFIDENCE: 'HIGH', EXCLUSION_REASON: 'restaurant operator', EMPLOYER_DOMAIN_HINT: 'fast-food restaurant chain' },   // legitimately excluded by the writer
  { COMPANY: 'Mystery Co', NEVER_CONSIDER_RULE_ID: 'NC-042', EXCLUSION_CONFIDENCE: 'HIGH' }   // no TITLE: cannot be adjudicated -> WRITE_FAILED (nothing silently disappears)
];
const runEx = { SCOUT_RUN_ID: 'RUN-TEST-1', GROSS_FOUND: 10, NEVER_CONSIDER_EXCLUDED: preEx };
const planEx = W.planIntake(lines0, records, rules, Object.assign({}, ctx, { run: runEx }));
ok(planEx.results.length === records.length + preEx.length && planEx.results.filter(r => r.SUBMITTED_VIA === 'RUN_PRE_EXCLUSION').length === 2, 'pre-excluded entries are appended as candidates and adjudicated by the writer');
const bb = planEx.results.find(r => r.SUBMITTED_VIA === 'RUN_PRE_EXCLUSION' && r.index === records.length), my = planEx.results.find(r => r.index === records.length + 1);
ok(bb.result === 'NEVER_CONSIDER_EXCLUDED' && bb.NEVER_CONSIDER_RULE_ID === 'NC-004' && planEx.excluded.find(x => x.COMPANY === 'Burger Barn').SUBMITTED_VIA === 'RUN_PRE_EXCLUSION' && planEx.excluded.find(x => x.COMPANY === 'Burger Barn').DECIDED_BY === 'WRITER', 'a consistent pre-exclusion is excluded by the writer and audited with SUBMITTED_VIA=RUN_PRE_EXCLUSION');
ok(my.result === 'WRITE_FAILED' && /resubmit/.test(my.detail), 'a pre-exclusion the writer cannot adjudicate (no TITLE) is WRITE_FAILED, never counted excluded');
const ctr = W.runCounters_(runEx, planEx, rules, true);
ok(ctr.GROSS_FOUND === 10 && ctr.CANDIDATES_SUBMITTED === 10 && ctr.PRE_EXCLUSION_ENTRIES === 2 && ctr.NEVER_CONSIDER_EXCLUDED === 2 && ctr['NC-001_COUNT'] === 1 && ctr['NC-004_COUNT'] === 1 && ctr['NC-002_COUNT'] === 0 && ctr['NC-003_COUNT'] === 0 && ctr.UNKNOWN_RULE_COUNT === undefined && ctr.ENTERED_MASTER === 3 && ctr.SCOUT_INTAKE_WRITTEN === 2 && ctr.DISCOVERY_LEAD_WRITTEN === 1 && ctr.EXISTING_MATCH === 2 && ctr.WRITE_FAILED === 3, 'run counters: GROSS_FOUND, NEVER_CONSIDER_EXCLUDED, NC-00x_COUNT, ENTERED_MASTER, SCOUT_INTAKE_WRITTEN, DISCOVERY_LEAD_WRITTEN, EXISTING_MATCH, WRITE_FAILED: ' + JSON.stringify(ctr));
ok(ctr.RUN_ACCOUNTING === 'RECONCILED' && ctr.DISCOVERY_UNACCOUNTED === 0 && ctr.DISCOVERY_ACCOUNTED === ctr.NEVER_CONSIDER_EXCLUDED + ctr.SCOUT_INTAKE_WRITTEN + ctr.DISCOVERY_LEAD_WRITTEN + ctr.EXISTING_MATCH + ctr.WRITE_FAILED, 'GROSS_FOUND = NEVER_CONSIDER_EXCLUDED + SCOUT_INTAKE_WRITTEN + DISCOVERY_LEAD_WRITTEN + EXISTING_MATCH + WRITE_FAILED -> RECONCILED');
const ctrInc = W.runCounters_(Object.assign({}, runEx, { GROSS_FOUND: 13 }), planEx, rules, true);
ok(ctrInc.RUN_ACCOUNTING === 'INCOMPLETE' && ctrInc.DISCOVERY_UNACCOUNTED === 3, 'GROSS_FOUND larger than submitted outcomes -> DISCOVERY_UNACCOUNTED=3, run INCOMPLETE');
const ctrOver = W.runCounters_(Object.assign({}, runEx, { GROSS_FOUND: 9 }), planEx, rules, true);
ok(ctrOver.RUN_ACCOUNTING === 'OVERREPORTED' && ctrOver.DISCOVERY_UNACCOUNTED === -1, 'a supplied GROSS_FOUND that disagrees with submitted outcomes is never silent (9 reported, 10 accounted -> OVERREPORTED)');
const ctrDerived = W.runCounters_(Object.assign({}, runEx, { GROSS_FOUND: undefined }), planEx, rules, true);
ok(ctrDerived.GROSS_FOUND === 10 && ctrDerived.RUN_ACCOUNTING === 'RECONCILED', 'GROSS_FOUND omitted -> derived from every submitted candidate, reconciled');
const ctrFail = W.runCounters_(runEx, planEx, rules, false);
ok(ctrFail.ENTERED_MASTER === 0 && ctrFail.WRITE_FAILED === 6, 'if readback fails nothing counts as entered; the would-be rows count as WRITE_FAILED');
// (Forge review 2, item 1) pre-exclusion bypass: a supplier pre-excluded as NC-001 HIGH only through run.NEVER_CONSIDER_EXCLUDED must still get a row
const bypass = W.planIntake(lines0, [], rules, Object.assign({}, ctx, { run: { SCOUT_RUN_ID: 'RUN-BYPASS', NEVER_CONSIDER_EXCLUDED: [{ SOURCE: 'https://example.test/initiating/2', COMPANY: 'Automation Partners', TITLE: 'Director of Manufacturing', LOCATION: 'Dayton, OH', REQ_ID: 'GH-9100000001', NEVER_CONSIDER_RULE_ID: 'NC-001', EXCLUSION_CONFIDENCE: 'HIGH', EXCLUSION_REASON: 'pharma', EMPLOYER_DOMAIN_HINT: 'industrial automation supplier serving pharmaceutical plants' }] } }));
ok(bypass.results.length === 1 && bypass.results[0].result === 'SCOUT_INTAKE_WRITTEN' && bypass.results[0].NEVER_CONSIDER_REVIEW_NEEDED === 'NC-001' && bypass.excluded.length === 0 && bypass.newLines.length === 1 && /NEVER_CONSIDER_REVIEW_NEEDED=NC-001 HIGH \(EVIDENCE_CONFLICT_DO_NOT_MATCH/.test(bypass.newLines[0]), 'Scout cannot bypass the writer: a supplier pre-excluded as NC-001 HIGH via run.NEVER_CONSIDER_EXCLUDED is admitted as SCOUT_INTAKE with a review flag, not excluded');
ok(W.runCounters_({ SCOUT_RUN_ID: 'RUN-BYPASS', GROSS_FOUND: 1 }, bypass, rules, true)['NC-001_COUNT'] === 0, 'and it is not counted as an NC-001 exclusion');
// (Forge review 2, item 2) caller-facing response: ok means the whole contract completed, not only the Drive readback
const rcpt = { RECEIPT: 'INTAKE_RECEIPT' };
const respOk = W.intakeResponse_(true, ctr, rcpt, planEx, 'COUNTS: x', 'END x');
ok(respOk.ok === true && respOk.WRITE_VERIFIED === true && respOk.COMPLETION_STATUS === 'COMPLETE' && respOk.RUN_ACCOUNTING === 'RECONCILED', 'verified + reconciled -> ok:true, WRITE_VERIFIED:true, COMPLETE');
const respInc = W.intakeResponse_(true, ctrInc, rcpt, planEx, 'COUNTS: x', 'END x');
ok(respInc.ok === false && respInc.WRITE_VERIFIED === true && respInc.COMPLETION_STATUS === 'INCOMPLETE' && respInc.DISCOVERY_UNACCOUNTED === 3 && /do not retry/.test(respInc.error), 'verified but DISCOVERY_UNACCOUNTED != 0 -> ok:false, WRITE_VERIFIED:true, INCOMPLETE, error tells Scout to submit the missing discoveries and not retry written rows');
const respOver = W.intakeResponse_(true, ctrOver, rcpt, planEx, 'COUNTS: x', 'END x');
ok(respOver.ok === false && respOver.WRITE_VERIFIED === true && respOver.RUN_ACCOUNTING === 'OVERREPORTED', 'overreported -> ok:false, WRITE_VERIFIED:true');
const respFail = W.intakeResponse_(false, ctrFail, rcpt, planEx, 'COUNTS: x', 'END x');
ok(respFail.ok === false && respFail.WRITE_VERIFIED === false && respFail.COMPLETION_STATUS === 'FAILED', 'readback failure -> ok:false, WRITE_VERIFIED:false, FAILED');
// telemetry never alters population: excluding does not touch a single master line
const exclOnly = W.planIntake(lines0, [{ COMPANY: 'Pillcorp Therapeutics', TITLE: 'QA Director', NEVER_CONSIDER_RULE_ID: 'NC-001', EXCLUSION_CONFIDENCE: 'HIGH' }], rules, ctx);
ok(exclOnly.newLines.length === 0 && exclOnly.excluded.length === 1 && W.applyPlanToLines(lines0, exclOnly).join('\n') === lines0.join('\n'), 'never-consider telemetry does not alter canonical master population counts (master byte-identical)');
// review-needed admission
const rev = W.planIntake(lines0, [{ SOURCE: 'https://example.test/initiating/3', COMPANY: 'Northline Holdings', TITLE: 'Plant Manager', LOCATION: 'Toledo, OH', REQ_ID: 'GH-6600000001', NEVER_CONSIDER_RULE_ID: 'NC-001', EXCLUSION_CONFIDENCE: 'MED', EXCLUSION_REASON: 'mixed pharma packaging / chemicals' }], rules, ctx);
ok(rev.results[0].result === 'SCOUT_INTAKE_WRITTEN' && rev.results[0].NEVER_CONSIDER_REVIEW_NEEDED === 'NC-001' && /NEVER_CONSIDER_REVIEW_NEEDED=NC-001 MED/.test(rev.newLines[0]) && /NEVER_CONSIDER_REASON=mixed pharma/.test(rev.newLines[0]), 'MED-confidence classification is admitted with NEVER_CONSIDER_REVIEW_NEEDED and the candidate rule id on the row');
const newRow = P.parseRow(plan.newLines[0], 1, null);
ok(newRow.INV === String(base.rows.length + 1) && newRow.payload.SCOUT_RUN_ID === 'RUN-TEST-1' && newRow.payload.DISCOVERED_AT_ET && newRow.payload.MASTER_LOADED_AT && newRow.payload.SOURCE_URL && newRow.payload.SOURCE_PROVIDER === 'Greenhouse' && newRow.payload.REQ_ID === 'GH-7777777001' && newRow.payload.IDENTITY_CONFIDENCE === 'HIGH' && /PAY,DEGREE,FLEX/.test(newRow.payload.INITIAL_UNKNOWN_FIELDS) && newRow.payload.INTAKE_KEY, 'provenance keys written: next INV, SCOUT_RUN_ID, DISCOVERED_AT_ET, MASTER_LOADED_AT, SOURCE_URL, SOURCE_PROVIDER, REQ_ID, IDENTITY_CONFIDENCE, INITIAL_UNKNOWN_FIELDS, INTAKE_KEY');
ok(newRow.payload.DATE_ADDED === '2026-10-01' && newRow.payload.STATE_SOURCE === 'SCOUT_INTAKE:RUN-TEST-1', 'DATE_ADDED and STATE_SOURCE set');
// apply + recount + END
const lines1 = W.applyPlanToLines(lines0, plan); const after = P.parse(lines1.join('\n'));
ok(after.rows.length === base.rows.length + 3, 'master grew by exactly three rows');
ok(after.checksum.ok && after.counts.SCOUT_INTAKE === 2 && after.counts.DISCOVERY_LEAD === 1 && after.counts.TOTAL === base.rows.length + 3, 'COUNTS includes SCOUT_INTAKE and DISCOVERY_LEAD and reconciles: ' + lines1.find(l => /^COUNTS:/.test(l)));
ok(after.endCount === base.rows.length + 3, 'END marker count updated: ' + after.endLine);
ok(after.rows.filter(r => r.section === 'SCOUT_INTAKE').length === 2 || after.sections.some(s => s.name === 'SCOUT_INTAKE'), 'SCOUT_INTAKE heading added once');
// existing rows untouched
const beforeSet = new Set(lines0.filter(l => /^\d+ \| /.test(l))); const afterRows = lines1.filter(l => /^\d+ \| /.test(l));
ok(afterRows.filter(l => beforeSet.has(l)).length === base.rows.length, 'every pre-existing row line is byte-identical after intake (no overwrite of protected/finalized state)');
// idempotent replay of the whole batch
const plan2 = W.planIntake(lines1, records, rules, ctx);
ok(plan2.ok && plan2.newLines.length === 0 && plan2.results.filter(r => r.result === 'EXISTING_MATCH' && r.matchedBy === 'INTAKE_KEY').length >= 3, 'replaying the same batch creates zero rows (EXISTING_MATCH by INTAKE_KEY)');
const lines2 = W.applyPlanToLines(lines1, plan2);
ok(lines2.join('\n') === lines1.join('\n'), 'replay leaves the master byte-identical');
// intake cannot set final buckets
['READY_TO_PURSUE', 'APPLIED', 'REJECTED_BY_EMPLOYER', 'DECLINED_BY_TIM', 'CLOSED_DEAD', 'DUPLICATE', 'INVALID_DISCOVERY'].forEach(b => {
  const p = W.planIntake(lines0, [{ SOURCE_URL: 'https://example.test/probe/'+b, COMPANY: 'Bucket Probe ' + b, TITLE: 'Director', REQ_ID: 'GH-9' + b.length + '0000001', PROPOSED_BUCKET: b }], rules, ctx);
  ok(/_WRITTEN$/.test(p.results[0].result) && ['SCOUT_INTAKE', 'DISCOVERY_LEAD'].indexOf(p.results[0].BUCKET) >= 0, 'intake cannot create ' + b + ' (got ' + p.results[0].BUCKET + ')');
});
// ambiguous identity fails closed on merge -> DISCOVERY_LEAD with POSSIBLE_MATCHES
const dupTitleCompany = base.rows.find(r => base.rows.filter(x => x.COMPANY === r.COMPANY && x.TITLE === r.TITLE && x.LOCATION !== r.LOCATION).length >= 1);
if (dupTitleCompany) {
  const p = W.planIntake(lines0, [{ SOURCE_URL:'https://example.test/ambiguous', COMPANY: dupTitleCompany.COMPANY, TITLE: dupTitleCompany.TITLE, LOCATION: 'Somewhere Else, ZZ' }], rules, ctx);
  ok(p.results[0].outcome === 'AMBIGUOUS_MATCH' && p.newLines.length === 0 && p.results[0].source, 'ambiguous same-employer identity held with its original evidence, no speculative row');
} else ok(false, 'fixture lacks an ambiguous-identity case');
// (Forge review item 2) employer+title with a missing location never becomes exact identity, across runs
const runA = W.planIntake(lines0, [{ SOURCE: 'https://example.test/initiating/4', COMPANY: 'Twin Req Industries', TITLE: 'Plant Manager', REQ_ID: 'GH-8800000001', SOURCE_URL: 'https://job-boards.greenhouse.io/twinreq/jobs/8800000001' }], rules, { run: { SCOUT_RUN_ID: 'RUN-A' }, now: '2026-10-01T12:00:00.000Z', nowET: '2026-10-01 08:00 ET' });
ok(runA.results[0].result === 'SCOUT_INTAKE_WRITTEN', 'run A: first Twin Req role (no location) admitted as SCOUT_INTAKE');
const linesA = W.applyPlanToLines(lines0, runA);
const runB = W.planIntake(linesA, [{ SOURCE: 'https://example.test/initiating/4', COMPANY: 'Twin Req Industries', TITLE: 'Plant Manager', REQ_ID: 'GH-8800000002' }], rules, { run: { SCOUT_RUN_ID: 'RUN-B' }, now: '2026-10-03T12:00:00.000Z', nowET: '2026-10-03 08:00 ET' });
ok(runB.results[0].result === 'SCOUT_INTAKE_WRITTEN' && runB.results[0].PRIMARY_ID !== runA.results[0].PRIMARY_ID, 'distinct employer-bound requisition preserves a separate job despite missing location');
const runB2 = W.planIntake(linesA, [{ SOURCE: 'https://example.test/initiating/4', COMPANY: 'Twin Req Industries', TITLE: 'Plant Manager', LOCATION: 'Mobile, AL' }], rules, ctx);
ok(runB2.results[0].outcome === 'AMBIGUOUS_MATCH' && runB2.newLines.length === 0, 'missing requisition and unmatched location remains a durable ambiguity');
const sameLocRow = base.rows.find(r => r.LOCATION && r.LOCATION !== 'NOT_STATED' && base.rows.filter(x => x.COMPANY === r.COMPANY && x.TITLE === r.TITLE).length === 1);
const exactId = W.planIntake(lines0, [{ COMPANY: sameLocRow.COMPANY, TITLE: sameLocRow.TITLE, LOCATION: sameLocRow.LOCATION }], rules, ctx);
ok(exactId.results[0].result === 'EXISTING_MATCH' && exactId.results[0].matchedBy === 'EMPLOYER_TITLE_LOCATION' && exactId.results[0].PRIMARY_ID === sameLocRow.PRIMARY_ID, 'employer+title with both locations present and equal, single candidate -> EXISTING_MATCH');
// (Forge review item 3) requisition ids are employer-bound
const reqRow = base.rows.find(r => /^(LI|GH)-\d{5,}/.test(r.REQ));
const otherEmp = W.planIntake(lines0, [{ SOURCE: 'https://example.test/initiating/5', COMPANY: 'Completely Different Employer LLC', TITLE: 'Plant Manager', REQ_ID: reqRow.REQ }], rules, ctx);
ok(otherEmp.results[0].result === 'SCOUT_INTAKE_WRITTEN', 'employer-local requisition token alone does not collapse unrelated companies');
const urlRow = base.rows.find(r => (r.payload.SOURCE || '').includes('linkedin.com/jobs/view/') && /^LI-\d{5,}/.test(r.REQ) && r.payload.SOURCE.endsWith(r.REQ.slice(3)));
const urlBound = W.planIntake(lines0, [{ COMPANY: 'Different Name For Same Employer', TITLE: 'X', REQ_ID: urlRow.REQ, SOURCE_URL: urlRow.payload.SOURCE }], rules, ctx);
ok(urlBound.results[0].outcome === 'IDENTITY_CONFLICT' && urlBound.newLines.length === 0, 'shared URL cannot bind an unrelated employer to a protected row');
// many unknowns admitted
const p3 = W.planIntake(lines0, [{ COMPANY: 'Unknown Everything Co', TITLE: 'VP Operations', INITIAL_UNKNOWN_FIELDS: ['PAY', 'DEGREE', 'FLEX', 'FIT', 'LIVENESS', 'REPORTING_LEVEL', 'REQ_ID', 'LOCATION', 'URL'] }], rules, ctx);
ok(p3.results[0].result==='WRITE_FAILED'&&p3.newLines.length===0, 'URL-less discovery held without creating a row');
// malformed / hostile input cannot damage master
const hostile = W.planIntake(lines0, [{ COMPANY: 'Evil | Corp; BUCKET=APPLIED', TITLE: 'x\ny | APPLIED', LOCATION: 'a; b', REQ_ID: 'GH-1234567890', SOURCE_URL: 'javascript:alert(1)' }], rules, ctx);
ok(hostile.newLines.length===0&&hostile.results[0].result==='WRITE_FAILED','non-http initiating URL is held');
ok(!W.planIntake(lines0, 'nope', rules, ctx).ok && !W.planIntake(lines0, new Array(201).fill({ COMPANY: 'a', TITLE: 'b' }), rules, ctx).ok, 'non-array and oversized batches rejected');
// new ruling kinds on intake rows + protection
const l3 = W.applyPlanToLines(lines0, plan); const intakeLine = plan.newLines[0];
const inv = W.mutateRow(intakeLine, { kind: 'INVALID_DISCOVERY', note: 'not a job', ts: '2026-10-02T00:00:00.000Z', requestId: 'PX-9' });
const invRow = P.parseRow(inv.after, 1, null);
ok(inv.ok && invRow.BUCKET === 'INVALID_DISCOVERY' && invRow.payload.INVALID_REASON === 'not a job' && invRow.payload.TIM_RULING === 'INVALID_DISCOVERY' && invRow.payload.STATE_UPDATED_AT === '2026-10-02T00:00:00.000Z' && invRow.payload.STATE_SOURCE === 'TIM_EXPLORER:PX-9' && invRow.PRIMARY_ID === P.parseRow(intakeLine, 1, null).PRIMARY_ID && invRow.payload.INTAKE_KEY === P.parseRow(intakeLine, 1, null).payload.INTAKE_KEY, 'INVALID_DISCOVERY preserves the row (same PRIMARY_ID, INTAKE_KEY) with INVALID_REASON, TIM_RULING, STATE_UPDATED_AT, STATE_SOURCE');
const dup = W.mutateRow(intakeLine, { kind: 'DUPLICATE', dupOf: existing.PRIMARY_ID, ts: '2026-10-02T00:00:00.000Z' });
ok(dup.ok && /DUP_OF /.test(P.parseRow(dup.after, 1, null).DISPOSITION), 'Tim can mark an intake row DUPLICATE with dupOf');
ok(!W.mutateRow(intakeLine, { kind: 'DUPLICATE' }).ok, 'DUPLICATE without dupOf is refused');
const mr = W.mutateRow(intakeLine, { kind: 'MANUAL_RESEARCH', note: 'check comp', ts: '2026-10-02T00:00:00.000Z' });
ok(mr.ok && P.parseRow(mr.after, 1, null).BUCKET === 'MANUAL_RESEARCH', 'Tim can send an intake row to MANUAL_RESEARCH');
const cd = W.mutateRow(intakeLine, { kind: 'CLOSED_DEAD', note: 'posting removed', ts: '2026-10-02T00:00:00.000Z' });
ok(cd.ok && P.parseRow(cd.after, 1, null).BUCKET === 'CLOSED_DEAD', 'Tim can close an intake row');
const appliedLine = lines0.find(l => /^\d+ \| /.test(l) && l.split(' | ')[4] === 'APPLIED');
['DECLINE', 'INVALID_DISCOVERY', 'DUPLICATE', 'CLOSED_DEAD', 'MANUAL_RESEARCH'].forEach(k => ok(!W.mutateRow(appliedLine, { kind: k, dupOf: 'x', note: 'n' }).ok, 'APPLIED row cannot be downgraded by ' + k));
const rej = lines0.find(l => /^\d+ \| /.test(l) && l.split(' | ')[4] === 'REJECTED_BY_EMPLOYER');
ok(!W.mutateRow(rej, { kind: 'APPLY_NOW', value: 'YES' }).ok && W.mutateRow(rej, { kind: 'NOTE', note: 'ok' }).ok, 'REJECTED_BY_EMPLOYER row: pursue refused, note allowed');
// real export, if given: dry-run plan against it must not touch any existing line and must reconcile
const real = process.argv[2];
if (real && fs.existsSync(real)) {
  const rl = fs.readFileSync(real, 'utf8').replace(/^﻿/, '').replace(/\r/g, '').split('\n');
  const rp = W.planIntake(rl, [{ COMPANY: 'Dry Run Co', TITLE: 'Director of Manufacturing', LOCATION: 'Nashville, TN', REQ_ID: 'GH-8080808080', SOURCE_URL: 'https://job-boards.greenhouse.io/dryrun/jobs/8080808080' }], rules, ctx);
  const rl2 = W.applyPlanToLines(rl, rp); const rm = P.parse(rl2.join('\n')); const rm0 = P.parse(rl.join('\n'));
  ok(rp.ok && rp.newLines.length === 1 && rm.rows.length === rm0.rows.length + 1 && rm.checksum.ok && rm.endCount === rm.rows.length, 'real export dry run: +1 row, COUNTS and END reconcile (' + rm.rows.length + ')');
  const before = new Set(rl.filter(l => /^\d+ \| /.test(l))); ok(rl2.filter(l => /^\d+ \| /.test(l) && before.has(l)).length === rm0.rows.length, 'real export dry run: all existing rows byte-identical');
  const dupReq = rm0.rows.find(r => /\d{7,}/.test(r.REQ) && !/reapply|old /i.test(r.REQ));
  const rp2 = W.planIntake(rl, [{ COMPANY: dupReq.COMPANY, TITLE: dupReq.TITLE, REQ_ID: dupReq.REQ.match(/[A-Za-z]*[-_ ]?\d{5,}/)[0] }], rules, ctx);
  ok(['EXISTING_MATCH'].indexOf(rp2.results[0].result) >= 0 || rp2.results[0].BUCKET === 'DISCOVERY_LEAD', 'real export: re-discovering an existing req does not mint a SCOUT_INTAKE row (' + rp2.results[0].result + ' ' + rp2.results[0].matchedBy + ')');
}
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASS'); process.exit(fails ? 1 : 0);
