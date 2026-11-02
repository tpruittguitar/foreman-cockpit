/* Mobile shell (Tim 2026-11-02; handoff "pipeline-explorer-mobile-handoff", Stage 2 approved by Grok Bot GUI).
   Phones only: html.m-shell is set in the page head at <= 767px, or on a landscape phone (<= 932 x 520, coarse pointer).
   The desktop app keeps running underneath (data, Writer, rulings) and is hidden; this shell reads it through
   window.PEMobileBridge (pipeline.html) and never changes data, endpoints or the desktop layout.
   Stage 2: header with system readout, Decide / Jobs / Status tabs, More sheet (desktop views), header hide on scroll.
   Decide, Jobs and Status content arrive in Stages 3 and 4. */
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
    loading: '<circle cx="12" cy="12" r="1.6"/>'
  };
  function svg(k, size) { size = size || 22; return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (size < 20 ? 2.4 : 1.6) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + '</svg>'; }

  var MORE = [
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
      '<button type="button" class="m-return" id="m-return" hidden>' + svg('back') + '<span>Mobile</span></button>';
  }

  function placeholder(name, stage) {
    return '<div class="m-empty"><p class="m-label">' + esc(name) + '</p><p>Arrives in Stage ' + stage + '.</p></div>';
  }

  function setTab(t, focusSearch) {
    tab = t;
    TABS.forEach(function (x) {
      var b = $('m-tab-' + x[0]), p = $('m-pane-' + x[0]);
      b.setAttribute('aria-selected', String(x[0] === t)); b.tabIndex = x[0] === t ? 0 : -1; p.hidden = x[0] !== t;
    });
    showHeader(true); root.scrollTo(0, 0);
    if (focusSearch) { var s = document.querySelector('#m-pane-jobs input[type=search]'); if (s) s.focus(); }
  }

  /* Header readout: one square dot and one word. Tap opens Status. */
  function renderSys() {
    var b = B(), h = b && b.health ? b.health() : { state: 'LOADING' };
    var word = { OK: 'SYS OK', DELAYED: 'SYS DELAYED', FAULT: 'SYS FAULT', LOADING: 'SYS …' }[h.state] || 'SYS …';
    var el = $('m-sys'); if (!el) return;
    var k = { OK: 'ok', DELAYED: 'delayed', FAULT: 'fault' }[h.state] || 'loading';
    el.className = 'm-sys m-' + k; $('m-sys-word').textContent = word; $('m-sys-ic').innerHTML = svg(k, 14);
    el.setAttribute('aria-label', 'System status: ' + word.replace('SYS ', '').toLowerCase() + '. Open Status.');
  }

  function refresh() {
    if (!mounted || raf) return;
    raf = root.requestAnimationFrame(function () {
      raf = 0; renderSys();
      var b = B(), loaded = b && b.ready();
      $('m-pane-decide').innerHTML = loaded ? placeholder('Decide', 3) : skeleton();
      $('m-pane-jobs').innerHTML = loaded ? placeholder('Jobs', 4) : skeleton();
      $('m-pane-status').innerHTML = loaded ? placeholder('Status', 4) : skeleton();
    });
  }
  function skeleton() { return '<div class="m-skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i></div>'; }

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
    $('m-scrim').onclick = function () { sheet(false); };
    $('m-more-x').onclick = function () { sheet(false); };
    $('m-return').onclick = closeDesktop;
    document.querySelectorAll('[data-m-desk]').forEach(function (b) { b.onclick = function () { openDesktop(b.getAttribute('data-m-desk')); }; });
    var lay = document.querySelector('[data-m-layout]');
    if (lay) lay.onclick = function () { try { localStorage.setItem('px.layout', 'desktop'); } catch (e) {} location.reload(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && d.classList.contains('m-shell')) sheet(false); });
    root.addEventListener('scroll', onScroll, { passive: true });
  }

  function mount() {
    if (mounted) return;
    var el = document.createElement('div'); el.id = 'm-root'; el.className = 'm-texture'; el.innerHTML = shellHtml();
    document.body.appendChild(el); mounted = true; bind(); setTab('decide'); refresh();
    root.setInterval(renderSys, 15000);
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
