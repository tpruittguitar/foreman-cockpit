/* Needs you — one page for everything waiting on Tim (Tim 2026-10-18 15:41 ET: "this page will be the one place I can go
   to know what maintenance needs my attention. include job decisions holding up processing").
   Two inputs, merged here:
   1. forge-coordination attention/NEEDS_TIM.json — built every 30 min by tools/needs-tim/build.js from the asks/ register,
      lane receipts, open handoffs, rejected edit requests and open pull requests.
   2. Live items the page computes from data the Explorer already holds: Writer status, unfinished-work incidents, open
      operations obligations, AI usage run-outs, and job rows waiting on a decision.
   Pure functions (Node-testable) plus html(); pipeline.html supplies the live context and wires the buttons.
   Read-only except Same role and Different role, which send the held-email ruling. */
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
  function text(s) {
    if (s == null) return '';
    if (typeof s === 'string') return s;
    if (typeof s === 'number' || typeof s === 'boolean') return String(s);
    if (Array.isArray(s)) return s.map(text).filter(function (x) { return x; }).join(', ');
    try { return JSON.stringify(s); } catch (e) { return ''; }
  }
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
      var kind = { NEAR_TIM_RULED: 'You already marked a ' + (h.company || 'this employer') + ' role Applied', AMBIGUOUS: 'It matches more than one role', ARCHIVED_MATCH: 'It matches an archived role', RELISTED_PROTECTED: 'A role you declined, were rejected for or applied to is listed again' }[h.kind] || 'The Writer could not place it';
      var relisted = h.kind === 'RELISTED_PROTECTED';
      add({ id: 'live:held-email:' + h.id, section: 'JOBS', level: 'ACTION', title: (relisted ? 'Listed again: ' : 'Held email: ') + [h.company, h.title].filter(Boolean).join(' — ') + (h.state ? ' (' + String(h.state).replace(/_/g, ' ').toLowerCase() + ')' : ''),
        detail: kind + '. ' + (relisted ? (h.sourceUrl ? 'New listing: ' + h.sourceUrl + '. ' : '') + 'Same role keeps your earlier decision; Different role adds it as a new opportunity to reconsider.' : (h.evidence ? 'Email: ' + h.evidence + '. ' : '') + (h.status === 'RESTORED_AWAITING_ATTACH' ? 'The archived role was restored; tap Same role again to attach the email.' : 'Same role attaches it; Different role gives it its own row.')),
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
  var GROUPS = [
    { id: 'DECISIONS', title: 'My decisions', ids: { DECIDE: 1, JOBS: 1 }, empty: 'No decisions are waiting on you.' },
    { id: 'AI', title: 'AI work', ids: { UPKEEP: 1 }, empty: 'No AI work is waiting.' },
    { id: 'INCIDENTS', title: 'Incidents', ids: { FAILED: 1 }, empty: 'No unresolved failures.' },
    { id: 'HISTORY', title: 'History', ids: {}, empty: 'No resolved items in this rebuild.' }
  ];
  function groupOf(section) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].ids[section]) return GROUPS[i].id;
    return 'AI';
  }
  function ownerOf(it) {
    if (it.section === 'DECIDE' || it.section === 'JOBS') return 'Tim';
    return text(it.raisedBy) || (it.live ? 'Writer' : 'Unassigned');
  }
  function typeOf(it) {
    if (it.section === 'FAILED') return 'Incident';
    if (it.section === 'DECIDE' || it.section === 'JOBS') return 'Tim decision';
    return 'AI work';
  }
  function queueRow(it, now, on) {
    var when = it.at ? age(it.at, now) : '';
    var sub = [WORD[it.level] || 'WATCH', typeOf(it), ownerOf(it)].filter(Boolean).join(' · ');
    return '<article class="nt-item nt-lv-' + String(it.level || 'watch').toLowerCase() + (on ? ' on' : '') + '" data-nt-id="' + esc(it.id) + '" data-nt-group="' + esc(groupOf(it.section)) + '">' +
      '<button type="button" class="nt-row" data-nt-pick="' + esc(it.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="nt-row-main"><span class="nt-row-title">' + esc(text(it.title)) + '</span>' +
      '<span class="nt-row-sub">' + esc(sub) + '</span></span>' +
      '<span class="nt-row-age">' + esc(when) + '</span></button></article>';
  }
  function detailHtml(it, now, idx) {
    var meta = [it.raisedBy, it.at ? age(it.at, now) + ' ago' : '', it.live ? 'live' : ''].filter(Boolean).join(' · ');
    var opts = (it.options || []).map(function (o, k) { return '<button type="button" class="nt-opt" data-nt-copy="' + idx + '" data-nt-opt="' + k + '" title="Copy this answer for the AI chat">' + esc(text(o)) + '</button>'; }).join('');
    var links = (it.links || []).map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || 'Link') + ' ↗</a>'; }).join('');
    var rows = [
      ['Status', WORD[it.level] || ''],
      ['Owner', ownerOf(it)],
      ['Detected', it.at ? age(it.at, now) + ' ago' : 'Unknown'],
      ['Affected', text(it.blocks) || '1 record'],
      ['Next action', text(it.action) || 'None recorded'],
      ['Verification', it.live ? 'Live read this session' : 'Repo list, rebuilt every 30 min']
    ];
    var lead = text(it.detail);
    var rec = it.recommended ? '<span class="nt-rec">Recommended: ' + esc(text(it.recommended)) + '</span>' : '';
    var held = it.held ? '<div class="nt-opts nt-held">' + it.held.candidates.map(function (c) { return '<button type="button" class="nt-opt" data-nt-held="' + esc(it.held.id) + '" data-nt-choice="SAME" data-nt-pid="' + esc(c.primaryId) + '">Same role' + (it.held.candidates.length > 1 || c.title ? ': ' + esc([c.title, c.location].filter(Boolean).join(', ')) : '') + '</button>'; }).join('') +
      '<button type="button" class="nt-opt" data-nt-held="' + esc(it.held.id) + '" data-nt-choice="DIFFERENT">Different role</button><span class="nt-held-status" data-nt-held-status="' + esc(it.held.id) + '"></span></div>' : '';
    return '<button type="button" class="nt-back" data-nt-back>Back to queue</button><p class="nt-kicker">Selected item</p><h3>' + esc(text(it.title)) + '</h3>' +
      (lead ? '<p class="nt-lead">' + esc(lead) + '</p>' : '') +
      '<div class="nt-box"><p class="nt-kicker">Evidence</p><dl class="nt-kv">' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl></div>' +
      (opts || held ? '<p class="nt-kicker">Options</p>' + (opts ? '<div class="nt-opts">' + opts + rec + '</div>' : rec) + held : rec) +
      '<div class="nt-foot">' +
        (it.go ? '<button type="button" class="nt-go" data-nt-go="' + idx + '">Open</button>' : '') +
        (it.sourceUrl ? '<a href="' + esc(it.sourceUrl) + '" target="_blank" rel="noopener">Source ↗</a>' : '') + links +
        (it.askId || (!it.live && (it.section === 'DECIDE' || it.section === 'JOBS')) ? '<button type="button" class="nt-copy" data-nt-copy="' + idx + '" title="Copy an answer template for the AI chat">Copy answer</button>' : '') +
        '<span class="nt-meta">' + esc(meta) + '<span class="nt-id">' + esc(it.id) + '</span></span>' +
      '</div>';
  }
  function historyDetail(d) {
    return '<button type="button" class="nt-back" data-nt-back>Back to queue</button><p class="nt-kicker">Selected item</p><h3>' + esc(text(d.id)) + '</h3><div class="nt-box"><p class="nt-kicker">Evidence</p><dl class="nt-kv">' +
      '<dt>Status</dt><dd>RESOLVED</dd>' +
      '<dt>Owner</dt><dd>' + esc(text(d.by) || 'Recorded') + '</dd>' +
      '<dt>Evidence</dt><dd>' + esc(text(d.reason) || 'No ruling text on this row.') + '</dd>' +
      '<dt>Verification</dt><dd>Recorded in asks/resolved. This page does not reopen it.</dd></dl></div>';
  }
  function html(model, opts) {
    opts = opts || {}; var now = opts.now || Date.now(), items = model.items || [], dismissed = model.dismissed || [];
    var buckets = { DECISIONS: [], AI: [], INCIDENTS: [] };
    items.forEach(function (it) { buckets[groupOf(it.section)].push(it); });
    var selected = opts.selectedId;
    var known = {};
    items.forEach(function (it) { known[it.id] = it; });
    if (!known[selected] && String(selected || '').indexOf('hist:') !== 0) selected = '';
    if (!selected) selected = (buckets.DECISIONS[0] || buckets.AI[0] || buckets.INCIDENTS[0] || items[0] || {}).id || (dismissed[0] ? 'hist:' + dismissed[0].id : '');
    var jobsWaiting = items.some(function (it) { return it.section === 'JOBS'; });
    var counts = { DECISIONS: buckets.DECISIONS.length, AI: buckets.AI.length, INCIDENTS: buckets.INCIDENTS.length, HISTORY: dismissed.length };
    var head = '<div class="nt-top"><div><h2>Needs you <small>Action center</small></h2><p class="nt-sub">' +
      (model.counts.BLOCKING ? '<span class="nt-c-blocking">⊘ ' + model.counts.BLOCKING + ' blocking</span> · ' : '') +
      counts.DECISIONS + ' decisions · ' + counts.AI + ' AI work · ' + counts.INCIDENTS + ' incidents · ' + counts.HISTORY + ' history' +
      '</p><p class="nt-fresh">Repo list ' + (model.builtAt ? 'changed ' + age(model.builtAt, now) + ' ago (rebuilt every 30 min)' : (opts.repoError ? '<span class="nt-err">unavailable: ' + esc(opts.repoError) + '</span>' : 'loading…')) +
      ' · live Writer ' + (opts.writerAt ? 'checked ' + age(opts.writerAt, now) + ' ago' : 'not checked') + '</p></div>' +
      '<div class="nt-tools"><button type="button" id="nt-refresh">Refresh</button></div></div>';
    var stats = '<div class="nt-stats">' + GROUPS.map(function (g) {
      var n = g.id === 'HISTORY' ? dismissed.length : counts[g.id];
      var sub = '';
      if (g.id === 'DECISIONS') {
        if (!n) sub += '<small>' + esc(g.empty) + '</small>';
        if (!jobsWaiting) sub += '<small>No jobs are waiting on you.</small>';
      } else if (!n) sub = '<small>' + esc(g.empty) + '</small>';
      return '<div class="nt-stat" data-nt-stat="' + g.id + '"><span>' + esc(g.title) + '</span><b>' + n + '</b>' + sub + '</div>';
    }).join('') + '</div>';
    var idx = 0, map = [], indexOf = {};
    items.forEach(function (it) { indexOf[it.id] = idx; map.push(it); idx++; });
    var queue = '<section class="nt-sec" data-nt-sec="QUEUE"><h3>Queue <span class="nt-n">priority · owner · age</span></h3>' +
      (items.length ? items.map(function (it) { return queueRow(it, now, it.id === selected); }).join('') : '<p class="nt-empty">✓ Nothing is waiting.</p>') + '</section>';
    var hist = '<section class="nt-sec" data-nt-sec="HISTORY"><h3>History <span class="nt-n">' + dismissed.length + '</span></h3>';
    if (!dismissed.length) hist += '<p class="nt-empty">✓ ' + esc(GROUPS[3].empty) + '</p>';
    else hist += dismissed.map(function (d) {
      var id = 'hist:' + d.id, on = selected === id;
      return '<article class="nt-item nt-lv-watch' + (on ? ' on' : '') + '" data-nt-id="' + esc(id) + '" data-nt-group="HISTORY"><button type="button" class="nt-row" data-nt-pick="' + esc(id) + '" aria-pressed="' + (on ? 'true' : 'false') + '"><span class="nt-row-main"><span class="nt-row-title">' + esc(text(d.id)) + '</span><span class="nt-row-sub">RESOLVED' + (d.by ? ' · ' + esc(text(d.by)) : '') + '</span></span><span class="nt-row-age"></span></button></article>';
    }).join('') + '<p class="nt-note">' + plural(dismissed.length, 'resolved item') + ' from asks/resolved/ in forge-coordination.</p>';
    hist += '</section>';
    var chosen = known[selected];
    var detail = chosen ? detailHtml(chosen, now, indexOf[chosen.id]) : (String(selected).indexOf('hist:') === 0 ? historyDetail(dismissed.filter(function (d) { return 'hist:' + d.id === selected; })[0] || { id: selected }) : '<button type="button" class="nt-back" data-nt-back>Back to queue</button><p class="nt-empty">Select an item.</p>');
    var lanes = model.lanes.length ? '<details class="nt-lanes"><summary>Lane heartbeat · ' + model.lanes.length + ' lanes · newest receipt per AI</summary><table><thead><tr><th>Lane</th><th>AI</th><th>Last receipt</th><th>Status</th><th>Usual gap</th><th>Runs 7 d</th></tr></thead><tbody>' +
      model.lanes.slice().sort(function (a, b) { return ms(b.lastAt) - ms(a.lastAt); }).map(function (l) {
        return '<tr' + (l.overdue ? ' class="nt-overdue"' : '') + '><td>' + esc(l.lane) + '</td><td>' + esc(l.provider) + '</td><td>' + esc(age(l.lastAt, now)) + ' ago</td><td>' + esc(String(l.lastStatus || '').replace(/_/g, ' ')) + '</td><td>' + (l.usualGapHours == null ? '—' : esc(l.usualGapHours) + ' h') + '</td><td>' + esc(l.runs7d) + '</td></tr>';
      }).join('') + '</tbody></table><p class="nt-note">A lane marked quiet has gone more than twice its usual gap without a receipt. Lanes handed to another AI count as one lane.</p></details>' : '';
    var page = '<div class="nt-page' + (opts.detailOpen ? ' nt-detail-open' : '') + '">';
    return { html: page + head + stats + '<div class="nt-split"><div class="nt-queue">' + queue + hist + '</div><aside class="nt-detail" id="nt-detail">' + detail + '</aside></div>' + lanes + '<p class="nt-note">How to answer: press an option or Copy answer, paste it into your Claude chat, and Claude records the ruling. Nothing on this page writes a job decision by itself. Same role and Different role do write the held-email ruling.</p></div>', items: map, selectedId: selected };
  }
  var CSS = '.nt-page{margin:0;max-width:none;min-height:100%;display:flex;flex-direction:column;padding:14px 16px 24px;gap:12px}.nt-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid var(--line);padding:4px 2px 10px}.nt-top h2{margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase}.nt-top h2 small{display:block;margin-top:3px;color:var(--dim);font-weight:500;letter-spacing:.08em}.nt-sub{margin:6px 0 0;font-size:13px;color:var(--text)}.nt-c-blocking{color:var(--fault);font-weight:650}.nt-fresh{margin:4px 0 0;font-size:12px;color:var(--dim)}.nt-err{color:var(--fault)}' +
    '.nt-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.nt-stat{border:1px solid var(--line);background:var(--panel);padding:10px 12px;min-width:0}.nt-stat span{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}.nt-stat b{display:block;margin-top:8px;font:600 26px/1 var(--mono);color:var(--text);letter-spacing:0}.nt-stat small{display:block;margin-top:6px;color:var(--dim);font-size:12px;line-height:1.35;letter-spacing:0;text-transform:none;font-weight:400}' +
    '.nt-split{display:grid;grid-template-columns:minmax(300px,38%) minmax(0,1fr);gap:14px;align-items:start}.nt-queue{min-width:0;display:flex;flex-direction:column;gap:10px}.nt-sec{margin:0;border:1px solid var(--line);background:var(--panel);padding:8px 8px 4px}.nt-sec h3{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:0 0 6px;font-weight:600}.nt-n{color:var(--text);margin-left:6px;letter-spacing:.06em}.nt-empty{color:var(--dim);font-size:13px;margin:4px 2px 8px}' +
    '.nt-item{border:0;background:transparent;padding:0;margin:0 0 6px}.nt-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;width:100%;text-align:left;text-transform:none;letter-spacing:0;background:#101010;border:1px solid var(--line);border-left:3px solid var(--line2);padding:8px 10px;font-size:13px;color:var(--text);border-radius:2px}.nt-item.on .nt-row,.nt-row[aria-pressed=true]{background:#141414;box-shadow:inset 0 0 0 1px var(--caution)}.nt-lv-blocking .nt-row{border-left-color:var(--fault)}.nt-lv-action .nt-row{border-left-color:var(--caution)}.nt-lv-watch .nt-row{border-left-color:var(--line2)}' +
    '.nt-row-main{min-width:0;display:flex;flex-direction:column;gap:3px}.nt-row-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.nt-row-sub{color:var(--dim);font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nt-row-age{color:var(--dim);font-family:var(--mono);font-size:11px;white-space:nowrap}' +
    '.nt-detail{border:1px solid var(--line2);background:#0c0c0c;padding:16px 18px;min-height:280px;position:sticky;top:8px}.nt-detail h3{margin:0 0 10px;font-size:18px;line-height:1.3;letter-spacing:0;text-transform:none;color:var(--text);font-weight:600}.nt-kicker{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin:0 0 8px}.nt-lead{margin:0 0 12px;color:var(--text);font-size:14px;line-height:1.45}.nt-box{border:1px solid var(--line);background:#080808;padding:10px 12px;margin:0 0 14px}.nt-kv{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px 12px;margin:0}.nt-kv dt{color:var(--dim);font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase}.nt-kv dd{margin:0;color:var(--text);font-size:13px;line-height:1.45;overflow-wrap:anywhere}' +
    '.nt-detail button{text-transform:none;letter-spacing:0}.nt-opts{display:flex;flex-direction:column;align-items:stretch;gap:6px}.nt-opt{width:100%;text-align:left;font-size:13px;padding:8px 10px;min-height:36px}.nt-rec{font-size:12.5px;color:var(--dim)}.nt-foot{margin-top:12px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:12px}.nt-foot a{color:var(--text)}.nt-foot button{min-height:32px}.nt-meta{margin-left:auto;color:var(--dim);font-family:var(--mono);font-size:11px}.nt-id{margin-left:10px;color:var(--faint)}' +
    '.nt-lanes{margin:0;border:1px solid var(--line);padding:8px 10px;background:var(--panel)}.nt-lanes summary{cursor:pointer;font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}.nt-lanes table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12.5px}.nt-lanes th,.nt-lanes td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--line)}.nt-lanes th{font-family:var(--mono);font-size:11px;color:var(--dim);font-weight:500}.nt-overdue td{color:var(--caution)}.nt-note{font-size:12px;color:var(--dim)}' +
    '#bell{position:relative}#bell .nt-badge{position:absolute;top:-4px;right:-6px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--caution);color:#000;font:700 10px/16px var(--sans);text-align:center}#bell .nt-badge.nt-badge-blocking{background:var(--fault);color:#fff}' +
    '.nt-back{display:none}@media (max-width:900px){.nt-stats{grid-template-columns:1fr 1fr}.nt-split{grid-template-columns:1fr}.nt-queue{max-height:none;overflow:visible}.nt-detail{position:static}.nt-page{padding-bottom:calc(74px + env(safe-area-inset-bottom))}.nt-row,.nt-opt,.nt-foot button,.nt-back{min-height:44px}.nt-row-title,.nt-row-sub{white-space:normal}.nt-page:not(.nt-detail-open) .nt-detail{display:none}.nt-page.nt-detail-open .nt-stats,.nt-page.nt-detail-open .nt-queue,.nt-page.nt-detail-open .nt-lanes,.nt-page.nt-detail-open>.nt-note{display:none}.nt-page.nt-detail-open .nt-back{display:inline-flex;align-items:center;margin:0 0 12px}}';

  var api = { load: load, liveItems: liveItems, merge: merge, badge: badge, html: html, answerText: answerText, CSS: CSS, SECTIONS: SECTIONS, URL: API };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PipelineNeedsTim = api;
})(typeof self !== 'undefined' ? self : this);
