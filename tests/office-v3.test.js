// 3D office v3 logic (office/office-logic.js). Run: node --test tests/office-v3.test.js. Fixtures are EXAMPLE data only.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const fx = f => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const NOW = Date.parse('2026-11-16T07:10:00Z');
const MIN = 60000;

/* ---------- item 23: freshness ---------- */
function res(status, body, headers) {
  const h = new Map(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return { status, ok: status >= 200 && status < 300, headers: { get: k => (h.has(k.toLowerCase()) ? h.get(k.toLowerCase()) : null) }, text: async () => body };
}
test('status source: API with ETag; 304 keeps the data; 403 falls back to raw until the reset', async () => {
  const calls = [], gate = L.createGate();
  const queue = [res(200, '{"v":1}', { ETag: '"e1"', 'X-RateLimit-Remaining': 50 }), res(304, '', { 'X-RateLimit-Remaining': 49 }),
    res(403, 'rate', { 'X-RateLimit-Remaining': 0, 'X-RateLimit-Reset': Math.floor((NOW + 30 * MIN) / 1000) }), res(200, '{"v":"raw"}'), res(200, '{"v":"raw2"}')];
  const src = L.createJsonSource({ apiUrl: 'https://api.github.com/x', rawUrl: 'https://raw.githubusercontent.com/x', gate,
    fetch: async (u, o) => { calls.push([u, o.headers || {}]); return queue.shift(); } });
  assert.deepEqual(await src.get(NOW), { ok: true, data: { v: 1 }, source: 'api' });
  const r2 = await src.get(NOW + MIN);
  assert.equal(r2.notModified, true); assert.deepEqual(r2.data, { v: 1 });
  assert.equal(calls[1][1]['If-None-Match'], '"e1"'); assert.equal(calls[1][1].Accept, 'application/vnd.github.raw');
  const r3 = await src.get(NOW + 2 * MIN);
  assert.deepEqual([r3.source, r3.data.v], ['raw', 'raw']); assert.match(calls[3][0], /^https:\/\/raw\.githubusercontent\.com\/x\?t=/);
  const r4 = await src.get(NOW + 3 * MIN);
  assert.equal(r4.source, 'raw', 'stays on raw until X-RateLimit-Reset'); assert.equal(calls.length, 5);
  assert.equal(gate.open(NOW + 31 * MIN), true);
});
test('status source: low remaining budget also switches to raw', async () => {
  const gate = L.createGate();
  gate.note(res(200, '', { 'X-RateLimit-Remaining': L.RATE_LOW, 'X-RateLimit-Reset': Math.floor((NOW + 10 * MIN) / 1000) }), NOW);
  assert.equal(gate.open(NOW), false); assert.equal(gate.open(NOW + 11 * MIN), true);
});
test('data age: "updated N min ago", stale over 10 minutes', () => {
  assert.deepEqual([L.dataAge(new Date(NOW - 2 * MIN).toISOString(), NOW).text, L.dataAge(new Date(NOW - 2 * MIN).toISOString(), NOW).stale], ['updated 2 min ago', false]);
  assert.equal(L.dataAge(new Date(NOW - 11 * MIN).toISOString(), NOW).stale, true);
});
test('unknown project names map to the closest known project, else Other', () => {
  assert.equal(L.mapProject('Job pipeline app (main)'), 'Job pipeline');
  assert.equal(L.mapProject('3D interactive office'), '3D office');
  assert.equal(L.mapProject('Bitcoin trader'), 'Bitcoin');
  assert.equal(L.mapProject('Garden shed'), 'Other'); assert.equal(L.mapProject(''), 'Other');
  const items = L.parseItems([{ id: 'a', title: 'x', project: 'Garden shed' }]);
  assert.ok(L.projectTabs(items).includes(items[0].project), 'never stranded on a hidden tab');
});

/* ---------- item 16 + 12: status rules and self-clearing Needs Tim ---------- */
const S = L.parseStatus(JSON.parse(fx('office-status-v3.example.json')));
const bot = n => S.bots.find(b => b.bot === n);
test('status rules: "waiting" never raises a hand; needs_tim needs a question; blocked is never Needs Tim', () => {
  assert.equal(bot('QA').status, 'idle'); assert.equal(L.statusStyle(bot('QA').status).alert, false);
  assert.equal(L.normStatus('waiting'), 'idle'); assert.equal(L.normStatus('queued'), 'idle');
  assert.equal(bot('Comp').status, 'idle'); assert.match(bot('Comp').why, /no question/);
  assert.equal(bot('Cursor').status, 'waiting_tim'); assert.equal(L.statusStyle('waiting_tim').alert, true);
  assert.equal(L.statusStyle('blocked').alert, false);
});
test('Needs Tim list: resolved, expired, merged drop off; open PR -> review queue; dedupe; empty state', () => {
  const states = new Map([['tpruittguitar/foreman-cockpit#306', 'merged'], ['tpruittguitar/foreman-cockpit#311', 'open']]);
  const pulls = [{ repo: 'foreman-cockpit', number: 311, title: 'dup', url: 'https://github.com/tpruittguitar/foreman-cockpit/pull/311', draft: false, checks: 'passing' },
    { repo: 'foreman-cockpit', number: 312, title: 'draft one', url: 'https://github.com/tpruittguitar/foreman-cockpit/pull/312', draft: true, checks: 'failing' }];
  const n = L.needsList({ bots: S.bots, entries: S.needsTim.map((e, i) => Object.assign({}, e, JSON.parse(fx('office-status-v3.example.json')).needs_tim[i])), prStates: states, pulls, now: NOW, demo: true });
  assert.deepEqual(n.needs.map(x => x.text), ['Cursor: EXAMPLE real question', 'EXAMPLE open ask']);
  assert.deepEqual(n.review.map(x => x.pr), ['tpruittguitar/foreman-cockpit#311', 'tpruittguitar/foreman-cockpit#312'], 'open PR once (deduped); never on Needs Tim');
  const live = L.needsList({ bots: S.bots, entries: [{ text: 'EXAMPLE x' }], now: NOW, demo: false });
  assert.equal(live.needs.length, 0, 'EXAMPLE rows never in the live view'); assert.equal(live.empty, true);
});
test('needs_tim fields resolved / resolved_at / expires_at are parsed through', () => {
  const p = L.parseStatus({ bots: [], needs_tim: [{ text: 'a', resolved: true }, { text: 'b', resolved_at: '2026-11-16T00:00:00Z' }, { text: 'c', expires_at: '2026-11-17T00:00:00Z' }] });
  assert.deepEqual(L.needsList({ entries: p.needsTim, now: NOW }).needs.map(x => x.text), ['c']);
});
test('PR-linked cards follow the live PR state: merged/closed -> Done, open -> Review / merge queue', () => {
  const items = L.parseItems([{ id: 'a', title: 'A', status: 'needs_tim', question: 'q', link: 'https://github.com/o/r/pull/1' }, { id: 'b', title: 'B', status: 'in_progress', link: 'https://github.com/o/r/pull/2' }, { id: 'c', title: 'C', status: 'queued', link: 'https://github.com/o/r/pull/3' }]);
  const st = L.prStates('o', 'r', [{ number: 1, state: 'open' }, { number: 2, state: 'closed', merged_at: '2026-11-16T00:00:00Z' }, { number: 3, state: 'closed', merged_at: null }]);
  const out = L.applyPrStates(items, st);
  assert.deepEqual(out.map(L.columnFor), ['in_progress', 'done', 'done']);
  assert.equal(L.statusWord(out[0]).word, 'REVIEW / MERGE QUEUE'); assert.equal(L.statusWord(out[1]).word, 'MERGED');
});

/* ---------- item 18: whole checksheet ---------- */
test('board: 80 cards across 3 projects; tabs filter, Done collapsed, columns never overflow', () => {
  const projects = ['Job pipeline app (main)', '3D interactive office', 'Bitcoin trader'], statuses = ['needs_tim', 'in_progress', 'queued', 'done'];
  const raw = Array.from({ length: 80 }, (_, i) => ({ id: 'cs-' + i, title: 'EXAMPLE card ' + i, status: statuses[i % 4], question: i % 8 === 0 ? 'q?' : '', project: projects[i % 3], source: 'checksheet', owner: 'Root', note: 'EXAMPLE note' }));
  const items = L.parseItems(raw);
  assert.deepEqual(L.projectTabs(items), ['All', 'Job pipeline', '3D office', 'Bitcoin']);
  const all = L.boardView(items, { tab: 'All', max: 6 });
  assert.deepEqual(all.map(c => c.id), ['needs_tim', 'in_progress', 'queued', 'done']);
  const done = all.find(c => c.id === 'done');
  assert.equal(done.collapsed, true); assert.equal(done.cards.length, 0); assert.equal(done.total, 20);
  assert.equal(all.find(c => c.id === 'needs_tim').total, 10, 'only needs_tim cards with a question');
  for (const c of all) assert.ok(c.cards.length <= 6 && c.cards.length + c.more === (c.collapsed ? 0 : c.total));
  const btc = L.boardView(items, { tab: 'Bitcoin', doneOpen: true });
  assert.ok(btc.every(c => c.cards.every(i => i.project === 'Bitcoin')));
  assert.equal(btc.reduce((n, c) => n + c.total, 0), items.filter(i => i.project === 'Bitcoin').length);
  assert.equal(items[0].note, 'EXAMPLE note');
});

/* ---------- item 22: spacing ---------- */
test('board slots are unique and >= 0.8 m apart for any N', () => {
  for (const n of [1, 5, 14, 20]) {
    const s = L.boardSlots(n, -2, -8.8, 8);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z) >= L.MIN_SEP - 1e-9, n + ':' + i + ',' + j);
  }
});
test('14 bots for several minutes of ticks: no pair closer than MIN_SEP, no two share a slot', () => {
  const book = L.createSlotBook(), slots = L.boardSlots(14, -2, -8.8, 8).map((p, i) => Object.assign({ id: 'b' + i }, p))
    .concat([{ id: 'coffee1', x: 9.5, z: -6 }, { id: 'coffee2', x: 9.5, z: -5.1 }, { id: 'fridge', x: 9.5, z: -7.8 }, { id: 'sofa1', x: 9, z: 4 }, { id: 'sofa2', x: 9, z: 5 }]);
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bots = Array.from({ length: 14 }, (_, i) => ({ name: 'B' + i, x: -8 + i, z: 3, goal: null }));
  let minSeen = Infinity;
  for (let tick = 0; tick < 5 * 60 * 10; tick++) { // 5 min at 10 ticks/s
    for (const b of bots) {
      if (!b.goal || rnd() < 0.004) { const free = slots.filter(s => !book.holder(s.id)); const s = free[Math.floor(rnd() * free.length)]; if (s && book.take(s.id, b.name)) b.goal = s; }
      const dx = b.goal.x - b.x, dz = b.goal.z - b.z, d = Math.hypot(dx, dz), st = Math.min(d, 0.135);
      if (d > 1e-6) { b.x += dx / d * st; b.z += dz / d * st; }
    }
    L.separate(bots, L.MIN_SEP, 12);
    for (let i = 0; i < 14; i++) for (let j = i + 1; j < 14; j++) minSeen = Math.min(minSeen, Math.hypot(bots[i].x - bots[j].x, bots[i].z - bots[j].z));
    const held = bots.map(b => book.slotOf(b.name)).filter(Boolean);
    assert.equal(new Set(held).size, held.length, 'slot shared');
  }
  assert.ok(minSeen >= L.MIN_SEP - 0.01, 'min distance ' + minSeen);
});
test('walking cap: never more than a third of the bots walking at once', () => {
  const reqs = Array.from({ length: 10 }, (_, i) => ({ name: 'b' + i, since: i }));
  assert.equal(L.walkCap(14), 4); assert.equal(L.admitWalkers(reqs, 0, 14).size, 4); assert.equal(L.admitWalkers(reqs, 3, 14).size, 1); assert.equal(L.admitWalkers(reqs, 5, 14).size, 0);
  assert.ok(L.admitWalkers(reqs, 2, 14).has('b0'), 'longest waiting first');
});

