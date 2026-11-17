// Box-side publisher for control/PRESIDENT_CHAT_FEED.jsonl: redaction + feed shape. EXAMPLE data only (fake secrets).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const S = require('../scripts/president-chat-feed.cjs'), L = require('../office/office-logic.js');

test('redacts keys, tokens, emails, phones and secret assignments', () => {
  const cases = [
    ['key sk-ant-api03-AbCdEfGhIjKlMnOpQrSt here', 'sk-ant-'], ['tok ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'ghp_'],
    ['mail me at jane.doe@example.com', 'jane.doe@'], ['call +1 (555) 123-4567', '555'], ['password: hunter2hunter2', 'hunter2'],
    ['API_KEY="abc 123"', 'abc 123'], ['Authorization: Bearer abcdefghijklmnop1234', 'abcdefghijklmnop'],
    ['jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0NTY3.SflKxwRJSMeKKF2QT4fw', 'eyJhbGci'], ['AKIAABCDEFGHIJKLMNOP', 'AKIA'],
    ['-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----', 'MIIEvQ']
  ];
  for (const [input, leak] of cases) { const out = S.redact(input); assert.ok(!out.includes(leak), input + ' -> ' + out); }
  assert.equal(S.redact('plain text stays'), 'plain text stays');
});

const T0 = Date.parse('2026-11-16T15:00:00Z');
const line = (i, role, text) => JSON.stringify({ timestamp: new Date(T0 + i * 60000).toISOString(), role, content: text });

test('buildFeed maps roles, redacts, keeps the last N oldest-first, and parses on the page side', () => {
  const rows = []; for (let i = 0; i < 20; i++) rows.push(line(i, i % 2 ? 'assistant' : 'user', 'msg ' + i));
  rows.push('not json', line(30, 'system', 'skip me'), line(31, 'user', '   '), line(32, 'user', 'my email is a@b.co token ghp_abcdefghijklmnopqrstuvwxyz0123456789'));
  const feed = S.buildFeed(rows.join('\n'), 12), parsed = feed.trim().split('\n').map(l => JSON.parse(l));
  assert.equal(parsed.length, 12);
  assert.deepEqual(Object.keys(parsed[0]), ['at', 'from', 'text']);
  assert.ok(['Tim', 'President'].includes(parsed[0].from));
  assert.equal(parsed[11].text, 'my email is [email] token [token]');
  assert.ok(parsed.every((p, i) => !i || Date.parse(p.at) >= Date.parse(parsed[i - 1].at)));
  assert.equal(L.parseChatFeed(feed).length, 12); // exactly what the office page accepts
  assert.equal(S.buildFeed('', 12), '');
});

test('CLI: missing transcript writes nothing; unchanged feed is not rewritten; --dry-run prints only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcf-')), src = path.join(dir, 't.jsonl'), repo = path.join(dir, 'fc');
  const dest = path.join(repo, S.FEED_REL);
  const run = args => { const cp = require('child_process'); return cp.spawnSync(process.execPath, [path.join(__dirname, '../scripts/president-chat-feed.cjs'), ...args], { encoding: 'utf8' }); };
  assert.equal(run(['--source', src, '--repo', repo]).status, 0); assert.ok(!fs.existsSync(dest));
  fs.writeFileSync(src, line(0, 'user', 'hello') + '\n');
  assert.equal(run(['--source', src, '--repo', repo, '--dry-run']).status, 0); assert.ok(!fs.existsSync(dest));
  assert.equal(run(['--source', src, '--repo', repo]).status, 0); assert.ok(fs.existsSync(dest));
  assert.match(run(['--source', src, '--repo', repo]).stdout, /unchanged/);
  assert.equal(run([]).status, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('walk camera eye height is 30% above the President head height and still floor level (below the old 1.75 m)', () => {
  assert.ok(Math.abs(L.EYE_HEIGHT / L.PRESIDENT_HEAD_Y - 1.3) < 0.005, 'about 1.3 x the previous eye height');
  assert.ok(L.EYE_HEIGHT > 1.3 && L.EYE_HEIGHT < 1.75);
});

test('accepts {t, from, text} source lines (President live source)', () => {
  const feed = S.buildFeed('{"t":"2026-11-16T21:26:00-05:00","from":"Tim","text":"a"}\n{"t":"2026-11-16T21:26:30-05:00","from":"President","text":"ok"}', 12);
  const rows = feed.trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(rows.map(r => [r.at, r.from]), [['2026-11-17T02:26:00Z', 'Tim'], ['2026-11-17T02:26:30Z', 'President']]);
});
