/* Golden-frame fixture: one dataset for every frame (N-06). Scores come from the live scoring code
   (pipeline-scoring.js scoreRow) with the published model rev 24, never typed (L-2, N-01).
   Run: node tests/visual/fixture/build-fixture.cjs  -> writes tests/visual/fixture/fixture.json
   Job names are the fictional ones from Grok Bot's v1.5 mockup (PDF p40); scores differ from the drawing on purpose. */
'use strict';
const fs = require('fs'), path = require('path');
global.localStorage = { getItem: () => null, setItem: () => {} };
const Scoring = require('../../../pipeline-scoring.js');
const model = require('./model-rev24.json');

const CITY = {
  'Nashville, TN': [36.1627, -86.7816], 'Huntsville, AL': [34.7304, -86.5861], 'Cleveland, TN': [35.1595, -84.8766],
  'Chattanooga, TN': [35.0456, -85.3097], 'Knoxville, TN': [35.9606, -83.9207], 'Atlanta, GA': [33.749, -84.388],
  'Birmingham, AL': [33.5207, -86.8025], 'Charlotte, NC': [35.2271, -80.8431], 'Gulf Shores, AL': [30.246, -87.7008],
  'Raleigh, NC': [35.7796, -78.6382], 'Tampa, FL': [27.9506, -82.4572], 'Columbia, SC': [34.0007, -81.0348],
  'Dalton, GA': [34.7698, -84.9702], 'Savannah, GA': [32.0809, -81.0912], 'Louisville, KY': [38.2527, -85.7585],
  'Orlando, FL': [28.5384, -81.3789], 'Memphis, TN': [35.1495, -90.049], 'Greenville, SC': [34.8526, -82.394],
  'Columbus, OH': [39.9612, -82.9988], 'Chicago, IL': [41.8781, -87.6298], 'Montgomery, AL': [32.3792, -86.3077],
  'New York, NY': [40.7128, -74.006], 'Detroit, MI': [42.3314, -83.0458], 'Austin, TX': [30.2672, -97.7431],
  'Greensboro, NC': [36.0726, -79.792], 'Jackson, MS': [32.2988, -90.1848], 'Lexington, KY': [38.0406, -84.5037]
};
const FLEX = { High: 'HIGH_FLEX', Soft: 'SOFT_FLEX', No: 'NO_FLEX', Strict: 'STRICT', Unknown: 'UNKNOWN' };
// id, title, company, location, bucket, base $K, flex, exp fit, culture, age, write state, changed, stale evidence
const J = [
  ['0412', 'Director, Manufacturing Ops', 'Halvorsen Robotics', 'Nashville, TN', 'NEEDS_DECISION', 245, 'High', 74, 90, '2h', '', '+4', false],
  ['0398', 'Director, Production Ops', 'Cobalt Aerostructures', 'Huntsville, AL', 'NEEDS_DECISION', 230, 'Soft', 68, 75, '5h', 'WAITING', '', false],
  ['0405', 'Head of Production', 'Vantor Defense Systems', 'Cleveland, TN', 'NEEDS_DECISION', 260, 'High', 63, 60, '1h', '', 'NEW', false],
  ['0377', 'VP Operations', 'Ridgeline Composites', 'Chattanooga, TN', 'RESEARCH', 275, 'Unknown', 60, 75, '6h', '', '', true],
  ['0389', 'Plant Manager', 'Ironbark Battery', 'Knoxville, TN', 'NEEDS_DECISION', 210, 'High', 57, 90, '8h', 'CONFIRMED', '+3', false],
  ['0366', 'Sr. Dir., NPI & Scale-up', 'Tallgrass Motion', 'Atlanta, GA', 'NEEDS_DECISION', 250, 'No', 55, 75, '9h', '', '', true],
  ['0371', 'Director of Operations', 'Kestrel Microgrid', 'Remote (US)', 'RESEARCH', 235, 'Soft', 53, 60, '9h', '', '', false],
  ['0359', 'Head of Hardware Ops', 'Pinecrest Orbital', 'Birmingham, AL', 'NEEDS_DECISION', 240, 'High', 51, 60, '10h', '', '-3', false],
  ['0342', 'Dir., Factory Engineering', 'Quarry Fabrication', 'Charlotte, NC', 'RESEARCH', 225, 'Soft', 49, 40, '1d', '', '', false],
  ['0408', 'Production Director', 'Arclight Energy', 'Gulf Shores, AL', 'SCOUT_INTAKE', 205, 'Unknown', 48, 40, '3h', '', 'NEW', true],
  ['0336', 'Sr. Mgr., Mfg Excellence', 'Vantage Additive', 'Raleigh, NC', 'NEEDS_DECISION', 198, 'High', 46, 40, '1d', '', '', false],
  ['0331', 'Director, Supply & Mfg', 'Meridian Freight', 'Tampa, FL', 'RESEARCH', 230, 'Soft', 44, 40, '1d', '', '', false],
  ['0328', 'Ops Director, Assembly', 'Sablewood Manufacturing', 'Cleveland, TN', 'NEEDS_DECISION', 195, 'High', 41, 40, '1d', '', '+2', false],
  ['0325', 'Head of Operations', 'Lumen Grid Storage', 'Columbia, SC', 'NEEDS_DECISION', 220, 'No', 37, 60, '1d', '', '', false],
  ['0318', 'VP Mfg & Quality', 'Corvid Marine', 'Remote (US)', 'RESEARCH', 265, 'Strict', 33, 40, '2d', '', '', true],
  ['0314', 'Director, Ops Strategy', 'Harbor Point Rail', 'Atlanta, GA', 'NEEDS_DECISION', 215, 'Soft', 70, 40, '2d', '', '', false],
  ['0311', 'Plant Operations Lead', 'Elmstead Polymers', 'Dalton, GA', 'DISCOVERY_LEAD', 190, 'Unknown', 66, 40, '2d', '', '', false],
  ['0307', 'Mfg Program Director', 'Tidewell Avionics', 'Savannah, GA', 'NEEDS_DECISION', 225, 'High', 68, 60, '2d', '', '-5', false],
  ['0303', 'Director, Industrial Ops', 'Graniteworks', 'Louisville, KY', 'RESEARCH', 215, 'Soft', 67, 40, '2d', '', '', false],
  ['0299', 'Head of Fulfillment Ops', 'Northstar Parcel', 'Atlanta, GA', 'NEEDS_DECISION', 200, 'No', 64, 40, '2d', '', '', false],
  ['0296', 'Sr. Dir., Operations', 'Bayline Medical', 'Orlando, FL', 'NEEDS_DECISION', 240, 'Soft', 66, 60, '3d', '', '', true],
  ['0292', 'Ops Manager, Machining', 'Orbital Tooling', 'Memphis, TN', 'DECLINE_CANDIDATE', 170, 'High', 60, 40, '2d', '', '', false],
  ['0288', 'Director, Production Plan.', 'Kitehill Foods', 'Remote (US)', 'RESEARCH', 205, 'No', 62, 40, '3d', '', '', false],
  ['0285', 'Plant Manager', 'Kestrel Mfg', 'Greenville, SC', 'DECLINE_CANDIDATE', 185, 'No', 58, 40, '3d', '', '', false],
  ['0281', 'Dir., Mfg Engineering', 'Bluefin Hydraulics', 'Columbus, OH', 'DECLINE_CANDIDATE', 215, 'Soft', 64, 40, '3d', '', '', false],
  ['0277', 'Production Manager', 'Oakridge Cabinetry', 'Atlanta, GA', 'DECLINE_CANDIDATE', 160, 'Strict', 55, 40, '3d', '', '', false],
  ['0273', 'Operations Lead', 'Granger Plastics', 'Columbia, SC', 'SCOUT_INTAKE', 150, 'Unknown', 52, 40, '4d', '', '', false],
  ['0270', 'Head of Production', 'Wexley Industries', 'Chicago, IL', 'DECLINE_CANDIDATE', 270, 'No', 81, 40, '4d', '', '', false],
  ['0266', 'Ops Manager, Plant 2', 'Fernhill Paper', 'Montgomery, AL', 'DECLINE_CANDIDATE', 140, 'High', 50, 40, '4d', '', '', false],
  ['0262', 'Dir., Operations', 'Cindercone Labs', 'New York, NY', 'DECLINE_CANDIDATE', 290, 'Soft', 78, 40, '5d', '', '', false],
  // rows 31-50: in the queue, below the fold at 2560x1440
  ['0259', 'Director, Plant Operations', 'Ashgrove Metals', 'Greensboro, NC', 'NEEDS_DECISION', 225, 'High', 62, 60, '5d', '', '', false],
  ['0255', 'Head of Manufacturing', 'Silverpine Robotics', 'Austin, TX', 'NEEDS_DECISION', 250, 'Soft', 70, 75, '5d', '', '', false],
  ['0251', 'Operations Director', 'Redfern Castings', 'Jackson, MS', 'NEEDS_DECISION', 195, 'High', 58, 40, '6d', '', '', false],
  ['0248', 'VP Manufacturing', 'Northgate Power', 'Detroit, MI', 'NEEDS_DECISION', 285, 'No', 72, 60, '6d', '', '', false],
  ['0244', 'Director, Quality & Ops', 'Larkspur Devices', 'Lexington, KY', 'RESEARCH', 210, 'High', 61, 40, '6d', '', '', true],
  ['0241', 'Plant Director', 'Copperline Foods', 'Chattanooga, TN', 'NEEDS_DECISION', 200, 'Soft', 56, 40, '7d', '', '', false],
  ['0237', 'Sr. Manager, Launch', 'Halcyon Mobility', 'Knoxville, TN', 'NEEDS_DECISION', 185, 'High', 64, 75, '7d', '', '', false],
  ['0233', 'Director, Tool Systems', 'Brightwater EV', 'Huntsville, AL', 'NEEDS_DECISION', 220, 'High', 76, 60, '7d', '', '', false],
  ['0229', 'Head of Industrialization', 'Stonebridge Energy', 'Birmingham, AL', 'NEEDS_DECISION', 235, 'Unknown', 69, 40, '8d', '', '', true],
  ['0226', 'Ops Excellence Director', 'Tamarack Systems', 'Atlanta, GA', 'RESEARCH', 215, 'No', 54, 40, '8d', '', '', false],
  ['0222', 'Plant Manager', 'Westbrook Glass', 'Dalton, GA', 'NEEDS_DECISION', 180, 'High', 59, 40, '8d', '', '', false],
  ['0219', 'Director, Assembly Ops', 'Juniper Drive', 'Cleveland, TN', 'NEEDS_DECISION', 205, 'Soft', 63, 40, '9d', '', '', false],
  ['0215', 'GM, Manufacturing', 'Ravenwood Steel', 'Memphis, TN', 'DECLINE_CANDIDATE', 230, 'High', 57, 40, '9d', '', '', false],
  ['0212', 'Director, Production', 'Clearwater Batteries', 'Tampa, FL', 'NEEDS_DECISION', 240, 'High', 65, 75, '9d', '', '', false],
  ['0208', 'Head of Plant Ops', 'Fairmont Composites', 'Charlotte, NC', 'NEEDS_DECISION', 210, 'Soft', 60, 40, '10d', '', '', false],
  ['0204', 'Operations Manager', 'Pell City Plastics', 'Birmingham, AL', 'DECLINE_CANDIDATE', 160, 'No', 50, 40, '10d', '', '', false],
  ['0201', 'VP Operations', 'Ironwood Aerospace', 'Columbia, SC', 'NEEDS_DECISION', 270, 'High', 64, 60, '11d', '', '', false],
  ['0198', 'Director, Mfg Systems', 'Cedar Ridge Labs', 'Greenville, SC', 'RESEARCH', 205, 'Unknown', 58, 40, '11d', '', '', false],
  ['0194', 'Plant Leader', 'Mossy Oak Mills', 'Montgomery, AL', 'NEEDS_DECISION', 175, 'High', 55, 40, '12d', 'FAILED', '', false],
  ['0190', 'Director of Manufacturing', 'Bridgeport Motion', 'Nashville, TN', 'NEEDS_DECISION', 230, 'Soft', 67, 60, '12d', '', '', false]
];
const BUCKET = { NEEDS_DECISION: 'Needs decision', RESEARCH: 'Research', SCOUT_INTAKE: 'Scout intake', DISCOVERY_LEAD: 'Discovery lead', DECLINE_CANDIDATE: 'Decline candidate' };

