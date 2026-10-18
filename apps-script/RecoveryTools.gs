/* Recovery tools (2026-10-17). One job: put PIPELINE_RECEIPT_INDEX.json back from its own Drive version history
 * when the live copy is empty or unreadable (it was saved as 0 bytes 2026-10-16 01:02:44Z and the Writer has failed
 * closed since). Uses the Drive REST API with the script's own token (scopes drive + external_request already granted).
 *
 * Safety:
 *  - refuses when the live index already parses (nothing to repair);
 *  - picks the newest earlier version whose content parses as a valid index, unless a revisionId is named;
 *  - writes a backup copy of the chosen version beside the index before touching the live file;
 *  - writes the live index, reads it back and compares byte length and parse; reports both.
 * Never touches the master or any other file. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.RecoveryTools = factory(); })(this, function () {
  'use strict';
  /** Pure: is this text a usable receipt index? */
  function validIndex(text) {
    if (!text || !String(text).trim()) return { ok: false, reason: 'EMPTY' };
    var d; try { d = JSON.parse(text); } catch (e) { return { ok: false, reason: 'UNPARSEABLE: ' + e.message }; }
    if (!d || typeof d !== 'object' || !d.requests || typeof d.requests !== 'object' || !Array.isArray(d.pending)) return { ok: false, reason: 'MALFORMED' };
    return { ok: true, requests: Object.keys(d.requests).length, pending: d.pending.length, rotations: Array.isArray(d.rotations) ? d.rotations.length : 0, updatedAt: String(d.updatedAt || '') };
  }
  /** Pure: newest-first order of revisions with a non-zero size, excluding the head (current) revision. */
  function candidates(revisions, headId) {
    return (revisions || []).filter(function (r) { return r && r.id !== headId && Number(r.size) > 0; })
      .sort(function (a, b) { return Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime); });
  }
  return { validIndex: validIndex, candidates: candidates };
});

/** Writer action restore_receipt_index (GET, key-protected). p.revisionId optional; p.dryRun=1 reports without writing. */
function restoreReceiptIndex_(p) {
  p = p || {};
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var it = folder_().getFilesByName(RECEIPT_INDEX_NAME);
    if (!it.hasNext()) return { ok: false, error: 'receipt index file not found' };
    var file = it.next(), fileId = file.getId(), live = file.getBlob().getDataAsString();
    var liveCheck = RecoveryTools.validIndex(live);
    if (liveCheck.ok) return { ok: false, mode: 'NOTHING_TO_REPAIR', live: liveCheck };
    var token = ScriptApp.getOAuthToken(), api = 'https://www.googleapis.com/drive/v3/files/' + fileId;
    var hdr = { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
    var list = UrlFetchApp.fetch(api + '/revisions?pageSize=200&fields=revisions(id,modifiedTime,size)', hdr);
    if (list.getResponseCode() !== 200) return { ok: false, error: 'revision list failed: HTTP ' + list.getResponseCode() + ' ' + list.getContentText().slice(0, 300) };
    var revs = JSON.parse(list.getContentText()).revisions || [], head = revs.length ? revs[revs.length - 1].id : '';
    var order = p.revisionId ? revs.filter(function (r) { return r.id === p.revisionId; }) : RecoveryTools.candidates(revs, head);
    var chosen = null, text = '', check = null, tried = [];
    for (var i = 0; i < order.length && i < 5 && !chosen; i++) {
      var r = UrlFetchApp.fetch(api + '/revisions/' + encodeURIComponent(order[i].id) + '?alt=media', hdr);
      if (r.getResponseCode() !== 200) { tried.push({ id: order[i].id, modifiedTime: order[i].modifiedTime, error: 'HTTP ' + r.getResponseCode() }); continue; }
      var t = r.getContentText('UTF-8'), c = RecoveryTools.validIndex(t);
      tried.push({ id: order[i].id, modifiedTime: order[i].modifiedTime, size: order[i].size, valid: c.ok, reason: c.reason || '' });
      if (c.ok) { chosen = order[i]; text = t; check = c; }
    }
    var out = { ok: !!chosen, live: liveCheck, revisionsSeen: revs.length, tried: tried, chosen: chosen, chosenIndex: check };
    if (!chosen) { out.error = 'no valid earlier version found'; return out; }
    if (p.dryRun) { out.mode = 'DRY_RUN'; return out; }
    var stamp = String(chosen.modifiedTime).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    var backup = folder_().createFile('PIPELINE_RECEIPT_INDEX_RESTORE_SOURCE_' + stamp + '.json', text, MimeType.PLAIN_TEXT);
    file.setContent(text);
    var back = DriveApp.getFileById(fileId).getBlob().getDataAsString(), backCheck = RecoveryTools.validIndex(back);
    out.mode = backCheck.ok && back.length === text.length ? 'RESTORED' : 'RESTORE_READBACK_MISMATCH';
    out.ok = out.mode === 'RESTORED';
    out.backupFileId = backup.getId(); out.writtenChars = text.length; out.readbackChars = back.length; out.readback = backCheck;
    appendEvent_({ type: 'RECEIPT_INDEX_RESTORED', ts: new Date().toISOString(), revisionId: chosen.id, revisionTime: chosen.modifiedTime, backupFileId: out.backupFileId, mode: out.mode });
    return out;
  } finally { lock.releaseLock(); }
}
