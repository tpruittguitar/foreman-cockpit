// Explorer master loading: three separate Writer reads merged in the browser, fail closed on freshness, read-only,
// byte-identical to the Writer's hydrated view; plus the identity REQ-precedence rule.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const W = require('../apps-script/Code.gs');
const L = require('../pipeline-loader.js');
const repo = path.resolve(__dirname, '..');

// ---------- fixture: the sample master split by the Writer's own migration planner ----------
const sample = fs.readFileSync(path.join(repo, 'tests/fixtures/master.sample.txt'), 'utf8').replace(/\r/g, '');
const plan = W.planMasterMigration_(sample.split('\n'), { at: '2026-10-05T00:00:00.000Z' });
// The live master always ends with an END line (the Writer rewrites it on every write); the sample predates that, so add it.
const MASTER = (() => { const l = plan.target.concat(['END V2_CURRENT_POPULATION_MASTER (0 rows)']); const end = W.recomputeEndLine(l); return l.map(x => /^END V2_/.test(x) ? end : x).join('\n'); })();
const ARCHIVE_ID = 'ARCH-1', COMPANION_ID = 'COMP-1';
const restoredRow = plan.archive[0], restoredCells = restoredRow.split(' | ');
const ARCHIVE_TEXT = ['V2_TERMINAL_ARCHIVE (read-only terminal history; not a population)', '================'].concat(plan.archive)
  .concat(['RESTORED|' + restoredCells[1].trim() + '|' + restoredCells[0] + '|2026-10-05T01:00:00Z|R-1']).join('\n');
const COMPANION_TEXT = [JSON.stringify({ type: 'HEADER', schema: 'EVC1' })].concat(plan.records.map(r => JSON.stringify(r))).join('\n');
const MIG = { migrationId: 'MIG-1', mode: 'LIVE', status: 'CUTOVER_COMPLETE', archiveId: ARCHIVE_ID, companionId: COMPANION_ID };
const writerView = () => W.hydrateLines_(MASTER.split(/\r?\n/), W.parseArchive_(ARCHIVE_TEXT), W.parseCompanion_(COMPANION_TEXT)).join('\n');
const rowLines = t => t.split('\n').filter(l => /^\d+ \| /.test(l));

test('fixture sanity: the split exercises evidence pointers, archived rows and a RESTORED marker', () => {
  assert.ok(rowLines(MASTER).some(l => /EVIDENCE_REF=EVC1:\d+/.test(l)));
  assert.ok(plan.archive.length >= 2);
  assert.ok(plan.records.length >= 2);
});

