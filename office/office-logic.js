/* 3D office viewer: pure logic (no DOM, no Three.js). Loaded by office/office.js in the browser and by
   tests/office-logic.test.js in node. Read-only: it only shapes data that came from control/OFFICE_STATUS.json
   (forge-coordination), the GitHub open-PR list and the asks/open file list. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OfficeLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MIN = 60000;
  const STATUSES = ['idle', 'working', 'blocked', 'waiting_tim'];
  const PRIORITIES = ['Needs Tim', 'PR merge queue', 'P1', 'P2', 'P3', 'P4'];
  const COLUMNS = [
    { id: 'needs_tim', label: 'Needs Tim' },
    { id: 'in_progress', label: 'In progress' },
    { id: 'queued', label: 'Queued' },
    { id: 'done', label: 'Done' }
  ];
  // Rows always shown on the project board; any other project in the data is added after them.
  // "Bitcoin" is listed so it gets a fixed place, but it stays hidden until an item uses it.
  const KNOWN_PROJECTS = [
    { name: 'Job pipeline', always: true },
    { name: '3D office', always: true },
    { name: 'Bitcoin', always: false }
  ];
  const STALE_MIN = 10;          // "updated N min ago" turns stale after this (item 23)
  const USAGE_STALE_MIN = 6 * 60; // usage readings are hourly at best
  const CONVO_WINDOW_MIN = 15;
  const CONVO_MAX = 3;
  const MAX_PER_COLUMN = 5;
  const GLIDE_MS = 800;          // TV desk-to-desk glide (must stay under 1 s)
  const TOUR_IDLE_MS = 60000;
  const LOD = { near: 3.2, mid: 8 }; // metres from the monitor
  const COLORS = { working: '#3ddc84', idle: '#8b9099', alert: '#ff4b4b', stale: '#ffd23f', info: '#4aa3ff', focus: '#c58cff' };
  const FALLBACK_LINK = 'grokbot://app/v1/agent?id=';

  const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const time = v => { const t = Date.parse(str(v)); return Number.isFinite(t) ? t : null; };

  /* Status rules (Tim, 2:22 AM): only needs_tim / waiting_tim can raise a hand, and only with a question (see parseBots).
     "waiting" and "queued" are idle/queued, never Needs Tim; "blocked" is never Needs Tim. */
  function normStatus(s) {
    const v = str(s).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (v === 'needs_tim' || v === 'waiting_tim') return 'waiting_tim';
    if (v === 'in_progress') return 'working';
    return STATUSES.includes(v) ? v : 'idle';
  }

  /* status -> look. Bright colour only for state, never colour alone: every state has a glyph and a word. */
  function statusStyle(status) {
    switch (normStatus(status)) {
      case 'working': return { status: 'working', color: COLORS.working, glyph: '▶', word: 'WORKING', flag: false, alert: false, behavior: 'work' };
      case 'blocked': return { status: 'blocked', color: COLORS.stale, glyph: '■', word: 'BLOCKED', flag: false, alert: false, behavior: 'work' };
      case 'waiting_tim': return { status: 'waiting_tim', color: COLORS.alert, glyph: '⚠', word: 'NEEDS TIM', flag: true, alert: true, behavior: 'wave' };
      default: return { status: 'idle', color: COLORS.idle, glyph: '•', word: 'IDLE', flag: false, alert: false, behavior: 'roam' };
    }
  }

  function fallbackLink(botId) { return FALLBACK_LINK + encodeURIComponent(str(botId)); }
  function linkFor(entry) {
    const l = str(entry && entry.link).trim();
    return l || fallbackLink(entry && entry.bot_id);
  }
  /* Text that is always shown next to the link, so the question survives even when the link cannot open. */
  function fallbackText(entry) {
    const q = str(entry && entry.question).trim();
    return 'Ask ' + str(entry && entry.bot) + (q ? ': “' + q + '”' : ' (no question recorded)');
  }

  function prNumber(title, link) {
    const a = /\/pull\/(\d+)/.exec(str(link)); if (a) return Number(a[1]);
    const b = /#(\d+)\b/.exec(str(title)); return b ? Number(b[1]) : null;
  }
  function priorityRank(p) { const i = PRIORITIES.indexOf(str(p)); return i < 0 ? PRIORITIES.length : i; }
  function normPriority(p) {
    const v = str(p).trim();
    const hit = PRIORITIES.find(x => x.toLowerCase() === v.toLowerCase());
    return hit || 'P4';
  }

  function parseItems(list, botNames) {
    if (!Array.isArray(list)) return [];
    const names = botNames ? new Set(botNames) : null;
    const out = [];
    for (const r of list) {
      if (!r || typeof r !== 'object' || !str(r.id).trim() || !str(r.title).trim()) continue;
      const owner = canonicalBot(r.owner);
      out.push({
        id: str(r.id).trim(), title: str(r.title).trim(), priority: normPriority(r.priority),
        status: str(r.status).trim().toLowerCase() || 'working', owner,
        ownerKnown: names ? names.has(owner) : true,
        link: str(r.link).trim(), updated_at: str(r.updated_at), project: mapProject(r.project),
        pr: prNumber(r.title, r.link), question: str(r.question).trim(), note: str(r.note).trim(), source: str(r.source).trim(), prState: ''
      });
    }
    return out;
  }
  function sortItems(items) {
    return items.slice().sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)
      || (time(b.updated_at) || 0) - (time(a.updated_at) || 0) || a.id.localeCompare(b.id));
  }
  /* Card title, with the PR number in front when the title or link has one. */
  function cardTitle(item) {
    if (item.pr == null || new RegExp('#' + item.pr + '\\b').test(item.title)) return item.title;
    return '#' + item.pr + ' ' + item.title;
  }
  function priorityBadge(p) {
    if (p === 'Needs Tim') return { text: 'TIM', loud: true };
    if (p === 'PR merge queue') return { text: 'MERGE', loud: true };
    return { text: p, loud: false };
  }

  /* item -> board column */
  /* Columns: Needs Tim | In progress | Queued | Done.
     - A GitHub PR link uses the PR's live state (item.prState, set by applyPrStates): merged/closed -> Done; open -> In
       progress as "Review / merge queue" (President merges on green). An open PR is never Needs Tim.
     - Needs Tim only for status needs_tim / waiting_tim (or priority "Needs Tim") WITH a non-empty question; without one
       the card is Queued and says why ("?" explains itself). "waiting" / "queued" / "todo" -> Queued. "blocked" -> In progress. */
  function itemStatus(item) { return str(item && item.status).toLowerCase().replace(/[\s-]+/g, '_'); }
  function asksTim(item) { const s = itemStatus(item); return item.priority === 'Needs Tim' || s === 'needs_tim' || s === 'waiting_tim'; }
  function columnFor(item) {
    const s = itemStatus(item), pr = item.prState;
    if (pr === 'merged' || pr === 'closed') return 'done';
    if (['done', 'merged', 'closed', 'shipped', 'complete', 'completed'].includes(s)) return 'done';
    if (pr === 'open') return 'in_progress';
    if (asksTim(item)) return str(item.question).trim() ? 'needs_tim' : 'queued';
    if (['queued', 'waiting', 'todo', 'not_started', 'later', 'backlog', 'idle'].includes(s)) return 'queued';
    return 'in_progress';
  }
  function statusWord(item) {
    const c = columnFor(item), s = itemStatus(item);
    if (c === 'needs_tim') return { glyph: '⚠', word: 'NEEDS TIM', tone: 'alert' };
    if (c === 'done') return { glyph: '✓', word: item.prState === 'merged' ? 'MERGED' : item.prState === 'closed' ? 'CLOSED' : 'DONE', tone: 'idle' };
    if (item.prState === 'open' || item.priority === 'PR merge queue' || ['review', 'in_review', 'ready_for_review', 'merge_queue', 'pr_open'].includes(s)) return { glyph: '◆', word: 'REVIEW / MERGE QUEUE', tone: 'info' };
    if (c === 'queued') return asksTim(item) ? { glyph: '?', word: 'QUEUED', tone: 'stale', why: 'marked needs_tim but has no question, so it is not counted as Needs Tim' } : { glyph: '…', word: 'QUEUED', tone: 'idle' };
    if (s === 'blocked') return { glyph: '■', word: 'BLOCKED', tone: 'stale' };
    return { glyph: '▶', word: 'IN PROGRESS', tone: 'working' };
  }

  /* Rows by project, columns Needs Tim | In progress | Review | Done, at most `max` cards per cell plus "+N more". */
  function buildBoard(items, opts) {
    const max = (opts && opts.max) || MAX_PER_COLUMN;
    const sorted = sortItems(items);
    const present = new Set(sorted.map(i => i.project));
    const names = KNOWN_PROJECTS.filter(p => p.always || present.has(p.name)).map(p => p.name);
    for (const p of present) if (!names.includes(p)) names.push(p);
    return names.map(name => {
      const mine = sorted.filter(i => i.project === name);
      const cols = {};
      for (const c of COLUMNS) {
        const all = mine.filter(i => columnFor(i) === c.id);
        cols[c.id] = { cards: all.slice(0, max), more: Math.max(0, all.length - max), total: all.length };
      }
      return { project: name, cols, total: mine.length };
    });
  }

  /* Older OFFICE_STATUS names mapped to the exact Grok Bot sidebar names. */
  const BOT_ALIASES = { 'Usage Ctrl': 'Usage', 'Usage Ctr': 'Usage', 'Usage Budget': 'Usage', 'dr eggbot': 'HR', 'HR - Bot Trainer': 'HR', 'QA bot': 'QA', 'Software': 'Cursor',
    'Archive \u00b7 Application State Tracker': 'Archive' };
  /* Item 17 (Tim, Nov 16 5:38 PM): the 3D office roster is exactly the 14-bot sidebar, in sidebar order, with the short names. */
  const ROSTER = [
    ['President', '431e8cf1-f077-4548-82b7-46c1959dc4c9'], ['QA', '338fc1b1-fecc-475d-ba9e-acd49bcadcfc'], ['HR', '372936ae-81e1-4013-b0d0-9ee47d97a3c4'],
    ['Cursor', 'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f'], ['Claude', 'd4118f0c-1b06-4e9a-982f-f5314451c841'], ['ChatGPT', '7bcb0d85-ec55-4e17-907f-3e71688e8799'],
    ['Root', '70f0889b-ecd4-457b-a69c-304cd2aff540'], ['Usage', 'f1a70b7a-6051-45d7-8031-e46a4cba066f'], ['Edgar', '811cc842-4bef-47c2-98d2-0f4bb78f7169'],
    ['Comp', '424e5611-fb8f-4ae1-a360-051e61e63e8a'], ['Gauge', '132c47df-ccfb-4f91-b4e2-ebcb1d775bc6'], ['Sniffer', '321469c4-1299-43e7-bd32-1704f58777be'],
    ['GUI', 'a8b4a0b2-acfd-4485-8444-7ab27007df4a'], ['Archive', 'c95408dd-c07f-460e-aaa0-9d515fe5be7d']].map(([name, id]) => ({ name, id }));
  /* Renamed bots matched by bot_id first, so the label follows the sidebar whatever name the file carries. */
  const BOT_ID_NAMES = Object.fromEntries(ROSTER.map(r => [r.id, r.name]));
  function canonicalBot(name, botId) { const id = str(botId).trim(), n = str(name).trim(); return BOT_ID_NAMES[id] || BOT_ALIASES[n] || n; }

  /* ---------- Optional OFFICE_STATUS.json fields (v2) ----------
     bots[].screen  { "title": string, "lines": [string, ... up to 6], "updated_at": ISO }
       What the bot's monitor shows, drawn as a mini app window (near view) and in the monitor popup. Parsed tolerantly:
       not an object, or no title and no lines -> null and the monitor falls back to task / last_action / own items.
       Non-string lines are dropped, lines are cut to 160 characters, only the first 6 are kept, a bad updated_at -> ''.
       President's monitor ignores it (Forge checksheet); Usage's monitor always shows the usage chart.
     meetings[]     [{ "id", "title", "members": [bot names or bot_ids], "started_at": ISO, "chat_id": "" }]
       Members (known bots only, by sidebar name, older alias or bot_id) sit at the conference table, at most 7 seats.
       A bot that needs Tim stays at its desk. chat_id is reserved and only carried through. Entries with no known
       member are dropped; missing or invalid -> [] and the table is used only for ambient training. */
  const SCREEN_MAX_LINES = 6, SCREEN_LINE_MAX = 160;
  function parseScreen(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const title = typeof s.title === 'string' ? truncate(s.title, 80) : '';
    const lines = (Array.isArray(s.lines) ? s.lines : []).filter(l => typeof l === 'string' || (typeof l === 'number' && Number.isFinite(l)))
      .slice(0, SCREEN_MAX_LINES).map(l => str(l).replace(/[\r\n\t]+/g, ' ').trimEnd().slice(0, SCREEN_LINE_MAX));
    if (!title && !lines.some(l => l.trim())) return null;
    return { title, lines, updated_at: time(s.updated_at) != null ? str(s.updated_at) : '' };
  }
  function parseBots(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set(), out = [];
    for (const r of list) {
      const bot = canonicalBot(r && r.bot, r && r.bot_id);
      if (!bot || seen.has(bot)) continue;
      seen.add(bot);
      const id = str(r.bot_id || r.id).trim(), question = str(r.question).trim();
      let status = normStatus(r.status), why = '';
      if (status === 'waiting_tim' && !question) { status = 'idle'; why = 'status ' + str(r.status) + ' has no question, so no raised hand'; }
      out.push({
        bot, bot_id: id, task: str(r.task), status, rawStatus: str(r.status), why,
        last_action: str(r.last_action), last_action_at: str(r.last_action_at), question, link: str(r.link),
        screen: parseScreen(r.screen), screen_url: httpUrl(r.screen_url), avatar_shape: str(r.avatar_shape).trim().toLowerCase(),
        avatar_color: str(r.avatar_color).trim().toLowerCase(), audit: parseAudit(r.audit), work: parseWork(r.work, bot, id),
        routine: parseRoutine(r.routine)
      });
    }
    // work owners: bot_id (or name) -> sidebar name; unknown owners stay with the posting bot
    const byId = new Map(out.filter(b => b.bot_id).map(b => [b.bot_id, b.bot])), names = new Set(out.map(b => b.bot));
    for (const b of out) for (const w of b.work) {
      const o = w.owner; w.ownerName = byId.get(o) || BOT_ID_NAMES[o] || (names.has(canonicalBot(o)) ? canonicalBot(o) : b.bot);
    }
    // roster bots come first in sidebar order (item 17); anything else keeps file order after them
    const rank = b => { const i = ROSTER.findIndex(r => r.name === b.bot); return i < 0 ? ROSTER.length : i; };
    return out.map((b, i) => [b, i]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map(x => x[0]);
  }
  const CONF_SEATS = 7;
  function parseMeetings(list, bots) {
    if (!Array.isArray(list)) return [];
    const byId = new Map((bots || []).filter(b => b.bot_id).map(b => [b.bot_id, b.bot])), names = new Set((bots || []).map(b => b.bot));
    const out = [];
    for (const m of list) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      const members = [];
      for (const x of Array.isArray(m.members) ? m.members : []) {
        if (typeof x !== 'string') continue;
        const s = x.trim(), n = byId.get(s) || BOT_ID_NAMES[s] || canonicalBot(s);
        if (n && names.has(n) && !members.includes(n)) members.push(n);
      }
      if (!members.length) continue;
      out.push({ id: str(m.id).trim() || 'meeting-' + (out.length + 1), title: truncate(str(m.title), 60) || 'Meeting', members,
        started_at: time(m.started_at) != null ? str(m.started_at) : '', chat_id: str(m.chat_id).trim() });
    }
    return out;
  }

  /* ---------- Needs Tim click target ----------
     PR link when the entry (or the bot's own Needs Tim card) has one, else the entry's own http(s)/grokbot link, else the
     owning bot's Grok Bot chat (grokbot://app/v1/agent?id=<bot_id>), else nothing: show the bot name with no link.
     Bot characters use the same target. Other URL schemes (javascript:, data:) are never returned. */
  const SAFE_LINK = /^(https?:\/\/|grokbot:\/\/)/i;
  function safeLink(l) { const v = str(l).trim(); return SAFE_LINK.test(v) ? v : ''; }
  function isPrLink(l) { return /^https?:\/\/[^\s]+\/pull\/\d+/i.test(str(l)); }
  function chatLink(botId) { const id = str(botId).trim(); return id ? FALLBACK_LINK + encodeURIComponent(id) : ''; }
  function needsTarget(o) {
    const own = safeLink(o && o.link), bot = str(o && o.bot).trim();
    if (isPrLink(own)) return { href: own, kind: 'pr', label: bot };
    const card = bot && (o.items || []).find(i => i.owner === bot && columnFor(i) === 'needs_tim' && isPrLink(i.link));
    if (card) return { href: card.link, kind: 'pr', label: bot };
    if (own) return { href: own, kind: /^grokbot:/i.test(own) ? 'chat' : 'link', label: bot };
    const chat = chatLink(o && o.bot_id);
    if (chat) return { href: chat, kind: 'chat', label: bot };
    return { href: '', kind: 'none', label: bot };
  }

  /* ---------- What each bot is doing on the floor (ambient behaviour, never data) ----------
     Order: needs Tim / blocked -> waves at its own desk; meeting member -> conference seat; working -> types at its desk;
     idle -> chat / sleep at desk / game / wander, chosen per bot from a hash that changes every 10 minutes (no flicker).
     An idle HR walks round to idle bots and, when no meeting holds the table, trains two of them there. */
  const TRAINER = 'HR';
  const IDLE_BUCKET_MIN = 10, TRAIN_CYCLE_S = 100, TRAIN_S = 45, VISIT_S = 18;
  const IDLE_PATTERN = ['chat', 'chat', 'sleep', 'game', 'wander', 'chat', 'chat', 'wander', 'sleep', 'game'];
  function hash(s) { let h = 2166136261; for (const ch of str(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function holdsCan(name) { return hash('can:' + name) % 3 !== 0; }
  // fresh (optional, item 16b): name -> freshness(); a stale non-alert bot stands puzzled at its desk instead of its status act
  function planOffice(bots, meetings, now, state, fresh) {
    const plans = {}, list = bots || [];
    let meeting = null, training = null;
    if (state === 'failed') return { plans, meeting, training };
    for (const b of list) if (statusStyle(b.status).alert) plans[b.bot] = { act: 'wave' };
    for (const b of list) if (!plans[b.bot] && fresh && fresh[b.bot] && fresh[b.bot].stale) plans[b.bot] = { act: 'stale' };
    let seat = 0;
    for (const m of meetings || []) {
      const seated = [];
      for (const n of m.members) {
        if (plans[n] || seat >= CONF_SEATS || !list.some(b => b.bot === n)) continue;
        plans[n] = { act: 'meeting', seat: seat++, meeting: m.id }; seated.push(n);
      }
      if (seated.length && !meeting) meeting = Object.assign({}, m, { seated });
    }
    const others = n => list.map(b => b.bot).filter(x => x !== n);
    const partnerFor = (n, salt) => { const o = others(n); return o.length ? o[hash(n + ':' + salt) % o.length] : null; };
    // working (and blocked) bots type at their desk, with a short staggered break every 4-6 minutes
    for (const b of list) if (!plans[b.bot] && ['working', 'blocked'].includes(normStatus(b.status))) {
      const br = workBreak(b.bot, now);
      plans[b.bot] = br ? { act: br, brk: true } : { act: 'work' };
      if (br === 'visitdesk') plans[b.bot].partner = partnerFor(b.bot, Math.floor(now / 60000));
    }
    const trainer = list.find(b => b.bot === TRAINER && !plans[b.bot]);
    for (const b of list) if (!plans[b.bot] && b.bot !== TRAINER) { const r = replayFor(b, now); if (r) plans[b.bot] = { act: r.act, replay: r }; }
    const idle = list.filter(b => !plans[b.bot] && b.bot !== TRAINER).map(b => b.bot).sort();
    idle.forEach(n => { const a = idleAct(n, now); plans[n] = { act: a }; if (a === 'visitdesk') plans[n].partner = partnerFor(n, idleSlot(n, now).idx); });
    if (trainer) {
      const sec = Math.floor(now / 1000), cycle = Math.floor(sec / TRAIN_CYCLE_S);
      if (!meeting && sec % TRAIN_CYCLE_S < TRAIN_S && idle.length) {
        const pref = ['wander', 'lounge', 'sleep', 'game', 'coffee', 'fridge', 'bike', 'visitdesk', 'chat'], pool = idle.slice().sort((a, b) => pref.indexOf(plans[a].act) - pref.indexOf(plans[b].act));
        const span = Math.min(pool.length, 3), trainees = [];
        for (let i = 0; i < Math.min(2, pool.length); i++) trainees.push(pool[(cycle + i) % span]);
        trainees.forEach((n, i) => { plans[n] = { act: 'train', seat: i }; });
        plans[TRAINER] = { act: 'lead' }; training = { trainer: TRAINER, trainees };
      } else if (idle.length) {
        const target = idle[Math.floor(sec / VISIT_S) % idle.length];
        plans[TRAINER] = { act: 'visit', partner: target }; plans[target] = { act: 'listen', partner: TRAINER };
      } else plans[TRAINER] = { act: 'wander' };
    }
    // idle trips: working / quiet bots periodically get up, walk to an idle spot, idle there, then walk back and sit (tripScheduleAt)
    const tripNames = list.map(b => b.bot).filter(n => plans[n] && (plans[n].act === 'work' || plans[n].act === 'stale'));
    if (tripNames.length) { const trips = tripScheduleAt(tripNames, now, { total: list.length }); for (const n of tripNames) if (trips[n]) plans[n] = plans[n].act === 'stale' ? Object.assign(plans[n], { trip: trips[n].spot }) : { act: 'trip', spot: trips[n].spot, brk: true }; }
    const chat = idle.filter(n => plans[n].act === 'chat');
    for (let i = 0; i + 1 < chat.length; i += 2) {
      plans[chat[i]] = { act: 'chat', partner: chat[i + 1], host: false };
      plans[chat[i + 1]] = { act: 'chat', partner: chat[i], host: true };
    }
    if (chat.length % 2) plans[chat[chat.length - 1]] = { act: 'wander' };
    for (const n of Object.keys(plans)) {
      if (plans[n].act === 'visitdesk' && !plans[n].partner) plans[n].act = 'wander';
      if (['chat', 'listen', 'wander', 'visit', 'visitdesk', 'lounge'].includes(plans[n].act)) plans[n].can = holdsCan(n);
    }
    return { plans, meeting, training };
  }
  /* Generic idle chatter for speech bubbles. Always shown marked "ambient": it is decoration, not OFFICE_STATUS data. */
  const AMBIENT = {
    chat: ['Ready for the next task!', 'Anyone need a hand?', 'All caught up here.', 'Ping me if something comes in.', 'Nice work on the last one.', 'The coffee is fresh.', 'Queue looks quiet today.', 'I could take another card.'],
    visit: ['How is it going?', 'Want to try a new skill?', 'Any blockers I can help with?', 'Great work this week!', 'Got a minute for a quick tip?'],
    reply: ['Doing great, thanks!', 'Sure, show me.', 'All good here.', 'Happy to learn more.', 'Ready when you are.'],
    train: ['Today: new skills!', 'Step one: read the task twice.', 'Small PRs, green checks.', 'Questions so far?', 'Let us try it together.']
  };
  function ambientLine(kind, seed, tick) { const a = AMBIENT[kind] || AMBIENT.chat; return a[(hash(seed) + Math.max(0, tick | 0)) % a.length]; }
  /* What the desk monitor draws. President keeps the Forge checksheet (never chat text); Usage the usage chart. */
  /* What the desk monitor draws. A running routine wins; President is a split view (chat feed | mirrored screen);
     a live mirror image wins over text; Usage Budget falls back to the usage chart; Gauge with an audit shows it. */
  function monitorMode(bot, act, ctx) {
    const n = str(bot && bot.bot), id = str(bot && bot.bot_id), c = ctx || {};
    if (bot && bot.routine) return 'routine';
    if (n === 'President' || id === PRESIDENT_ID) return 'president';
    if (c.image) return 'mirror';
    if (n === 'Usage' || id === USAGE_ID) return 'usage';
    if (bot && bot.audit) return 'audit';
    if (act === 'replay' || act === 'replay_board') return 'replay';
    if (act === 'game') return 'game';
    return bot && bot.screen ? 'screen' : 'terminal';
  }
  function parseConversations(list, botNames) {
    if (!Array.isArray(list)) return [];
    const names = botNames ? new Set(botNames) : null;
    return list.filter(c => c && str(c.from) && str(c.to) && time(c.at) != null)
      .map(c => ({ from: canonicalBot(c.from), to: canonicalBot(c.to), text: str(c.text).trim(), at: str(c.at) }))
      .filter(c => !names || (names.has(c.from) && names.has(c.to)));
  }
  function parseUsage(u) {
    const services = (u && Array.isArray(u.services) ? u.services : []).filter(s => s && str(s.name)).map(s => {
      const num = v => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null);
      let used = num(s.pct_used), left = num(s.pct_left);
      if (used == null && left != null) used = 100 - left;
      if (left == null && used != null) left = 100 - used;
      return { name: str(s.name), pct_used: used, pct_left: left, resets_at: str(s.resets_at), note: str(s.note) };
    });
    return { as_of: str(u && u.as_of), services };
  }

  /* Parse OFFICE_STATUS.json text or object. Never throws; ok:false + error on bad input. */
  function parseStatus(input) {
    let o = input;
    if (typeof input === 'string') {
      try { o = JSON.parse(input); } catch (e) { return { ok: false, error: 'OFFICE_STATUS.json is not valid JSON' }; }
    }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, error: 'OFFICE_STATUS.json is not an object' };
    if (!Array.isArray(o.bots)) return { ok: false, error: 'OFFICE_STATUS.json has no bots[]' };
    const bots = parseBots(o.bots);
    const names = bots.map(b => b.bot);
    return {
      ok: true, error: '', updatedAt: str(o.updated_at),
      needsTim: (Array.isArray(o.needs_tim) ? o.needs_tim : []).filter(n => n && str(n.text).trim())
        .map(n => ({ text: str(n.text).trim(), link: str(n.link).trim(), bot: canonicalBot(n.bot, n.bot_id), bot_id: str(n.bot_id).trim(),
          resolved: n.resolved === true, resolved_at: time(n.resolved_at) != null ? str(n.resolved_at) : '', expires_at: str(n.expires_at) })),
      bots, items: parseItems(o.items, names), conversations: parseConversations(o.conversations, names), usage: parseUsage(o.usage),
      meetings: parseMeetings(o.meetings, bots)
    };
  }

  /* Data health. failed: the last fetch failed or never worked; stale: updated_at older than STALE_MIN. */
  function dataState(parsed, fetchOk, now) {
    if (!fetchOk || !parsed || !parsed.ok) return 'failed';
    const t = time(parsed.updatedAt);
    if (t == null || now - t > STALE_MIN * MIN) return 'stale';
    return 'live';
  }
  /* What a character does. With failed data nobody idles at the pool: they freeze, greyed, where they stand. */
  function behaviorFor(status, state) {
    if (state === 'failed') return 'frozen';
    return statusStyle(status).behavior;
  }

  function relTime(iso, now) {
    const t = time(iso); if (t == null) return 'time unknown';
    const s = Math.round((now - t) / 1000);
    if (s < 0) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function waitingMinutes(iso, now) { const t = time(iso); return t == null ? null : Math.max(0, Math.floor((now - t) / MIN)); }
  function etParts(ms) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return { h: Number(p.hour), m: Number(p.minute) };
  }
  function hhmm(iso) { const t = time(iso); if (t == null) return '--:--'; const p = etParts(t); return String(p.h).padStart(2, '0') + ':' + String(p.m).padStart(2, '0'); }
  /* 0 (night) .. 1 (midday) window light from America/New_York time of day. */
  function daylight(now) {
    const p = etParts(now), h = p.h + p.m / 60;
    if (h < 6 || h > 20) return 0;
    return Math.max(0, Math.sin((h - 6) / 14 * Math.PI));
  }
  function truncate(text, n) { const t = str(text).replace(/\s+/g, ' ').trim(); return t.length <= n ? t : t.slice(0, Math.max(1, n - 1)).trimEnd() + '…'; }
  function lodFor(dist) { return dist <= LOD.near ? 'near' : dist <= LOD.mid ? 'mid' : 'far'; }

  /* Pulse brightness 0..1 at about 1 Hz; steady under prefers-reduced-motion. */
  function pulse(tSec, reducedMotion) { return reducedMotion ? 1 : 0.55 + 0.45 * Math.sin(tSec * Math.PI * 2); }

  /* Picking up work: items whose owner changed, or new items with an owner. Nothing on the first load (prev null). */
  function diffItems(prev, next) {
    if (!prev) return [];
    const before = new Map(prev.map(i => [i.id, i]));
    const out = [];
    for (const it of next) {
      if (!it.owner) continue;
      const old = before.get(it.id);
      if (!old) out.push({ bot: it.owner, itemId: it.id, reason: 'new' });
      else if (old.owner !== it.owner) out.push({ bot: it.owner, itemId: it.id, reason: 'reassigned', from: old.owner });
    }
    return out;
  }
  /* Recent conversations: within the window, newest last, at most `max`. */
  function recentConversations(list, now, opts) {
    const win = ((opts && opts.windowMin) || CONVO_WINDOW_MIN) * MIN, max = (opts && opts.max) || CONVO_MAX;
    return list.filter(c => { const t = time(c.at); return t != null && t <= now + MIN && now - t <= win; })
      .sort((a, b) => time(a.at) - time(b.at)).slice(-max);
  }
  const BUBBLE_MAX = 40; // small bubbles (Tim 11/16: about a third of the old size, one line, ellipsis; full text in the popup)
  function bubbleText(c) { return c.text ? truncate(c.text, BUBBLE_MAX) : 'talking with ' + c.to; }

  /* Open PRs from the GitHub API -> rows for the Needs Tim board. checks: passing|failing|pending|none */
  function checkState(runs) {
    if (!Array.isArray(runs) || !runs.length) return 'none';
    if (runs.some(r => ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(r.conclusion))) return 'failing';
    if (runs.some(r => r.status !== 'completed')) return 'pending';
    return 'passing';
  }
  function summarizePull(repo, p, checks) {
    const ready = !p.draft && checks === 'passing';
    return { repo, number: p.number, title: str(p.title), url: str(p.html_url), draft: !!p.draft, checks, readyForTim: ready };
  }

  function usageWord(pctUsed) {
    if (pctUsed == null) return { word: 'NO READING', glyph: '?', tone: 'stale' };
    if (pctUsed >= 90) return { word: 'HIGH', glyph: '⚠', tone: 'alert' };
    if (pctUsed >= 60) return { word: 'WATCH', glyph: '?', tone: 'stale' };
    return { word: 'OK', glyph: '✓', tone: 'info' };
  }
  function usageStale(usage, now) { const t = time(usage && usage.as_of); return t == null || now - t > USAGE_STALE_MIN * MIN; }

  /* ---------- TV mode ---------- */
  /* Remote/keyboard key -> action. hop: hop mode (default in TV mode) vs free walk. */
  function tvKeyAction(key, hop) {
    switch (key) {
      case 'Enter': case ' ': return 'open';
      case 'Backspace': case 'Escape': case 'BrowserBack': case 'GoBack': return 'back';
      case 'h': case 'H': case '0': return 'toggle_hop';
      case 'ArrowLeft': return hop ? 'prev' : 'turn_left';
      case 'ArrowRight': return hop ? 'next' : 'turn_right';
      case 'ArrowUp': return hop ? 'up' : 'forward';
      case 'ArrowDown': return hop ? 'down' : 'backward';
      default: return null;
    }
  }
  /* Hop rows: boards first (left to right), then desk rows front to back, each left to right. */
  function hopRows(targets) {
    const boards = targets.filter(t => t.kind === 'board').sort((a, b) => a.x - b.x);
    const desks = targets.filter(t => t.kind === 'desk');
    const zs = [...new Set(desks.map(d => d.z))].sort((a, b) => a - b);
    const rows = zs.map(z => desks.filter(d => d.z === z).sort((a, b) => a.x - b.x));
    return (boards.length ? [boards] : []).concat(rows);
  }
  function hopMove(rows, cur, action) {
    let r = cur ? cur.row : 0, c = cur ? cur.col : 0;
    if (!rows.length) return null;
    if (!cur) return { row: 0, col: 0 };
    if (action === 'next') { c++; if (c >= rows[r].length) { r = (r + 1) % rows.length; c = 0; } }
    else if (action === 'prev') { c--; if (c < 0) { r = (r - 1 + rows.length) % rows.length; c = rows[r].length - 1; } }
    else if (action === 'up') { if (r > 0) { r--; c = Math.min(c, rows[r].length - 1); } }
    else if (action === 'down') { if (r < rows.length - 1) { r++; c = Math.min(c, rows[r].length - 1); } }
    return { row: r, col: c };
  }
  /* Idle tour: Needs Tim desks first (longest dwell), then the boards, then the rest. */
  function tourOrder(targets, bots) {
    const st = new Map(bots.map(b => [b.bot, b.status]));
    const alertDesk = t => t.kind === 'desk' && statusStyle(st.get(t.bot)).alert;
    const a = targets.filter(alertDesk).map(t => ({ target: t, dwellMs: 10000 }));
    const b = targets.filter(t => t.kind === 'board').map(t => ({ target: t, dwellMs: 7000 }));
    const c = targets.filter(t => t.kind === 'desk' && !alertDesk(t)).map(t => ({ target: t, dwellMs: 4000 }));
    return a.concat(b, c);
  }

  function isPhoneLike(env) { return !!(env && (env.coarse || env.width < 760)); }

  /* ---------- Demo data (?demo=1): clearly example data, every state and behaviour visible ---------- */
  function demoStatus(now) {
    const ago = m => new Date(now - m * MIN).toISOString();
    const B = (bot, bot_id, status, task, last_action, mins, question, screen) => ({ bot, bot_id, status, task, last_action, last_action_at: ago(mins), question: question || '', link: '', screen });
    const SCR = (title, lines) => ({ title: 'EXAMPLE ' + title, lines, updated_at: ago(1) });
    const I = (id, title, priority, status, owner, project, link) => ({ id, title, priority, status, owner, link: link || '', updated_at: ago(5), project });
    return {
      updated_at: ago(2),
      needs_tim: [{ text: 'EXAMPLE: approve the job-board API key for Root', link: '', bot: 'Root' }, { text: 'EXAMPLE: sign off the lounge budget', link: '', bot: 'EXAMPLE contractor' },
        { text: 'EXAMPLE: already answered', bot: 'Root', resolved: true }, { text: 'EXAMPLE: merged PR ask', link: 'https://github.com/EXAMPLE/repo/pull/1', bot: 'QA' }],
      bots: [
        B('President', '431e8cf1-f077-4548-82b7-46c1959dc4c9', 'working', 'EXAMPLE: keeping the Forge checksheet current', 'Sorted items by priority', 3),
        B('QA', '338fc1b1-fecc-475d-ba9e-acd49bcadcfc', 'blocked', 'EXAMPLE: quarantine flaky tests', 'Two runs disagree', 41, 'EXAMPLE: quarantine the flaky map test or keep it blocking?', SCR('test runner', ['map.browser.js  run 1  ✓ pass', 'map.browser.js  run 2  ✗ fail', 'diff: tile timing 40 ms', 'waiting for Tim'])),
        B('HR', '372936ae-81e1-4013-b0d0-9ee47d97a3c4', 'idle', '', 'Checked in', 12),
        B('Cursor', 'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f', 'working', 'EXAMPLE: price scrape for job leads', 'Pushed scraper fix', 6, '', SCR('scraper.log', ['$ npm run scrape -- --leads', 'fetched 412 listings', 'parsed 398 · 14 skipped', 'dedupe: 37 merged', 'writing prices.json …', '$ _'])),
        B('Claude', 'd4118f0c-1b06-4e9a-982f-f5314451c841', 'working', 'Building the 3D office viewer (foreman-cockpit PR)', 'Wrote the scene and tests', 1, '', { title: 'office v2 (foreman-cockpit PR)', lines: ['npm test  ✓', 'office.browser.js  ✓ 5 scenarios', 'next: monitor popup'], updated_at: ago(1) }),
        B('ChatGPT', '7bcb0d85-ec55-4e17-907f-3e71688e8799', 'idle', '', 'Cover letter templates v2', 18),
        B('Root', '70f0889b-ecd4-457b-a69c-304cd2aff540', 'waiting_tim', 'EXAMPLE: job-board API access', 'Asked Tim for the API key', 24, 'EXAMPLE: may I use the paid job-board API key?'),
        B('Usage', 'f1a70b7a-6051-45d7-8031-e46a4cba066f', 'idle', '', 'EXAMPLE: posted the hourly usage readings', 4),
        Object.assign(B('Edgar', '811cc842-4bef-47c2-98d2-0f4bb78f7169', 'working', 'EXAMPLE: cover letter draft', 'Wrote paragraph two', 2), { avatar_shape: 'flower', avatar_color: 'blue' }),
        B('Comp', '424e5611-fb8f-4ae1-a360-051e61e63e8a', 'idle', '', 'Lead scoring rules done', 52, '', 'not a screen object'),
        Object.assign(B('Gauge', '132c47df-ccfb-4f91-b4e2-ebcb1d775bc6', 'idle', 'EXAMPLE: read-only Pipeline Explorer audits', 'Pinned an audit finding on the board', 8), {
          audit: { last_at: ago(40), checks: { ask_tim: 'flag', stuck_processes: 'ok', suspicious_data: 'ok', constraint: 'maybe' }, findings_sent: 2 },
          work: [{ id: 'ex-g1', title: 'EXAMPLE: 8 old asks waiting on Tim', status: 'open', at: ago(8), link: 'https://example.com/EXAMPLE/checksheet/1' }] }),
        B('Sniffer', '321469c4-1299-43e7-bd32-1704f58777be', 'waiting', '', 'Finished the search-filter sweep', 30),
        B('GUI', 'a8b4a0b2-acfd-4485-8444-7ab27007df4a', 'idle', '', 'Adjusted card contrast', 9, '', SCR('card-preview', ['Card contrast: 7.1:1 ✓', 'Badge sizes: 19 / 24 px', 'Waiting for review'])),
        B('Archive', 'c95408dd-c07f-460e-aaa0-9d515fe5be7d', 'idle', '', 'Archived stale asks', 75)
      ],
      _demoWork: [{ id: 'ex-r1', title: 'EXAMPLE: coordinator publish stalled', status: 'open', at: ago(0), link: 'https://example.com/EXAMPLE/issue/9' }],
      items: [
        I('ex-412', 'EXAMPLE #412 Approve job-board API key', 'Needs Tim', 'waiting_tim', 'Root', 'Job pipeline'),
        I('ex-418', 'EXAMPLE #418 Price scrape for job leads', 'P1', 'working', 'Cursor', 'Job pipeline'),
        I('ex-420', 'EXAMPLE #420 Cover letter templates v2', 'P3', 'working', 'ChatGPT', 'Job pipeline'),
        I('ex-57', 'EXAMPLE #57 Merge scraped prices', 'PR merge queue', 'review', 'Cursor', 'Job pipeline'),
        I('ex-405', 'EXAMPLE #405 Dedupe job leads', 'P2', 'done', 'Sniffer', 'Job pipeline'),
        I('ex-401', 'EXAMPLE #401 Indeed search filters', 'P3', 'done', 'Sniffer', 'Job pipeline'),
        I('ex-399', 'EXAMPLE #399 Resume PDF export', 'P3', 'done', 'ChatGPT', 'Job pipeline'),
        I('ex-396', 'EXAMPLE #396 Lead scoring rules', 'P2', 'done', 'Comp', 'Job pipeline'),
        I('ex-392', 'EXAMPLE #392 Archive stale asks', 'P4', 'done', 'Archive', 'Job pipeline'),
        I('ex-390', 'EXAMPLE #390 Usage report v3', 'P4', 'done', 'Usage', 'Job pipeline'),
        I('ex-388', 'EXAMPLE #388 Sidebar icons', 'P4', 'done', 'GUI', 'Job pipeline'),
        Object.assign(I('ex-63', 'EXAMPLE #63 Quarantine flaky tests?', 'Needs Tim', 'needs_tim', 'QA', '3D office', 'https://example.com/EXAMPLE/pull/63'), { question: 'EXAMPLE: quarantine or keep blocking?', note: 'EXAMPLE note: two runs disagree' }),
        I('ex-70', 'EXAMPLE Bitcoin trader backtest', 'P4', 'queued', 'President', 'Bitcoin trader'),
        I('office-viewer', '3D office viewer (foreman-cockpit PR)', 'P2', 'working', 'Claude', '3D office'),
        I('ex-62', 'EXAMPLE #62 Board card styling', 'P2', 'review', 'GUI', '3D office'),
        I('ex-60', 'EXAMPLE #60 OFFICE_STATUS seed', 'P2', 'review', 'President', '3D office'),
        I('ex-59', 'EXAMPLE #59 TV mode key map', 'P3', 'done', 'Claude', '3D office')
      ],
      conversations: [
        { from: 'ChatGPT', to: 'Claude', text: 'EXAMPLE: can you share the board card sizes?', at: ago(3) },
        { from: 'ChatGPT', to: 'Claude', text: 'EXAMPLE: I will match them in the cover letter preview so both stay consistent.', at: ago(2) },
        { from: 'ChatGPT', to: 'Claude', text: '', at: ago(1) }
      ],
      meetings: [],
      _demoMeeting: [{ id: 'ex-standup', title: 'EXAMPLE stand-up', members: ['Cursor', 'ChatGPT', '424e5611-fb8f-4ae1-a360-051e61e63e8a'], started_at: ago(4), chat_id: '' }],
      usage: {
        as_of: ago(6),
        services: [
          { name: 'Grok Bot', pct_used: 64, pct_left: 36, resets_at: new Date(now + 16 * 86400000).toISOString(), note: 'EXAMPLE' },
          { name: 'Claude', pct_used: 11, pct_left: 89, resets_at: new Date(now + 7 * 86400000).toISOString(), note: 'EXAMPLE' },
          { name: 'ChatGPT', pct_used: 92, pct_left: 8, resets_at: new Date(now + 5 * 86400000).toISOString(), note: 'EXAMPLE' }
        ]
      }
    };
  }
  /* Next demo polls: a new card for Comp and one reassigned to Sniffer, so the board pickup walk is visible; the example
     meeting starts on the second poll (6 s) and ends on the third, so both ambient training and the meeting get shown. */
  function demoNextStatus(prev, now) {
    const o = JSON.parse(JSON.stringify(prev));
    o.updated_at = new Date(now).toISOString();
    o.meetings = o.meetings && o.meetings.length ? [] : demoStatus(now)._demoMeeting;
    if (!o.items.some(i => i.id === 'ex-64')) o.items.push({ id: 'ex-64', title: 'EXAMPLE #64 Lounge props', priority: 'P3', status: 'working', owner: 'Comp', link: '', updated_at: o.updated_at, project: '3D office' });
    const it = o.items.find(i => i.id === 'ex-420'); if (it) it.owner = 'Sniffer';
    const root = o.bots.find(b => b.bot === 'Root'), g = o.bots.find(b => b.bot === 'Gauge');
    if (root && !root.work) root.work = demoStatus(now)._demoWork.map(w => Object.assign({}, w, { at: o.updated_at }));
    else if (g && g.work && g.work[0] && !g.work[0].owner) g.work[0].owner = 'Root'; // Root takes Gauge's finding off the board
    return o;
  }
  function demoAutomations(now) {
    const H = 3600000, d0 = etDayStart(now) - 86400000, runs = [];
    const add = (ai, name, hours, res, writer, dur) => hours.forEach(h => { const st = d0 + h * H; runs.push({ ai, name, start: new Date(st).toISOString(), end: new Date(st + (dur || 12) * MIN).toISOString(), result: st > now ? '' : res, writer: !!writer, expected: st > now }); });
    add('ChatGPT', 'EXAMPLE usage reader', [2, 8, 14, 20, 26, 32, 38, 44, 50, 56, 62, 68], 'OK');
    add('ChatGPT', 'EXAMPLE writer gofer', [9, 10, 11, 33, 34, 35, 57, 58], 'OK', true, 40);
    add('Claude', 'EXAMPLE intake', [9, 33, 34, 57], 'FAIL', true, 35);
    add('Grok', 'EXAMPLE shared helper', [5, 17, 29, 41, 53, 65], 'SKIP');
    add('Gauge', 'EXAMPLE audit', [6, 12, 18, 30, 36, 42, 54, 60, 66], 'EMPTY');
    return { generated_at: new Date(now - 4 * MIN).toISOString(), automations: [
      { ai: 'ChatGPT', name: 'EXAMPLE usage reader', result: 'OK', last_run_at: new Date(now - 50 * MIN).toISOString(), next_run_at: new Date(now + 310 * MIN).toISOString() },
      { ai: 'Claude', name: 'EXAMPLE intake', result: 'FAIL', last_run_at: new Date(now - 2 * H).toISOString(), next_run_at: new Date(now + 22 * H).toISOString() },
      { ai: 'Grok', name: 'EXAMPLE shared helper', result: 'OK', last_run_at: new Date(now - 30 * H).toISOString(), next_run_at: new Date(now - 18 * H).toISOString() },
      { ai: 'Gauge', name: 'EXAMPLE audit', result: 'EMPTY', last_run_at: new Date(now - 3 * H).toISOString(), next_run_at: new Date(now + 3 * H).toISOString(), running: true, started_at: new Date(now - 2 * MIN).toISOString() }], runs,
      writer_health: { last_ping: { value: null, status: null, source: null }, last_write_age_min: { value: 42, status: 'green', source: 'EXAMPLE' }, writes_per_hour: { value: 0.5, status: 'amber', source: 'EXAMPLE' }, error_rate: { value: 0.3, status: 'red', source: 'EXAMPLE' }, timeout_rate: { value: null, status: null, source: null }, lock_waits: { value: 1, status: 'green', source: 'EXAMPLE' }, queue_depth: { value: null, status: null, source: null } } };
  }
  const DEMO_PULLS = [
    { repo: 'foreman-cockpit', number: 0, title: 'EXAMPLE: ready PR with passing checks', url: '', draft: false, checks: 'passing', readyForTim: true }
  ];

  /* ---------- OFFICE_STATUS.json schema notes, v3 (all fields optional; whoever writes OFFICE_STATUS can add them) ----------
     bots[] rows ARE the roster: one desk + one character per row, in file order (bots added/removed need no code change).
       bot_id | id           Grok Bot id (either name accepted)
       screen_url           http(s) only; clicking the bot's monitor opens it in a new tab (other schemes are ignored)
       avatar_shape / avatar_color   sidebar mark for bots without a custom model (shapes: square, tablet, sparkle, star,
                            clover, teardrop, wedge, blob, flower, pentagon, dial; colours: magenta, blue, red, green, yellow,
                            black, gray, cyan, brown, ...). Fallback: the baked map in office/avatars.js, then a hash colour.
       status               needs_tim / waiting_tim raise a hand ONLY with a non-empty `question`; waiting / queued = idle;
                            blocked is never Needs Tim.
       audit                { last_at, checks:{ ask_tim, stuck_processes, suspicious_data, constraint: "ok"|"flag" }, findings_sent }
                            -> mini audit view on the bot's monitor and popup; unknown values show "?"; stale after 8 h.
       work[]               [{ id?, title, status, at, link (http/https), owner? (bot_id) }] newest first, latest 5 shown as
                            board cards ("Audit finding" for Gauge, "Diagnosis" for Root, "<name> work" otherwise).
                            id missing -> derived from bot+title+at. owner change -> the new owner takes the card off the board.
       routine              { name, running:true, started_at } -> monitor shows "▶ <name> running" + start time (ET).
     needs_tim[]            { text, link?, bot?, bot_id?, resolved?:true, resolved_at?:ISO, expires_at?:ISO }
                            resolved / resolved_at / past expires_at -> hidden. A GitHub PR link follows the live PR:
                            merged/closed -> gone; open -> "Review / merge queue" (never Needs Tim).
     items[]                + question (needs_tim cards count only with one), note (shown on the card), source, project
                            (any name; mapped to the closest known project by words, else "Other").
  */
  /* =====================================================================================================================
     v3 additions. Everything below is pure (no DOM, no Three.js) and unit-tested in tests/office-logic.test.js.
     ===================================================================================================================== */
  function httpUrl(u) { const v = str(u).trim(); return /^https?:\/\/[^\s]+$/i.test(v) ? v : ''; }

  /* ---------- Projects (item 18/23): any project name maps to the closest known project, else "Other" ---------- */
  const PROJECT_STOP = new Set(['app', 'the', 'main', 'a', 'and', 'of', 'interactive', 'project', 'v2', 'v3']);
  const tokens = s => str(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w && !PROJECT_STOP.has(w));
  function mapProject(name) {
    const n = str(name).trim(); if (!n) return 'Other';
    const exact = KNOWN_PROJECTS.find(p => p.name.toLowerCase() === n.toLowerCase()); if (exact) return exact.name;
    const t = new Set(tokens(n)); let best = null, score = 0;
    for (const p of KNOWN_PROJECTS) { const k = tokens(p.name).filter(w => t.has(w)).length; if (k > score) { score = k; best = p.name; } }
    return best || 'Other';
  }
  /* Tabs: "All" plus one per project present in the data (known order first, Other last). */
  function projectTabs(items) {
    const present = new Set((items || []).map(i => i.project));
    const tabs = KNOWN_PROJECTS.map(p => p.name).filter(n => present.has(n));
    for (const p of present) if (!tabs.includes(p) && p !== 'Other') tabs.push(p);
    if (present.has('Other')) tabs.push('Other');
    return ['All'].concat(tabs);
  }
  /* One tab of the board: four columns, Done collapsed unless opened; `max` cards per column (null = all). */
  function boardView(items, opts) {
    const o = opts || {}, tab = o.tab || 'All', max = o.max == null ? null : o.max;
    const mine = sortItems((items || []).filter(i => tab === 'All' || i.project === tab));
    return COLUMNS.map(c => {
      const all = mine.filter(i => columnFor(i) === c.id), collapsed = c.id === 'done' && !o.doneOpen;
      const cards = collapsed ? [] : max == null ? all : all.slice(0, max);
      return { id: c.id, label: c.label, total: all.length, cards, more: collapsed ? 0 : all.length - cards.length, collapsed };
    });
  }

  /* Per-column paging (item 18): each column cycles through its own pages; page = floor(tick) mod its own page count.
     A column that fits on one page never cycles (always page 0), and an empty column is { items: [], page: 0, pages: 1 }. */
  function columnPage(items, perPage, tick) {
    const list = Array.isArray(items) ? items : [], per = Math.max(1, Math.floor(Number(perPage)) || 1);
    const pages = Math.max(1, Math.ceil(list.length / per));
    const t = Math.floor(Number(tick)) || 0, page = pages > 1 ? ((t % pages) + pages) % pages : 0;
    return { items: list.slice(page * per, page * per + per), page, pages };
  }

  /* ---------- Live PR state (item 12/16/23) ---------- */
  function prKey(link) { const m = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i.exec(str(link)); return m ? (m[1] + '/' + m[2]).toLowerCase() + '#' + m[3] : ''; }
  /* GitHub pulls list (state=all) -> Map key -> 'open' | 'merged' | 'closed' */
  function prStates(owner, repo, list) {
    const m = new Map();
    for (const p of Array.isArray(list) ? list : []) if (p && p.number) m.set((owner + '/' + repo).toLowerCase() + '#' + p.number, p.state === 'open' ? 'open' : p.merged_at ? 'merged' : 'closed');
    return m;
  }
  function applyPrStates(items, states) { return (items || []).map(i => { const s = states && states.get(prKey(i.link)); return s ? Object.assign({}, i, { prState: s }) : i; }); }

  /* ---------- Needs Tim (items 12 + 16): only current asks clear on their own ----------
     needs_tim entries: hidden when resolved:true, resolved_at set, or expires_at passed; a PR-linked entry follows the PR:
     merged/closed -> gone, open -> "Review / merge queue" (never Needs Tim). Bots: only status needs_tim/waiting_tim with a
     question (blocked never counts). Open PRs are listed under Review / merge queue only. EXAMPLE rows only in demo mode. */
  function needsList(o) {
    const now = o.now || Date.now(), states = o.prStates || new Map(), demo = !!o.demo, needs = [], review = [], seen = new Set();
    const live = t => demo || !/^EXAMPLE\b/i.test(str(t).trim());
    for (const b of o.bots || []) if (b.status === 'waiting_tim' && b.question && live(b.question)) {
      const pr = prKey(b.link), st = pr && states.get(pr);
      if (st === 'merged' || st === 'closed') continue;
      if (st === 'open') { if (!seen.has(pr)) { seen.add(pr); review.push({ text: b.bot + ': ' + b.question, link: b.link, bot: b.bot, pr }); } continue; }
      needs.push({ kind: 'bot', text: b.bot + ': ' + b.question, bot: b.bot, bot_id: b.bot_id, link: b.link });
    }
    for (const n of o.entries || []) {
      if (!n || !live(n.text) || n.resolved || n.resolved_at) continue;
      const exp = time(n.expires_at); if (exp != null && exp <= now) continue;
      const pr = prKey(n.link), st = pr && states.get(pr);
      if (st === 'merged' || st === 'closed') continue;
      if (st === 'open') { if (!seen.has(pr)) { seen.add(pr); review.push({ text: n.text, link: n.link, bot: n.bot, pr }); } continue; }
      if (pr) { if (seen.has(pr)) continue; seen.add(pr); }
      needs.push({ kind: 'entry', text: n.text, link: n.link, bot: n.bot, bot_id: n.bot_id });
    }
    for (const p of o.pulls || []) {
      const k = prKey(p.url); if (!live(p.title) || (k && seen.has(k))) continue; if (k) seen.add(k);
      review.push({ text: p.repo + ' #' + p.number + ' ' + p.title, link: p.url, pr: k, draft: p.draft, checks: p.checks });
    }
    return { needs, review, empty: !needs.length };
  }

  /* ---------- Fetching OFFICE_STATUS.json / AUTOMATIONS_STATUS.json (item 23) ----------
     raw.githubusercontent.com caches for minutes and ignores ?t=, so read through the contents API (Accept: raw) with
     If-None-Match; a 304 keeps the current data. Unauthenticated API calls are 60/hour per IP and shared with the PR
     list, so one RateGate is shared: when X-RateLimit-Remaining <= RATE_LOW or on 403/429 we fall back to raw until
     X-RateLimit-Reset. */
  const RATE_LOW = 6, PR_CACHE_MS = 5 * MIN;
  function createGate() {
    return {
      until: 0, remaining: null,
      open(now) { return now >= this.until; },
      note(res, now) {
        const h = k => (res.headers && res.headers.get ? res.headers.get(k) : null);
        const rem = Number(h('X-RateLimit-Remaining')), reset = Number(h('X-RateLimit-Reset')) * 1000;
        if (Number.isFinite(rem) && h('X-RateLimit-Remaining') != null) this.remaining = rem;
        const resetAt = Number.isFinite(reset) && reset > now ? reset : now + 15 * MIN;
        if (res.status === 403 || res.status === 429 || (this.remaining != null && this.remaining <= RATE_LOW)) this.until = resetAt;
      }
    };
  }
  function createJsonSource(opt) {
    const st = { etag: '', data: null, source: '', at: 0 };
    async function get(now) {
      const f = opt.fetch, gate = opt.gate;
      if (gate.open(now)) {
        try {
          const headers = { Accept: 'application/vnd.github.raw' }; if (st.etag) headers['If-None-Match'] = st.etag;
          const r = await f(opt.apiUrl, { cache: 'no-store', headers });
          gate.note(r, now);
          if (r.status === 304 && st.data != null) { st.source = 'api'; st.at = now; return { ok: true, data: st.data, source: 'api', notModified: true }; }
          if (r.ok) { const d = JSON.parse(await r.text()); st.etag = (r.headers && r.headers.get && r.headers.get('ETag')) || ''; st.data = d; st.source = 'api'; st.at = now; return { ok: true, data: d, source: 'api' }; }
          if (r.status === 404) return { ok: false, status: 404, error: 'not found' };
        } catch (e) { if (e instanceof SyntaxError) return { ok: false, error: 'not valid JSON' }; }
      }
      try {
        const r = await f(opt.rawUrl + '?t=' + Math.floor(now / 60000), { cache: 'no-cache' });
        if (!r.ok) return { ok: false, status: r.status, error: 'HTTP ' + r.status };
        const d = JSON.parse(await r.text()); st.data = d; st.source = 'raw'; st.at = now; return { ok: true, data: d, source: 'raw' };
      } catch (e) { return { ok: false, error: e instanceof SyntaxError ? 'not valid JSON' : String(e && e.message || e) }; }
    }
    return { get, state: st };
  }
  /* "updated 2 min ago", stale over STALE_MIN */
  function dataAge(iso, now) {
    const t = time(iso); if (t == null) return { text: 'update time unknown', stale: true, min: null };
    const m = Math.max(0, Math.floor((now - t) / MIN));
    return { text: 'updated ' + (m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min ago'), stale: m > STALE_MIN, min: m };
  }

  /* ---------- Floor: desk layout for N bots (item 13), standing slots and separation (item 22) ---------- */
  /* Tim (Nov 16, 9:07 AM): President's desk and the whole back row stay where the earlier (v2) layout had them.
     The v2 grid is 4 columns at DESK_X by 3 rows at DESK_Z (back row first). Pinned names keep their v2 spot; everyone
     else fills the free v2 spots in roster order, then overflow spots (right side first, then a front row). */
  const DESK_X = [-7, -3.8, -0.6, 2.6], DESK_Z = [-4, -0.6, 2.8];
  const DESK_PINS = { Claude: [0, 0], Cursor: [1, 0], Comp: [2, 0], GUI: [3, 0], President: [1, 1] }; // [col, row] in the v2 grid
  const DESK_OVERFLOW = [[5.8, -0.6], [5.8, 2.8], [5.8, 6.2], [2.6, 6.2], [-0.6, 6.2], [-3.8, 6.2]];
  function deskLayout(n, names) {
    const grid = [];
    DESK_Z.forEach((z, r) => DESK_X.forEach((x, c) => grid.push({ x, z, row: r, col: c })));
    const spots = grid.concat(DESK_OVERFLOW.map(([x, z], k) => ({ x, z, row: DESK_Z.length + Math.floor(k / 3), col: DESK_X.length + k })));
    for (let k = 0; spots.length < n; k++) spots.push({ x: DESK_X[k % 4], z: +(DESK_Z[2] + 3.4 * (2 + Math.floor(k / 4))).toFixed(2), row: 5 + Math.floor(k / 4), col: k % 4 });
    const key = (p) => p.x + ',' + p.z, used = new Set(), out = new Array(n);
    const nm = names || [];
    for (let i = 0; i < n; i++) {
      const pin = DESK_PINS[nm[i]];
      if (!pin) continue;
      const p = grid[pin[1] * DESK_X.length + pin[0]];
      if (used.has(key(p))) continue; // a duplicate name falls back to a free spot
      out[i] = Object.assign({}, p); used.add(key(p));
    }
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (out[i]) continue;
      while (used.has(key(spots[s]))) s++;
      out[i] = Object.assign({}, spots[s]); used.add(key(spots[s])); s++;
    }
    return out;
  }
  const MIN_SEP = 0.8;          // metres between any two standing / walking bots
  /* Walk camera: floor level, eye height = 1.3 x the President's head height (body 0.36 + head 0.69 + face offset, chars.js makePresident). */
  const PRESIDENT_HEAD_Y = 1.07, EYE_HEIGHT = +(PRESIDENT_HEAD_Y * 1.3).toFixed(3); // Tim: eye height raised ~30% (was exactly the head height, 1.07)
  const CLEARANCE = 0.35;      // extra stand-off from desks, props, board and lounge furniture so faces stay visible
  /* Standing slots in front of the board: two staggered rows, >= MIN_SEP apart, sized to n. */
  function boardSlots(n, cx, z, width) {
    const w = width || 8, per = Math.max(1, Math.floor(w / MIN_SEP) + 1), out = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / per), k = i % per, inRow = Math.min(per, n - row * per);
      const x = cx + (k - (inRow - 1) / 2) * MIN_SEP * (row % 2 ? 1 : 1.25);
      out.push({ x: +x.toFixed(3), z: +(z + row * MIN_SEP).toFixed(3), face: Math.PI });
    }
    return out;
  }
  /* Slot reservation: one bot per slot id. */
  function createSlotBook() {
    const by = new Map(), of = new Map();
    return {
      take(id, who) { if (by.has(id) && by.get(id) !== who) return false; this.release(who); by.set(id, who); of.set(who, id); return true; },
      release(who) { const id = of.get(who); if (id != null) { by.delete(id); of.delete(who); } },
      holder: id => by.get(id), slotOf: who => of.get(who), size: () => by.size
    };
  }
  /* Push apart any two movable points closer than min (fixed points never move). Mutates and returns pts. */
  function separate(pts, min, iters) {
    const m = min || MIN_SEP;
    for (let it = 0; it < (iters || 6); it++) {
      let moved = false;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j]; if (a.fixed && b.fixed) continue;
        let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= m) continue;
        if (d < 1e-6) { dx = Math.cos(i * 2.4 + j); dz = Math.sin(i * 2.4 + j); d = 1; }
        const push = (m - d) + 1e-4, ux = dx / d, uz = dz / d;
        if (a.fixed) { b.x += ux * push; b.z += uz * push; } else if (b.fixed) { a.x -= ux * push; a.z -= uz * push; }
        else { a.x -= ux * push / 2; a.z -= uz * push / 2; b.x += ux * push / 2; b.z += uz * push / 2; }
        moved = true;
      }
      if (!moved) break;
    }
    return pts;
  }
  /* Walking cap: never more than a third of the bots walking at once. */
  function walkCap(total) { return Math.max(1, Math.floor(total / 3)); }
  function admitWalkers(requests, walkingNow, total) {
    const room = Math.max(0, walkCap(total) - walkingNow);
    return new Set(requests.slice().sort((a, b) => a.since - b.since || a.name.localeCompare(b.name)).slice(0, room).map(r => r.name));
  }


  /* ---------- Idle trips + pure navigation (Tim: characters get up, walk to idle spots, return to the desk) ---------- */
  /* Nav grid with A*: obstacles are {x0,x1,z0,z1,viewerOnly?} boxes in metres; cells within `inflate` of a box (or the walls) are blocked.
     route() returns [{x,z}] waypoints that never cross a blocked cell (line-of-sight smoothing only joins cells that are all free). */
  function createNav(o) {
    const RW = o.RW, RD = o.RD, CELL = o.CELL || 0.2, INF = o.inflate == null ? 0.22 : o.inflate, WALL = o.wall == null ? 0.4 : o.wall;
    const GX = Math.round(RW / CELL), GZ = Math.round(RD / CELL), grid = new Uint8Array(GX * GZ);
    const toCell = (x, z) => [Math.max(0, Math.min(GX - 1, Math.floor((x + RW / 2) / CELL))), Math.max(0, Math.min(GZ - 1, Math.floor((z + RD / 2) / CELL)))];
    const cellC = (i, j) => [-RW / 2 + (i + 0.5) * CELL, -RD / 2 + (j + 0.5) * CELL];
    function build(obstacles) {
      for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
        const [x, z] = cellC(i, j);
        let b = x < -RW / 2 + WALL || x > RW / 2 - WALL || z < -RD / 2 + WALL || z > RD / 2 - WALL;
        if (!b) for (const ob of obstacles || []) if (!ob.viewerOnly && x > ob.x0 - INF && x < ob.x1 + INF && z > ob.z0 - INF && z < ob.z1 + INF) { b = true; break; }
        grid[j * GX + i] = b ? 1 : 0;
      }
    }
    const free = (i, j) => i >= 0 && j >= 0 && i < GX && j < GZ && !grid[j * GX + i];
    function nearestFree(i, j) {
      if (free(i, j)) return [i, j];
      for (let r = 1; r < 15; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && free(i + di, j + dj)) return [i + di, j + dj];
      return [i, j];
    }
    function los(ax, az, bx, bz) {
      const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.1);
      for (let k = 1; k < n; k++) { const [i, j] = toCell(ax + (bx - ax) * k / n, az + (bz - az) * k / n); if (!free(i, j)) return false; }
      return true;
    }
    function route(from, to) {
      const [si, sj] = nearestFree(...toCell(from.x, from.z)), [ti, tj] = nearestFree(...toCell(to.x, to.z));
      const N = GX * GZ, gS = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      const open = [[0, si, sj]]; gS[sj * GX + si] = 0;
      const h = (i, j) => Math.hypot(i - ti, j - tj);
      let found = false, guard = 0;
      while (open.length && guard++ < 20000) {
        let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
        const [, i, j] = open.splice(bi, 1)[0], id = j * GX + i;
        if (closed[id]) continue; closed[id] = 1;
        if (i === ti && j === tj) { found = true; break; }
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (!free(ni, nj)) continue;
          if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
          const nid = nj * GX + ni, ng = gS[id] + (di && dj ? 1.414 : 1);
          if (ng < gS[nid]) { gS[nid] = ng; came[nid] = id; open.push([ng + h(ni, nj), ni, nj]); }
        }
      }
      const raw = [];
      if (found) { let id = tj * GX + ti; while (id !== -1) { raw.push(cellC(id % GX, Math.floor(id / GX))); id = came[id]; } raw.reverse(); }
      raw.push([to.x, to.z]);
      const out = []; let ax = from.x, az = from.z, k = 0;
      while (k < raw.length) {
        let far = k; for (let m = raw.length - 1; m > k; m--) if (los(ax, az, raw[m][0], raw[m][1])) { far = m; break; }
        out.push({ x: raw[far][0], z: raw[far][1] }); ax = raw[far][0]; az = raw[far][1]; k = far + 1;
      }
      return { points: out, found };
    }
    build(o.obstacles);
    return { build, free, toCell, cellC, nearestFree, los, route: (a, b) => route(a, b).points, search: route, GX, GZ };
  }
  /* Idle trips. Each bot has its own cycle (3-5 min, staggered by hash). At the start of a cycle it may get up for TRIP_AWAY_S
     seconds (walk out, ~60 s of idle animation at the spot, walk back and sit). A trip is admitted only if fewer than `cap` bots
     (default: a third of the office, like walkCap) are away at that instant and the spot is free, so spots are never double-booked
     and not everyone leaves at once. Admission depends only on bots that left earlier, so it is stable for the whole trip. */
  const TRIP_SPOTS = ['bike', 'pool', 'lounge', 'board', 'waterfall'], TRIP_AWAY_S = 90;
  function tripCycle(name) { const period = 180 + hash('tp:' + name) % 121; return { period, off: hash('to:' + name) % period }; }
  function tripScheduleAt(names, nowMs, opts) {
    const o = opts || {}, spots = o.spots || TRIP_SPOTS, cap = o.cap != null ? o.cap : walkCap(o.total || names.length), away = o.awayS || TRIP_AWAY_S;
    const cyc = {}; for (const n of names) cyc[n] = tripCycle(n);
    const memo = new Map();
    // the window of `n` that contains absolute second T, or null
    const windowAt = (n, T) => { const c = cyc[n], t = T + c.off, k = Math.floor(t / c.period), into = t - k * c.period; return into < away ? { cycle: k, start: k * c.period - c.off } : null; };
    function admit(n, start, cycle) {
      const key = n + '@' + start; if (memo.has(key)) return memo.get(key);
      memo.set(key, null);
      const taken = new Set(); let count = 0;
      for (const m of names) {
        if (m === n) continue; const w = windowAt(m, start);
        if (!w || !(w.start < start || (w.start === start && m < n))) continue; // only bots that left before us
        const a = admit(m, w.start, w.cycle); if (a) { count++; taken.add(a.spot); }
      }
      let res = null;
      if (count < cap) { const pref = hash(n + ':' + cycle) % spots.length; for (let i = 0; i < spots.length; i++) { const sp = spots[(pref + i) % spots.length]; if (!taken.has(sp)) { res = { spot: sp, start, cycle }; break; } } }
      memo.set(key, res); return res;
    }
    const nowS = Math.floor(nowMs / 1000), out = {};
    for (const n of names) { const w = windowAt(n, nowS); if (!w) continue; const a = admit(n, w.start, w.cycle); if (a) out[n] = { spot: a.spot, since: a.start, into: nowS - a.start }; }
    return out;
  }
  /* ---------- Busy office schedule (Tim 12:19 / 12:20 AM) ---------- */
  const RECENT_REPLAY_MIN = 30;
  const IDLE_ACTS = ['wander', 'coffee', 'chat', 'fridge', 'lounge', 'chat', 'wander', 'bike', 'sleep', 'visitdesk', 'chat', 'game']; // sleep+game = 2/12
  const BREAK_ACTS = ['stretch', 'coffee', 'stretch', 'fridge']; // stretch at the desk (short) or refresh (coffee / drink)
  function idleSlot(name, nowMs) {
    const dur = 120 + hash('dur:' + name) % 61, t = nowMs / 1000 + hash('off:' + name) % dur; // 2-3 min, staggered per bot
    return { idx: Math.floor(t / dur), dur, start: Math.floor(t / dur) * dur - hash('off:' + name) % dur };
  }
  function idleAct(name, nowMs) { const s = idleSlot(name, nowMs); return IDLE_ACTS[hash(name + ':' + s.idx) % IDLE_ACTS.length]; }
  function workBreak(name, nowMs) {
    const period = 240 + hash('brk:' + name) % 121, t = nowMs / 1000 + hash('bo:' + name) % period; // every 4-6 min, staggered
    const kind = BREAK_ACTS[hash(name + ':b' + Math.floor(t / period)) % BREAK_ACTS.length];
    if (t % period >= (kind === 'stretch' ? 14 : 45)) return null; // a stretch is ~14 s, a refresh walk ~45 s
    return kind;
  }
  /* ---------- Item 16b: pose follows the freshest real signal ----------
     A bot's "last seen" is the newest of: the row's last_action_at, its screen text, running routine, audit and work
     card times (all on the OFFICE_STATUS row), plus extra times the page already reads (PR updated_at for the bot's
     PR-linked cards, its Actions/automation runs, its mirrored terminal screen). Older than BOT_STALE_MIN, or no time
     at all -> stale: never typing, whatever the status says. Times more than a minute in the future are ignored. */
  const BOT_STALE_MIN = 120;
  function ageText(min) { return min < 60 ? min + ' min ago' : min < 48 * 60 ? Math.floor(min / 60) + ' h ago' : Math.floor(min / 1440) + ' d ago'; }
  function freshness(bot, now, extra) {
    const b = bot || {};
    const own = [b.last_action_at, b.screen && b.screen.updated_at, b.routine && b.routine.started_at, b.audit && b.audit.last_at]
      .concat((b.work || []).map(w => w.at));
    let lastSeen = null;
    for (const v of own.concat(extra || [])) {
      const t = typeof v === 'number' ? v : time(v);
      if (t != null && t <= now + MIN && (lastSeen == null || t > lastSeen)) lastSeen = t;
    }
    const ageMin = lastSeen == null ? null : Math.max(0, Math.floor((now - lastSeen) / MIN));
    const stale = ageMin == null || ageMin > BOT_STALE_MIN;
    return { lastSeen, ageMin, stale, label: stale ? 'stale · last seen ' + (ageMin == null ? 'unknown' : ageText(ageMin)) : '' };
  }
  /* Extra signal times for one bot from data the page already holds: ctx = { items, prTimes (Map prKey -> ISO),
     screens (parseScreensIndex), auto (parseAutomations) }. */
  function botSignals(bot, ctx) {
    const c = ctx || {}, out = [], name = str(bot && bot.bot), id = str(bot && bot.bot_id);
    for (const i of c.items || []) if (i.owner === name && c.prTimes) { const t = c.prTimes.get(prKey(i.link)); if (t) out.push(t); }
    const sc = id && c.screens && c.screens.screens && c.screens.screens[id];
    if (sc && !sc.paused) out.push(sc.at);
    for (const r of (c.auto && c.auto.rows) || []) if (r.ai === name) out.push(r.last_run_at, r.running ? r.started_at : '');
    return out;
  }
  /* GitHub pulls list -> Map prKey -> updated_at (same key as prStates) */
  function prTimes(owner, repo, list) {
    const m = new Map();
    for (const p of Array.isArray(list) ? list : []) if (p && p.number && time(p.updated_at) != null) m.set((owner + '/' + repo).toLowerCase() + '#' + p.number, str(p.updated_at));
    return m;
  }

  /* Idle with a recent last action: replay it for up to RECENT_REPLAY_MIN minutes. */
  function replayFor(bot, now) {
    if (!bot || bot.status !== 'idle' || !str(bot.last_action).trim()) return null;
    const t = time(bot.last_action_at); if (t == null || t > now + MIN) return null;
    const m = Math.floor((now - t) / MIN); if (m >= RECENT_REPLAY_MIN) return null;
    return { act: /\b(board|pinned|pin)\b/i.test(bot.last_action) ? 'replay_board' : 'replay', min: m, text: bot.last_action };
  }

  /* ---------- AI usage readings (usage/AI_USAGE_READINGS.jsonl) ----------
     USAGE_CHECK_SCHEDULE_ET: forge-coordination lanes/CLAUDE_AI_USAGE_READER.txt line 3, "CURRENT CODEX SCHEDULE=02:05,
     08:05,14:05,20:05 America/New_York" (readings in the file land at about 2:0x, 8:0x, 14:0x, 20:0x ET). */
  const USAGE_CHECK_SCHEDULE_ET = ['02:05', '08:05', '14:05', '20:05'];
  const USAGE_GRACE_MIN = 30;
  const USAGE_PROVIDERS = [{ id: 'CLAUDE', name: 'Claude' }, { id: 'CHATGPT', name: 'ChatGPT' }, { id: 'GROK', name: 'Grok' }];
  function parseReadings(text) {
    const out = [];
    for (const line of str(text).split(/\r?\n/)) {
      if (!line.trim()) continue; let r; try { r = JSON.parse(line); } catch (e) { continue; }
      if (!r || time(r.at) == null || !str(r.provider)) continue;
      out.push({ at: str(r.at), provider: str(r.provider).toUpperCase(), usedPct: typeof r.usedPct === 'number' && Number.isFinite(r.usedPct) ? r.usedPct : null, meter: str(r.meter), label: str(r.label), resetsAt: str(r.resetsAt), status: str(r.status) });
    }
    return out;
  }
  /* Latest reading per provider; a weekly meter wins over older session meters at the same time. */
  function latestPerProvider(readings) {
    const best = {};
    for (const r of readings) { const b = best[r.provider]; if (!b || time(r.at) > time(b.at) || (time(r.at) === time(b.at) && r.meter === 'weekly')) best[r.provider] = r; }
    return best;
  }
  function etOffsetMin(ms) { // minutes ET is behind UTC at ms (DST aware)
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(ms));
    const g = k => Number(p.find(x => x.type === k).value);
    return Math.round((ms - Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))) / MIN);
  }
  /* Next scheduled check strictly after `ms`. */
  function nextCheck(ms, schedule) {
    const sch = schedule || USAGE_CHECK_SCHEDULE_ET;
    const off = etOffsetMin(ms), et = new Date(ms - off * MIN), base = Date.UTC(et.getUTCFullYear(), et.getUTCMonth(), et.getUTCDate());
    for (let d = 0; d < 3; d++) for (const hm of sch) {
      const [h, m] = hm.split(':').map(Number), local = base + d * 1440 * MIN + (h * 60 + m) * MIN;
      const utc = local + etOffsetMin(local + off * MIN) * MIN;
      if (utc > ms) return utc;
    }
    return ms + 6 * 60 * MIN;
  }
  function countdown(target, now) { const m = Math.max(0, Math.ceil((target - now) / MIN)); return 'Next check in ' + Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; }
  /* stale = the reading is older than one missed cycle: the check after it is past by more than the grace period */
  function readingStale(r, now) { const t = time(r && r.at); return t == null || now > nextCheck(t) + USAGE_GRACE_MIN * MIN; }
  function etClock(ms) { return new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }); }
  function usageRows(readings, now, fallback) {
    const latest = latestPerProvider(readings || []);
    if (!Object.keys(latest).length) return (fallback && fallback.services || []).map(s => ({ name: s.name, pct_used: s.pct_used, label: s.note || '', measured: fallback.as_of ? 'Reported ' + etClock(time(fallback.as_of)) + ' ET' : 'Reported earlier', next: countdown(nextCheck(now), now), stale: usageStale(fallback, now), at: time(fallback.as_of), source: 'OFFICE_STATUS.json' }));
    return USAGE_PROVIDERS.filter(p => latest[p.id]).map(p => { const r = latest[p.id]; return { name: p.name, pct_used: r.usedPct, label: r.label + (r.status && r.status !== 'OK' ? ' · ' + r.status : ''), resets_at: r.resetsAt, measured: 'Measured ' + etClock(time(r.at)) + ' ET', next: countdown(nextCheck(now), now), stale: readingStale(r, now), at: time(r.at), source: 'AI_USAGE_READINGS.jsonl' }; });
  }
  /* Newest reading time across the rows (ms or null): the monitor header and the wall both show this one time. */
  function usageLatest(rows) { const ts = (rows || []).map(r => r.at).filter(t => t != null); return ts.length ? Math.max(...ts) : null; }
  function usageHeader(rows, now) { const t = usageLatest(rows); return t == null ? 'No usage reading yet' : 'Latest reading ' + etClock(t) + ' ET · ' + relTime(new Date(t).toISOString(), now); }

  /* ---------- Desk screens: mirrors of each bot's real screen (office-screens repo; publisher not live yet) ---------- */
  const SCREEN_FRESH_MIN = 15;
  function parseScreensIndex(o) {
    const out = { updated_at: '', screens: {} };
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    out.updated_at = time(o.updated_at) != null ? str(o.updated_at) : '';
    const s = o.screens && typeof o.screens === 'object' && !Array.isArray(o.screens) ? o.screens : {};
    for (const id of Object.keys(s)) { const e = s[id]; if (!/^[A-Za-z0-9-]{1,64}$/.test(id) || !e || time(e.at) == null) continue; out.screens[id] = { at: str(e.at), paused: e.paused === true }; }
    return out;
  }
  /* -> { show: 'image' | 'fallback', why } */
  function screenState(index, botId, now) {
    const e = index && index.screens && index.screens[botId];
    if (!e) return { show: 'fallback', why: 'Screen offline' };
    if (e.paused) return { show: 'fallback', why: 'Screen paused' };
    if (now - time(e.at) > SCREEN_FRESH_MIN * MIN) return { show: 'fallback', why: 'Screen offline (last ' + etClock(time(e.at)) + ' ET)' };
    return { show: 'image', at: e.at, why: 'Screen as of ' + etClock(time(e.at)) + ' ET' };
  }
  /* Clicking a bot's screen goes right to the live thing. */
  const PRESIDENT_ID = '431e8cf1-f077-4548-82b7-46c1959dc4c9', USAGE_ID = 'f1a70b7a-6051-45d7-8031-e46a4cba066f';
  const PRESIDENT_SCREEN_URL = 'https://cursor.com/canvas/store-1b4f4a75-6249-4418-bccc-1cb653f649a5/24a10135-b56d-42de-b4af-34cbbbeb82dc';
  function screenTarget(bot) {
    const u = httpUrl(bot && bot.screen_url);
    if (u) return { kind: 'url', href: u };
    if (bot && (bot.bot === 'President' || bot.bot_id === PRESIDENT_ID)) return { kind: 'url', href: PRESIDENT_SCREEN_URL };
    if (bot && (bot.bot === 'Usage' || bot.bot_id === USAGE_ID)) return { kind: 'usage', href: '#usage' };
    return { kind: 'popup', href: '' };
  }
  /* President's left half: the Tim-President chat feed, plain text, private data masked as a backup. */
  const CHAT_MAX = 12;
  function maskText(t) {
    return str(t).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
      .replace(/(?:\+?\d[\s().-]?){7,}\d/g, '[phone]').replace(/[A-Za-z0-9_-]{24,}/g, '[token]');
  }
  function parseChatFeed(text) {
    const out = [];
    for (const line of str(text).split(/\r?\n/)) {
      if (!line.trim()) continue; let r; try { r = JSON.parse(line); } catch (e) { continue; }
      if (!r || time(r.at) == null || !['Tim', 'President'].includes(r.from) || !str(r.text).trim()) continue;
      out.push({ at: str(r.at), from: r.from, text: maskText(str(r.text).replace(/\s+/g, ' ').trim()).slice(0, 400) });
    }
    return out.sort((a, b) => time(a.at) - time(b.at)).slice(-CHAT_MAX);
  }
  /* control/PRESIDENT_CHAT_FEED.jsonl may not be published yet. A 404 is the normal "not published" state, not an error:
     never log it, treat it as an empty feed (chat [], err ''), and back off to CHAT_PROBE_MS. While not (yet) known to exist, check the
     control/ directory listing through the contents API (one 200 response, so the browser prints no network 404) and only
     read the raw file once the name is listed. If the API budget is spent (gate closed), fall back to the raw URL at the
     slow rate. Once found it is read every call (the caller's normal poll rate). Never throws, never logs.
     opt: { fetch, gate, dirUrl, rawUrl, name } */
  const CHAT_PROBE_MS = 5 * MIN, CHAT_NOT_PUBLISHED = 'Chat not published yet', CHAT_UNAVAILABLE = 'Chat feed unavailable';
  function chatFeedFromResponse(status, text) {
    if (status === 404) return { chat: [], err: '', published: false }; // missing feed = empty feed, not an error
    if (!(status >= 200 && status < 300)) return { chat: null, err: CHAT_UNAVAILABLE, published: null };
    return { chat: parseChatFeed(text), err: '', published: true };
  }
  function createChatFeed(opt) {
    const st = { published: null, nextAt: 0, chat: [], err: '' };
    const view = () => ({ chat: st.chat, err: st.err, published: st.published });
    const notYet = now => { st.published = false; st.chat = []; st.err = ''; st.nextAt = now + CHAT_PROBE_MS; return view(); };
    async function get(now) {
      if (now < st.nextAt) return view();
      const f = opt.fetch, gate = opt.gate;
      try {
        if (st.published !== true && gate && gate.open(now)) {
          const r = await f(opt.dirUrl, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
          gate.note(r, now);
          if (r.status === 404) return notYet(now);
          if (r.ok) {
            const list = await r.json();
            if (!Array.isArray(list) || !list.some(e => e && e.name === opt.name)) return notYet(now);
          } else if (st.published === false) { st.nextAt = now + CHAT_PROBE_MS; return view(); } // rate limited etc.: stay quiet
        }
        const r = await f(opt.rawUrl + '?t=' + Math.floor(now / MIN), { cache: 'no-cache' });
        const res = chatFeedFromResponse(r.status, r.ok ? await r.text() : '');
        if (res.published === false) return notYet(now);
        st.chat = res.chat; st.err = res.err; if (res.published) st.published = true; st.nextAt = 0;
      } catch (e) { st.chat = null; st.err = CHAT_UNAVAILABLE; st.nextAt = 0; }
      return view();
    }
    return { get, state: st };
  }

  /* ---------- Gauge's audit (optional bots[].audit) ---------- */
  const AUDIT_CHECKS = [['ask_tim', 'Ask Tim'], ['stuck_processes', 'Stuck processes'], ['suspicious_data', 'Suspicious data'], ['constraint', 'Constraint']];
  const AUDIT_STALE_H = 8;
  function parseAudit(a) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
    const checks = a.checks && typeof a.checks === 'object' ? a.checks : {};
    return { last_at: time(a.last_at) != null ? str(a.last_at) : '', checks: AUDIT_CHECKS.map(([k, label]) => ({ key: k, label, value: checks[k] === 'ok' || checks[k] === 'flag' ? checks[k] : '?' })),
      findings_sent: Number.isInteger(a.findings_sent) && a.findings_sent >= 0 ? a.findings_sent : null };
  }
  function auditStale(audit, now) { const t = time(audit && audit.last_at); return t == null || now - t > AUDIT_STALE_H * 60 * MIN; }

  /* ---------- Routine running (item 19a, optional bots[].routine {name, running, started_at}) ---------- */
  function parseRoutine(r) {
    if (!r || typeof r !== 'object' || r.running !== true || !str(r.name).trim()) return null;
    return { name: truncate(str(r.name), 60), started_at: time(r.started_at) != null ? str(r.started_at) : '' };
  }

  /* ---------- Bots' own work cards (optional bots[].work) ---------- */
  const WORK_MAX = 5;
  function parseWork(list, bot, botId) {
    if (!Array.isArray(list)) return [];
    return list.filter(w => w && typeof w === 'object' && str(w.title).trim()).map(w => ({
      id: str(w.id).trim() || 'w-' + hash(str(botId || bot) + '|' + str(w.title).trim() + '|' + str(w.at)).toString(36),
      title: truncate(str(w.title), 120), status: str(w.status).trim() || 'open', at: time(w.at) != null ? str(w.at) : '',
      link: httpUrl(w.link), owner: str(w.owner).trim() || str(botId) || str(bot), poster: str(bot)
    })).sort((a, b) => (time(b.at) || 0) - (time(a.at) || 0)).slice(0, WORK_MAX);
  }
  function workLabel(bot) { return bot === 'Gauge' ? 'Audit finding' : bot === 'Root' ? 'Diagnosis' : bot + ' work'; }
  /* Diff work cards between polls: first load -> nothing; new -> poster pins it; owner changed -> new owner takes it. */
  function diffWork(prev, next) {
    if (!prev) return [];
    const before = new Map(prev.map(w => [w.id, w])), out = [];
    for (const w of next) {
      const o = before.get(w.id);
      if (!o) out.push({ kind: 'pin', id: w.id, bot: w.poster, owner: w.ownerName || w.poster });
      else if ((o.ownerName || o.owner) !== (w.ownerName || w.owner)) out.push({ kind: 'take', id: w.id, bot: w.ownerName || w.owner, from: o.ownerName || o.owner });
    }
    return out;
  }
  function allWork(bots) { const out = []; for (const b of bots || []) for (const w of b.work || []) out.push(Object.assign({}, w, { poster: b.bot, ownerName: w.ownerName || b.bot })); return out; }

  /* ---------- Automations (item 19/20, control/AUTOMATIONS_STATUS.json) ---------- */
  const AUTOMATION_RESULTS = ['OK', 'FAIL', 'SKIP', 'EMPTY', 'STALE'];
  function simpleResult(r) {
    const v = str(r).trim().toUpperCase();
    if (['OK', 'SUCCESS', 'PASS', 'DONE', 'GREEN'].includes(v)) return 'OK';
    if (['FAIL', 'FAILED', 'FAILURE', 'ERROR', 'RED', 'TIMEOUT'].includes(v)) return 'FAIL';
    if (['SKIP', 'SKIPPED', 'NOOP', 'NO-OP'].includes(v)) return 'SKIP';
    if (v === 'STALE') return 'STALE';
    if (['EMPTY', 'NONE', 'NOTHING'].includes(v)) return 'EMPTY';
    return v ? 'FAIL' : 'EMPTY';
  }
  function parseAutomations(o, now) {
    const list = o && Array.isArray(o.automations) ? o.automations : [];
    const rows = list.filter(a => a && str(a.name).trim()).map(a => {
      const last = time(a.last_run_at), next = time(a.next_run_at), iv = last != null && next != null && next > last ? next - last : null;
      let result = simpleResult(a.result);
      const stale = a.stale === true || (last != null && iv != null && now - last > 2 * iv);
      if (stale) result = 'STALE';
      return { ai: str(a.ai).trim() || 'Other', name: truncate(str(a.name), 80), result, last_run_at: last != null ? str(a.last_run_at) : '', next_run_at: next != null ? str(a.next_run_at) : '', running: a.running === true, started_at: str(a.started_at), schedule: str(a.schedule) };
    });
    const runs = (o && Array.isArray(o.runs) ? o.runs : []).filter(r => r && time(r.start) != null).map(r => ({ ai: str(r.ai) || 'Other', name: str(r.name), start: time(r.start), end: time(r.end) != null && time(r.end) > time(r.start) ? time(r.end) : time(r.start) + 10 * MIN, result: r.expected ? 'UPCOMING' : simpleResult(r.result), writer: r.writer === true, expected: r.expected === true }));
    return { generated_at: str(o && o.generated_at), rows, runs, writer: o && o.writer_health && typeof o.writer_health === 'object' ? o.writer_health : null };
  }
  /* overlapping writer runs (outlined red) and per-hour concurrency */
  function writerOverlaps(runs) {
    const w = runs.filter(r => r.writer), bad = new Set();
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) if (w[i].start < w[j].end && w[j].start < w[i].end) { bad.add(w[i]); bad.add(w[j]); }
    return bad;
  }
  function concurrencyByHour(runs, dayStart) {
    const out = new Array(72).fill(0);
    for (let h = 0; h < 72; h++) { const a = dayStart + h * 60 * MIN, b = a + 60 * MIN; out[h] = runs.filter(r => r.start < b && r.end > a).length; }
    return out;
  }
  function etDayStart(ms) { const off = etOffsetMin(ms), et = new Date(ms - off * MIN); const local = Date.UTC(et.getUTCFullYear(), et.getUTCMonth(), et.getUTCDate()); return local + etOffsetMin(local + off * MIN) * MIN; }


  /* ---------- Tim feedback 1-16 (Nov 16): pure helpers for the 3D office ---------- */
  /* Items 3 / 9: only a bot with a REAL needs_tim item waves. `list` is needsList(): live bot asks (status needs_tim with a
     question, not EXAMPLE, not PR-resolved) and live needs_tim entries naming a bot. Idle / stale / blocked bots never. */
  function needsTimNames(list) {
    const out = new Set();
    for (const n of (list && list.needs) || []) { const b = canonicalBot(n.bot, n.bot_id); if (b) out.add(b); }
    return out;
  }
  /* Item 2: waterfall texture offset; water moves DOWN (offset grows), nothing moves when reduced motion is on. */
  function waterfallOffset(y, dt, reduced) { return reduced ? y : (y + Math.max(0, dt) * 0.35) % 1; }

  /* Item 5: day / night from America/New_York wall-clock time (Tim is in Tennessee). Sunrise / sunset follow the season
     (about 36 N: day length 12 h +/- 2.2 h) and DST; no browser-local time zone is used. */
  /* Revision badge text from build-info.json (written at build/deploy time by scripts/write-build-info.cjs). */
  function buildParts(info) {
    const i = info && typeof info === 'object' ? info : null;
    const sha = i ? str(i.commitShort || str(i.commit).slice(0, 7)).trim() : '';
    const at = i ? time(i.builtAt) : null;
    if (!sha && at == null) return null;
    const pr = i && Number(i.pr) > 0 ? '#' + Math.floor(Number(i.pr)) : '—';
    const when = at == null ? 'time unknown' : new Date(at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
    return { i, pr, sha: sha || 'unknown', when };
  }
  function buildBadge(info) {
    const p = buildParts(info);
    return p ? 'PR ' + p.pr + ' · ' + p.sha + ' · ' + p.when : 'build unknown';
  }
  /* Wall plate under the FORGE sign: same data as the corner badge, as big lines [title, release time, commit, version details]. */
  function buildPlate(info) {
    const p = buildParts(info);
    if (!p) return { title: 'BUILD UNKNOWN', when: '', sha: '', detail: '' };
    const i = p.i, bits = [];
    if (i.release) bits.push(String(i.release));
    if (i.branch && i.branch !== i.release && i.branch !== 'local') bits.push(String(i.branch));
    if (i.deployId) bits.push('deploy ' + String(i.deployId).slice(0, 8));
    if (i.app) bits.push(String(i.app));
    return { title: 'PR ' + p.pr, when: p.when, sha: p.sha, detail: bits.join(' · ') };
  }
  function etDate(ms) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(ms));
    const g = k => Number(p.find(x => x.type === k).value);
    return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute') };
  }
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const mixHex = (a, b, k) => { const c = i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k); return '#' + [1, 3, 5].map(i => c(i).toString(16).padStart(2, '0')).join(''); };
  function skyState(now) {
    const e = etDate(now), hour = e.h + e.mi / 60;
    const doy = Math.floor((Date.UTC(e.y, e.mo - 1, e.d) - Date.UTC(e.y, 0, 0)) / 86400000);
    const dst = etOffsetMin(now) === 240, noon = 12.67 + (dst ? 1 : 0), len = 12 + 2.2 * Math.sin(2 * Math.PI * (doy - 80) / 365);
    const sunrise = noon - len / 2, sunset = noon + len / 2, f = (hour - sunrise) / (sunset - sunrise);
    const edge = Math.min(hour - sunrise, sunset - hour), alt = f >= 0 && f <= 1 ? Math.sin(Math.PI * f) : 0;
    const daylight = clamp01((edge + 0.5) / 1.25) * (0.55 + 0.45 * alt), warm = clamp01(1 - Math.abs(edge) / 0.9);
    const night = hour < sunrise || hour > sunset, nf = hour > sunset ? (hour - sunset) / (24 - len) : (hour + 24 - sunset) / (24 - len);
    let top = mixHex('#060b1e', '#3f8fe0', daylight), bottom = mixHex('#101a38', '#bfe2ff', daylight);
    top = mixHex(top, '#4b3a6e', warm * 0.5 * (1 - daylight * 0.4)); bottom = mixHex(bottom, '#ff9a5a', warm * 0.75);
    return { hour, sunrise, sunset, daylight, warm, isNight: daylight < 0.12, night, top, bottom, stars: clamp01(1 - daylight * 2.2),
      sun: !night ? { x: clamp01(f), y: alt } : null, moon: night ? { x: clamp01(nf), y: Math.sin(Math.PI * clamp01(nf)) } : null, lights: daylight < 0.55 };
  }

  /* Seedable RNG (mulberry32). Same seed -> same sequence. */
  function makeRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* Items 10 / 11: idle activity rotation. A shuffled "bag" so every activity comes round before one repeats; never the
     same activity twice in a row; 60-150 s each (randomized); restock only when the fridge is not full, forced when low. */
  const IDLE_ACTIVITIES = ['couch_sleep', 'desk_nap', 'hr_training', 'video_game', 'exercise_bike', 'group_chat', 'restock_fridge', 'pool'];
  const IDLE_ACT_MIN_S = 60, IDLE_ACT_MAX_S = 150, FRIDGE_CAP = 20, FRIDGE_LOW = 14, FRIDGE_MIN = 12, FRIDGE_REFILL_S = 20; // low = 70% (call a restocker), floor = 60% (never shown lower)
  function createIdleState() { return { act: null, until: 0, bag: [], last: null }; }
  function fridgeLow(stock, cap) { return stock <= FRIDGE_LOW * ((cap || FRIDGE_CAP) / FRIDGE_CAP); }
  /* The fridge stays stocked: a can taken (or drained) never goes below the 60% floor, and with no restocker on the way it
     tops itself up one can at a time (every FRIDGE_REFILL_S) until it is back above the low mark. */
  function fridgeTake(stock) { return Math.max(FRIDGE_MIN, stock - 1); }
  function fridgeAutoRefill(stock, restockerActive) { return !restockerActive && fridgeLow(stock) && stock < FRIDGE_CAP ? stock + 1 : stock; }
  function idleTick(state, rng, nowSec, ctx) {
    const c = ctx || {}, restock = c.restock || 'ok'; // 'force' | 'ok' | 'no'
    if (restock === 'force' && state.act !== 'restock_fridge') { state.act = 'restock_fridge'; state.last = state.act; state.until = nowSec + IDLE_ACT_MIN_S + rng() * (IDLE_ACT_MAX_S - IDLE_ACT_MIN_S); return state.act; }
    if (state.act && nowSec < state.until && !(state.act === 'restock_fridge' && restock === 'no')) return state.act;
    const ok = a => !(a === 'restock_fridge' && restock === 'no') && !(c.blocked && c.blocked.includes(a));
    state.bag = state.bag.filter(ok);
    if (!state.bag.length) {
      const b = IDLE_ACTIVITIES.filter(ok);
      for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
      if (b.length > 1 && b[0] === state.last) b.push(b.shift());
      state.bag = b;
    }
    let i = state.bag.findIndex(a => a !== state.last); if (i < 0) i = 0;
    state.act = state.bag.splice(i, 1)[0] || 'video_game'; state.last = state.act;
    state.until = nowSec + IDLE_ACT_MIN_S + rng() * (IDLE_ACT_MAX_S - IDLE_ACT_MIN_S);
    return state.act;
  }
  /* Standing group around (cx, cz): n slots on a ring, each facing the middle. */
  function groupChatSlots(cx, cz, n, radius) {
    const r = radius || 0.75, out = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.PI / 4, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; out.push({ x: +x.toFixed(3), z: +z.toFixed(3), face: Math.atan2(cx - x, cz - z) }); }
    return out;
  }
  /* The restocker is the first idle (not working, not waving) bot by hash, only while the fridge is low; one at a time. */
  function pickRestocker(idleNames, stock, current) {
    if (current && idleNames.includes(current)) return stock < FRIDGE_CAP ? current : null; // done once it is full again
    if (!fridgeLow(stock)) return null;
    return idleNames.slice().sort((a, b) => hash('rs:' + a) - hash('rs:' + b))[0] || null;
  }

  /* Item 12: job flow. receive (walk to the board, take the card) -> work (walk to the desk, type) -> log (walk back to
     the board, log it) -> done (null). Finished = the card is Done or gone from the board; capped so nothing waits forever. */
  const JOB_PHASES = ['receive', 'work', 'log'], JOB_HOLD_S = 2.6, JOB_WORK_MAX_S = 600;
  const jobStart = (itemId, nowSec) => ({ itemId, phase: 'receive', since: nowSec || 0 });
  const jobGoal = job => (job && job.phase === 'work' ? 'desk' : 'board');
  function jobStep(job, ctx) {
    if (!job) return null;
    const c = ctx || {}, held = c.heldFor == null ? -1 : c.heldFor;
    if (job.phase === 'receive') return c.arrived && held >= JOB_HOLD_S ? Object.assign({}, job, { phase: 'work', since: c.now || 0 }) : job;
    if (job.phase === 'work') return c.finished || (c.now != null && c.now - job.since > JOB_WORK_MAX_S) ? Object.assign({}, job, { phase: 'log', since: c.now || 0 }) : job;
    return c.arrived && held >= JOB_HOLD_S ? null : job;
  }
  const JOB_ASSIGN_REASONS = ['new', 'reassigned', 'take']; // diffItems / diffWork events that hand a card to a bot

  /* Item 13: pool shot. 7 s loop: aim (ball rests), stroke (cue strikes at 2.4 s), roll across the table with friction,
     bounce off the rail, settle, reset. Table-local metres. Returns {ball:{x,z}, stroke:0..1, phase}. */
  const POOL = { start: { x: -0.2, z: -0.6 }, halfW: 0.54, loop: 7 };
  function poolShot(t) {
    const u = ((t % POOL.loop) + POOL.loop) % POOL.loop, s = POOL.start;
    if (u < 2.2) return { ball: { x: s.x, z: s.z }, stroke: 0, phase: 'aim' };
    if (u < 2.7) return { ball: { x: s.x, z: s.z }, stroke: Math.sin((u - 2.2) / 0.5 * Math.PI) * (u < 2.45 ? -0.6 : 1), phase: 'stroke' };
    const k = Math.min(1, (u - 2.7) / 3.3), dist = 1.5 * (1 - (1 - k) * (1 - k)); // decelerating roll, 1.5 m of travel
    let x = s.x + dist * 0.86, z = s.z + dist * 0.5;
    if (x > POOL.halfW) x = 2 * POOL.halfW - x; // bounce off the side rail
    return { ball: { x, z }, stroke: 0, phase: u < 6 ? 'roll' : 'rest' };
  }

  /* Item 14: faces blend between expressions. Each expression is a set of weights; the face eases towards the target. */
  const EXPR = {
    happy: { smile: 1, frown: 0, flat: 0, oh: 0, drop: 0, worry: 0, puzzle: 0, lid: 0 },
    neutral: { smile: 0.45, frown: 0, flat: 0, oh: 0, drop: 0, worry: 0, puzzle: 0, lid: 0 },
    worried: { smile: 0, frown: 1, flat: 0, oh: 0, drop: 1, worry: 1, puzzle: 0, lid: 0 },
    puzzled: { smile: 0, frown: 0, flat: 1, oh: 0, drop: 0, worry: 0, puzzle: 1, lid: 0 },
    sleepy: { smile: 0, frown: 0, flat: 0, oh: 1, drop: 0, worry: 0, puzzle: 0, lid: 1 }
  };
  const exprParams = name => Object.assign({}, EXPR[name] || EXPR.neutral);
  function blendExpression(cur, target, dt, rate) {
    const goal = typeof target === 'string' ? exprParams(target) : target, k = 1 - Math.exp(-(rate || 9) * Math.max(0, dt)), out = {};
    for (const key of Object.keys(EXPR.happy)) { const a = cur && cur[key] != null ? cur[key] : goal[key]; const v = a + (goal[key] - a) * k; out[key] = Math.abs(goal[key] - v) < 0.002 ? goal[key] : v; }
    return out;
  }
  /* Item 15: natural random blinking. One blink = 0.16 s close-open; next one 2-6.5 s later; ~1 in 8 is a quick double. */
  const BLINK_DUR = 0.16;
  function createBlinker(rng, t0) { return { at: (t0 || 0) + 0.5 + rng() * 3, dur: BLINK_DUR, double: false }; }
  function blinkAmount(state, t, rng) {
    if (t < state.at) return 0;
    const u = (t - state.at) / state.dur;
    if (u >= 1) { state.double = !state.double && rng() < 0.125; state.at = t + (state.double ? 0.12 + rng() * 0.08 : 2 + rng() * 4.5); return 0; }
    return Math.sin(u * Math.PI);
  }

  /* Training whiteboard: cycle the real skills (office/skills.json, synced from the shared skills library) one per SKILL_CYCLE_MS. */
  const SKILL_CYCLE_MS = 10000;
  function parseSkills(j) {
    if (!Array.isArray(j)) return null;
    const ok = j.filter(s => s && typeof s.title === 'string' && s.title && Array.isArray(s.bullets) && s.bullets.length).map(s => ({ slug: String(s.slug || ''), title: s.title, bullets: s.bullets.slice(0, 3).map(String) }));
    return ok.length ? ok : null;
  }
  function skillSlide(skills, now) { // null when there are no skills -> the caller draws the old fallback lines
    if (!skills || !skills.length) return null;
    const i = Math.floor(Math.max(0, now) / SKILL_CYCLE_MS) % skills.length, s = skills[i];
    return { index: i, title: 'Skill: ' + s.title, bullets: s.bullets, counter: (i + 1) + '/' + skills.length };
  }

  /* Wall dimmer: brightness level 0.25 (dim) .. 1.6 (bright); 1.0 is the original look. Knob position t is 0 (bottom) .. 1 (top). */
  const DIM_MIN = 0.25, DIM_MAX = 1.6, DIM_DEFAULT = 1, DIM_STEP = 0.1, DIM_KEY = 'office.dimmer.level';
  const clampDim = v => { const n = v === null || (typeof v === 'string' && v.trim() === '') ? NaN : Number(v); return Number.isFinite(n) ? Math.min(DIM_MAX, Math.max(DIM_MIN, n)) : DIM_DEFAULT; };
  const dimFromKnob = t => clampDim(DIM_MIN + Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (DIM_MAX - DIM_MIN));
  const knobFromDim = level => (clampDim(level) - DIM_MIN) / (DIM_MAX - DIM_MIN);
  const dimStep = (level, dir) => clampDim(Math.round((clampDim(level) + (dir < 0 ? -DIM_STEP : DIM_STEP)) * 100) / 100);
  const dimScale = (base, level) => base * clampDim(level);
  const dimSmooth = (cur, target, dt) => { const k = 1 - Math.exp(-8 * Math.max(0, dt || 0)), n = cur + (target - cur) * k; return Math.abs(target - n) < 0.002 ? target : n; };
  return {
    DIM_MIN, DIM_MAX, DIM_DEFAULT, DIM_STEP, DIM_KEY, clampDim, dimFromKnob, knobFromDim, dimStep, dimScale, dimSmooth,
    STATUSES, PRIORITIES, COLUMNS, KNOWN_PROJECTS, STALE_MIN, USAGE_STALE_MIN, CONVO_WINDOW_MIN, CONVO_MAX, MAX_PER_COLUMN,
    GLIDE_MS, TOUR_IDLE_MS, LOD, COLORS,
    normStatus, statusStyle, fallbackLink, linkFor, fallbackText, prNumber, priorityRank, parseItems, sortItems, cardTitle,
    priorityBadge, columnFor, statusWord, buildBoard, parseStatus, dataState, behaviorFor, relTime, waitingMinutes, hhmm,
    daylight, truncate, lodFor, pulse, diffItems, recentConversations, bubbleText, checkState, summarizePull, usageWord,
    usageStale, canonicalBot, BOT_ALIASES, ROSTER, tvKeyAction, hopRows, hopMove, tourOrder, isPhoneLike, demoStatus, demoNextStatus, DEMO_PULLS,
    SCREEN_MAX_LINES, CONF_SEATS, TRAINER, TRAIN_CYCLE_S, TRAIN_S, VISIT_S, parseScreen, parseMeetings, safeLink, isPrLink, chatLink,
    needsTarget, hash, holdsCan, planOffice, ambientLine, monitorMode, BOT_STALE_MIN, freshness, botSignals, prTimes,
    httpUrl, mapProject, projectTabs, boardView, columnPage, asksTim, prKey, prStates, applyPrStates, needsList, RATE_LOW, PR_CACHE_MS, createGate,
    createJsonSource, dataAge, deskLayout, MIN_SEP, CLEARANCE, PRESIDENT_HEAD_Y, EYE_HEIGHT, boardSlots, createSlotBook, separate, walkCap, admitWalkers,
    RECENT_REPLAY_MIN, IDLE_ACTS, idleSlot, idleAct, workBreak, replayFor, createNav, TRIP_SPOTS, TRIP_AWAY_S, tripScheduleAt, USAGE_CHECK_SCHEDULE_ET, USAGE_GRACE_MIN, parseReadings,
    latestPerProvider, nextCheck, countdown, readingStale, etClock, usageRows, usageLatest, usageHeader, SCREEN_FRESH_MIN, parseScreensIndex, screenState,
    screenTarget, PRESIDENT_SCREEN_URL, PRESIDENT_ID, maskText, parseChatFeed, CHAT_MAX, CHAT_PROBE_MS, CHAT_NOT_PUBLISHED, CHAT_UNAVAILABLE, chatFeedFromResponse, createChatFeed, AUDIT_CHECKS, AUDIT_STALE_H, parseAudit,
    auditStale, parseRoutine, WORK_MAX, parseWork, workLabel, diffWork, allWork, AUTOMATION_RESULTS, simpleResult, parseAutomations,
    writerOverlaps, concurrencyByHour, etDayStart, BOT_ID_NAMES, demoAutomations,
    needsTimNames, waterfallOffset, buildBadge, buildPlate, etDate, skyState, makeRng, IDLE_ACTIVITIES, IDLE_ACT_MIN_S, IDLE_ACT_MAX_S, FRIDGE_CAP, FRIDGE_LOW, FRIDGE_MIN, FRIDGE_REFILL_S, fridgeTake, fridgeAutoRefill, createIdleState, fridgeLow, idleTick,
    SKILL_CYCLE_MS, parseSkills, skillSlide,
    groupChatSlots, pickRestocker, JOB_PHASES, JOB_HOLD_S, JOB_WORK_MAX_S, jobStart, jobGoal, jobStep, JOB_ASSIGN_REASONS, POOL, poolShot, EXPR, exprParams, blendExpression, BLINK_DUR, createBlinker, blinkAmount
  };
});
