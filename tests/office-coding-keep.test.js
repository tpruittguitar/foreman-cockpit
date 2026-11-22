const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('a sent /code request survives a reload for a day, without image data', async () => {
  const { keepCodingJobs, restoreCodingJobs, etClock, CODING_KEEP_MS } = await import('../office/coding-client.mjs');
  const now = Date.UTC(2026, 10, 22, 23, 33);
  const job = { provider: 'Dot', conversationId: 'office-dot-conversation-01', requestId: 'r1', text: 'expand the panel', status: 'running', approach: { summary: 'Enlarge it' }, at: now, attachments: [{ data: 'data:image/png;base64,AAAA' }] };
  const kept = restoreCodingJobs(JSON.stringify(keepCodingJobs([job], now)), now);
  assert.deepEqual(kept, [{ provider: 'Dot', conversationId: 'office-dot-conversation-01', requestId: 'r1', text: 'expand the panel', status: 'running', approach: { summary: 'Enlarge it' }, at: now }]);
  assert.deepEqual(restoreCodingJobs(JSON.stringify([job]), now + CODING_KEEP_MS + 1), []);
  assert.deepEqual(restoreCodingJobs('not json', now), []);
  assert.equal(etClock(now), '18:33');
});
test('the board shows coding requests under All, gives them a time, and a failed send keeps the draft with a note', () => {
  const s = fs.readFileSync('office/office.js', 'utf8');
  assert.match(s, /filter\(j => AC\.to === 'ALL' \|\| j\.provider === AC\.to\)/);
  assert.match(s, /time: etClock\(job\.at \|\| Date\.now\(\)\)/);
  assert.match(s, /if \(!job\) \{ AC\.note = '⚠ Not sent; your draft is kept/);
  assert.match(s, /localStorage\.removeItem\(CODING_STORE\)/);
});
