/* Shared Pipeline Explorer pay figure (GUI spec, P2 phone/desktop parity).
   Figure only: nearest $1K, capital K, en dash, no spaces. Trust labels stay with the caller. */
(function (root) {
  'use strict';
  var DASH = '\u2013';
  var UNKNOWN = 'Pay not posted';

  function evidence() {
    if (typeof module === 'object' && module.exports) {
      try { return require('./pipeline-evidence'); } catch (e) { return null; }
    }
    return (typeof PipelineEvidence !== 'undefined') ? PipelineEvidence : null;
  }
  function numsOf(v, hourlyHint) {
    var out = [], s = String(v == null ? '' : v).replace(/,/g, '');
    var hourly = !!(hourlyHint || /\/\s*hr\b|per\s*hour\b|\bhourly\b/i.test(s));
    s.replace(/\$?\s*(\d+(?:\.\d+)?)(\s*[kK])?/g, function (_, n, k) {
      var x = parseFloat(n);
      if (!isFinite(x)) return;
      if (k) x *= 1000;
      else if (!hourly && x < 1000) x *= 1000;
      out.push(x);
    });
    return out;
  }
  function hourFig(n) {
    var r = Math.round(Number(n) * 100) / 100;
    if (!isFinite(r)) return '';
    if (r === Math.round(r)) return '$' + Math.round(r) + '/hr';
    return '$' + r.toFixed(2) + '/hr';
  }
  function kFig(n) {
    var r = Math.round(Number(n) / 1000);
    if (!isFinite(r)) return '';
    return '$' + r + 'K';
  }
  function isHourly(p, nums) {
    p = p || {};
    if (nums && nums.some(function (n) { return n >= 1000; })) return false;
    var blob = [p.SALARY_BASIS, p.SALARY_PERIOD, p.PAY_PERIOD, p.PAY_UNIT, p.SALARY_UNIT,
      p.SALARY_BASE_POSTED, p.PAY_POSTED, p.SALARY_BASE_EST, p.GROK_SALARY, p.SALARY_LABEL].join(' ');
    if (/\/\s*hr\b|per\s*hour\b|\bhourly\b/i.test(blob)) return true;
    return !!(nums && nums.length && nums.every(function (n) { return n > 0 && n < 1000; }));
  }
  function pair(nums) {
    var a = nums.filter(function (n) { return n != null && isFinite(n); }).slice().sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    if (a.length === 1) return { lo: a[0], hi: a[0] };
    return { lo: a[0], hi: a[a.length - 1] };
  }
  function format(input) {
    input = input || {};
    var hourly = !!input.hourly;
    var lo = input.low, hi = input.high, mid = input.mid;
    var nums = [];
    if (lo != null && isFinite(lo)) nums.push(Number(lo));
    if (hi != null && isFinite(hi)) nums.push(Number(hi));
    if (!nums.length && mid != null && isFinite(mid)) nums.push(Number(mid));
    var p = pair(nums);
    if (!p) return UNKNOWN;
    var fig = hourly ? hourFig : kFig;
    if (p.lo !== p.hi) return fig(p.lo) + DASH + fig(p.hi);
    return fig(p.lo);
  }
  function fromPayload(p, mid) {
    p = p || {};
    var ev, nums = [];
    var E = evidence();
    if (E && E.salary) ev = E.salary(p);
    if (ev && ev.source === 'SALARY_BASE_LOW/HIGH' && ev.low != null && ev.high != null) {
      nums = [ev.low, ev.high];
    } else if (ev && ev.source && ev.mid != null && ev.mid >= 1000) {
      nums = ev.low != null && ev.high != null && ev.high !== ev.low ? [ev.low, ev.high] : numsOf(p[ev.source]);
      if (!nums.length) nums = ev.low != null && ev.high != null ? [ev.low, ev.high] : [ev.mid];
    }
    if (!nums.length) {
      var lo = numsOf(p.SALARY_BASE_LOW)[0], hi = numsOf(p.SALARY_BASE_HIGH)[0];
      if (lo != null && hi != null) nums = [lo, hi];
    }
    if (!nums.length) {
      var fields = ['SALARY_BASE_POSTED', 'PAY_POSTED', 'SALARY_BASE_EST', 'GROK_SALARY', 'SALARY_POSTED'];
      for (var i = 0; i < fields.length && !nums.length; i++) nums = numsOf(p[fields[i]]);
    }
    if (!nums.length && mid != null && isFinite(mid)) nums = [Number(mid)];
    if (!nums.length && ev && ev.mid != null) nums = [ev.mid];
    var pr = pair(nums);
    if (!pr) return UNKNOWN;
    return format({ low: pr.lo, high: pr.hi, hourly: isHourly(p, nums) });
  }
  function trustWord(sr) {
    if (!sr) return '';
    if (sr.low) return 'low-confidence';
    if (sr.approx) return 'estimate';
    if (sr.label && sr.label !== 'UNKNOWN') return 'posted';
    return '';
  }
  function display(p, mid, sr) {
    var fig = fromPayload(p, mid);
    if (fig === UNKNOWN) return fig;
    var t = trustWord(sr);
    return t ? fig + ' ' + t : fig;
  }
  var api = { DASH: DASH, UNKNOWN: UNKNOWN, format: format, fromPayload: fromPayload, trustWord: trustWord, display: display, hourFig: hourFig, kFig: kFig };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PipelinePayFormat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
