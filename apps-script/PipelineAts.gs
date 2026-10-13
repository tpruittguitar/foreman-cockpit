/* ATS liveness checker: confirms postings straight from the employer's ATS public API, with no AI tokens.
   Pure functions below (Node-testable): detect a row's ATS from its stored URLs, build the API request, read the
   response, and turn it into ENRICH fields. Apps Script glue (runAtsCheck_) at the bottom fetches with UrlFetchApp and
   drops ONE batch ENRICH file into WRITER_QUEUE, so every write goes through the normal Writer path (identity, receipts,
   independent verification). The checker never changes BUCKET or DISPOSITION and never writes CLOSED from a failed
   fetch: an error, block, title mismatch or ambiguous answer only records ATS_CHECK_* and leaves LIVENESS alone, so the
   row stays on the AI posting-validation worklist.
   Proven providers (executed 2026-10-13): Workday CXS, Greenhouse boards-api, Lever postings, Ashby posting-api,
   Oracle HCM REST. Positive-only providers (endpoint documented, a miss never closes): SmartRecruiters, BambooHR.
   Authority: Tim 2026-10-13 "Implement everything else" (verification integration plan items 1, 2, 4, 5).
   TinyFish fallback (Tim 2026-10-13 17:46 ET "Yes" to the Writer option; control TINYFISH VERIFICATION AMENDMENT): Workday answers
   403 to Google's servers, so Workday rows are read through TinyFish's free Fetch API (rendered page, TinyFish servers) when the
   script property TINYFISH_API_KEY is set. A stored URL without the requisition token is resolved through the site's own search. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PipelineAts = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DAY = 86400000;
  var ACTIVE = ['SCOUT_INTAKE', 'DISCOVERY_LEAD', 'TIM_DECISION_REQUIRED', 'BLOCKED', 'MANUAL_RESEARCH', 'READY_TO_PURSUE'];
  var PRIORITY = { READY_TO_PURSUE: 0, MANUAL_RESEARCH: 1, TIM_DECISION_REQUIRED: 1, BLOCKED: 2, SCOUT_INTAKE: 3, DISCOVERY_LEAD: 4 };
  var URL_KEYS = ['ATS_POSTING_URL', 'COMPANY_SOURCE_URL', 'SOURCE_URL', 'LIVENESS_EVIDENCE_URL', 'EMPLOYER_REQ_ID_EVIDENCE_URL', 'CLAUDE_CANDIDATE_EMPLOYER_URL', 'CLAUDE_CANDIDATE_EVIDENCE_URL', 'CANDIDATE_COMPANY_SOURCE_URL', 'GROK_VERIFIED_URL', 'INITIATING_URL', 'SOURCE', 'DEGREE_EVIDENCE_URL', 'SALARY_EVIDENCE_URL'];
  var DECISIVE = ['WORKDAY', 'GREENHOUSE', 'LEVER', 'ASHBY', 'ORACLE_HCM'];   // a 404/closed answer from these may set a CLOSED liveness
  var RECHECK_LIVE_DAYS = 3, RECHECK_OTHER_DAYS = 1, BATCH_LIMIT = 25;
  var TITLE_STOP = { of: 1, and: 1, the: 1, a: 1, an: 1, sr: 1, senior: 1, jr: 1, i: 1, ii: 1, iii: 1, to: 1, for: 1, in: 1, at: 1 };

  function enc(s) { return encodeURIComponent(s); }
  function urlsIn(text) { var out = []; String(text || '').replace(/https?:\/\/[^\s"<>|;,]+/gi, function (u) { out.push(u.replace(/[).\]]+$/, '')); }); return out; }

  /** One URL -> { provider, api, jobId, board, url } or null. Never invents a host or slug: everything comes from the URL. */
  function detectUrl(u) {
    var m, url = String(u || '').trim();
    if (!url) return null;
    // Workday: already-CXS form, or a public job URL with optional locale segment.
    if ((m = url.match(/^https?:\/\/([a-z0-9-]+\.wd\d+\.myworkdayjobs\.com)\/wday\/cxs\/([^\/?#]+)\/([^\/?#]+)\/job\/([^?#]+)/i)))
      return { provider: 'WORKDAY', api: 'https://' + m[1] + '/wday/cxs/' + m[2] + '/' + m[3] + '/job/' + m[4], jobId: lastSeg(m[4]), url: url };
    if ((m = url.match(/^https?:\/\/(([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com)\/(?:[a-z]{2}-[A-Z]{2}\/)?([^\/?#]+)\/(?:job|details)\/([^?#]+)/i)))
      return { provider: 'WORKDAY', api: 'https://' + m[1] + '/wday/cxs/' + m[2] + '/' + m[3] + '/job/' + m[4].replace(/\/(apply.*)$/i, ''), jobId: lastSeg(m[4]), url: url };
    // Greenhouse: board URL, API URL, or embed with for=&token=.
    if ((m = url.match(/^https?:\/\/(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/([^\/?#]+)\/jobs\/(\d{5,})/i)) && m[1].toLowerCase() !== 'embed')
      return { provider: 'GREENHOUSE', api: 'https://boards-api.greenhouse.io/v1/boards/' + m[1] + '/jobs/' + m[2] + '?pay_transparency=true', jobId: m[2], board: m[1], url: url };
    if ((m = url.match(/^https?:\/\/boards-api\.greenhouse\.io\/v1\/boards\/([^\/?#]+)\/jobs\/(\d{5,})/i)))
      return { provider: 'GREENHOUSE', api: 'https://boards-api.greenhouse.io/v1/boards/' + m[1] + '/jobs/' + m[2] + '?pay_transparency=true', jobId: m[2], board: m[1], url: url };
    if (/greenhouse\.io\/embed\//i.test(url) && (m = url.match(/[?&]for=([^&#]+)/)) && /[?&]token=(\d{5,})/.test(url)) {
      var tok = url.match(/[?&]token=(\d{5,})/)[1];
      return { provider: 'GREENHOUSE', api: 'https://boards-api.greenhouse.io/v1/boards/' + m[1] + '/jobs/' + tok + '?pay_transparency=true', jobId: tok, board: m[1], url: url };
    }
    // Lever.
    if ((m = url.match(/^https?:\/\/(?:jobs(?:\.eu)?\.lever\.co|api\.lever\.co\/v0\/postings)\/([^\/?#]+)\/([0-9a-f]{8}-[0-9a-f-]{27,})/i)))
      return { provider: 'LEVER', api: 'https://api.lever.co/v0/postings/' + m[1] + '/' + m[2], jobId: m[2].toLowerCase(), board: m[1], url: url };
    // Ashby: the public board list (one call per board) carries every listed posting with compensation.
    if ((m = url.match(/^https?:\/\/jobs\.ashbyhq\.com\/([^\/?#]+)\/([0-9a-f]{8}-[0-9a-f-]{27,})/i)))
      return { provider: 'ASHBY', api: 'https://api.ashbyhq.com/posting-api/job-board/' + m[1] + '?includeCompensation=true', jobId: m[2].toLowerCase(), board: m[1], url: url };
    // Oracle HCM: REST URL as stored, or a Candidate Experience URL whose site is a CX_n code (a named site cannot be mapped).
    if (/\/hcmRestApi\/resources\/[^\/]+\/recruitingCEJobRequisitionDetails/i.test(url) && (m = url.match(/Id%3D%22(\d+)%22|Id="(\d+)"/i)))
      return { provider: 'ORACLE_HCM', api: url, jobId: m[1] || m[2], url: url };
    if ((m = url.match(/^https?:\/\/([a-z0-9.-]+\.oraclecloud\.com|apply\.[a-z0-9.-]+)\/(?:hcmUI\/CandidateExperience\/)?[a-z]{2}(?:-[A-Z]{2})?\/sites\/(CX_?\d+)\/(?:job|jobs\/preview|requisitions\/preview)\/(\d+)/i)))
      return { provider: 'ORACLE_HCM', api: 'https://' + m[1] + '/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=' + enc('ById;Id="' + m[3] + '",siteNumber=' + m[2]), jobId: m[3], url: url };
    // SmartRecruiters (positive-only).
    if ((m = url.match(/^https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([^\/?#]+)\/(\d{6,})/i)) || (m = url.match(/^https?:\/\/api\.smartrecruiters\.com\/v1\/companies\/([^\/?#]+)\/postings\/(\d{6,})/i)))
      return { provider: 'SMARTRECRUITERS', api: 'https://api.smartrecruiters.com/v1/companies/' + m[1] + '/postings/' + m[2], jobId: m[2], board: m[1], url: url };
    // BambooHR (positive-only, list has no description).
    if ((m = url.match(/^https?:\/\/([a-z0-9-]+)\.bamboohr\.com\/(?:careers|jobs)\/(?:view\.php\?id=)?(\d+)/i)))
      return { provider: 'BAMBOOHR', api: 'https://' + m[1] + '.bamboohr.com/careers/list', jobId: m[2], board: m[1], url: url };
    return null;
  }
  function lastSeg(p) { var s = String(p || '').split('/').filter(Boolean); return s.length ? s[s.length - 1] : ''; }

  /** First detectable ATS URL on the row, in URL_KEYS priority order, then any other URL in the payload. */
  function detect(p) {
    p = p || {};
    var seen = {}, order = URL_KEYS.concat(Object.keys(p));
    for (var i = 0; i < order.length; i++) {
      var k = order[i]; if (seen[k] || p[k] === undefined) continue; seen[k] = true;
      var us = urlsIn(p[k]);
      for (var j = 0; j < us.length; j++) { var d = detectUrl(us[j]); if (d) { d.fromKey = k; return d; } }
    }
    return null;
  }

  function val(p, k) { var v = p[k]; return v === undefined ? '' : String(v).trim(); }
  function dateMs(s) { var m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : 0; }
  function workable(r) { return ACTIVE.indexOf(r.BUCKET) >= 0 && !/^YES/i.test(val(r.p, 'ANTI_RESURRECTION')) && !val(r.p, 'DO_NOT_REWORK'); }
  function due(r, now) {
    var last = dateMs(val(r.p, 'ATS_CHECK_ASOF'));
    if (!last) return true;
    var days = /^LIVE/.test(val(r.p, 'ATS_CHECK_RESULT')) ? RECHECK_LIVE_DAYS : RECHECK_OTHER_DAYS;
    return now - last >= days * DAY;
  }

  /** Rows the checker owns this run: active, ATS-detectable, due. Never-checked first, then by bucket priority and oldest check. */
  function select(rows, opts) {
    opts = opts || {};
    var now = opts.now ? Date.parse(opts.now) : Date.now(), limit = opts.limit || BATCH_LIMIT, out = [];
    rows.forEach(function (r) { if (!workable(r)) return; var d = detect(r.p); if (d && due(r, now)) out.push({ row: r, target: d }); });
    out.sort(function (a, b) {
      var ca = dateMs(val(a.row.p, 'ATS_CHECK_ASOF')), cb = dateMs(val(b.row.p, 'ATS_CHECK_ASOF'));
      if (!ca !== !cb) return ca ? 1 : -1;
      var pa = PRIORITY[a.row.BUCKET] !== undefined ? PRIORITY[a.row.BUCKET] : 9, pb = PRIORITY[b.row.BUCKET] !== undefined ? PRIORITY[b.row.BUCKET] : 9;
      return pa - pb || ca - cb || b.row.INV_NUM - a.row.INV_NUM;
    });
    return out.slice(0, limit);
  }

  /** True when the checker will handle this row itself (AI posting-validation skips it until the checker reports residue). */
  function ownedByChecker(p) {
    if (!detect(p)) return false;
    var res = val(p, 'ATS_CHECK_RESULT');
    return !res || /^(LIVE|CLOSED)/.test(res);
  }

  /* ---------- response reading ---------- */
  var NAMED = { lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: '-', mdash: '-', bull: '-', hellip: '...' };
  function decodeEntities(s) {
    return String(s || '').replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&([a-z]+);/gi, function (m, n) { return NAMED[n.toLowerCase()] !== undefined ? NAMED[n.toLowerCase()] : (n.toLowerCase() === 'amp' ? '&' : m); }).replace(/[\u2018\u2019]/g, "'");
  }
  function plain(html) { return decodeEntities(decodeEntities(String(html || ''))).replace(/<\s*(br|\/p|\/li|\/div|\/h\d|li)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t ]+/g, ' ').replace(/\n\s*/g, '\n').trim(); }
  var MONEY = '\\$\\s?(\\d{2,3}(?:,\\d{3})+(?:\\.\\d{2})?|\\d{2,3}(?:\\.\\d+)?\\s?[kK])';
  var RANGE_RE = new RegExp(MONEY + '\\s*(?:USD\\s*)?(?:-|–|—|to)\\s*' + MONEY.replace('\\$', '\\$?'), 'g');
  function money(t) { var s = String(t).replace(/\s/g, ''), k = /k$/i.test(s); var n = parseFloat(s.replace(/[,kK$]/g, '')); return k ? n * 1000 : n; }
  function fmt(n) { return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /** Exactly one plausible annual base range in the text, or null. Ambiguous or malformed text is never guessed. */
  function payFromText(text) {
    var found = {}, list = [], m;
    RANGE_RE.lastIndex = 0;
    while ((m = RANGE_RE.exec(String(text || '')))) {
      var lo = money(m[1]), hi = money(m[2]);
      if (!(lo >= 50000 && hi > lo && hi <= 2000000 && hi / lo <= 3)) continue;
      var key = lo + '-' + hi; if (!found[key]) { found[key] = 1; list.push({ low: lo, high: hi }); }
    }
    return list.length === 1 ? list[0] : null;
  }
  var DEGREE_RE = /\b(bachelor'?s?|bachelors|degree|b\.?s\.?c?\.?|b\.?a\.?|m\.?b\.?a\.?|master'?s)\b/i;
  /** The first requirement line that mentions a degree, verbatim (trimmed), or ''. */
  function degreeFromText(text) {
    var lines = String(text || '').split(/\n|[.;]\s+(?=[A-Z])/);
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].replace(/^[\s•\-–*]+/, '').trim();
      if (l.length >= 12 && l.length <= 400 && DEGREE_RE.test(l) && !/\b(ms office|ms excel|ms word|ms project)\b/i.test(l)) return l;
    }
    return '';
  }
  function titleOk(rowTitle, apiTitle) {
    if (!apiTitle) return true;
    var toks = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) { return w.length > 1 && TITLE_STOP[w] !== 1; }); };
    var a = toks(rowTitle).filter(function (w) { return !/^(identity|unresolved)$/.test(w); }), b = toks(apiTitle);
    if (!a.length || !b.length) return true;
    var hit = a.filter(function (w) { return b.indexOf(w) >= 0; }).length;
    return hit / Math.min(a.length, b.length) >= 0.5;
  }
  function parseJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  /** HTTP answer -> { result, liveness, title, postedAt, pay:{low,high}|null, payText, degree } (result: LIVE | CLOSED | NOT_IN_PUBLIC_BOARD | TITLE_MISMATCH | ERROR_<code> | UNREADABLE). */
  function interpret(target, code, body, row, opts) {
    opts = opts || {};
    var now = opts.now ? Date.parse(opts.now) : Date.now(), P = target.provider, j = parseJson(body), out = { provider: P };
    function closed(liveness) { out.result = 'CLOSED'; out.liveness = liveness; return out; }
    if (code === 404 || code === 410) {
      // A per-posting 404 from a proven per-posting endpoint means the posting is gone. Board-level or untested endpoints never close a row.
      if (P === 'WORKDAY' || P === 'GREENHOUSE' || P === 'LEVER') return closed('CLOSED_EMPLOYER_404');
      out.result = 'NOT_FOUND_' + code; return out;
    }
    if (code !== 200) { out.result = 'ERROR_' + (code || 'FETCH'); return out; }
    if (!j) { out.result = 'UNREADABLE'; return out; }
    var text = '', title = '', postedAt = '', pay = null;
    if (P === 'WORKDAY') {
      var w = j.jobPostingInfo; if (!w) { out.result = 'UNREADABLE'; return out; }
      title = w.title; postedAt = w.startDate || ''; text = plain(w.jobDescription);
      if (w.posted === false || w.canApply === false) { out.title = title; return closed('CLOSED_EMPLOYER_ATS'); }
    } else if (P === 'GREENHOUSE') {
      if (!j.id) { out.result = 'UNREADABLE'; return out; }
      title = j.title; postedAt = j.first_published || j.updated_at || ''; text = plain(j.content);
      var pr = (j.pay_input_ranges || []).filter(function (x) { return x && x.min_cents && x.max_cents && (!x.currency_type || x.currency_type === 'USD'); });
      if (pr.length === 1) pay = { low: pr[0].min_cents / 100, high: pr[0].max_cents / 100 };
    } else if (P === 'LEVER') {
      if (!j.id) { out.result = 'UNREADABLE'; return out; }
      title = j.text; postedAt = j.createdAt ? new Date(j.createdAt).toISOString() : '';
      text = [j.descriptionPlain || plain(j.description)].concat((j.lists || []).map(function (l) { return (l.text || '') + '\n' + plain(l.content); })).concat([j.additionalPlain || '']).join('\n');
      var sr = j.salaryRange; if (sr && sr.min && sr.max && (!sr.currency || sr.currency === 'USD') && /year/i.test(sr.interval || 'year')) pay = { low: sr.min, high: sr.max };
    } else if (P === 'ASHBY') {
      var jobs = j.jobs || [], hit = null;
      for (var i = 0; i < jobs.length; i++) if (String(jobs[i].id).toLowerCase() === target.jobId) { hit = jobs[i]; break; }
      if (!hit) { out.result = 'NOT_IN_PUBLIC_BOARD'; return out; }
      title = hit.title; postedAt = hit.publishedAt || ''; text = hit.descriptionPlain || plain(hit.descriptionHtml);
      var comp = (hit.compensation && hit.compensation.summaryComponents || []).filter(function (c) { return c.compensationType === 'Salary' && /YEAR/i.test(c.interval || '') && (!c.currencyCode || c.currencyCode === 'USD') && c.minValue && c.maxValue; });
      if (comp.length === 1) pay = { low: comp[0].minValue, high: comp[0].maxValue };
    } else if (P === 'ORACLE_HCM') {
      var it = (j.items || [])[0]; if (!it) { out.result = 'NOT_IN_PUBLIC_BOARD'; return out; }
      title = it.Title; postedAt = it.ExternalPostedStartDate || '';
      text = [it.ExternalDescriptionStr, it.ExternalQualificationsStr, it.ExternalResponsibilitiesStr].map(plain).join('\n');
      if (it.ExternalPostedEndDate && Date.parse(it.ExternalPostedEndDate) < now) { out.title = title; return closed('CLOSED_EMPLOYER_ATS'); }
    } else if (P === 'SMARTRECRUITERS') {
      if (!j.id || j.active === false) { out.result = 'UNREADABLE'; return out; }
      title = j.name; postedAt = j.releasedDate || '';
      var sec = j.jobAd && j.jobAd.sections || {}; text = Object.keys(sec).map(function (k) { return plain(sec[k] && sec[k].text); }).join('\n');
    } else if (P === 'BAMBOOHR') {
      var res = j.result || [], b = null;
      for (var q = 0; q < res.length; q++) if (String(res[q].id) === String(target.jobId)) { b = res[q]; break; }
      if (!b) { out.result = 'NOT_IN_PUBLIC_BOARD'; return out; }
      title = b.jobOpeningName;
    } else { out.result = 'UNREADABLE'; return out; }
    out.title = title || ''; out.postedAt = postedAt;
    if (!titleOk(row && row.TITLE, title)) { out.result = 'TITLE_MISMATCH'; return out; }
    out.result = 'LIVE'; out.liveness = 'LIVE_EMPLOYER_ATS';
    out.pay = pay || payFromText(text);
    out.payFromText = !pay && !!out.pay;
    out.degree = degreeFromText(text);
    return out;
  }

  function degreeKnown(p) {
    var r = val(p, 'DEGREE_REQ'); if (r && !/^(UNKNOWN|UNVERIFIED|TBD|N\/A|NONE|-)\b/i.test(r)) return true;
    var t = val(p, 'DEGREE_TEXT'); return !!t && !/\b(alert|email|snippet)\b|^(unknown|not available|n\/a)/i.test(t);
  }
  /** ENRICH fields for one checked row. Liveness fields only on LIVE/CLOSED; pay/degree only on LIVE. */
  function fieldsFor(row, target, r, opts) {
    opts = opts || {};
    var at = opts.now || new Date().toISOString(), d = at.slice(0, 10), f = { ATS_PROVIDER: target.provider, ATS_CHECK_ASOF: at, ATS_CHECK_RESULT: r.result, ATS_POSTING_URL: target.url };
    if (r.result !== 'LIVE' && r.result !== 'CLOSED') return f;
    f.LIVENESS = r.liveness; f.LIVENESS_ASOF = d; f.LIVENESS_METHOD = 'ATS_API:' + target.provider; f.LIVENESS_EVIDENCE_URL = target.api;
    if (r.postedAt) f.ATS_POSTED_AT = String(r.postedAt).slice(0, 10);
    if (r.result !== 'LIVE') return f;
    if (r.pay) { f.PAY_POSTED = fmt(r.pay.low) + ' - ' + fmt(r.pay.high); f.PAY_POSTED_SOURCE = 'Employer ATS ' + target.provider + (r.payFromText ? ' posting text' : ' structured pay field'); f.PAY_POSTED_ASOF = d; }
    if (r.degree) { f.ATS_DEGREE_TEXT = r.degree.slice(0, 400); if (!degreeKnown(row.p)) { f.DEGREE_TEXT = f.ATS_DEGREE_TEXT; f.DEGREE_EVIDENCE_URL = target.url; f.DEGREE_ASOF = d; } }
    return f;
  }


  /* ---------- TinyFish fallback for Workday (pure) ---------- */
  var TF_NOT_FOUND_RE = /page you are looking for doesn.t exist/i;
  /** { host, site, path, url } of the public Workday job URL behind a WORKDAY target, or null. */
  function wdParts(target) {
    var m = String(target && target.api || '').match(/^https:\/\/([^\/]+)\/wday\/cxs\/[^\/]+\/([^\/]+)\/job\/([^?#]+)$/);
    return m ? { host: m[1], site: m[2], path: m[3], url: 'https://' + m[1] + '/' + m[2] + '/job/' + m[3] } : null;
  }
  /** True when the last path segment ends in a Workday requisition token (_R12345, _R12345-1, _REQ-12345, _JR12345). */
  function hasReqToken(u) { return /_(?:R|REQ-?|JR)\d{3,}(?:-\d+)?$/i.test(lastSeg(String(u || '').split(/[?#]/)[0])); }
  var SEARCH_SKIP = { director: 1, vice: 1, president: 1, vp: 1, head: 1, manager: 1, senior: 1, sr: 1, associate: 1, executive: 1, lead: 1 };
  /** The site's own search URL for a row title (up to three distinctive words). */
  function wdSearchUrl(parts, title) {
    var words = String(title || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && TITLE_STOP[w] !== 1 && SEARCH_SKIP[w] !== 1; });
    if (!words.length) words = String(title || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2; });
    return 'https://' + parts.host + '/' + parts.site + '?q=' + enc(words.slice(0, 3).join(' '));
  }
  function slugTitle(u) { return lastSeg(String(u).split(/[?#]/)[0]).replace(/_(?:R|REQ-?|JR)\d{3,}(?:-\d+)?$/i, '').replace(/-+/g, ' '); }
  function slugPlace(u) { var s = String(u).split(/[?#]/)[0].split('/job/')[1] || ''; var seg = s.split('/'); return seg.length > 1 ? seg[0].replace(/-+/g, ' ') : ''; }
  /** Pick the one job link from a Workday search page that matches the row title (and location when several do). '' = none, 'AMBIGUOUS' = several. */
  function tfPick(links, parts, row) {
    var seen = {}, c = (links || []).map(function (u) { return String(u).split(/[?#]/)[0]; }).filter(function (u) {
      if (seen[u] || u.indexOf('https://' + parts.host + '/') !== 0 || !/\/job\//.test(u) || !hasReqToken(u)) return false; seen[u] = 1; return true;
    }).filter(function (u) { return titleOk(row && row.TITLE, slugTitle(u)); });
    if (c.length > 1 && row && row.LOCATION) {
      var city = String(row.LOCATION).toLowerCase().split(/[,(]/)[0].replace(/[^a-z ]+/g, ' ').trim();
      var byPlace = city ? c.filter(function (u) { return slugPlace(u).toLowerCase().indexOf(city) >= 0; }) : [];
      if (byPlace.length) c = byPlace;
    }
    if (c.length > 1) {   // same title at several sites with no location to tell them apart: never guess
      var exact = c.filter(function (u) { return slugTitle(u).toLowerCase().replace(/\s+/g, ' ').trim() === String(row && row.TITLE || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); });
      if (exact.length === 1) c = exact;
    }
    return c.length === 1 ? c[0] : (c.length ? 'AMBIGUOUS' : '');
  }
  /** One TinyFish result (or error) for a Workday job page -> the same shape interpret() returns. */
  function tfJob(res, err, url, row, opts) {
    opts = opts || {};
    var now = opts.now ? Date.parse(opts.now) : Date.now(), out = { provider: 'WORKDAY', via: 'TINYFISH' };
    if (err) {
      if (err.error === 'page_not_found' && hasReqToken(url)) { out.result = 'CLOSED'; out.liveness = 'CLOSED_EMPLOYER_404'; return out; }
      out.result = 'TF_' + String(err.error || 'ERROR').toUpperCase() + (err.status ? '_' + err.status : ''); return out;
    }
    var text = String(res && res.text || '');
    var title = (text.match(/^##\s+(.+)$/m) || [])[1] || '';
    if (TF_NOT_FOUND_RE.test(text) && !/job requisition id/i.test(text)) {
      if (hasReqToken(url)) { out.result = 'CLOSED'; out.liveness = 'CLOSED_EMPLOYER_404'; return out; }
      out.result = 'NOT_FOUND_NO_REQ_TOKEN'; return out;
    }
    if (!title || !/job requisition id/i.test(text)) { out.result = 'UNREADABLE'; return out; }
    out.title = title.trim();
    var pm = text.match(/posted on\s*\n?\s*:?\s*Posted (Today|Yesterday|(\d+)(\+)? Days? Ago)/i);
    if (pm) {
      if (pm[3]) out.postedNote = 'Posted ' + pm[2] + '+ days before ' + new Date(now).toISOString().slice(0, 10);
      else { var n = /today/i.test(pm[1]) ? 0 : /yesterday/i.test(pm[1]) ? 1 : +pm[2]; out.postedAt = new Date(now - n * DAY).toISOString().slice(0, 10); }
    }
    if (!titleOk(row && row.TITLE, out.title)) { out.result = 'TITLE_MISMATCH'; return out; }
    out.result = 'LIVE'; out.liveness = 'LIVE_EMPLOYER_ATS';
    var body = text.split(/\n#{2,4}\s*Similar Jobs/i)[0];
    out.pay = payFromText(body); out.payFromText = !!out.pay; out.degree = degreeFromText(body);
    return out;
  }
  /** Fetch API request body for up to 10 URLs. */
  function tfBody(urls, opts) {
    var b = { urls: urls, format: 'markdown', links: !!(opts && opts.links), ttl: 0, per_url_timeout_ms: 35000, purpose: 'Check whether these employer job postings are open and read title, posting date, pay and degree wording.' };
    return b;
  }

  /** One queue body for the checked rows (all ENRICH, actor WRITER_ATS). */
  function batchBody(items, stamp) {
    return {
      action: 'batch', requestId: 'ATSCHK-' + stamp,
      requests: items.map(function (x) {
        return { action: 'ruling', ruling: { primaryId: x.row.PRIMARY_ID, kind: 'ENRICH', actor: 'WRITER_ATS', requestId: 'ATSCHK-' + stamp + '-' + x.row.PRIMARY_ID, note: 'ATS liveness check ' + x.target.provider + ' ' + x.result.result, fields: x.fields } };
      })
    };
  }

  return { wdParts: wdParts, hasReqToken: hasReqToken, wdSearchUrl: wdSearchUrl, tfPick: tfPick, tfJob: tfJob, tfBody: tfBody, detect: detect, detectUrl: detectUrl, select: select, ownedByChecker: ownedByChecker, interpret: interpret, fieldsFor: fieldsFor, batchBody: batchBody, payFromText: payFromText, degreeFromText: degreeFromText, titleOk: titleOk, BATCH_LIMIT: BATCH_LIMIT, DECISIVE: DECISIVE };
});

/* ================= Apps Script glue ================= */
var ATS_CHECK_INTERVAL_MS_ = 30 * 60 * 1000;
var ATS_CHECK_FILE_PREFIX_ = 'ATSCHK_';

/** Checks up to 25 due rows against their ATS APIs and queues one ENRICH batch. dryRun returns the plan and writes nothing. */
function runAtsCheck_(force, dryRun) {
  var props = PropertiesService.getScriptProperties(), last = +(props.getProperty('ATS_CHECK_AT') || 0);
  if (!force && Date.now() - last < ATS_CHECK_INTERVAL_MS_) return { ok: true, skipped: true, lastAt: last ? new Date(last).toISOString() : '' };
  var f = queueFolders_();
  if (!dryRun && listPending_(f.queue).some(function (x) { return x.getName().replace(/^PROCESSING__/, '').indexOf(ATS_CHECK_FILE_PREFIX_) === 0; })) return { ok: true, skipped: true, reason: 'previous ATS batch still queued' };
  var now = new Date().toISOString(), rows = PipelineWorklists.parseRows(readMasterText_(MASTER_ID)), picked = PipelineAts.select(rows, { now: now });
  if (!dryRun) props.setProperty('ATS_CHECK_AT', String(Date.now()));
  if (!picked.length) return { ok: true, checked: 0, at: now };
  var apis = [], index = {};
  picked.forEach(function (x) { if (index[x.target.api] === undefined) { index[x.target.api] = apis.length; apis.push(x.target.api); } });
  var responses = [];
  for (var s = 0; s < apis.length; s += 10) {
    var chunk = apis.slice(s, s + 10).map(function (u) { return { url: u, muteHttpExceptions: true, followRedirects: true, headers: { Accept: 'application/json' } }; });
    var got; try { got = UrlFetchApp.fetchAll(chunk); } catch (e) { got = chunk.map(function () { return null; }); }
    got.forEach(function (resp) { responses.push(resp ? { code: resp.getResponseCode(), body: resp.getContentText() } : { code: 0, body: '' }); });
  }
  var items = picked.map(function (x) {
    var resp = responses[index[x.target.api]] || { code: 0, body: '' };
    var r = PipelineAts.interpret(x.target, resp.code, resp.body, x.row, { now: now });
    return { row: x.row, target: x.target, result: r, fields: PipelineAts.fieldsFor(x.row, x.target, r, { now: now }) };
  });
  var tf = atsTinyFishWorkday_(items, now);
  items = items.filter(function (x) { return !x.deferred; });
  if (!items.length) return { ok: true, checked: 0, at: now, tinyfish: tf };
  var summary = items.map(function (x) { return { primaryId: x.row.PRIMARY_ID, company: x.row.COMPANY, provider: x.target.provider + (x.result.via ? '/' + x.result.via : ''), result: x.result.result, pay: x.fields.PAY_POSTED || '', degree: x.fields.DEGREE_TEXT ? 'SET' : (x.fields.ATS_DEGREE_TEXT ? 'EVIDENCE_ONLY' : '') }; });
  if (dryRun) return { ok: true, dryRun: true, checked: items.length, at: now, tinyfish: tf, items: summary, body: PipelineAts.batchBody(items, now.replace(/[-:TZ.]/g, '').slice(0, 14)) };
  var stamp = now.replace(/[-:TZ.]/g, '').slice(0, 14), name = ATS_CHECK_FILE_PREFIX_ + stamp + '.json';
  f.queue.createFile(name, JSON.stringify(PipelineAts.batchBody(items, stamp)), MimeType.PLAIN_TEXT);
  return { ok: true, checked: items.length, queuedFile: name, at: now, tinyfish: tf, items: summary };
}

var TF_FETCH_URL_ = 'https://api.fetch.tinyfish.ai';
var TF_ROWS_PER_RUN_ = 6, TF_URLS_PER_DAY_ = 300;   // 3 sequential TinyFish rounds of ~35 s fit after the 90 s claim cutoff, under the 6 min limit; 300 of the 1,000 free URLs a day

/** POST several TinyFish Fetch requests in parallel (up to 3 URLs each). Returns { byUrl: {url: {res|err}}, used, httpErrors }. The key is never logged or returned. */
function atsTinyFishFetch_(key, urls, links) {
  var reqs = [], out = { byUrl: {}, used: 0, httpErrors: [] };
  for (var i = 0; i < urls.length; i += 3) reqs.push({ url: TF_FETCH_URL_, method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'X-API-Key': key }, payload: JSON.stringify(PipelineAts.tfBody(urls.slice(i, i + 3), { links: links })) });
  if (!reqs.length) return out;
  var got; try { got = UrlFetchApp.fetchAll(reqs); } catch (e) { out.httpErrors.push('FETCH_EXCEPTION'); return out; }
  got.forEach(function (resp) {
    var code = resp.getResponseCode(); if (code !== 200) { out.httpErrors.push(code); return; }
    var j; try { j = JSON.parse(resp.getContentText()); } catch (e) { out.httpErrors.push('BAD_JSON'); return; }
    (j.results || []).forEach(function (r) { out.byUrl[r.url] = { res: r }; out.used++; });
    (j.errors || []).forEach(function (e) { out.byUrl[e.url] = { err: e }; });
  });
  return out;
}

/** Workday rows whose CXS call failed (403 from Google) are re-read through TinyFish. Rows over the per-run or daily cap are
    deferred (not written, so they stay due). Without TINYFISH_API_KEY nothing changes. Mutates items in place. */
function atsTinyFishWorkday_(items, now) {
  var props = PropertiesService.getScriptProperties(), key = props.getProperty('TINYFISH_API_KEY');
  var todo = items.filter(function (x) { return x.target.provider === 'WORKDAY' && !/^(LIVE|CLOSED)$/.test(x.result.result) && PipelineAts.wdParts(x.target); });
  if (!key || !todo.length) return { enabled: !!key, rows: 0 };
  var day = now.slice(0, 10), used = props.getProperty('TF_FETCH_DAY') === day ? +(props.getProperty('TF_FETCH_COUNT') || 0) : 0;
  var room = Math.max(0, Math.min(TF_ROWS_PER_RUN_, Math.floor((TF_URLS_PER_DAY_ - used) / 2)));
  todo.slice(room).forEach(function (x) { x.deferred = true; });
  todo = todo.slice(0, room);
  var stat = { enabled: true, rows: todo.length, deferred: items.filter(function (x) { return x.deferred; }).length, fetched: 0, httpErrors: [] };
  if (!todo.length) return stat;
  // Round 1: job pages for URLs that carry the requisition token, the site search for those that do not.
  todo.forEach(function (x) { var p = PipelineAts.wdParts(x.target); x.tf = { parts: p, job: PipelineAts.hasReqToken(p.url) ? p.url : '', search: PipelineAts.hasReqToken(p.url) ? '' : PipelineAts.wdSearchUrl(p, x.row.TITLE) }; });
  var r1 = atsTinyFishFetch_(key, todo.filter(function (x) { return x.tf.job; }).map(function (x) { return x.tf.job; }), false);
  var s1 = atsTinyFishFetch_(key, todo.filter(function (x) { return x.tf.search; }).map(function (x) { return x.tf.search; }), true);
  stat.fetched += r1.used + s1.used; stat.httpErrors = stat.httpErrors.concat(r1.httpErrors, s1.httpErrors);
  // Round 2: the job page picked from each search.
  todo.forEach(function (x) {
    if (!x.tf.search) return;
    var hit = s1.byUrl[x.tf.search];
    if (!hit || hit.err) { x.tf.outcome = hit && hit.err ? 'TF_SEARCH_' + String(hit.err.error || 'ERROR').toUpperCase() : 'TF_SEARCH_NO_ANSWER'; return; }
    var pick = PipelineAts.tfPick(hit.res.links, x.tf.parts, x.row);
    if (pick === 'AMBIGUOUS') x.tf.outcome = 'AMBIGUOUS_SEARCH'; else if (!pick) x.tf.outcome = 'NOT_IN_PUBLIC_BOARD'; else x.tf.job = pick;
  });
  var r2 = atsTinyFishFetch_(key, todo.filter(function (x) { return x.tf.search && x.tf.job; }).map(function (x) { return x.tf.job; }), false);
  stat.fetched += r2.used; stat.httpErrors = stat.httpErrors.concat(r2.httpErrors);
  todo.forEach(function (x) {
    var r;
    if (x.tf.outcome) r = { provider: 'WORKDAY', via: 'TINYFISH', result: x.tf.outcome };
    else { var hit = r1.byUrl[x.tf.job] || r2.byUrl[x.tf.job]; r = hit ? PipelineAts.tfJob(hit.res, hit.err, x.tf.job, x.row, { now: now }) : { provider: 'WORKDAY', via: 'TINYFISH', result: 'TF_NO_ANSWER' }; }
    if (/^TF_NO_ANSWER$|^TF_SEARCH_NO_ANSWER$/.test(r.result) && stat.httpErrors.length) { x.deferred = true; return; }   // TinyFish itself failed: retry next run
    var t = { provider: 'WORKDAY', api: x.tf.job || x.target.api, url: x.tf.job || x.target.url };
    var f = PipelineAts.fieldsFor(x.row, t, r, { now: now });
    f.ATS_CHECK_VIA = 'TINYFISH'; f.ATS_CXS_RESULT = x.result.result;
    if (f.LIVENESS_METHOD) f.LIVENESS_METHOD = 'TINYFISH_FETCH:WORKDAY';
    if (r.postedNote) f.ATS_POSTED_NOTE = r.postedNote;
    x.result = r; x.fields = f;
  });
  props.setProperty('TF_FETCH_DAY', day); props.setProperty('TF_FETCH_COUNT', String(used + stat.fetched));
  stat.usedToday = used + stat.fetched;
  return stat;
}
