'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const Store = require('../apps-script/ReceiptIndexStore.gs');
const W = require('../apps-script/Code.gs');
const {world} = require('./helpers/writer-world');
const empty = () => ({version: 1, updatedAt: '', requests: {}, pending: [], rotations: []});
const sha = text => crypto.createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex');

function github(t, options = {}) {
  const props = {POLICY_SOURCE: 'DRIVE', RECEIPT_INDEX_SOURCE: options.source || 'GITHUB', GITHUB_WRITER_STATE_TOKEN: 'test-token'};
  const w = world(t, options.world);
  const previous = Object.fromEntries(['PropertiesService', 'UrlFetchApp', 'Utilities'].map(k => [k, global[k]]));
  let text = options.text === undefined ? JSON.stringify(empty()) : options.text;
  const calls = [];
  let fault = null;
  global.PropertiesService = {getScriptProperties: () => ({getProperties: () => ({...props}),
    getProperty: k => props[k] || null, setProperty: (k, v) => {props[k] = v;}})};
  global.Utilities = {...previous.Utilities, DigestAlgorithm: {SHA_1: 'SHA_1', SHA_256: 'SHA_256'},
    computeDigest: (algorithm, bytes) => [...crypto.createHash(algorithm === 'SHA_1' ? 'sha1' : 'sha256').update(Buffer.from(bytes)).digest()],
    newBlob: value => ({getBytes: () => [...Buffer.from(value)], getDataAsString: () => Buffer.from(value).toString('utf8')})};
  const response = (code, body) => ({getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body)});
  global.UrlFetchApp = {fetch(url, opt) {
    assert.match(url, /^https:\/\/api.github.com\/repos\/tpruittguitar\/forge-writer-state\/contents\/PIPELINE_RECEIPT_INDEX.json/);
    calls.push({url, opt});
    const err = fault?.(url, opt); if (err) return err;
    if (opt.method === 'get') {
      assert.equal(opt.headers.Accept, 'application/vnd.github.raw');
      return text === null ? response(404, '') : response(200, text);
    }
    const body = JSON.parse(opt.payload);
    if ((text !== null && body.sha !== sha(text)) || (text === null && body.sha)) return response(409, {});
    text = Buffer.from(body.content, 'base64').toString('utf8');
    return response(body.sha ? 200 : 201, {content: {sha: sha(text)}});
  }};
  t.after(() => {Object.assign(global, previous); w.restore();});
  return {w, props, calls, text: () => text, replace: value => {text = value;},
    fault: fn => {fault = fn;}, response, cfg: () => Store.config()};
}

test('raw API handles >1 MB UTF-8 JSON; exact Git blob SHA fences sequential writes', t => {
  const d = empty(); d.requests.abc = {s: 'COMPLETE', note: 'é😀'.repeat(250000)};
  const text = JSON.stringify(d) + '\n', h = github(t, {text});
  assert(Buffer.byteLength(text) > 1000000);
  const read = W.readIndex_();
  assert.equal(read.__receiptIndexRevision.sha, sha(text));
  assert.equal(h.calls[0].opt.headers.Authorization, 'Bearer test-token');
  assert(!JSON.stringify(read).includes('__receiptIndexRevision'));
  read.requests.new = {s: 'PENDING'};
  W.writeIndex_(read);
  const firstPut = h.calls[1];
  assert.equal(JSON.parse(firstPut.opt.payload).sha, sha(text));
  assert.equal(read.__receiptIndexRevision.sha, sha(h.text()));
  W.writeIndex_(read);
  assert.equal(JSON.parse(h.calls[2].opt.payload).sha, sha(Buffer.from(JSON.parse(firstPut.opt.payload).content, 'base64').toString('utf8')));
});

test('stale caller SHA yields REVISION_CONFLICT instead of refreshing and overwriting', t => {
  const h = github(t), a = W.readIndex_(), b = W.readIndex_();
  a.requests.a = {s: 'COMPLETE'}; W.writeIndex_(a);
  b.requests.b = {s: 'COMPLETE'};
  assert.throws(() => W.writeIndex_(b), e => e.mode === 'REVISION_CONFLICT');
  assert.deepEqual(Object.keys(JSON.parse(h.text()).requests), ['a']);
});

test('409 and 422 both conflict, with no retry, Drive fallback or master write', t => {
  const h = github(t);
  for (const code of [409, 422]) {
    h.fault((url, opt) => opt.method === 'put' ? h.response(code, {}) : null);
    const read = W.readIndex_(); read.requests.a = {s: 'PENDING'};
    const before = h.calls.length;
    assert.throws(() => W.writeIndex_(read), e => e.mode === 'REVISION_CONFLICT');
    assert.equal(h.calls.length - before, 1);
  }
  assert.equal(h.w.masterSaves(), 0);
  assert.equal(h.w.index(), null);
});

