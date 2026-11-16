// Tim feedback items 1-16 (3D office), pure logic in office/office-logic.js. Run: node --test tests/office-feedback-1-16.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const NOW = Date.parse('2026-11-16T20:00:00Z');
const bot = (name, status, question) => ({ bot: name, bot_id: '', status, question: question || '', link: '' });

/* ---------- items 3 / 9: only a real needs_tim item waves ---------- */
test('needs_tim wave: only bots with a real needs_tim ask; idle, working, blocked and question-less bots never', () => {
  const parsed = L.parseStatus({ updated_at: new Date(NOW).toISOString(), bots: [
    { bot: 'Root', status: 'needs_tim', question: 'Merge the PR?' }, { bot: 'GUI', status: 'idle' }, { bot: 'Comp', status: 'working' },
    { bot: 'Sniffer', status: 'blocked' }, { bot: 'Gauge', status: 'needs_tim', question: '' }, { bot: 'Claude', status: 'needs_tim', question: 'EXAMPLE: fake ask' }] });
  const names = L.needsTimNames(L.needsList({ bots: parsed.bots, entries: [], prStates: new Map(), pulls: [], now: NOW, demo: false }));
  assert.deepEqual([...names], ['Root']);
  const idleOnly = L.needsTimNames(L.needsList({ bots: [bot('GUI', 'idle')], entries: [], now: NOW }));
  assert.equal(idleOnly.size, 0, 'idle bots never show "?" / wave');
});
test('needs_tim wave: a live needs_tim entry names its bot; resolved or PR-merged entries do not', () => {
  const entries = [{ text: 'Pick a date', bot: 'Edgar' }, { text: 'Old', bot: 'Comp', resolved: true }, { text: 'Merged', bot: 'GUI', link: 'https://github.com/o/r/pull/5' }];
  const st = new Map([['o/r#5', 'merged']]);
  const names = L.needsTimNames(L.needsList({ bots: [], entries, prStates: st, now: NOW }));
  assert.deepEqual([...names], ['Edgar']);
});
test('needs_tim wave: an open PR is review queue, not a wave', () => {
  const b = bot('Root', 'waiting_tim', 'merge?'); b.link = 'https://github.com/o/r/pull/9';
  assert.equal(L.needsTimNames(L.needsList({ bots: [b], entries: [], prStates: new Map([['o/r#9', 'open']]), now: NOW })).size, 0);
});

/* ---------- item 2: waterfall flows down ---------- */
test('waterfall: offset grows (water moves down) and stands still for reduced motion', () => {
  assert.ok(L.waterfallOffset(0.2, 0.1, false) > 0.2);
  assert.equal(L.waterfallOffset(0.2, 0.1, true), 0.2);
  assert.ok(L.waterfallOffset(0.99, 0.5, false) < 0.99, 'wraps inside 0..1');
});

