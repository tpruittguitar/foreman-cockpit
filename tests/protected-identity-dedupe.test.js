const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../apps-script/Code.gs');

// Live case 2026-10-22: the ChatGPT email lane sent Anduril Fury with LinkedIn's job id as REQ_ID. The role sat in the
// archive as REJECTED_BY_EMPLOYER with ANTI_RESURRECTION=YES and a Greenhouse requisition, so the differing "requisition"
// made matchExisting skip it and the Writer re-admitted it as SCOUT_INTAKE (V2I-82B87E6CCC65).
const archive = [
  '901 | V2S-ANDURIL-FURY-5577 | Anduril Industries | Deputy Head of Production, Autonomous Airpower (Fury) | REJECTED_BY_EMPLOYER | RESOLVED/REJECTED_BY_EMPLOYER | - | GH-4962385007 / internal Req 5577 | Ashville, OH | SOURCE_URL=https://job-boards.greenhouse.io/andurilindustries/jobs/4962385007; ANTI_RESURRECTION=YES',
  '902 | V2I-674D32C11C4C | Blue Origin | Lunar Manufacturing & Assembly Manager | REJECTED_BY_EMPLOYER | RESOLVED/REJECTED_BY_EMPLOYER | - | R67525 | Space Coast, FL | ANTI_RESURRECTION=YES',
  '903 | V2F-D4D7153DDFF4 | Rich Products Corporation | Senior Manager, Equipment Engineering | DECLINED_BY_TIM | RESOLVED/DECLINED_BY_TIM | - | LI-4470573483 | Buffalo, NY | SOURCE_URL=https://www.linkedin.com/jobs/view/4470573483',
  '904 | V2I-CCCCCCCCCCCC | Acme Robotics | Director of Manufacturing | CLOSED_DEAD | RESOLVED/CLOSED_DEAD | - | R11111 | Austin, TX | SOURCE_URL=https://acme.wd1.myworkdayjobs.com/x/job/Austin-TX/Director_R11111',
  '905 | V2I-DDDDDDDDDDDD | Zeta Motors | Plant Manager | SCOUT_INTAKE | INTAKE/AWAITING_ANALYSIS | - | R22222 | Dayton, OH | SOURCE_URL=https://zeta.wd1.myworkdayjobs.com/x/job/Dayton-OH/Plant-Manager_R22222'
];
const idx = C.indexExisting(archive);
const fury = { COMPANY: 'Anduril Industries', TITLE: 'Deputy Head of Production, Autonomous Airpower (Fury)', LOCATION: 'Ashville, OH' };

test('a LinkedIn job id in REQ_ID no longer hides an archived anti-resurrection role (the Fury case)', () => {
  const v = C.matchExisting({ ...fury, REQ_ID: '4465067799', SOURCE_URL: 'https://www.linkedin.com/jobs/view/4465067799' }, idx);
  assert.equal(v.kind, 'exact'); assert.equal(v.rows[0].id, 'V2S-ANDURIL-FURY-5577'); assert.equal(v.by, 'EMPLOYER_TITLE_LOCATION');
});

test('an LI- prefixed requisition is a board id, not an employer requisition', () => {
  const v = C.matchExisting({ ...fury, REQ_ID: 'LI-4465067799', SOURCE_URL: 'https://example.com/alert' }, idx);
  assert.equal(v.kind, 'exact'); assert.equal(v.rows[0].id, 'V2S-ANDURIL-FURY-5577');
});

test('a LinkedIn id stored on the archived row does not make an employer requisition look like a different job', () => {
  const v = C.matchExisting({ COMPANY: 'Rich Products Corporation', TITLE: 'Senior Manager, Equipment Engineering', LOCATION: 'Buffalo, NY', REQ_ID: 'R55555', SOURCE_URL: 'https://richproducts.wd5.myworkdayjobs.com/x/job/Buffalo-NY/Sr-Manager_R55555' }, idx);
  assert.equal(v.kind, 'exact'); assert.equal(v.rows[0].id, 'V2F-D4D7153DDFF4');
});

