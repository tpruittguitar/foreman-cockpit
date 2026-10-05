const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Charts = require('../pipeline-charts.js');

// Chart text is monospace; one glyph advance is about 0.6em.
const MONO_ADVANCE = 0.6;

test('bar chart labels fit their column at the enlarged chart text size', () => {
  for (const compact of [false, true]) {
    const svg = Charts.bars('t', [{ label: 'Identity unresolved and other very long label', value: 3 }], { compact });
    const fontSize = +svg.match(/<text x="0"[^>]*font-size="([0-9.]+)"/)[1];
    const label = svg.match(/<text x="0"[^>]*>([^<]*)<\/text>/)[1];
    const left = +svg.match(/<rect x="([0-9.]+)" y="[0-9.]+" width="[0-9.]+" height="17" rx="0" fill="#202421"/)[1];
    assert.ok(fontSize >= 14.4, 'chart label text was enlarged');
    assert.ok(label.length * fontSize * MONO_ADVANCE <= left, (compact ? 'compact' : 'full') + ' label "' + label + '" overruns the bar at x=' + left);
  }
});

test('no stylesheet text in the Explorer is smaller than the enlarged floor', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../pipeline.html'), 'utf8');
  const sizes = [];
  html.replace(/font-size:\s*([0-9.]+)px/g, (m, n) => sizes.push(+n));
  html.replace(/font:\s*(?:(?:normal|italic|bold|[1-9]00)\s+)*([0-9.]+)px/g, (m, n) => sizes.push(+n));
  assert.ok(sizes.length > 100);
  assert.ok(Math.min(...sizes) >= 8.4, 'smallest text is ' + Math.min(...sizes) + 'px');
});
