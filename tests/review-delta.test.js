// D-3 (REV-053): score change since Tim's last review (pipeline-review.js), from real scoreRow output.
const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../pipeline-review.js'), Scoring = require('../pipeline-scoring.js');

const row = over => ({ id: 'J1', COMPANY: 'Acme Robotics', TITLE: 'Director, Manufacturing Operations', LOCATION: 'Nashville, TN', BUCKET: 'READY_TO_PURSUE',
  payload: Object.assign({ EXPERIENCE_FIT: '74', FLEX_CLASS: 'HIGH_FLEX', FLEX: 'HIGH', SALARY_BASE_EST: '$240000-$260000', SALARY_BASIS: 'POSTED_ROLE_RANGE' }, over || {}) });

test('snapshot records what Tim saw: overall, part scores (-1 unknown), boost, model revision', () => {
  const sc = Scoring.scoreRow(row(), {});
  const s = R.snapshot(sc, 26, 1000);
  assert.equal(s.s, sc.overall); assert.equal(s.t, 1000); assert.equal(s.r, 26); assert.equal(s.p.length, 8); assert.equal(s.b, 0); assert.equal(s.bl, undefined);
  R.ORDER.forEach((k, i) => assert.equal(s.p[i], sc.parts[k] && sc.parts[k].known ? Math.round(sc.parts[k].score) : -1, k));
  assert.equal(R.snapshot({ overall: null }, 1, 1), null);
  assert.equal(R.snapshot(sc, null, 5, true).bl, 1);
});

test('delta: the overall change and its cause come from the two score objects (L-2)', () => {
  const before = Scoring.scoreRow(row(), {}), rec = R.snapshot(before, 26, 1000);
  const after = Scoring.scoreRow(row({ EXPERIENCE_FIT: '94' }), {});
  const d = R.delta(rec, after, 26);
  assert.equal(d.d, after.overall - before.overall); assert.ok(d.d > 0);
  assert.equal(d.causes[0].key, 'experience'); assert.equal(d.causes[0].from, Math.round(before.parts.experience.score)); assert.equal(d.causes[0].to, Math.round(after.parts.experience.score));
  assert.match(R.causeText(d), /^Experience fit \d+ → \d+/); assert.equal(d.model, null);
  // nothing moved: d 0, no causes
  const same = R.delta(rec, before, 26); assert.equal(same.d, 0); assert.deepEqual(same.causes, []); assert.equal(R.causeText(same), '');
});

test('delta names a model revision change and a company boost change', () => {
  const sc = Scoring.scoreRow(row(), {}), rec = R.snapshot(sc, 25, 1000);
  const d = R.delta(Object.assign({}, rec, { b: 0 }), Object.assign({}, sc, { overall: sc.overall + 10, companyBoost: { points: 10 } }), 26);
  assert.equal(d.d, 10); assert.deepEqual(d.model, { from: 25, to: 26 }); assert.deepEqual(d.boost, { from: 0, to: 10 });
  assert.match(R.causeText(d), /company boost \+0 → \+10 · scoring model rev 25 → 26/);
});

test('merge: union by job id, larger t wins, ties keep the stored record, malformed dropped', () => {
  const a = { J1: { s: 50, t: 10 }, J2: { s: 60, t: 20 } }, b = { J1: { s: 55, t: 30 }, J2: { s: 99, t: 20 }, J3: { s: 70, t: 5 }, J4: { s: 140, t: 9 }, J5: { s: 40 } };
  const m = R.merge(a, b);
  assert.deepEqual(m.store, { J1: { s: 55, t: 30 }, J2: { s: 60, t: 20 }, J3: { s: 70, t: 5 } }); assert.equal(m.changed, true);
  assert.equal(R.merge(m.store, { J1: { s: 1, t: 29 } }).changed, false);
});

test('summary counts new jobs and score changes (up / down) with the largest change as the example', () => {
  const ex = { d: -6, causes: [{ key: 'compensation', name: 'Net compensation', from: 80, to: 50, size: 450 }], model: null, boost: null };
  const s = R.summary([{ id: 'a', isNew: true }, { id: 'b', delta: { d: 2, causes: [], model: null, boost: null } }, { id: 'c', delta: ex }, { id: 'd', delta: { d: 0, causes: [] } }, { id: 'e', delta: null }]);
  assert.deepEqual(s.fresh, ['a']); assert.deepEqual(s.changed, ['b', 'c']); assert.equal(s.up, 1); assert.equal(s.down, 1); assert.equal(s.example, 'Net compensation 80 → 50');
});

test('lastReviewAt: latest non-baseline review before the session start', () => {
  assert.equal(R.lastReviewAt({ a: { s: 1, t: 50 }, b: { s: 1, t: 80, bl: 1 }, c: { s: 1, t: 200 } }, 100), 50);
  assert.equal(R.lastReviewAt({ b: { s: 1, t: 80, bl: 1 } }, 100), null);
  assert.equal(R.signed(4), '+4'); assert.equal(R.signed(-3), '−3'); assert.equal(R.signed(0), '0');
});

test('merge: a real review always beats a baseline, whatever the times', () => {
  const m = R.merge({ J1: { s: 50, t: 900, bl: 1 }, J2: { s: 60, t: 10 } }, { J1: { s: 40, t: 100 }, J2: { s: 70, t: 999, bl: 1 } });
  assert.deepEqual(m.store, { J1: { s: 40, t: 100 }, J2: { s: 60, t: 10 } });
  assert.equal(R.wins({ s: 1, t: 5, bl: 1 }, { s: 1, t: 4, bl: 1 }), true);
});
