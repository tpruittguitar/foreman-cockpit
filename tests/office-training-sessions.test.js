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
test('before started_at, and after until outside the replay window, ambient behaviour returns', () => {
  const list = bots('HR', 'Claude', 'QA');
  for (const now of [T0 - MIN, T0 + 15 * MIN, T0 + 35 * MIN]) {
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

/* Tim (Nov 18, 2:29 AM ET): trainees take the skill off the board and wear a learned tag; past real sessions replay, labeled Replay. */
const skills = [{ slug: 'pr-hygiene', title: 'PR hygiene', bullets: ['a'] }];
test('live session: trainees pick the skill up in turn, then wear it; non-trainees get no tag; HR names the skill', () => {
  const list = bots('HR', 'Claude', 'QA', 'Root'), s = parse([sess()]).sessions;
  const p = plan(list, [sess()], T0 + 2 * L.INVITE_S * 1000);
  const at = p.training.sessionAt;
  assert.equal(p.training.replay, false);
  assert.equal(at, T0 + 2 * L.INVITE_S * 1000);
  assert.deepEqual(L.skillTags(p.training, s, at - 1, skills), {});
  const t1 = L.skillTags(p.training, s, at + L.PICK_MS / 2, skills);
  assert.deepEqual(t1, { Claude: { skill: 'PR hygiene', t: 0.5, replay: false } });
  const t2 = L.skillTags(p.training, s, at + L.PICK_MS + L.PICK_MS / 4, skills);
  assert.deepEqual(t2.Claude, { skill: 'PR hygiene', t: null, replay: false });
  assert.equal(t2.QA.t, 0.25);
  const t3 = L.skillTags(p.training, s, at + 2 * L.PICK_MS, skills);
  assert.deepEqual(Object.keys(t3).sort(), ['Claude', 'QA']);
  assert.equal(t3.Root, undefined); assert.equal(t3.HR, undefined);
  const line = L.trainLine(p.training, skills, 0);
  assert.match(line, /PR hygiene/); assert.doesNotMatch(line, /Replay|new skills/);
  assert.equal(L.trainingSlide(p.training, skills).counter, 'LIVE');
});
test('replay only: an ended real session replays labeled Replay at the start of each bucket, idle trainees only', () => {
  const list = bots('HR', 'Claude', 'QA', 'Root'), past = [sess({ id: 'old' })];
  const b0 = Math.ceil((T0 + 10 * MIN) / L.REPLAY_CYCLE_MS) * L.REPLAY_CYCLE_MS;
  const p = plan(list, past, b0 + 2 * L.INVITE_S * 1000);
  assert.equal(p.training.replay, true);
  assert.equal(p.training.id, 'old');
  assert.equal(p.plans.HR.act, 'lead');
  assert.deepEqual([p.plans.Claude.act, p.plans.QA.act], ['train', 'train']);
  assert.notEqual(p.plans.Root.act, 'train');
  const sl = L.trainingSlide(p.training, skills);
  assert.equal(sl.counter, 'REPLAY'); assert.match(sl.title, /^Replay: PR hygiene/);
  assert.equal(L.trainLine(p.training, skills, 1), 'Replay: Take PR hygiene from the board');
  const tg = L.skillTags(p.training, parse(past).sessions, p.training.sessionAt + L.PICK_MS / 2, skills);
  assert.equal(tg.Claude.replay, true); assert.equal(tg.Claude.t, 0.5);
  assert.equal(plan(list, past, b0 + L.REPLAY_MS).training, null);
  const busy = L.planOffice(list, [], b0 + 1, 'live', { Claude: { stale: false } }, { training: parse(past).sessions });
  assert.deepEqual(busy.training.trainees, ['QA']);
  assert.equal(L.planOffice(list, [], b0 + 1, 'live', { HR: { stale: false } }, { training: parse(past).sessions }).training, null);
  const live = plan(list, [sess({ id: 'old' }), sess({ id: 'now', started_at: iso(b0), until: iso(b0 + 10 * MIN) })], b0 + 1);
  assert.equal(live.training.id, 'now'); assert.equal(live.training.replay, false);
});
test('no sessions: no training, nobody invited, no tags', () => {
  const list = bots('HR', 'Claude', 'QA');
  for (const now of [T0, T0 + 1000, T0 + 3 * MIN]) {
    const p = plan(list, [], now);
    assert.equal(p.training, null);
    assert.equal(Object.values(p.plans).some(x => x.act === 'train' || x.act === 'lead'), false);
    assert.deepEqual(L.skillTags(p.training, [], now, skills), {});
    assert.equal(L.trainLine(null, skills, 0), '');
  }
});
test('learned tag stays on real trainees for a day after the session ends', () => {
  const s = parse([sess()]).sessions, end = T0 + 10 * MIN;
  assert.deepEqual(L.skillTags(null, s, end + MIN, skills), { Claude: { skill: 'PR hygiene', t: null, replay: false }, QA: { skill: 'PR hygiene', t: null, replay: false } });
  assert.deepEqual(L.skillTags(null, s, end + L.LEARNED_TAG_MS, skills), {});
});
test('trainer visits then leads for the whole live and replay session even when its screen is idle or offline; wander and the idle chip do not win', () => {
  const list = bots('HR', 'Claude', 'QA', 'Root');
  const sessions = parse([sess()]).sessions;
  const idle = { stale: true, working: false, label: 'idle · last active 33 min ago' };
  const off = { stale: true, working: false, label: 'offline · last seen 33 min ago' };
  const work = { stale: false, working: true, label: '' };
  for (const hrFresh of [idle, off]) {
    const fresh = { HR: hrFresh, Claude: work, QA: idle, Root: work };
    const pInv = L.planOffice(list, [], T0 + 1, 'live', fresh, { training: sessions });
    assert.equal(pInv.plans.HR.act, 'visit');
    assert.equal(pInv.training.replay, false);
    assert.equal(L.activityChip(hrFresh, pInv.training, 'HR'), '');
    assert.equal(L.activityChip(idle, pInv.training, 'QA'), idle.label);
    const pLead = L.planOffice(list, [], T0 + 2 * L.INVITE_S * 1000, 'live', fresh, { training: sessions });
    assert.equal(pLead.plans.HR.act, 'lead');
    assert.notEqual(pLead.plans.HR.act, 'wander');
    assert.equal(L.activityChip(hrFresh, pLead.training, 'HR'), '');
    const b0 = Math.ceil((T0 + 10 * MIN) / L.REPLAY_CYCLE_MS) * L.REPLAY_CYCLE_MS;
    const pRep = L.planOffice(list, [], b0 + 2 * L.INVITE_S * 1000, 'live', fresh, { training: sessions });
    assert.equal(pRep.training.replay, true);
    assert.equal(pRep.plans.HR.act, 'lead');
    assert.notEqual(pRep.plans.HR.act, 'wander');
    assert.equal(L.activityChip(hrFresh, pRep.training, 'HR'), '');
  }
  const office = require('node:fs').readFileSync(require('node:path').join(__dirname, '../office/office.js'), 'utf8');
  const leadFirst = office.indexOf("trainPlan.act === 'lead'");
  const jobs = office.indexOf('if (c.job || c.jobs.length)');
  const inv = office.indexOf('S.invite = (S.hrFree && !plan.training)');
  assert.ok(leadFirst > 0 && leadFirst < jobs, 'decide() applies lead/visit/train before job cards');
  assert.ok(inv > 0, 'ambient invites do not run during a real or replayed session');
  assert.match(office, /L\.activityChip\(S\.fresh\[c\.name\], plan\.training, c\.name\)/);
});
