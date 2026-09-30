const Q = require('../pipeline-quality.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const now = Date.UTC(2026, 9, 5, 12);
const row = (run, bucket, disc, upd) => ({ BUCKET: bucket, payload: { SCOUT_RUN_ID: run, DISCOVERED_AT_ET: disc, STATE_UPDATED_AT: upd } });
const rows = [
  row('R1', 'READY_TO_PURSUE', '2026-10-01 08:00 ET', '2026-10-02T08:00:00Z'), row('R1', 'APPLIED', '2026-10-01 08:00 ET', '2026-10-03T08:00:00Z'), row('R1', 'DECLINED_BY_TIM', '2026-10-01 08:00 ET', '2026-10-01T20:00:00Z'),
  row('R1', 'DUPLICATE', '2026-10-01 08:00 ET', '2026-10-01T09:00:00Z'), row('R1', 'INVALID_DISCOVERY', '2026-10-01 08:00 ET', '2026-10-01T10:00:00Z'), row('R1', 'CLOSED_DEAD', '2026-10-01 08:00 ET', '2026-10-02T08:00:00Z'),
  row('R2', 'SCOUT_INTAKE', '2026-10-05 06:00 ET', ''), row('R2', 'DISCOVERY_LEAD', '2026-10-05 06:00 ET', ''), row('R2', 'READY_TO_PURSUE', '2026-10-05 06:00 ET', '2026-10-05T10:00:00Z'),
  { BUCKET: 'APPLIED', payload: {} }
];
const runs = [
  { SCOUT_RUN_ID: 'R1', RECEIVED_AT: '2026-10-01T12:00:00Z', COUNTERS: { GROSS_FOUND: 10, NEVER_CONSIDER_EXCLUDED: 2, 'NC-001_COUNT': 1, 'NC-002_COUNT': 0, 'NC-003_COUNT': 1, 'NC-004_COUNT': 0, ENTERED_MASTER: 6, SCOUT_INTAKE_WRITTEN: 5, DISCOVERY_LEAD_WRITTEN: 1, EXISTING_MATCH: 2, WRITE_FAILED: 0 }, EXCLUSIONS: [{ NEVER_CONSIDER_RULE_ID: 'NC-001' }, { NEVER_CONSIDER_RULE_ID: 'NC-003' }] },
  { SCOUT_RUN_ID: 'R2', RECEIVED_AT: '2026-10-05T10:05:00Z', GROSS_FOUND: 4, NEVER_CONSIDER_EXCLUDED: [] }   // older record shape still accepted
];
const cs = Q.cohorts(rows, runs, { now });
const r1 = cs.find(c => c.SCOUT_RUN_ID === 'R1'), r2 = cs.find(c => c.SCOUT_RUN_ID === 'R2');
ok(cs.length === 2 && !cs.find(c => c.SCOUT_RUN_ID === 'UNSPECIFIED'), 'rows without SCOUT_RUN_ID are not a cohort');
ok(r1.GROSS_FOUND === 10 && r1.NEVER_CONSIDER_EXCLUDED === 2 && r1.ENTERED_MASTER === 6, 'R1 gross, excluded, entered');
ok(r1.byRule['NC-001'] === 1 && r1.byRule['NC-003'] === 1 && r1.byRule['NC-002'] === 0 && r1.SCOUT_INTAKE_WRITTEN === 5 && r1.DISCOVERY_LEAD_WRITTEN === 1 && r1.EXISTING_MATCH === 2 && r1.WRITE_FAILED === 0, 'R1 per-rule counts and outcome counters carried from the run record');
ok(r1.VALID_DISTINCT === 4 && r1.DUPLICATE === 1 && r1.INVALID_DISCOVERY === 1 && r1.DEAD_OR_STALE === 1 && r1.READY === 1 && r1.APPLIED === 1 && r1.DECLINED === 1, 'R1 bucket breakdown; declined counts as valid');
ok(r1.ADMISSION_RATE === 0.6 && r1.VALIDITY_RATE === 4 / 6 && r1.ACTIONABLE_YIELD === 2 / 6 && r1.DUPLICATE_RATE === 1 / 6 && r1.INVALID_RATE === 1 / 6 && r1.UNRESOLVED_RATE === 0, 'R1 rates');
ok(Math.abs(r1.MEDIAN_TIME_TO_FINAL_DISPOSITION_H - 18) < 1e-9, 'R1 median time to final disposition = 18h (median of 24,48,12,1,2,24)');
ok(r1.maturity === 'FINALIZED' && r1.scored, 'R1 is finalized (old enough, nothing unresolved)');
ok(r2.STILL_UNRESOLVED === 2 && r2.UNRESOLVED_RATE === 2 / 3 && r2.maturity === 'IMMATURE' && !r2.scored, 'R2 is immature (fresh run) and not scored');
ok(r2.ADMISSION_RATE === 0.75, 'R2 admission rate');
const w7 = Q.window(cs, 7, now), w1 = Q.window(cs, 1, now);
ok(w7.cohorts === 2 && w7.finalized === 1 && w7.ENTERED_MASTER === 9 && w7.GROSS_FOUND === 14 && Math.abs(w7.ADMISSION_RATE - 9 / 14) < 1e-9 && w7.byRule['NC-001'] === 1 && w7.SCOUT_INTAKE_WRITTEN === 5, '7-day window aggregates both cohorts (sums, per-rule counts) and recomputes rates from sums');
ok(w1.cohorts === 1 && w1.ENTERED_MASTER === 3, 'today window holds only the fresh cohort');
ok(Q.median([]) === null && Q.median([3]) === 3 && Q.median([1, 2, 3, 4]) === 2.5, 'median helper');
ok(Q.cohorts([], [], { now }).length === 0 && Q.window([], 30, now).ADMISSION_RATE === null, 'empty inputs yield no cohorts and null rates (no division by zero)');
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASS'); process.exit(fails ? 1 : 0);
