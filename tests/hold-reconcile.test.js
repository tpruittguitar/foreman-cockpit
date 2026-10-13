// Batch 2026-10-13-D: a HOLD__ request whose RESULT exists is moved out of the queue by the Writer itself.
const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../apps-script/Automation.gs');
function folder(name) {
  const files = new Map(), it = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const f = { name, files,
    getFiles: () => it([...files.values()]),
    getFilesByName: n => it(files.has(n) ? [files.get(n)] : []),
    add(n, opts = {}) { const file = { name: n, id: 'id-' + n, parent: f,
      getName: () => file.name, getId: () => file.id,
      setName: x => { files.delete(file.name); file.name = x; files.set(x, file); return file; },
      moveTo: dest => { if (opts.moveFails) throw new Error('Drive transient error'); files.delete(file.name); file.parent = dest; dest.files.set(file.name, file); } };
      files.set(n, file); return file; } };
  return f;
}
function world() { return { queue: folder('queue'), processed: folder('processed'), failed: folder('failed') }; }
const REQ = 'FORGE_GOFER_CLAUDE_20261012_TIM_03_hitachi_R0109990_applied.json';
const RES = 'RESULT__FORGE_GOFER_CLAUDE_20261012_TIM_03_hitachi_R0109990_applied.json';

test('held request with a SUCCESS result moves to processed under its original name', () => {
  const f = world(); f.processed.add(RES); f.queue.add('HOLD__' + REQ);
  const r = A.reconcileHolds_(f);
  assert.equal(r.moved.length, 1); assert.equal(r.moved[0].movedTo, 'processed');
  assert.ok(f.processed.files.has(REQ)); assert.equal(f.queue.files.size, 0);
});
test('held request whose result is in failed goes to failed', () => {
  const f = world(); f.failed.add(RES); f.queue.add('HOLD__' + REQ);
  const r = A.reconcileHolds_(f);
  assert.equal(r.moved[0].movedTo, 'failed'); assert.ok(f.failed.files.has(REQ));
});
test('held request with no RESULT stays held (real anomaly keeps the warning)', () => {
  const f = world(); f.queue.add('HOLD__' + REQ);
  const r = A.reconcileHolds_(f);
  assert.equal(r.moved.length, 0); assert.equal(r.kept.length, 1); assert.ok(f.queue.files.has('HOLD__' + REQ));
});
test('a move that fails again restores the HOLD__ name', () => {
  const f = world(); f.processed.add(RES); f.queue.add('HOLD__' + REQ, { moveFails: true });
  const r = A.reconcileHolds_(f);
  assert.equal(r.moved.length, 0); assert.match(r.kept[0].reason, /move failed again/); assert.ok(f.queue.files.has('HOLD__' + REQ));
});
test('pending and RESULT files in the queue are left alone', () => {
  const f = world(); f.queue.add('PENDING_REQ.json'); f.queue.add('RESULT__X.json');
  const r = A.reconcileHolds_(f);
  assert.equal(r.checked, 0); assert.equal(f.queue.files.size, 2);
});
