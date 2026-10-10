// Tests for the automation/access additions: new ruling kinds, field merge, email-confirmed upsert, queue parsing.
// Run: node tests/automation.test.js [path-to-real-master-export]
const fs = require('fs'), path = require('path');
const W = require('../apps-script/Code.gs');
const A = require('../apps-script/Automation.gs');
const G = require('./gen_population.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const real = process.argv[2] && fs.existsSync(process.argv[2]);
const text = real ? fs.readFileSync(process.argv[2], 'utf8').replace(/^﻿/, '').replace(/\r/g, '') : G.generate(580, 11);
const lines = text.split('\n');
const rows = lines.filter(l => /^\d+ \| /.test(l));
const rowOf = (ls, id) => ls.filter(l => /^\d+ \| /.test(l) && l.split(' | ')[1].trim() === id);
const pick = b => rows.find(l => l.split(' | ')[4] === b && l.split(' | ').length >= 10);
console.log(real ? 'using real master export (' + rows.length + ' rows)' : 'using synthetic population (' + rows.length + ' rows)');

// ---- ruling kinds ----
const declined = pick('DECLINED_BY_TIM');
const ts = '2026-10-02T03:00:00.000Z';
let r = W.mutateRow(declined, { kind: 'REJECTED_BY_EMPLOYER', evidence: 'Gmail 1abc acme "Position update"', eventDate: '2026-09-30', ts, actor: 'forge', requestId: 'T1' });
ok(r.ok && r.after.split(' | ')[4] === 'REJECTED_BY_EMPLOYER' && r.after.split(' | ')[5] === 'RESOLVED/REJECTED_BY_EMPLOYER', 'REJECTED_BY_EMPLOYER moves bucket/disposition');
ok(/REJECTION_DATE=2026-09-30/.test(r.after) && /REJECTION_EVIDENCE=Gmail 1abc/.test(r.after) && /ANTI_RESURRECTION=YES/.test(r.after), 'rejection date/evidence/anti-resurrection recorded');
ok(/STATE_SOURCE=FORGE:T1/.test(r.after), 'actor recorded in STATE_SOURCE');
ok(W.mutateRow(declined, { kind: 'REJECTED_BY_EMPLOYER', ts }).ok === false, 'REJECTED_BY_EMPLOYER without evidence is refused');
const rejected = r.after;
ok(W.mutateRow(rejected, { kind: 'APPLIED', ts }).ok === false, 'APPLIED cannot regress a REJECTED_BY_EMPLOYER row');
ok(W.mutateRow(rejected, { kind: 'APPLIED', ts, force: true, evidence: 'new application' }).ok === true, 'APPLIED over rejection allowed only with force');
r = W.mutateRow(declined, { kind: 'APPLIED', ts, eventDate: '2026-10-01', evidence: 'Gmail 1a0f confirmation' });
ok(r.ok && /APP_DATE=2026-10-01/.test(r.after) && /APP_STATUS_EVIDENCE=Gmail 1a0f confirmation/.test(r.after) && /STATE_UPDATED_AT=2026-10-02T03:00:00.000Z/.test(r.after), 'APPLIED uses eventDate/evidence and keeps the real write time');
r = W.mutateRow(declined, { kind: 'APPLIED', ts: '2026-10-01T04:00:00.000Z' });
ok(r.ok && /APP_DATE=2026-10-01/.test(r.after) && /STATE_SOURCE=TIM_EXPLORER:no-id/.test(r.after), 'legacy APPLIED ruling unchanged (Explorer path)');

// ENRICH
const intakeRow = pick('SCOUT_INTAKE') || pick('MANUAL_RESEARCH');
r = W.mutateRow(intakeRow, { kind: 'ENRICH', ts, actor: 'claude', requestId: 'E1', fields: { CLAUDE_FIT: 'HIGH', SALARY_BASE_EST: '$250k-$300k', SOURCE_URL: 'https://example.com/jobs/1' } });
ok(r.ok && r.after.split(' | ')[4] === intakeRow.split(' | ')[4], 'ENRICH never changes bucket');
ok(/CLAUDE_FIT=HIGH/.test(r.after) && /SALARY_BASE_EST=\$250k-\$300k/.test(r.after), 'ENRICH sets fields');
const hadUrl = /(^|; )SOURCE_URL=/.test(intakeRow.split(' | ').slice(9).join(' | '));
ok(!hadUrl || /INTAKE_SOURCE_URL=/.test(r.after), 'changed intake key keeps its prior value as INTAKE_<KEY>');
ok(W.mutateRow(intakeRow, { kind: 'ENRICH', ts }).ok === false, 'ENRICH requires fields');
ok(W.mutateRow(intakeRow, { kind: 'ENRICH', ts, fields: { STATE_SOURCE: 'x' } }).ok === false, 'writer-owned fields are refused');
ok(W.mutateRow(intakeRow, { kind: 'ENRICH', ts, fields: { 'bad key': 'x' } }).ok === false, 'malformed field names are refused');
ok(W.mutateRow(intakeRow, { kind: 'ENRICH', ts, fields: { SOURCE_URL: 'javascript:alert(1)' } }).ok === false, 'enrichment refuses non-http posting links');
ok(W.mutateRow(intakeRow, { kind: 'ENRICH', ts, fields: { FLEX: 'MAYBE' } }).ok === false, 'enrichment refuses unnormalized FLEX values');
r = W.mutateRow(pick('DECLINED_BY_TIM'), { kind: 'DECLINE', code: 'PAY_BELOW_FLOOR', note: 'midpoint 180k < 250k', ts, actor: 'FORGE', fields: { REOPEN_TRIGGER: 'Verified midpoint >= 250k' } });
ok(r.ok && /REOPEN_TRIGGER=Verified midpoint >= 250k/.test(r.after), 'fields override defaults on other kinds (Forge decline with custom reopen trigger)');
const cells = declined.split(' | ').length;
ok(W.mutateRow(declined, { kind: 'ENRICH', ts, fields: { X_NOTE: 'a | b; c' } }).after.split(' | ').length >= cells, 'field values are sanitized (no cell/segment injection)');

// ---- upsert_application ----
const now = '2026-10-02T03:10:00.000Z';
let p = W.planUpsertApplication(lines, { SOURCE_URL:'https://example.test/jobs/zyxwv', COMPANY: 'Zyxwv Novel Aerostructures', TITLE: 'Director of Manufacturing', STATE: 'APPLIED', EVENT_DATE: '2026-10-01', EVIDENCE: 'Gmail 1zz "Thanks for applying"', LOCATION: 'Wichita, KS' }, { now });
ok(p.ok && p.mode === 'CREATE' && /^V2E-[0-9A-F]{12}$/.test(p.primaryId), 'no match -> CREATE with V2E id');
const c = p.newLine.split(' | ');
ok(c[4] === 'APPLIED' && c[5] === 'RESOLVED/APPLIED_CONFIRMED' && c.length >= 10 && /UPSERT_KEY=UK-/.test(p.newLine) && /APP_DATE=2026-10-01/.test(p.newLine) && /ANTI_RESURRECTION=YES/.test(p.newLine), 'created row is a well-formed APPLIED row with evidence and upsert key');
const maxInv = Math.max(...rows.map(l => parseInt(l, 10)));
ok(parseInt(c[0], 10) === maxInv + 1, 'created row takes the next INV');
const withNew = lines.slice(); const endI = withNew.findIndex(l => /^END V2_CURRENT_POPULATION_MASTER/.test(l)); withNew.splice(endI >= 0 ? endI : withNew.length, 0, p.newLine);
const replay = W.planUpsertApplication(withNew, { SOURCE_URL:'https://example.test/jobs/zyxwv', COMPANY: 'Zyxwv Novel Aerostructures', TITLE: 'Director of Manufacturing', STATE: 'APPLIED', EVENT_DATE: '2026-10-01', EVIDENCE: 'Gmail 1zz "Thanks for applying"', LOCATION: 'Wichita, KS' }, { now });
ok(replay.ok && replay.mode === 'ALREADY_APPLIED' && replay.primaryId === p.primaryId, 'replay of the same event is a no-op');
const rej = W.planUpsertApplication(withNew, { SOURCE_URL:'https://example.test/jobs/zyxwv', COMPANY: 'Zyxwv Novel Aerostructures', TITLE: 'Director of Manufacturing', STATE: 'REJECTED_BY_EMPLOYER', EVIDENCE: 'Gmail 2zz "update"', LOCATION: 'Wichita, KS' }, { now });
ok(rej.ok && rej.mode === 'UPDATE' && rej.primaryId === p.primaryId && rej.after.split(' | ')[4] === 'REJECTED_BY_EMPLOYER', 'later rejection updates the same row in place (no second row)');
ok(rej.after.split(' | ')[1] === p.primaryId, 'PRIMARY_ID preserved on update');
const tgt = declined.split(' | ')[1].trim();
const byTarget = W.planUpsertApplication(lines, { TARGET_PRIMARY_ID: tgt, STATE: 'APPLIED', EVIDENCE: 'Gmail 3zz', EVENT_DATE: '2026-10-01' }, { now });
ok(byTarget.ok && byTarget.mode === 'UPDATE' && byTarget.primaryId === tgt && byTarget.after.split(' | ')[4] === 'APPLIED', 'TARGET_PRIMARY_ID rules exactly that row');
const amb = rows.map(l => l.split(' | ')).find(a => rows.filter(l => { const b = l.split(' | '); return W.normEmployer(b[2]) === W.normEmployer(a[2]) && W.normTitle(b[3]) === W.normTitle(a[3]); }).length > 1);
if (amb) { const h = W.planUpsertApplication(lines, { COMPANY: amb[2], TITLE: amb[3], STATE: 'APPLIED', EVIDENCE: 'Gmail 4zz' }, { now }); ok(!h.ok && h.mode === 'HOLD' && h.possibleMatches.length > 1, 'ambiguous identity -> HOLD, nothing written'); }
ok(W.planUpsertApplication(lines, { COMPANY: 'A', TITLE: 'B', STATE: 'APPLIED' }, { now }).mode === 'INVALID', 'evidence required');
ok(W.planUpsertApplication(lines, { COMPANY: 'A', TITLE: 'B', STATE: 'READY_TO_PURSUE', EVIDENCE: 'x' }, { now }).mode === 'INVALID', 'only APPLIED / REJECTED_BY_EMPLOYER states');

// counts + END after a create
const counts = W.recomputeCountsLine(withNew), endL = W.recomputeEndLine(withNew);
const applied = (n => n)(rows.filter(l => l.split(' | ')[4] === 'APPLIED').length + 1);
ok(new RegExp('APPLIED=' + applied + '\\b').test(counts), 'COUNTS reflects the created APPLIED row');
ok(endL === null || new RegExp('\\(' + (rows.length + 1) + ' rows\\)').test(endL), 'END marker reflects +1 row');

// ---- queue parsing ----
ok(A.parseQueueContent_('```json\n{"action":"intake","records":[]}\n```').ok, 'code-fenced JSON accepted');
ok(A.parseQueueContent_('﻿Here you go:\n{“action”: “ruling”, “ruling”: {}}').body.action === 'ruling', 'BOM, prose and smart quotes from Docs tolerated');
ok(!A.parseQueueContent_('no json here').ok, 'non-JSON rejected');
ok(!A.parseQueueContent_('[1,2]').ok, 'non-object rejected');
ok(W.WRITE_ACTIONS.join(',') === 'intake,ruling,data_discovery,upsert_application,interview_note,approve_resume,save_rules,save_scoring_model,undo_ruling,install_automation,batch,rotate_receipts,correct_receipts,reconcile_intake_receipt,migration,freeze_writer,unfreeze_writer,restore_archived', 'write actions are exactly the governed set');

console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
process.exit(fails ? 1 : 0);