test('a genuinely different employer requisition for a protected identity is held, never inserted', () => {
  const v = C.matchExisting({ COMPANY: 'Blue Origin', TITLE: 'Lunar Manufacturing & Assembly Manager', LOCATION: 'Space Coast, FL', REQ_ID: 'R69279', SOURCE_URL: 'https://blueorigin.wd5.myworkdayjobs.com/x/job/Space-Coast-FL/Lunar_R69279' }, idx);
  assert.equal(v.kind, 'conflict'); assert.equal(v.by, 'PROTECTED_IDENTITY_REQ_CONFLICT'); assert.deepEqual(v.rows.map(r => r.id), ['V2I-674D32C11C4C']);
});

test('unprotected identities keep today\'s behavior: a new employer requisition is a new job', () => {
  for (const rec of [
    { COMPANY: 'Acme Robotics', TITLE: 'Director of Manufacturing', LOCATION: 'Austin, TX', REQ_ID: 'R99999', SOURCE_URL: 'https://acme.wd1.myworkdayjobs.com/x/job/Austin-TX/Director_R99999' },
    { COMPANY: 'Zeta Motors', TITLE: 'Plant Manager', LOCATION: 'Dayton, OH', REQ_ID: 'R33333', SOURCE_URL: 'https://zeta.wd1.myworkdayjobs.com/x/job/Dayton-OH/Plant-Manager_R33333' }])
    assert.equal(C.matchExisting(rec, idx).kind, 'none', rec.COMPANY);
});

test('a protected title at a different location is not held', () => {
  const v = C.matchExisting({ ...fury, LOCATION: 'Costa Mesa, CA', REQ_ID: '5551212', SOURCE_URL: 'https://boards.greenhouse.io/andurilindustries/jobs/5551212' }, idx);
  assert.equal(v.kind, 'none');
});

const rules = C.parseCanonicalNeverConsiderRules('');
const ctx = extra => ({ run: { SCOUT_RUN_ID: 'TEST', GROSS_FOUND: 1 }, now: '2026-10-23T00:00:00.000Z', nowET: '2026-10-22 20:00 ET', ...extra });
const furyLinkedIn = { ...fury, REQ_ID: '4465067799', SOURCE_URL: 'https://www.linkedin.com/jobs/view/4465067799' };
const blueRepost = { COMPANY: 'Blue Origin', TITLE: 'Lunar Manufacturing & Assembly Manager', LOCATION: 'Space Coast, FL', REQ_ID: 'R69279', SOURCE_URL: 'https://blueorigin.wd5.myworkdayjobs.com/x/job/Space-Coast-FL/Lunar_R69279' };

test('Tim 2026-10-22: a protected role listed again through a different listing is held for review, never inserted, never a silent no-op', () => {
  const plan = C.planIntake(archive, [furyLinkedIn, blueRepost], rules, { ...ctx(), run: { SCOUT_RUN_ID: 'TEST', GROSS_FOUND: 2 } });
  assert.equal(plan.results[0].result, 'WRITE_FAILED'); assert.equal(plan.results[0].outcome, 'IDENTITY_CONFLICT');
  assert.match(plan.results[0].detail, /PROTECTED_IDENTITY_RELISTED/); assert.deepEqual(plan.results[0].candidateIds, ['V2S-ANDURIL-FURY-5577']);
  assert.equal(plan.results[0].holdPlan.holdKind, 'RELISTED_PROTECTED'); assert.equal(plan.results[0].holdPlan.origin, 'INTAKE');
  assert.deepEqual(plan.results[0].holdPlan.candidates, [{ primaryId: 'V2S-ANDURIL-FURY-5577', bucket: 'REJECTED_BY_EMPLOYER', archived: true }]);
  assert.equal(plan.results[1].result, 'WRITE_FAILED'); assert.match(plan.results[1].detail, /PROTECTED_IDENTITY_REQ_CONFLICT/);
  assert.equal(plan.results[1].holdPlan.holdKind, 'RELISTED_PROTECTED');
  assert.equal(plan.newLines.length, 0);
});

