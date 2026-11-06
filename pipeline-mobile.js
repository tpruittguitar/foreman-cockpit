/* Mobile shell (Tim 2026-11-02; handoff "pipeline-explorer-mobile-handoff", staged and approved by Grok Bot GUI).
   Phones only: html.m-shell is set in the page head at <= 767px, or on a landscape phone (<= 932 x 520, coarse pointer).
   The desktop app keeps running underneath (data, Writer, rulings) and is hidden; this shell reads it through
   window.PEMobileBridge (pipeline.html) and never changes data, endpoints or the desktop layout.
   Header with system readout (hides on scroll), Decide / Jobs / Status tabs, More sheet (desktop views), job detail
   sheet. Decisions go through the existing ruling sender with a 5-second Undo; nothing is sent without a Writer
   connection set on purpose. */
(function (root) {
  'use strict';
  var Q = '(max-width:767px),(max-width:932px) and (max-height:520px) and (pointer:coarse)';
  var d = document.documentElement, mounted = false, tab = 'decide', lastY = 0, raf = 0;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function B() { return root.PEMobileBridge || null; }

  var ICON = {
    decide: '<path d="M4 12l5 5L20 6"/>',
    jobs: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    status: '<path d="M4 18V12M10 18V6M16 18V9M22 18H2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    leave: '<path d="M8 16L17 7M9 7h8v8"/>',
    /* State glyphs (Inter / Plex do not cover ✓ ? ✕, so they ship as SVG like pe-icons.js). */
    ok: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    delayed: '<path d="M9.2 9a3 3 0 1 1 4.2 2.8c-.9.4-1.4 1.1-1.4 2.1v.6"/><path d="M12 18h.01"/>',
    fault: '<path d="M6 6l12 12M18 6L6 18"/>',
    loading: '<circle cx="12" cy="12" r="1.6"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'
  };
  function svg(k, size) { size = size || 22; return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (size < 20 ? 2.4 : 1.6) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + '</svg>'; }

  var MORE = [
    ['backlog', 'Discovery backlog', 'Review discovery candidates in the pipeline table; select and decline batches'],
    ['map', 'Map', 'Jobs on the map'],
    ['reports', 'Trends', 'Reports and charts'],
    ['compare', 'Compare', 'Compare up to three roles'],
    ['rulings', 'My Rulings', 'Decisions made on this device'],
    ['intake', 'Intake', 'Add a job by hand'],
    ['settings', 'Settings', 'Writer connection and preferences']
  ];
  var TABS = [['decide', 'Decide'], ['jobs', 'Jobs'], ['status', 'Status']];

  function shellHtml() {
    return '<header class="m-hd" id="m-hd"><span class="m-brand">PIPELINE</span>' +
      '<button type="button" class="m-sys m-loading" id="m-sys" aria-label="System status"><span id="m-sys-ic">' + svg('loading', 14) + '</span><span id="m-sys-word">SYS …</span></button>' +
      '<button type="button" class="m-ic" id="m-search" aria-label="Search jobs">' + svg('search') + '</button>' +
      '<button type="button" class="m-ic" id="m-more" aria-label="More" aria-haspopup="dialog" aria-expanded="false">' + svg('more') + '</button></header>' +
      '<main class="m-main" id="m-main">' + TABS.map(function (t) {
        return '<section class="m-pane" id="m-pane-' + t[0] + '" role="tabpanel" aria-labelledby="m-tab-' + t[0] + '"' + (t[0] === tab ? '' : ' hidden') + '></section>';
      }).join('') + '</main>' +
      '<nav class="m-tabs" role="tablist" aria-label="Sections">' + TABS.map(function (t) {
        return '<button type="button" role="tab" id="m-tab-' + t[0] + '" data-m-tab="' + t[0] + '" aria-controls="m-pane-' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + svg(t[0]) + '<span>' + t[1] + '</span></button>';
      }).join('') + '</nav>' +
      '<div class="m-scrim" id="m-scrim" hidden></div>' +
      '<div class="m-sheet" id="m-more-sheet" role="dialog" aria-modal="true" aria-label="More, desktop views" hidden><div class="m-grab" aria-hidden="true"></div>' +
      '<div class="m-sheet-h"><b>More</b><span class="m-label">Desktop views</span><button type="button" class="m-ic m-x" id="m-more-x" aria-label="Close">' + svg('close') + '</button></div><ul class="m-list">' + MORE.map(function (m) {
        return '<li><button type="button" data-m-desk="' + m[0] + '"><b>' + m[1] + '</b><small>' + m[2] + '</small></button></li>';
      }).join('') + (d.classList.contains('touch-phone') ? '<li><button type="button" class="m-leave" data-m-layout="desktop"><b>Desktop layout ↗</b><small>Leaves the mobile view; use the full desktop cockpit on this phone</small></button></li>' : '') +
      '</ul></div>' +
      '<button type="button" class="m-return" id="m-return" hidden>' + svg('back') + '<span>Mobile</span></button>' +
      '<div class="m-sheet" id="m-fields" role="dialog" aria-modal="true" aria-label="Fields shown in Jobs" hidden></div>' +
      '<div class="m-detail" id="m-detail" role="dialog" aria-modal="true" aria-label="Job details" aria-labelledby="m-d-title" hidden></div>' +
      '<div class="m-toast" id="m-toast" role="status" aria-live="polite" hidden></div>';
  }

  function setTab(t, focusSearch) {
    tab = t;
    TABS.forEach(function (x) {
      var b = $('m-tab-' + x[0]), p = $('m-pane-' + x[0]);
      b.setAttribute('aria-selected', String(x[0] === t)); b.tabIndex = x[0] === t ? 0 : -1; p.hidden = x[0] !== t;
    });
    showHeader(true); root.scrollTo(0, 0); refresh();
    if (focusSearch) { var s = $('m-q'); if (s) { s.parentNode.classList.add('m-open'); s.focus(); } }
  }

  /* Header readout: one square dot and one word. Tap opens Status. */
  function renderSys() {
    var b = B(), h = b && b.health ? b.health() : { state: 'LOADING' };
    var word = { OK: 'SYS OK', DELAYED: 'SYS DELAYED', FAULT: 'SYS FAULT', LOADING: 'SYS …' }[h.state] || 'SYS …';
    var el = $('m-sys'); if (!el) return;
    var k = { OK: 'ok', DELAYED: 'delayed', FAULT: 'fault' }[h.state] || 'loading';
    /* No Writer connection set on purpose: that outranks system health, because nothing can be sent. */
    if (h.state !== 'LOADING' && h.writer === false) { el.className = 'm-sys m-nowriter'; $('m-sys-word').textContent = 'NO WRITER'; $('m-sys-ic').innerHTML = svg('warn', 14); el.setAttribute('aria-label', 'Writer not connected: decisions cannot be sent from this device. Open Status.'); return; }
    /* Decision queue failing (Tim, Stage 5 review): the header must not say "SYS OK" while Decide cannot load its queue.
       Down (nothing loaded) is orange with the warning glyph; stale (an older queue on screen) is yellow with "?". A system
       FAULT and NO WRITER still outrank it. */
    if (h.state !== 'FAULT' && h.state !== 'LOADING' && b.ready && b.ready()) {
      var qv = queueState().view;
      if (qv === 'unavailable' || qv === 'stale') {
        var down = qv === 'unavailable';
        el.className = 'm-sys ' + (down ? 'm-qdown' : 'm-delayed'); $('m-sys-word').textContent = down ? 'QUEUE DOWN' : 'QUEUE STALE';
        $('m-sys-ic').innerHTML = svg(down ? 'warn' : 'delayed', 14);   // header icon set: 'delayed' is the "?" glyph
        el.setAttribute('aria-label', down ? 'Decision queue down: it could not be loaded. Open Status.' : 'Decision queue stale: showing an older queue because the refresh failed. Open Status.');
        return;
      }
    }
    el.className = 'm-sys m-' + k; $('m-sys-word').textContent = word; $('m-sys-ic').innerHTML = svg(k, 14);
    el.setAttribute('aria-label', 'System status: ' + word.replace('SYS ', '').toLowerCase() + '. Open Status.');
  }

  /* Repaint once per frame; never while a card is being dragged or animated (the paint waits for it). */
  var busy = 0, pending = false;
  function refresh() {
    if (!mounted || raf) return;
    if (busy) { pending = true; return; }
    raf = root.requestAnimationFrame(function () {
      raf = 0; renderSys();
      var b = B(), loaded = b && b.ready();
      renderDecide(loaded);
      renderJobs(loaded);
      renderStatus(loaded);
      if (detailId) renderDetail();
    });
  }
  function settle() { busy = Math.max(0, busy - 1); if (!busy && pending) { pending = false; refresh(); } }
  function skeleton() { return '<div class="m-skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i></div>'; }
  /* Repaint a pane only when its markup changed. A repaint keeps keyboard focus on the same control (found again by its
     data attributes) and keeps open <details> open, so background refreshes never throw a keyboard or screen-reader
     user back to the top. Returns true when the pane was repainted (its handlers must be bound again). */
  var FOCUS_KEYS = ['data-m-do', 'data-id', 'data-m-open', 'data-m-menu', 'data-m-filter', 'data-m-jf', 'data-m-retry', 'data-m-retry-queue', 'data-m-field', 'id'];
  function setHtml(el, html) {
    if (el._mHtml === html) return false;
    var a = document.activeElement, sel = '';
    if (a && el.contains(a)) sel = FOCUS_KEYS.filter(function (k) { return a.hasAttribute(k); }).map(function (k) { return '[' + k + '="' + String(a.getAttribute(k)).replace(/"/g, '\\"') + '"]'; }).join('') || (a.hasAttribute('data-m-browse') ? '[data-m-browse]' : '');
    var open = [].map.call(el.querySelectorAll('details'), function (x) { return x.open; });
    el.innerHTML = html; el._mHtml = html;
    el.querySelectorAll('details').forEach(function (x, i) { if (open[i]) x.open = true; });
    if (sel) { var t = el.querySelector(sel); if (t) t.focus({ preventScroll: true }); }
    return true;
  }

  /* ---- Stage 3: badges, Decide cards, decisions with Undo, swipe, detail sheet ---------------------------------- */
  var STALE_DAYS = 21, FIT_BORDER = 70, SCORE_OK = 85;
  var G = {   // 14px semantic glyphs; the word or number always sits next to them (never colour alone)
    ok: '<path d="M5 12.5l4.5 4.5L19 7"/>', caution: '<path d="M9.2 9a3 3 0 1 1 4.2 2.8c-.9.4-1.4 1.1-1.4 2.1v.6"/><path d="M12 18h.01"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>', no: '<path d="M6 6l12 12M18 6L6 18"/>', home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
    globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16"/>', warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'
  };
  function gl(k) { return '<svg class="m-g" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + G[k] + '</svg>'; }
  function k$(n) { return '$' + Math.round(n / 1000) + 'K'; }
  function ageDays(v) { return v.added ? Math.max(0, Math.floor((Date.now() - v.added) / 864e5)) : null; }

  /* Salary: green ✓ if the top of the range meets the pay this place needs, red ↓ if below, yellow ? when missing.
     "~" marks an estimate (not employer-verified). */
  function payState(v) {
    if (!v.salary.text) return 'missing';
    if (v.need == null || v.salary.top == null) return 'unknown';
    return v.salary.top >= v.need ? 'ok' : 'below';
  }
  function badges(v, opt) {
    var out = [], ps = payState(v), st = v.salary.text ? (v.salary.approx ? '~' : '') + v.salary.text.replace(/k/g, 'K') : '';
    if (ps === 'ok') out.push(['ok', gl('ok') + esc(st), 'Salary ' + st + ', meets the pay you need']);
    else if (ps === 'below') out.push(['fault', gl('down') + esc(st), 'Salary ' + st + ', below the pay you need']);
    else if (ps === 'missing') out.push(['caution m-i', gl('caution') + '— est. pending', 'Salary estimate pending']);
    else out.push(['', esc(st), 'Salary ' + st]);
    if (v.fit == null) out.push(['caution', gl('caution') + 'Fit unknown', 'Fit not measured']);
    else if (v.fit < FIT_BORDER) out.push(['caution', '~ Fit ' + Math.round(v.fit), 'Fit ' + Math.round(v.fit) + ', borderline']);
    else out.push(['ok', gl('ok') + 'Fit ' + Math.round(v.fit), 'Fit ' + Math.round(v.fit) + ', strong']);   // every fit badge carries a glyph (Grok Bot GUI, Stage 5 review)
    out.push(flexBadge(v.flex));
    var a = ageDays(v);
    if (opt && opt.skipAge) return out;
    if (a == null) out.push(['caution', gl('caution') + 'Age unknown', 'Age unknown']);
    else if (a > STALE_DAYS) out.push(['caution', gl('caution') + a + 'd', a + ' days old, stale']);
    else out.push(['', a + 'd', a + ' days old']);
    return out;
  }
  /* Flex classes from the scoring model (Grok Bot GUI, Stage 1): Strict is red, No flex orange, unknown yellow. */
  function flexBadge(c) {
    return { HIGH_FLEX: ['ok', gl('globe') + 'High flex', 'High flex'], SOFT_FLEX: ['ok', gl('home') + 'Soft flex', 'Soft flex'],
      NO_FLEX: ['attn', gl('no') + 'No flex', 'No flex'], STRICT: ['fault', gl('no') + 'Strict', 'Strict, no flex'] }[c] || ['caution', gl('caution') + 'Flex unknown', 'Flex not recorded'];
  }
  function badgeRow(v, opt) { return '<div class="m-badges">' + badges(v, opt).map(function (b) { return '<span class="m-b ' + b[0] + '" title="' + esc(b[2]) + '" aria-label="' + esc(b[2]) + '">' + b[1] + '</span>'; }).join('') + '</div>'; }

  /* Reason line: one mono line, coloured by meaning, always with its glyph. */
  function reason(v) {
    var ps = payState(v), a = ageDays(v);
    if (ps === 'below') return ['fault', gl('down') + 'Pay below need · ' + k$(v.need) + (v.needArea ? ' for ' + esc(v.needArea) : '')];
    if (ps === 'missing') return ['caution', gl('caution') + 'Salary not posted'];
    if (a != null && a > STALE_DAYS) return ['caution', gl('caution') + 'Aging · posted ' + a + 'd ago', 'age'];
    if (v.fit != null && v.fit < FIT_BORDER) return ['caution', gl('caution') + 'Stretch · fit ' + Math.round(v.fit)];
    if (ps === 'ok') return ['ok', gl('ok') + 'Pay meets target'];
    return ['', 'Pay vs need not known'];
  }
  /* Card / row score: coloured by the same percentile band as the detail ring (Tim, 2026-11-02), with the band glyph drawn
     before the number (CSS ::before from data-g, so the number's text stays a plain number) and the band named in the label
     for screen readers. TOP green ▲, UPPER yellow ◆, MID gray ●, LOW red ▼ (pipeline-bands.js; all filled); bands off / not ranked / HOLD: plain number. */
  function scoreHtml(v, big) {
    if (v.score == null) return '<div class="m-score"><b class="m-num">—</b><span class="m-label">Unscored</span></div>';
    var bd = { TOP: 'top', UPPER: 'upper', MID: 'mid', LOW: 'low' }[v.band], g = bd ? BAND[v.band][1].split(' ')[0] : '';
    return '<div class="m-score' + (bd ? ' m-b-' + bd : '') + '" data-band="' + esc(v.band || 'NONE') + '" aria-label="Score ' + Math.round(v.score) + (bd ? ', ' + BAND[v.band][1].slice(2).toLowerCase() + ' of open jobs' : '') + '"><b class="m-num"' + (g ? ' data-g="' + g + '"' : '') + '>' + Math.round(v.score) + '</b><span class="m-label">Score</span></div>';
  }


  var decideFilter = 'all', menuFor = null, swipeX = 0, toastTimer = 0, lastDecision = null, holdTimer = 0;
  function queue() {
    var b = B(), rows = b.decideRows(), ids = decideFilter === 'act' ? b.actNowIds() : null;
    /* Act now keeps the shared Act Now model's order (Shield AI pinned first, then its ranking); re-sorting by score here
       dropped the pin (found by tests/mobile-act-now.browser.js, 2026-11-02). All is sorted by score. */
    if (ids) return rows.filter(function (r) { return ids.indexOf(r.id) >= 0; }).sort(function (a, c) { return ids.indexOf(a.id) - ids.indexOf(c.id); }).map(function (r) { return b.view(r); });
    return rows.map(function (r) { return b.view(r); }).sort(function (a, c) { return (c.score == null ? -1 : c.score) - (a.score == null ? -1 : a.score) || String(a.id).localeCompare(String(c.id)); });
  }
  function cardHtml(v, top) {
    var rs = reason(v), ns = B().notSaved(v.id);
    return '<article class="m-card' + (top ? ' m-top m-brackets' : '') + '" data-m-card="' + esc(v.id) + '" aria-label="' + esc(v.title + ', ' + v.company) + '">' +
      (top ? '<div class="m-hint m-hint-r" aria-hidden="true">' + gl('ok') + 'PURSUE</div><div class="m-hint m-hint-l" aria-hidden="true">' + gl('no') + 'DECLINE</div>' : '') +
      '<button type="button" class="m-card-open" data-m-open="' + esc(v.id) + '"><span class="m-card-t"><b class="m-title">' + esc(v.title) + '</b><span class="m-sub">' + esc([v.company, v.location].filter(Boolean).join(' · ')) + '</span></span>' + scoreHtml(v) + '</button>' +
      '<p class="m-reason ' + rs[0] + '">' + rs[1] + '</p>' + badgeRow(v, { skipAge: rs[2] === 'age' }) +
      (ns ? '<p class="m-alert" role="alert">' + gl('no') + 'Decision not saved <button type="button" class="m-btn m-quiet" data-m-retry="' + esc(v.id) + '">Retry</button></p>' : '') +
      '<div class="m-actions"><button type="button" class="m-btn m-primary" data-m-do="pursue" data-id="' + esc(v.id) + '">' + gl('ok') + 'Pursue</button>' +
      '<button type="button" class="m-btn m-quiet" data-m-do="hold" data-id="' + esc(v.id) + '">Hold</button>' +
      '<button type="button" class="m-btn m-quiet m-dots" data-m-menu="' + esc(v.id) + '" aria-haspopup="menu" aria-expanded="' + (menuFor === v.id) + '" aria-label="More actions">⋯</button>' +
      '<button type="button" class="m-btn m-danger" data-m-do="decline" data-id="' + esc(v.id) + '">' + gl('no') + 'Decline</button></div>' +
      (menuFor === v.id ? menuHtml(v.id) : '') + '<p class="m-say" role="status" data-m-say="' + esc(v.id) + '"></p></article>';
  }
  function menuHtml(id) {
    return '<div class="m-menu" role="menu"><button type="button" role="menuitem" data-m-do="research" data-id="' + esc(id) + '">Research<small>Ask for more research before deciding</small></button>' +
      '<button type="button" role="menuitem" data-m-do="applied" data-id="' + esc(id) + '">Mark applied<small>I already applied to this job</small></button>' +
      '<button type="button" role="menuitem" data-m-open="' + esc(id) + '">Open details<small>Posting, fit and score, my application</small></button></div>';
  }
  function renderDecide(loaded) {
    var p = $('m-pane-decide');
    if (!loaded) { p.innerHTML = skeleton(); return; }
    var q = queue(), rows = B().decideRows(), all = rows.length, ids = B().actNowIds(), act = rows.filter(function (r) { return ids.indexOf(r.id) >= 0; }).length;
    var qs0 = queueState(), unknown = qs0.view === 'unavailable';   // queue failed to load: the counts are not known, so say "—" (Tim, Stage 5 review)
    if (unknown) all = act = '—';
    var head = '<div class="m-count"><p><b class="m-num m-attn">' + all + '</b> need you</p><span class="m-label">' + (decideFilter === 'act' ? 'Order: Act now' : 'Sort: score ↓') + '</span></div>' +
      '<div class="m-chips" role="group" aria-label="Decide filter"><button type="button" class="m-chip" data-m-filter="all" aria-pressed="' + (decideFilter === 'all') + '">All · ' + all + '</button>' +
      '<button type="button" class="m-chip" data-m-filter="act" aria-pressed="' + (decideFilter === 'act') + '" title="Act Now: up to 10 roles to act on first (Director and up, US, scored)">Act now · ' + act + '</button></div>';
    var h = B().health(), qs = queueState();
    /* Down = orange ⚠ everywhere (header "QUEUE DOWN", this banner, the empty view); loading and stale = yellow "?" (Tim, Stage 5 polish). */
    if ((qs.view === 'loading' || qs.view === 'unavailable') && q.length) head = '<p class="m-alert ' + (qs.view === 'unavailable' ? 'm-down-note' : 'm-caution-note') + ' m-stale" role="status">' + gl(qs.view === 'unavailable' ? 'warn' : 'caution') + '<span>Decision queue ' + (qs.view === 'loading' ? 'loading' : 'unavailable') + ': showing only jobs marked Needs decision.' + (qs.view === 'unavailable' ? retryNote(qs) + ' ' + retryBtn('m-inline-link') : '') + '</span></p>' + head;
    /* Stale: "Showing queue from 8:53 AM ET. Refresh failed (server error). Retry" (Tim, Stage 5 review). After a failed
       retry: "... Retry failed at 9:40 AM ET (server error). Retry"; the queue time already says when it last loaded. */
    if (qs.view === 'stale') head = '<p class="m-alert m-caution-note m-stale" role="status">' + gl('caution') + '<span>Showing queue from ' + esc(qs.when) + '. ' +
      (queueRetry.failedAt && !queueRetry.busy ? '<span data-m-retry-note>Retry failed at ' + esc(etTime(queueRetry.failedAt)) + ' (' + esc(why(queueRetry.error)) + ').</span>' : 'Refresh failed (' + esc(why(qs.error)) + ').') +
      ' ' + retryBtn('m-inline-link') + '</span></p>' + head;
    if (h.writer === false) head = '<p class="m-alert m-nowriter-note" role="status">' + gl('warn') + '<span>Writer not connected · decisions can’t be sent from this device. Save a connection in <button type="button" class="m-inline-link" data-m-settings>Settings</button>.</span></p>' + head;
    var changed = setHtml(p, head + (q.length ? '<div class="m-stack">' + q.map(function (v, i) { return cardHtml(v, i === 0); }).join('') + '</div>' :
      (qs.view === 'loading' ? '<div class="m-done m-pending" role="status">' + gl('caution') + '<b>Decision queue loading</b><p>Jobs that need your decision come from the pipeline evidence, which has not loaded yet. This updates on its own.</p></div>' :
      qs.view === 'unavailable' ? '<div class="m-done m-pending m-down" role="alert">' + gl('warn') + '<b>Decision queue unavailable</b><p>' + (retryNote(qs) || 'Last loaded: ' + esc(qs.when) + '.' + (qs.error ? ' ' + esc(qs.error) + '.' : '')) + '</p>' + retryBtn('m-btn m-quiet') + ' <button type="button" class="m-btn m-quiet" data-m-browse>Browse all jobs</button></div>' :
      '<div class="m-done">' + gl('ok') + '<b>All caught up</b><p>No jobs need a decision' + (decideFilter === 'act' ? ' in Act Now' : '') + '. New matches arrive after the next sync.</p><button type="button" class="m-btn m-quiet" data-m-browse>Browse all jobs</button></div>')));
    if (changed) bindDecide(p);
  }
  /* What Decide can honestly say about its queue: ready, loading (first 60 s), unavailable (nothing loaded, failed or
     still loading after 60 s), or stale (an older queue is shown because a refresh failed). */
  var started = Date.now();
  /* Retry of the decision queue. Its state lives in the pane's markup (not set on the button), so setHtml repaints it: busy shows
     a disabled "Retrying…"; once the request settles the button is "Retry" again, and a failed retry says so, with the
     time of the last successful load (ET). */
  var queueRetry = { busy: false, failedAt: null, error: '' };
  /* A short, plain reason for a failed load: "server error" for HTTP 5xx, "no connection" when the request never got an answer,
     "not found" for 404, "queue data did not check out" when the snapshot fails validation, else "HTTP <code>". */
  function why(err) {
    var e = String(err || ''), m = e.match(/HTTP (\d{3})/);
    if (m) return +m[1] >= 500 ? 'server error' : m[1] === '404' ? 'not found' : 'HTTP ' + m[1];
    if (/fetch|network|load failed/i.test(e)) return 'no connection';
    if (/reconcile|unavailable or do not match|snapshot did not load/i.test(e)) return 'queue data did not check out';
    return e ? 'error' : 'unknown error';
  }
  function etTime(ms) { return new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET'; }
  function retryBtn(cls) { return '<button type="button" class="' + cls + '" data-m-retry-queue' + (queueRetry.busy ? ' disabled aria-busy="true">Retrying…' : '>Retry') + '</button>'; }
  function retryNote(qs) {
    if (queueRetry.busy || !queueRetry.failedAt) return '';
    return ' <span class="m-retry-note" data-m-retry-note>Retry failed at ' + esc(etTime(queueRetry.failedAt)) + ' (' + esc(why(queueRetry.error)) + '). Last successful load: ' + esc(qs.when) + '.</span>';
  }
  function retryQueue() {
    if (queueRetry.busy) return;
    queueRetry.busy = true; refresh();
    B().retryDecide().then(function (r) {
      queueRetry.busy = false;
      if (r && r.ok) { queueRetry.failedAt = null; queueRetry.error = ''; } else { queueRetry.failedAt = Date.now(); queueRetry.error = (r && r.error) || ''; }
      refresh();
    });
  }
  function queueState() {
    var s = B().decideState(), when = s.loadedAt ? new Date(s.loadedAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET' : 'never';
    if (s.status === 'ready') return { view: 'ready', when: when };
    if (s.have) return { view: s.status === 'error' || s.error ? 'stale' : 'ready', when: when, error: s.error };
    if (s.status === 'error' || s.error || Date.now() - started > 60000) return { view: 'unavailable', when: when, error: s.error };
    return { view: 'loading', when: when };
  }
  function say(id, t) { document.querySelectorAll('[data-m-say="' + id + '"]').forEach(function (e) { e.textContent = t; }); var ts = $('m-toast-say'); if (ts && lastDecision && lastDecision.id === id) ts.textContent = t; }

  /* A decision: queued in the existing ruling sender first; only then does the card leave and the Undo toast appear. */
  var WORD = { pursue: 'Pursue', hold: 'Hold', research: 'Research', decline: 'Decline', applied: 'Applied' };
  function decide(id, kind, card) {
    var res = B().decide(id, kind, function (t) { say(id, t); });
    if (!res || !res.ok) { say(id, (res && res.msg) || 'Not saved.'); if (card) { card.classList.remove('m-gone'); card.style.transform = ''; } return false; }
    menuFor = null; lastDecision = { id: id, kind: kind };
    var done = function () { toast(WORD[kind] + ' queued', id); settle(); };
    if (card && !reduced()) { busy++; card.classList.add('m-gone', kind === 'decline' ? 'm-left' : 'm-right'); setTimeout(done, 200); } else { busy++; done(); }
    if (detailId === id) closeDetail(true);
    return true;
  }
  function reduced() { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function toast(text, id) {
    var t = $('m-toast'); clearTimeout(toastTimer);
    t.innerHTML = '<p><b>' + gl('ok') + esc(text) + '</b><span id="m-toast-say" class="m-toast-say"></span></p><button type="button" class="m-btn m-quiet" id="m-undo">Undo</button><i class="m-bar"></i>';
    t.hidden = false; t.classList.remove('m-run'); void t.offsetWidth; t.classList.add('m-run');
    $('m-undo').onclick = function () { undo(id); };
    toastTimer = setTimeout(function () { t.hidden = true; }, 5000);
  }
  function undo(id) {
    clearTimeout(toastTimer); var t = $('m-toast');
    t.innerHTML = '<p><b>Undoing…</b><span id="m-toast-say" class="m-toast-say"></span></p>';
    B().undo(id, function (m) { var s = $('m-toast-say'); if (s) s.textContent = m; });
    toastTimer = setTimeout(function () { t.hidden = true; }, 3000);
    lastDecision = null; refresh();
  }

  /* Swipe the top card: right past 100px = Pursue, left = Decline. The buttons do the same thing. */
  function swipe(card) {
    var id = card.getAttribute('data-m-card'), x0 = 0, y0 = 0, on = false, dx = 0;
    card.addEventListener('pointerdown', function (e) { if (e.button || e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; on = true; dx = 0; });
    card.addEventListener('pointermove', function (e) {
      if (!on) return; dx = e.clientX - x0;
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - y0)) return;
      if (!card.classList.contains('m-drag')) { card.classList.add('m-drag'); busy++; try { card.setPointerCapture(e.pointerId); } catch (x) {} }
      card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 40) + 'deg)';
      card.style.setProperty('--m-hint-r', Math.max(0, Math.min(1, dx / 100))); card.style.setProperty('--m-hint-l', Math.max(0, Math.min(1, -dx / 100)));
    });
    function end() {
      if (!on) return; on = false; if (!card.classList.contains('m-drag')) return;
      card.classList.remove('m-drag'); card.style.removeProperty('--m-hint-r'); card.style.removeProperty('--m-hint-l');
      if (Math.abs(dx) > 100) { settle(); decide(id, dx > 0 ? 'pursue' : 'decline', card); } else { card.style.transform = ''; settle(); }
    }
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
  }
  function bindDecide(p) {
    p.querySelectorAll('[data-m-filter]').forEach(function (b) { b.onclick = function () { decideFilter = b.getAttribute('data-m-filter'); refresh(); }; });
    p.querySelectorAll('[data-m-do]').forEach(function (b) { b.onclick = function () { decide(b.getAttribute('data-id'), b.getAttribute('data-m-do'), b.closest('.m-card')); }; });
    p.querySelectorAll('[data-m-menu]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-m-menu'); menuFor = menuFor === id ? null : id; refresh(); }; });
    p.querySelectorAll('[data-m-open]').forEach(function (b) { b.onclick = function () { if (holdTimer === -1) { holdTimer = 0; return; } menuFor = null; openDetail(b.getAttribute('data-m-open')); }; });
    p.querySelectorAll('[data-m-retry]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-m-retry'), r = B().retry(id, function (t) { say(id, t); }); if (!r.ok) say(id, r.msg); }; });
    var br = p.querySelector('[data-m-browse]'); if (br) br.onclick = function () { setTab('jobs'); };
    var st = p.querySelector('[data-m-settings]'); if (st) st.onclick = function () { openDesktop('settings'); };
    p.querySelectorAll('[data-m-retry-queue]').forEach(function (b) { b.onclick = retryQueue; });
    /* Long-press a card (500ms) for the same menu as ⋯ (Research in two taps or fewer). */
    p.querySelectorAll('.m-card').forEach(function (c) {
      var id = c.getAttribute('data-m-card');
      c.addEventListener('pointerdown', function (e) { if (e.target.closest('.m-actions,.m-menu')) return; clearTimeout(holdTimer); holdTimer = setTimeout(function () { holdTimer = -1; menuFor = id; refresh(); }, 500); });
      ['pointerup', 'pointercancel', 'pointermove'].forEach(function (ev) { c.addEventListener(ev, function (e) { if (ev === 'pointermove' && Math.abs(e.movementX) + Math.abs(e.movementY) < 4) return; if (holdTimer > 0) { clearTimeout(holdTimer); holdTimer = 0; } }); });
      c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    var top = p.querySelector('.m-card.m-top'); if (top) swipe(top);
  }

  /* Job detail: full-screen sheet. Back arrow, swipe down on the handle (> 120px), Escape and browser/phone Back close it. */
  var detailId = null, detailFocus = null;
  /* Score ring coloured by the app's own percentile band (pipeline-bands.js, the desktop score colours): TOP green, UPPER yellow,
     MID neutral gray, LOW red (phone tokens). Orange stays for constraints and QUEUE DOWN. Gray also when bands are off,
     on HOLD or not ranked. The number stays neutral light gray and
     a text label names the band, so colour never carries meaning alone (Tim, 2026-11-02). The fill animates once per opened
     sheet (<= 250ms; none under reduced motion, see pipeline-mobile.css): renderDetail drops the class from the live element when
     the fill ends, so the stored markup is unchanged and later refreshes neither repaint the sheet nor replay the fill. */
  var BG = (typeof PipelineBands !== 'undefined' && PipelineBands.GLYPH) || { TOP: '▲', UPPER: '◆', MID: '●', LOW: '▼', HOLD: '⊘' };
  var BAND = { TOP: ['top', BG.TOP + ' TOP 10%'], UPPER: ['upper', BG.UPPER + ' UPPER 25%'], MID: ['mid', BG.MID + ' MID 45%'], LOW: ['low', BG.LOW + ' LOW 20%'], HOLD: ['hold', BG.HOLD + ' HOLD · outside the bands'] };
  function ring(score, band, animate) {
    var r = 30, c = 2 * Math.PI * r, f = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100, k = (BAND[band] || [])[0] || 'none';
    return '<svg class="m-ring m-b-' + k + (animate ? ' m-ring-in' : '') + '" data-band="' + esc(band || 'NONE') + '" width="88" height="88" viewBox="0 0 88 88" aria-hidden="true"><g transform="translate(44 44)">' +
      '<circle r="' + r + '" fill="none" stroke="#2E2E2E" stroke-width="6"/><circle class="m-ring-arc" r="' + r + '" fill="none" stroke="currentColor" stroke-width="6" stroke-dasharray="' + (c * f).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90)"/>' +
      '<circle r="22" fill="none" stroke="#4A4A4A" stroke-width="1" stroke-dasharray="2 4"/>' +
      '<path d="M0 -42v8M42 0h-8M0 42v-8M-42 0h8" stroke="#4A4A4A" stroke-width="1.5"/>' +
      '<text y="7" text-anchor="middle" class="m-ring-n">' + (score == null ? '—' : Math.round(score)) + '</text></g></svg>';
  }
  function detailHtml(v) {
    var ps = payState(v), a = ageDays(v);
    var pay = v.salary.text ? 'Pays ' + (v.salary.approx ? '~' : '') + esc(v.salary.text.replace(/k/g, 'K')) + (v.need ? ' · you need ' + k$(v.need) + (v.needArea ? ' for ' + esc(v.needArea) : '') : '') : 'Salary estimate pending' + (v.need ? ' · you need ' + k$(v.need) + (v.needArea ? ' for ' + esc(v.needArea) : '') : '');
    var payCls = ps === 'below' ? 'fault' : ps === 'missing' ? 'caution' : ps === 'ok' ? 'ok' : '';
    var payGl = ps === 'below' ? gl('down') : ps === 'missing' ? gl('caution') : ps === 'ok' ? gl('ok') : '';
    var verdict = ps === 'below' ? 'Pay is below what this location needs.' : ps === 'missing' ? 'Salary not known yet; check the posting before deciding.' : v.score != null && v.score >= SCORE_OK ? 'Strong match: worth pursuing.' : v.fit != null && v.fit < FIT_BORDER ? 'A stretch on fit; check the posting.' : 'Decent match; decide on the details.';
    function sec(t, body) { return '<details class="m-sec"><summary>' + t + '</summary><div class="m-sec-b">' + body + '</div></details>'; }
    function kv(k, val) { return '<div class="m-kv"><span>' + k + '</span><b>' + val + '</b></div>'; }
    return '<div class="m-dh" id="m-dh"><div class="m-grab" aria-hidden="true"></div><div class="m-dh-row"><button type="button" class="m-ic" id="m-d-back" aria-label="Back to the list">' + svg('back') + '</button>' +
      '<div class="m-dh-t"><h2 class="m-d-title" id="m-d-title">' + esc(v.title) + '</h2><p class="m-sub">' + esc([v.company, v.location].filter(Boolean).join(' · ')) + '</p></div></div></div>' +
      '<div class="m-db"><section class="m-verdict m-brackets">' + ring(v.score, v.band, true) + '<div><p class="m-verdict-t">' + esc(verdict) + '</p>' +
        (BAND[v.band] ? '<p class="m-band-l m-b-' + BAND[v.band][0] + '" data-m-band>' + BAND[v.band][1] + (v.band === 'HOLD' ? '' : ' of open jobs') + '</p>' : '') + (ps === 'missing' ? '' : '<p class="m-pay ' + payCls + '">' + payGl + pay + '</p>') + '</div></section>' +
      badgeRow(v) +
      sec('Posting', (v.why ? '<p>' + esc(v.why) + '</p>' : '<p class="m-faint">No fit summary recorded.</p>') + (v.url ? '<p><a class="m-link" href="' + esc(v.url) + '" target="_blank" rel="noopener">Open the posting ↗</a></p>' : '')) +
      sec('Fit &amp; score', kv('Raw fit', v.fit == null ? '? not measured' : Math.round(v.fit)) + kv('Pay vs target', ps === 'ok' ? '✓ meets need' : ps === 'below' ? '↓ below need' : ps === 'missing' ? '? pending' : 'not known') +
        kv('Flex', esc(flexBadge(v.flex)[2])) + kv('Recency', a == null ? '? unknown' : a + ' days') + kv('Final score', v.score == null ? 'unscored' : Math.round(v.score))) +
      sec('My application', (v.applied ? kv('Applied', esc(v.applied.date || 'yes')) : '<p class="m-faint">No application recorded.</p><p><button type="button" class="m-btn m-quiet" data-m-do="applied" data-id="' + esc(v.id) + '">Mark applied</button></p>') + (v.ruling ? kv('Decision', esc(v.ruling)) : '')) +
      '<p class="m-say" role="status" data-m-say="' + esc(v.id) + '"></p></div>' +
      '<div class="m-dbar"><button type="button" class="m-btn m-primary" data-m-do="pursue" data-id="' + esc(v.id) + '">' + gl('ok') + 'Pursue</button>' +
      '<button type="button" class="m-btn m-quiet" data-m-do="hold" data-id="' + esc(v.id) + '">Hold</button>' +
      '<button type="button" class="m-btn m-quiet m-research" data-m-do="research" data-id="' + esc(v.id) + '">Research</button>' +
      '<button type="button" class="m-btn m-danger" data-m-do="decline" data-id="' + esc(v.id) + '">' + gl('no') + 'Decline</button></div>';
  }
  function openDetail(id) {
    var b = B(), r = b.rows().filter(function (x) { return x.id === id; })[0]; if (!r) return;
    detailId = id; detailFocus = document.activeElement;
    var d = $('m-detail'); d.hidden = false; renderDetail(); document.documentElement.classList.add('m-detail-open');
    try { history.pushState({ mDetail: id }, ''); } catch (e) {}
    var bk = $('m-d-back'); if (bk) bk.focus();
  }
  function renderDetail() {
    var d = $('m-detail'), r = B().rows().filter(function (x) { return x.id === detailId; })[0]; if (!r) { closeDetail(true); return; }
    if (!setHtml(d, detailHtml(B().view(r)))) return;   // unchanged: keep focus, open sections and handlers as they are
    var rg = d.querySelector('.m-ring-in'); if (rg) rg.addEventListener('animationend', function () { rg.classList.remove('m-ring-in'); }, { once: true });
    $('m-d-back').onclick = function () { closeDetail(); };
    d.querySelectorAll('[data-m-do]').forEach(function (b) { b.onclick = function () { decide(b.getAttribute('data-id'), b.getAttribute('data-m-do'), null); }; });
    dragClose($('m-dh'), d);
  }
  /* how === 'pop': the phone/browser Back already removed our history entry. Any other close (back arrow, swipe, Escape,
     after a decision) removes the entry openDetail pushed, so Back never reopens a closed sheet. */
  function closeDetail(how) {
    if (!detailId) return; detailId = null;
    var d = $('m-detail'); d.hidden = true; d.innerHTML = ''; d._mHtml = ''; d.style.transform = ''; document.documentElement.classList.remove('m-detail-open');
    if (how !== 'pop') { try { if (history.state && history.state.mDetail) history.back(); } catch (e) {} }
    if (detailFocus && detailFocus.focus && document.contains(detailFocus)) detailFocus.focus();
  }
  function dragClose(handle, sheetEl) {
    var y0 = 0, on = false, dy = 0;
    handle.addEventListener('pointerdown', function (e) { if (e.target.closest('button')) return; on = true; y0 = e.clientY; dy = 0; try { handle.setPointerCapture(e.pointerId); } catch (x) {} });
    handle.addEventListener('pointermove', function (e) { if (!on) return; dy = Math.max(0, e.clientY - y0); sheetEl.style.transform = 'translateY(' + dy + 'px)'; });
    function end() { if (!on) return; on = false; if (dy > 120) closeDetail(); else sheetEl.style.transform = ''; }
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  }

  /* ---- Stage 4: Jobs (list, chips, sort, Fields sheet, landscape table) and Status (constraint viewer) ----------- */
  var jobsFilter = 'mine', jobsSort = 0, jobsQuery = '', jobsShown = 50, jobsBuilt = false, jobsTimer = 0, io = null;
  var SORTS = [['score', 'Score ↓'], ['salary', 'Salary ↓'], ['fit', 'Fit ↓'], ['age', 'Age ↑']];
  var FIELDS = [['salary', 'Salary'], ['location', 'Location'], ['fit', 'Fit'], ['flex', 'Flex'], ['age', 'Age'], ['company', 'Company']];
  function fields() { var f = {}; FIELDS.forEach(function (x) { f[x[0]] = true; }); try { var s = JSON.parse(localStorage.getItem('px.mFields') || 'null'); if (s) Object.keys(f).forEach(function (k) { if (typeof s[k] === 'boolean') f[k] = s[k]; }); } catch (e) {} return f; }
  function saveFields(f) { try { localStorage.setItem('px.mFields', JSON.stringify(f)); } catch (e) {} }
  function wide() { return root.innerWidth > 700; }
  function jobsList() {
    var b = B(), q = jobsQuery.trim().toLowerCase(), by = SORTS[jobsSort][0];
    var rows = b.jobsRows(jobsFilter).map(function (r) { return b.view(r); });
    if (q) rows = rows.filter(function (v) { return (v.title + ' ' + v.company + ' ' + v.location).toLowerCase().indexOf(q) >= 0; });
    var key = { score: function (v) { return v.score == null ? -1 : v.score; }, salary: function (v) { return v.salary.top == null ? -1 : v.salary.top; }, fit: function (v) { return v.fit == null ? -1 : v.fit; }, age: function (v) { var a = ageDays(v); return a == null ? -1e9 : -a; } }[by];
    return rows.sort(function (a, c) { return key(c) - key(a) || String(a.id).localeCompare(String(c.id)); });
  }
  function badgeSpan(x) { return x ? '<span class="m-b ' + x[0] + '" aria-label="' + esc(x[2]) + '">' + x[1] + '</span>' : ''; }
  function jobRowHtml(v, f) {
    var bs = badges(v), keep = [f.salary, f.fit, f.flex, f.age];
    var picked = bs.slice(0, 4).filter(function (x, i) { return keep[i]; });
    if (v.bucket === 'APPLIED' || v.applied) picked.push(['ok', gl('ok') + 'Applied', 'Applied']);
    var l2 = [f.company ? v.company : '', f.location ? v.location : ''].filter(Boolean).join(' · ');
    return '<li><button type="button" class="m-row" data-m-open="' + esc(v.id) + '"><span class="m-row-1"><b class="m-title">' + esc(v.title) + '</b>' + scoreHtml(v).replace('<span class="m-label">Score</span>', '') + '</span>' +
      (l2 ? '<span class="m-sub">' + esc(l2) + '</span>' : '') +
      '<span class="m-badges">' + picked.map(badgeSpan).join('') + '</span></button></li>';
  }
  /* In the table the column header names the field, so a cell drops the repeated word: "Fit 46" -> "46",
     "? Age unknown" -> "? unknown". The glyph, colour and the full wording in the label stay. */
  function tableCell(x) { return x && [x[0], x[1].replace(/(Fit|Age|Flex) unknown$/, 'unknown').replace(/(^|>)(~ )?Fit (\d+)$/, '$1$2$3').replace('~ Fit ', '~'), x[2]]; }
  function jobTableHtml(list, f) {
    var cols = [['Title', 1], ['Company', f.company], ['Location', f.location], ['Salary', f.salary], ['Fit', f.fit], ['Flex', f.flex], ['Score', 1], ['Age', f.age]].filter(function (c) { return c[1]; });
    return '<div class="m-table-wrap"><table class="m-table"><thead><tr>' + cols.map(function (c, i) { return '<th scope="col"' + (i === 0 ? ' class="m-sticky"' : '') + '>' + c[0] + '</th>'; }).join('') + '</tr></thead><tbody>' +
      list.map(function (v) {
        var bs = badges(v).map(tableCell), m = { Title: '<button type="button" class="m-link-row" data-m-open="' + esc(v.id) + '"><span class="m-clamp2">' + esc(v.title) + '</span></button>', Company: '<span class="m-clip" title="' + esc(v.company) + '">' + esc(v.company) + '</span>', Location: '<span class="m-clip" title="' + esc(v.location) + '">' + esc(String(v.location).split(/[,;]/)[0]) + '</span>', Salary: badgeSpan(bs[0]), Fit: badgeSpan(bs[1]), Flex: badgeSpan(bs[2]), Score: v.score == null ? '—' : (v.score >= SCORE_OK ? gl('ok') : '') + Math.round(v.score), Age: badgeSpan(bs[3]) };
        return '<tr>' + cols.map(function (c, i) { return i === 0 ? '<th scope="row" class="m-sticky">' + m[c[0]] + '</th>' : '<td' + (c[0] === 'Score' ? ' class="m-num' + (v.score >= SCORE_OK ? ' m-okc' : '') + '"' : '') + '>' + m[c[0]] + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function buildJobs() {
    var p = $('m-pane-jobs');
    p.innerHTML = '<label class="m-search' + (jobsQuery ? ' m-open' : '') + '"><span class="m-sr">Search jobs</span>' + svg('search') + '<input type="search" id="m-q" placeholder="Search title, company, city" autocomplete="off" enterkeyhint="search"></label>' +
      '<div class="m-chips m-jobchips" role="group" aria-label="Jobs filter"><button type="button" class="m-chip" data-m-jf="mine">Mine</button><button type="button" class="m-chip" data-m-jf="applied">Applied</button><button type="button" class="m-chip" data-m-jf="all">All</button>' +
      '<span class="m-label m-jobcount-l" id="m-jobcount-l" aria-hidden="true"></span><span class="m-chip-gap"></span><button type="button" class="m-chip" id="m-sort"></button><button type="button" class="m-chip" id="m-fields-btn" aria-haspopup="dialog">Fields</button></div>' +
      '<p class="m-label m-jobcount" id="m-jobcount" role="status"></p><div id="m-jobs-list"></div>';
    $('m-q').value = jobsQuery;
    $('m-q').addEventListener('blur', function () { if (!$('m-q').value) $('m-q').parentNode.classList.remove('m-open'); });
    $('m-q').addEventListener('input', function () { clearTimeout(jobsTimer); jobsTimer = setTimeout(function () { jobsQuery = $('m-q').value; jobsShown = 50; paintJobs(); }, 150); });
    p.querySelectorAll('[data-m-jf]').forEach(function (b) { b.onclick = function () { jobsFilter = b.getAttribute('data-m-jf'); jobsShown = 50; paintJobs(); }; });
    $('m-sort').onclick = function () { jobsSort = (jobsSort + 1) % SORTS.length; paintJobs(); };
    $('m-fields-btn').onclick = openFields;
    jobsBuilt = true;
  }
  function paintJobs() {
    if (!jobsBuilt) buildJobs();
    var f = fields(), list = jobsList(), shown = list.slice(0, jobsShown), box = $('m-jobs-list');
    document.querySelectorAll('[data-m-jf]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-m-jf') === jobsFilter)); });
    $('m-sort').textContent = SORTS[jobsSort][1]; $('m-sort').setAttribute('aria-label', 'Sort: ' + SORTS[jobsSort][1] + '. Tap for the next sort.');
    $('m-jobcount').textContent = $('m-jobcount-l').textContent = list.length + (list.length === 1 ? ' job' : ' jobs') + (jobsQuery ? ' match' : '');
    if (!list.length) { if (io) { io.disconnect(); io = null; } setHtml(box, '<p class="m-empty-line">No jobs match.</p>'); return; }
    if (!setHtml(box, wide() ? jobTableHtml(list, f) : '<ul class="m-rows">' + shown.map(function (v) { return jobRowHtml(v, f); }).join('') + '</ul>' +
      (shown.length < list.length ? '<div class="m-more-rows" id="m-more-rows"><button type="button" class="m-btn m-quiet">Show more · ' + (list.length - shown.length) + ' left</button></div>' : ''))) return;
    if (io) { io.disconnect(); io = null; }   // only a real repaint replaces the Show more row the observer watches
    box.querySelectorAll('[data-m-open]').forEach(function (b) { b.onclick = function () { openDetail(b.getAttribute('data-m-open')); }; });
    var more = $('m-more-rows');
    if (more) {
      more.querySelector('button').onclick = function () { jobsShown += 50; paintJobs(); };
      if (root.IntersectionObserver) { io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); io = null; jobsShown += 50; paintJobs(); } }, { rootMargin: '400px' }); io.observe(more); }
    }
  }
  function renderJobs(loaded) {
    if (!loaded) { $('m-pane-jobs').innerHTML = skeleton(); jobsBuilt = false; return; }
    var a = document.activeElement, typing = a && a.id === 'm-q'; paintJobs(); if (typing) $('m-q').focus();
  }

  /* Fields sheet: which details the Jobs rows and table show; kept on this device. */
  function openFields() {
    var f = fields(), s = $('m-fields');
    s.innerHTML = '<div class="m-grab" aria-hidden="true"></div><div class="m-sheet-h"><b>Fields</b><span class="m-label">Shown in Jobs</span><button type="button" class="m-ic m-x" id="m-fields-x" aria-label="Close">' + svg('close') + '</button></div><ul class="m-list">' +
      FIELDS.map(function (x) { return '<li><button type="button" class="m-toggle" role="switch" aria-checked="' + f[x[0]] + '" data-m-field="' + x[0] + '"><b>' + x[1] + '</b><i aria-hidden="true"></i></button></li>'; }).join('') + '</ul>';
    lastFocus = document.activeElement; s.hidden = false; $('m-scrim').hidden = false;
    s.querySelectorAll('[data-m-field]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-m-field'), g = fields(); g[k] = !g[k]; saveFields(g); b.setAttribute('aria-checked', String(g[k])); paintJobs(); }; });
    $('m-fields-x').onclick = closeFields; s.querySelector('[data-m-field]').focus();
  }
  function closeFields() { var s = $('m-fields'); if (!s || s.hidden) return false; s.hidden = true; $('m-scrim').hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); return true; }

  /* Status: the constraint viewer as a vertical flow; a stage that becomes the constraint gets a 250ms highlight ring. */
  var lastConstraint = null;
  function n$(n) { return n == null ? null : Number(n).toLocaleString('en-US'); }
  function renderStatus(loaded) {
    var p = $('m-pane-status'); if (!loaded) { p.innerHTML = skeleton(); return; }
    var b = B(), s = b.status(), h = b.health();
    if (!s || s.error) { p.innerHTML = '<p class="m-label m-sec-l">Pipeline constraint</p><p class="m-alert m-caution-note">' + gl('caution') + 'Pipeline evidence is not available yet' + (s && s.error ? ' · ' + esc(s.error) : '') + '.</p>'; return; }
    var ci = s.stages.map(function (x, i) { return x.constraint ? i : -1; }).filter(function (i) { return i >= 0; }).join(',');
    var moved = lastConstraint !== null && ci !== lastConstraint && ci !== ''; lastConstraint = ci;
    var flow = s.stages.map(function (st, i) {
      var state = st.manual ? ['', '', 'Manual'] : st.constraint ? ['attn', gl('warn'), 'Constraint'] : st.perHour == null ? ['caution', gl('caution'), 'Unknown'] : ['ok', gl('ok'), 'OK'];
      var card = '<li class="m-stage' + (st.constraint ? ' m-constraint m-brackets' : '') + (st.constraint && moved ? ' m-flash' : '') + '"><span class="m-stage-n m-num">0' + (i + 1) + '</span><div class="m-stage-t"><b>' + esc(st.name) + '</b><span class="m-stage-r m-num">' +
        (st.manual ? 'You decide' : st.perHour == null ? 'Rate not measured' : (st.partial?'≥ ':'')+(Math.round(st.perHour * 10) / 10) + ' '+esc(st.unit||'jobs/hr')+(st.partial?' · observed minimum':'')) + '</span></div><span class="m-stage-s ' + state[0] + '">' + state[1] + state[2] + '</span></li>';
      if (i >= 3) return card;
      var w = s.waiting[i];
      return card + '<li class="m-wait"><span class="m-num' + (w.count == null ? ' m-cau' : '') + '">' + (w.count == null ? gl('caution') + 'Waiting unknown' : (w.partial ? '≥ ' : '') + n$(w.count) + (i===0?' candidates in discovery backlog':' waiting')) + '</span>'+(i===0&&w.breakdown?'<small>'+n$(w.breakdown.screening)+' need screening · '+n$(w.breakdown.held)+' held</small>':'')+'</li>';
    }).join('');
    function tile(label, v) { return '<div class="m-tile"><b class="m-num">' + (v == null ? '—' : n$(v)) + '</b><span class="m-label">' + label + '</span></div>'; }
    var hs = h.state === 'OK' ? ['ok', gl('ok'), 'SYS OK'] : h.state === 'FAULT' ? ['fault', gl('no'), 'SYS FAULT'] : h.state === 'DELAYED' ? ['caution', gl('caution'), 'SYS DELAYED'] : ['', '', 'SYS …'];
    var sync = h.lastRead ? new Date(h.lastRead).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ET' : 'unknown';
    setHtml(p, '<p class="m-label m-sec-l">Pipeline constraint</p><ol class="m-flow" aria-label="Pipeline stages">' + flow + '</ol>' +
      '<p class="m-cr-note">' + esc(s.constraintReason) + '</p>' +
      '<div class="m-tiles">' + tile('Need decision', queueState().view === 'unavailable' ? null : b.decideRows().length) + tile('Applied', s.applied) + tile('Interviews', s.interviews) + '</div>' +
      '<ul class="m-legend" aria-label="Legend"><li class="ok">' + gl('ok') + 'OK</li><li class="caution">' + gl('caution') + 'Caution</li><li class="attn">' + gl('warn') + 'Constraint</li><li class="fault">' + gl('no') + 'Fault</li></ul>' +
      '<p class="m-fresh ' + hs[0] + '">' + hs[1] + hs[2] + ' · SYNC ' + esc(sync) + (h.writer === false ? ' · ' + gl('warn') + 'NO WRITER' : '') + '</p>' +
      (s.details ? '<details class="m-sec"><summary>Details</summary><div class="m-sec-b"><p>' + esc(s.details) + '</p></div></details>' : ''));
  }

  /* More sheet: a bottom sheet over a scrim; Escape or the scrim closes it. */
  var lastFocus = null;
  function sheet(open) {
    var s = $('m-more-sheet'), sc = $('m-scrim'), btn = $('m-more');
    if (!s) return;
    if (open) { lastFocus = document.activeElement; s.hidden = false; sc.hidden = false; btn.setAttribute('aria-expanded', 'true'); var f = s.querySelector('button'); if (f) f.focus(); }
    else if (!s.hidden) { s.hidden = true; sc.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  }

  /* A desktop view opens the existing cockpit view full screen; "Mobile" returns to the shell. */
  function openDesktop(k) {
    sheet(false); var b = B(); if (!b) return;
    d.classList.add('m-legacy'); $('m-return').hidden = false; b.openDesktop(k); root.scrollTo(0, 0);
  }
  function closeDesktop() { d.classList.remove('m-legacy'); $('m-return').hidden = true; setTab(tab); refresh(); }

  function showHeader(on) { var h = $('m-hd'); if (h) h.classList.toggle('m-hide', !on); }
  function onScroll() {
    var y = root.scrollY || 0;
    if (y > 60 && y > lastY + 2) showHeader(false); else if (y < lastY - 2 || y <= 60) showHeader(true);
    lastY = y;
  }

  function bind() {
    document.querySelectorAll('[data-m-tab]').forEach(function (b) { b.onclick = function () { setTab(b.getAttribute('data-m-tab')); }; });
    document.querySelector('.m-tabs').addEventListener('keydown', function (e) {
      var i = TABS.map(function (x) { return x[0]; }).indexOf(tab), n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!n) return; e.preventDefault(); var t = TABS[(i + n + TABS.length) % TABS.length][0]; setTab(t); $('m-tab-' + t).focus();
    });
    $('m-sys').onclick = function () { setTab('status'); };
    $('m-search').onclick = function () { setTab('jobs', true); };
    $('m-more').onclick = function () { sheet(true); };
    $('m-scrim').onclick = function () { sheet(false); closeFields(); };
    $('m-more-x').onclick = function () { sheet(false); };
    $('m-return').onclick = closeDesktop;
    document.querySelectorAll('[data-m-desk]').forEach(function (b) { b.onclick = function () { openDesktop(b.getAttribute('data-m-desk')); }; });
    var lay = document.querySelector('[data-m-layout]');
    if (lay) lay.onclick = function () { try { localStorage.setItem('px.layout', 'desktop'); } catch (e) {} location.reload(); };
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !d.classList.contains('m-shell')) return;
      if (!$('m-more-sheet').hidden) sheet(false); else if (closeFields()) return; else if (detailId) closeDetail(); else if (menuFor) { menuFor = null; refresh(); }
    });
    root.addEventListener('popstate', function () { if (detailId) closeDetail('pop'); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || !d.classList.contains('m-shell')) return;
      var box = ['m-more-sheet', 'm-fields', 'm-detail'].map($).filter(function (x) { return x && !x.hidden; })[0]; if (!box) return;
      var f = [].filter.call(box.querySelectorAll('button,a[href],input,summary,[tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled && x.getClientRects().length; });
      if (!f.length) return; var first = f[0], last = f[f.length - 1];
      if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    root.addEventListener('scroll', onScroll, { passive: true });
  }

  function mount() {
    if (mounted) return;
    var el = document.createElement('div'); el.id = 'm-root'; el.className = 'm-texture'; el.innerHTML = shellHtml();
    document.body.appendChild(el); mounted = true; bind(); setTab('decide'); refresh();
    root.setInterval(renderSys, 15000);
    root.setInterval(function () { if ((tab === 'status' || tab === 'decide') && !document.hidden && !d.classList.contains('m-legacy')) refresh(); }, 5000);   // the health monitor updates on its own clock
  }

  /* Crossing the breakpoint (rotation, window resize) switches shells without a reload. */
  function sync() {
    if (d.classList.contains('force-desktop')) return;
    var on = root.matchMedia(Q).matches; d.classList.toggle('m-shell', on);
    if (on) mount(); else { d.classList.remove('m-legacy'); sheet(false); }
  }
  if (!d.classList.contains('force-desktop')) {
    var mq = root.matchMedia(Q);
    if (mq.addEventListener) mq.addEventListener('change', sync); else if (mq.addListener) mq.addListener(sync);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
  }

  root.PEMobile = { refresh: refresh, setTab: setTab, query: Q };
})(typeof window !== 'undefined' ? window : globalThis);
