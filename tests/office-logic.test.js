// 3D office viewer pure logic (office/office-logic.js). Run: node --test tests/office-logic.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const NOW = Date.parse('2026-11-15T21:30:00-05:00');
const ago = m => new Date(NOW - m * 60000).toISOString();

const SEED = {
  updated_at: '2026-11-15T21:28:47-05:00', needs_tim: [{ text: 'Approve key', link: 'https://x/1' }, { text: '' }],
  bots: [
    { bot: 'President', bot_id: '431e8cf1-f077-4548-82b7-46c1959dc4c9', task: '', status: 'idle', last_action: 'seeded', last_action_at: '2026-11-15T21:28:47-05:00', question: '', link: '' },
    { bot: 'Claude', bot_id: 'd4118f0c-1b06-4e9a-982f-f5314451c841', task: 'Building', status: 'working', last_action: 'seeded', last_action_at: '2026-11-15T21:28:47-05:00', question: '', link: '' },
    { bot: 'Claude', bot_id: 'dup', status: 'blocked' },
    { bot: '', status: 'working' }
  ],
  items: [
    { id: 'office-viewer', title: '3D office viewer (foreman-cockpit PR)', priority: 'P2', status: 'working', owner: 'Claude', link: 'https://github.com/tpruittguitar/foreman-cockpit/pull/305', updated_at: '2026-11-15T21:28:47-05:00', project: '3D office' },
    { id: 'no-title', priority: 'P1' }
  ],
  conversations: [{ from: 'Claude', to: 'President', text: 'hi', at: ago(1) }, { from: 'Ghost', to: 'Claude', text: 'x', at: ago(1) }],
  usage: { as_of: ago(10), services: [{ name: 'Claude', pct_used: 11 }, { name: 'ChatGPT', pct_left: 8 }, { name: 'Grok Bot', pct_used: null }] }
};

test('parseStatus: parses the seeded shape, drops duplicates, blanks and unknown speakers', () => {
  const p = L.parseStatus(JSON.stringify(SEED));
  assert.equal(p.ok, true);
  assert.deepEqual(p.bots.map(b => [b.bot, b.status]), [['President', 'idle'], ['Claude', 'working']]);
  assert.deepEqual(p.needsTim, [{ text: 'Approve key', link: 'https://x/1', bot: '', bot_id: '', resolved: false, resolved_at: '', expires_at: '' }]);
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].pr, 305);
  assert.equal(p.conversations.length, 1);
  assert.deepEqual(p.usage.services.map(s => [s.name, s.pct_used, s.pct_left]), [['Claude', 11, 89], ['ChatGPT', 92, 8], ['Grok Bot', null, null]]);
});

test('parseStatus: bad input never throws', () => {
  assert.equal(L.parseStatus('{nope').ok, false);
  assert.equal(L.parseStatus('[]').ok, false);
  assert.equal(L.parseStatus('{}').ok, false);
  assert.match(L.parseStatus('{}').error, /bots/);
  assert.equal(L.parseStatus({ bots: [] }).ok, true);
});

test('status maps to colour, glyph, word and raised-hand flag; never colour only', () => {
  assert.deepEqual([L.statusStyle('working').color, L.statusStyle('working').flag], ['#3ddc84', false]);
  assert.deepEqual([L.statusStyle('idle').color, L.statusStyle('idle').flag], ['#8b9099', false]);
  const wt = L.statusStyle('waiting_tim');
  assert.equal(wt.color, '#ff4b4b'); assert.equal(wt.flag, true); assert.equal(wt.glyph, '⚠');
  assert.equal(L.statusStyle('blocked').alert, false, 'blocked is never Needs Tim'); assert.equal(L.statusStyle('blocked').flag, false);
  assert.equal(L.statusStyle('waiting_tim').word, 'NEEDS TIM');
  assert.equal(L.statusStyle('blocked').word, 'BLOCKED');
  assert.equal(L.normStatus('Waiting TIM'), 'waiting_tim');
  assert.equal(L.normStatus('weird'), 'idle');
  for (const s of L.STATUSES) { const st = L.statusStyle(s); assert.ok(st.word && st.glyph); }
});

