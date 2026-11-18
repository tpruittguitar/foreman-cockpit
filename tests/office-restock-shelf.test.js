// Warehouse Monster shelf: restock trip goes shelf first, then the fridge carrying a case. Run: node --test tests/office-restock-shelf.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
const chars = fs.readFileSync(path.join(__dirname, '../office/chars.js'), 'utf8');

test('restock_fridge: shelf first (key restock:shelf:, no case), then the fridge carrying the case', () => {
  const at = office.indexOf("case 'restock_fridge':"), body = office.slice(at, office.indexOf("case 'pool':", at));
  assert.match(body, /if \(!c\.shelfPicked\) \{ const g = slotted\(\['shelf'\]\)[^\n]*key: 'restock:shelf:' \+ g\.key, pose: 'walk', box: false/);
  assert.match(body, /slotted\(\['fridge'\]\)[^\n]*key: 'restock:' \+ g\.key, pose: g\.spot\.kind === 'fridge' \? 'restock' : g\.pose, box: !c\.restocked/);
  assert.ok(body.indexOf("slotted(['shelf'])") < body.indexOf("slotted(['fridge'])"));
});
test('the shelf pickup takes one case and re-goals to the fridge; the fridge fill clears it; a non-restock goal resets it', () => {
  assert.match(office, /goal\.key\.startsWith\('restock:shelf:'\) && c\.arrived && clock - c\.arrivedAt > 1\.4 && !c\.shelfPicked\) \{ c\.shelfPicked = true; shelfStock = L\.shelfTake\(shelfStock\); layoutCans\(lastDeskCans\); c\.goalKey = ''; \}/);
  assert.match(office, /goal\.pose === 'restock'[^\n]*fridgeStock = L\.FRIDGE_CAP;[^\n]*c\.shelfPicked = false;/);
  assert.match(office, /if \(!g\.key\.startsWith\('restock:'\)\) \{ c\.restocked = false; c\.shelfPicked = false; \}/);
  assert.match(office, /shelfRefill \+= dt; if \(shelfRefill > L\.SHELF_REFILL_S\) \{[^\n]*L\.shelfAutoRefill\(shelfStock\)/);
  assert.match(office, /shelfCaseMeshes\.forEach\(\(g, k\) => \{ g\.visible = k < shelfStock; \}/, 'shelf stock is drawn as case meshes');
});
test('shelf stock helpers count cases', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '../office/office-logic.js'), 'utf8'), /Shelf stock counts cases/);
  assert.equal(L.SHELF_CAP, 10); assert.equal(L.SHELF_REFILL_S, 180);
  assert.equal(L.shelfTake(3), 2); assert.equal(L.shelfTake(0), 0);
  assert.equal(L.shelfAutoRefill(9), 10); assert.equal(L.shelfAutoRefill(10), 10);
});
test('the carried restock item is a Monster-green case, and the shelf uses the same case', () => {
  assert.match(chars, /export function makeCase\(\)/);
  assert.match(chars, /c\.box = makeCase\(\);/);
  assert.match(chars, /color: 0x1e8c14/);
  assert.doesNotMatch(chars, /plain cardboard|mat\('cardboard'/);
  assert.match(office, /makeCase/);
  assert.match(office, /const shelfCaseMeshes = shelfCases\.map\(\(\[x, y, z\], k\) => \{ const g = makeCase\(\)/);
  assert.doesNotMatch(office, /shelfCans/);
});
test('createNav: office-only grid unchanged without bounds; with bounds + door the warehouse is reached only through the doorway', () => {
  const base = { RW: 24, RD: 20, CELL: 0.2, inflate: 0.22, obstacles: [] };
  const a = L.createNav(base), f = (n, x, z) => n.free(...n.toCell(x, z));
  assert.ok(f(a, 11.4, 1.6)); assert.ok(!f(a, 11.8, 1.6));
  const n = L.createNav(Object.assign({ bounds: { x0: -12, x1: 48, z0: -27, z1: 27 }, door: { x: 12, z0: 0.1, z1: 3.1 } }, base));
  assert.ok(f(n, 11.4, 1.6) && f(n, 12, 1.6) && f(n, 13.25, 13.2), 'office, doorway and warehouse are walkable');
  assert.ok(!f(n, 12, -3) && !f(n, 12, 6), 'office right wall stays blocked outside the doorway');
  assert.ok(!f(n, 0, 12) && !f(n, -5, -15), 'nothing walkable outside the office on the office side');
  const pts = n.route({ x: 5, z: -5 }, { x: 13.25, z: 13.2 });
  assert.ok(pts.length); let prev = { x: 5, z: -5 };
  for (const p of pts) { for (let k = 0; k <= 50; k++) { const x = prev.x + (p.x - prev.x) * k / 50, z = prev.z + (p.z - prev.z) * k / 50; assert.ok(f(n, x, z), 'route leg stays on free cells at ' + x + ',' + z); } prev = p; }
});
