/* REV-065 (spec v1.5.2 B-3, E-04): the three-column desktop breakpoint exists twice, once for the script
   (pipeline-pane-split.js WIDE) and once for the styles (pipeline-ui-oct15.css @media). Custom properties cannot drive
   @media, so the two copies are kept equal by hand; this test fails the moment they differ, or a third copy appears
   with other numbers. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const norm = q => q.replace(/\s+/g, '').toLowerCase();

test('the 2300 x 900 query is the same in the script and the styles', () => {
  const js = fs.readFileSync(path.join(root, 'pipeline-pane-split.js'), 'utf8');
  const m = js.match(/var WIDE\s*=\s*'([^']+)'/);
  assert.ok(m, 'pipeline-pane-split.js defines WIDE');
  const wide = norm(m[1]);
  assert.equal(wide, '(min-width:2300px)and(min-height:900px)', 'WIDE reads 2300 x 900: ' + m[1]);

  const css = fs.readdirSync(root).filter(f => /^pipeline.*\.css$/.test(f) || f === 'tokens.css');
  const found = [];
  css.forEach(f => {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    for (const mm of text.matchAll(/@media([^{]+)\{/g)) {
      const q = norm(mm[1]);
      // any query that uses either number of the three-column breakpoint (the older 2200 x 1200 large-screen sizing is a
      // different breakpoint and is not matched)
      if (/min-width:2300px/.test(q) || /min-height:900px/.test(q)) found.push({ file: f, q });
    }
  });
  assert.ok(found.length >= 1, 'the styles have the three-column @media');
  // pipeline.html inline styles / matchMedia calls must not carry their own copy either
  const html = fs.readFileSync(path.join(root, 'pipeline.html'), 'utf8');
  assert.doesNotMatch(html, /min-width:\s*2300px/, 'pipeline.html has no copy of the breakpoint');
  found.forEach(x => assert.equal(x.q, wide, x.file + ' @media' + x.q + ' differs from the script WIDE'));
});