test('fallback link: entry link wins, otherwise grokbot://app/v1/agent?id=<bot_id>; question text always available', () => {
  assert.equal(L.fallbackLink('d4118f0c-1b06-4e9a-982f-f5314451c841'), 'grokbot://app/v1/agent?id=d4118f0c-1b06-4e9a-982f-f5314451c841');
  assert.equal(L.linkFor({ bot_id: 'abc', link: '' }), 'grokbot://app/v1/agent?id=abc');
  assert.equal(L.linkFor({ bot_id: 'abc', link: ' https://github.com/x ' }), 'https://github.com/x');
  assert.equal(L.fallbackText({ bot: 'QA bot', question: 'Quarantine it?' }), 'Ask QA bot: “Quarantine it?”');
  assert.match(L.fallbackText({ bot: 'Root', question: '' }), /Ask Root/);
});

test('items: parsing, owner check, PR number in card title, priority ordering', () => {
  const items = L.parseItems([
    { id: 'a', title: 'Low', priority: 'P4', owner: 'Claude', updated_at: ago(1) },
    { id: 'b', title: 'Merge me', priority: 'PR merge queue', owner: 'Nobody', link: 'https://github.com/o/r/pull/77' },
    { id: 'c', title: '#12 Decide', priority: 'needs tim', owner: 'Root' },
    { id: 'd', title: 'Mid', priority: 'P2', owner: 'GUI' },
    { id: 'e', title: 'Odd', priority: 'urgent', owner: 'GUI' },
    { title: 'no id' }
  ], ['Claude', 'Root', 'GUI']);
  assert.equal(items.length, 5);
  assert.equal(items.find(i => i.id === 'b').ownerKnown, false);
  assert.equal(items.find(i => i.id === 'e').priority, 'P4');
  assert.deepEqual(L.sortItems(items).map(i => i.id), ['c', 'b', 'd', 'a', 'e']);
  assert.equal(L.cardTitle(items.find(i => i.id === 'b')), '#77 Merge me');
  assert.equal(L.cardTitle(items.find(i => i.id === 'c')), '#12 Decide');
  assert.equal(L.priorityBadge('Needs Tim').loud, true);
  assert.equal(L.priorityBadge('PR merge queue').loud, true);
  assert.equal(L.priorityBadge('P1').loud, false);
});

test('column mapping', () => {
  const c = (status, priority) => L.columnFor({ status, priority: priority || 'P2' });
  assert.equal(c('working'), 'in_progress');
  const q = (status, priority) => L.columnFor({ status, priority: priority || 'P2', question: 'ok?' });
  assert.equal(q('waiting_tim'), 'needs_tim'); assert.equal(c('waiting_tim'), 'queued', 'no question -> not Needs Tim');
  assert.equal(c('blocked'), 'in_progress');
  assert.equal(q('working', 'Needs Tim'), 'needs_tim');
  assert.equal(c('review'), 'in_progress'); assert.equal(L.statusWord({ status: 'review' }).word, 'REVIEW / MERGE QUEUE');
  assert.equal(c('queued'), 'queued'); assert.equal(c('waiting'), 'queued');
  assert.equal(c('merged'), 'done');
  assert.equal(c('done', 'Needs Tim'), 'done');
});

test('board: "+N more" overflow after 5 cards per column', () => {
  const items = L.parseItems(Array.from({ length: 8 }, (_, i) => ({ id: 'd' + i, title: 'Done ' + i, priority: 'P3', status: 'done', owner: 'Claude', project: 'Job pipeline' })));
  const row = L.buildBoard(items).find(r => r.project === 'Job pipeline');
  assert.equal(row.cols.done.cards.length, 5);
  assert.equal(row.cols.done.more, 3);
  assert.equal(row.cols.in_progress.more, 0);
});