/* ---------- item 13: data-driven roster ---------- */
test('desk layout scales to N bots without overlaps; extra unknown bot gets a desk, removed bot loses it', () => {
  for (const n of [1, 12, 14, 15, 18]) {
    const d = L.deskLayout(n); assert.equal(d.length, n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(Math.abs(d[i].x - d[j].x) >= 3 || Math.abs(d[i].z - d[j].z) >= 3);
    assert.ok(d.every(p => p.x > -11 && p.x < 7 && p.z < 7.5));
  }
  const names = S.bots.map(b => b.bot);
  assert.ok(names.includes('Newbie')); assert.equal(L.deskLayout(names.length).length, names.length);
  assert.equal(bot('Newbie').bot_id, '99999999-0000-4000-8000-000000000001', 'bots[].id accepted');
  assert.deepEqual([bot('Newbie').avatar_shape, bot('Newbie').avatar_color], ['flower', 'green']);
  const fewer = L.parseStatus({ bots: S.bots.filter(b => b.bot !== 'Newbie').map(b => ({ bot: b.bot, bot_id: b.bot_id })) }).bots;
  assert.equal(L.deskLayout(fewer.length).length, names.length - 1);
});

test("Tim's desk rule: President and the whole back row sit where the v2 layout had them", () => {
  const roster = ['President', 'Root', 'Cursor', 'GUI', 'QA', 'Sniffer', 'Comp', 'Archive', 'Claude', 'ChatGPT', 'Usage', 'HR', 'Gauge', 'Edgar'];
  for (const names of [roster, roster.slice().reverse(), roster.slice(0, 9)]) {
    const d = L.deskLayout(names.length, names), at = n => { const p = d[names.indexOf(n)]; return [p.x, p.z]; };
    assert.deepEqual(at('Claude'), [-8.6, -4]); assert.deepEqual(at('Cursor'), [-5.4, -4]);
    assert.deepEqual(at('Comp'), [-2.2, -4]); assert.deepEqual(at('GUI'), [1, -4]);
    assert.deepEqual(at('President'), [-5.4, -0.6]);
    assert.equal(d.filter(p => p.z === -4).length, 4, 'back row holds only the four v2 back-row bots');
    for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) assert.ok(Math.abs(d[i].x - d[j].x) >= 3 || Math.abs(d[i].z - d[j].z) >= 3);
  }
});

