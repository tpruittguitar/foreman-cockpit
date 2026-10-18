/* Grok Bot · Oct 15 look pages (F02 r3 review). Scenario fixtures for M-02 / M-03 / M-04 and F01.
   Same rows, model rev 24 and scoreRow as tests/visual/fixture/build-fixture.cjs; three extra fictional rows.
   Run from this folder: node build-oct15.cjs  -> fx-base.json fx-agency.json fx-closed.json fx-applied.json */
'use strict';
const fs = require('fs'), path = require('path');
global.localStorage = { getItem: () => null, setItem: () => {} };
const Scoring = require('../../../pipeline-scoring.js');
const model = require('../fixture/model-rev24.json');
const src = fs.readFileSync(path.join(__dirname, '../fixture/build-fixture.cjs'), 'utf8');
const CITY = eval('(' + src.match(/const CITY = (\{[\s\S]*?\});/)[1] + ')');
const J = eval(src.match(/const J = (\[[\s\S]*?\n\]);/)[1]);
const golden = require('../fixture/fixture.json');
const FLEX = { High: 'HIGH_FLEX', Soft: 'SOFT_FLEX', No: 'NO_FLEX', Strict: 'STRICT', Unknown: 'UNKNOWN' };
const BUCKET = { NEEDS_DECISION: 'Needs decision', RESEARCH: 'Research', SCOUT_INTAKE: 'Scout intake', DISCOVERY_LEAD: 'Discovery lead', DECLINE_CANDIDATE: 'Decline candidate', APPLIED: 'Applied' };
// extra rows: [id,title,company,location,bucket,base,flex,fit,culture(null = no evidence),age,write,changed,stale, liveness, appliedEvidence]
const EXTRA = {
  agency: ['0588', 'Director of Manufacturing', 'Keystone Recruiting Group', 'Huntsville, AL', 'NEEDS_DECISION', 235, 'Soft', 74, null, '3h', '', 'NEW', false, 'OPEN', null],
  closed: ['0381', 'Director, Plant Engineering', 'Ironbark Battery', 'Knoxville, TN', 'NEEDS_DECISION', 220, 'High', 70, 90, '4d', '', '', false, 'CLOSED_EMPLOYER_ATS', null],
  applied: ['0431', 'Director, Assembly Operations', 'Cobalt Aerostructures', 'Huntsville, AL', 'APPLIED', 230, 'Soft', 78, 75, '3d', '', '', false, 'OPEN', 'EMAIL']
};
function score(row) {
  const [id, title, company, location, bucket, base, flex, fit, culture, age, write, changed, stale, live, appl] = row;
  const ll = CITY[location];
  const payload = { SCOPE_FIT_RAW: fit, FLEX_CLASS: FLEX[flex], SALARY_BASE_EST: '$' + base + ',000' };
  if (culture != null) payload.CULTURE_SCORE = culture;
  if (ll) { payload.LATITUDE = ll[0]; payload.LONGITUDE = ll[1]; }
  if (id === '0412') payload.ATS_MATCH_SCORE = 82;
  const s = Scoring.scoreRow({ TITLE: title, COMPANY: company, LOCATION: location, payload }, model);
  return { id: 'JOB-' + id, title, company, location, bucket, bucketLabel: BUCKET[bucket], baseK: base, flex: flex === 'Unknown' ? 'Unknown' : flex === 'Strict' ? 'Strict' : flex + ' flex',
    flexClass: FLEX[flex], expFit: fit, age, writeState: write, changed, staleEvidence: stale, lat: ll ? ll[0] : null, lon: ll ? ll[1] : null,
    liveness: live || 'OPEN', appliedEvidence: appl || null,
    score: s.overall, hold: s.band === 'STRICT HOLD', coverage: s.confidence, flexInfluence: s.flexInfluence, screenGate: s.screenGate,
    parts: Object.fromEntries(Object.entries(s.parts).map(([k, p]) => [k, { score: p.score, known: !!p.known, weight: p.weight || 0, basis: p.basis }])) };
}
function breakdown(r) {   // build-fixture.cjs logic (V-16 largest remainder to 0.1) + fix for rounding down
  const order = ['experience', 'flex', 'compensation', 'geo', 'title', 'culture', 'ats', 'ownership'];
  const known = order.filter(k => r.parts[k].known && r.parts[k].weight > 0);
  const avail = known.reduce((a, k) => a + r.parts[k].weight, 0);
  const factor = 0.7 + 0.3 * r.coverage / 100;
  const exact = order.map(k => (known.includes(k) ? r.parts[k].weight * r.parts[k].score / avail * factor : 0));
  const tenths = exact.map(v => Math.floor(v * 10)), target = r.score * 10;
  let rest = target - tenths.reduce((a, b) => a + b, 0);
  const rem = exact.map((v, i) => [v * 10 - tenths[i], i]).filter(([, i]) => known.includes(order[i]));
  // Grok Bot fix: the golden builder only adds tenths; when the ring rounds DOWN (raw x factor = 69.4 -> 69) the floors
  // already exceed the target and must lose tenths from the smallest remainders, or the rows sum past the ring (V-16).
  rem.slice().sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { tenths[i]++; rest--; } });
  rem.slice().sort((a, b) => a[0] - b[0]).forEach(([, i]) => { if (rest < 0 && tenths[i] > 0) { tenths[i]--; rest++; } });
  return order.map((k, i) => ({ key: k, weight: r.parts[k].weight, score: r.parts[k].known ? r.parts[k].score : null, known: r.parts[k].known, basis: r.parts[k].basis, points: tenths[i] / 10 }));
}
function build(name, extra, selectedId) {
  const rows = J.map(score);
  if (extra) rows.push(score(extra));
  // band population = eligible OPEN rows (not HOLD, not closed, not applied) — spec §3.1 / v1.5.1 §3
  const elig = r => !r.hold && r.score != null && r.liveness === 'OPEN' && r.bucket !== 'APPLIED';
  const pop = rows.filter(elig).map(r => r.score).sort((a, b) => a - b);
  const cut = q => pop[Math.min(pop.length - 1, Math.ceil(q * pop.length))];
  const cuts = { top: cut(0.90), upper: cut(0.65), low: cut(0.20) };
  rows.forEach(r => {
    if (r.hold) { r.band = 'HOLD'; return; }
    if (!elig(r)) { r.band = 'NONE'; r.rankNo = null; return; }
    r.band = r.score >= cuts.top ? 'TOP' : r.score >= cuts.upper ? 'UPPER' : r.score >= cuts.low ? 'MID' : 'LOW';
    r.rank = Math.round(pop.filter(v => v < r.score).length / pop.length * 100) / 100;
    r.rankNo = 1 + pop.filter(v => v > r.score).length;
  });
  rows.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
  rows.forEach((r, i) => { r.position = i + 1; });
  const sel = rows.find(r => r.id === selectedId);
  if (sel) { sel.breakdown = breakdown(sel); sel.breakdownFactor = Math.round((0.7 + 0.3 * sel.coverage / 100) * 1000) / 1000; }
  const queue = rows.filter(r => r.liveness === 'OPEN' && r.bucket !== 'APPLIED');
  const count = b => queue.filter(r => r.bucket === b).length;
  const out = Object.assign({}, golden, {
    note: golden.note + ' Scenario "' + name + '" built by tests/visual/oct15/build-oct15.cjs (Grok Bot).',
    bands: { n: pop.length, cuts }, selectedId: selectedId, rows: rows,
    counters: Object.assign({}, golden.counters, { reviewQueue: queue.length, needsDecision: count('NEEDS_DECISION'), declineCandidates: count('DECLINE_CANDIDATE') }),
    // L-2: values rev3 typed into F02-job-selected.js, moved to fixture fields (the app must supply each one)
    oct15: {
      writer: { state: 'LOCK BUSY', refreshS: 42, buildPr: 121, buildCommit: 'e7389ed', deployedAt: '18 Oct 17:38', buildRev: 'REV-017', buildSubject: 'State-write fix: Writer merges explorer state, never overwrites (includes REV-016 tests)', pageCommit: 'e7389ed' },
      seenSync: { state: 'OK', at: '23:41' }, lanes: { n: 10, quiet: 0, unfinished: 0 },
      receipts: { wait: { action: 'Pursue', attempt: 2, of: 4, nextS: 15, waitS: 8 }, ok: { action: 'Hold', readbackS: 3 }, fail: { action: 'Hold', retries: 4 } },
      selected: { workMode: 'hybrid', source: 'LinkedIn', computedAt: '23:38', changeEvidence: 'salary posted' },
      closed: { at: '18 Oct', method: 'CLOSED_EMPLOYER_ATS', provider: 'Greenhouse', checkedAt: '18 Oct 09:12' },
      applied: { at: '16 Oct 2026', evidence: 'EMAIL', subject: 'Thank you for applying – Director, Assembly Operations', from: 'careers@cobaltaero.example', received: '16 Oct 09:42', supersededDecision: 'Decline', supersededAt: '15 Oct' }
    }
  });
  fs.writeFileSync(path.join(__dirname, 'fx-' + name + '.json'), JSON.stringify(out, null, 1) + '\n');
  const bc = {}; rows.forEach(r => { bc[r.band] = (bc[r.band] || 0) + 1; });
  console.log(name, 'rows', rows.length, 'queue', queue.length, 'N', pop.length, JSON.stringify(cuts), JSON.stringify(bc),
    sel ? sel.id + ' ' + sel.score + ' ' + sel.band + ' #' + sel.rankNo + ' cov ' + sel.coverage + ' Σ ' + sel.breakdown.reduce((a, b) => a + b.points, 0).toFixed(1) + ' ' + JSON.stringify(sel.breakdown.map(b => b.key + ':' + b.points + (b.known ? '' : '?'))) + ' culture: ' + sel.parts.culture.basis : '');
}
build('base', null, 'JOB-0412');
build('agency', EXTRA.agency, 'JOB-0588');
build('closed', EXTRA.closed, 'JOB-0381');
build('applied', EXTRA.applied, 'JOB-0431');
