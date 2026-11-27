// Office constraint wall: age/stale tag and reuse of the cockpit's constraint model. Run: node --test tests/office-constraint-wall.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { pathToFileURL } = require('url');
const L = require('../office/office-logic.js'), CR = require('../pipeline-control-room.js');
let D;
test.before(async () => {
  globalThis.window = { OfficeLogic: L };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-draw-'));
  for (const f of ['draw.js', 'avatars.js']) fs.copyFileSync(path.join(__dirname, '../office', f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  D = await import(pathToFileURL(path.join(dir, 'draw.js')).href);
});
function fakeCtx() {
  const texts = [];
  return { font: '', fillStyle: '', textAlign: 'left', texts,
    measureText(t) { const px = Number((/(\d+(?:\.\d+)?)px/.exec(this.font) || [0, 10])[1]); return { width: String(t).length * px * 0.55 }; },
    fillText(t, x, y) { texts.push({ t, x, y }); }, fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, save() {}, restore() {}, clip() {}, rect() {}, roundRect() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {} };
}

test('measured line is ET and goes stale after 30 minutes, on failure, or with no time', () => {
  const now = Date.parse('2026-11-16T22:00:00Z'), at = m => new Date(now - m * 60000).toISOString();
  const fresh = L.constraintAge(at(5), now); assert.match(fresh.text, /^measured \d{1,2}:\d{2} (AM|PM) ET$/); assert.equal(fresh.stale, false);
  assert.equal(L.constraintAge(at(31), now).stale, true);
  assert.equal(L.constraintAge(at(5), now, true).stale, true);
  assert.equal(L.constraintAge(undefined, now).stale, true);
  assert.equal(L.constraintAge(new Date(now + 60000).toISOString(), now).stale, true);
});
test('wall uses the cockpit summary shape (no second constraint calculation)', () => {
  assert.equal(typeof CR.summary, 'function');
  const d = L.demoConstraint();
  assert.deepEqual(Object.keys(d).sort(), Object.keys(CR.summary(CR.model({}), {})).filter(k => k in d).sort());
  const s = CR.summary(CR.model({}), {});
  assert.equal(s.stages.length, 4); assert.equal(s.waiting.length, 3);
  assert.ok(s.stages.every(x => !x.constraint)); // unknown evidence never marks a constraint
});

test('when ratesAsOf is present the wall shows as of h:mm ET, not STALE measured', () => {
  const now = Date.parse('2026-11-18T06:00:00Z'), at = '2026-11-18T05:03:00Z';
  const sum = Object.assign({}, L.demoConstraint(), { ratesAsOf: at, evidenceDelayed: true });
  const c = fakeCtx();
  D.drawConstraintWall(c, 1024, 512, { sum, age: L.constraintAge(at, now), err: '', demo: false });
  const texts = c.texts.map(x => x.t);
  assert.ok(texts.some(t => t === '· as of 12:03 AM ET'), 'as-of label: ' + JSON.stringify(texts.filter(t => /as of|STALE|measured/.test(String(t)))));
  assert.ok(!texts.some(t => /\? STALE · measured/.test(String(t))), 'does not keep the stale measured label');
});
test('without ratesAsOf a stale reading still shows STALE measured', () => {
  const now = Date.parse('2026-11-18T06:00:00Z'), at = '2026-11-18T05:03:00Z';
  const c = fakeCtx();
  D.drawConstraintWall(c, 1024, 512, { sum: L.demoConstraint(), age: L.constraintAge(at, now), err: '', demo: false });
  const texts = c.texts.map(x => x.t);
  assert.ok(texts.some(t => t === '? STALE · measured 12:03 AM ET'), 'stale measured label: ' + JSON.stringify(texts.filter(t => /as of|STALE|measured/.test(String(t)))));
});

test('stale feed keeps the last good numbers, labeled (P3 constraint wall)', () => {
  assert.equal(L.constraintHasNumbers(L.demoConstraint()), true);
  assert.equal(L.constraintHasNumbers(CR.summary(CR.model({}), {})), false);
  assert.equal(L.constraintHasNumbers(null), false);
  const sum = Object.assign({}, L.demoConstraint(), { ratesAsOf: '2026-11-18T05:03:00Z' });
  const c = fakeCtx();
  D.drawConstraintWall(c, 1024, 512, { sum, age: { text: 'feed stale', stale: true }, lastGood: true, err: 'HTTP 503' });
  const texts = c.texts.map(x => String(x.t));
  assert.ok(texts.includes('? STALE · last good measure · as of 12:03 AM ET'), JSON.stringify(texts.filter(t => /STALE|as of/.test(t))));
  assert.ok(texts.some(t => /^9\.1$/.test(t) || /9\.1/.test(t)), 'numbers still drawn');
  const js = require('fs').readFileSync(require('path').join(__dirname, '..', 'office', 'office.js'), 'utf8');
  assert.match(js, /if \(!L\.constraintHasNumbers\(sum\)\) return lastGood\(c\.err\);\n  c\.lastGood = sum;/);
});

test('last good stale banner stays above cards and footer on the constraint wall', () => {
  const now = Date.parse('2026-11-18T06:00:00Z'), at = '2026-11-18T05:03:00Z';
  const sum = Object.assign({}, L.demoConstraint(), { ratesAsOf: at, evidenceDelayed: true });
  const c = fakeCtx();
  D.drawConstraintWall(c, 1024, 512, { sum, age: L.constraintAge(at, now), err: '', demo: true, lastGood: true });
  const title = c.texts.find(x => x.t === 'PIPELINE CONSTRAINT');
  const stale = c.texts.find(x => String(x.t) === '? STALE · last good measure · as of 12:03 AM ET');
  assert.ok(title && stale, JSON.stringify(c.texts.map(x => x.t).filter(t => /PIPELINE CONSTRAINT|STALE|as of/.test(String(t)))));
  const titleBox = { x1: title.x, x2: title.x + 'PIPELINE CONSTRAINT'.length * 50 * 0.55, y1: title.y - 40, y2: title.y - 10 };
  const staleBox = { x1: stale.x - 1, x2: 1024 - 24, y1: stale.y - 26, y2: stale.y };
  assert.ok(titleBox.y2 <= staleBox.y1 || staleBox.y2 <= titleBox.y1, 'title/stale vertical overlap');
  assert.ok(titleBox.x2 <= staleBox.x1 || staleBox.x2 <= titleBox.x1, 'title/stale horizontal overlap');
  assert.equal(c.texts.filter(x => /STALE|Evidence refresh delayed/.test(x.t)).length, 1);
  assert.ok(stale.y < 104, 'stale banner baseline should be above stage cards: ' + stale.y);
  assert.ok(104 + 368 < 510, 'cards end before footer');
});

test('fresh load with flow older than 90 min keeps last numbers marked STALE (cs-5ae582a6)', () => {
  const now = Date.parse('2026-10-29T00:00:00Z'), at = new Date(now - 120 * 60000).toISOString();
  const f = {
    now,
    health: {
      ok: true,
      processFlow: {
        at,
        population: { total: 3, reconciled: true },
        queues: { verification: 0, enrichment: 2, readyForReview: 1, blockedClosed: 0 },
        completion: { enrichment: { available: true, perHour: 2.2, count36: 79, last24h: 50 } },
        upstream: {
          at, reconciled: true, total: 2, accounted: 2, waiting: 2,
          counts: { WAITING: 2, PRESENT: 0, EXCLUDED: 0, HELD: 0, IDENTITY_HOLD: 0, MISSING_PREVIOUSLY_PRESENT: 0 },
          rates: { discovery: { perHour: 9.1, available: true, unit: 'candidate identities' }, intake: { perHour: 4.1, available: true } }
        }
      }
    },
    master: { loaded: true, freshness: 'FRESH', rows: [] },
    activity: { ok: true, today: { writes: 0 } }
  };
  const sum = CR.summary(CR.model(f), {});
  assert.equal(sum.stale, true);
  assert.equal(sum.ratesAsOf, at);
  assert.equal(L.constraintHasNumbers(sum), true, 'fresh load has numbers, so the wall does not fall through to empty lastGood');
  assert.ok(sum.stages.some(st => st.constraint), 'constraint watch names a real constraint');
  assert.equal(sum.stages[2].perHour, 2.2);
  assert.equal(sum.waiting[1].count, 2);
  const js = fs.readFileSync(path.join(__dirname, '..', 'office', 'office.js'), 'utf8');
  assert.match(js, /lastGood:\s*!!sum\.stale/, 'wall uses the existing STALE style when the kept flow is stale');
  const c = fakeCtx();
  D.drawConstraintWall(c, 1024, 512, { sum, age: L.constraintAge(at, now), err: '', lastGood: !!sum.stale });
  const texts = c.texts.map(x => String(x.t));
  assert.ok(texts.some(t => /\? STALE/.test(t) && /as of/.test(t)), 'STALE + as-of: ' + JSON.stringify(texts.filter(t => /STALE|as of|Waiting|unavailable/.test(t))));
  assert.ok(texts.some(t => t === '2.2' || /2\.2/.test(t)), 'Enrichment rate still drawn: ' + JSON.stringify(texts.filter(t => /\d/.test(t)).slice(0, 12)));
  assert.ok(!texts.some(t => /Waiting for the pipeline feed|Pipeline feed unavailable|all Unknown/.test(t)));
});
