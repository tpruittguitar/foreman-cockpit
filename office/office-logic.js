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
    { id: 'review', label: 'Review' },
    { id: 'done', label: 'Done' }
  ];
  // Rows always shown on the project board; any other project in the data is added after them.
  // "Bitcoin" is listed so it gets a fixed place, but it stays hidden until an item uses it.
  const KNOWN_PROJECTS = [
    { name: 'Job pipeline', always: true },
    { name: '3D office', always: true },
    { name: 'Bitcoin', always: false }
  ];
  const STALE_MIN = 15;          // board "Data as of" turns yellow after this
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

  function normStatus(s) {
    const v = str(s).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (v === 'waiting' || v === 'needs_tim') return 'waiting_tim';
    return STATUSES.includes(v) ? v : 'idle';
  }

  /* status -> look. Bright colour only for state, never colour alone: every state has a glyph and a word. */
  function statusStyle(status) {
    switch (normStatus(status)) {
      case 'working': return { status: 'working', color: COLORS.working, glyph: '▶', word: 'WORKING', flag: false, alert: false, behavior: 'work' };
      case 'blocked': return { status: 'blocked', color: COLORS.alert, glyph: '⚠', word: 'BLOCKED', flag: true, alert: true, behavior: 'wave' };
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
        link: str(r.link).trim(), updated_at: str(r.updated_at), project: str(r.project).trim() || 'Other',
        pr: prNumber(r.title, r.link)
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
  function columnFor(item) {
    const s = str(item.status).toLowerCase().replace(/[\s-]+/g, '_');
    if (['done', 'merged', 'closed', 'shipped', 'complete', 'completed'].includes(s)) return 'done';
    if (item.priority === 'Needs Tim' || ['waiting_tim', 'needs_tim', 'blocked'].includes(s)) return 'needs_tim';
    if (item.priority === 'PR merge queue' || ['review', 'in_review', 'ready', 'ready_for_review', 'merge_queue', 'pr_open'].includes(s)) return 'review';
    return 'in_progress';
  }
  function statusWord(item) {
    const c = columnFor(item);
    if (c === 'needs_tim') return { glyph: '⚠', word: 'NEEDS TIM', tone: 'alert' };
    if (c === 'review') return { glyph: '◆', word: 'REVIEW', tone: 'info' };
    if (c === 'done') return { glyph: '✓', word: 'DONE', tone: 'idle' };
    return { glyph: '▶', word: 'WORKING', tone: 'working' };
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
  const BOT_ALIASES = { 'Usage Ctrl': 'Usage Budget', 'Usage Ctr': 'Usage Budget', 'dr eggbot': 'HR - Bot Trainer', 'Archive': 'Archive \u00b7 Application State Tracker' };
  /* Renamed bots matched by bot_id first, so the label follows the sidebar whatever name the file carries. */
  const BOT_ID_NAMES = { 'f1a70b7a-6051-45d7-8031-e46a4cba066f': 'Usage Budget', '372936ae-81e1-4013-b0d0-9ee47d97a3c4': 'HR - Bot Trainer', 'c95408dd-c07f-460e-aaa0-9d515fe5be7d': 'Archive \u00b7 Application State Tracker' };
  function canonicalBot(name, botId) { const id = str(botId).trim(), n = str(name).trim(); return BOT_ID_NAMES[id] || BOT_ALIASES[n] || n; }

  /* ---------- Optional OFFICE_STATUS.json fields (v2) ----------
     bots[].screen  { "title": string, "lines": [string, ... up to 6], "updated_at": ISO }
       What the bot's monitor shows, drawn as a mini app window (near view) and in the monitor popup. Parsed tolerantly:
       not an object, or no title and no lines -> null and the monitor falls back to task / last_action / own items.
       Non-string lines are dropped, lines are cut to 160 characters, only the first 6 are kept, a bad updated_at -> ''.
       President's monitor ignores it (Forge checksheet); Usage Budget's monitor always shows the usage chart.
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
      out.push({
        bot, bot_id: str(r.bot_id).trim(), task: str(r.task), status: normStatus(r.status), rawStatus: str(r.status),
        last_action: str(r.last_action), last_action_at: str(r.last_action_at), question: str(r.question), link: str(r.link),
        screen: parseScreen(r.screen)
      });
    }
    return out;
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
     An idle HR - Bot Trainer walks round to idle bots and, when no meeting holds the table, trains two of them there. */
  const TRAINER = 'HR - Bot Trainer';
  const IDLE_BUCKET_MIN = 10, TRAIN_CYCLE_S = 100, TRAIN_S = 45, VISIT_S = 18;
  const IDLE_PATTERN = ['chat', 'chat', 'sleep', 'game', 'wander', 'chat', 'chat', 'wander', 'sleep', 'game'];
  function hash(s) { let h = 2166136261; for (const ch of str(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function holdsCan(name) { return hash('can:' + name) % 3 !== 0; }
  function planOffice(bots, meetings, now, state) {
    const plans = {}, list = bots || [];
    let meeting = null, training = null;
    if (state === 'failed') return { plans, meeting, training };
    for (const b of list) if (statusStyle(b.status).alert) plans[b.bot] = { act: 'wave' };
    let seat = 0;
    for (const m of meetings || []) {
      const seated = [];
      for (const n of m.members) {
        if (plans[n] || seat >= CONF_SEATS || !list.some(b => b.bot === n)) continue;
        plans[n] = { act: 'meeting', seat: seat++, meeting: m.id }; seated.push(n);
      }
      if (seated.length && !meeting) meeting = Object.assign({}, m, { seated });
    }
    for (const b of list) if (!plans[b.bot] && normStatus(b.status) === 'working') plans[b.bot] = { act: 'work' };
    const trainer = list.find(b => b.bot === TRAINER && !plans[b.bot]);
    const bucket = Math.floor(now / (IDLE_BUCKET_MIN * MIN));
    const idle = list.filter(b => !plans[b.bot] && b.bot !== TRAINER).map(b => b.bot)
      .sort((a, b) => hash(a + ':' + bucket) - hash(b + ':' + bucket) || a.localeCompare(b));
    idle.forEach((n, i) => { plans[n] = { act: IDLE_PATTERN[i % IDLE_PATTERN.length] }; });
    if (trainer) {
      const sec = Math.floor(now / 1000), cycle = Math.floor(sec / TRAIN_CYCLE_S);
      if (!meeting && sec % TRAIN_CYCLE_S < TRAIN_S && idle.length) {
        // trainees: bots killing time first, then sleepers, gamers and chatters; a different pair each cycle
        const pref = ['wander', 'sleep', 'game', 'chat'], pool = idle.slice().sort((a, b) => pref.indexOf(plans[a].act) - pref.indexOf(plans[b].act));
        const span = Math.min(pool.length, 3), trainees = [];
        for (let i = 0; i < Math.min(2, pool.length); i++) trainees.push(pool[(cycle + i) % span]);
        trainees.forEach((n, i) => { plans[n] = { act: 'train', seat: i }; });
        plans[TRAINER] = { act: 'lead' }; training = { trainer: TRAINER, trainees };
      } else if (idle.length) {
        const target = idle[Math.floor(sec / VISIT_S) % idle.length];
        plans[TRAINER] = { act: 'visit', partner: target }; plans[target] = { act: 'listen', partner: TRAINER };
      } else plans[TRAINER] = { act: 'wander' };
    }
    const chat = idle.filter(n => plans[n].act === 'chat');
    for (let i = 0; i + 1 < chat.length; i += 2) {
      plans[chat[i]] = { act: 'chat', partner: chat[i + 1], host: false };
      plans[chat[i + 1]] = { act: 'chat', partner: chat[i], host: true };
    }
    if (chat.length % 2) plans[chat[chat.length - 1]] = { act: 'wander' };
    for (const n of Object.keys(plans)) if (['chat', 'listen', 'wander', 'visit'].includes(plans[n].act)) plans[n].can = holdsCan(n);
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
  /* What the desk monitor draws. President keeps the Forge checksheet (never chat text); Usage Budget the usage chart. */
  function monitorMode(bot, act) {
    const n = str(bot && bot.bot), id = str(bot && bot.bot_id);
    if (n === 'President' || id === '431e8cf1-f077-4548-82b7-46c1959dc4c9') return 'checksheet';
    if (n === 'Usage Budget') return 'usage';
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
        .map(n => ({ text: str(n.text).trim(), link: str(n.link).trim(), bot: canonicalBot(n.bot, n.bot_id), bot_id: str(n.bot_id).trim() })),
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
  function bubbleText(c) { return c.text ? truncate(c.text, 80) : 'talking with ' + c.to; }

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
      needs_tim: [{ text: 'EXAMPLE: approve the job-board API key for Root', link: '', bot: 'Root' }, { text: 'EXAMPLE: sign off the lounge budget', link: '', bot: 'EXAMPLE contractor' }],
      bots: [
        B('President', '431e8cf1-f077-4548-82b7-46c1959dc4c9', 'working', 'EXAMPLE: keeping the Forge checksheet current', 'Sorted items by priority', 3),
        B('Root', '70f0889b-ecd4-457b-a69c-304cd2aff540', 'waiting_tim', 'EXAMPLE: job-board API access', 'Asked Tim for the API key', 24, 'EXAMPLE: may I use the paid job-board API key?'),
        B('Software', 'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f', 'working', 'EXAMPLE: price scrape for job leads', 'Pushed scraper fix', 6, '', SCR('scraper.log', ['$ npm run scrape -- --leads', 'fetched 412 listings', 'parsed 398 · 14 skipped', 'dedupe: 37 merged', 'writing prices.json …', '$ _'])),
        B('GUI', 'a8b4a0b2-acfd-4485-8444-7ab27007df4a', 'idle', '', 'Adjusted card contrast', 9, '', SCR('card-preview', ['Card contrast: 7.1:1 ✓', 'Badge sizes: 19 / 24 px', 'Waiting for review'])),
        B('QA bot', '338fc1b1-fecc-475d-ba9e-acd49bcadcfc', 'blocked', 'EXAMPLE: quarantine flaky tests', 'Two runs disagree', 41, 'EXAMPLE: quarantine the flaky map test or keep it blocking?', SCR('test runner', ['map.browser.js  run 1  ✓ pass', 'map.browser.js  run 2  ✗ fail', 'diff: tile timing 40 ms', 'waiting for Tim'])),
        B('Sniffer', '321469c4-1299-43e7-bd32-1704f58777be', 'idle', '', 'Finished the search-filter sweep', 30),
        B('Comp', '424e5611-fb8f-4ae1-a360-051e61e63e8a', 'idle', '', 'Lead scoring rules done', 52, '', 'not a screen object'),
        B('Archive · Application State Tracker', 'c95408dd-c07f-460e-aaa0-9d515fe5be7d', 'idle', '', 'Archived stale asks', 75),
        B('Claude', 'd4118f0c-1b06-4e9a-982f-f5314451c841', 'working', 'Building the 3D office viewer (foreman-cockpit PR)', 'Wrote the scene and tests', 1, '', { title: 'office v2 (foreman-cockpit PR)', lines: ['npm test  ✓', 'office.browser.js  ✓ 5 scenarios', 'next: monitor popup'], updated_at: ago(1) }),
        B('ChatGPT', '7bcb0d85-ec55-4e17-907f-3e71688e8799', 'idle', '', 'Cover letter templates v2', 18),
        B('Usage Budget', 'f1a70b7a-6051-45d7-8031-e46a4cba066f', 'idle', '', 'EXAMPLE: posted the hourly usage readings', 4),
        B('HR - Bot Trainer', '372936ae-81e1-4013-b0d0-9ee47d97a3c4', 'idle', '', 'Checked in', 12)
      ],
      items: [
        I('ex-412', 'EXAMPLE #412 Approve job-board API key', 'Needs Tim', 'waiting_tim', 'Root', 'Job pipeline'),
        I('ex-418', 'EXAMPLE #418 Price scrape for job leads', 'P1', 'working', 'Software', 'Job pipeline'),
        I('ex-420', 'EXAMPLE #420 Cover letter templates v2', 'P3', 'working', 'ChatGPT', 'Job pipeline'),
        I('ex-57', 'EXAMPLE #57 Merge scraped prices', 'PR merge queue', 'review', 'Software', 'Job pipeline'),
        I('ex-405', 'EXAMPLE #405 Dedupe job leads', 'P2', 'done', 'Sniffer', 'Job pipeline'),
        I('ex-401', 'EXAMPLE #401 Indeed search filters', 'P3', 'done', 'Sniffer', 'Job pipeline'),
        I('ex-399', 'EXAMPLE #399 Resume PDF export', 'P3', 'done', 'ChatGPT', 'Job pipeline'),
        I('ex-396', 'EXAMPLE #396 Lead scoring rules', 'P2', 'done', 'Comp', 'Job pipeline'),
        I('ex-392', 'EXAMPLE #392 Archive stale asks', 'P4', 'done', 'Archive · Application State Tracker', 'Job pipeline'),
        I('ex-390', 'EXAMPLE #390 Usage report v3', 'P4', 'done', 'Usage Budget', 'Job pipeline'),
        I('ex-388', 'EXAMPLE #388 Sidebar icons', 'P4', 'done', 'GUI', 'Job pipeline'),
        I('ex-63', 'EXAMPLE #63 Quarantine flaky tests?', 'Needs Tim', 'blocked', 'QA bot', '3D office', 'https://example.com/EXAMPLE/pull/63'),
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
      _demoMeeting: [{ id: 'ex-standup', title: 'EXAMPLE stand-up', members: ['Software', 'ChatGPT', '424e5611-fb8f-4ae1-a360-051e61e63e8a'], started_at: ago(4), chat_id: '' }],
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
    return o;
  }
  const DEMO_PULLS = [
    { repo: 'foreman-cockpit', number: 0, title: 'EXAMPLE: ready PR with passing checks', url: '', draft: false, checks: 'passing', readyForTim: true }
  ];

  return {
    STATUSES, PRIORITIES, COLUMNS, KNOWN_PROJECTS, STALE_MIN, USAGE_STALE_MIN, CONVO_WINDOW_MIN, CONVO_MAX, MAX_PER_COLUMN,
    GLIDE_MS, TOUR_IDLE_MS, LOD, COLORS,
    normStatus, statusStyle, fallbackLink, linkFor, fallbackText, prNumber, priorityRank, parseItems, sortItems, cardTitle,
    priorityBadge, columnFor, statusWord, buildBoard, parseStatus, dataState, behaviorFor, relTime, waitingMinutes, hhmm,
    daylight, truncate, lodFor, pulse, diffItems, recentConversations, bubbleText, checkState, summarizePull, usageWord,
    usageStale, canonicalBot, BOT_ALIASES, tvKeyAction, hopRows, hopMove, tourOrder, isPhoneLike, demoStatus, demoNextStatus, DEMO_PULLS,
    SCREEN_MAX_LINES, CONF_SEATS, TRAINER, TRAIN_CYCLE_S, TRAIN_S, VISIT_S, parseScreen, parseMeetings, safeLink, isPrLink, chatLink,
    needsTarget, hash, holdsCan, planOffice, ambientLine, monitorMode
  };
});
