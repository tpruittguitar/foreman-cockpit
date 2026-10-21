'use strict';
// REV-122 (Tim 2026-10-20 19:39-19:43 ET): Tim's Applied is true on its own; a later email upgrades the same row to
// email-confirmed; an email that only near-matches a Tim-applied role is held for Tim (Same role / Different role).
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const { world } = require('./helpers/writer-world');
const row = (n, id, co, title, bucket, loc) => n + ' | ' + id + ' | ' + co + ' | ' + title + ' | ' + bucket + ' | ANALYSIS_PENDING | - | REQ-' + n + ' | ' + loc + ' | SOURCE_URL=https://example.com/' + n;
const ROWS = [row(1, 'V2I-ACME00000001', 'Acme Robotics', 'Director of Quality', 'READY_TO_PURSUE', 'Austin, TX'), row(2, 'V2I-GLOBEX000002', 'Globex', 'Plant Manager', 'SCOUT_INTAKE', 'Dayton, OH')];
const settle = w => { w.advance(200000); w.exec(() => W.verifyPendingWrites_()); };
const timApplied = (w, pid) => { const r = w.post({ action: 'ruling', ruling: { primaryId: pid, kind: 'APPLIED', actor: 'TIM', requestId: 'PX-APPLIED-' + pid } }); settle(w); return r; };
const email = (extra) => Object.assign({ COMPANY: 'Acme Robotics', TITLE: 'Director of Quality', LOCATION: 'Austin, TX', STATE: 'APPLIED', EVENT_DATE: '2026-10-21', EVIDENCE: 'Gmail 18f2 from jobs@acme.example "Thanks for applying"', SOURCE_URL: 'https://acme.example/jobs/9' }, extra || {});
const rows = w => w.master().filter(l => /^\d+ \| /.test(l));

test("Tim's Applied stands without email and is marked TIM_RULING", t => {
  const w = world(t, { rows: ROWS });
  assert.equal(timApplied(w, 'V2I-ACME00000001').ok, true);
  const r = w.row('V2I-ACME00000001');
  assert.match(r, / \| APPLIED \| RESOLVED\/APPLIED_CONFIRMED \| /); assert.match(r, /APP_CONFIRMATION=TIM_RULING/); assert.match(r, /APP_STATUS_EVIDENCE=Tim direct statement/);
});

test('a later matching email upgrades the same row to EMAIL and keeps Tim\'s statement; no second row', t => {
  const w = world(t, { rows: ROWS }); timApplied(w, 'V2I-ACME00000001');
  const r = w.post({ action: 'upsert_application', event: email() });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.mode, 'UPDATE'); settle(w);
  const line = w.row('V2I-ACME00000001');
  assert.match(line, /APP_CONFIRMATION=EMAIL/); assert.match(line, /APP_STATUS_EVIDENCE=Tim direct statement/); assert.match(line, /APP_EMAIL_EVIDENCE=Gmail 18f2/); assert.match(line, /APP_EMAIL_DATE=2026-10-21/);
  assert.equal(rows(w).length, 2);
  assert.equal(w.post({ action: 'upsert_application', event: email() }).mode, 'ALREADY_APPLIED', 'same email again changes nothing');
});

test('an email that only near-matches a Tim-applied role is held, listed for Needs Tim, and Same role attaches it', t => {
  const w = world(t, { rows: ROWS }); timApplied(w, 'V2I-ACME00000001');
  const r = w.post({ action: 'upsert_application', event: email({ TITLE: 'Quality Director, Robotics', LOCATION: 'Remote' }) });
  assert.equal(r.ok, false); assert.equal(r.mode, 'HOLD'); assert.match(r.error, /NEAR_MATCH_TIM_RULED/);
  assert.equal(rows(w).length, 2, 'no second row');
  const held = w.exec(() => W.heldEmails_());
  assert.equal(held.count, 1); assert.equal(held.holds[0].kind, 'NEAR_TIM_RULED'); assert.deepEqual(held.holds[0].candidates.map(c => c.primaryId), ['V2I-ACME00000001']);
  w.post({ action: 'upsert_application', event: email({ TITLE: 'Quality Director, Robotics', LOCATION: 'Remote' }) });
  assert.equal(w.exec(() => W.heldEmails_()).count, 1, 'a resent email never adds a second hold');
  const res = w.post({ action: 'resolve_held_email', holdId: held.holds[0].id, choice: 'SAME' });
  assert.equal(res.ok, true, JSON.stringify(res)); assert.equal(res.primaryId, 'V2I-ACME00000001'); settle(w);
  assert.match(w.row('V2I-ACME00000001'), /APP_CONFIRMATION=EMAIL/); assert.equal(rows(w).length, 2);
  assert.equal(w.exec(() => W.heldEmails_()).count, 0);
  assert.equal(w.post({ action: 'resolve_held_email', holdId: held.holds[0].id, choice: 'SAME' }).mode, 'ALREADY_RESOLVED');
});

test('Different role creates its own APPLIED row (confirmed by email) and closes the hold', t => {
  const w = world(t, { rows: ROWS }); timApplied(w, 'V2I-ACME00000001');
  w.post({ action: 'upsert_application', event: email({ TITLE: 'VP Operations', LOCATION: 'Boston, MA', SOURCE_URL: 'https://acme.example/jobs/77' }) });
  const h = w.exec(() => W.heldEmails_()).holds[0];
  const res = w.post({ action: 'resolve_held_email', holdId: h.id, choice: 'DIFFERENT' });
  assert.equal(res.ok, true, JSON.stringify(res)); assert.equal(res.mode, 'CREATE'); settle(w);
  assert.equal(rows(w).length, 3); assert.match(w.row(res.primaryId), /VP Operations/);
  assert.equal(w.exec(() => W.heldEmails_()).count, 0);
});

test('batch upserts record their holds too; an employer Tim never applied to still creates a row', t => {
  const w = world(t, { rows: ROWS }); timApplied(w, 'V2I-ACME00000001');
  const r = w.post({ action: 'upsert_application', events: [email({ TITLE: 'Head of Quality', LOCATION: 'Remote' }), email({ COMPANY: 'Initech', TITLE: 'Director of Operations', LOCATION: 'Austin, TX', SOURCE_URL: 'https://initech.example/9' })] });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.deepEqual(r.results.map(x => x.mode), ['HOLD', 'CREATE']);
  assert.equal(r.results[0].holdPlan, undefined, 'no internal fields in the answer');
  assert.equal(w.exec(() => W.heldEmails_()).count, 1);
});

test('resolve_held_email validates its input and is not allowed in a batch', t => {
  const w = world(t, { rows: ROWS });
  assert.equal(w.post({ action: 'resolve_held_email', holdId: 'HOLD-x', choice: 'MAYBE' }).mode, 'REJECTED_SCHEMA');
  assert.match(w.post({ action: 'resolve_held_email', holdId: 'HOLD-x', choice: 'SAME' }).error, /no held email/);
  assert.equal(w.post({ action: 'batch', requests: [{ action: 'resolve_held_email', holdId: 'HOLD-x', choice: 'SAME' }] }).mode, 'REJECTED_SCHEMA');
});
