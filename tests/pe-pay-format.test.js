'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('../pipeline-pay-format.js');

test('pay figure fixtures: annual, hourly, range, unknown', () => {
  assert.equal(F.format({ mid: 156000 }), '$156K');
  assert.equal(F.format({ mid: 45, hourly: true }), '$45/hr');
  assert.equal(F.format({ mid: 42.5, hourly: true }), '$42.50/hr');
  assert.equal(F.format({ low: 40, high: 55, hourly: true }), '$40/hr' + F.DASH + '$55/hr');
  assert.equal(F.format({ low: 108000, high: 205000 }), '$108K' + F.DASH + '$205K');
  assert.equal(F.format({}), 'Pay not posted');
  assert.equal(F.format({ low: null, high: null }), 'Pay not posted');
});

test('fromPayload uses a full range when both ends are known and never only the low end', () => {
  assert.equal(F.fromPayload({ SALARY_BASE_LOW: '108000', SALARY_BASE_HIGH: '205000', SALARY_BASIS: 'EMPLOYER_POSTED' }), '$108K' + F.DASH + '$205K');
  assert.equal(F.fromPayload({ PAY_POSTED: '$156,000' }), '$156K');
  assert.equal(F.fromPayload({ PAY_POSTED: '$45/hr', SALARY_PERIOD: 'hourly' }), '$45/hr');
  assert.equal(F.fromPayload({}), 'Pay not posted');
  assert.equal(F.fromPayload({}, 200000), '$200K');
});

test('trust words sit after the figure: posted, estimate, low-confidence', () => {
  const p = { SALARY_BASE_LOW: '108000', SALARY_BASE_HIGH: '205000', SALARY_BASIS: 'EMPLOYER_POSTED', PAY_POSTED: '$108000-$205000' };
  assert.equal(F.trustWord({ approx: false, low: false, label: 'VERIFIED' }), 'posted');
  assert.equal(F.trustWord({ approx: true, low: false, label: 'ESTIMATED' }), 'estimate');
  assert.equal(F.trustWord({ approx: true, low: true, label: 'ESTIMATED · LOW' }), 'low-confidence');
  assert.equal(F.display(p, null, { approx: false, low: false, label: 'VERIFIED' }), '$108K' + F.DASH + '$205K posted');
  assert.equal(F.display({}, null, { approx: true, low: false, label: 'ESTIMATED' }), 'Pay not posted');
});

test('annual ranges stay annual even when a note mentions hours', () => {
  assert.equal(F.fromPayload({ SALARY_BASE_LOW: '275000', SALARY_BASE_HIGH: '330000', GROK_SALARY: 'Based on 40 hours' }), '$275K' + F.DASH + '$330K');
  assert.equal(F.fromPayload({ PAY_POSTED: '$45/hr' }), '$45/hr');
});

test('annual figures win over an hourly period note', () => {
  assert.equal(F.fromPayload({ SALARY_BASE_EST: '$275K–$330K', SALARY_PERIOD: 'hourly', PAY_POSTED: '$45/hr' }), '$275K' + F.DASH + '$330K');
});