/* ---------- busy office + replay ---------- */
test('idle schedule: changes every 2-3 min, staggered per bot, sleep+game <= 25%, moving acts favoured', () => {
  const names = ['Root', 'GUI', 'Comp', 'Sniffer', 'Claude', 'ChatGPT', 'Gauge', 'Edgar'];
  for (const n of names) { const s = L.idleSlot(n, NOW); assert.ok(s.dur >= 120 && s.dur <= 180, n + ' ' + s.dur); }
  const switches = names.map(n => { let t = NOW; const a = L.idleSlot(n, t).idx; while (L.idleSlot(n, t).idx === a) t += 1000; return t; });
  assert.ok(new Set(switches).size >= names.length - 1, 'staggered');
  let lazy = 0, moving = 0, total = 0;
  for (const n of names) for (let k = 0; k < 400; k++) { const a = L.idleAct(n, NOW + k * 150000); total++; if (a === 'sleep' || a === 'game') lazy++; if (['wander', 'coffee', 'fridge', 'chat', 'visitdesk', 'lounge', 'bike'].includes(a)) moving++; }
  assert.ok(lazy / total <= 0.25, 'lazy ' + lazy / total); assert.ok(moving / total >= 0.6);
  let breaks = 0; for (let s = 0; s < 3600; s += 5) if (L.workBreak('Claude', NOW + s * 1000)) breaks++;
  assert.ok(breaks * 5 >= 360 && breaks * 5 <= 900, 'working bots take short breaks every 4-6 min: ' + breaks * 5 + ' s/h');
});
test('replay: idle bot replays its last action for RECENT_REPLAY_MIN minutes, then falls back to idle life', () => {
  const b = { bot: 'GUI', status: 'idle', last_action: 'Fixed card contrast', last_action_at: new Date(NOW - 29 * MIN).toISOString() };
  assert.equal(L.RECENT_REPLAY_MIN, 30);
  assert.deepEqual(L.replayFor(b, NOW), { act: 'replay', min: 29, text: 'Fixed card contrast' });
  assert.equal(L.replayFor(Object.assign({}, b, { last_action_at: new Date(NOW - 30 * MIN).toISOString() }), NOW), null);
  assert.equal(L.replayFor(Object.assign({}, b, { last_action: 'Pinned a card on the board' }), NOW).act, 'replay_board');
  assert.equal(L.replayFor(Object.assign({}, b, { status: 'working' }), NOW), null);
  const p = L.planOffice([b], [], NOW, 'live'); assert.equal(p.plans.GUI.act, 'replay');
  assert.notEqual(L.planOffice([b], [], NOW + 2 * MIN, 'live').plans.GUI.act, 'replay');
});

