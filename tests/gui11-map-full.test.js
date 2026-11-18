'use strict';
// GUI 11: the desktop MAP view starts below the header, Writer alert and tabs; Escape and the tab bar leave it.
const test = require('node:test'), assert = require('node:assert/strict');
const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'pipeline.html'), 'utf8');
test('desktop map-full sits below the measured tab bar and Escape returns to Jobs', () => {
  assert.match(html, /@media \(min-width:1024px\)\{body\.map-full #job-map-card\{top:var\(--map-top,0px\)!important\}/);
  assert.match(html, /function setMapFull_\(on\)\{S\.mapFull=!!on;document\.body\.classList\.toggle\('map-full',S\.mapFull\);mapTop_\(\);/);
  assert.match(html, /function mapTop_\(\)\{var t=\$\('section-tabs'\)/);
  assert.match(html, /e\.key!=='Escape'\|\|!S\.mapFull/);
});
