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
      const owner = str(r.owner).trim();
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

  function parseBots(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set(), out = [];
    for (const r of list) {
      const bot = str(r && r.bot).trim();
      if (!bot || seen.has(bot)) continue;
      seen.add(bot);
      out.push({
        bot, bot_id: str(r.bot_id).trim(), task: str(r.task), status: normStatus(r.status), rawStatus: str(r.status),
        last_action: str(r.last_action), last_action_at: str(r.last_action_at), question: str(r.question), link: str(r.link)
      });
    }
    return out;
  }
  function parseConversations(list, botNames) {
    if (!Array.isArray(list)) return [];
    const names = botNames ? new Set(botNames) : null;
    return list.filter(c => c && str(c.from) && str(c.to) && time(c.at) != null && (!names || (names.has(str(c.from)) && names.has(str(c.to)))))
      .map(c => ({ from: str(c.from), to: str(c.to), text: str(c.text).trim(), at: str(c.at) }));
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
      needsTim: (Array.isArray(o.needs_tim) ? o.needs_tim : []).filter(n => n && str(n.text).trim()).map(n => ({ text: str(n.text).trim(), link: str(n.link).trim() })),
      bots, items: parseItems(o.items, names), conversations: parseConversations(o.conversations, names), usage: parseUsage(o.usage)
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
    const B = (bot, bot_id, status, task, last_action, mins, question) => ({ bot, bot_id, status, task, last_action, last_action_at: ago(mins), question: question || '', link: '' });
    const I = (id, title, priority, status, owner, project, link) => ({ id, title, priority, status, owner, link: link || '', updated_at: ago(5), project });
    return {
      updated_at: ago(2),
      needs_tim: [{ text: 'EXAMPLE: approve the job-board API key for Root', link: '' }],
      bots: [
        B('President', '431e8cf1-f077-4548-82b7-46c1959dc4c9', 'working', 'EXAMPLE: keeping the Forge checksheet current', 'Sorted items by priority', 3),
        B('Root', '70f0889b-ecd4-457b-a69c-304cd2aff540', 'waiting_tim', 'EXAMPLE: job-board API access', 'Asked Tim for the API key', 24, 'EXAMPLE: may I use the paid job-board API key?'),
        B('Software', 'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f', 'working', 'EXAMPLE: price scrape for job leads', 'Pushed scraper fix', 6),
        B('GUI', 'a8b4a0b2-acfd-4485-8444-7ab27007df4a', 'working', 'EXAMPLE: board card styling', 'Adjusted card contrast', 9),
        B('QA bot', '338fc1b1-fecc-475d-ba9e-acd49bcadcfc', 'blocked', 'EXAMPLE: quarantine flaky tests', 'Two runs disagree', 41, 'EXAMPLE: quarantine the flaky map test or keep it blocking?'),
        B('Sniffer', '321469c4-1299-43e7-bd32-1704f58777be', 'idle', '', 'Finished the search-filter sweep', 30),
        B('Comp', '424e5611-fb8f-4ae1-a360-051e61e63e8a', 'idle', '', 'Lead scoring rules done', 52),
        B('Archive', 'c95408dd-c07f-460e-aaa0-9d515fe5be7d', 'idle', '', 'Archived stale asks', 75),
        B('Claude', 'd4118f0c-1b06-4e9a-982f-f5314451c841', 'working', 'Building the 3D office viewer (foreman-cockpit PR)', 'Wrote the scene and tests', 1),
        B('ChatGPT', '7bcb0d85-ec55-4e17-907f-3e71688e8799', 'idle', '', 'Cover letter templates v2', 18),
        B('Usage Ctrl', 'f1a70b7a-6051-45d7-8031-e46a4cba066f', 'working', 'EXAMPLE: hourly AI usage report', 'Posted usage readings', 4),
        B('dr eggbot', '372936ae-81e1-4013-b0d0-9ee47d97a3c4', 'idle', '', 'Checked in', 12)
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
        I('ex-392', 'EXAMPLE #392 Archive stale asks', 'P4', 'done', 'Archive', 'Job pipeline'),
        I('ex-390', 'EXAMPLE #390 Usage report v3', 'P4', 'done', 'Usage Ctrl', 'Job pipeline'),
        I('ex-388', 'EXAMPLE #388 Sidebar icons', 'P4', 'done', 'GUI', 'Job pipeline'),
        I('ex-63', 'EXAMPLE #63 Quarantine flaky tests?', 'Needs Tim', 'blocked', 'QA bot', '3D office'),
        I('office-viewer', '3D office viewer (foreman-cockpit PR)', 'P2', 'working', 'Claude', '3D office'),
        I('ex-62', 'EXAMPLE #62 Board card styling', 'P2', 'working', 'GUI', '3D office'),
        I('ex-60', 'EXAMPLE #60 OFFICE_STATUS seed', 'P2', 'review', 'President', '3D office'),
        I('ex-59', 'EXAMPLE #59 TV mode key map', 'P3', 'done', 'Claude', '3D office')
      ],
      conversations: [
        { from: 'ChatGPT', to: 'Claude', text: 'EXAMPLE: can you share the board card sizes?', at: ago(3) },
        { from: 'ChatGPT', to: 'Claude', text: 'EXAMPLE: I will match them in the cover letter preview so both stay consistent.', at: ago(2) },
        { from: 'ChatGPT', to: 'Claude', text: '', at: ago(1) }
      ],
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
  /* Second demo poll: a new card for Comp and one reassigned to Sniffer, so the board pickup walk is visible. */
  function demoNextStatus(prev, now) {
    const o = JSON.parse(JSON.stringify(prev));
    o.updated_at = new Date(now).toISOString();
    o.items.push({ id: 'ex-64', title: 'EXAMPLE #64 Lounge props', priority: 'P3', status: 'working', owner: 'Comp', link: '', updated_at: o.updated_at, project: '3D office' });
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
    usageStale, tvKeyAction, hopRows, hopMove, tourOrder, isPhoneLike, demoStatus, demoNextStatus, DEMO_PULLS
  };
});