const rows = J.map(([id, title, company, location, bucket, base, flex, fit, culture, age, write, changed, stale]) => {
  const ll = CITY[location];
  const payload = { SCOPE_FIT_RAW: fit, FLEX_CLASS: FLEX[flex], SALARY_BASE_EST: '$' + base + ',000', CULTURE_SCORE: culture };
  if (ll) { payload.LATITUDE = ll[0]; payload.LONGITUDE = ll[1]; }
  if (id === '0412') payload.ATS_MATCH_SCORE = 82;   // explicit ATS evidence (weight 0; drives the screen gate only)
  const r = { TITLE: title, COMPANY: company, LOCATION: location, payload };
  const s = Scoring.scoreRow(r, model);
  return { id: 'JOB-' + id, title, company, location, bucket, bucketLabel: BUCKET[bucket], baseK: base, flex: flex === 'Unknown' ? 'Unknown' : flex === 'Strict' ? 'Strict' : flex + ' flex',
    flexClass: FLEX[flex], expFit: fit, age, writeState: write, changed, staleEvidence: stale, lat: ll ? ll[0] : null, lon: ll ? ll[1] : null,
    score: s.overall, hold: s.band === 'STRICT HOLD', coverage: s.confidence, flexInfluence: s.flexInfluence, screenGate: s.screenGate,
    parts: Object.fromEntries(Object.entries(s.parts).map(([k, p]) => [k, { score: p.score, known: !!p.known, weight: p.weight || 0, basis: p.basis }])) };
});
// Percentile bands (spec §3.1): population = eligible rows minus STRICT/hard-blocked; ties go to the higher band.
const pop = rows.filter(r => !r.hold && r.score != null).map(r => r.score).sort((a, b) => a - b);
const rankOf = s => pop.filter(v => v < s).length / pop.length;   // share of the population strictly below
const cut = q => pop[Math.min(pop.length - 1, Math.ceil(q * pop.length))];
const cuts = { top: cut(0.90), upper: cut(0.65), low: cut(0.20) };
rows.forEach(r => {
  if (r.hold) { r.band = 'HOLD'; return; }
  r.band = r.score >= cuts.top ? 'TOP' : r.score >= cuts.upper ? 'UPPER' : r.score >= cuts.low ? 'MID' : 'LOW';
  r.rank = Math.round(rankOf(r.score) * 100) / 100;
  r.rankNo = 1 + pop.filter(v => v > r.score).length;   // V-19 (Grok Bot): 1 + eligible scores strictly higher; ties share the better rank
});
rows.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
rows.forEach((r, i) => { r.position = i + 1; });

