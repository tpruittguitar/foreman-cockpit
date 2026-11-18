// QA FAIL #446 (a167d73): plan said HR.act=lead, but HR sat at its desk (pose=sit, goalKey=home,
// x=-2.2, z=0.12) during live session train-20261118-0812-2. This sim feeds that session and the
// live office-screens index into planOffice + the same walk/gaveUp rules as office.js, with the
// walk cap full. Run: node --test tests/office-training-lead-walk.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../office/office-logic.js');
const LAYOUT = require('./fixtures/office-layout.json');
const SCREENS = L.parseScreensIndex(require('./fixtures/office-screens-index.live.json'));
const TRAINING = require('./fixtures/office-training-0812.json');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');

const SESSION_ID = 'train-20261118-0812-2';
const START = Date.parse(TRAINING.sessions[0].started_at);
const UNTIL = Date.parse(TRAINING.sessions[0].until);
const NOW = Date.parse('2026-11-18T08:15:00Z'); // QA read, mid-session
const HR_ID = L.ROSTER.find(r => r.name === 'HR').id;
const deskOf = name => LAYOUT.desks.find(d => d.name === name);
const TRAINER = LAYOUT.trainer;
const CONF = LAYOUT.slots.filter(s => s.kind === 'conf').sort((a, b) => a.id.localeCompare(b.id));
const TOTAL = L.ROSTER.length;

function bots() {
  return L.ROSTER.map(r => ({ bot: r.name, bot_id: r.id, status: 'idle', last_action_at: new Date(START - 60000).toISOString() }));
}
function freshAt(now, screens) {
  const list = bots(), ctx = { screens: screens || SCREENS };
  return Object.fromEntries(list.map(b => [b.bot, L.botActivity(b, now, ctx)]));
}
function idleScreens() {
  const sc = JSON.parse(JSON.stringify(SCREENS));
  for (const name of ['HR', 'Cursor', 'Claude', 'ChatGPT', 'Root']) {
    const id = L.ROSTER.find(r => r.name === name).id, e = sc.screens[id];
    if (e) { e.busy = false; e.offline = false; }
  }
  return sc;
}
function sessions() {
  return L.parseTraining(TRAINING, L.ROSTER.map(r => r.name)).sessions;
}
function planAt(now, screens) {
  return L.planOffice(bots(), [], now, 'live', freshAt(now, screens), { training: sessions() });
}
function trainingGoal(p, name) {
  if (!p) return null;
  if (p.act === 'lead') return { key: 'lead', spot: TRAINER, pose: 'talk' };
  if (p.act === 'train') return { key: 'train:' + p.seat, spot: CONF[p.seat], pose: 'meet' };
  if (p.act === 'visit') { const d = deskOf(p.partner); return { key: 'visit:' + p.partner, spot: d.visit, pose: 'talk' }; }
  if (p.act === 'listen') { const d = deskOf(name); return { key: 'listen', spot: d.seat, pose: 'talk' }; }
  return null;
}
// Same gaveUp and walk-cap urgency office.js uses. After the fix, session walks stay on
// their goal and skip a full cap (L.isSessionWalk / L.applyGaveUp). On current main those
// helpers are missing, which is the #446 miss.
function applyGaveUp(g, gaveUp, now, desk) {
  if (typeof L.applyGaveUp === 'function') return L.applyGaveUp(g, gaveUp, now, desk);
  if (gaveUp && desk && gaveUp.key === g.key && now < gaveUp.until) return { key: 'home', spot: desk.seat, pose: 'sit' };
  return g;
}
function walkUrgent(g, needs, forceNap, home) {
  return !!(needs || forceNap || home || (typeof L.isSessionWalk === 'function' && L.isSessionWalk(g)));
}