/* ---------- item 5: day / night from America/New_York ---------- */
test('sky: follows the Eastern hour, not UTC (Nov = EST, Jul = EDT)', () => {
  const at = iso => L.skyState(Date.parse(iso));
  assert.equal(L.etDate(Date.parse('2026-11-16T17:00:00Z')).h, 12);
  assert.equal(L.etDate(Date.parse('2026-07-16T16:00:00Z')).h, 12);
  assert.ok(at('2026-11-16T17:00:00Z').daylight > 0.9, 'noon ET is bright');
  assert.equal(at('2026-11-16T17:00:00Z').isNight, false);
  assert.equal(at('2026-11-16T04:00:00Z').isNight, true, '23:00 ET is night although it is 04:00 UTC');
  assert.ok(at('2026-11-16T22:00:00Z').daylight > 0.1, '17:00 ET in mid November is still light (22:00 UTC would be night if UTC were used)');
  assert.equal(at('2026-11-17T01:00:00Z').isNight, true, '20:00 ET in November is dark');
  assert.equal(at('2026-07-16T23:00:00Z').isNight, false, '19:00 EDT in July is still daytime (sunset is about 20:50)');
  assert.equal(at('2026-07-16T16:00:00Z').isNight, false);
  assert.equal(at('2026-07-16T07:00:00Z').isNight, true, '03:00 EDT night');
});
test('sky: summer days are longer than winter days; sun by day, moon by night, stars only at night', () => {
  const w = L.skyState(Date.parse('2026-12-21T17:00:00Z')), s = L.skyState(Date.parse('2026-06-21T16:00:00Z'));
  assert.ok(s.sunset - s.sunrise > w.sunset - w.sunrise + 3);
  assert.ok(w.sun && !w.moon && w.stars === 0);
  const n = L.skyState(Date.parse('2026-11-16T06:00:00Z'));
  assert.ok(n.moon && !n.sun && n.stars > 0.9 && n.lights);
  assert.match(n.top, /^#[0-9a-f]{6}$/);
});

/* ---------- item 11: idle rotation, seedable RNG ---------- */
test('rng: same seed -> same sequence, different seed -> different', () => {
  const a = L.makeRng(42), b = L.makeRng(42), c = L.makeRng(43);
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  assert.deepEqual(sa, sb); assert.notDeepEqual(sa, [c(), c(), c()]);
  assert.ok(sa.every(v => v >= 0 && v < 1));
});
function run(seed, steps, ctxFn) {
  const rng = L.makeRng(seed), st = L.createIdleState(), seq = []; let t = 0;
  for (let i = 0; i < steps; i++) { const a = L.idleTick(st, rng, t, ctxFn ? ctxFn(i) : { restock: 'ok' }); if (seq[seq.length - 1] !== a) seq.push(a); t = st.until + 0.1; }
  return seq;
}
test('idle rotation: covers all 8 activities, never repeats back to back, randomized by seed, repeatable for a seed', () => {
  const s1 = run(7, 24);
  assert.deepEqual(new Set(s1.slice(0, 8)).size, 8, 'a full bag visits every activity once');
  for (let i = 1; i < s1.length; i++) assert.notEqual(s1[i], s1[i - 1]);
  assert.deepEqual(run(7, 24), s1);
  assert.notDeepEqual(run(8, 24), s1);
  assert.deepEqual([...new Set(s1)].sort(), L.IDLE_ACTIVITIES.slice().sort());
  for (const a of ['couch_sleep', 'desk_nap', 'hr_training', 'video_game', 'exercise_bike', 'group_chat', 'restock_fridge', 'pool']) assert.ok(s1.includes(a), a);
});
test('idle rotation: each activity lasts 60-150 s, held until its time is up', () => {
  const rng = L.makeRng(3), st = L.createIdleState(); const a = L.idleTick(st, rng, 100, {});
  assert.ok(st.until - 100 >= L.IDLE_ACT_MIN_S && st.until - 100 <= L.IDLE_ACT_MAX_S);
  assert.equal(L.idleTick(st, rng, 100 + 30, {}), a, 'still the same activity');
});
test('fridge: restock is excluded when full, forced when low, and one bot restocks at a time', () => {
  assert.equal(run(5, 40, () => ({ restock: 'no' })).includes('restock_fridge'), false);
  const rng = L.makeRng(1), st = L.createIdleState(); L.idleTick(st, rng, 0, { restock: 'ok' });
  assert.equal(L.idleTick(st, rng, 1, { restock: 'force' }), 'restock_fridge', 'low fridge interrupts the current idle activity');
  assert.equal(L.fridgeLow(5, 20), true); assert.equal(L.fridgeLow(15, 20), false);
  const idle = ['GUI', 'Comp', 'Root'];
  const who = L.pickRestocker(idle, 4, null); assert.ok(idle.includes(who));
  assert.equal(L.pickRestocker(idle, 4, who), who, 'stays the same bot until done');
  assert.equal(L.pickRestocker(idle, 18, null), null, 'not low: nobody');
  assert.equal(L.pickRestocker(idle, L.FRIDGE_CAP, who), null, 'full again: the restocker is done');
  assert.equal(L.pickRestocker(['GUI'], 4, 'Comp'), 'GUI', 'a restocker who went back to work is replaced');
});
test('group chat slots: on a ring, each one faces the middle', () => {
  const s = L.groupChatSlots(7, -5, 4, 0.8);
  assert.equal(s.length, 4);
  for (const p of s) { assert.ok(Math.abs(Math.hypot(p.x - 7, p.z + 5) - 0.8) < 0.01); assert.ok(Math.abs(Math.sin(p.face) * 0.8 + p.x - 7) < 0.01 && Math.abs(Math.cos(p.face) * 0.8 + p.z + 5) < 0.01); }
});

/* ---------- item 9: working bots sit; short breaks only ---------- */
test('work breaks: stretch or refresh, short and occasional; otherwise the bot works at its desk', () => {
  const seen = new Set(); let on = 0;
  for (let s = 0; s < 7200; s += 3) { const b = L.workBreak('Claude', NOW + s * 1000); if (b) { seen.add(b); on++; } }
  assert.ok([...seen].every(a => ['stretch', 'coffee', 'fridge'].includes(a)), [...seen].join());
  assert.ok(seen.has('stretch') && (seen.has('coffee') || seen.has('fridge')));
  assert.ok(on * 3 < 7200 * 0.2, 'works most of the time');
  const p = L.planOffice([{ bot: 'Claude', status: 'working' }], [], NOW, 'live', { Claude: { stale: false } });
  assert.ok(['work', 'stretch', 'coffee', 'fridge'].includes(p.plans.Claude.act));
});

/* ---------- item 12: job flow ---------- */
test('job flow: walk to board (receive) -> desk (work) -> back to board (log) -> done', () => {
  let job = L.jobStart('w:1', 0); const seq = [[job.phase, L.jobGoal(job)]];
  const step = ctx => { const n = L.jobStep(job, ctx); job = n; if (n) seq.push([n.phase, L.jobGoal(n)]); return n; };
  assert.equal(L.jobStep(job, { arrived: false }), job, 'still walking: no change');
  assert.equal(L.jobStep(job, { arrived: true, heldFor: 1 }), job, 'must hold at the board a moment');
  step({ arrived: true, heldFor: L.JOB_HOLD_S, now: 5 });
  assert.equal(job.phase, 'work');
  assert.equal(L.jobStep(job, { arrived: true, heldFor: 99, finished: false, now: 60 }), job, 'works until finished');
  step({ finished: true, now: 90 });
  assert.equal(job.phase, 'log');
  assert.equal(L.jobStep(job, { arrived: false, finished: true }), job);
  assert.equal(step({ arrived: true, heldFor: L.JOB_HOLD_S }), null, 'logged: job complete');
  assert.deepEqual(seq, [['receive', 'board'], ['work', 'desk'], ['log', 'board']]);
  assert.deepEqual(L.JOB_PHASES, ['receive', 'work', 'log']);
});
test('job flow: a job that never reports finished still ends (work cap)', () => {
  const j = { itemId: 'x', phase: 'work', since: 0 };
  assert.equal(L.jobStep(j, { now: L.JOB_WORK_MAX_S + 1 }).phase, 'log');
  assert.deepEqual(L.JOB_ASSIGN_REASONS, ['new', 'reassigned', 'take']);
});

/* ---------- item 13: pool ---------- */
test('pool shot: ball rests, cue strikes, ball rolls and bounces inside the table, then resets', () => {
  assert.equal(L.poolShot(0).phase, 'aim');
  assert.ok(L.poolShot(2.5).stroke > 0 || L.poolShot(2.3).stroke < 0);
  const rest = L.poolShot(0).ball, moved = L.poolShot(4).ball;
  assert.ok(Math.hypot(moved.x - rest.x, moved.z - rest.z) > 0.3);
  for (let t = 0; t < 14; t += 0.05) { const b = L.poolShot(t).ball; assert.ok(Math.abs(b.x) <= L.POOL.halfW + 1e-9); }
  assert.deepEqual(L.poolShot(L.POOL.loop).ball, rest, 'loops');
});

/* ---------- item 14: expression blend ---------- */
test('expression blend: eases between states (not a snap), converges, and sleepy closes the lids', () => {
  let cur = L.exprParams('happy');
  cur = L.blendExpression(cur, 'worried', 1 / 60);
  assert.ok(cur.frown > 0 && cur.frown < 0.5, 'one frame in: partway, ' + cur.frown);
  assert.ok(cur.smile < 1 && cur.smile > 0.5);
  for (let i = 0; i < 120; i++) cur = L.blendExpression(cur, 'worried', 1 / 60);
  assert.deepEqual(cur, L.exprParams('worried'));
  const mid = L.blendExpression(L.exprParams('happy'), 'sleepy', 0.05);
  assert.ok(mid.lid > 0 && mid.lid < 1);
  assert.equal(L.blendExpression(null, 'neutral', 0.1).smile, 0.45, 'no current state: starts at the target');
});

/* ---------- item 15: blinking ---------- */
test('blinking: random 2-6.5 s apart, each blink ~0.16 s, seedable, all within 0..1', () => {
  const sim = seed => { const rng = L.makeRng(seed), b = L.createBlinker(rng, 0), starts = []; let prev = 0;
    for (let t = 0; t < 120; t += 1 / 60) { const a = L.blinkAmount(b, t, rng); assert.ok(a >= 0 && a <= 1); if (a > 0 && prev === 0) starts.push(t); prev = a; } return starts; };
  const s = sim(11);
  assert.ok(s.length >= 15 && s.length <= 60, 'blinks in 2 min: ' + s.length);
  const gaps = s.slice(1).map((v, i) => v - s[i]);
  assert.ok(gaps.every(g => g > 0.1 && g < 7), 'gaps ' + Math.max(...gaps));
  assert.ok(gaps.filter(g => g > 1.9).length >= gaps.length * 0.6, 'mostly spaced out; a few quick doubles');
  assert.deepEqual(sim(11), s); assert.notDeepEqual(sim(12), s);
  const rng = L.makeRng(1), b = L.createBlinker(rng, 0); b.at = 1;
  assert.equal(L.blinkAmount(b, 0.5, rng), 0);
  assert.ok(L.blinkAmount(b, 1 + L.BLINK_DUR / 2, rng) > 0.95, 'mid-blink the eyes are shut');
});