test('the same listing (same requisition) is still a plain no-op: nothing new to review', () => {
  const plan = C.planIntake(archive, [{ ...fury, REQ_ID: 'GH-4962385007 / internal Req 5577', SOURCE_URL: 'https://job-boards.greenhouse.io/andurilindustries/jobs/4962385007' }], rules, ctx());
  assert.equal(plan.results[0].result, 'EXISTING_MATCH'); assert.equal(plan.results[0].PRIMARY_ID, 'V2S-ANDURIL-FURY-5577'); assert.equal(plan.results[0].holdPlan, undefined);
});

test('a record with no listing evidence (no URL, no requisition) is not held', () => {
  assert.equal(C.matchExisting(fury, idx, { holdRelistedProtected: true }).kind, 'exact');
});

test('an unprotected row reached through a new listing keeps today\'s EXISTING_MATCH', () => {
  const plan = C.planIntake(archive, [{ COMPANY: 'Zeta Motors', TITLE: 'Plant Manager', LOCATION: 'Dayton, OH', SOURCE_URL: 'https://www.linkedin.com/jobs/view/4999999999' }], rules, ctx());
  assert.equal(plan.results[0].result, 'EXISTING_MATCH'); assert.equal(plan.results[0].PRIMARY_ID, 'V2I-DDDDDDDDDDDD');
});

test('email upserts keep matching protected rows across listings (an APPLIED/REJECTED email must still attach)', () => {
  assert.equal(C.matchExisting(furyLinkedIn, idx).kind, 'exact');
  assert.equal(C.matchExisting(furyLinkedIn, idx, { holdRelistedProtected: true }).by, 'PROTECTED_IDENTITY_RELISTED');
});

test('Different role (Tim\'s approval) admits the relisting as its own row marked RELISTING_OF; only for the held candidates', () => {
  const approved = C.planIntake(archive, [furyLinkedIn], rules, ctx({ relistingApproved: { holdId: 'HOLD-UK-1', candidateIds: ['V2S-ANDURIL-FURY-5577'] } }));
  assert.equal(approved.results[0].result, 'SCOUT_INTAKE_WRITTEN'); assert.equal(approved.newLines.length, 1);
  assert.match(approved.newLines[0], /RELISTING_OF=V2S-ANDURIL-FURY-5577/); assert.match(approved.newLines[0], /RELISTING_APPROVED_BY=TIM:HOLD-UK-1/);
  const other = C.planIntake(archive, [furyLinkedIn], rules, ctx({ relistingApproved: { holdId: 'HOLD-UK-2', candidateIds: ['V2I-SOMETHING-ELSE'] } }));
  assert.equal(other.results[0].result, 'WRITE_FAILED'); assert.equal(other.newLines.length, 0);
});

test('an intake record cannot approve its own relisting', () => {
  const plan = C.planIntake(archive, [{ ...furyLinkedIn, relistingApproved: { candidateIds: ['V2S-ANDURIL-FURY-5577'] }, RELISTING_APPROVED_BY: 'TIM:x', CREATE_NEW: true }], rules, ctx());
  assert.equal(plan.results[0].result, 'WRITE_FAILED'); assert.equal(plan.newLines.length, 0);
});

