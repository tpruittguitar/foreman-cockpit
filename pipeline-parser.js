/* Pipeline Explorer parser. Contract: docs/PIPELINE_EXPLORER_DESIGN_BRIEF.md section 3.1.
   Works as a browser global (window.PipelineParser) and as a CommonJS module (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PipelineParser = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var FIXED_COLUMNS = ['INV', 'PRIMARY_ID', 'COMPANY', 'TITLE', 'BUCKET', 'DISPOSITION', 'TAGS', 'REQ', 'LOCATION'];
  var ROW_RE = /^(\d+) \| /;
  var SECTION_RE = /^=== (.+?) \((\d+)\) ===\s*$/;
  var KV_RE = /^([A-Z][A-Z0-9_]*)=([\s\S]*)$/;

  function parseCounts(line) {
    var out = {};
    line.replace(/^COUNTS:\s*/, '').split(/\s+/).forEach(function (tok) {
      var m = tok.match(/^([A-Z_]+)=(\d+)$/); if (m) out[m[1]] = +m[2];
    });
    return out;
  }
  function parseSchema(line) {
    var out = {};
    line.replace(/^SCHEMA:\s*/, '').split('|').forEach(function (seg) {
      var m = seg.trim().match(/^([A-Z_]+)=(.*)$/); if (m) out[m[1]] = m[2].trim();
    });
    return out;
  }
  // Split payload "a; KEY=v; KEY2=v" into {SCOUT_ACTION, payload:{}, unknownKeys:[]}
  function parsePayload(text) {
    var segs = text.split('; ');
    var payload = {}, order = [], lead = [];
    var lastKey = null;
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var m = seg.match(KV_RE);
      if (m) { lastKey = m[1]; if (!(lastKey in payload)) order.push(lastKey); payload[lastKey] = (payload[lastKey] ? payload[lastKey] + '; ' : '') + m[2]; }
      else if (lastKey) { payload[lastKey] += '; ' + seg; }
      else { lead.push(seg); }
    }
    return { scoutAction: lead.join('; ').replace(/;\s*$/, ''), payload: payload, order: order };
  }
  function parseRow(line, lineNo, section) {
    var parts = line.split(' | ');
    var row = { line: lineNo, section: section, raw: line, parseError: null, cellCount: parts.length, payload: {}, payloadOrder: [] };
    if (parts.length < FIXED_COLUMNS.length + 1) {
      row.parseError = 'expected at least 10 cells, got ' + parts.length;
      FIXED_COLUMNS.forEach(function (c, i) { row[c] = parts[i] !== undefined ? parts[i].trim() : ''; });
      row.SCOUT_ACTION = ''; return row;
    }
    FIXED_COLUMNS.forEach(function (c, i) { row[c] = parts[i].trim(); });
    var rest = parts.slice(FIXED_COLUMNS.length).join(' | ');   // pipes inside payload preserved
    var p = parsePayload(rest);
    row.SCOUT_ACTION = p.scoutAction; row.payload = p.payload; row.payloadOrder = p.order;
    row.INV_NUM = parseInt(row.INV, 10);
    return row;
  }
  function parse(text) {
    text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    var lines = text.split('\n');
    var header = [], rows = [], sections = [], counts = null, columnsLine = null, schema = null, title = lines[0] || '';
    var inBody = false, section = null, sectionCounts = {};
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!inBody) {
        if (/^={8,}\s*$/.test(ln)) { inBody = true; continue; }
        header.push(ln);
        if (/^COUNTS:/.test(ln)) counts = parseCounts(ln);
        else if (/^COLUMNS:/.test(ln)) columnsLine = ln.replace(/^COLUMNS:\s*/, '');
        else if (/^SCHEMA:/.test(ln)) schema = parseSchema(ln);
        continue;
      }
      var sm = ln.match(SECTION_RE);
      if (sm) { section = sm[1]; sectionCounts[section] = +sm[2]; sections.push({ name: section, declared: +sm[2], line: i + 1 }); continue; }
      if (ROW_RE.test(ln)) { rows.push(parseRow(ln, i + 1, section)); continue; }
      // A line that looks like a broken row (starts with digits but no " | ") is kept as a parse error
      if (/^\d+\s*\|/.test(ln) && ln.trim()) { var r = parseRow(ln, i + 1, section); r.parseError = r.parseError || 'malformed separator'; rows.push(r); continue; }
      if (ln.trim() && !inBody) header.push(ln);
    }
    // Also scan the pre-body header for COUNTS if the body divider was missing (be lenient)
    if (!inBody) { rows = []; }
    var byBucket = {};
    rows.forEach(function (r) { var b = r.BUCKET || '(blank)'; byBucket[b] = (byBucket[b] || 0) + 1; });
    var mismatches = rows.filter(function (r) { return r.section && r.BUCKET && r.section !== r.BUCKET; });
    var keyFreq = {};
    rows.forEach(function (r) { r.payloadOrder.forEach(function (k) { keyFreq[k] = (keyFreq[k] || 0) + 1; }); });
    var payloadKeys = Object.keys(keyFreq).sort(function (a, b) { return keyFreq[b] - keyFreq[a] || (a < b ? -1 : 1); });
    var checksum = { ok: true, diffs: [] };
    if (counts) {
      Object.keys(counts).forEach(function (k) {
        if (k === 'TOTAL' || k === 'UNACCOUNTED') return;
        var have = byBucket[k] || 0; if (have !== counts[k]) { checksum.ok = false; checksum.diffs.push({ bucket: k, declared: counts[k], parsed: have }); }
      });
      if (counts.TOTAL !== undefined && counts.TOTAL !== rows.length) { checksum.ok = false; checksum.diffs.push({ bucket: 'TOTAL', declared: counts.TOTAL, parsed: rows.length }); }
    } else { checksum.ok = false; checksum.diffs.push({ bucket: 'COUNTS', declared: null, parsed: rows.length }); }
    return {
      title: title, header: header, columnsLine: columnsLine, counts: counts, schema: schema || { MASTER_SCHEMA_VERSION: '1 (assumed; no SCHEMA line)' },
      sections: sections, rows: rows, byBucket: byBucket, sectionMismatches: mismatches,
      payloadKeys: payloadKeys, keyFreq: keyFreq, checksum: checksum,
      parseErrors: rows.filter(function (r) { return r.parseError; })
    };
  }
  // Helpers used by the app and tests
  function parseMoney(s) {
    if (!s) return null;
    var m = String(s).replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d+)?)\s*([kK])?/g);
    if (!m) return null;
    var nums = m.map(function (t) { var mm = t.match(/(\d+(?:\.\d+)?)\s*([kK])?/); var v = parseFloat(mm[1]); if (mm[2]) v *= 1000; else if (v < 1000) v *= 1000; return v; });
    nums = nums.filter(function (v) { return v >= 50000 && v <= 2000000; });
    if (!nums.length) return null;
    return { low: Math.min.apply(null, nums), high: Math.max.apply(null, nums), mid: (Math.min.apply(null, nums) + Math.max.apply(null, nums)) / 2 };
  }
  function parseDate(s) { if (!s) return null; var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/); if (!m) return null; return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)); }
  return { parse: parse, parseRow: parseRow, parsePayload: parsePayload, parseMoney: parseMoney, parseDate: parseDate, FIXED_COLUMNS: FIXED_COLUMNS };
}));
