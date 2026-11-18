// Couch nap redo (QA on #388): lying bots rest on each seat's own cushion top, sit in front of the backrest and fit
// between the armrests, on the couch, the futon and the sectional. Run: node --test tests/office-nap-fit.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
const EPS = 1e-9;
// nap sofas as built in office.js: sofa(cx, cz, rotY, len, kind, napOK, yScale)
const SEATS = { couch: L.napSeat(2.2, 1), futon: L.napSeat(2.0, 0.85), sectional: L.napSeat(3.0, 1) };
const BODIES = [
  { name: 'President', halfW: 0.27, halfD: 0.2, top: 1.45 },
  { name: 'slim', halfW: 0.2, halfD: 0.15, top: 0.9 },
  { name: 'typical', halfW: 0.32, halfD: 0.25, top: 1.1 },
  { name: 'chubby', halfW: 0.45, halfD: 0.4, top: 1.2 },
  { name: 'max', halfW: 0.5, halfD: 0.45, top: 1.45 }
];

test('lie height comes from each seat\'s own cushion top (couch 0.50 m, futon 0.425 m)', () => {
  assert.ok(Math.abs(SEATS.couch.top - 0.50) < EPS); assert.ok(Math.abs(SEATS.futon.top - 0.425) < EPS);
  for (const [k, seat] of Object.entries(SEATS)) for (const c of BODIES) {
    const f = L.napFit(c, seat);
    assert.ok(Math.abs(f.lieY - f.halfW - seat.top) < EPS, `${c.name} on ${k}: body bottom ${f.lieY - f.halfW} = cushion top ${seat.top}`);
  }
});
test('the lying body is centred on the seat area in front of the backrest', () => {
  for (const [k, seat] of Object.entries(SEATS)) {
    assert.ok(Math.abs(seat.front - 0.11) < EPS, k + ': seat centre 0.11 m in front of the sofa centre line');
    for (const c of BODIES) {
      const f = L.napFit(c, seat), back = -seat.front + f.halfD, front = -seat.front - f.halfD;
      assert.ok(back <= L.NAP_BACKREST + EPS, `${c.name} on ${k}: back ${back} stays in front of the backrest at ${L.NAP_BACKREST}`);
      assert.ok(front >= -L.NAP_SEAT_FRONT - EPS, `${c.name} on ${k}: front ${front} stays on the seat`);
    }
  }
});
test('every lying body fits between the armrests, President included; bodies that already fit keep full size', () => {
  for (const [k, seat] of Object.entries(SEATS)) for (const c of BODIES) {
    const f = L.napFit(c, seat);
    assert.ok(f.span[0] >= -seat.inner / 2 - EPS && f.span[1] <= seat.inner / 2 + EPS, `${c.name} on ${k}: [${f.span}] inside ±${seat.inner / 2}`);
    assert.ok(f.len <= seat.inner + EPS);
    if (c.top <= seat.inner - 2 * L.NAP_MARGIN && c.halfD <= seat.depth / 2 - L.NAP_MARGIN) assert.equal(f.scale, 1, `${c.name} on ${k} keeps full size`);
  }
  const p = L.napFit(BODIES[0], SEATS.futon); assert.equal(p.scale, 1, 'President fits the futon once centred'); assert.ok(Math.abs(p.span[0] + 0.725) < EPS);
});
test('office.js builds the nap seats from the same geometry and exposes the force-nap hook', () => {
  assert.match(office, /add\(box\(depth - 0\.24, 0\.12, len - 0\.4\), MAT\.cushion, -0\.1, 0\.44, 0, g\)/, 'cushion top 0.50 m, front edge 0.45 m');
  assert.match(office, /add\(box\(0\.22, 0\.72, len\), MAT\.fabric, depth \/ 2 - 0\.11, 0\.5, 0, g\)/, 'backrest front 0.23 m behind the centre');
  assert.match(office, /add\(box\(depth, 0\.5, 0\.18\), MAT\.fabric, 0, 0\.3, s \* \(len \/ 2 - 0\.09\), g\)/, '0.18 m armrests');
  assert.match(office, /sofa\(9\.6, 4\.6, Math\.PI \/ 2, 2\.0, 'futon', true, 0\.85\)/, 'futon passes its 0.85 height scale');
  assert.match(office, /seat = L\.napSeat\(len, yScale\)/);
  assert.match(office, /T\.forceNap = \(n, w\) =>/);
});
