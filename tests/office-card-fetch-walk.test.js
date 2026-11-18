// Card fetch walks use real elapsed time (not a 0.1 s frame cap), the nearest
// board-edge pickup, and a plan label that matches the 3D action.
// Run: node --test tests/office-card-fetch-walk.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const L = require('../office/office-logic.js');

const office = fs.readFileSync(path.join(__dirname, '..', 'office', 'office.js'), 'utf8');
const SEAT_OFF = 0.72;
const BOARD_Z = -20 / 2 + 1.1 + L.CLEARANCE;
const NAMES = ['Claude', 'Cursor', 'Comp', 'GUI', 'President', 'QA', 'HR', 'ChatGPT', 'Root', 'Usage', 'Writer', 'Sniffer', 'Gauge', 'Forge', 'Tim'];

test('a 1 s frame walks about WALK_MPS of ground, not the old 0.1 s cap', () => {
  const raw = 1, frames = 10;
  const oldCap = L.WALK_MPS * Math.min(0.1, raw) * frames;
  assert.ok(oldCap < 2, 'documents the 0.1 s cap: 10 s of 1 fps walking only covered 1.35 m');
  const path = [{ x: 100, z: 0 }], pos = { x: 0, z: 0 };
  for (let i = 0; i < frames; i++) L.walkAlong(pos, path, L.frameWalkDt(raw));
  const expect = L.WALK_MPS * L.frameWalkDt(raw) * frames;
  assert.ok(Math.abs(pos.x - expect) < 0.02, 'walked ' + pos.x + ' m, want ' + expect);
  assert.ok(expect >= L.WALK_MPS * 9, '1 fps still covers real time up to WALK_DT_MAX');
  assert.ok(L.WALK_MPS * L.WALK_DT_STEP <= 0.08, 'a substep is short enough not to jump through a wall');
  assert.equal(L.frameWalkDt(-1), 0);
  assert.equal(L.frameWalkDt(5), L.WALK_DT_MAX);
});

test('card-fetch round trip from every desk is 30 s or less at WALK_MPS, including 1 s frames', () => {
  const desks = L.deskLayout(NAMES.length, NAMES);
  const slots = L.boardSlots(16, -2, BOARD_Z, 8);
  assert.ok(slots.length >= 8);
  for (let i = 0; i < desks.length; i++) {
    const d = desks[i], seat = { x: d.x, z: d.z + SEAT_OFF }, name = NAMES[i];
    const near = L.nearestSlot(seat, slots);
    const hashed = slots[L.hash(name + 'board') % slots.length];
    const nearD = Math.hypot(near.x - seat.x, near.z - seat.z);
    const hashD = Math.hypot(hashed.x - seat.x, hashed.z - seat.z);
    assert.ok(nearD <= hashD + 1e-9, name + ' nearest ' + nearD + ' vs hash ' + hashD);
    const rt = L.cardFetchRoundTripS(seat, slots, L.WALK_MPS, L.JOB_HOLD_S);
    assert.ok(rt <= 30, name + ' straight RT ' + rt.toFixed(2) + ' s');
    const pos = { x: seat.x, z: seat.z }, out = [{ x: near.x, z: near.z }];
    let t = 0;
    while (out.length && t < 60) { L.walkAlong(pos, out, L.frameWalkDt(1)); t += 1; }
    t += L.JOB_HOLD_S;
    const home = [{ x: seat.x, z: seat.z }];
    while (home.length && t < 90) { L.walkAlong(pos, home, L.frameWalkDt(1)); t += 1; }
    assert.ok(Math.hypot(pos.x - seat.x, pos.z - seat.z) < 0.05, name + ' returned to desk');
    assert.ok(t <= 30, name + ' 1 fps fetch ' + t + ' s');
  }
});

test('plan text equals the 3D action, not a scheduled break that never started', () => {
  assert.equal(L.actionLabel({ key: 'seat:work', pose: 'type' }, 'type', 'fridge'), 'work');
  assert.equal(L.actionLabel({ key: 'stretch', pose: 'stretch' }, 'stretch', 'fridge'), 'stretch');
  assert.equal(L.actionLabel({ key: 'slot:fridge1', pose: 'fridge' }, 'walk', 'fridge'), 'fridge');
  assert.equal(L.actionLabel({ key: 'slot:fridge1', pose: 'fridge' }, 'fridge', 'fridge'), 'fridge');
  assert.equal(L.actionLabel({ key: 'job:cs-1:receive', pose: 'board' }, 'walk', 'work'), 'board');
  assert.equal(L.actionLabel({ key: 'job:cs-1:deliver', pose: 'sit' }, 'type', 'fridge'), 'work');
  assert.equal(L.actionLabel({ key: 'seat:work', pose: 'type' }, 'type', 'coffee'), 'work');
});

test('office.js walks on frameWalkDt, picks the nearest board slot, and labels from the 3D action', () => {
  assert.match(office, /dt = L\.frameWalkDt\(raw\)/);
  assert.doesNotMatch(office, /dt = Math\.max\(0, Math\.min\(0\.1, raw\)\)/);
  assert.match(office, /L\.walkAlong\(/);
  assert.match(office, /kinds\.includes\('board'\) \? L\.nearestSlot\(/);
  assert.match(office, /L\.actionLabel\(/);
  assert.match(office, /if \(raw > 0\) realRate \+= \(dt \/ raw - realRate\) \* 0\.05;/);
});