test('board: bitcoin row hidden until an item uses that project', () => {
  const a = L.buildBoard(L.parseItems([{ id: 'x', title: 't', project: '3D office' }]));
  assert.deepEqual(a.map(r => r.project), ['Job pipeline', '3D office']);
  const b = L.buildBoard(L.parseItems([{ id: 'x', title: 't', project: 'Bitcoin' }, { id: 'y', title: 'u', project: 'Garden' }]));
  assert.deepEqual(b.map(r => r.project), ['Job pipeline', '3D office', 'Bitcoin', 'Other'], 'unknown projects land on Other, never a hidden tab');
});

test('LOD thresholds: far = glyph, mid = name + status, near = all three lines', () => {
  assert.equal(L.lodFor(1), 'near');
  assert.equal(L.lodFor(L.LOD.near), 'near');
  assert.equal(L.lodFor(L.LOD.near + 0.01), 'mid');
  assert.equal(L.lodFor(L.LOD.mid), 'mid');
  assert.equal(L.lodFor(L.LOD.mid + 0.01), 'far');
});

test('stale and failed data states; no idle animation when data is missing', () => {
  const fresh = L.parseStatus({ updated_at: ago(5), bots: [] });
  const old = L.parseStatus({ updated_at: ago(20), bots: [] });
  assert.equal(L.dataState(fresh, true, NOW), 'live');
  assert.equal(L.dataState(old, true, NOW), 'stale');
  assert.equal(L.dataState(fresh, false, NOW), 'failed');
  assert.equal(L.dataState(null, true, NOW), 'failed');
  assert.equal(L.behaviorFor('idle', 'live'), 'roam');
  assert.equal(L.behaviorFor('idle', 'stale'), 'roam');
  for (const s of L.STATUSES) assert.equal(L.behaviorFor(s, 'failed'), 'frozen');
  assert.equal(L.behaviorFor('working', 'live'), 'work');
  assert.equal(L.behaviorFor('waiting_tim', 'live'), 'wave');
});

test('reduced motion: alert pulse is steady; otherwise about 1 Hz', () => {
  assert.equal(L.pulse(0.1, true), 1);
  assert.equal(L.pulse(0.37, true), 1);
  assert.ok(Math.abs(L.pulse(0.25, false) - 1) < 1e-9);
  assert.ok(Math.abs(L.pulse(1.25, false) - 1) < 1e-9, 'period 1 s');
  assert.ok(L.pulse(0.75, false) < 0.2);
});

test('item diff: pickups for new and reassigned items, none on first load', () => {
  const prev = L.parseItems([{ id: 'a', title: 'A', owner: 'Claude' }, { id: 'b', title: 'B', owner: 'GUI' }]);
  const next = L.parseItems([{ id: 'a', title: 'A', owner: 'Claude' }, { id: 'b', title: 'B', owner: 'Root' }, { id: 'c', title: 'C', owner: 'Root' }, { id: 'd', title: 'D', owner: '' }]);
  assert.deepEqual(L.diffItems(null, next), []);
  assert.deepEqual(L.diffItems(prev, next).map(p => [p.bot, p.itemId, p.reason]), [['Root', 'b', 'reassigned'], ['Root', 'c', 'new']]);
  assert.deepEqual(L.diffItems(next, next), []);
});

test('conversation recency: 15 minute window, latest 3, oldest first', () => {
  const list = [0, 1, 2, 3, 16, 30].map((m, i) => ({ from: 'A', to: 'B', text: 't' + i, at: ago(m) }));
  assert.deepEqual(L.recentConversations(list, NOW).map(c => c.text), ['t2', 't1', 't0']);
  assert.deepEqual(L.recentConversations(list.slice(4), NOW), []);
  assert.equal(L.bubbleText({ to: 'Claude', text: '' }), 'talking with Claude');
  const long = L.bubbleText({ to: 'X', text: 'x'.repeat(200) });
  assert.equal(long.length, 40); assert.ok(long.endsWith('…'));
});