/* ---------- usage readings ---------- */
const READ = ['{"at":"2026-11-16T01:09:30Z","provider":"CLAUDE","meter":"weekly","label":"weekly (all models)","usedPct":20,"status":"OK"}',
  '{"at":"2026-11-16T07:08:54Z","provider":"CLAUDE","meter":"weekly","label":"weekly (all models)","usedPct":27,"resetsAt":"2026-11-22T16:00:00Z","status":"OK"}',
  '{"at":"2026-11-16T07:08:54Z","provider":"CHATGPT","meter":"weekly","label":"weekly","usedPct":76,"status":"OK"}', 'garbage',
  '{"at":"2026-11-15T13:00:00Z","provider":"GROK","meter":"weekly","label":"weekly SuperGrok","usedPct":null,"status":"UNREADABLE"}'].join('\n');
test('usage: latest reading per provider, Measured time, countdown to the next scheduled check, stale after a missed cycle', () => {
  const r = L.parseReadings(READ), latest = L.latestPerProvider(r);
  assert.equal(latest.CLAUDE.usedPct, 27); assert.equal(r.length, 4);
  assert.equal(L.etClock(Date.parse(latest.CLAUDE.at)), '2:08 AM');
  // 2:10 AM ET -> next check 8:05 AM ET
  assert.equal(L.countdown(L.nextCheck(NOW), NOW), 'Next check in 5h 55m');
  assert.equal(new Date(L.nextCheck(Date.parse('2026-11-16T01:30:00Z'))).toISOString(), '2026-11-16T07:05:00.000Z');
  assert.equal(L.readingStale(latest.CLAUDE, NOW), false);
  assert.equal(L.readingStale(latest.CLAUDE, Date.parse('2026-11-16T13:40:00Z')), true, '8:05 check + 30 min grace missed');
  const rows = L.usageRows(r, NOW, null);
  assert.deepEqual(rows.map(x => [x.name, x.pct_used, x.stale]), [['Claude', 27, false], ['ChatGPT', 76, false], ['Grok', null, true]]);
  assert.ok(rows.every(x => /^Measured \d{1,2}:\d\d (AM|PM) ET$/.test(x.measured) && /^Next check in \d+h \d+m$/.test(x.next)));
  assert.equal(L.usageLatest(rows), Math.max(...rows.map(x => x.at)), 'one latest time for monitor and wall');
  assert.match(L.usageHeader(rows, NOW), /^Latest reading \d{1,2}:\d\d (AM|PM) ET · /);
  assert.equal(L.usageHeader([], NOW), 'No usage reading yet');
  assert.equal(L.usageRows([], NOW, { as_of: '2026-11-16T06:37:00Z', services: [{ name: 'Claude', pct_used: 27 }] })[0].source, 'OFFICE_STATUS.json', 'fallback only when no readings');
});