function atSpot(pos, spot, max) { return Math.hypot(pos.x - spot.x, pos.z - spot.z) < (max || 0.35); }
function atDesk(pos, desk) { return Math.hypot(pos.x - desk.seat.x, pos.z - desk.seat.z) < 0.4; }
function assertLeading(samples, desk, label) {
  const ARRIVE_S = 15;
  assert.ok(samples.length, label + ' session-phase samples');
  for (const s of samples) {
    const t = new Date(s.now).toISOString();
    assert.equal(s.act, 'lead', 'plan stays lead at ' + t);
    assert.notEqual(s.goalKey, 'home', 'goalKey=home at ' + t);
    assert.notEqual(s.pose, 'sit', 'pose=sit at ' + t + ' ' + s.goalKey + ' ' + s.x.toFixed(2) + ',' + s.z.toFixed(2));
    assert.equal(s.goalKey, 'lead');
    assert.ok(!atDesk(s, desk), 'still at the HR desk at ' + t);
  }
  const arrived = samples.filter(s => s.now >= samples[0].now + ARRIVE_S * 1000);
  assert.ok(arrived.length, label + ' samples after the walk');
  for (const s of arrived) {
    assert.ok(atSpot({ x: s.x, z: s.z }, TRAINER, 0.5), label + ' not at trainer spot: ' + s.x.toFixed(2) + ',' + s.z.toFixed(2) + ' at ' + new Date(s.now).toISOString());
  }
}

// Step HR from its desk through [t0, t1] with the walk cap already full of other bots,
// applying decide() training goals, gaveUp-to-home, and the walk cap the same way office.js does.
function sim(t0, t1, injectGaveUpAt, screens) {
  const nav = L.createNav(LAYOUT), desk = deskOf('HR');
  const pos = { x: desk.seat.x, z: desk.seat.z };
  let path = [], goalKey = '', goal = null, gaveUp = null, pose = 'sit', arrived = true, clock = 0;
  const walkingNow = L.walkCap(TOTAL), dt = 1 / 30, samples = [];
  for (let now = t0; now <= t1; now += 1000, clock += 1) {
    const plan = planAt(now, screens), raw = trainingGoal(plan.plans.HR, 'HR');
    assert.ok(raw, 'HR has a training plan at ' + new Date(now).toISOString() + ' act=' + (plan.plans.HR && plan.plans.HR.act));
    let g = applyGaveUp(raw, gaveUp, clock, desk);
    const far = Math.hypot(g.spot.x - pos.x, g.spot.z - pos.z) > 0.4;
    const home = Math.hypot(g.spot.x - desk.seat.x, g.spot.z - desk.seat.z) < 0.05;
    if (g.key !== goalKey) {
      if (!L.mayStartWalk(far, walkUrgent(g, false, false, home), walkingNow, TOTAL)) {
        /* stay put: the cap is full */
      } else {
        goalKey = g.key; goal = g; arrived = false; path = nav.route(pos, g.spot); gaveUp = (gaveUp && gaveUp.key === g.key && clock < gaveUp.until) ? gaveUp : null;
      }
    }
    const use = goalKey === g.key ? g : (goal || g);
    if (path.length) {
      let prog = null;
      const end = clock + 1;
      for (let t = clock; t < end && path.length; t += dt) {
        const tgt = path[0], dist = Math.hypot(tgt.x - pos.x, tgt.z - pos.z);
        prog = L.walkProgress(prog, dist, t);
        if (prog.action === 'reroute') { path = nav.route(pos, use.spot); prog = { best: Infinity, since: t, tries: prog.tries, action: 'ok' }; continue; }
        if (prog.action === 'giveup') { path = []; if (use.key !== 'home') { gaveUp = { key: use.key, until: t + 30 }; goalKey = ''; } break; }
        const step = L.WALK_MPS * dt;
        if (dist <= step) { pos.x = tgt.x; pos.z = tgt.z; path.shift(); prog = null; }
        else { pos.x += (tgt.x - pos.x) / dist * step; pos.z += (tgt.z - pos.z) / dist * step; }
      }
    }
    if (!path.length && goalKey === g.key) { arrived = true; pose = g.pose; }
    else if (!path.length && goalKey !== g.key) pose = pose === 'sit' ? 'sit' : 'stand';
    if (injectGaveUpAt != null && now >= injectGaveUpAt && !gaveUp && goalKey === 'lead') gaveUp = { key: 'lead', until: clock + 30 };
    samples.push({ now, act: plan.plans.HR.act, goalKey, pose: goalKey === 'home' ? 'sit' : (path.length ? 'walk' : pose), x: pos.x, z: pos.z, replay: !!(plan.training && plan.training.replay), phase: plan.training && plan.training.phase });
  }
  return { pos, desk, samples };
}

