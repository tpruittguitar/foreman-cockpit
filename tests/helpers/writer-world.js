'use strict';
const W = require('../../apps-script/Code.gs');
const MASTER = '1My9QYVPBblw8c7vFMFxGOAqgTSuH9gS8';
const RULES = '1uuIopBY2Et-leu_tOdxnWAJJLniKwk08rdLCypuM2BE';
const DOC = 'application/vnd.google-apps.document';
function world(t, opts = {}) {
  const prior = {}, files = new Map(), faults = new Map(), opens = {};
  let clock = Date.parse(opts.clock || '2026-10-09T04:00:00Z'), next = 0, saves = 0;
  const iter = list => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
  function fault(name, operation, after) {
    const f = faults.get(name + ':' + operation);
    if (f && !!f.after === !!after) { if (--f.left <= 0) faults.delete(name + ':' + operation); throw new Error(f.message); }
  }
  const folder = { getFilesByName: name => iter(files.has(name) ? [files.get(name)] : []), createFile: (name, content) => make(name, content), addFile() {} };
  function make(name, content, id = 'TEST-' + (++next), mime = 'text/plain') {
    const f = { content: String(content), name, modified: clock,
      getId: () => id, getName: () => f.name, getMimeType: () => mime, getUrl: () => 'https://example.invalid/' + id,
      getParents: () => iter([folder]), getLastUpdated: () => new Date(f.modified),
      getBlob: () => { fault(f.name, 'read', false); return { getDataAsString: () => f.content }; },
      setContent: v => { fault(f.name, 'write', false); if (id === MASTER) saves++; f.content = String(v); f.modified = ++clock; fault(f.name, 'write', true); return f; },
      setName: n => { files.delete(f.name); f.name = n; files.set(n, f); return f; }, setTrashed() {} };
    files.set(name, f); files.set(id, f); return f;
  }
  const rows = opts.rows || [];
  const lines = rows.some(l => /^COUNTS:/.test(l)) ? rows.slice() : [W.recomputeCountsLine(rows), ...rows, 'END V2_CURRENT_POPULATION_MASTER (' + rows.filter(l => /^\d+ \| /.test(l)).length + ' rows)'];
  make(MASTER, lines.join('\n') + '\n', MASTER);
  make('PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS', opts.receipts || '', opts.legacyReceiptDoc ? 'TEST-RECEIPTS' : 'TEST-RECEIPTS-TEXT', opts.legacyReceiptDoc ? DOC : 'text/plain');
  make('PIPELINE_EVENT_LOG.jsonl', '\n');
  make(RULES, opts.rulesText === undefined ? 'STATUS=ACTIVE\nSECTION=DEGREE_FLEX\nFLEX_POLICY_VERSION=1\nHIGH_FLEX_MODIFIER=30\nSOFT_FLEX_MODIFIER=20\nNO_FLEX_MODIFIER=-10\nSTRICT_MODIFIER=-30\nSECTION=NEVER_CONSIDER\nDEFAULT_ACTION=ALLOW_INTAKE\nSECTION=END' : opts.rulesText, RULES, DOC);
  const globals = {
    Utilities: { sleep() {}, getUuid: () => 'TEST-' + (++next), formatDate: d => d.toISOString(), computeDigest: (_algorithm, value) => [...require('node:crypto').createHash('sha256').update(String(value)).digest()], base64Encode: bytes => Buffer.from(bytes).toString('base64'), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' } },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    DriveApp: { getFileById: id => { if (!files.has(id)) throw new Error('No synthetic file: ' + id); return files.get(id); }, getRootFolder: () => folder },
    DocumentApp: { openById: id => {
      if (id === MASTER || id === '19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI') throw new Error('Forbidden Doc master access');
      opens[id] = (opens[id] || 0) + 1; const f = files.get(id); if (!f || (id === RULES && opts.rulesText === null)) throw new Error('No synthetic Doc: ' + id);
      return { getBody: () => ({ getText: () => f.content, appendParagraph: text => { f.content += '\n' + text; } }), saveAndClose() {} };
    } },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  };
  Object.entries(globals).forEach(([name, value]) => { prior[name] = global[name]; global[name] = value; });
  let restored = false;
  const restore = () => { if (restored) return; restored = true; Object.keys(prior).forEach(k => prior[k] === undefined ? delete global[k] : global[k] = prior[k]); W.resetExecution_(); };
  if (t) t.after(restore);
  const text = name => files.get(name)?.content || '';
  const run = fn => { W.resetExecution_(); return fn(); };
  return { files, opens, run, exec: run, post: body => run(() => W.dispatchWrite_(body)), restore,
    advance: ms => { clock += ms; }, row: id => text(MASTER).split('\n').find(l => l.split(' | ')[1] === id),
    master: () => text(MASTER).trimEnd().split('\n'), masterSaves: () => saves, saves: () => saves,
    receipts: () => text('PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS'), events: () => text('PIPELINE_EVENT_LOG.jsonl'), text,
    index: () => files.has('PIPELINE_RECEIPT_INDEX.json') ? JSON.parse(text('PIPELINE_RECEIPT_INDEX.json')) : null,
    logs: name => text(name).split('\n').filter(Boolean).map(JSON.parse),
    fail: (name, operation = 'write', options = {}) => faults.set(name + ':' + operation, { message: options.message || 'Synthetic crash', after: options.after, left: options.times || 1 }) };
}
module.exports = { world, MASTER, RULES };
