// Office: the 16 Grok Bots studio faces ported to the slot-eye bots, their situation mapping and the look / move idle motions.
// Run: node --test tests/office-studio-expressions.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const IDS = ['neutral', 'attentive', 'surprised', 'excited', 'happy', 'laughing', 'angry', 'sad', 'scared', 'suspicious', 'confused', 'curious', 'proud', 'shy', 'unimpressed', 'sleepy'];
const FR = ['neutre', 'attentif', 'surpris', 'excite', 'heureux', 'hilare', 'colere', 'triste', 'effraye', 'mefiant', 'confus', 'curieux', 'fier', 'timide', 'blase', 'somnolent'];

test('the table has exactly the 16 studio faces, in studio order, each with gaze, split and two eyes', () => {
  assert.deepEqual(L.STUDIO_FACES.map(f => f.id), IDS);
  assert.deepEqual(L.STUDIO_FACES.map(f => f.fr), FR);
  for (const f of L.STUDIO_FACES) {
    assert.ok(['yaw', 'pitch', 'roll'].every(k => Number.isFinite(f.gaze[k])), f.id + ' gaze');
    assert.ok(f.split > 10 && f.split < 25, f.id + ' split');
    assert.equal(f.eyes.length, 2);
    for (const e of f.eyes) { assert.ok(e.w > 0.1 && e.w < 0.5 && e.h > 0.1 && e.h < 0.7, f.id + ' size'); assert.ok(e.open > 0 && e.open <= 1); assert.ok(Number.isFinite(e.tilt)); }
  }
});

test('studio values: spot checks against the studio definitions', () => {
  const f = id => L.STUDIO_FACES.find(x => x.id === id);
  assert.deepEqual(f('neutral').eyes.map(e => [e.w, e.h]), [[0.186, 0.412], [0.186, 0.412]]);
  assert.deepEqual(f('angry').eyes.map(e => e.tilt), [30, -30]);
  assert.deepEqual(f('sad').eyes.map(e => e.tilt), [-28, 28]);
  assert.equal(f('sleepy').eyes[0].open, 0.01);
  assert.deepEqual(f('suspicious').eyes.map(e => e.h), [0.4, 0.15], 'one eye narrowed');
  assert.deepEqual(f('confused').eyes.map(e => e.tilt), [-18, 14], 'mismatched');
  assert.equal(f('scared').gaze.pitch, -20);
  assert.equal(f('curious').gaze.roll, -15);
});

test('every face is an EXPR entry with the same weight keys, so blending works between any two', () => {
  const keys = Object.keys(L.EXPR.happy).sort();
  for (const id of IDS.concat(['worried', 'puzzled'])) {
    assert.deepEqual(Object.keys(L.EXPR[id]).sort(), keys, id);
    assert.ok(Object.values(L.EXPR[id]).every(Number.isFinite), id);
  }
  for (const a of IDS) for (const b of IDS) {
    let cur = L.exprParams(a);
    for (let i = 0; i < 200; i++) cur = L.blendExpression(cur, b, 1 / 60);
    assert.deepEqual(cur, L.exprParams(b), a + ' -> ' + b);
  }
});

test('blend passes through intermediate eye shapes (not a snap)', () => {
  const mid = L.blendExpression(L.exprParams('neutral'), 'surprised', 0.03);
  assert.ok(mid.e0w > 0.186 && mid.e0w < 0.45);
  assert.ok(mid.gyaw < L.EXPR.neutral.gyaw && mid.gyaw > L.EXPR.surprised.gyaw);
});

test('slot eyes stay slot-shaped and on the body: sizes map to a bounded stadium, gaze shift is capped', () => {
  const n = L.slotSize(0.186, 0.412);
  assert.ok(Math.abs(n.w - 0.068) < 1e-9 && Math.abs(n.h - 0.2) < 1e-9, 'neutral = the existing slot');
  for (const id of IDS) for (const k of [0, 1]) {
    const s = L.slotSize(L.EXPR[id]['e' + k + 'w'], L.EXPR[id]['e' + k + 'h']);
    assert.ok(s.w >= 0.03 && s.w <= 0.2 && s.h >= 0.03 && s.h <= 0.34, id + ' eye ' + s.w + 'x' + s.h);
  }
  for (const id of IDS) {
    const g = L.gazeShift(L.EXPR[id], { yaw: 8, pitch: 6, roll: 4 });
    assert.ok(Math.abs(g.x) <= 0.02 + 1e-12 && Math.abs(g.y) <= 0.02 + 1e-12, id + ' shift capped');
    assert.ok(g.spread > 0.7 && g.spread < 1.5, id + ' spread');
  }
});