test('TV key mapping in hop and free-walk modes', () => {
  assert.equal(L.tvKeyAction('ArrowRight', true), 'next');
  assert.equal(L.tvKeyAction('ArrowLeft', true), 'prev');
  assert.equal(L.tvKeyAction('ArrowUp', true), 'up');
  assert.equal(L.tvKeyAction('ArrowDown', true), 'down');
  assert.equal(L.tvKeyAction('ArrowUp', false), 'forward');
  assert.equal(L.tvKeyAction('ArrowDown', false), 'backward');
  assert.equal(L.tvKeyAction('ArrowLeft', false), 'turn_left');
  assert.equal(L.tvKeyAction('ArrowRight', false), 'turn_right');
  assert.equal(L.tvKeyAction('Enter', true), 'open');
  assert.equal(L.tvKeyAction('Backspace', true), 'back');
  assert.equal(L.tvKeyAction('Escape', false), 'back');
  assert.equal(L.tvKeyAction('h', true), 'toggle_hop');
  assert.equal(L.tvKeyAction('0', false), 'toggle_hop');
  assert.equal(L.tvKeyAction('q', true), null);
});

test('hop order: boards row, then desk rows front to back; left/right wrap, up/down clamp', () => {
  const t = [
    { kind: 'board', id: 'usage', x: 5 }, { kind: 'board', id: 'project', x: -2 }, { kind: 'board', id: 'needs', x: -12 },
    { kind: 'desk', id: 'd3', x: 3, z: 0 }, { kind: 'desk', id: 'd1', x: -3, z: -4 }, { kind: 'desk', id: 'd2', x: 3, z: -4 }, { kind: 'desk', id: 'd4', x: -3, z: 0 }
  ];
  const rows = L.hopRows(t);
  assert.deepEqual(rows.map(r => r.map(x => x.id)), [['needs', 'project', 'usage'], ['d1', 'd2'], ['d4', 'd3']]);
  assert.deepEqual(L.hopMove(rows, null, 'next'), { row: 0, col: 0 });
  assert.deepEqual(L.hopMove(rows, { row: 0, col: 2 }, 'next'), { row: 1, col: 0 });
  assert.deepEqual(L.hopMove(rows, { row: 0, col: 0 }, 'prev'), { row: 2, col: 1 });
  assert.deepEqual(L.hopMove(rows, { row: 0, col: 2 }, 'down'), { row: 1, col: 1 });
  assert.deepEqual(L.hopMove(rows, { row: 0, col: 1 }, 'up'), { row: 0, col: 1 });
  assert.deepEqual(L.hopMove(rows, { row: 2, col: 0 }, 'down'), { row: 2, col: 0 });
  assert.ok(L.GLIDE_MS < 1000, 'desk-to-desk glide under 1 s');
});

test('idle tour visits Needs Tim desks first and lingers longest there', () => {
  const t = [{ kind: 'board', id: 'project', x: 0 }, { kind: 'desk', bot: 'A', x: 0, z: 0 }, { kind: 'desk', bot: 'B', x: 1, z: 0 }, { kind: 'desk', bot: 'C', x: 2, z: 0 }];
  const tour = L.tourOrder(t, [{ bot: 'A', status: 'working' }, { bot: 'B', status: 'blocked' }, { bot: 'C', status: 'waiting_tim' }]);
  assert.deepEqual(tour.map(s => s.target.bot || s.target.id), ['C', 'project', 'A', 'B']);
  assert.ok(tour[0].dwellMs > tour[1].dwellMs && tour[1].dwellMs > tour[2].dwellMs);
});

test('checks, PR readiness, usage words and phone detection', () => {
  assert.equal(L.checkState([]), 'none');
  assert.equal(L.checkState([{ status: 'completed', conclusion: 'success' }, { status: 'in_progress' }]), 'pending');
  assert.equal(L.checkState([{ status: 'completed', conclusion: 'failure' }, { status: 'in_progress' }]), 'failing');
  assert.equal(L.summarizePull('r', { number: 1, draft: false }, 'passing').readyForTim, true);
  assert.equal(L.summarizePull('r', { number: 1, draft: true }, 'passing').readyForTim, false);
  assert.equal(L.usageWord(92).word, 'HIGH');
  assert.equal(L.usageWord(64).word, 'WATCH');
  assert.equal(L.usageWord(11).word, 'OK');
  assert.equal(L.usageWord(null).word, 'NO READING');
  assert.equal(L.usageStale({ as_of: ago(10) }, NOW), false);
  assert.equal(L.usageStale({ as_of: '' }, NOW), true);
  assert.equal(L.isPhoneLike({ coarse: true, width: 1920 }), true);
  assert.equal(L.isPhoneLike({ coarse: false, width: 390 }), true);
  assert.equal(L.isPhoneLike({ coarse: false, width: 1920 }), false);
  assert.equal(L.waitingMinutes(ago(24), NOW), 24);
  assert.equal(L.relTime(ago(5), NOW), '5m ago');
});