test('invalid/empty reads, unavailable GitHub and missing token fail closed', t => {
  const h = github(t);
  for (const text of ['', '{', '{}', 'null', '[]', '{"version":1,"requests":[],"pending":[]}']) {
    h.replace(text); assert.throws(() => W.readIndex_(), /receipt index .*\(fail closed\)/);
  }
  for (const code of [401, 403, 404, 429, 503]) {
    h.fault(() => h.response(code, 'unavailable'));
    assert.throws(() => W.readIndex_(), new RegExp('HTTP ' + code));
  }
  delete h.props.GITHUB_WRITER_STATE_TOKEN;
  assert.throws(() => W.readIndex_(), /TOKEN_MISSING/);
  assert.equal(h.w.index(), null);
});

test('unread or malformed objects cannot overwrite the index', t => {
  const h = github(t);
  assert.throws(() => W.writeIndex_(empty()), /BASE_SHA_REQUIRED/);
  for (const bad of [null, {}, [], {version: 1, requests: {}, pending: [{}]}])
    assert.throws(() => W.writeIndex_(bad), /malformed/);
  assert.equal(h.calls.length, 0);
});

test('request IDs cannot be erased by a checkpoint or a migration seed', t => {
  const d = empty(); d.requests.keep = {s: 'COMPLETE'};
  const h = github(t, {text: JSON.stringify(d)}), read = W.readIndex_();
  delete read.requests.keep;
  assert.throws(() => W.writeIndex_(read), /REQUEST_REMOVAL_FORBIDDEN/);
  assert.throws(() => Store.seed(h.cfg(), empty(), sha(h.text())), /SEED_WOULD_LOSE_REQUESTS/);
  assert.equal(h.calls.filter(c => c.opt.method === 'put').length, 0);
});

test('compaction preserves all replay IDs, corrections and pending evidence', () => {
  const d = empty();
  for (let i = 0; i < 150; i++) d.requests['old-' + i] = {s: 'COMPLETE', at: new Date(i * 1000).toISOString(), w: 'W' + i, items: [{pid: 'P', detail: 'bulky'}], snapshotHash: 'snapshot'};
  d.requests.correction = {s: 'FALSE_COMPLETE', items: ['preserve']};
  d.requests.hold = {s: 'NEEDS_RESOLUTION', items: ['preserve']};
  d.pending.push({writeId: 'W-pending', requestIds: ['old-0'], items: [{pid: 'pending'}], verdict: {decision: 'WAIT'}});
  const c = Store.compact(d);
  assert.equal(Object.keys(c.requests).length, 152);
  assert.deepEqual(c.pending, d.pending);
  assert.deepEqual(c.requests['old-0'], d.requests['old-0']);
  assert.equal(c.requests['old-1'].items, undefined);
  assert.equal(c.requests['old-1'].s, 'COMPLETE');
  assert.equal(c.requests['old-1'].w, 'W1');
  assert.equal(c.requests['old-1'].snapshotHash, 'snapshot');
  assert.deepEqual(c.requests.correction, d.requests.correction);
  assert.deepEqual(c.requests.hold, d.requests.hold);
  assert(d.requests['old-1'].items, 'compaction must not mutate the caller');
});

test('durable GitHub intent and fresh readback precede the master effect', t => {
  const row = '1 | TEST-1 | Test | Director | MANUAL_RESEARCH | FL | | | | FLEX_CLASS=HIGH_FLEX';
  const h = github(t);
  const before = h.w.master(), after = [W.recomputeCountsLine([row]), row, 'END V2_CURRENT_POPULATION_MASTER (1 rows)'];
  let observedIntent = false;
  h.fault((url, opt) => {
    if (opt.method === 'get' && JSON.parse(h.text()).pending.length) {
      observedIntent = true;
      assert.equal(h.w.masterSaves(), 0, 'master not written until intent is read back');
    }
  });
  h.w.run(() => W.saveMasterLines_(after, before));
  assert(observedIntent);
  assert.equal(h.w.masterSaves(), 1);
  assert.equal(JSON.parse(h.text()).pending.length, 1);
  assert.equal(h.w.index(), null, 'no Drive index writes in GitHub mode');
});

test('failed or ambiguous intent PUT prevents any master effect and is never retried', t => {
  const h = github(t);
  const row = '1 | TEST-1 | Test | Director | MANUAL_RESEARCH | FL | | | | FLEX_CLASS=HIGH_FLEX';
  h.fault((url, opt) => {if (opt.method === 'put') throw new Error('connection lost');});
  assert.throws(() => h.w.run(() => W.saveMasterLines_([W.recomputeCountsLine([row]), row, 'END V2_CURRENT_POPULATION_MASTER (1 rows)'], h.w.master())), /connection lost/);
  assert.equal(h.w.masterSaves(), 0);
  assert.equal(h.calls.filter(c => c.opt.method === 'put').length, 1);
});