// ---------- fake Writer reads ----------
function writer(over) {
  over = over || {};
  const calls = [];
  const ok = {
    master: () => ({ ok: true, id: 'MASTER', fetchedAt: '2026-10-05T04:00:00.000Z', modifiedTime: '2026-10-05T03:49:50.636Z', text: MASTER }),
    archive: () => ({ ok: true, archiveId: ARCHIVE_ID, mode: 'LIVE', text: ARCHIVE_TEXT }),
    migration_status: () => ({ ok: true, state: MIG, freeze: null }),
    document_text: extra => ({ ok: true, fileId: decodeURIComponent(extra.replace('&fileId=', '')), name: 'V2_EVIDENCE_COMPANION.jsonl', text: COMPANION_TEXT })
  };
  const get = (action, extra) => {
    calls.push(action);
    const f = over[action] || ok[action];
    if (!f) return Promise.reject(new Error('unexpected action ' + action));
    return Promise.resolve().then(() => f(extra));
  };
  return { get, calls };
}
function memCache(initial) { let v = initial || null, writes = 0; return { read: () => v, write: x => { v = x; writes++; }, get value() { return v; }, get writes() { return writes; } }; }
async function run(w, cache) { const updates = []; const final = await L.load({ get: w.get, cache: cache || memCache(), onUpdate: v => updates.push(v) }); return { final, updates }; }
const htmlRejection = () => { throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"); };

// 1 + 9
test('all three reads succeed: LIVE, and the view is byte-identical to the Writer hydrated view', async () => {
  const w = writer(), c = memCache();
  const { final, updates } = await run(w, c);
  assert.equal(final.freshness, 'LIVE');
  assert.equal(final.archive.state, 'OK'); assert.equal(final.evidence.state, 'OK');
  assert.equal(final.text, writerView());
  assert.equal(updates[0].freshness, 'LIVE', 'first update is the fresh canonical master, before enrichment');
  assert.equal(updates[0].text, MASTER);
  assert.equal(c.value.text, writerView(), 'cache holds the fully merged view');
  assert.equal(c.writes, 1, 'cache written once, after both components settled');
});

test('the restored archive row is excluded exactly as the Writer excludes it', async () => {
  const { final } = await run(writer());
  const restoredPid = restoredCells[1].trim();
  assert.ok(!final.text.split('\n').some(l => l.startsWith(restoredCells[0] + ' | ' + restoredPid + ' |') && /ARCHIVE_STATE=ARCHIVED_TERMINAL/.test(l)));
});

// 2
test('master ok + archive failure: still LIVE; archive FAILED; evidence merged; no archived rows; canonical rows intact', async () => {
  const { final } = await run(writer({ archive: htmlRejection }));
  assert.equal(final.freshness, 'LIVE');
  assert.equal(final.archive.state, 'FAILED'); assert.match(final.archive.error, /archive read failed/);
  assert.equal(final.evidence.state, 'OK');
  assert.ok(!/ARCHIVE_STATE=ARCHIVED_TERMINAL/.test(final.text));
  assert.equal(final.text, W.hydrateLines_(MASTER.split('\n'), [], W.parseCompanion_(COMPANION_TEXT)).join('\n'));
});

test('archive response for a different archive id is rejected, not merged', async () => {
  const { final } = await run(writer({ archive: () => ({ ok: true, archiveId: 'OTHER', text: ARCHIVE_TEXT }) }));
  assert.equal(final.archive.state, 'FAILED'); assert.match(final.archive.error, /archive id mismatch/);
});

// 3
test('master ok + evidence failure: still LIVE; evidence FAILED; archive merged; nothing falsely flagged EVIDENCE_UNRESOLVED', async () => {
  const { final } = await run(writer({ document_text: htmlRejection }));
  assert.equal(final.freshness, 'LIVE');
  assert.equal(final.evidence.state, 'FAILED');
  assert.equal(final.archive.state, 'OK');
  assert.ok(/ARCHIVE_STATE=ARCHIVED_TERMINAL/.test(final.text));
  assert.ok(!/EVIDENCE_UNRESOLVED/.test(final.text));
  rowLines(MASTER).forEach(l => assert.ok(final.text.includes(l), 'canonical row kept verbatim'));
});

test('a corrupt companion is an evidence failure, never a partial merge', async () => {
  const { final } = await run(writer({ document_text: e => ({ ok: true, fileId: COMPANION_ID, text: COMPANION_TEXT + '\n{not json' }) }));
  assert.equal(final.evidence.state, 'FAILED'); assert.match(final.evidence.error, /unreadable/);
});

test('migration-status failure fails both components but not the canonical master', async () => {
  const { final } = await run(writer({ migration_status: () => ({ ok: false, error: 'boom' }) }));
  assert.equal(final.freshness, 'LIVE');
  assert.equal(final.archive.state, 'FAILED'); assert.equal(final.evidence.state, 'FAILED');
  assert.equal(final.text, MASTER);
});

test('before a live cutover there is nothing to merge: the view is the canonical master verbatim', async () => {
  const { final } = await run(writer({ migration_status: () => ({ ok: true, state: Object.assign({}, MIG, { mode: 'REHEARSAL' }) }) }));
  assert.equal(final.archive.state, 'NOT_APPLICABLE'); assert.equal(final.evidence.state, 'NOT_APPLICABLE');
  assert.equal(final.text, MASTER);
});

// 4 + 7
test('master failure with a cache: STALE, cached text shown with fromCache, error carried, cache never overwritten', async () => {
  const cached = { text: 'CACHED VIEW', meta: { fetchedAt: '2026-10-04T10:00:00.000Z' } }, c = memCache(cached);
  const { final, updates } = await run(writer({ master: htmlRejection }), c);
  assert.equal(final.freshness, 'STALE');
  assert.equal(final.fromCache, true);
  assert.equal(final.text, 'CACHED VIEW');
  assert.match(final.error, /master read failed/);
  assert.equal(c.writes, 0);
  assert.equal(updates.length, 1);
  assert.notEqual(final.freshness, 'LIVE');
});

// 5
test('master failure without a cache: NONE, no text', async () => {
  const { final } = await run(writer({ master: () => ({ ok: false, error: 'bad key' }) }));
  assert.equal(final.freshness, 'NONE'); assert.equal(final.text, ''); assert.equal(final.error, 'bad key');
});

// 6
test('malformed master responses never count as current', async () => {
  const bad = [
    ['HTML error page', htmlRejection],
    ['ok:false', () => ({ ok: false, error: 'unknown action master' })],
    ['no text', () => ({ ok: true })],
    ['truncated mid-header (no rows)', () => ({ ok: true, text: MASTER.split('\n').slice(0, 3).join('\n') })],
    ['no COUNTS line', () => ({ ok: true, text: MASTER.split('\n').filter(l => !/^COUNTS:/.test(l)).join('\n') })],
    ['no rows', () => ({ ok: true, text: 'COUNTS: TOTAL=0\nEND V2_CURRENT_POPULATION_MASTER (0 rows)' })],
    ['null', () => null]
  ];
  for (const [name, f] of bad) {
    const { final } = await run(writer({ master: f }));
    assert.notEqual(final.freshness, 'LIVE', name);
    assert.ok(final.error, name + ' carries an error');
  }
});

test('a failure after a live load: the stale cache is the last fully merged live view', async () => {
  const c = memCache();
  await run(writer(), c);
  const { final } = await run(writer({ master: htmlRejection }), c);
  assert.equal(final.freshness, 'STALE'); assert.equal(final.text, writerView());
});

// 8
test('read-only: every request is a read action, in success and in every failure path', async () => {
  const scenarios = [{}, { master: htmlRejection }, { archive: htmlRejection }, { document_text: htmlRejection }, { migration_status: htmlRejection }, { master: () => ({ ok: false }) }];
  for (const s of scenarios) {
    const w = writer(s);
    await run(w, memCache({ text: 'X', meta: {} }));
    assert.ok(w.calls.length > 0);
    w.calls.forEach(a => assert.ok(L.READ_ACTIONS.includes(a), 'read action ' + a));
  }
  assert.deepEqual(L.READ_ACTIONS, ['master', 'archive', 'migration_status', 'document_text', 'evidence']);
});

test('on-demand row evidence uses the read-only evidence action', async () => {
  const calls = [];
  const r = await L.rowEvidence((a, e) => { calls.push([a, e]); return { ok: true, fields: { SCOUT_NOTES: 'n' } }; }, 'V2I-1');
  assert.deepEqual(calls, [['evidence', '&primaryId=V2I-1']]); assert.equal(r.fields.SCOUT_NOTES, 'n');
});

// 9: the browser copies are the Writer's functions, byte for byte
test('ported hydration functions and constants are identical to apps-script/Code.gs', () => {
  const code = fs.readFileSync(path.join(repo, 'apps-script/Code.gs'), 'utf8'), port = fs.readFileSync(path.join(repo, 'pipeline-loader.js'), 'utf8');
  const fn = (src, name) => { const i = src.search(new RegExp('\\n\\s*function ' + name.replace('$', '\\$') + '\\(')); assert.ok(i >= 0, name); let j = src.indexOf('{', i), d = 0, k = j; for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) break; } return src.slice(i, k + 1).split('\n').map(l => l.trim()).join('\n').trim(); };
  ['parsePayload', 'buildPayload', 'rowParts_', 'evidenceRefOf_', 'parseCompanion_', 'resolveEvidence_', 'parseArchive_', 'rowKey_', 'hydrateLines_', 'recomputeCountsLine', 'recomputeEndLine', 'liveArchiveState_']
    .forEach(n => assert.equal(fn(port, n), fn(code, n), n + ' drifted from Code.gs'));
  ['FIXED_N', 'BUCKETS', 'ARCHIVE_BUCKETS'].forEach(n => { const re = new RegExp('^\\s*var ' + n + ' = .*$', 'm'); assert.equal(port.match(re)[0].trim(), code.match(re)[0].trim(), n); });
});

