const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const L = require('../office/office-logic.js');
let drawDesk;

test.before(async () => {
  globalThis.window = { OfficeLogic: L };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-draw-'));
  for (const f of ['draw.js', 'avatars.js']) fs.copyFileSync(path.join(__dirname, '../office', f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  ({ drawDesk } = await import(pathToFileURL(path.join(dir, 'draw.js')).href));
});

function canvasStub() {
  const calls = [];
  const ctx = new Proxy({ calls }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return text => ({ width: String(text || '').length * 10 });
      if (prop === 'roundRect') return () => {};
      if (['beginPath', 'fill', 'stroke', 'save', 'restore', 'clip', 'fillRect', 'arc', 'moveTo', 'lineTo', 'rect', 'translate', 'rotate', 'scale', 'drawImage', 'closePath'].includes(prop)) return () => {};
      if (prop === 'fillText') return t => calls.push(String(t));
      if (prop === 'setLineDash') return () => {};
      return undefined;
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
  return { ctx, calls };
}

const officeJs = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
const NOW = Date.parse('2026-11-17T15:00:00Z');
const frozen = {
  bot: 'QA', bot_id: 'qa-1', status: 'idle', task: 'ITEM 17',
  last_action: '#392 merged; #313 desk fix in checks', last_action_at: '2026-11-16T14:57:33Z',
  screen: { title: 'office-v3', lines: ['office-v3 9d ago'], updated_at: '2026-11-16T01:47:00-05:00' },
  updated_at: '2026-11-16T14:57:33Z', question: 'stale'
};

test('office.js wires liveDeskBot', () => {
  assert.match(officeJs, /L\.liveDeskBot\s*\(/);
  assert.match(officeJs, /bot:\s*deskBot/);
});

test('liveDeskBot prefers live items over stale row text', () => {
  const items = [{ id: 'i1', title: 'Live card for QA', priority: 'P2', status: 'in_progress', owner: 'QA', note: 'working now', updated_at: '2026-11-17T14:44:00Z' }];
  const b = L.liveDeskBot(frozen, items, NOW, { items });
  assert.equal(b.task, 'Live card for QA');
  assert.equal(b.status, 'working');
  assert.equal(b.screen, null);
  assert.equal(b.last_action, 'working now');
  assert.equal(b.last_action_at, '2026-11-17T14:44:00Z');
});

test('liveDeskBot cleans idle stale rows', () => {
  const b = L.liveDeskBot(frozen, [], NOW, { items: [] });
  assert.equal(b.task, 'Idle — no active card');
  assert.equal(b.status, 'idle');
  assert.equal(b.screen, null);
  assert.equal(b.last_action, 'Idle');
  assert.equal(b.last_action_at, '');
  assert.equal(b.question, '');
});

test('liveDeskBot uses fresh last_signal', () => {
  const row = { ...frozen, last_signal: { source: 'signal ping', at: '2026-11-17T14:58:00Z' }, updated_at: '2026-11-17T14:58:00Z' };
  const b = L.liveDeskBot(row, [], NOW, { items: [] });
  assert.equal(b.status, 'working');
  assert.equal(b.last_action, 'signal ping');
  assert.equal(b.last_action_at, '2026-11-17T14:58:00Z');
});

test('drawDesk does not render stale frozen desk text', () => {
  const { ctx, calls } = canvasStub();
  const b = L.liveDeskBot(frozen, [{ id: 'i1', title: 'Live card for QA', priority: 'P2', status: 'in_progress', owner: 'QA', note: 'working now', updated_at: '2026-11-17T14:44:00Z' }], NOW, { items: [] });
  drawDesk(ctx, 640, 360, { bot: b, now: NOW, items: [], demo: false, frozen: false, mode: 'terminal', image: null, screenWhy: '', offline: false, usageRows: [], allItems: [] });
  const out = calls.join('\n');
  assert.match(out, /Live card for QA/);
  assert.match(out, /1[5-9]m ago|2[0-3]m ago/);
  for (const bad of ['ITEM 17', '#392', 'office-v3', '9d ago']) assert.equal(out.includes(bad), false);
});