// Breakdown points for the selected job: normalized contribution x coverage factor, largest-remainder rounded to
// 0.1 so the points add up exactly to the rating shown in the ring (V-16).
function breakdown(r) {
  const order = ['experience', 'flex', 'compensation', 'geo', 'title', 'culture', 'ats', 'ownership'];
  const known = order.filter(k => r.parts[k].known && r.parts[k].weight > 0);
  const avail = known.reduce((a, k) => a + r.parts[k].weight, 0);
  const factor = 0.7 + 0.3 * r.coverage / 100;
  const exact = order.map(k => (known.includes(k) ? r.parts[k].weight * r.parts[k].score / avail * factor : 0));
  const tenths = exact.map(v => Math.floor(v * 10)), target = r.score * 10;
  let rest = target - tenths.reduce((a, b) => a + b, 0);
  exact.map((v, i) => [v * 10 - tenths[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0 && known.includes(order[i])) { tenths[i]++; rest--; } });
  return order.map((k, i) => ({ key: k, weight: r.parts[k].weight, score: r.parts[k].known ? r.parts[k].score : null, points: tenths[i] / 10 }));
}
const selected = rows.find(r => r.id === 'JOB-0412');
selected.breakdown = breakdown(selected);
selected.breakdownFactor = Math.round((0.7 + 0.3 * selected.coverage / 100) * 100) / 100;