// ---------- 10: identity REQ precedence (the Explorer's own functions, read from pipeline.html) ----------
const html = fs.readFileSync(path.join(repo, 'pipeline.html'), 'utf8');
const hasResolvedIdentity_ = new Function(html.match(/function usableReq_\(v\)\{[\s\S]*?\n/)[0] + html.match(/function hasResolvedIdentity_\(r\)\{[\s\S]*?\n/)[0] + ';return hasResolvedIdentity_;')();
const idRow = (req, payload) => ({ PRIMARY_ID: 'V2I-TEST', COMPANY: 'Acme', TITLE: 'Director of Quality', LOCATION: 'Austin, TX', REQ: req, payload: Object.assign({ IDENTITY_CONFIDENCE: 'HIGH' }, payload) });

test('REQ precedence: a sentinel fixed REQ does not mask a usable payload REQ_ID', () => {
  assert.equal(hasResolvedIdentity_(idRow('UNCAPTURED', { REQ_ID: '376' })), true);
  ['UNKNOWN', 'unknown', '-', '', '  ', undefined].forEach(s => assert.equal(hasResolvedIdentity_(idRow(s, { REQ_ID: '376' })), true, JSON.stringify(s)));
});
test('REQ precedence: a usable fixed REQ still wins over the payload REQ_ID', () => {
  // a usable fixed REQ resolves even when the payload REQ_ID is a sentinel
  assert.equal(hasResolvedIdentity_(idRow('R26_04429', { REQ_ID: 'UNKNOWN' })), true);
  assert.equal(hasResolvedIdentity_(idRow('R26_04429', { REQ_ID: '376' })), true);
});
test('REQ precedence: both unusable -> unresolved unless a valid URL satisfies the rule', () => {
  assert.equal(hasResolvedIdentity_(idRow('UNCAPTURED', { REQ_ID: 'UNKNOWN' })), false);
  assert.equal(hasResolvedIdentity_(idRow('-', {})), false);
  assert.equal(hasResolvedIdentity_(idRow('UNCAPTURED', { REQ_ID: 'UNKNOWN', SOURCE_URL: 'https://example.com/jobs/1' })), true);
  assert.equal(hasResolvedIdentity_(idRow('UNCAPTURED', { REQ_ID: '-', COMPANY_SOURCE_URL: 'not-a-url' })), false);
});
test('REQ precedence does not bypass the rest of the identity rule', () => {
  assert.equal(hasResolvedIdentity_(idRow('UNCAPTURED', { REQ_ID: '376', IDENTITY_CONFIDENCE: 'LOW' })), false);
  assert.equal(hasResolvedIdentity_(idRow('UNCAPTURED', { REQ_ID: '376', POSSIBLE_MATCHES: 'V2I-X' })), false);
  assert.equal(hasResolvedIdentity_(Object.assign(idRow('UNCAPTURED', { REQ_ID: '376' }), { LOCATION: '' })), false);
});
