const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../apps-script/PipelineAts.gs');

const NOW = '2026-10-13T21:45:00.000Z';
const row = (title, loc = '') => ({ PRIMARY_ID: 'V2I-1', TITLE: title, LOCATION: loc, BUCKET: 'SCOUT_INTAKE', p: {} });
// Text shapes captured from TinyFish fetch_content on 2026-10-13 (Blue Origin R67034, Entegris REQ-13635, Workday not-found page).
const LIVE = '## Director- Manufacturing Quality Assurance\n\nApply\n\nlocations\n:   Huntsville, AL\n\ntime type\n:   Full time\n\nposted on\n:   Posted 28 Days Ago\n\njob requisition id\n:   R67034\n\n**Qualifications:**\n\n* Minimum of a B.A degree required.\n* 10+ years experience\n\n### Similar Jobs (5)\n\n#### Director Supplier Quality\n\nposted on\n:   Posted 30+ Days Ago\n';
const PAY = '## Senior Director, MN Operations\n\nposted on\n:   Posted 8 Days Ago\n\njob requisition id\n:   REQ-13635\n\n* Bachelor\u2019s degree in Engineering (Chemical or Mechanical), with an advanced degree in Business or Management preferred.\n\n**Compensation:** The pay range for this role is $220,000-$280,000 with pay commensurate upon the candidate\'s experience.';
const GONE = 'Skip to main content\nSign In\nSearch for Jobs\nThe page you are looking for doesn\'t exist.\nSearch for Jobs\nFollow Us\n\u00a9 2026 Workday, Inc. All rights reserved.';

test('public Workday URL and requisition token come from the stored URL only', () => {
  const t = A.detectUrl('https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/job/Director--Quality-Assurance');
  const p = A.wdParts(t);
  assert.equal(p.url, 'https://blueorigin.wd5.myworkdayjobs.com/BlueOrigin/job/Director--Quality-Assurance');
  assert.equal(A.hasReqToken(p.url), false);
  for (const u of ['https://x.wd1.myworkdayjobs.com/S/job/A/B_R67034', 'https://x.wd1.myworkdayjobs.com/S/job/B_R69348-2', 'https://x.wd1.myworkdayjobs.com/S/job/B_REQ-13635?q=ops', 'https://x.wd1.myworkdayjobs.com/S/job/B_JR12345'])
    assert.equal(A.hasReqToken(u), true, u);
  assert.equal(A.wdSearchUrl(p, 'Director - Quality Assurance'), 'https://blueorigin.wd5.myworkdayjobs.com/BlueOrigin?q=quality%20assurance');
});

test('live Workday page: title, posting age, degree; Similar Jobs section ignored', () => {
  const r = A.tfJob({ text: LIVE }, null, 'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/job/Huntsville-AL/Director--Manufacturing-Quality-Assurance_R67034', row('Director, Manufacturing Quality Assurance'), { now: NOW });
  assert.equal(r.result, 'LIVE'); assert.equal(r.liveness, 'LIVE_EMPLOYER_ATS'); assert.equal(r.via, 'TINYFISH');
  assert.equal(r.postedAt, '2026-09-15'); assert.equal(r.postedNote, undefined);
  assert.equal(r.degree, 'Minimum of a B.A degree required.');
  const pay = A.tfJob({ text: PAY }, null, 'https://entegris.wd1.myworkdayjobs.com/en-US/EntegrisCareers/job/Chaska-MN/Senior-Director--MN-Operations_REQ-13635', row('Senior Director, MN Operations'), { now: NOW });
  assert.deepEqual(pay.pay, { low: 220000, high: 280000 });
  const f = A.fieldsFor(row('x'), { provider: 'WORKDAY', api: 'u', url: 'u' }, pay, { now: NOW });
  assert.equal(f.PAY_POSTED, '$220,000 - $280,000'); assert.equal(f.LIVENESS, 'LIVE_EMPLOYER_ATS');
});

test('"30+ Days Ago" keeps a note and no invented date', () => {
  const r = A.tfJob({ text: LIVE.replace('Posted 28 Days Ago', 'Posted 30+ Days Ago') }, null, 'https://x/S/job/T_R1234', row('Director Manufacturing Quality Assurance'), { now: NOW });
  assert.equal(r.postedAt, undefined); assert.equal(r.postedNote, 'Posted 30+ days before 2026-10-13');
});

