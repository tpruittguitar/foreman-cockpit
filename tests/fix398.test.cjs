const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { prSummaryFromBody } = require('../scripts/write-build-info.cjs');

const css = fs.readFileSync(path.join(__dirname, '..', 'office/office.css'), 'utf8');
assert(css.includes('#build-badge'), 'build badge rule missing');
assert(!/\#build-badge\s*\{[^}]*pointer-events\s*:\s*none/i.test(css), 'build badge should not disable pointer events');

const logic = fs.readFileSync(path.join(__dirname, '..', 'office/office-logic.js'), 'utf8');
const m = logic.match(/function buildPrPopup\(info\) {([\s\S]*?)\n  }\n  function wireBuildBadge/);
assert(m, 'buildPrPopup not found');
const ctx = { Date, Number, Math, String, Object, Array, parseInt, isNaN, Intl, console, str: v => v == null ? '' : String(v) };
vm.createContext(ctx);
vm.runInContext(`function buildPrPopup(info) {${m[1]}\n  }`, ctx);
const popup = ctx.buildPrPopup({ pr: 12, prTitle: '', prSummary: '', mergedAt: '' });
assert.strictEqual(popup.desc, '');
assert.strictEqual(popup.fallback, 'No description for this build');
assert.strictEqual(prSummaryFromBody(''), '');
console.log('fix398 tests passed');
