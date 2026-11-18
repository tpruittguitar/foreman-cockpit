'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../office/office-logic.js');
const MIN = 60000, NOW = Date.parse('2026-11-18T02:30:00Z');

test('writer health rows: heartbeat from generated_at - last_write_age_min, units, dropped rows', () => {
  const wh = { last_ping: { value: null, status: null, source: null }, queue_depth: { value: null, status: null, source: null }, timeout_rate: { value: null, status: null, source: null },
    last_write_age_min: { value: 19, status: 'green', source: 'x' }, writes_per_hour: { value: 4.33, status: 'green', source: 'x' }, error_rate: { value: 0.125, status: 'amber', source: 'x' }, lock_waits: { value: 0, status: 'green', source: 'x' } };
  const rows = L.writerRows({ generated_at: '2026-11-18T02:19:00Z', writer: wh }, NOW);
  assert.deepEqual(rows.map(r => r.label), ['Writer heartbeat', 'Last good write', 'Writes per hour', 'Error rate', 'Lock waits (24 h)']);
  assert.match(rows[0].text, /^\d{1,2}:00 [AP]M ET · 30 min ago$/); assert.equal(rows[0].status, 'green');
  assert.deepEqual(rows.slice(1).map(r => r.text), ['19 min ago', '4.33', '12.5 %', '0']);
});
test('writer health rows: missing data says no data, never invents a heartbeat', () => {
  const rows = L.writerRows(null, NOW);
  assert.ok(rows.every(r => r.text === 'no data' && r.status === null));
  assert.equal(L.writerRows({ generated_at: '', writer: { last_write_age_min: { value: 5, status: 'green', source: 'x' } } }, NOW)[0].text, 'no data');
});
