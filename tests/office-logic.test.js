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
  assert.deepEqual(p.needsTim, [{ text: 'Approve key', link: 'https://x/1' }]);
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
  for (const s of ['blocked', 'waiting_tim']) {
    const st = L.statusStyle(s);
    assert.equal(st.color, '#ff4b4b'); assert.equal(st.flag, true); assert.equal(st.glyph, '⚠');
  }
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
  assert.equal(c('waiting_tim'), 'needs_tim');
  assert.equal(c('blocked'), 'needs_tim');
  assert.equal(c('working', 'Needs Tim'), 'needs_tim');
  assert.equal(c('review'), 'review');
  assert.equal(c('working', 'PR merge queue'), 'review');
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
  assert.deepEqual(b.map(r => r.project), ['Job pipeline', '3D office', 'Bitcoin', 'Garden']);
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
  assert.equal(long.length, 80); assert.ok(long.endsWith('…'));
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
  assert.deepEqual(tour.map(s => s.target.bot || s.target.id), ['B', 'C', 'project', 'A']);
  assert.ok(tour[0].dwellMs > tour[2].dwellMs && tour[2].dwellMs > tour[3].dwellMs);
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
  assert.equal(d.bots.length, 12);
  assert.ok(L.recentConversations(d.conversations, NOW).length > 0);
  const n = L.parseStatus(L.demoNextStatus(L.demoStatus(NOW), NOW + 5000));
  assert.ok(L.diffItems(d.items, n.items).length >= 2);
});