test('situation mapping', () => {
  const f = c => L.exprFor(c);
  assert.equal(f({ pose: 'type', name: 'A' }), 'attentive', 'working');
  assert.equal(f({ pose: 'board', name: 'A' }), 'attentive');
  assert.equal(f({ pose: 'type', name: 'A', status: 'working' }), 'attentive');
  assert.equal(f({ pose: 'sit', name: 'A', mergedRecently: true, t: 0 }).match(/proud|excited/) !== null, true, 'PR merged');
  assert.equal(f({ pose: 'type', status: 'failed', name: 'A' }), 'angry');
  assert.equal(f({ pose: 'type', status: 'blocked', name: 'A' }), 'sad');
  assert.ok(['suspicious', 'confused'].includes(f({ pose: 'wave', needsTim: true, name: 'A' })), 'waiting on Tim');
  assert.ok(['suspicious', 'confused'].includes(f({ pose: 'wave', needsTim: true, name: 'B' })));
  assert.equal(f({ pose: 'nap', name: 'A' }), 'sleepy');
  assert.equal(f({ pose: 'deskSleep', name: 'A' }), 'sleepy');
  assert.ok(['neutral', 'happy', 'laughing'].includes(f({ pose: 'talk', ambient: 'chat', name: 'A', t: 1 })), 'chatting with brief reactions');
  assert.equal(f({ pose: 'stand', name: 'A', failed: true }), 'scared', 'errors');
  assert.equal(f({ pose: 'stand', name: 'A', near: true }), 'shy');
  assert.equal(f({ pose: 'type', name: 'A', greeted: true }), 'shy', 'greeted beats working');
  assert.equal(f({ pose: 'stand', name: 'A', surprised: true }), 'surprised');
  assert.ok(['neutral', 'unimpressed'].includes(f({ pose: 'sit', name: 'A', stale: true })), 'stale data with a brief reaction');
  assert.equal(f({ pose: 'game', name: 'A' }), 'excited');
  assert.ok(['curious', 'neutral'].includes(f({ pose: 'stand', name: 'A', t: 5 })), 'idle');
  assert.equal(f({ pose: 'lounge', name: 'A' }), 'neutral');
});

test('mapping is deterministic, always yields a real face, and idle alternates curious / neutral over time', () => {
  const poses = ['stand', 'walk', 'sit', 'type', 'game', 'meet', 'deskSleep', 'nap', 'lounge', 'bike', 'wave', 'pool', 'coffee', 'fridge', 'talk', 'board', 'stretch', 'restock', 'frozen', 'weird'];
  for (const pose of poses) for (let t = 0; t < 100; t += 7) {
    const c = { pose, name: 'Gauge', t }, a = L.exprFor(c);
    assert.ok(L.EXPR[a], pose + ' -> ' + a); assert.equal(L.exprFor(c), a);
  }
  const seen = new Set(); for (let t = 0; t < 200; t += 3) seen.add(L.exprFor({ pose: 'stand', name: 'Gauge', t }));
  assert.deepEqual([...seen].sort(), ['curious', 'neutral']);
  assert.ok(L.exprFor({}) in L.EXPR);
});

test('the mapping uses most of the 16 faces overall', () => {
  const used = new Set();
  const ctxs = [{ pose: 'type' }, { pose: 'type', status: 'failed' }, { pose: 'type', status: 'blocked' }, { pose: 'wave', needsTim: true }, { pose: 'nap' }, { pose: 'talk', ambient: 'chat' }, { failed: true }, { near: true },
    { surprised: true }, { stale: true }, { pose: 'game' }, { pose: 'stand' }, { pose: 'lounge' }, { mergedRecently: true }, { pose: 'pool' }, { pose: 'coffee' }];
  for (const c of ctxs) for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) for (let t = 0; t < 60; t += 5) used.add(L.exprFor(Object.assign({ name, t }, c)));
  assert.equal(used.size, 16, [...used].join());
});

test('mergedRecently and failedPr read the data the page holds', () => {
  const items = [{ owner: 'Edgar', link: 'https://github.com/o/r/pull/7' }, { owner: 'Gauge', link: 'https://github.com/o/r/pull/8' }];
  const now = Date.parse('2026-11-17T12:00:00Z');
  const states = new Map([['o/r#7', 'merged'], ['o/r#8', 'open']]), times = new Map([['o/r#7', '2026-11-17T11:50:00Z'], ['o/r#8', '2026-11-17T11:59:00Z']]);
  assert.equal(L.mergedRecently('Edgar', items, states, times, now), true);
  assert.equal(L.mergedRecently('Gauge', items, states, times, now), false);
  assert.equal(L.mergedRecently('Edgar', items, states, times, now + 3 * 3600000), false, 'old merges stop counting');
  assert.equal(L.mergedRecently('Nobody', items, states, times, now), false);
  assert.equal(L.mergedRecently('Edgar', [], null, null, now), false);
  const pulls = [{ url: 'https://github.com/o/r/pull/8', checks: 'failing' }, { url: 'https://github.com/o/r/pull/7', checks: 'passing' }];
  assert.equal(L.failedPr('Gauge', items, pulls), true);
  assert.equal(L.failedPr('Edgar', items, pulls), false);
  assert.equal(L.failedPr('Gauge', items, []), false);
});

