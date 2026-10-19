// Tim ruling 2026-10-18 18:27 ET (Grok Bot T-1): an agency posting with the client unnamed scores culture UNKNOWN;
// a named CLIENT_EMPLOYER is checked against the target list instead of the agency. Browser and Writer copies must agree.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
global.localStorage = { getItem: () => null, setItem: () => {} };
const Scoring = require('../pipeline-scoring.js');
const cfg = { weights: { experience: 35, flex: 30, compensation: 15, geo: 10, ats: 0, title: 5, culture: 5, ownership: 0 },   // published model rev 24 weights
  salary: { floor: 190000, target: 240000, ceiling: 300000 }, geo: { power: 6, controlPoints: [{ name: 'Huntsville, AL', lat: 34.7304, lon: -86.5861, score: 80 }] },
  targetCompanies: [{ company: 'Halvorsen Robotics', aliases: [], priority: 'P1' }] };
const base = { TITLE: 'Director of Manufacturing', LOCATION: 'Huntsville, AL', payload: { SCOPE_FIT_RAW: 74, FLEX_CLASS: 'SOFT_FLEX', SALARY_BASE_EST: '$235,000', LATITUDE: 34.7304, LONGITUDE: -86.5861 } };
const row = (company, extra) => Object.assign({}, base, { COMPANY: company, payload: Object.assign({}, base.payload, extra || {}) });

test('agency row, client unnamed (EMPLOYER_PRIMARY_BUSINESS) -> culture unknown, coverage 95%', () => {
  const s = Scoring.scoreRow(row('Aerotek', { EMPLOYER_PRIMARY_BUSINESS: 'RECRUITING_AGENCY', SCOUT_NOTES: 'AGENCY_POSTING; CLIENT=UNKNOWN; CLIENT_SEARCH=BASIC_DONE' }), cfg);
  assert.equal(s.parts.culture.known, false);
  assert.match(s.parts.culture.basis, /Agency posting/);
  assert.equal(s.confidence, 95);
  assert.notEqual(s.band, 'STRICT HOLD');   // never a hold
});
test('agency row flagged only in SCOUT_NOTES -> culture unknown', () => {
  assert.equal(Scoring.scoreRow(row('Aerotek', { SCOUT_NOTES: 'AGENCY_POSTING; CLIENT=UNKNOWN' }), cfg).parts.culture.known, false);
});
test('agency row with CLIENT_EMPLOYER named -> target list checked on the client', () => {
  const s = Scoring.scoreRow(row('Aerotek', { EMPLOYER_PRIMARY_BUSINESS: 'RECRUITING_AGENCY', CLIENT_EMPLOYER: 'Halvorsen Robotics' }), cfg);
  assert.equal(s.parts.culture.known, true);
  assert.equal(s.parts.culture.score, 90);    // P1 (REV-046: DREAM 100 above P1 90)
  assert.equal(s.confidence, 100);
});
test('CLIENT_EMPLOYER=UNKNOWN counts as unnamed', () => {
  assert.equal(Scoring.scoreRow(row('Aerotek', { EMPLOYER_PRIMARY_BUSINESS: 'RECRUITING_AGENCY', CLIENT_EMPLOYER: 'UNKNOWN' }), cfg).parts.culture.known, false);
});
test('explicit CULTURE_SCORE still wins on an agency row', () => {
  assert.equal(Scoring.scoreRow(row('Aerotek', { EMPLOYER_PRIMARY_BUSINESS: 'RECRUITING_AGENCY', CULTURE_SCORE: 70 }), cfg).parts.culture.score, 70);
});
test('non-agency row unchanged: not on list -> 40, known', () => {
  const s = Scoring.scoreRow(row('Kestrel Mfg'), cfg);
  assert.equal(s.parts.culture.score, 40); assert.equal(s.parts.culture.known, true);
});
test('Writer copy (apps-script/PipelineScoring.gs) is byte-identical to the browser copy', () => {
  assert.equal(fs.readFileSync(__dirname + '/../apps-script/PipelineScoring.gs', 'utf8'), fs.readFileSync(__dirname + '/../pipeline-scoring.js', 'utf8'));
});
