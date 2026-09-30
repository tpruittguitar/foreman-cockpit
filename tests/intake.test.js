// Intake (Scout discovery -> canonical rows) tests. Run: node tests/intake.test.js [path-to-real-export]
const fs = require('fs'), path = require('path');
const W = require('../apps-script/Code.gs'); const P = require('../pipeline-parser.js'); const G = require('./gen_population.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const size = 562 + Math.floor(Math.random() * 40) + 1;   // never a fixed population
const master = G.generate(size, 7); const lines0 = master.split('\n');
const base = P.parse(master);
ok(base.checksum.ok && base.rows.length === base.counts.TOTAL && base.endCount === base.rows.length, 'synthetic fixture of ' + base.rows.length + ' rows parses with COUNTS and END consistent (size not hard-coded)');
const rules = W.defaultRules();
const ctx = { run: { SCOUT_RUN_ID: 'RUN-TEST-1', GROSS_FOUND: 9 }, now: '2026-10-01T12:00:00.000Z', nowET: '2026-10-01 08:00 ET' };
const existing = base.rows.find(r => r.REQ.startsWith('LI-') && r.BUCKET === 'READY_TO_PURSUE') || base.rows.find(r => r.REQ.startsWith('LI-'));
const existingUrlRow = base.rows.find(r => (r.payload.SOURCE || '').includes('greenhouse'));
const records = [
  { COMPANY: 'Nova Forge Robotics', TITLE: 'Director of Manufacturing', LOCATION: 'Huntsville, AL', REQ_ID: 'GH-7777777001', SOURCE_URL: 'https://job-boards.greenhouse.io/novaforge/jobs/7777777001', SOURCE_PROVIDER: 'Greenhouse', DISCOVERY_SOURCE: 'Scout direct ATS', IDENTITY_CONFIDENCE: 'HIGH', INITIAL_UNKNOWN_FIELDS: ['PAY', 'DEGREE', 'FLEX', 'FIT', 'LIVENESS', 'REPORTING_LEVEL'] },
  { COMPANY: 'Quiet Signal Systems', TITLE: 'Head of Production', LOCATION: '', SOURCE_PROVIDER: 'LinkedIn', IDENTITY_CONFIDENCE: 'LOW', INITIAL_UNKNOWN_FIELDS: 'REQ,URL,PAY,DEGREE,FLEX,FIT,LIVENESS' },   // -> DISCOVERY_LEAD
  { COMPANY: existing.COMPANY, TITLE: 'Totally Different Title', LOCATION: 'Nowhere', REQ_ID: existing.REQ },                                    // exact req dup -> EXISTING_MATCH
  { COMPANY: 'X', TITLE: 'Y', SOURCE_URL: existingUrlRow.payload.SOURCE },                                                                          // url dup -> EXISTING_MATCH
  { COMPANY: 'Pillcorp Therapeutics', TITLE: 'Director of Manufacturing', LOCATION: 'Boston, MA', EMPLOYER_DOMAIN_HINT: 'pharmaceutical manufacturer', REQ_ID: 'R-123456789' }, // never-consider
  { COMPANY: 'Steel Automation Partners', TITLE: 'Plant Manager', LOCATION: 'Dayton, OH', EMPLOYER_DOMAIN_HINT: 'industrial automation supplier serving pharmaceutical plants', REQ_ID: 'WD-555555501', PROPOSED_BUCKET: 'READY_TO_PURSUE' }, // supplier is NOT pharma; proposed final bucket must be refused
  { COMPANY: '', TITLE: 'no company' },                                                                                                             // invalid
  { COMPANY: 'Nova Forge Robotics', TITLE: 'Director of Manufacturing', LOCATION: 'Huntsville, AL', REQ_ID: 'GH-7777777001', SOURCE_URL: 'https://job-boards.greenhouse.io/novaforge/jobs/7777777001' } // same-batch replay
];
const plan = W.planIntake(lines0, records, rules, ctx);
ok(plan.ok, 'plan ok');
const R = plan.results;
ok(R[0].result === 'CREATED' && R[0].BUCKET === 'SCOUT_INTAKE' && /^V2I-[0-9A-F]{12}$/.test(R[0].PRIMARY_ID), 'SCOUT_INTAKE row created with V2I PRIMARY_ID: ' + R[0].PRIMARY_ID);
ok(R[1].result === 'CREATED' && R[1].BUCKET === 'DISCOVERY_LEAD', 'weak identity -> DISCOVERY_LEAD');
ok(R[2].result === 'EXISTING_MATCH' && R[2].PRIMARY_ID === existing.PRIMARY_ID && R[2].matchedBy === 'REQ_ID', 'exact req duplicate returns EXISTING_MATCH with the existing PRIMARY_ID');
ok(R[3].result === 'EXISTING_MATCH' && R[3].PRIMARY_ID === existingUrlRow.PRIMARY_ID && R[3].matchedBy === 'SOURCE_URL', 'canonical URL duplicate returns the existing row');
ok(R[4].result === 'EXCLUDED_NEVER_CONSIDER' && /NC-PHARMA/.test(R[4].detail), 'pharma employer excluded by rule NC-PHARMA, reported with rule id');
ok(R[5].result === 'CREATED' && R[5].BUCKET === 'SCOUT_INTAKE', 'automation supplier to pharma is NOT excluded; proposed READY_TO_PURSUE refused, admitted as SCOUT_INTAKE');
ok(R[6].result === 'INVALID_INPUT', 'malformed record rejected without touching master');
ok(R[7].result === 'REPLAY' && R[7].PRIMARY_ID === R[0].PRIMARY_ID, 'same record twice in one batch is a REPLAY, no second row');
ok(plan.newLines.length === 3 && plan.summary.CREATED === 3, 'exactly three rows minted');
const newRow = P.parseRow(plan.newLines[0], 1, null);
ok(newRow.INV === String(base.rows.length + 1) && newRow.payload.SCOUT_RUN_ID === 'RUN-TEST-1' && newRow.payload.DISCOVERED_AT_ET && newRow.payload.SOURCE_URL && newRow.payload.SOURCE_PROVIDER === 'Greenhouse' && newRow.payload.REQ_ID === 'GH-7777777001' && newRow.payload.IDENTITY_CONFIDENCE === 'HIGH' && /PAY,DEGREE,FLEX/.test(newRow.payload.INITIAL_UNKNOWN_FIELDS) && newRow.payload.INTAKE_KEY, 'provenance keys written: next INV, SCOUT_RUN_ID, DISCOVERED_AT_ET, SOURCE_URL, SOURCE_PROVIDER, REQ_ID, IDENTITY_CONFIDENCE, INITIAL_UNKNOWN_FIELDS, INTAKE_KEY');
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
ok(plan2.ok && plan2.newLines.length === 0 && plan2.results.filter(r => r.result === 'REPLAY').length >= 3, 'replaying the same batch creates zero rows (REPLAY by INTAKE_KEY)');
const lines2 = W.applyPlanToLines(lines1, plan2);
ok(lines2.join('\n') === lines1.join('\n'), 'replay leaves the master byte-identical');
// intake cannot set final buckets
['READY_TO_PURSUE', 'APPLIED', 'REJECTED_BY_EMPLOYER', 'DECLINED_BY_TIM', 'CLOSED_DEAD', 'DUPLICATE', 'INVALID_DISCOVERY'].forEach(b => {
  const p = W.planIntake(lines0, [{ COMPANY: 'Bucket Probe ' + b, TITLE: 'Director', REQ_ID: 'GH-9' + b.length + '0000001', PROPOSED_BUCKET: b }], rules, ctx);
  ok(p.results[0].result === 'CREATED' && ['SCOUT_INTAKE', 'DISCOVERY_LEAD'].indexOf(p.results[0].BUCKET) >= 0, 'intake cannot create ' + b + ' (got ' + p.results[0].BUCKET + ')');
});
// ambiguous identity fails closed on merge -> DISCOVERY_LEAD with POSSIBLE_MATCHES
const dupTitleCompany = base.rows.find(r => base.rows.filter(x => x.COMPANY === r.COMPANY && x.TITLE === r.TITLE && x.LOCATION !== r.LOCATION).length >= 1);
if (dupTitleCompany) {
  const p = W.planIntake(lines0, [{ COMPANY: dupTitleCompany.COMPANY, TITLE: dupTitleCompany.TITLE, LOCATION: 'Somewhere Else, ZZ' }], rules, ctx);
  ok(p.results[0].result === 'CREATED' && p.results[0].BUCKET === 'DISCOVERY_LEAD' && /AMBIGUOUS/.test(p.results[0].matchedBy) && /POSSIBLE_MATCHES=/.test(p.newLines[0]), 'ambiguous employer+title with different location: no merge, DISCOVERY_LEAD with POSSIBLE_MATCHES');
} else ok(false, 'fixture lacks an ambiguous-identity case');
// many unknowns admitted
const p3 = W.planIntake(lines0, [{ COMPANY: 'Unknown Everything Co', TITLE: 'VP Operations', INITIAL_UNKNOWN_FIELDS: ['PAY', 'DEGREE', 'FLEX', 'FIT', 'LIVENESS', 'REPORTING_LEVEL', 'REQ_ID', 'LOCATION', 'URL'] }], rules, ctx);
ok(p3.results[0].result === 'CREATED', 'record with nearly everything UNKNOWN is still admitted (unknown is a research state)');
// malformed / hostile input cannot damage master
const hostile = W.planIntake(lines0, [{ COMPANY: 'Evil | Corp; BUCKET=APPLIED', TITLE: 'x\ny | APPLIED', LOCATION: 'a; b', REQ_ID: 'GH-1234567890', SOURCE_URL: 'javascript:alert(1)' }], rules, ctx);
const hostileRow = P.parseRow(hostile.newLines[0], 1, null);
ok(hostile.newLines[0].split('\n').length === 1 && hostileRow.BUCKET === 'SCOUT_INTAKE' && hostileRow.cellCount === 10 && !hostileRow.payload.SOURCE_URL, 'pipes, semicolons, newlines and non-http URLs are neutralized; row stays one line with 10 cells');
ok(!W.planIntake(lines0, 'nope', rules, ctx).ok && !W.planIntake(lines0, new Array(201).fill({ COMPANY: 'a', TITLE: 'b' }), rules, ctx).ok, 'non-array and oversized batches rejected');
// new ruling kinds on intake rows + protection
const l3 = W.applyPlanToLines(lines0, plan); const intakeLine = plan.newLines[0];
const inv = W.mutateRow(intakeLine, { kind: 'INVALID_DISCOVERY', note: 'not a job', ts: '2026-10-02T00:00:00.000Z', requestId: 'PX-9' });
ok(inv.ok && P.parseRow(inv.after, 1, null).BUCKET === 'INVALID_DISCOVERY' && /INVALID_REASON=/.test(inv.after), 'Tim can mark an intake row INVALID_DISCOVERY');
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
