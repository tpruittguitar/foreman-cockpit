/* Shared transaction planning. No service calls: durable storage is owned by Code.gs. */
var WriterTransactions = (function () {
  function rows(lines) {
    var out = {};
    lines.forEach(function (line) {
      if (!/^\d+ \| /.test(line)) return;
      var pid = line.split(' | ')[1].trim();
      if (!pid || out[pid]) throw new Error('TRANSACTION_IDENTITY_AMBIGUOUS: ' + pid);
      out[pid] = line;
    });
    return out;
  }
  function requestIds(request) {
    if (!request) return [];
    if (request.action === 'batch') return (request.requests || []).reduce(function (a, r) { return a.concat(requestIds(r)); }, []);
    var body = request.ruling || request.event || request.undo || request;
    var id = [body.requestId, body.request_id, request.requestId, request.request_id, request.run && request.run.SCOUT_RUN_ID]
      .filter(function (v) { return typeof v === 'string' && v.trim(); }).map(function (v) { return v.trim(); })[0] || '';
    return id ? [id] : [];
  }
  function intent(before, after, request, now, hash, masterId, build) {
    var b = rows(before), a = rows(after), ids = requestIds(request), items = [];
    Object.keys(b).forEach(function (pid) {
      if (!a[pid]) throw new Error('TRANSACTION_DELETE_FORBIDDEN: ' + pid);
    });
    Object.keys(a).forEach(function (pid) {
      if (a[pid] !== b[pid]) items.push({ pid: pid, op: b[pid] ? 'REPLACE' : 'INSERT', b: b[pid] ? hash(b[pid]) : '', a: hash(a[pid]) });
    });
    if (!items.length) return null;
    var writeId = 'W-' + now.replace(/[^0-9]/g, '').slice(0, 17) + '-' + hash(JSON.stringify(items)).slice(0, 6);
    // A write with no caller ID still has a recoverable durable obligation. Never pretend it has replay identity.
    var receipts = (ids.length ? ids : ['']).map(function (rid) {
      return { RECEIPT: 'WRITE_INTENT_RECEIPT', REQUEST_ID: rid, TARGET_FILE_ID: masterId,
        PRIMARY_IDS: items.map(function (x) { return x.pid; }), COMPLETION_STATUS: 'PENDING_VERIFICATION',
        READBACK_VERIFIED: 'PENDING', WRITE_ID: writeId, EXECUTED_AT: now, WRITER_BUILD: build };
    });
    var counts = after.filter(function (l) { return /^COUNTS:/.test(l); });
    var end = after.filter(function (l) { return /^END V2_CURRENT_POPULATION_MASTER/.test(l); });
    if (counts.length !== 1 || !end.length || end.some(function (line) { return line !== end[0]; })) throw new Error('TRANSACTION_TRAILER_INVALID');
    return { version: 2, writeId: writeId, kind: String(request.action || 'MASTER_WRITE').toUpperCase(),
      stage: 'PREPARED', writtenAt: now, counts: hash(counts[0]), end: hash(end[0]),
      beforeHash: hash(before.join('\n')), afterHash: hash(after.join('\n')),
      requestIds: ids, items: items, receipts: receipts, build: build };
  }
  return { intent: intent, requestIds: requestIds, rows: rows };
})();
if (typeof module === 'object' && module.exports) module.exports = WriterTransactions;
