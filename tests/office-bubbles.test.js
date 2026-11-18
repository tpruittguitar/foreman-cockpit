const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'office/office.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'office/office.css'), 'utf8');

test('speech bubbles drop the AMBIENT label', () => {
  assert.equal(js.includes('<span class="amb">ambient</span>'), false);
});

test('bubble CSS wraps to a few lines: wider, no nowrap or ellipsis, white speech style', () => {
  const m = css.match(/\.bubble \{[^}]+\}/);
  assert.ok(m, 'missing .bubble rule');
  const rule = m[0];
  assert.equal(/white-space:\s*nowrap/.test(rule), false);
  assert.equal(/text-overflow:\s*ellipsis/.test(rule), false);
  assert.ok(/white-space:\s*normal/.test(rule));
  assert.ok(/max-width:\s*240px/.test(rule));
  assert.ok(/background:\s*#fff/.test(rule));
});

test('recent speech bubbles drop the RECENT label and do not hard-truncate at 40', () => {
  assert.equal(js.includes('<span class="amb">recent'), false);
  assert.equal(js.includes('truncate(rp.text, 40)'), false);
  assert.ok(js.includes('truncate(rp.text, L.BUBBLE_MAX)'));
});