/* ---------- screens, president chat, click targets ---------- */
test('screens index parse and the fallback / stale / paused rules', () => {
  const ix = L.parseScreensIndex(JSON.parse(fx('office-screens-index.example.json')));
  assert.deepEqual(Object.keys(ix.screens).sort(), ['338fc1b1-fecc-475d-ba9e-acd49bcadcfc', 'a8b4a0b2-acfd-4485-8444-7ab27007df4a', 'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f']);
  assert.equal(L.screenState(ix, 'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f', NOW).show, 'image');
  assert.match(L.screenState(ix, 'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f', NOW).why, /^Screen as of 2:00 AM ET$/);
  assert.equal(L.screenState(ix, 'a8b4a0b2-acfd-4485-8444-7ab27007df4a', NOW).show, 'fallback', 'older than 15 min');
  assert.equal(L.screenState(ix, '338fc1b1-fecc-475d-ba9e-acd49bcadcfc', NOW).why, 'Screen paused');
  assert.equal(L.screenState(ix, 'nobody', NOW).why, 'Screen offline');
  for (const bad of [null, [], 'x', { screens: [] }]) assert.deepEqual(L.parseScreensIndex(bad).screens, {});
});
test('offline screen: last frame stays an image, dimmed, labeled from lastSeen in ET', () => {
  const at = '2026-11-16T07:00:00Z', lastSeen = '2026-11-16T01:50:00Z';
  const ix = o => L.parseScreensIndex({ updated_at: at, screens: { 'id-1': Object.assign({ at }, o) } });
  const rec = ix({ offline: true, lastSeen, busy: true }).screens['id-1'];
  assert.equal(rec.offline, true);
  assert.equal(rec.lastSeen, lastSeen);
  const st = L.screenState(ix({ offline: true, lastSeen }), 'id-1', NOW);
  assert.equal(st.show, 'image');
  assert.equal(st.offline, true);
  assert.equal(st.why, 'screen offline since 8:50 PM ET');
  assert.equal(L.offlineSinceLabel(lastSeen), 'screen offline since 8:50 PM ET');
  assert.equal(L.offlineSinceLabel('nope'), 'screen offline');
  assert.equal(L.offlineSinceLabel(undefined), 'screen offline');
  const staleOff = L.screenState(ix({ at: '2026-11-16T06:00:00Z', offline: true, lastSeen }), 'id-1', NOW);
  assert.equal(staleOff.show, 'image', 'offline keeps the last frame even when at is older than 15 min');
  assert.equal(staleOff.why, 'screen offline since 8:50 PM ET');
  const pausedOff = L.screenState(ix({ offline: true, paused: true, lastSeen }), 'id-1', NOW);
  assert.equal(pausedOff.show, 'image', 'offline wins over paused');
  assert.equal(pausedOff.why, 'screen offline since 8:50 PM ET');
  const noSeen = L.screenState(ix({ offline: true }), 'id-1', NOW);
  assert.equal(noSeen.why, 'screen offline since 2:00 AM ET', 'falls back to at when lastSeen is missing');
  const badSeen = L.screenState(ix({ offline: true, lastSeen: 'nope' }), 'id-1', NOW);
  assert.equal(badSeen.why, 'screen offline since 2:00 AM ET');
  const idle = { bot: 'Claude', status: 'idle', task: 'x' };
  assert.equal(L.liveStatus(idle, 'id-1', ix({ at, busy: true, offline: true, lastSeen }), null, NOW).status, 'idle', 'offline is not live proof of work');
  assert.equal(ix({}).screens['id-1'].offline, false);
  assert.equal(L.screenState(ix({}), 'id-1', NOW).offline, undefined);
});
test('liveStatus: idle row with a fresh busy screen or a running routine shows as working; nothing else changes', () => {
  const at = m => new Date(NOW - m * 60000).toISOString(), ix = o => L.parseScreensIndex({ updated_at: at(0), screens: { 'id-1': o } });
  const idle = { bot: 'Claude', status: 'idle', task: 'x' };
  assert.equal(L.liveStatus(idle, 'id-1', ix({ at: at(3), busy: true }), null, NOW).status, 'working');
  assert.equal(L.liveStatus(idle, 'id-1', ix({ at: at(3), busy: true }), null, NOW).live, 'screen');
  assert.equal(L.liveStatus({ bot: 'Claude' }, 'id-1', ix({ at: at(3), busy: true }), null, NOW).status, 'working', 'empty status too');
  assert.equal(L.liveStatus(idle, 'id-1', ix({ at: at(3) }), null, NOW).status, 'idle', 'screen without the live-work terminal');
  assert.equal(L.liveStatus(idle, 'id-1', ix({ at: at(20), busy: true }), null, NOW).status, 'idle', 'screen older than 15 min');
  assert.equal(L.liveStatus(idle, 'id-1', ix({ at: at(3), busy: true, paused: true }), null, NOW).status, 'idle', 'paused screen');
  assert.equal(L.liveStatus(idle, 'other', ix({ at: at(3), busy: true }), null, NOW).status, 'idle', 'another bot\'s screen');
  const auto = { rows: [{ ai: 'Claude', running: true }, { ai: 'GUI', running: false }] };
  assert.equal(L.liveStatus(idle, 'id-9', null, auto, NOW).live, 'routine');
  assert.equal(L.liveStatus({ bot: 'GUI', status: 'idle' }, 'id-9', null, auto, NOW).status, 'idle');
  for (const st of ['blocked', 'needs_tim', 'error', 'working']) assert.equal(L.liveStatus({ bot: 'Claude', status: st }, 'id-1', ix({ at: at(3), busy: true }), auto, NOW).status, st);
  assert.equal(L.liveStatus(idle, 'id-1', ix({ at: at(3), busy: true }), null, NOW) === idle, false, 'returns a copy, never mutates the row');
  assert.equal(idle.status, 'idle');
});
test('screen click target: screen_url (http/https only), President and Usage defaults, else popup', () => {
  assert.deepEqual(L.screenTarget(bot('Cursor')), { kind: 'url', href: 'https://example.com/live' });
  assert.deepEqual(L.screenTarget(bot('President')), { kind: 'url', href: L.PRESIDENT_SCREEN_URL }, 'javascript: rejected');
  assert.equal(L.screenTarget({ bot: 'Usage' }).kind, 'usage');
  assert.equal(L.screenTarget(bot('Root')).kind, 'popup');
  assert.equal(L.httpUrl('data:text/html,x'), ''); assert.equal(L.httpUrl('HTTPS://a.b/c'), 'HTTPS://a.b/c');
});
test('President chat feed: parse, oldest-to-newest order (newest at bottom), last 12, masking', () => {
  const f = L.parseChatFeed(fx('president-chat-feed.example.jsonl'));
  assert.deepEqual(f.map(x => x.from), ['Tim', 'Tim', 'President']);
  assert.equal(f[0].text, 'EXAMPLE: mail me at [email] or [phone]');
  assert.equal(f[1].text, 'EXAMPLE: token [token] should be masked');
  const many = Array.from({ length: 20 }, (_, i) => JSON.stringify({ at: new Date(NOW + i * MIN).toISOString(), from: 'Tim', text: 'm' + i })).join('\n');
  const g = L.parseChatFeed(many); assert.equal(g.length, 12); assert.equal(g[11].text, 'm19');
  assert.deepEqual(L.parseChatFeed(''), []);
});

