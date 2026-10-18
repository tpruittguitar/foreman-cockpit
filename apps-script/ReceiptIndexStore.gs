/* REV-010: authoritative receipt-index storage. GitHub writes compare the exact blob SHA read by
 * the caller; never refresh that SHA to hide a conflict, retry a PUT, or fall back to Drive.
 * Drive remains selected until the locked migrate_receipt_index action seeds and switches it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReceiptIndexStore = factory();
})(this, function () {
  'use strict';
  var DETAIL_LIMIT = 100;
  function config() {
    var p = PropertiesService.getScriptProperties().getProperties();
    var source = String(p.RECEIPT_INDEX_SOURCE || 'DRIVE').trim().toUpperCase();
    if (source !== 'DRIVE' && source !== 'GITHUB') throw new Error('RECEIPT_INDEX_SOURCE_INVALID');
    return { source: source, repo: 'tpruittguitar/forge-writer-state', branch: 'main',
      path: 'PIPELINE_RECEIPT_INDEX.json', token: String(p.GITHUB_WRITER_STATE_TOKEN || '').trim() };
  }
  function validate(d) {
    if (!d || Array.isArray(d) || d.version !== 1 || !d.requests || typeof d.requests !== 'object' ||
        Array.isArray(d.requests) || !Array.isArray(d.pending) ||
        Object.keys(d.requests).some(function (id) { var e = d.requests[id]; return !id || !e || typeof e !== 'object' || Array.isArray(e) || typeof e.s !== 'string' || !e.s; }) ||
        d.pending.some(function (p) { return !p || typeof p !== 'object' || Array.isArray(p) || !p.writeId || !Array.isArray(p.requestIds) || !Array.isArray(p.items); }))
      throw new Error('receipt index malformed (fail closed)');
    if (!Array.isArray(d.rotations)) d.rotations = [];
    return d;
  }
  function parse(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('receipt index empty (fail closed)');
    var d;
    try { d = JSON.parse(text); } catch (e) { throw new Error('receipt index unreadable (fail closed)'); }
    return validate(d);
  }
  // Drop only bulky row detail on older COMPLETE entries. Never remove a request ID, completion
  // state, write ID, timestamp, correction or unresolved transaction: these prevent blind replay.
  function compact(d) {
    validate(d);
    var copy = JSON.parse(JSON.stringify(d)), protectedIds = {};
    copy.pending.forEach(function (p) { p.requestIds.forEach(function (id) { protectedIds[id] = true; }); });
    Object.keys(copy.requests).filter(function (id) { return copy.requests[id].s === 'COMPLETE' && !protectedIds[id]; })
      .sort(function (a, b) { return String(copy.requests[b].at || '').localeCompare(String(copy.requests[a].at || '')) || a.localeCompare(b); })
      .slice(DETAIL_LIMIT).forEach(function (id) { delete copy.requests[id].items; });
    return copy;
  }
  function blobSha(text) {
    var length = Utilities.newBlob(text).getBytes().length;
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, 'blob ' + length + '\x00' + text, Utilities.Charset.UTF_8)
      .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  }
  function identity(cfg) { return cfg.repo + '@' + cfg.branch + ':' + cfg.path; }
  function revision(d, cfg, sha) {
    Object.defineProperty(d, '__receiptIndexRevision', { value: { identity: identity(cfg), sha: sha, requestIds: Object.keys(d.requests) }, enumerable: false, writable: true, configurable: true });
    return d;
  }
  function headers(cfg, accept) {
    if (!cfg.token) throw new Error('GITHUB_WRITER_STATE_TOKEN_MISSING: set a Contents read/write token for forge-writer-state');
    return { Accept: accept, Authorization: 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28', 'Cache-Control': 'no-cache' };
  }
  function url(cfg) { return 'https://api.github.com/repos/' + cfg.repo + '/contents/' + cfg.path.split('/').map(encodeURIComponent).join('/'); }
  function conflict() { var e = new Error('REVISION_CONFLICT: receipt index changed; no retry or Drive fallback permitted'); e.mode = 'REVISION_CONFLICT'; return e; }
  function read(cfg, allowMissing) {
    // The raw API media type works above 1 MB; JSON's base64 content does not. Derive the Git
    // blob SHA from these exact UTF-8 bytes so metadata/content cannot come from different versions.
    var r = UrlFetchApp.fetch(url(cfg) + '?ref=' + encodeURIComponent(cfg.branch) + '&cb=' + Date.now(),
      { method: 'get', headers: headers(cfg, 'application/vnd.github.raw'), muteHttpExceptions: true });
    var code = r.getResponseCode();
    if (code === 404 && allowMissing) return null;
    if (code !== 200) throw new Error('receipt index GitHub read failed (fail closed): HTTP ' + code);
    var raw = r.getContentText('UTF-8');
    return revision(parse(raw), cfg, blobSha(raw));
  }
  function put(cfg, d, baseSha, message) {
    var next = compact(d); next.updatedAt = new Date().toISOString();
    var text = JSON.stringify(next); parse(text);
    var body = { message: message, content: Utilities.base64Encode(text, Utilities.Charset.UTF_8), branch: cfg.branch };
    if (baseSha) body.sha = baseSha;
    var r = UrlFetchApp.fetch(url(cfg), { method: 'put', headers: headers(cfg, 'application/vnd.github+json'),
      contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
    var code = r.getResponseCode();
    if (code === 409 || code === 422) throw conflict();
    if (code !== 200 && code !== 201) throw new Error('receipt index GitHub write failed (fail closed): HTTP ' + code);
    var result;
    try { result = JSON.parse(r.getContentText()); } catch (e) { throw new Error('RECEIPT_INDEX_WRITE_RESPONSE_UNREADABLE'); }
    var sha = blobSha(text);
    if (!result.content || result.content.sha !== sha) throw new Error('RECEIPT_INDEX_WRITE_SHA_MISMATCH');
    d.requests = next.requests; d.updatedAt = next.updatedAt;
    return revision(d, cfg, sha);
  }
  function write(cfg, d) {
    validate(d);
    var rev = d.__receiptIndexRevision;
    if (!rev || rev.identity !== identity(cfg) || !rev.sha) throw new Error('RECEIPT_INDEX_BASE_SHA_REQUIRED');
    if (rev.requestIds.some(function (id) { return !Object.prototype.hasOwnProperty.call(d.requests, id); }))
      throw new Error('RECEIPT_INDEX_REQUEST_REMOVAL_FORBIDDEN');
    return put(cfg, d, rev.sha, 'WRITER receipt index checkpoint');
  }
  function seed(cfg, d, expectedSha) {
    var current = read(cfg, true), sha = current && current.__receiptIndexRevision.sha;
    if ((sha || '') !== (expectedSha || '')) throw conflict();
    if (current && Object.keys(current.requests).some(function (id) { return !Object.prototype.hasOwnProperty.call(d.requests, id); }))
      throw new Error('RECEIPT_INDEX_SEED_WOULD_LOSE_REQUESTS');
    return put(cfg, d, sha || '', 'WRITER receipt index migration from locked Drive snapshot');
  }
  return { config: config, validate: validate, parse: parse, compact: compact, blobSha: blobSha,
    read: read, write: write, seed: seed, DETAIL_LIMIT: DETAIL_LIMIT };
});
