'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const WriterOff = require('../pipeline-writer-off.js');
const read = file => readFileSync(join(__dirname, '..', file), 'utf8');
const html = read('pipeline.html');

test('the queue view trigger lives in the toolbar, not the clipped grid header', () => {
  assert.match(html, /<div id="wip-queue-bar"[^\n]*<button id="qh-view"/);
  assert.doesNotMatch(html.match(/var gridHead=[^\n]+/)[0], /id="qh-view"/);
  assert.match(html, /qv\.querySelector\('span'\)\.textContent=vl/);
});

test('Writer and stale FLEX KPIs render compact labels, values and no caption', () => {
  const source = html.slice(html.indexOf('var DECIDE_TILES='), html.indexOf('function bindDecide_'));
  const rows = [{ id: 'wait' }, { id: 'fail' }];
  const ctx = {
    S: {}, distinctRows_: () => rows, terminalJob_: () => false, esc: String,
    PRESETS: { APPLY_NOW: { fn: () => false }, NEEDS_TIM: { fn: () => false }, APPLIED: {} },
    PipelineParser: { parseDate: () => null },
    rulingState: r => ({ ru: { writeStatus: r.id === 'fail' ? 'RESULT_UNKNOWN' : 'WAITING' }, s: '' }),
    refreshPlan_: () => ({ stale: [{ id: 'fail' }] })
  };
  rows.forEach(r => { r.payload = {}; });
  runInNewContext(source, ctx);
  const strip = ctx.decideStrip_(['writer', 'stale']);
  assert.match(strip, /<small>Writer wait\/fail<\/small><b>1 \/ 1<\/b>/);
  assert.match(strip, /<small>Stale FLEX<\/small><b>1<\/b>/);
  assert.doesNotMatch(strip, /class="delta/);
});

test('desktop and phone use the shared Writer off label', () => {
  assert.equal(WriterOff.LABEL, 'Writer off');
  assert.match(WriterOff.bannerHtml(), /<span class="lvl">Writer off<\/span>/);
  const mobile = read('pipeline-mobile.js');
  assert.match(mobile, /\$\('m-sys-word'\)\.textContent = root\.PipelineWriterOff\.LABEL/);
  assert.match(mobile, /class="m-fresh [^\n]+root\.PipelineWriterOff\.LABEL/);
});

test('the map readout has an opaque backing and paints above pins without intercepting clicks', () => {
  const hud = read('pipeline-ui-oct15.css').match(/\.map-hud-tl \{([^}]+)\}/)[1];
  const pin = html.match(/\.map-target\{([^}]+)\}/)[1];
  const z = rule => Number(rule.match(/z-index:\s*(\d+)/)[1]);
  assert.ok(z(hud) > z(pin));
  assert.match(hud, /background: var\(--pe-hull\)/);
  assert.match(hud, /pointer-events: none/);
});