/* ---------- Gauge audit + work cards ---------- */
test('audit: parse, unknown values -> "?", stale after 8 h, missing -> null', () => {
  const a = bot('Gauge').audit;
  assert.deepEqual(a.checks.map(c => c.value), ['flag', 'ok', '?', '?']);
  assert.equal(a.findings_sent, 3);
  assert.equal(L.auditStale(a, NOW), false); assert.equal(L.auditStale(a, Date.parse('2026-11-16T14:31:00Z')), true);
  assert.equal(bot('Root').audit, null); assert.equal(L.parseAudit('x'), null);
});
test('work cards: newest first, cap of 5, http(s) links only, owner by bot_id, stable derived ids', () => {
  const w = bot('Gauge').work;
  assert.equal(w.length, L.WORK_MAX); assert.deepEqual(w.map(x => x.title), ['EXAMPLE f6', 'EXAMPLE f5', 'EXAMPLE f4', 'EXAMPLE f3', 'EXAMPLE f2']);
  assert.equal(w[4].ownerName, 'Root'); assert.equal(w[0].ownerName, 'Gauge');
  const again = L.parseStatus(JSON.parse(fx('office-status-v3.example.json'))).bots.find(b => b.bot === 'Gauge').work;
  assert.deepEqual(again.map(x => x.id), w.map(x => x.id), 'derived ids are stable');
  const g1 = L.parseWork([{ id: 'g1', title: 't', link: 'ftp://x' }], 'Gauge', 'id'); assert.equal(g1[0].link, '');
  assert.equal(L.workLabel('Gauge'), 'Audit finding'); assert.equal(L.workLabel('Root'), 'Diagnosis'); assert.equal(L.workLabel('Edgar'), 'Edgar work');
});
test('work diff: first load, new, owner change, removed, no change', () => {
  const a = [{ id: '1', poster: 'Gauge', ownerName: 'Gauge' }, { id: '2', poster: 'Root', ownerName: 'Root' }];
  assert.deepEqual(L.diffWork(null, a), [], 'first load: no animations');
  assert.deepEqual(L.diffWork(a, a), []);
  assert.deepEqual(L.diffWork(a, [a[0]]), [], 'removed: nothing to animate');
  assert.deepEqual(L.diffWork(a, a.concat({ id: '3', poster: 'Gauge', ownerName: 'Gauge' })), [{ kind: 'pin', id: '3', bot: 'Gauge', owner: 'Gauge' }]);
  assert.deepEqual(L.diffWork(a, [{ id: '1', poster: 'Gauge', ownerName: 'Root' }, a[1]]), [{ kind: 'take', id: '1', bot: 'Root', from: 'Gauge' }]);
});

