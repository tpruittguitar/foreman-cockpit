// Answer box on every card popup (Tim, Nov 17 10:27 PM): direction goes to the card owner's office mailbox through the
// #312 chat relay. Mocked relay only. Run: node --test tests/office-card-answer.test.js
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const card = (o = {}) => ({ id: 'cs-1', title: 'Fix the <wall>', owner: 'Cursor', priority: 'P2', status: 'open', ...o });

test('every card gets the box and Send, whatever its priority or status; a question shows above the box', () => {
  for (const priority of ['P0', 'P1', 'P2', 'P3', '']) for (const status of ['open', 'in progress', 'blocked', 'done', 'needs_tim']) {
    const h = L.cardBoxHTML(card({ priority, status }), esc, 'bot-id');
    assert.match(h, /<textarea id="card-text"/); assert.match(h, /<button type="button" class="linkbtn" id="card-send">Send<\/button>/);
  }
  const q = L.cardBoxHTML(card({ question: 'Merge <now>?' }), esc, 'bot-id');
  assert.ok(q.indexOf('Merge &lt;now&gt;?') < q.indexOf('<textarea'), 'question above the box, escaped');
  assert.match(L.cardBoxHTML(card({ owner: 'Nobody' }), esc, ''), /id="card-send" disabled/);
});
test('Send posts to the owner mailbox through the relay with card id, title and owner prefix', async () => {
  const calls = [], post = async (id, text) => { calls.push([id, text]); return { ok: true, status: 200 }; };
  let r = await L.sendCardDirection(card({ pr: 12 }), '  ship it  ', 'cursor-id', post);
  assert.equal(r.state, 'sent'); assert.deepEqual(calls[0], ['cursor-id', '[card cs-1] #12 Fix the <wall>: ship it']);
  r = await L.sendCardDirection(card({ question: 'Which repo?' }), 'forge-policy', 'cursor-id', post);
  assert.equal(calls[1][1], '[card cs-1] Fix the <wall>: answer to: Which repo? · forge-policy');
  assert.equal((await L.sendCardDirection(card(), '   ', 'cursor-id', post)).state, 'empty'); assert.equal(calls.length, 2, 'blank text never posts');
});
test('relay errors, unknown owners and oversize text show a failed state', async () => {
  let n = 0; const post = async () => { n++; return { ok: false, status: 503 }; };
  assert.deepEqual(await L.sendCardDirection(card(), 'x', 'id', post), { state: 'failed', status: 503, error: 'relay HTTP 503' });
  assert.equal((await L.sendCardDirection(card(), 'x', 'id', async () => ({ ok: false, status: 0 }))).error, 'relay unavailable or no chat key');
  assert.equal((await L.sendCardDirection(card(), 'x', '', post)).state, 'failed');
  assert.equal((await L.sendCardDirection(card(), 'x'.repeat(L.CARD_TEXT_MAX), 'id', post)).state, 'failed');
  assert.equal(n, 1, 'only the first case reached the relay');
});
test('office.js wires every card popup to the shared relay path and never logs or embeds the key', () => {
  const open = office.slice(office.indexOf('function openItem('), office.indexOf('function openNeeds('));
  assert.match(open, /L\.cardBoxHTML\(it, esc, ownerId\)/); assert.match(open, /L\.sendCardDirection\(it, ta\.value, ownerId, postRelay\)/);
  assert.match(open, /Not sent: /); assert.match(open, /Sent to /);
  assert.match(office, /async function postRelay\(id, text\) \{\n  let r = await relay\('POST', id, text\);/);
  assert.doesNotMatch(office, /console\.\w+\([^)]*[Kk]ey/);
  assert.match(office, /const RELAY_URL = '\/api\/office-chat';/);
});