const count = b => rows.filter(r => r.bucket === b).length;
const out = {
  schema: 'pe.golden-fixture.v1', note: 'Fictional data. Scores from pipeline-scoring.js scoreRow + PIPELINE_SCORING_MODEL rev 24.',
  model: { rev: model.publishedRevision, version: model.modelVersion, weights: model.weights },
  asOf: '23:41', lastReview: '18:05',
  bands: { n: pop.length, cuts },
  // counters for the whole population (counter-registry outputs; the 50-row queue is a subset of 578 jobs)
  counters: { jobs: 578, reviewQueue: rows.length, needsDecision: count('NEEDS_DECISION'), declineCandidates: count('DECLINE_CANDIDATE'), myRulings: 0,
    appliedAllTime: 84, research: 49, interviews14d: 0, writerWaiting: rows.filter(r => r.writeState === 'WAITING').length,
    writerFailed: rows.filter(r => r.writeState === 'FAILED').length, staleEvidence: 185, compare: 0, laneQueue: 2, laneQueueOldestMin: 4, lanes: 10, lanesQuiet: 0, needsYou: 3 },
  sinceLastReview: { newRows: 12, evidenceUpdates: 4, writeFailed: 1, queued: 2, provisional: 185 },
  selectedId: selected.id,
  rows,
  events: [
    ['23:41', 'Scout intake +3 (LinkedIn)'], ['23:38', 'Δ Evidence: Head of Production (Anduril) FLEX HIGH → NO · 77 → 59'],
    ['23:22', '✓ Writer confirmed APPLIED #W-2287'], ['23:19', '◷ Writer lock busy #W-2280 · retried at 8 s · ✓ 11 s'],
    ['23:05', 'Discovery leads +9'], ['22:51', 'Sources normalized: LINKEDIN → LinkedIn (69)']
  ]
};
fs.writeFileSync(path.join(__dirname, 'fixture.json'), JSON.stringify(out, null, 1) + '\n');
console.log('fixture: ' + rows.length + ' rows; bands N ' + pop.length + ' cuts ' + JSON.stringify(cuts) + '; selected ' + selected.id + ' = ' + selected.score +
  ' (' + selected.band + ', coverage ' + selected.coverage + '%); breakdown sum ' + selected.breakdown.reduce((a, b) => a + b.points, 0).toFixed(1));