test('relisting holds carry their origin, location and new listing for Needs Tim; email holds stay EMAIL', () => {
  const plan = C.planIntake(archive, [furyLinkedIn], rules, ctx());
  const h = C.heldRecord_(furyLinkedIn, plan.results[0].holdPlan, '2026-10-23T00:00:00.000Z');
  assert.equal(h.origin, 'INTAKE'); assert.equal(h.kind, 'RELISTED_PROTECTED'); assert.equal(h.location, 'Ashville, OH');
  assert.equal(h.sourceUrl, 'https://www.linkedin.com/jobs/view/4465067799'); assert.equal(h.candidates[0].primaryId, 'V2S-ANDURIL-FURY-5577');
  assert.equal(C.heldRecord_({ COMPANY: 'X', TITLE: 'Y', STATE: 'APPLIED' }, { holdKind: 'AMBIGUOUS' }, 'now').origin, 'EMAIL');
});

test('Needs Tim shows a relisting hold as "Listed again" with the keep / reconsider choice', () => {
  const NT = require('../pipeline-needs-tim.js');
  const items = NT.liveItems({ now: Date.parse('2026-10-23T00:00:00Z'), held: { holds: [{ id: 'HOLD-UK-1', origin: 'INTAKE', kind: 'RELISTED_PROTECTED', company: 'Anduril Industries', title: 'Deputy Head of Production, Autonomous Airpower (Fury)', sourceUrl: 'https://www.linkedin.com/jobs/view/4465067799', candidates: [{ primaryId: 'V2S-ANDURIL-FURY-5577', archived: true }], at: '2026-10-23T00:00:00Z' }] } });
  const it = items.find(i => i.id === 'live:held-email:HOLD-UK-1');
  assert.match(it.title, /^Listed again: Anduril Industries/);
  assert.match(it.detail, /listed again/); assert.match(it.detail, /Same role keeps your earlier decision; Different role adds it as a new opportunity/);
  assert.match(it.detail, /linkedin\.com\/jobs\/view\/4465067799/); assert.deepEqual(it.held.candidates.map(c => c.primaryId), ['V2S-ANDURIL-FURY-5577']);
});

test('upsert_application holds on an identity conflict instead of minting a second row; CREATE_NEW is Tim\'s override', () => {
  const ev = { COMPANY: 'Blue Origin', TITLE: 'Lunar Manufacturing & Assembly Manager', LOCATION: 'Space Coast, FL', REQ_ID: 'R69279', STATE: 'APPLIED', EVENT_DATE: '2026-10-22', EVIDENCE: 'Gmail test', SOURCE_URL: 'https://blueorigin.wd5.myworkdayjobs.com/x/job/Space-Coast-FL/Lunar_R69279' };
  const held = C.planUpsertApplication(archive, ev, { now: '2026-10-23T00:00:00.000Z' });
  assert.equal(held.ok, false); assert.equal(held.mode, 'HOLD'); assert.equal(held.holdKind, 'IDENTITY_CONFLICT');
  const created = C.planUpsertApplication(archive, { ...ev, CREATE_NEW: true }, { now: '2026-10-23T00:00:00.000Z' });
  assert.notEqual(created.holdKind, 'IDENTITY_CONFLICT');
});

test('board-id and protection helpers', () => {
  assert.deepEqual(C.boardJobIds(['linkedin.com/jobs/view/4465067799', 'indeed.com/jk/abc123', 'glassdoor.com/job/1010282598032', 'job-boards.greenhouse.io/x/jobs/1']), ['4465067799', 'ABC123', '1010282598032']);
  assert.deepEqual(C.employerReqCores(['LI4465067799', 'GH4962385007', 'R69279'], []), ['4962385007', '69279']);
  assert.deepEqual(C.employerReqCores(['4465067799'], ['4465067799']), []);
  assert.equal(C.protectedIdentity_('DECLINED_BY_TIM', {}), true);
  assert.equal(C.protectedIdentity_('CLOSED_DEAD', {}), false);
  assert.equal(C.protectedIdentity_('CLOSED_DEAD', { ANTI_RESURRECTION: 'YES' }), true);
  assert.equal(C.protectedIdentity_('DUPLICATE', { DO_NOT_REWORK: 'no' }), false);
});