test('not-found page closes only a URL that carries the requisition token', () => {
  assert.equal(A.tfJob({ text: GONE }, null, 'https://x.wd1.myworkdayjobs.com/S/job/T_R12345', row('T'), { now: NOW }).liveness, 'CLOSED_EMPLOYER_404');
  assert.equal(A.tfJob({ text: GONE }, null, 'https://x.wd1.myworkdayjobs.com/S/job/T', row('T'), { now: NOW }).result, 'NOT_FOUND_NO_REQ_TOKEN');
  assert.equal(A.tfJob(null, { error: 'page_not_found', status: 404 }, 'https://x/S/job/T_R12345', row('T')).result, 'CLOSED');
  assert.equal(A.tfJob(null, { error: 'bot_blocked' }, 'https://x/S/job/T_R12345', row('T')).result, 'TF_BOT_BLOCKED');
  assert.equal(A.tfJob(null, { error: 'target_http_error', status: 403 }, 'https://x/S/job/T_R12345', row('T')).result, 'TF_TARGET_HTTP_ERROR_403');
  assert.equal(A.tfJob({ text: 'Careers' }, null, 'https://x/S/job/T_R12345', row('T')).result, 'UNREADABLE');
  assert.equal(A.tfJob({ text: LIVE }, null, 'https://x/S/job/T_R67034', row('Senior Software Engineer')).result, 'TITLE_MISMATCH');
});

test('search pick: title match, location tie-break, never guesses between sites', () => {
  const parts = { host: 'blueorigin.wd5.myworkdayjobs.com', site: 'BlueOrigin' };
  const L = [
    'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/job/Huntsville-AL/Director--Manufacturing-Quality-Assurance_R67034?q=director',
    'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/job/Greater-Seattle-Area/Director--Manufacturing-Quality-Assurance_R66071?q=director',
    'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/job/Space-Coast-FL/Director--Manufacturing-Quality-Assurance_R66072?q=director',
    'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/job/Greater-Seattle-Area/Director-of-Talent-Acquisition--Corporate-Teams_R68037?q=director',
    'https://blueorigingov.sharepoint.com/:w:/s/AnonShare/x'];
  assert.equal(A.tfPick(L, parts, row('Director, Manufacturing Quality Assurance', 'Huntsville, AL')), 'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/job/Huntsville-AL/Director--Manufacturing-Quality-Assurance_R67034');
  assert.equal(A.tfPick(L, parts, row('Director, Manufacturing Quality Assurance', '')), 'AMBIGUOUS');
  assert.equal(A.tfPick(L, parts, row('Director of Talent Acquisition, Corporate Teams')), 'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/job/Greater-Seattle-Area/Director-of-Talent-Acquisition--Corporate-Teams_R68037');
  assert.equal(A.tfPick(L, parts, row('VP Propulsion Production')), '');
});

test('ATS_POSTING_URL is read first, so a resolved full Workday link is reused', () => {
  const d = A.detect({ SOURCE_URL: 'https://blueorigin.wd5.myworkdayjobs.com/BlueOrigin/job/Director--Quality-Assurance', ATS_POSTING_URL: 'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/job/Huntsville-AL/Director--Manufacturing-Quality-Assurance_R67034' });
  assert.equal(d.fromKey, 'ATS_POSTING_URL'); assert.equal(A.hasReqToken(A.wdParts(d).url), true);
});

test('request body never carries the key', () => {
  const b = A.tfBody(['https://a', 'https://b'], { links: true });
  assert.deepEqual(Object.keys(b).sort(), ['format', 'links', 'per_url_timeout_ms', 'purpose', 'ttl', 'urls']);
  assert.equal(b.links, true); assert.equal(b.ttl, 0);
});

test('bold field layout (**posted on**:) is read the same way', () => {
  const bold = '## Director- Manufacturing Quality Assurance\n\nApply\n\n**locations**:   Huntsville, AL\n\n**posted on**:   Posted 28 Days Ago\n\n**job requisition id**:   R67034\n\n* Minimum of a B.A degree required.';
  const r = A.tfJob({ text: bold }, null, 'https://blueorigin.wd5.myworkdayjobs.com/BlueOrigin/job/Director--Manufacturing-Quality-Assurance_R67034', row('Director, Manufacturing Quality Assurance'), { now: NOW });
  assert.equal(r.result, 'LIVE'); assert.equal(r.postedAt, '2026-09-15');
});
