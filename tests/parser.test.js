// Run: node tests/parser.test.js [path-to-real-export]   (real export is never committed)
const fs = require('fs'); const path = require('path');
const P = require('../pipeline-parser.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const fx = P.parse(fs.readFileSync(path.join(__dirname, 'fixtures/master.sample.txt'), 'utf8'));
ok(fx.rows.length >= 15, 'fixture parses >=15 rows (' + fx.rows.length + ')');
ok(fx.rows.some(r => r.cellCount === 11 && !r.parseError), 'row with a pipe inside the payload keeps 9 fixed cells + payload');
ok(fx.sectionMismatches.length >= 3, 'section/BUCKET mismatches detected (' + fx.sectionMismatches.length + ')');
ok(fx.parseErrors.length === 1 && fx.parseErrors[0].PRIMARY_ID === 'V2X-MALFORMED', 'malformed row kept and flagged, not dropped');
ok(fx.rows.some(r => r.payload.MYSTERY_KEY === 'some value'), 'unknown payload key preserved');
ok(fx.rows.every(r => r.payload.DATE_ADDED !== undefined || r.parseError), 'DATE_ADDED present on every well-formed row');
ok(fx.rows.some(r => /PRE-EXISTING/.test(r.payload.DATE_ADDED || '')), 'PRE-EXISTING DATE_ADDED case present');
ok(fx.checksum.ok, 'fixture COUNTS line reconciles with row BUCKET tally: ' + JSON.stringify(fx.checksum.diffs));
ok(fx.payloadKeys.indexOf('DATE_ADDED') >= 0 && fx.payloadKeys.indexOf('NOTIFICATION_SOURCE') >= 0, 'payload keys discovered');
const eleven = fx.rows.find(r => r.cellCount === 11 && !r.parseError);
ok(eleven && Object.keys(eleven.payload).length > 3, 'pipe-in-payload row still yields parsed KEY=value pairs');
ok(P.parseMoney('$150K-$215K').mid === 182500, 'parseMoney K range');
ok(P.parseMoney('$231K–$281K').low === 231000, 'parseMoney en-dash range');
ok(P.parseMoney('$203165-$284430').high === 284430, 'parseMoney plain numbers');
ok(P.parseMoney('UNKNOWN') === null, 'parseMoney unknown -> null');
const real = process.argv[2];
if (real && fs.existsSync(real)) {
  const m = P.parse(fs.readFileSync(real, 'utf8'));
  const raw = fs.readFileSync(real, 'utf8').replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const rawRows = raw.filter(l => /^\d+ \| /.test(l));
  ok(m.rows.length === rawRows.length, 'real export: parser row count equals raw row-line count (' + m.rows.length + ')');
  ok(m.counts && m.rows.length === m.counts.TOTAL, 'real export: row count equals the declared COUNTS TOTAL (' + (m.counts && m.counts.TOTAL) + ')');
  ok(m.checksum.ok, 'real export: per-bucket and END checksum ok ' + JSON.stringify(m.checksum.diffs));
  ok(m.parseErrors.length === 0, 'real export: zero parse errors');
  const rawEleven = rawRows.filter(l => l.split(' | ').length === 11).length;
  ok(m.rows.filter(r => r.cellCount === 11).length === rawEleven, 'real export: every eleven-cell row handled (' + rawEleven + ')');
  ok(m.sectionMismatches.length === m.rows.filter(r => r.section && r.BUCKET !== r.section).length, 'real export: section/BUCKET mismatch count computed (' + m.sectionMismatches.length + ')');
  if (m.endCount !== null) ok(m.endCount === m.rows.length, 'real export: END marker count equals rows (' + m.endCount + ')');
  const withDate = m.rows.filter(r => r.payload.DATE_ADDED).length;
  console.log('info  real export: rows with DATE_ADDED ' + withDate + '/' + m.rows.length + '; buckets ' + JSON.stringify(m.byBucket));
}
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASS'); process.exit(fails ? 1 : 0);
