/* GUI office review Nov 18 #1: floor tags show the bot's current card (task file line), not training chips. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../office/office-logic.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'office', 'office.js'), 'utf8');

test('screens index carries the task line without the "Task:" prefix', () => {
  const at = '2026-11-18T13:44:20Z';
  const s = L.parseScreensIndex({ screens: { a1: { at, busy: true, activeAt: at, task: 'Task: P3 office floor tags (b16837c)' }, b2: { at, busy: false } } }).screens;
  assert.equal(s.a1.task, 'P3 office floor tags (b16837c)');
  assert.equal(s.b2.task, '');
});

test('floor tags carry no chips: name · idle, or name · working|waiting|blocked · card (cs-ffe2ed7d, cs-9e5be547 #3)', () => {
  const tag = src.slice(src.indexOf('function updateLabels'), src.indexOf('const ys = L.nudgeLabels'));
  assert.doesNotMatch(tag, /class="chip/);
  assert.match(tag, /L\.floorTag\(/);
  assert.match(tag, /name · idle, or name · working\|waiting\|blocked · card/);
  assert.doesNotMatch(src, /name · working\|idle\|blocked · title/);
  assert.match(tag, /floor\.state === 'blocked' \? ' alert'/);
  assert.doesNotMatch(src, /flyEl|\bfly\.sk\b/);
  const idle = L.floorTag('GUI', { working: false, state: 'idle', task: 'idle' });
  assert.equal(idle.text, 'GUI · idle');
  const work = L.floorTag('QA', { working: true, state: 'working', task: 'QA proofs: 66 queued' });
  assert.equal(work.sub, 'working · QA proofs: 66 queued');
  assert.equal(work.text, 'QA · ' + work.sub);
  const long = L.floorTag('QA', { working: true, state: 'working', task: 'QA proofs: 66 queued, waiting on natural runs (next gate 12:40 PM ET)' });
  assert.ok(long.sub.startsWith('working · QA proofs:'), long.sub);
  assert.ok(long.sub.endsWith('…') && long.sub.length <= 'working · '.length + 40, long.sub);
  const blocked = L.floorTag('Gauge', { blocked: true, state: 'blocked', task: 'blocked: card-pickup webhook needs Tim to copy URL/key into gauge.env' });
  assert.equal(blocked.state, 'blocked');
  assert.match(blocked.sub, /^blocked · card-pickup webhook/);
  assert.doesNotMatch(blocked.sub, /offline/);
});

test('labelOverlaps hides any tag still overlapping after the nudge; the first listed wins', () => {
  const box = (x, y) => ({ x, y, w: 70, h: 24 });
  assert.deepEqual(L.labelOverlaps([box(100, 200), box(300, 200)], [200, 200]), [false, false]);
  assert.deepEqual(L.labelOverlaps([box(100, 200), box(110, 200), box(120, 200)], [200, 200, 173]), [false, true, false]);
  assert.match(src, /shown\.sort\(\(a, b\) => b\.needs - a\.needs\);\n    const ys = L\.nudgeLabels\(shown\);/);
});

test('training whiteboard is dark and the constraint waiting figure fits its gutter', () => {
  const draw = fs.readFileSync(path.join(__dirname, '..', 'office', 'draw.js'), 'utf8');
  assert.match(draw, /ctx\.fillStyle = '#16191e'; ctx\.fillRect\(0, 0, W, H\);   \/\* GUI office review Nov 18 #3/);
  assert.match(draw, /if \(sk && sk\.counter\) \{/);
  assert.match(draw, /const cw = 176 \* s, qw = 94 \* s/);
  assert.match(draw, /shrink\(ctx, qt, 800, 34 \* s, qw - 16 \* s\)/);
});

// cs-9e5be547 #3: idle is name only; waiting is its own state word; working and blocked keep their shape.
test('floor tag states: idle drops any title, waiting is a word of its own, blocked keeps its reason', () => {
  assert.equal(L.floorTag('GUI', { state: 'idle', task: 'P3 office floor tags' }).text, 'GUI · idle', 'idle never carries a card title');
  assert.equal(L.floorTag('GUI', { state: 'idle' }, { title: 'Release notes' }).text, 'GUI · idle', 'not even a passed title');
  const w = L.floorTag('QA', { state: 'idle', task: 'waiting: proof run for #559' });
  assert.equal(w.state, 'waiting'); assert.equal(w.text, 'QA · waiting · proof run for #559');
  assert.equal(L.floorTag('QA', { waiting: true, state: 'waiting', task: 'proof run for #559' }).text, 'QA · waiting · proof run for #559');
  assert.equal(L.floorTag('QA', { working: true, state: 'working', task: 'QA proofs' }).text, 'QA · working · QA proofs');
  const b = L.floorTag('Gauge', { blocked: true, state: 'blocked', task: 'blocked: needs Tim to copy the key' });
  assert.equal(b.text, 'Gauge · blocked · needs Tim to copy the key', 'the word plus the reason, never colour only');
  assert.match(src, /floor\.state === 'blocked' \? ' alert' : ''/);
});
test('botActivity: a "Task: waiting: <card>" screen is waiting, not idle and not working', () => {
  const MIN = 60000, NOW = Date.parse('2026-11-25T17:00:00Z'), ago = m => new Date(NOW - m * MIN).toISOString();
  const BOT = { bot: 'QA', bot_id: 'qa-1', status: 'idle' };
  const ctx = task => ({ screens: L.parseScreensIndex({ updated_at: ago(1), screens: { 'qa-1': { at: ago(1), activeAt: ago(2), hasActive: true, busy: true, paused: false, task } } }) });
  const a = L.botActivity(BOT, NOW, ctx('Task: waiting: proof run for #559'));
  assert.deepEqual([a.state, a.waiting, a.working, a.blocked, a.task], ['waiting', true, false, false, 'proof run for #559']);
  assert.equal(L.floorTag('QA', a).text, 'QA · waiting · proof run for #559');
  assert.equal(L.botActivity(BOT, NOW, ctx('Task: my card')).state, 'working');
  assert.equal(L.botActivity(BOT, NOW, ctx('Task: blocked: no key')).state, 'blocked');
  assert.equal(L.floorTag('QA', L.botActivity(BOT, NOW, ctx('Task: idle'))).text, 'QA · idle');
});

// cs-9e5be547 #4: geometric board hide, no name list.
test('tagBoardHides: a tag covering a board past the sliver hides; a tag clear of every board stays', () => {
  const board = { x0: 400, x1: 800, y0: 100, y1: 400 };
  const tags = [{ x: 600, y: 300, w: 100, h: 24 }, { x: 410, y: 300, w: 100, h: 24 }, { x: 200, y: 700, w: 100, h: 24 }, { x: 395, y: 300, w: 100, h: 24 }];
  // 1: fully on the board; 2: 60% on; 3: desk foreground, no board; 4: 45 of 100 px over
  assert.deepEqual(L.tagBoardHides(tags, tags.map(t => t.y), [board]), [true, true, false, true]);
  const sliver = [{ x: 360, y: 300, w: 100, h: 24 }];   // 10 px of 100 over the edge = 10%
  assert.deepEqual(L.tagBoardHides(sliver, [300], [board]), [false], 'a sliver is allowed');
  assert.deepEqual(L.tagBoardHides(tags, tags.map(t => t.y), []), [false, false, false, false]);
  assert.equal(L.TAG_BOARD_SLIVER, 0.2);
  assert.equal(L.overlapFrac({ x0: 0, x1: 10, y0: 0, y1: 10 }, { x0: 5, x1: 20, y0: 0, y1: 20 }), 0.5);
  const lbl = src.slice(src.indexOf('function updateLabels'), src.indexOf('function ambientText'));
  assert.match(lbl, /L\.labelOverlaps\(shown, ys\)[^\n]*\n    L\.tagBoardHides\(shown, ys, boardRects\)\.forEach\(\(o, i\) => \{ if \(o\) shown\[i\]\.c\.tag\.style\.display = 'none'; \}\);/);
  assert.match(src, /if \(tmpL\.z > 0\) \{ const f = screenRect\(corners\(b, 0\.07\)\); if \(f\) boardRects\.push/, 'every board face in front of the camera, near or far');
  const logic = fs.readFileSync(path.join(__dirname, '..', 'office', 'office-logic.js'), 'utf8'), fn = logic.slice(logic.indexOf('function tagBoardHides'), logic.indexOf('\n  }\n', logic.indexOf('function tagBoardHides')));
  assert.doesNotMatch(fn, /GUI|QA|Gauge|Root|Claude|Grok|Hermes|name/, 'no bot names');
});

// cs-ca5b83da #1: state comes only from a "Task:" line; anything else is unknown, never working.
test('botActivity: no "Task:" line is unknown, whatever busy/activeAt/free text say; a Task: line still drives the state', () => {
  const MIN = 60000, NOW = Date.parse('2026-11-26T13:35:00Z'), ago = m => new Date(NOW - m * MIN).toISOString();
  const ctx = (id, task) => ({ screens: L.parseScreensIndex({ updated_at: ago(1), screens: { [id]: { at: ago(1), activeAt: ago(2), busy: true, paused: false, task } } }) });
  const GPT = { bot: 'ChatGPT', bot_id: 'gpt-1', status: 'idle' }, QA = { bot: 'QA', bot_id: 'qa-1', status: 'idle' };
  const gpt = L.botActivity(GPT, NOW, ctx('gpt-1', 'IDLE — cs-05e7c1fa deployed & queued for QA (5/5 tests pass); waiting on QA'));
  assert.deepEqual([gpt.state, gpt.working, gpt.blocked, gpt.waiting, gpt.task], ['unknown', false, false, false, '']);
  assert.equal(L.floorTag('ChatGPT', gpt, { title: 'IDLE — cs-05e7c1fa deployed & queued for QA' }).text, 'ChatGPT · unknown', 'no free-text title');
  const qa = L.botActivity(QA, NOW, ctx('qa-1', 'QA proofs: cs-52703d0e WAITING (0/2 pos…)'));
  assert.deepEqual([qa.state, qa.working], ['unknown', false]);
  assert.equal(L.floorTag('QA', qa).text, 'QA · unknown');
  const work = L.botActivity(QA, NOW, ctx('qa-1', 'Task: QA proofs: 91 queued, waiting on natural runs'));
  assert.deepEqual([work.state, work.working, work.task], ['working', true, 'QA proofs: 91 queued, waiting on natural runs'], 'WAITING inside a title is not the state word');
  assert.equal(L.botActivity(QA, NOW, ctx('qa-1', 'Task: waiting · proof run for #559')).task, 'proof run for #559', '"waiting ·" leads too');
  assert.equal(L.botActivity(QA, NOW, ctx('qa-1', 'Task:')).state, 'idle', 'an empty Task: line is idle');
  assert.equal(L.botActivity(QA, NOW, ctx('qa-1', 'blocked: no key')).state, 'unknown', 'a state word without Task: is free text');
  assert.equal(L.botActivity(QA, NOW, ctx('qa-1', 'Task: Blocked · no key')).state, 'blocked');
  assert.equal(L.floorTag('QA', { state: 'unknown', task: 'waiting: x' }).text, 'QA · unknown', 'unknown never falls back to a waiting read of the title');
});
test('parseScreensIndex keeps the stripped title and records whether the Task: line was there; liveStatus needs it to promote', () => {
  const MIN = 60000, NOW = Date.parse('2026-11-26T13:35:00Z'), at = new Date(NOW - 2 * MIN).toISOString();
  const ix = L.parseScreensIndex({ screens: { a1: { at, busy: true, activeAt: at, task: 'Task: P3 office floor tags (b16837c)' }, b2: { at, busy: true, activeAt: at, task: 'IDLE — queued' } } });
  assert.deepEqual([ix.screens.a1.task, ix.screens.a1.hasTaskLine], ['P3 office floor tags (b16837c)', true]);
  assert.deepEqual([ix.screens.b2.task, ix.screens.b2.hasTaskLine], ['IDLE — queued', false]);
  assert.equal(L.hasTaskLine('task: x'), true); assert.equal(L.hasTaskLine('Tasks: x'), false);
  const row = { bot: 'X', status: 'idle' };
  assert.equal(L.liveStatus(row, 'a1', ix, null, NOW).status, 'working');
  assert.equal(L.liveStatus(row, 'b2', ix, null, NOW).status, 'idle', 'no Task: line never promotes to working');
  assert.equal(L.screenWorkAt(ix.screens.b2, ix, NOW), null);
});

// cs-ca5b83da #2: the state word is its own span that far tags never hide; only the card title (.tsub) drops.
test('far tags keep the state word: .tstate sits outside .tsub and far CSS hides only .tsub', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'office', 'office.css'), 'utf8');
  const tag = src.slice(src.indexOf('function updateLabels'), src.indexOf('const ys = L.nudgeLabels'));
  assert.match(tag, /<span class="tstate\$\{alert\}">\$\{esc\(floor\.state\)\}<\/span>` \+ \(floor\.title \? `<span class="tsub\$\{alert\}">· \$\{esc\(floor\.title\)\}<\/span>`/);
  assert.doesNotMatch(tag, /esc\(sub\)/, 'the whole subtitle is no longer inside .tsub');
  assert.match(css, /\.tag\.far \.tsub:not\(\.alert\) \{ display: none; \}/);
  for (const rule of css.match(/[^{}]*\{[^}]*display:\s*none[^}]*\}/g) || []) assert.doesNotMatch(rule.split('{')[0], /tstate/, 'no rule hides .tstate: ' + rule.trim());
  assert.match(css, /\.tag \.tstate\.alert, \.tag \.tsub\.alert \{ color: #ff6b6b; font-weight: 800; \}/, 'blocked keeps its alert colour on the word');
});

// cs-ca5b83da #3: one freshness phrase; stale never adds the contradictory "(stale: no publisher run in 30 min)".
test('asofLabel: stale is "Stale · updated N min ago", live quiet keeps checked/last change, failed unchanged', () => {
  assert.equal(L.asofLabel({ state: 'stale', ageText: 'updated 18 min ago' }), 'Stale · updated 18 min ago');
  assert.equal(L.asofLabel({ state: 'stale', ageText: 'updated 17 min ago', source: 'raw' }), 'Stale · updated 17 min ago · via raw (API rate limit)');
  assert.equal(L.asofLabel({ state: 'live', ageText: 'updated 14 min ago', checkedText: 'updated 2 min ago', quiet: true }), 'checked 2 min ago · last change 14 min ago');
  assert.equal(L.asofLabel({ state: 'live', ageText: 'updated just now' }), 'updated just now');
  assert.equal(L.asofLabel({ state: 'failed', everOk: true, lastData: '8:10 AM', source: 'raw' }), '⚠ Data feed down · last data 8:10 AM');
  assert.equal(L.asofLabel({ state: 'failed' }), '⚠ No office data');
  assert.doesNotMatch(L.asofLabel({ state: 'stale', ageText: 'updated 18 min ago', source: 'raw' }), /no publisher run|\(stale/);
  assert.match(src, /asof\.textContent = L\.asofLabel\(\{/);
  assert.doesNotMatch(src, /\(stale: no publisher run in/, 'the old parenthetical cannot return');
});
