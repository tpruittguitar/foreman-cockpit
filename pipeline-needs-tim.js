/* Needs you — one page for everything waiting on Tim (Tim 2026-10-18 15:41 ET: "this page will be the one place I can go
   to know what maintenance needs my attention. include job decisions holding up processing").
   Two inputs, merged here:
   1. forge-coordination attention/NEEDS_TIM.json — built every 30 min by tools/needs-tim/build.js from the asks/ register,
      lane receipts, open handoffs, rejected edit requests and open pull requests.
   2. Live items the page computes from data the Explorer already holds: Writer status, unfinished-work incidents, open
      operations obligations, AI usage run-outs, and job rows waiting on a decision.
   Pure functions (Node-testable) plus html(); pipeline.html supplies the live context and wires the buttons.
   Read-only: nothing here writes to the Writer, the master, or GitHub. */
(function (root) {
  'use strict';
  var OWNER = 'tpruittguitar', REPO = 'forge-coordination', FILE = 'attention/NEEDS_TIM.json';
  var API = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + FILE + '?ref=main';
  var RAW = 'https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/main/' + FILE;
  var H = 3600000, LEVELS = ['BLOCKING', 'ACTION', 'WATCH'];
  var SECTIONS = [
    { id: 'DECIDE', title: 'Decisions waiting on you', empty: 'No open decisions or questions.' },
    { id: 'JOBS', title: 'Job decisions holding up processing', empty: 'No jobs are waiting on you.' },
    { id: 'FAILED', title: 'Unresolved failures — Writer writes and automation runs', empty: 'No unresolved failures.' },
    { id: 'UPKEEP', title: 'Keep the system running', empty: 'Nothing to maintain right now.' }
  ];
  var GLYPH = { BLOCKING: '⊘', ACTION: '▸', WATCH: '○' }, WORD = { BLOCKING: 'BLOCKING', ACTION: 'ACTION', WATCH: 'WATCH' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ms(v) { var t = typeof v === 'number' ? v : Date.parse(v || ''); return isFinite(t) ? t : 0; }
  function age(at, now) {
    var t = ms(at); if (!t) return '';
    var m = Math.max(0, Math.round((now - t) / 60000));
    return m < 60 ? m + ' min' : m < 48 * 60 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' d';
  }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : (b || a + 's')); }

  function load(fetchFn) {
    var f = fetchFn || fetch;
    return f(API, { headers: { Accept: 'application/vnd.github.raw' }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('attention list API HTTP ' + r.status); return r.json(); })
      .catch(function () { return f(RAW + '?cb=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('attention list HTTP ' + r.status); return r.json(); }); });
  }

  /* ctx = { writer, workQueue, obligations, usage, jobs:{decide,ready,declineCandidates,unconfirmed,deadActive}, now } */
  function liveItems(ctx) {
    var out = [], now = ctx.now || Date.now(), w = ctx.writer;
    function add(it) { it.live = true; out.push(it); }
    var ss = ctx.stateSync;
    if (ss && ss.ok === false) add({ id: 'live:state-sync', section: 'FAILED', level: 'ACTION', title: 'Seen marks and incident acknowledgements are not saving to the Writer', detail: String(ss.error || '') + '. This browser keeps them and resends on the next change; other devices will not see them until a save succeeds.', action: 'If it says STATE_UNREADABLE, ask Claude to restore PIPELINE_EXPLORER_STATE.json from its .prev copy.', go: { action: 'system' }, at: ss.at });
    if (w && w.fetchError) add({ id: 'live:writer-unreachable', section: 'FAILED', level: 'BLOCKING', title: 'Writer is not answering', detail: String(w.fetchError), action: 'Open System → Health. If it repeats for 2+ checks, the Writer web app or its key needs attention.', go: { action: 'system' }, at: w.checkedAt });
    if (w && !w.fetchError && !w.unsupported) {
      if (w.freeze && (w.freeze.frozen === true || w.freeze.active === true)) add({ id: 'live:writer-frozen', section: 'FAILED', level: 'BLOCKING', title: 'Writer is frozen — no lane can write', detail: String(w.freeze.reason || w.freeze.by || ''), action: 'Unfreeze only after the cause is fixed (System → Health).', go: { action: 'system' }, at: w.freeze.at || w.checkedAt });
      if (w.triggerInstalled === false) add({ id: 'live:trigger-missing', section: 'FAILED', level: 'BLOCKING', title: 'Writer queue trigger is not installed — queued lane writes are not being applied', detail: 'Lane files wait in WRITER_QUEUE until the minute trigger runs.', action: 'Claude: reinstall the trigger (install_automation).', go: { action: 'system' }, at: w.checkedAt });
      (w.warnings || []).forEach(function (x) {
        var code = String(x.code || '').toUpperCase();
        if (/^(FAILED|REJECTED_SCHEMA|PARTIAL_HOLD|HOLD_.*|FROZEN_.*|TRIGGER_MISSING|WRITE_UNVERIFIED|QUEUE_HOLD)$/.test(code)) return;
        if (x.level !== 'critical' && x.level !== 'warn') return;
        add({ id: 'live:writer-warning:' + code, section: 'FAILED', level: x.level === 'critical' ? 'BLOCKING' : 'WATCH', title: 'Writer: ' + code.replace(/_/g, ' ').toLowerCase(), detail: String(x.message || ''), action: 'Open System → Health for detail.', go: { action: 'system' }, at: w.checkedAt });
      });
      var un = w.unverified || {};
      if (un.count > 0 && now - ms(un.oldestWrittenAt) > 15 * 60000) add({ id: 'live:unverified', section: 'FAILED', level: 'ACTION', title: plural(un.count, 'Writer write') + ' not yet verified', detail: 'Oldest written ' + age(un.oldestWrittenAt, now) + ' ago. A write counts only after readback confirms it in the master.', action: 'Wait for the next verification pass; if it stays past an hour, ask Claude to run verify_pending.', go: { action: 'system' }, at: un.oldestWrittenAt });
      var held = (w.queue && w.queue.hold) || [];
      if (held.length) add({ id: 'live:queue-held', section: 'FAILED', level: 'ACTION', title: plural(held.length, 'lane file') + ' held in the Writer queue', detail: held.slice(0, 6).join(' · ') + (held.length > 6 ? ' · +' + (held.length - 6) + ' more' : ''), action: 'Each held file needs its lane to fix and resubmit, or to be cleared. Open Incidents for the reasons.', go: { tab: 'incident-history' }, at: w.checkedAt });
    }
    (ctx.workQueue || []).forEach(function (g) {
      var next = { VERIFY_OUTCOME: 'Check whether the write landed, then acknowledge.', REPAIR_OR_RECONCILE: 'The lane must fix the request and resubmit.', CHECK_PARTIAL_COMPLETION: 'Check which part landed; resubmit the rest.' }[g.status] || 'Review and acknowledge.';
      add({ id: 'live:unfinished:' + g.operation, section: 'FAILED', level: 'ACTION', title: 'Unfinished Writer work: ' + g.operation, detail: (g.latestError || g.latestFile || '') + (g.attempts > 1 ? ' · ' + g.attempts + ' attempts' : ''), action: g.nextStep || next, go: { tab: 'incident-history' }, at: g.latestAt });
    });
    (ctx.obligations || []).forEach(function (o) {
      if (o.acknowledgedAt) return;
      add({ id: 'live:obligation:' + (o.id || o.runId || o.requestId), section: 'FAILED', level: 'ACTION', title: 'Automation obligation open: ' + String(o.state || '').replace(/_/g, ' ').toLowerCase(), detail: [o.source, o.runId || o.requestId, o.error || o.outcome].filter(Boolean).join(' · '), action: o.nextAction || 'Open System → Dashboard → Recovery and acknowledge once handled.', go: { tab: 'automations', ops: 'recovery' }, at: o.updatedAt || o.at || '' });
    });
    (ctx.usage || []).forEach(function (p) {
      if (p.verdict !== 'OUT' && p.verdict !== 'BEFORE_RESET') return;
      add({ id: 'live:usage:' + p.provider + ':' + p.meter, section: 'UPKEEP', level: p.verdict === 'OUT' ? 'ACTION' : 'WATCH', title: p.provider + ' ' + (p.label || p.meter) + (p.verdict === 'OUT' ? ' is used up' : ' runs out before it resets'), detail: p.usedPct + '% used · resets ' + (p.resetsAt ? new Date(p.resetsAt).toLocaleString() : 'unknown') + (p.runOutAt && p.verdict !== 'OUT' ? ' · projected out ' + new Date(p.runOutAt).toLocaleString() : ''), action: 'Lanes on this provider stop when it runs out. Hand them to another AI or buy more usage.', go: { action: 'system' }, at: p.at });
    });
    var j = ctx.jobs || {};
    if (j.decide) add({ id: 'live:jobs-decide', section: 'JOBS', level: 'ACTION', title: plural(j.decide, 'job') + ' waiting for your decision', detail: 'Bucket TIM_DECISION_REQUIRED. The lanes leave these alone until you rule.', action: 'Open the list and rule on each (Pursue / Hold / Research / Decline).', go: { tab: 'pipeline', preset: 'TIM_DECISION' } });
    if (j.ready) add({ id: 'live:jobs-ready', section: 'JOBS', level: 'ACTION', title: plural(j.ready, 'job') + ' ready for you to apply', detail: 'Bucket READY_TO_PURSUE with no blocker. Nothing moves until you apply or rule.', action: 'Apply, or rule Hold / Decline.', go: { tab: 'pipeline', preset: 'APPLY_NOW' } });
    if (j.declineCandidates) add({ id: 'live:jobs-decline', section: 'JOBS', level: 'WATCH', title: plural(j.declineCandidates, 'AI decline recommendation') + ' waiting for your OK', detail: 'An AI recommends declining; nothing is declined until you approve.', action: 'Review and approve or reject the declines.', go: { tab: 'pipeline', preset: 'DECLINE_CANDIDATES' } });
    if (j.unconfirmed) add({ id: 'live:jobs-unconfirmed', section: 'FAILED', level: 'ACTION', title: plural(j.unconfirmed, 'of your decisions', 'of your decisions') + ' not confirmed in the master', detail: 'Saved from this browser but the master does not show them yet (pending readback, unknown Writer result, or mismatch).', action: 'Open My rulings; retry any that stay unconfirmed after a refresh.', go: { tab: 'pipeline', preset: 'RULED' } });
    if (j.deadActive) add({ id: 'live:jobs-dead-active', section: 'UPKEEP', level: 'WATCH', title: plural(j.deadActive, 'closed posting') + ' still filed as active', detail: 'The employer\'s ATS reports these postings closed. They are hidden from your open queue; the master still has them in an active bucket.', action: 'Claude or a lane should file them CLOSED_DEAD. Open the list to check.', go: { tab: 'pipeline', preset: 'DEAD_POSTINGS' } });
    // REV-122 / Tim 2026-10-20 19:43 ET: an email the Writer held instead of creating a row must not sit unnoticed.
    ((ctx.held && ctx.held.holds) || []).forEach(function (h) {
      var kind = { NEAR_TIM_RULED: 'You already marked a ' + (h.company || 'this employer') + ' role Applied', AMBIGUOUS: 'It matches more than one role', ARCHIVED_MATCH: 'It matches an archived role' }[h.kind] || 'The Writer could not place it';
      add({ id: 'live:held-email:' + h.id, section: 'JOBS', level: 'ACTION', title: 'Held email: ' + [h.company, h.title].filter(Boolean).join(' — ') + (h.state ? ' (' + String(h.state).replace(/_/g, ' ').toLowerCase() + ')' : ''),
        detail: kind + '. ' + (h.evidence ? 'Email: ' + h.evidence + '. ' : '') + (h.status === 'RESTORED_AWAITING_ATTACH' ? 'The archived role was restored; tap Same role again to attach the email.' : 'Same role attaches it; Different role gives it its own row.'),
        held: { id: h.id, candidates: h.candidates || [] }, raisedBy: 'WRITER', at: h.at });
    });
    return out;
  }

  function merge(repo, live, now) {
    var items = [].concat(live || [], (repo && repo.items) || []);
    var order = { BLOCKING: 0, ACTION: 1, WATCH: 2 };
    items.sort(function (a, b) { return (order[a.level] - order[b.level]) || ((ms(a.at) || now) - (ms(b.at) || now)); });
    var counts = { total: items.length, BLOCKING: 0, ACTION: 0, WATCH: 0 };
    items.forEach(function (i) { counts[i.level] = (counts[i.level] || 0) + 1; });
    return { items: items, counts: counts, builtAt: repo && repo.builtAt, lanes: (repo && repo.lanes) || [], dismissed: (repo && repo.dismissed) || [] };
  }
  /* Badge count: what needs Tim to act (blocking + action), never the watch list. */
  function badge(model) { return (model.counts.BLOCKING || 0) + (model.counts.ACTION || 0); }

  function answerText(it, option) {
    return 'Tim ruling on ' + (it.askId || it.id) + ' ("' + it.title + '"): ' + (option || '<your answer>') + '. Record it in forge-coordination asks/resolved/ and carry it out.';
  }
  function itemHtml(it, now, idx) {
    var meta = [it.raisedBy, it.at ? age(it.at, now) + ' ago' : '', it.live ? 'live' : ''].filter(Boolean).join(' · ');
    var opts = (it.options || []).map(function (o, k) { return '<button type="button" class="nt-opt" data-nt-copy="' + idx + '" data-nt-opt="' + k + '" title="Copy this answer for the AI chat">' + esc(o) + '</button>'; }).join('');
    var links = (it.links || []).map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || 'Link') + ' ↗</a>'; }).join('');
    return '<article class="nt-item nt-lv-' + it.level.toLowerCase() + '" data-nt-id="' + esc(it.id) + '">' +
      '<div class="nt-head"><span class="nt-level"><span aria-hidden="true">' + GLYPH[it.level] + '</span> ' + WORD[it.level] + '</span><h4>' + esc(it.title) + '</h4></div>' +
      (it.detail ? '<p class="nt-detail">' + esc(it.detail) + '</p>' : '') +
      (it.blocks ? '<p class="nt-blocks"><b>Holding up:</b> ' + esc(it.blocks) + '</p>' : '') +
      (opts ? '<div class="nt-opts">' + opts + (it.recommended ? '<span class="nt-rec">Recommended: ' + esc(it.recommended) + '</span>' : '') + '</div>' : (it.recommended ? '<p class="nt-rec">Recommended: ' + esc(it.recommended) + '</p>' : '')) +
      (it.action ? '<p class="nt-action"><b>What to do:</b> ' + esc(it.action) + '</p>' : '') +
      (it.held ? '<div class="nt-opts nt-held">' + it.held.candidates.map(function (c) { return '<button type="button" class="nt-opt" data-nt-held="' + esc(it.held.id) + '" data-nt-choice="SAME" data-nt-pid="' + esc(c.primaryId) + '">Same role' + (it.held.candidates.length > 1 || c.title ? ': ' + esc([c.title, c.location].filter(Boolean).join(', ')) : '') + '</button>'; }).join('') +
        '<button type="button" class="nt-opt" data-nt-held="' + esc(it.held.id) + '" data-nt-choice="DIFFERENT">Different role</button><span class="nt-held-status" data-nt-held-status="' + esc(it.held.id) + '"></span></div>' : '') +
      '<div class="nt-foot">' +
        (it.go ? '<button type="button" class="nt-go" data-nt-go="' + idx + '">Open →</button>' : '') +
        (it.sourceUrl ? '<a href="' + esc(it.sourceUrl) + '" target="_blank" rel="noopener">Source ↗</a>' : '') + links +
        (it.askId || (!it.live && (it.section === 'DECIDE' || it.section === 'JOBS')) ? '<button type="button" class="nt-copy" data-nt-copy="' + idx + '" title="Copy an answer template for the AI chat">Copy answer</button>' : '') +
        '<span class="nt-meta">' + esc(meta) + '<span class="nt-id">' + esc(it.id) + '</span></span>' +
      '</div></article>';
  }
  function html(model, opts) {
    opts = opts || {}; var now = opts.now || Date.now(), items = model.items;
    var head = '<div class="nt-top"><div><h2>Needs you</h2><p class="nt-sub">' +
      (model.counts.BLOCKING ? '<span class="nt-c-blocking">⊘ ' + model.counts.BLOCKING + ' blocking</span> · ' : '') +
      '▸ ' + (model.counts.ACTION || 0) + ' to act on · ○ ' + (model.counts.WATCH || 0) + ' to watch' +
      '</p><p class="nt-fresh">Repo list ' + (model.builtAt ? 'changed ' + age(model.builtAt, now) + ' ago (rebuilt every 30 min)' : (opts.repoError ? '<span class="nt-err">unavailable: ' + esc(opts.repoError) + '</span>' : 'loading…')) +
      ' · live Writer ' + (opts.writerAt ? 'checked ' + age(opts.writerAt, now) + ' ago' : 'not checked') + '</p></div>' +
      '<div class="nt-tools"><button type="button" id="nt-refresh">Refresh</button></div></div>';
    var idx = 0, map = [];
    var body = SECTIONS.map(function (s) {
      var list = items.filter(function (i) { return i.section === s.id; });
      var h = '<section class="nt-sec" data-nt-sec="' + s.id + '"><h3>' + esc(s.title) + ' <span class="nt-n">' + list.length + '</span></h3>';
      if (!list.length) return h + '<p class="nt-empty">✓ ' + esc(s.empty) + '</p></section>';
      return h + list.map(function (it) { map.push(it); return itemHtml(it, now, idx++); }).join('') + '</section>';
    }).join('');
    var lanes = model.lanes.length ? '<details class="nt-lanes"><summary>Lane heartbeat · ' + model.lanes.length + ' lanes · newest receipt per AI</summary><table><thead><tr><th>Lane</th><th>AI</th><th>Last receipt</th><th>Status</th><th>Usual gap</th><th>Runs 7 d</th></tr></thead><tbody>' +
      model.lanes.slice().sort(function (a, b) { return ms(b.lastAt) - ms(a.lastAt); }).map(function (l) {
        return '<tr' + (l.overdue ? ' class="nt-overdue"' : '') + '><td>' + esc(l.lane) + '</td><td>' + esc(l.provider) + '</td><td>' + esc(age(l.lastAt, now)) + ' ago</td><td>' + esc(String(l.lastStatus || '').replace(/_/g, ' ')) + '</td><td>' + (l.usualGapHours == null ? '—' : esc(l.usualGapHours) + ' h') + '</td><td>' + esc(l.runs7d) + '</td></tr>';
      }).join('') + '</tbody></table><p class="nt-note">A lane marked quiet has gone more than twice its usual gap without a receipt. Lanes handed to another AI count as one lane.</p></details>' : '';
    var dis = model.dismissed.length ? '<p class="nt-note">' + plural(model.dismissed.length, 'item') + ' hidden as already done (asks/resolved/ in forge-coordination).</p>' : '';
    return { html: '<div class="nt-page">' + head + body + lanes + dis + '<p class="nt-note">How to answer: press an option or Copy answer, paste it into your Claude chat, and Claude records the ruling. Nothing on this page writes anything by itself.</p></div>', items: map };
  }
  var CSS = '.nt-page{margin:8px;max-width:1180px}.nt-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid var(--line);padding:6px 2px 10px}.nt-top h2{margin:0;font-size:20px;letter-spacing:.06em;text-transform:uppercase}.nt-sub{margin:4px 0 0;font-size:14px;color:var(--text)}.nt-c-blocking{color:var(--fault);font-weight:650}.nt-fresh{margin:4px 0 0;font-size:12px;color:var(--dim)}.nt-err{color:var(--fault)}' +
    '.nt-sec{margin:14px 0}.nt-sec h3{font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin:0 0 6px;font-weight:600}.nt-n{color:var(--text);margin-left:6px}.nt-empty{color:var(--dim);font-size:13px;margin:4px 2px}' +
    '.nt-item{border:1px solid var(--line);border-left:3px solid var(--line2);background:var(--panel);padding:9px 12px;margin:6px 0}.nt-lv-blocking{border-left-color:var(--fault)}.nt-lv-action{border-left-color:var(--caution)}.nt-lv-watch{border-left-color:var(--line2)}' +
    '.nt-head{display:flex;gap:10px;align-items:baseline}.nt-head h4{margin:0;font-size:14.5px;font-weight:600;color:var(--text)}.nt-level{font-family:var(--mono);font-size:11px;letter-spacing:.1em;white-space:nowrap;min-width:92px}.nt-lv-blocking .nt-level{color:var(--fault)}.nt-lv-action .nt-level{color:var(--caution)}.nt-lv-watch .nt-level{color:var(--dim)}' +
    '.nt-detail,.nt-blocks,.nt-action,.nt-rec{margin:5px 0 0 102px;font-size:13px;color:var(--dim);line-height:1.45}.nt-action b,.nt-blocks b{color:var(--text);font-weight:600}.nt-opts{margin:7px 0 0 102px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.nt-opt{text-transform:none;font-size:12.5px;padding:4px 10px;min-height:28px}.nt-rec{font-size:12.5px;color:var(--dim)}' +
    '.nt-foot{margin:8px 0 0 102px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:12px}.nt-foot a{color:var(--text)}.nt-foot button{min-height:28px}.nt-meta{margin-left:auto;color:var(--dim);font-family:var(--mono);font-size:11px}.nt-id{margin-left:10px;color:var(--faint)}' +
    '.nt-lanes{margin:16px 0;border:1px solid var(--line);padding:8px 10px;background:var(--panel)}.nt-lanes summary{cursor:pointer;font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}.nt-lanes table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12.5px}.nt-lanes th,.nt-lanes td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--line)}.nt-lanes th{font-family:var(--mono);font-size:11px;color:var(--dim);font-weight:500}.nt-overdue td{color:var(--caution)}.nt-note{font-size:12px;color:var(--dim)}' +
    '#bell{position:relative}#bell .nt-badge{position:absolute;top:-4px;right:-6px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--caution);color:#000;font:700 10px/16px var(--sans);text-align:center}#bell .nt-badge.nt-badge-blocking{background:var(--fault);color:#fff}' +
    '@media (max-width:700px){.nt-detail,.nt-blocks,.nt-action,.nt-rec,.nt-opts,.nt-foot{margin-left:0}.nt-head{flex-direction:column;gap:2px}.nt-meta{margin-left:0;width:100%}.nt-opt,.nt-foot button{min-height:44px}}';
  var api = { load: load, liveItems: liveItems, merge: merge, badge: badge, html: html, answerText: answerText, CSS: CSS, SECTIONS: SECTIONS, URL: API };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PipelineNeedsTim = api;
})(typeof self !== 'undefined' ? self : this);