test('live HR screen + train-20261118-0812-2: plan is lead at the QA read, even if the screen is busy', () => {
  const s = sessions();
  assert.equal(s[0].id, SESSION_ID);
  assert.equal(SCREENS.screens[HR_ID].busy, true);
  const p = planAt(NOW);
  assert.equal(p.training.id, SESSION_ID);
  assert.equal(p.training.phase, 'session');
  assert.equal(p.plans.HR.act, 'lead');
  assert.deepEqual(p.training.trainees, ['Cursor', 'Claude', 'ChatGPT', 'Root']);
  const hrDesk = deskOf('HR').seat;
  assert.deepEqual([hrDesk.x, hrDesk.z], [-2.2, 0.12]);
});

test('with the walk cap full, HR still walks from its desk to the head of the table and stays there for the live session, not home/sit', () => {
  const t0 = START, t1 = UNTIL - 1;
  const r = sim(t0, t1, START + 3 * 60000);
  const mid = r.samples.filter(s => s.now >= START + L.INVITE_S * 1000 * 4 && s.now < UNTIL);
  assertLeading(mid, r.desk, 'live');
  assert.ok(atSpot(r.pos, TRAINER, 0.5), 'ended at trainer, not desk ' + r.pos.x.toFixed(2) + ',' + r.pos.z.toFixed(2));
});

test('replay: HR walks to the head of the table and leads, even with a full walk cap and a lead give-up', () => {
  const b0 = Math.ceil(UNTIL / L.REPLAY_CYCLE_MS) * L.REPLAY_CYCLE_MS;
  const t0 = b0, t1 = b0 + L.REPLAY_MS - 1;
  const r = sim(t0, t1, b0 + 2 * L.INVITE_S * 1000 + 5000, idleScreens());
  const mid = r.samples.filter(s => s.phase === 'session');
  assert.ok(mid.length && mid.every(s => s.replay), 'replay session samples');
  assertLeading(mid, r.desk, 'replay');
});

test('office.js treats session lead/visit/train as urgent and does not send a gave-up trainer home', () => {
  assert.match(office, /mayStartWalk\(far, needs \|\| c\.forceNap \|\| home \|\| L\.isSessionWalk\(g\), walkingNow, chars\.size\)/);
  assert.match(office, /g = L\.applyGaveUp\(g, c\.gaveUp, clock, dk\)/);
  assert.equal(typeof L.isSessionWalk, 'function');
  assert.equal(L.isSessionWalk({ key: 'lead' }), true);
  assert.equal(L.isSessionWalk({ key: 'visit:Cursor' }), true);
  assert.equal(L.isSessionWalk({ key: 'train:0' }), true);
  assert.equal(L.isSessionWalk({ key: 'home' }), false);
  const desk = deskOf('HR');
  const lead = { key: 'lead', spot: TRAINER, pose: 'talk' };
  const stuck = { key: 'lead', until: 10 };
  assert.deepEqual(L.applyGaveUp(lead, stuck, 5, desk), lead);
  assert.equal(L.applyGaveUp({ key: 'coffee', spot: desk.seat, pose: 'sit' }, { key: 'coffee', until: 10 }, 5, desk).key, 'home');
});
