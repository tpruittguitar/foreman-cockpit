'use strict';
// GUI 13: in the short desktop drawer only #d-body shrinks; the header rows and tab strip keep their height (no overlap).
const test = require('node:test'), assert = require('node:assert/strict');
const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'pipeline-ui-desktop.css'), 'utf8');
test('drawer header rows and section tabs do not shrink', () => {
  assert.match(css, /#drawer \.wh-top,#drawer \.wh-chips,#drawer \.wh-nav,#drawer #detail-tabs\{flex-shrink:0\}/);
  assert.match(css, /#drawer #d-body\{flex:1 1 auto;min-height:0;overflow:auto/);
});