const fixtureRow = '1 | TEST-ONE | Fixture Co | Director Quality | SCOUT_INTAKE | ANALYSIS_PENDING | - | TEST-REQ | Austin, TX | SOURCE_URL=https://example.invalid/role';
const ruling = rid => ({action: 'ruling', ruling: {primaryId: 'TEST-ONE', kind: 'ENRICH', actor: 'FORGE', requestId: rid, fields: {SCOPE_FIT_RAW: '83'}}});
test('GitHub-backed write completes in a later execution and refuses replay', t => {
  const h = github(t, {world: {rows: [fixtureRow]}});
  assert.equal(h.w.post(ruling('GH-WRITE')).verification, 'PENDING');
  assert.equal(JSON.parse(h.text()).requests['GH-WRITE'].s, 'PENDING');
  assert.equal(h.w.run(() => W.verifyPendingWrites_()).decided[0].decision, 'COMPLETE');
  assert.equal(JSON.parse(h.text()).requests['GH-WRITE'].s, 'COMPLETE');
  assert.equal(JSON.parse(h.text()).pending.length, 0);
  assert.equal(h.w.post(ruling('GH-WRITE')).mode, 'ALREADY_APPLIED');
  assert.equal(h.w.masterSaves(), 1);
  assert.equal(h.w.index(), null);
});

test('lost response after persisted intent leaves a recoverable fence and no master effect', t => {
  const h = github(t, {world: {rows: [fixtureRow]}});
  h.fault((url, opt) => {
    if (opt.method === 'put') {
      h.replace(Buffer.from(JSON.parse(opt.payload).content, 'base64').toString('utf8'));
      throw new Error('lost response after GitHub accepted intent');
    }
  });
  assert.throws(() => h.w.post(ruling('GH-LOST')), /lost response/);
  assert.equal(h.w.masterSaves(), 0);
  assert.equal(h.w.row('TEST-ONE'), fixtureRow);
  assert.equal(JSON.parse(h.text()).requests['GH-LOST'].s, 'PENDING');
  h.fault(null);
  assert.equal(h.w.post(ruling('GH-LOST')).mode, 'WRITE_FENCE');
  assert.equal(h.w.masterSaves(), 0);
});

test('migration dry run, freeze/hash guards, fresh seed readback and source switch', t => {
  const h = github(t, {source: 'DRIVE', text: null}), d = empty();
  d.requests.existing = {s: 'COMPLETE', w: 'historical'};
  W.writeIndex_(d);
  const dry = W.migrateReceiptIndex_({dryRun: true});
  assert.equal(dry.mode, 'DRY_RUN'); assert.equal(h.calls.length, 0);
  assert.equal(W.migrateReceiptIndex_({expectedSourceHash: dry.sourceHash}).mode, 'WRITE_FENCE');
  // Use the normal synthetic Drive folder to establish the maintenance freeze.
  h.w.files.values().next().value.getParents().next().createFile('WRITER_FREEZE.json', JSON.stringify({frozen: true, at: '2026-10-18T03:00:00Z', by: 'TIM'}));
  assert.equal(W.migrateReceiptIndex_({expectedSourceHash: 'stale'}).mode, 'REVISION_CONFLICT');
  const result = W.migrateReceiptIndex_({expectedSourceHash: dry.sourceHash});
  assert.equal(result.mode, 'MIGRATED'); assert.equal(h.props.RECEIPT_INDEX_SOURCE, 'GITHUB');
  assert.equal(JSON.parse(h.text()).requests.existing.w, 'historical');
  assert.equal(h.w.index().requests.existing.w, 'historical', 'Drive seed remains untouched');
  assert.equal(W.migrateReceiptIndex_({}).mode, 'ALREADY_MIGRATED');
});

test('migration refuses pending state, seed conflicts and failed readback without switching source', t => {
  const h = github(t, {source: 'DRIVE'}), d = empty();
  const folder = h.w.files.values().next().value.getParents().next();
  folder.createFile('WRITER_FREEZE.json', JSON.stringify({frozen: true, at: '2026-10-18T03:00:00Z', by: 'TIM'}));
  d.pending.push({writeId: 'W1', requestIds: ['request'], items: []}); W.writeIndex_(d);
  assert.equal(W.migrateReceiptIndex_({dryRun: true}).mode, 'WRITE_FENCE');
  d.pending = []; W.writeIndex_(d);
  const dry = W.migrateReceiptIndex_({dryRun: true});
  assert.throws(() => W.migrateReceiptIndex_({expectedSourceHash: dry.sourceHash}), /REVISION_CONFLICT/);
  assert.equal(h.props.RECEIPT_INDEX_SOURCE, 'DRIVE');
  const expected = sha(h.text());
  let written = false;
  h.fault((url, opt) => {
    if (opt.method === 'put') written = true;
    else if (written) return h.response(503, 'offline');
  });
  assert.throws(() => W.migrateReceiptIndex_({expectedSourceHash: dry.sourceHash, expectedGithubSha: expected}), /HTTP 503/);
  assert.equal(h.props.RECEIPT_INDEX_SOURCE, 'DRIVE');
  assert.equal(h.w.masterSaves(), 0);
});