/* ---------- automations (items 19/20) ---------- */
test('automations: STALE beyond 2x interval (never OK), overlap detection, per-hour concurrency, ET day buckets', () => {
  const a = L.parseAutomations(L.demoAutomations(NOW), NOW);
  assert.equal(a.rows.find(r => r.ai === 'Grok').result, 'STALE', 'data older than 2x its interval is STALE');
  assert.equal(a.rows.find(r => r.ai === 'Gauge').running, true);
  const bad = L.writerOverlaps(a.runs); assert.ok(bad.size >= 2 && [...bad].every(r => r.writer));
  const d0 = L.etDayStart(NOW) - 86400000, conc = L.concurrencyByHour(a.runs, d0);
  assert.equal(conc.length, 72); assert.ok(conc[9] >= 2, 'clogged hour counted');
  assert.equal(new Date(L.etDayStart(NOW)).toISOString(), '2026-11-16T05:00:00.000Z', 'ET midnight (EST)');
  assert.equal(new Date(L.etDayStart(Date.parse('2026-07-04T03:00:00Z'))).toISOString(), '2026-07-03T04:00:00.000Z', 'ET midnight (EDT)');
  assert.equal(L.simpleResult('NO_RECEIPT'), 'FAIL'); assert.equal(L.parseAutomations({ runs: [{ start: '2026-11-16T00:00:00Z', result: 'NO_RECEIPT', expected: true }] }, NOW).runs[0].result, 'UPCOMING');
  assert.deepEqual(L.parseAutomations(null, NOW).rows, []);
});
test('writer health: missing metrics stay "no data"', () => {
  const a = L.parseAutomations(L.demoAutomations(NOW), NOW);
  assert.equal(a.writer.last_ping.source, null); assert.equal(a.writer.error_rate.status, 'red');
});

test('usage wall pool lines: optional fields pass through and format under the bar', () => {
  const credit = { est_left_usd: 40.998251, grant_usd: 41, expires: '2026-11-30', verified_left_usd: null };
  const text = [
    JSON.stringify({ at: '2026-11-17T22:24:48.710Z', provider: 'CHATGPT', meter: 'weekly', label: 'weekly (Codex/Work/agents)', usedPct: 92, resetsAt: '2026-11-20T21:58:53.000Z', status: 'WATCH', openaiCredit: credit, resets_available: 0, resets_expire: null, extra_usd: null }),
    JSON.stringify({ at: '2026-11-18T00:53:00.000Z', provider: 'CLAUDE', meter: 'weekly', label: 'weekly (all models)', usedPct: 0, resetsAt: '2026-11-22T16:00:00.000Z', status: 'OK', resets_available: 0, resets_expire: null, extra_usd: null }),
    JSON.stringify({ at: '2026-11-18T01:22:00.000Z', provider: 'GROK', meter: 'weekly', label: 'weekly Grok Bot', usedPct: 83.3, resetsAt: '2026-11-22T21:41:00.000Z', status: 'OK', resets_available: null, resets_expire: null, extra_usd: 4.7 })
  ].join('\n');
  const rows = L.usageRows(L.parseReadings(text), NOW, null);
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  assert.equal(L.creditLine(by.ChatGPT), 'API credit: ~$41.00 of $41 left · expires Nov 30');
  assert.equal(L.resetsLine(by.ChatGPT), 'Resets: 0 · Extra: none');
  assert.equal(L.creditLine(by.Claude), '');
  assert.equal(L.resetsLine(by.Claude), 'Resets: 0 · Extra: none');
  assert.equal(L.creditLine(by.Grok), '');
  assert.equal(L.resetsLine(by.Grok), 'Resets: none · Extra: $4.70');
  const verified = L.usageRows(L.parseReadings(JSON.stringify({
    at: '2026-11-17T22:24:48.710Z', provider: 'CHATGPT', meter: 'weekly', label: 'weekly', usedPct: 92,
    resetsAt: '2026-11-20T21:58:53.000Z', status: 'OK', openaiCredit: Object.assign({}, credit, { verified_left_usd: 40.12 })
  })), NOW, null)[0];
  assert.equal(L.creditLine(verified), 'API credit: $40.12 of $41 left · expires Nov 30');
  const bare = L.usageRows(L.parseReadings(JSON.stringify({
    at: '2026-11-17T22:24:48.710Z', provider: 'CHATGPT', meter: 'weekly', label: 'weekly', usedPct: 92,
    resetsAt: '2026-11-20T21:58:53.000Z', status: 'OK'
  })), NOW, null)[0];
  assert.equal(L.creditLine(bare), '');
  assert.equal(L.resetsLine(bare), '');
});