test('demo data shows every status and both pickup and conversation behaviours', () => {
  const d = L.parseStatus(L.demoStatus(NOW));
  for (const s of L.STATUSES) assert.ok(d.bots.some(b => b.status === s), s);
  assert.equal(d.bots.length, 14);
  assert.ok(L.recentConversations(d.conversations, NOW).length > 0);
  const n = L.parseStatus(L.demoNextStatus(L.demoStatus(NOW), NOW + 5000));
  assert.ok(L.diffItems(d.items, n.items).length >= 2);
});

test('bot names match the Grok Bot sidebar; older names are mapped', () => {
  assert.equal(L.canonicalBot('Usage Ctrl'), 'Usage Budget');
  assert.equal(L.canonicalBot('dr eggbot'), 'HR - Bot Trainer');
  assert.equal(L.canonicalBot(' Archive '), 'Archive \u00b7 Application State Tracker');
  assert.equal(L.canonicalBot('QA bot'), 'QA bot');
  const bots = L.parseStatus({ bots: [{ bot: 'Usage Ctrl', status: 'idle' }, { bot: 'Usage Budget', status: 'working' }] }).bots;
  assert.deepEqual(bots.map(b => b.bot), ['Usage Budget']);
  const demo = L.demoStatus(NOW).bots.map(b => b.bot);
  for (const n of ['Usage Budget', 'HR - Bot Trainer', 'Archive \u00b7 Application State Tracker']) assert.ok(demo.includes(n), n);
  for (const n of ['Usage Ctrl', 'dr eggbot', 'Archive']) assert.ok(!demo.includes(n), n);
});

test('renamed bots are matched by bot_id first', () => {
  assert.equal(L.canonicalBot('Old Name', 'f1a70b7a-6051-45d7-8031-e46a4cba066f'), 'Usage Budget');
  assert.equal(L.canonicalBot('x', '372936ae-81e1-4013-b0d0-9ee47d97a3c4'), 'HR - Bot Trainer');
  assert.equal(L.canonicalBot('Archive', 'c95408dd-c07f-460e-aaa0-9d515fe5be7d'), 'Archive \u00b7 Application State Tracker');
  assert.equal(L.canonicalBot('Root', '70f0889b-ecd4-457b-a69c-304cd2aff540'), 'Root');
});

test('avatars are keyed by bot_id; HR - Bot Trainer has a normal shape; Archive has a short tag', async () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../office/avatars.js'), 'utf8');
  const A = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  for (const id of Object.values(A.BOT_IDS)) assert.ok(A.AVATARS[id], id);
  for (const k of Object.keys(A.AVATARS)) assert.match(k, /^[0-9a-f-]{36}$/);
  const hr = A.avatarFor('Anything', '372936ae-81e1-4013-b0d0-9ee47d97a3c4');
  assert.notEqual(hr.shape, 'egg'); assert.equal(hr.color, '#8f6ee8');
  assert.deepEqual(A.avatarFor('Usage Ctrl', 'f1a70b7a-6051-45d7-8031-e46a4cba066f'), A.avatarFor('Usage Budget'));
  assert.equal(A.shortTag('Archive \u00b7 Application State Tracker'), 'Archive');
  assert.equal(A.shortTag('Usage Budget'), 'Usage Budget');
});

