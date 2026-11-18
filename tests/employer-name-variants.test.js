const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../apps-script/Code.gs');

// Live pairs from the 2026-11-17 master: same role and place, employer spelled two ways, admitted twice.
const pairs = [
  ['L.B. Foster', 'LB Foster', 'Director of Operations, Rail', 'Pittsburgh, PA'],
  ['L3Harris', 'L3 Harris', 'Senior Manager, Manufacturing Engineering', 'Huntsville, AL'],
  ['Shirley Ryan AbilityLab', 'Shirley Ryan Ability Lab', 'Director, Quality Improvement', 'Chicago, IL'],
  ['oura', 'ŌURA', 'Director, Quality', 'San Francisco, CA'],
  ['FlexTek', 'Flex-Tek', 'Director of Operations', 'Melrose Park, IL'],
];

test('employer spelling variants (initials, spacing, hyphen, accents) dedupe against the existing row', () => {
  for (const [have, incoming, title, loc] of pairs) {
    const idx = C.indexExisting([`1 | V2I-AAAAAAAAAAAA | ${have} | ${title} | SCOUT_INTAKE | INTAKE/AWAITING_ANALYSIS | - | - | ${loc} | -`]);
    const v = C.matchExisting({ COMPANY: incoming, TITLE: title, LOCATION: loc }, idx);
    assert.equal(v.kind, 'exact', `${incoming} vs ${have}`);
    assert.equal(v.by, 'EMPLOYER_TITLE_LOCATION');
  }
});

test('legal suffixes, "The", punctuation and case still compare equal', () => {
  const k = C.employerKey_;
  assert.equal(k('The Acme Company, Inc.'), k('ACME'));
  assert.equal(k('Acme, L.L.C.'), k('acme llc'));
  assert.equal(k('Smith & Sons Ltd'), k('Smith and Sons'));
});

test('different employers stay different, and unknown employers stay unknown', () => {
  const k = C.employerKey_;
  assert.notEqual(k('L3Harris'), k('Harris'));
  assert.notEqual(k('Oura'), k('Aura'));
  const idx = C.indexExisting(['1 | V2I-BBBBBBBBBBBB | Not Stated | Plant Manager | SCOUT_INTAKE | INTAKE/AWAITING_ANALYSIS | - | 12345678 | Dayton, OH | -']);
  assert.notEqual(C.matchExisting({ COMPANY: 'Not stated', TITLE: 'Plant Manager', LOCATION: 'Dayton, OH', REQ_ID: '12345678' }, idx).by, 'REQ_ID');
});

test('normEmployer output is unchanged, so stored UPSERT_KEY / INTAKE_KEY hashes still match', () => {
  assert.equal(C.normEmployer('L3 Harris Technologies, Inc.'), 'l3 harris technologies');
  assert.equal(C.normEmployer('L.B. Foster'), 'l b foster');
});
