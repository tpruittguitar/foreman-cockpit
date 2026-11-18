// Real HR training sessions (control/OFFICE_TRAINING.json). Run: node --test tests/office-training-sessions.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const T0 = Date.parse('2026-11-17T10:00:00Z'), MIN = 60000;
const iso = ms => new Date(ms).toISOString();
const NAMES = L.ROSTER.map(r => r.name);
const bot = (name, status) => ({ bot: name, status: status || 'idle', last_action_at: iso(T0), question: status === 'waiting_tim' ? 'Q?' : '' });
const bots = (...xs) => xs.map(x => (Array.isArray(x) ? bot(x[0], x[1]) : bot(x)));
const sess = (o) => Object.assign({ id: 's1', skill: 'pr-hygiene', trainer: 'HR', trainees: ['Claude', 'QA'], started_at: iso(T0), until: iso(T0 + 10 * MIN) }, o);
const parse = (sessions, names) => L.parseTraining({ sessions }, names || NAMES);
const plan = (list, sessions, now, extra, meetings) => L.planOffice(list, meetings || [], now, 'live', undefined, Object.assign({ training: parse(sessions).sessions }, extra));

test('parseTraining: valid file resolves names, bot_ids and aliases', () => {
  const r = parse([sess({ trainer: 'dr eggbot', trainees: ['Cursor', 'd4118f0c-1b06-4e9a-982f-f5314451c841', 'Software', 'QA bot'] })]);
  assert.equal(r.ok, true);
  assert.equal(r.sessions.length, 1);
  assert.equal(r.sessions[0].trainer, 'HR');
  assert.deepEqual(r.sessions[0].trainees, ['Cursor', 'Claude', 'QA']);
  assert.equal(r.sessions[0].startMs, T0);
});
test('parseTraining: missing / malformed input means no sessions', () => {
  for (const j of [null, undefined, 'x', 5, {}, { sessions: 'no' }, []]) { const r = L.parseTraining(j, NAMES); assert.equal(r.ok, false); assert.deepEqual(r.sessions, []); }
  assert.deepEqual(L.parseTraining({ sessions: [] }, NAMES), { ok: true, sessions: [] });
});
test('parseTraining: drops bad sessions, unknown bots, duplicates and the trainer in trainees', () => {
  const r = parse([
    sess({ id: '' }), sess({ id: 'a', skill: '' }), sess({ id: 'b', started_at: 'nope' }), sess({ id: 'c', until: iso(T0) }), sess({ id: 'd', trainees: [] }),
    sess({ id: 'e', trainees: ['Nobody'] }), sess({ id: 'f', trainer: 'Ghost' }), null, 'x',
    sess({ id: 'ok', trainees: ['Claude', 'Claude', 'HR', 'Ghost', 'QA'] })
  ]);
  assert.deepEqual(r.sessions.map(x => x.id), ['ok']);
  assert.deepEqual(r.sessions[0].trainees, ['Claude', 'QA']);
  assert.equal(parse([sess({ trainer: '' })]).sessions[0].trainer, 'HR');
});
test('activeTraining: started_at <= now < until, earliest start wins', () => {
  const s = parse([sess({ id: 'late', started_at: iso(T0 + 5 * MIN), until: iso(T0 + 20 * MIN) }), sess({ id: 'early' })]).sessions;
  assert.equal(L.activeTraining(s, T0 - 1), null);
  assert.equal(L.activeTraining(s, T0).id, 'early');
  assert.equal(L.activeTraining(s, T0 + 6 * MIN).id, 'early');
  assert.equal(L.activeTraining(s, T0 + 10 * MIN).id, 'late');
  assert.equal(L.activeTraining(s, T0 + 20 * MIN), null);
  assert.equal(L.activeTraining([], T0), null);
  assert.equal(L.activeTraining(undefined, T0), null);
});
test('invite order: HR visits each trainee in turn, then all train and HR leads', () => {
  const list = bots('HR', 'Claude', 'QA', 'Root');
  const per = L.INVITE_S * 1000, seen = [];
  const p0 = plan(list, [sess()], T0);
  assert.equal(p0.plans.HR.act, 'visit');
  assert.equal(p0.plans.HR.partner, 'Claude');
  assert.equal(p0.plans.Claude.act, 'listen');
  assert.equal(p0.plans.QA.act === 'train' || p0.plans.QA.act === 'listen', false);
  assert.equal(p0.training.phase, 'invite');
  for (let i = 0; i < 2; i++) { const p = plan(list, [sess()], T0 + i * per + 1); seen.push(p.plans.HR.partner); }
  assert.deepEqual(seen, ['Claude', 'QA']);
  const p2 = plan(list, [sess()], T0 + 2 * per);
  assert.equal(p2.training.phase, 'session');
  assert.equal(p2.plans.HR.act, 'lead');
  assert.deepEqual([p2.plans.Claude, p2.plans.QA].map(x => x.act), ['train', 'train']);
  assert.deepEqual([p2.plans.Claude.seat, p2.plans.QA.seat], [0, 1]);
  assert.equal(p2.plans.Root.act === 'train' || p2.plans.Root.act === 'lead', false);
});
test('invites never outlast a short session (first half of the window)', () => {
  const s = sess({ until: iso(T0 + 20000) });
  assert.equal(plan(bots('HR', 'Claude', 'QA'), [s], T0 + 1).training.phase, 'invite');
  assert.equal(plan(bots('HR', 'Claude', 'QA'), [s], T0 + 10000).training.phase, 'session');
});
test('working bots are pulled in; meeting members and waiting-on-Tim bots are excluded', () => {
  const list = bots('HR', ['Claude', 'working'], ['QA', 'waiting_tim'], ['Root', 'idle'], 'Edgar');
  const s = sess({ trainees: ['Claude', 'QA', 'Root', 'Edgar'] });
  const meet = [{ id: 'm1', title: 'Sync', members: ['Root'] }];
  const p = plan(list, [s], T0 + 5 * MIN, {}, meet);
  assert.equal(p.plans.Claude.act, 'train');
  assert.equal(p.plans.QA.act, 'wave');
  assert.equal(p.plans.Root.act, 'meeting');
  assert.deepEqual(p.training.trainees, ['Claude', 'Edgar']);
  assert.equal(p.plans.Edgar.act, 'train');
  assert.notEqual(p.plans.Edgar.seat, p.meeting.seated.length - 1);
  const q = plan(bots('HR', 'Claude', 'QA'), [sess()], T0 + 5 * MIN, { needs: new Set(['Claude']) });
  assert.deepEqual(q.training.trainees, ['QA']);
});
test('trainer in a meeting or waiting on Tim: no session this tick', () => {
  assert.equal(plan(bots(['HR', 'waiting_tim'], 'Claude'), [sess({ trainees: ['Claude'] })], T0 + 1).training, null);
  const m = plan(bots('HR', 'Claude'), [sess({ trainees: ['Claude'] })], T0 + 5 * MIN, {}, [{ id: 'm', title: 'X', members: ['HR'] }]);
  assert.equal(m.training, null);
});
test('before started_at and after until, ambient behaviour returns', () => {
  const list = bots('HR', 'Claude', 'QA');
  for (const now of [T0 - MIN, T0 + 10 * MIN, T0 + 30 * MIN]) {
    const p = plan(list, [sess()], now);
    assert.equal(!p.training || !p.training.real, true);
    assert.deepEqual(p.plans, L.planOffice(list, [], now, 'live').plans);
  }
});
test('whiteboard override shows the session skill and "Training: <skill>"', () => {
  const skills = [{ slug: 'pr-hygiene', title: 'PR hygiene', bullets: ['a'] }];
  const p = plan(bots('HR', 'Claude', 'QA'), [sess()], T0 + 5 * MIN);
  const sl = L.trainingSlide(p.training, skills);
  assert.equal(sl.title, 'Skill: PR hygiene');
  assert.equal(sl.bullets[0], 'Training: PR hygiene');
  assert.equal(sl.training, true);
  const other = L.trainingSlide(plan(bots('HR', 'Claude'), [sess({ skill: 'new-thing', trainees: ['Claude'] })], T0 + 5 * MIN).training, skills);
  assert.equal(other.title, 'Skill: new-thing');
  assert.equal(L.trainingSlide(null, skills), null);
  assert.equal(L.trainingSlide(L.planOffice(bots('HR', 'Claude'), [], T0, 'live').training, skills), null);
  assert.ok(L.TRAINING_PATH.endsWith('OFFICE_TRAINING.json'));
});
test('visibleTrainingSessions: drops ended sessions, keeps live and upcoming, sorted by start', () => {
  const NOW = T0, ago = m => NOW - m * MIN;
  const s = parse([
    sess({ id: 'ended', started_at: iso(ago(120)), until: iso(ago(60)) }),
    sess({ id: 'later', started_at: iso(ago(-40)), until: iso(ago(-70)) }),
    sess({ id: 'soon', started_at: iso(ago(-10)), until: iso(ago(-30)) }),
    sess({ id: 'live', started_at: iso(ago(5)), until: iso(ago(-5)) })
  ]).sessions;
  assert.deepEqual(L.visibleTrainingSessions(s, NOW).map(x => x.id), ['live', 'soon', 'later']);
  assert.deepEqual(L.visibleTrainingSessions([], NOW), []);
  assert.deepEqual(L.visibleTrainingSessions(null, NOW), []);
});
test('formatTrainingSession: title falls back to skill, ET times, optional location', () => {
  const [a, b] = parse([sess({ id: 'a', title: 'PR hygiene 101', location: 'Training room' }), sess({ id: 'b', started_at: iso(T0 + 60 * MIN), until: iso(T0 + 90 * MIN) })]).sessions;
  assert.deepEqual(L.formatTrainingSession(a), { title: 'PR hygiene 101', trainer: 'HR', trainees: ['Claude', 'QA'], started: '11/17 5:00 AM', until: '5:10 AM ET', location: 'Training room' });
  assert.deepEqual(L.formatTrainingSession(b), { title: 'pr-hygiene', trainer: 'HR', trainees: ['Claude', 'QA'], started: '11/17 6:00 AM', until: '6:30 AM ET', location: '' });
});
