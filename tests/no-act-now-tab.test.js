'use strict';
// The Act Now tab is gone. Needs You no longer polls action=operations; Automations still loads that snapshot for Recovery.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('pipeline.html');
const nav = read('pipeline-navigation.js');

test('no Act Now tab, link, view, or cold-start route', () => {
  assert.doesNotMatch(html, /id="view-act-now"/);
  assert.doesNotMatch(html, /data-go="act-now"/);
  assert.doesNotMatch(html, /renderActNow_|actNowModel_|bindActNow_|on-act-now/);
  assert.doesNotMatch(nav, /act-now|Act now/);
  assert.match(nav, /items:\[\['Jobs','pipeline'\],\['Review queue','pipeline','NEEDS_TIM'\]/);
  assert.match(html, /if\(t==='today'\|\|t==='act-now'\)t='pipeline'/);
  assert.match(html, /if\(o\.t==='act-now'\)o\.t='pipeline'/);
  assert.match(html, /data-st-key="pipeline:0"/);
  assert.doesNotMatch(html, /S\.tab='act-now'/);
});

test('no setInterval fetches action=operations outside Automations', () => {
  assert.doesNotMatch(html, /gsGet\(['"]operations['"]\)/);
  assert.doesNotMatch(html, /action=operations/);
  const browserJs = fs.readdirSync(root).filter(f => /^pipeline.*\.js$/.test(f) && f !== 'pipeline-operations-ui.js');
  for (const f of browserJs) {
    const src = read(f);
    assert.doesNotMatch(src, /gsGet\(['"]operations['"]\)|api\.get\(['"]operations['"]\)|action=operations/, f);
    let i = 0;
    while ((i = src.indexOf('setInterval(', i)) >= 0) {
      assert.doesNotMatch(src.slice(i, i + 700), /operations/, f + ' setInterval');
      i += 12;
    }
  }
  const ops = read('pipeline-operations-ui.js');
  assert.match(ops, /api\.get\('operations'\)/);
  assert.match(ops, /visible\(\)&&tab==='dashboard'/);
  assert.match(ops, /tab==='recovery'/);
});