test('older bot names in items and conversations map to the sidebar names', () => {
  const p = L.parseStatus({ updated_at: ago(1), bots: [{ bot: 'Usage Ctrl', bot_id: 'f1a70b7a-6051-45d7-8031-e46a4cba066f' }, { bot: 'Claude', bot_id: 'd4118f0c-1b06-4e9a-982f-f5314451c841' }],
    items: [{ id: 'u', title: 'Usage', owner: 'Usage Ctrl' }], conversations: [{ from: 'Usage Ctrl', to: 'Claude', text: 'hi', at: ago(1) }] });
  assert.equal(p.bots[0].bot, 'Usage Budget');
  assert.equal(p.items[0].owner, 'Usage Budget'); assert.equal(p.items[0].ownerKnown, true);
  assert.deepEqual(p.conversations.map(c => c.from), ['Usage Budget']);
});

/* ---------- v2: screen, meetings, Needs Tim links, floor plan ---------- */
const ID = { claude: 'd4118f0c-1b06-4e9a-982f-f5314451c841', hr: '372936ae-81e1-4013-b0d0-9ee47d97a3c4', comp: '424e5611-fb8f-4ae1-a360-051e61e63e8a' };
test('screen: parsed tolerantly, at most 6 lines, falls back to null', () => {
  const s = L.parseScreen({ title: 'build', lines: ['a', 2, null, { x: 1 }, 'b\nc', 'd', 'e', 'f', 'g'], updated_at: ago(1) });
  assert.deepEqual(s.lines, ['a', '2', 'b c', 'd', 'e', 'f']);
  assert.equal(s.title, 'build'); assert.equal(s.updated_at, ago(1));
  assert.equal(L.parseScreen({ title: 'only title', updated_at: 'nope' }).updated_at, '');
  assert.equal(L.parseScreen({ lines: ['x'.repeat(500)] }).lines[0].length, 160);
  for (const bad of [null, 'text', [], 7, {}, { title: '', lines: [] }, { title: 3, lines: ['  '] }]) assert.equal(L.parseScreen(bad), null);
  const p = L.parseStatus({ bots: [{ bot: 'Claude', bot_id: ID.claude, status: 'working', screen: { title: 't', lines: ['l1'] } }, { bot: 'Comp', status: 'idle', screen: 'bad' }] });
  assert.deepEqual(p.bots[0].screen.lines, ['l1']); assert.equal(p.bots[1].screen, null);
});
test('monitor mode: President keeps the checksheet and Usage Budget the usage chart whatever screen says', () => {
  const scr = { title: 'chat', lines: ['hello'] };
  assert.equal(L.monitorMode({ bot: 'President', screen: scr }, 'game'), 'president');
  assert.equal(L.monitorMode({ bot: 'Boss', bot_id: '431e8cf1-f077-4548-82b7-46c1959dc4c9', screen: scr }), 'president');
  assert.equal(L.monitorMode({ bot: 'Usage Budget', screen: scr }), 'usage');
  assert.equal(L.monitorMode({ bot: 'Usage Budget' }, '', { image: true }), 'mirror', 'Usage Budget mirrors its screen when one is published');
  assert.equal(L.monitorMode({ bot: 'Comp', routine: { name: 'r' } }, 'work', { image: true }), 'routine');
  assert.equal(L.monitorMode({ bot: 'Comp', screen: scr }, 'game'), 'game');
  assert.equal(L.monitorMode({ bot: 'Comp', screen: scr }, 'work'), 'screen');
  assert.equal(L.monitorMode({ bot: 'Comp', screen: null }, 'work'), 'terminal');
});
test('meetings: members by name, alias or bot_id; unknown bots and empty meetings dropped; bad input -> []', () => {
  const bots = L.parseStatus({ bots: [{ bot: 'Claude', bot_id: ID.claude }, { bot: 'Comp', bot_id: ID.comp }, { bot: 'dr eggbot', bot_id: ID.hr }] }).bots;
  const m = L.parseMeetings([
    { id: 'm1', title: 'Stand-up', members: [ID.claude, 'Comp', 'dr eggbot', 'Ghost', 7, 'Comp'], started_at: ago(5), chat_id: '' },
    { id: 'm2', members: ['Ghost'] }, null, 'x', { members: 'Claude' }, { title: '', members: ['Comp'], started_at: 'soon' }
  ], bots);
  assert.deepEqual(m.map(x => [x.id, x.title, x.members]), [['m1', 'Stand-up', ['Claude', 'Comp', 'HR - Bot Trainer']], ['meeting-2', 'Meeting', ['Comp']]]);
  assert.equal(m[1].started_at, '');
  for (const bad of [undefined, null, {}, 'meet']) assert.deepEqual(L.parseMeetings(bad, bots), []);
  assert.deepEqual(L.parseStatus({ bots: [] }).meetings, []);
  assert.equal(L.parseStatus({ bots: [{ bot: 'Comp' }], meetings: [{ members: ['Comp'] }] }).meetings.length, 1);
});
test('Needs Tim link: PR link, else the bot chat link, else the bot name with no link', () => {
  const items = L.parseItems([{ id: 'a', title: 'Fix', priority: 'Needs Tim', status: 'needs_tim', question: 'ok?', owner: 'QA bot', link: 'https://github.com/o/r/pull/63' }]);
  assert.deepEqual(L.needsTarget({ link: 'https://github.com/o/r/pull/9', bot: 'Root', bot_id: 'r1' }), { href: 'https://github.com/o/r/pull/9', kind: 'pr', label: 'Root' });
  assert.equal(L.needsTarget({ bot: 'QA bot', bot_id: 'q1', items }).href, 'https://github.com/o/r/pull/63');
  assert.deepEqual(L.needsTarget({ bot: 'Root', bot_id: 'r 1' }), { href: 'grokbot://app/v1/agent?id=r%201', kind: 'chat', label: 'Root' });
  assert.deepEqual(L.needsTarget({ bot: 'Contractor' }), { href: '', kind: 'none', label: 'Contractor' });
  assert.equal(L.needsTarget({ link: 'javascript:alert(1)', bot: 'X' }).href, '');
  assert.equal(L.needsTarget({ link: 'https://example.com/asks', bot: 'X', bot_id: 'x' }).kind, 'link');
  assert.equal(L.needsTarget({ link: 'grokbot://app/v1/agent?id=z' }).kind, 'chat');
  assert.equal(L.chatLink(''), ''); assert.equal(L.isPrLink('https://github.com/o/r/pulls'), false);
});
test('floor plan: only a needs-Tim bot with a question waves; meetings beat work; idle bots pick from the busy mix', () => {
  const B = (bot, status, question) => ({ bot, status, question: question || '' });
  const bots = L.parseStatus({ bots: [B('Root', 'waiting_tim', 'key?'), B('QA bot', 'blocked'), B('Claude', 'working'), B('Software', 'working'),
    B('Sniffer', 'waiting'), B('Comp', 'needs_tim'), B('GUI', 'idle'), B('ChatGPT', 'idle'), B('Gauge', 'queued')] }).bots;
  const meetings = [{ id: 'm', title: 'x', members: ['Software', 'Root'] }];
  const p = L.planOffice(bots, meetings, NOW, 'live');
  assert.equal(p.plans.Root.act, 'wave');
  for (const n of ['QA bot', 'Sniffer', 'Comp', 'Gauge']) assert.notEqual(p.plans[n].act, 'wave', n + ' must not raise a hand');
  assert.deepEqual(p.plans.Software, { act: 'meeting', seat: 0, meeting: 'm' });
  assert.deepEqual(p.meeting.seated, ['Software']);
  for (const n of ['Sniffer', 'Comp', 'GUI', 'ChatGPT', 'Gauge']) assert.ok(L.IDLE_ACTS.concat('train', 'listen').includes(p.plans[n].act), n + ':' + p.plans[n].act);
  const chat = Object.entries(p.plans).filter(([, v]) => v.act === 'chat');
  if (chat.length) { assert.equal(chat[0][1].partner, chat[1][0]); assert.notEqual(chat[0][1].host, chat[1][1].host); }
  assert.deepEqual(L.planOffice(bots, [], NOW, 'failed').plans, {});
})
test('floor plan: HR - Bot Trainer visits idle bots, and trains two at the table only when no meeting holds it', () => {
  const bots = [{ bot: 'HR - Bot Trainer', status: 'idle' }, { bot: 'Comp', status: 'idle' }, { bot: 'GUI', status: 'idle' }, { bot: 'Claude', status: 'working' }];
  const base = Math.floor(NOW / 1000 / L.TRAIN_CYCLE_S) * L.TRAIN_CYCLE_S * 1000;
  const train = L.planOffice(bots, [], base + 5000, 'live');
  assert.equal(train.plans['HR - Bot Trainer'].act, 'lead');
  assert.deepEqual(train.training.trainees.slice().sort(), ['Comp', 'GUI']);
  assert.ok(['work', 'coffee', 'fridge', 'visitdesk'].includes(train.plans.Claude.act));
  const visit = L.planOffice(bots, [], base + (L.TRAIN_S + 1) * 1000, 'live');
  const v = visit.plans['HR - Bot Trainer'];
  assert.equal(v.act, 'visit'); assert.ok(['Comp', 'GUI'].includes(v.partner));
  assert.deepEqual([visit.plans[v.partner].act, visit.plans[v.partner].partner], ['listen', 'HR - Bot Trainer']);
  const meet = L.planOffice(bots, [{ id: 'm', title: 'x', members: ['Claude'] }], base + 5000, 'live');
  assert.equal(meet.plans['HR - Bot Trainer'].act, 'visit', 'no training while a meeting holds the table');
  assert.ok(['work', 'coffee', 'fridge', 'visitdesk'].includes(L.planOffice([{ bot: 'HR - Bot Trainer', status: 'working' }, { bot: 'Comp', status: 'idle' }], [], base + 5000, 'live').plans['HR - Bot Trainer'].act));
});
test('ambient chatter is generic, deterministic and never empty', () => {
  for (const k of ['chat', 'visit', 'reply', 'train', 'other']) { const a = L.ambientLine(k, 'seed', 3); assert.ok(a && a === L.ambientLine(k, 'seed', 3)); }
  assert.notEqual(L.ambientLine('chat', 'seed', 1), L.ambientLine('chat', 'seed', 2));
});
test('demo v2: screens, a meeting that ends on the next poll, PR-linked, chat-linked and unlinked Needs Tim entries, all EXAMPLE', () => {
  const d = L.demoStatus(NOW), p = L.parseStatus(d);
  assert.ok(p.bots.filter(b => b.screen).length >= 3);
  assert.ok(p.bots.filter(b => b.screen && b.bot !== 'Claude').every(b => /^EXAMPLE/.test(b.screen.title)));
  assert.equal(p.bots.find(b => b.bot === 'Comp').screen, null);
  const n1 = L.demoNextStatus(d, NOW + 6000), n2 = L.demoNextStatus(n1, NOW + 60000), m1 = L.parseStatus(n1).meetings;
  assert.deepEqual(p.meetings, []); assert.deepEqual(n2.meetings, []);
  assert.deepEqual(m1[0].members, ['Software', 'ChatGPT', 'Comp']); assert.match(m1[0].title, /^EXAMPLE/);
  assert.equal(n2.items.filter(i => i.id === 'ex-64').length, 1);
  assert.ok(p.needsTim.every(n => /EXAMPLE/.test(n.text)));
  const qa = p.items.find(i => i.owner === 'QA bot');
  assert.equal(L.needsTarget({ bot: 'QA bot', bot_id: 'x', items: p.items }).href, qa.link);
  assert.equal(L.needsTarget({ bot: p.needsTim[1].bot }).kind, 'none');
  const cyc = Math.floor(NOW / 1000 / L.TRAIN_CYCLE_S) * L.TRAIN_CYCLE_S * 1000, seen = new Set();
  for (let t = 0; t < 3600; t += 37) Object.values(L.planOffice(p.bots, [], cyc + 3600000 + t * 1000, 'live').plans).forEach(v => seen.add(v.act));
  assert.ok(['chat', 'wander', 'coffee', 'fridge', 'lounge', 'visit', 'listen', 'wave'].every(a => seen.has(a)), [...seen].join());
  assert.equal(L.planOffice(p.bots, [], cyc + 1000, 'live').plans['HR - Bot Trainer'].act, 'lead');
});
