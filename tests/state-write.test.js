/* REV-017 state-write fix: developer tests beside the independent REV-016 acceptance tests. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const { mergeState_ } = require('../apps-script/stateMerge.js');
const PI = require('../pipeline-incidents.js');
const ev = (id, status, attempts = 1, eventIds = []) => ({ id, kind: 'event', status, attempts, eventIds });

test('Node entry and deployed file are the same code (deploy.sh pushes *.gs only)', () => {
  assert.strictEqual(require('../apps-script/StateMerge.gs').mergeState_, mergeState_);
  assert.ok(!fs.readdirSync(path.join(__dirname, '../apps-script')).some(f => /\.js$/.test(f) && f !== 'stateMerge.js'));
  assert.match(fs.readFileSync(path.join(__dirname, '../apps-script/stateMerge.js'), 'utf8'), /require\('\.\/StateMerge\.gs'\)/);
});

test('new seen marks and incidents are added; larger seen timestamp wins; non-event incidents ignored', () => {
  const m = mergeState_({ seen: { a: 100 }, rulings: {}, incidents: { v: 1, incidents: {} } },
    { seen: { a: 150, c: 300, bad: 'x' }, incidents: { v: 1, incidents: { i3: ev('i3', 'ACTIVE'), c1: { id: 'c1', kind: 'condition', status: 'ACTIVE' } } } });
  assert.deepEqual(m.seen, { a: 150, c: 300 });
  assert.equal(m.incidents.incidents.i3.status, 'ACTIVE'); assert.ok(!m.incidents.incidents.c1);
});

test('ACTIVE moves to an acknowledgement and keeps event history and the larger attempt count', () => {
  const m = mergeState_({ incidents: { v: 1, incidents: { i9: ev('i9', 'ACTIVE', 1, ['e1']) } } },
    { incidents: { v: 1, incidents: { i9: ev('i9', 'ACKNOWLEDGED_UNRESOLVED', 3, ['e2']) } } });
  assert.equal(m.incidents.incidents.i9.status, 'ACKNOWLEDGED_UNRESOLVED');
  assert.deepEqual(m.incidents.incidents.i9.eventIds, ['e1', 'e2']); assert.equal(m.incidents.incidents.i9.attempts, 3);
});

test('legacy stored file without incidents wrapper or with extra fields survives', () => {
  const m = mergeState_({ seen: {}, rulings: {}, extra: { keep: 1 } }, { seen: { x: 1 } });
  assert.equal(m.seen.x, 1); assert.deepEqual(m.incidents.incidents, {}); assert.deepEqual(m.extra, { keep: 1 });
});

test('server merge matches the browser incident merge for all 64 known status/attempt combinations', () => {
  const S = ['ACTIVE', 'ACKNOWLEDGED', 'ACKNOWLEDGED_UNRESOLVED', 'RECOVERED'], diffs = [];
  for (const ls of S) for (const rs of S) for (const la of [1, 2]) for (const ra of [1, 2]) {
    const l = ev('x', ls, la, ['a']), r = ev('x', rs, ra, ['b']);
    const c = PI.merge({ incidents: { x: l } }, { incidents: { x: r } }).store.incidents.x;
    const s = mergeState_({ incidents: { v: 1, incidents: { x: l } } }, { incidents: { v: 1, incidents: { x: r } } }).incidents.incidents.x;
    if (c.status !== s.status || c.attempts !== s.attempts) diffs.push(`${ls}(${la})+${rs}(${ra}) client=${c.status}/${c.attempts} server=${s.status}/${s.attempts}`);
  }
  assert.deepEqual(diffs, []);
});

/* Run the real Code.gs doPost with fake storage, as REV-016 does. */
function post(opts) {
  opts = opts || {};
  const files = { 'PIPELINE_EXPLORER_STATE.json': opts.stored == null ? '{}' : opts.stored }, log = [];
  const mk = name => ({
    getId: () => name, getName: () => name,
    getBlob: () => ({ getDataAsString: () => (opts.corruptReadback && name === 'PIPELINE_EXPLORER_STATE.json' && log.some(x => x[1] === name)) ? 'tampered' : files[name] }),
    setContent: t => { log.push(['set', name, t]); files[name] = t; }
  });
  const it = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const folder = { getFilesByName: n => it(n in files ? [mk(n)] : []), createFile: (n, t) => { log.push(['create', n, t]); files[n] = t; return mk(n); } };
  const sb = {
    mergeState_, DriveApp: { getFileById: () => ({ getParents: () => it([folder]) }), getRootFolder: () => folder },
    LockService: { getScriptLock: () => ({ waitLock() { if (opts.lockTimeout) throw new Error('Lock timeout'); }, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, getProperties: () => ({}) }) },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    ContentService: { MimeType: { JSON: 'j' }, createTextOutput: t => ({ setMimeType() { return this; }, getContent: () => t }) },
    UrlFetchApp: { fetch: () => { throw new Error('no network'); } }
  };
  vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), sb);
  sb.PASSPHRASE = 'T';
  const r = sb.doPost({ postData: { contents: JSON.stringify({ key: 'T', action: 'state', state: opts.incoming || { seen: { n: 5 } } }) } });
  return { res: JSON.parse(r.getContent()), files, log };
}