test('look animation: the gaze drifts smoothly, stays small, never freezes, and is seedable', () => {
  let prev = L.gazeWander(0, 3), maxYaw = 0, moved = 0;
  for (let t = 0.05; t < 120; t += 0.05) {
    const w = L.gazeWander(t, 3);
    assert.ok(Math.abs(w.yaw - prev.yaw) < 1.5 && Math.abs(w.pitch - prev.pitch) < 1.5, 'smooth');
    maxYaw = Math.max(maxYaw, Math.abs(w.yaw)); if (Math.abs(w.yaw - prev.yaw) > 1e-4) moved++;
    assert.ok(Math.abs(w.pitch) < 7 && Math.abs(w.roll) < 3 && Math.abs(w.breath - 1) < 0.01);
    prev = w;
  }
  assert.ok(maxYaw > 2 && maxYaw < 9 && moved > 2000);
  assert.deepEqual(L.gazeWander(5, 3), L.gazeWander(5, 3));
  assert.notDeepEqual(L.gazeWander(5, 3), L.gazeWander(5, 4));
  assert.equal(L.gazeWander(5, 3, 0).yaw, 0, 'amount 0 = still');
});

test('move fidgets: staggered per bot, about two thirds of slots, every kind appears, poses stay bounded and return to rest', () => {
  const kinds = new Set(); let active = 0, total = 0;
  for (const name of ['A', 'B', 'C', 'D', 'E']) for (let t = 0; t < 3000; t += 0.1) { total++; const f = L.fidgetAt(t, name); if (f) { active++; kinds.add(f.kind); assert.ok(f.u >= 0 && f.u <= 1); } }
  assert.deepEqual([...kinds].sort(), L.FIDGETS.map(f => f.kind).sort());
  assert.ok(active / total > 0.05 && active / total < 0.5, 'fraction ' + active / total);
  assert.notDeepEqual(Array.from({ length: 50 }, (_, i) => !!L.fidgetAt(i * 0.7, 'A')), Array.from({ length: 50 }, (_, i) => !!L.fidgetAt(i * 0.7, 'B')));
  assert.deepEqual(L.fidgetPose(null), { yaw: 0, pitch: 0, roll: 0, wink: 0, eyeScale: 1, sy: 1, sxz: 1, hop: 0, turn: 0, tilt: 0 });
  for (const fd of L.FIDGETS) for (let u = 0; u <= 1.0001; u += 0.05) {
    const z = L.fidgetPose({ kind: fd.kind, u: Math.min(1, u), dur: fd.dur });
    assert.ok(z.sy > 0.8 && z.sy < 1.1 && z.eyeScale >= 1 && z.eyeScale < 1.6 && z.wink >= 0 && z.wink <= 1 && z.hop >= 0 && z.hop < 0.07, fd.kind + ' u=' + u);
    assert.ok(Math.abs(z.sxz * Math.sqrt(z.sy) - 1) < 1e-9, 'volume kept: ' + fd.kind);
    if (u === 0) assert.ok(Math.abs(z.sy - 1) < 0.05 && z.wink === 0 && Math.abs(z.turn) < 1e-9, fd.kind + ' starts at rest');
  }
  const end = L.fidgetPose({ kind: 'spin', u: 1, dur: 2.2 });
  assert.ok(Math.abs(end.turn - Math.PI * 2) < 1e-9, 'a spin is one full turn');
  assert.equal(L.fidgetPose({ kind: 'wink', u: 0.5 }).wink, 1);
});

test('old names still work: happy, neutral, worried, puzzled, sleepy keep their overlay weights', () => {
  assert.equal(L.exprParams('neutral').smile, 0.45);
  assert.equal(L.exprParams('worried').worry, 1);
  assert.equal(L.exprParams('puzzled').puzzle, 1);
  assert.ok(L.exprParams('sleepy').lid === 1);
  assert.deepEqual(L.exprParams('nonsense'), L.exprParams('neutral'));
});

test('sleep poses close the eyes (jelly slot eyes and President) and waking reopens them', () => {
  const settle = (face, ms) => { let cur = L.exprParams('neutral'); for (let i = 0; i < ms; i++) cur = L.blendExpression(cur, face, 1 / 60); return cur; };
  for (const pose of ['nap', 'deskSleep']) {
    const sleeping = settle(L.exprFor({ pose, name: 'A' }), 120);
    assert.ok(sleeping.e0o <= 0.02);
    assert.ok(sleeping.e1o <= 0.02);
    assert.equal(sleeping.lid, 1, 'President lid weight fully closed: ' + pose);
  }
  const awake = settle(L.exprFor({ pose: 'stand', name: 'A', t: 0 }), 120);
  assert.ok(awake.e0o > 0.5 && awake.lid === 0, 'awake eyes open');
  let cur = settle('sleepy', 120);
  for (let i = 0; i < 120; i++) cur = L.blendExpression(cur, L.exprFor({ pose: 'stand', name: 'A', t: 0 }), 1 / 60);
  assert.ok(cur.e0o > 0.5 && cur.lid < 0.05, 'eyes reopen after waking');
});
