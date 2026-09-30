// Unit tests for the pure functions in apps-script/Code.gs. Run: node tests/writer.test.js
const fs = require('fs'), path = require('path');
const W = require('../apps-script/Code.gs');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const P = require('../pipeline-parser.js');
const fx = fs.readFileSync(path.join(__dirname, 'fixtures/master.sample.txt'), 'utf8');
const lines = fx.split('\n');
const ready = lines.find(l => /^\d+ \| / .test(l) && l.split(' | ')[4] === 'READY_TO_PURSUE');
const eleven = lines.find(l => /^\d+ \| /.test(l) && l.split(' | ').length === 11);
const applied = lines.find(l => /^\d+ \| /.test(l) && l.split(' | ')[4] === 'APPLIED');

// decline
let r = W.mutateRow(ready, { kind: 'DECLINE', code: 'TIM_EXPLICIT_DECLINE', note: 'Too far; commute', ts: '2026-09-30T01:00:00.000Z', requestId: 'PX-1' });
ok(r.ok, 'decline succeeds');
let row = P.parseRow(r.after, 1, null);
ok(row.BUCKET === 'DECLINED_BY_TIM' && row.DISPOSITION === 'RESOLVED/DECLINED_BY_TIM', 'decline sets BUCKET and DISPOSITION');
ok(row.payload.DECLINE_REASON_CODE === 'TIM_EXPLICIT_DECLINE' && /commute/.test(row.payload.DECLINE_REASON_TEXT), 'decline reason code and text written');
ok(row.payload.REOPEN_TRIGGER === 'Tim explicitly overrides.' && /^TIM_PASS_2026-09-30_EXPLORER$/.test(row.payload.TIM_DISPOSITION), 'reopen trigger and TIM_DISPOSITION written');
ok(row.payload.STATE_SOURCE === 'TIM_EXPLORER:PX-1' && row.payload.STATE_UPDATED_AT === '2026-09-30T01:00:00.000Z', 'provenance written');
ok(row.PRIMARY_ID === ready.split(' | ')[1] && row.COMPANY === ready.split(' | ')[2], 'canonical ID and company preserved');
const beforeP = P.parseRow(ready, 1, null);
ok(Object.keys(beforeP.payload).every(k => row.payload[k] !== undefined), 'all pre-existing payload keys preserved');
ok(/TIM_DECLINE_2026-09-30/.test(row.TAGS), 'tag appended');
ok(r.after.split(' | ').length >= 10 && !/[\r\n]/.test(r.after), 'result is a single line with >=10 cells');

// pursue override on a declined row
let r2 = W.mutateRow(r.after, { kind: 'APPLY_NOW', value: 'YES', ts: '2026-10-01T00:00:00.000Z', requestId: 'PX-2' });
let row2 = P.parseRow(r2.after, 1, null);
ok(r2.ok && row2.BUCKET === 'READY_TO_PURSUE' && row2.payload.TIM_RULING === 'PURSUE', 'pursue override flips back to READY_TO_PURSUE');
ok(row2.payload.DECLINE_REASON_CODE === undefined && row2.payload.DECLINE_REASON_CODE_PRIOR === 'TIM_EXPLICIT_DECLINE', 'prior decline code moved aside, not lost');

// note only
let r3 = W.mutateRow(ready, { kind: 'NOTE', note: 'Call recruiter Friday; ask about relocation', ts: '2026-09-30T02:00:00.000Z', requestId: 'PX-3' });
let row3 = P.parseRow(r3.after, 1, null);
ok(r3.ok && row3.BUCKET === 'READY_TO_PURSUE' && /Call recruiter Friday, ask about relocation \[Tim 2026-09-30\]/.test(row3.payload.TIM_NOTE), 'note-only keeps bucket; semicolons in note neutralized');

// applied
let r4 = W.mutateRow(ready, { kind: 'APPLIED', ts: '2026-09-30T03:00:00.000Z', requestId: 'PX-4' });
let row4 = P.parseRow(r4.after, 1, null);
ok(r4.ok && row4.BUCKET === 'APPLIED' && row4.payload.APP_DATE === '2026-09-30' && row4.payload.ANTI_RESURRECTION === 'YES', 'applied sets bucket, APP_DATE, ANTI_RESURRECTION');

// protected state
let r5 = W.mutateRow(applied, { kind: 'DECLINE', ts: '2026-09-30T04:00:00.000Z' });
ok(!r5.ok && /protected/.test(r5.error), 'cannot decline an APPLIED row (fail closed)');

// pipe inside payload survives
let r6 = W.mutateRow(eleven, { kind: 'NOTE', note: 'x', ts: '2026-09-30T05:00:00.000Z' });
ok(r6.ok && r6.after.split(' | ').length === 11 && P.parseRow(r6.after, 1, null).payload.SALARY_ANCHORS === P.parseRow(eleven, 1, null).payload.SALARY_ANCHORS, 'pipe-in-payload row: anchors preserved byte for byte');

// counts
const mutated = lines.map(l => l === ready ? r.after : l);
const c = W.recomputeCountsLine(mutated);
const parsedC = P.parse(mutated.map(l => /^COUNTS:/.test(l) ? c : l).join('\n'));
ok(parsedC.checksum.ok, 'recomputed COUNTS reconciles with row tally: ' + c);
ok(/^COUNTS: TOTAL=\d+ READY_TO_PURSUE=\d+ DECLINED_BY_TIM=/.test(c) && /UNACCOUNTED=1$/.test(c), 'COUNTS keeps key order and UNACCOUNTED=0');

// real export, if present
const real = process.argv[2];
if (real && fs.existsSync(real)) {
  const rl = fs.readFileSync(real, 'utf8').replace(/^﻿/, '').split('\n');
  const c2 = W.recomputeCountsLine(rl);
  const orig = rl.find(l => /^COUNTS:/.test(l)).replace(/\r$/, '');
  ok(c2 === orig, 'real export: recomputed COUNTS equals the existing line exactly\n      ' + c2 + '\n      ' + orig);
  let n = 0, bad = 0;
  rl.filter(l => /^\d+ \| /.test(l)).forEach(l => { const m = W.mutateRow(l, { kind: 'NOTE', note: 'probe', ts: '2026-09-30T00:00:00.000Z' }); n++; const a = P.parseRow(l, 1, null), b = P.parseRow(m.after, 1, null); if (!m.ok || a.PRIMARY_ID !== b.PRIMARY_ID || a.BUCKET !== b.BUCKET || Object.keys(a.payload).some(k => b.payload[k] !== a.payload[k])) bad++; });
  ok(bad === 0, 'real export: note-mutation preserves every existing field on all rows (' + n + ' rows, ' + bad + ' bad)');
}
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASS'); process.exit(fails ? 1 : 0);
