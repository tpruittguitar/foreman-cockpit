// One strict state reader (2026-10-19): " or" / " in" / " me" are words, DC is not Washington state, the longest state name wins.
// Covers PipelineScoring.stateCode (geo, map points, PAY_WORTH) and the map's own stateCodeFromText_ / splitLocations_ in pipeline.html.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const S = require('../pipeline-scoring');
const CASES = [['Kennesaw or Buckhead (Atlanta), GA', 'GA'], ['Hillsboro, OR', 'OR'], ['Charleston, West Virginia', 'WV'], ['Washington DC-Baltimore Area', 'DC'],
  ['Washington, IN', 'IN'], ['Remote in Texas', 'TX'], ['Plant in Ohio or remote', 'OH'], ['Seattle, Washington', 'WA'], ['Kansas City, MO', 'MO'], ['Little Rock, Arkansas', 'AR']];
const src = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');
const grab = name => src.match(new RegExp('function ' + name + '\\(txt\\)\\{[\\s\\S]*?\\n\\}'))[0];
const map = new Function(src.match(/var US_STATE_NAMES=\{[^}]*\};/)[0] + '\n' +
  src.match(/function cleanLocation_\(x\)\{[\s\S]*?\n\}/)[0] + '\n' + grab('stateCodeFromText_') + '\n' + grab('splitLocations_') + '\nreturn {stateCodeFromText_:stateCodeFromText_,splitLocations_:splitLocations_};')();

test('PipelineScoring.stateCode reads states strictly', () => {
  CASES.forEach(([t, want]) => assert.equal(S.stateCode(t), want, t));
  assert.equal(S.stateCode('Remote'), '');
  assert.ok(S.point({ LOCATION: 'Washington DC-Baltimore Area', payload: {} }), 'DC has a centre point');
});

test('the map reads states the same way and splits only on the word "or"', () => {
  CASES.forEach(([t, want]) => assert.equal(map.stateCodeFromText_(t), want, 'map ' + t));
  assert.deepEqual(map.splitLocations_('Hillsboro, OR / Phoenix, AZ'), ['Hillsboro, OR', 'Phoenix, AZ']);
  assert.deepEqual(map.splitLocations_('Kennesaw or Buckhead (Atlanta), GA'), ['Kennesaw', 'Buckhead, GA']);
  assert.deepEqual(map.splitLocations_('Portland, OR'), ['Portland, OR']);
});