test('successful write merges, keeps a .prev copy written before the overwrite, and reports counts', () => {
  const stored = JSON.stringify({ seen: { a: 1 }, rulings: { r: { kind: 'DECLINE' } }, incidents: { v: 1, incidents: { i: ev('i', 'ACKNOWLEDGED_UNRESOLVED') } } });
  const o = post({ stored, incoming: { seen: { b: 2 }, rulings: { r: { kind: 'PURSUE' } }, incidents: { v: 1, incidents: {} } } });
  assert.equal(o.res.ok, true); assert.equal(o.res.seen, 2); assert.equal(o.res.incidents, 1);
  const saved = JSON.parse(o.files['PIPELINE_EXPLORER_STATE.json']);
  assert.deepEqual(saved.seen, { a: 1, b: 2 }); assert.deepEqual(saved.rulings, { r: { kind: 'DECLINE' } });
  assert.equal(o.files['PIPELINE_EXPLORER_STATE.json.prev'], stored);
  const order = o.log.map(x => x[1]);
  assert.ok(order.indexOf('PIPELINE_EXPLORER_STATE.json.prev') < order.indexOf('PIPELINE_EXPLORER_STATE.json'), '.prev before main file');
});

test('a stored file that is valid JSON but not an object is refused with no write', () => {
  for (const stored of ['[]', '"x"', 'null']) {
    const o = post({ stored });
    assert.equal(o.res.ok, false); assert.equal(o.res.error, 'STATE_UNREADABLE'); assert.deepEqual(o.log, [], stored);
  }
});

test('a readback that does not match is reported as a failure', () => {
  const o = post({ stored: '{}', corruptReadback: true });
  assert.equal(o.res.ok, false); assert.equal(o.res.error, 'STATE_READBACK_MISMATCH');
});

test('lock timeout: nothing written and the client gets ok:false', () => {
  const o = post({ stored: '{"seen":{"a":1}}', lockTimeout: true });
  assert.equal(o.res.ok, false); assert.deepEqual(o.log, []);
});

test('browser: state sync sends seen and incidents only, records failures, and Needs you shows them', () => {
  const html = fs.readFileSync(path.join(__dirname, '../pipeline.html'), 'utf8');
  const fn = html.match(/function syncStateUp\(\)\{[\s\S]*?\},1500\)\}/)[0];
  assert.ok(fn.indexOf('rulings') < 0, 'rulings are not sent to the state file');
  assert.match(fn, /var body=\{seen:S\.seen,incidents:PipelineIncidents\.forSync\(S\.incidents\)/);
  assert.match(fn, /gsPost\(\{action:'state',state:body\}\)/);
  // D-3 (REV-053): only review records changed since the last good send ride along, and only a good send clears them
  assert.match(fn, /Object\.keys\(S\.reviewDirty\|\|\{\}\)/); assert.match(fn, /if\(j&&j\.ok\)Object\.keys\(sent\)/);
  assert.match(fn, /S\.stateSync=j&&j\.ok\?\{ok:true/);
  assert.ok(fn.indexOf('.catch(function(){})') < 0, 'failures are no longer swallowed');
  const NT = require('../pipeline-needs-tim.js');
  const items = NT.liveItems({ now: 1, stateSync: { ok: false, at: 1, error: 'STATE_UNREADABLE' } });
  assert.equal(items[0].id, 'live:state-sync'); assert.equal(items[0].section, 'FAILED');
  assert.equal(NT.liveItems({ now: 1, stateSync: { ok: true, at: 1 } }).length, 0);
});
