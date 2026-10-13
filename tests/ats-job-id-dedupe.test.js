const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../apps-script/Code.gs');

// Live case 2026-10-13: Grok web intake re-inserted three Anduril VP Production roles that already sat in the
// archive as DECLINED_BY_TIM rows keyed GH-<greenhouse job id>, because intake carried Anduril's internal req number.
const archived = [
  '404 | V2S-ANDURIL-VPPROD-MS-5199174007 | Anduril Industries | VP Production, Mission Systems | DECLINED_BY_TIM | RESOLVED/DECLINED_BY_TIM | - | GH-5199174007 | Costa Mesa, CA | NO_REWORK (coverage/watch)',
  '448 | V2L-ANDURIL-VPCONNECTEDWARFARE-5173257007 | Anduril Industries | VP, Connected Warfare | DECLINED_BY_TIM | RESOLVED/DECLINED_BY_TIM | - | GH-5173257007 | Costa Mesa, CA | NO_REWORK',
  '500 | V2I-AAAAAAAAAAAA | Blue Origin | Director of Manufacturing Engineering | SCOUT_INTAKE | OPEN | - | - | Huntsville, AL | SOURCE_URL=https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/job/Huntsville-AL/Director-of-Manufacturing-Engineering_R53294',
];
const idx = C.indexExisting(archived);

test('greenhouse job id in the posting URL matches a GH- requisition despite a different internal req', () => {
  const v = C.matchExisting({ COMPANY: 'Anduril Industries', TITLE: 'VP Production, Mission Systems', LOCATION: 'Costa Mesa, California, United States', REQ_ID: '12461', SOURCE_URL: 'https://boards.greenhouse.io/andurilindustries/jobs/5199174007' }, idx);
  assert.equal(v.kind, 'exact'); assert.equal(v.by, 'ATS_JOB_ID'); assert.equal(v.rows[0].id, 'V2S-ANDURIL-VPPROD-MS-5199174007');
});

test('title drift still matches on the job id', () => {
  const v = C.matchExisting({ COMPANY: 'Anduril Industries', TITLE: 'VP Production, Connected Warfare', LOCATION: 'Costa Mesa, CA', REQ_ID: '11414', SOURCE_URL: 'https://job-boards.greenhouse.io/andurilindustries/jobs/5173257007' }, idx);
  assert.equal(v.kind, 'exact'); assert.equal(v.rows[0].id, 'V2L-ANDURIL-VPCONNECTEDWARFARE-5173257007');
});

test('workday R-number in an existing row URL matches an intake REQ_ID', () => {
  const v = C.matchExisting({ COMPANY: 'Blue Origin', TITLE: 'Director, Manufacturing Engineering', LOCATION: 'Huntsville, Alabama', REQ_ID: 'R53294', SOURCE_URL: '' }, idx);
  assert.equal(v.kind, 'exact'); assert.equal(v.rows[0].id, 'V2I-AAAAAAAAAAAA');
});

test('same job id at another employer never merges', () => {
  const v = C.matchExisting({ COMPANY: 'Shield AI', TITLE: 'VP Production', LOCATION: 'San Diego, CA', REQ_ID: '', SOURCE_URL: 'https://boards.greenhouse.io/shieldai/jobs/5199174007' }, idx);
  assert.equal(v.kind, 'none');
});

test('state names normalize to postal codes', () => {
  assert.equal(C.normLocation('Costa Mesa, California, United States'), C.normLocation('Costa Mesa, CA'));
  assert.equal(C.normLocation('Albany, New York'), 'albany ny');
  assert.equal(C.normLocation('Remote'), 'remote');
});