test('GROK stale windows follow Usage reads: 90 min from 2 PM-2 AM ET, 3.5 h from 2 AM-2 PM, including midnight', () => {
  const grok = at => ({ at, provider: 'GROK', meter: 'weekly', label: 'weekly Grok Bot', usedPct: 80, status: 'OK' });
  const eve = Date.parse('2026-11-18T02:00:00Z');
  assert.equal(L.readingStale(grok('2026-11-18T00:30:00.000Z'), eve), false, '90 min old at 9 PM ET is fresh');
  assert.equal(L.readingStale(grok('2026-11-18T00:29:00.000Z'), eve), true, '91 min old at 9 PM ET is stale');
  assert.equal(L.usageRows(L.parseReadings(JSON.stringify(grok('2026-11-18T00:30:00.000Z'))), eve, null)[0].stale, false);
  const day = Date.parse('2026-11-17T15:00:00Z');
  assert.equal(L.readingStale(grok('2026-11-17T11:30:00.000Z'), day), false, '210 min old at 10 AM ET is fresh');
  assert.equal(L.readingStale(grok('2026-11-17T11:29:00.000Z'), day), true, '211 min old at 10 AM ET is stale');
  assert.equal(L.usageRows(L.parseReadings(JSON.stringify(grok('2026-11-17T11:29:00.000Z'))), day, null)[0].stale, true);
  const halfPastMidnight = Date.parse('2026-11-18T05:30:00Z');
  assert.equal(L.readingStale(grok('2026-11-18T04:00:00.000Z'), halfPastMidnight), false, '90 min old at 12:30 AM ET is fresh');
  assert.equal(L.readingStale(grok('2026-11-18T03:59:00.000Z'), halfPastMidnight), true, '91 min old at 12:30 AM ET is stale');
  const afterTwo = Date.parse('2026-11-18T07:30:00Z');
  assert.equal(L.readingStale(grok('2026-11-18T05:00:00.000Z'), afterTwo), false, '150 min old at 2:30 AM ET is fresh under the 3.5 h rule');
  const claude = { at: '2026-11-16T07:08:54Z', provider: 'CLAUDE', meter: 'weekly', usedPct: 27, status: 'OK' };
  assert.equal(L.readingStale(claude, NOW), false);
  assert.equal(L.readingStale(claude, Date.parse('2026-11-16T13:40:00Z')), true, 'CLAUDE still uses nextCheck + grace');
});
test('status source without apiUrl reads the raw URL directly with a fresh cache-buster', async () => {
  const calls = [];
  const src = L.createJsonSource({ rawUrl: 'https://raw.githubusercontent.com/x', fetch: async u => { calls.push(u); return res(200, '{"v":2}'); } });
  assert.deepEqual(await src.get(NOW), { ok: true, data: { v: 2 }, source: 'raw' });
  await src.get(NOW + 1000);
  assert.deepEqual(calls, ['https://raw.githubusercontent.com/x?t=' + NOW, 'https://raw.githubusercontent.com/x?t=' + (NOW + 1000)]);
});

test('Claude 5-hr window line is text only, exact wording, hidden after reset', () => {
  const reset = '2026-11-16T05:49:00.000Z'; // 12:49 AM ET (EST, UTC-5)
  const now = Date.parse('2026-11-16T03:00:00.000Z');
  const text = [
    JSON.stringify({ at: '2026-11-16T02:00:00.000Z', provider: 'CLAUDE', meter: 'weekly', label: 'weekly (all models)', usedPct: 4, resetsAt: '2026-11-22T16:00:00.000Z', status: 'OK' }),
    JSON.stringify({ at: '2026-11-16T02:05:00.000Z', provider: 'CLAUDE', meter: 'session', label: 'current session', usedPct: 4, resetsAt: reset, windowHours: 5, status: 'OK' }),
    JSON.stringify({ at: '2026-11-16T02:00:00.000Z', provider: 'CHATGPT', meter: 'weekly', label: 'weekly', usedPct: 92, resetsAt: '2026-11-20T21:58:53.000Z', status: 'OK' })
  ].join('\n');
  const rows = L.usageRows(L.parseReadings(text), now, null);
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  assert.equal(by.Claude.pct_used, 4);
  assert.equal(by.Claude.fiveHour.usedPct, 4);
  assert.equal(L.fiveHourLine(by.Claude, now), '5-hr window: 4% used · resets 12:49 AM ET');
  assert.equal(L.fiveHourLine({ fiveHour: { usedPct: 100, resetsAt: reset } }, now), '5-hr window: FULL, stopped · resets 12:49 AM ET');
  assert.equal(L.fiveHourLine(by.Claude, Date.parse('2026-11-16T06:00:00.000Z')), '');
  assert.equal(L.fiveHourLine(by.ChatGPT, now), '');
});
