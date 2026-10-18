'use strict';

// REV-016: authored from Tim's five acceptance requirements, independently of
// any proposed merger. Expectations below are literal, not another merge model.
// Contract: named CommonJS export mergeState_(current, incoming), returning the
// merged state directly; an unavailable stored state must throw/refuse.
// The required module is deliberately absent when these tests are introduced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { mergeState_ } = require('../apps-script/stateMerge.js');

function stored() {
  return {
    seen: { 'V2I-A': 100, 'V2I-B': 200 },
    rulings: {
      'V2I-A': {
        kind: 'DECLINE', actor: 'TIM', ts: '2026-10-18T10:00:00Z',
        requestId: 'TIM-DECISION-A', writeStatus: 'VERIFIED'
      }
    },
    incidents: {
      v: 1,
      incidents: {
        'incident-ack': {
          id: 'incident-ack', kind: 'event', status: 'ACKNOWLEDGED_UNRESOLVED',
          latestAt: '2026-10-18T11:00:00Z'
        },
        'incident-active': {
          id: 'incident-active', kind: 'event', status: 'ACTIVE',
          latestAt: '2026-10-18T11:30:00Z'
        }
      }
    },
    updatedAt: '2026-10-18T12:00:00Z'
  };
}

// (1) Client-supplied rulings cannot replace, delete, or add stored rulings.
test('incoming newer ruling leaves the stored Tim ruling exactly intact', () => {
  const merged = mergeState_(stored(), {
    rulings: {
      'V2I-A': {
        kind: 'PURSUE', actor: 'CHATGPT', ts: '2099-01-01T00:00:00Z',
        requestId: 'CLIENT-OVERRIDE', writeStatus: 'VERIFIED'
      }
    }
  });
  assert.deepStrictEqual(merged.rulings, {
    'V2I-A': {
      kind: 'DECLINE', actor: 'TIM', ts: '2026-10-18T10:00:00Z',
      requestId: 'TIM-DECISION-A', writeStatus: 'VERIFIED'
    }
  });
});

test('incoming empty or null rulings cannot erase stored rulings', () => {
  for (const incoming of [{ rulings: {} }, { rulings: null }, {}]) {
    const merged = mergeState_(stored(), incoming);
    assert.deepStrictEqual(merged.rulings, {
      'V2I-A': {
        kind: 'DECLINE', actor: 'TIM', ts: '2026-10-18T10:00:00Z',
        requestId: 'TIM-DECISION-A', writeStatus: 'VERIFIED'
      }
    });
  }
});

test('incoming ruling for a new identity is not inserted into stored rulings', () => {
  const merged = mergeState_(stored(), {
    rulings: { 'V2I-INJECTED': { kind: 'DECLINE', actor: 'TIM', ts: '2099-01-01T00:00:00Z' } }
  });
  assert.deepStrictEqual(merged.rulings, {
    'V2I-A': {
      kind: 'DECLINE', actor: 'TIM', ts: '2026-10-18T10:00:00Z',
      requestId: 'TIM-DECISION-A', writeStatus: 'VERIFIED'
    }
  });
});

// (2) Omitted keys in an older browser snapshot are not deletion instructions.
test('stale empty seen and incident maps retain every stored key and incident id', () => {
  const merged = mergeState_(stored(), {
    seen: {}, rulings: {}, incidents: { v: 1, incidents: {} },
    updatedAt: '2026-01-01T00:00:00Z'
  });
  assert.deepStrictEqual(Object.keys(merged.seen).sort(), ['V2I-A', 'V2I-B']);
  assert.deepStrictEqual(Object.keys(merged.incidents.incidents).sort(), ['incident-ack', 'incident-active']);
  assert.strictEqual(merged.incidents.incidents['incident-ack'].id, 'incident-ack');
  assert.strictEqual(merged.incidents.incidents['incident-active'].id, 'incident-active');
});

test('stale partial maps retain stored entries omitted from that snapshot', () => {
  const merged = mergeState_(stored(), {
    seen: { 'V2I-A': 50 },
    incidents: { v: 1, incidents: {
      'incident-active': { id: 'incident-active', kind: 'event', status: 'ACTIVE' }
    } },
    updatedAt: '2026-01-01T00:00:00Z'
  });
  assert.deepStrictEqual(Object.keys(merged.seen).sort(), ['V2I-A', 'V2I-B']);
  assert.deepStrictEqual(Object.keys(merged.incidents.incidents).sort(), ['incident-ack', 'incident-active']);
  assert.strictEqual(merged.incidents.incidents['incident-ack'].id, 'incident-ack');
});

test('stale payload omitting whole maps retains stored seen keys and incident ids', () => {
  const merged = mergeState_(stored(), { updatedAt: '2026-01-01T00:00:00Z' });
  assert.deepStrictEqual(Object.keys(merged.seen).sort(), ['V2I-A', 'V2I-B']);
  assert.deepStrictEqual(Object.keys(merged.incidents.incidents).sort(), ['incident-ack', 'incident-active']);
});

// (3) Even a newer incoming timestamp or claimed recovery cannot undo an ack.
for (const status of ['ACTIVE', 'RECOVERED', 'HISTORICAL', 'UNKNOWN_FROM_CLIENT', '', null]) {
  test(`acknowledged unresolved incident stays ACKNOWLEDGED_UNRESOLVED for incoming ${JSON.stringify(status)}`, () => {
    const merged = mergeState_(stored(), {
      incidents: { v: 1, incidents: {
        'incident-ack': {
          id: 'incident-ack', kind: 'event', status,
          latestAt: '2099-01-01T00:00:00Z',
          recoveredAt: '2099-01-01T00:00:00Z',
          recoveryEvidence: 'Client claims recovery'
        }
      } },
      updatedAt: '2099-01-01T00:00:00Z'
    });
    assert.strictEqual(merged.incidents.incidents['incident-ack'].status, 'ACKNOWLEDGED_UNRESOLVED');
  });
}

test('omitted incoming status cannot clear ACKNOWLEDGED_UNRESOLVED', () => {
  const merged = mergeState_(stored(), {
    incidents: { v: 1, incidents: {
      'incident-ack': { id: 'incident-ack', kind: 'event', latestAt: '2099-01-01T00:00:00Z' }
    } }
  });
  assert.strictEqual(merged.incidents.incidents['incident-ack'].status, 'ACKNOWLEDGED_UNRESOLVED');
});

// (4) Unknown strings, missing values and wrong types cannot become status.
for (const status of ['UNKNOWN_FROM_CLIENT', 'active', '', null, 17, false, {}, []]) {
  test(`active incident stays ACTIVE for unknown incoming status ${JSON.stringify(status)}`, () => {
    const merged = mergeState_(stored(), {
      incidents: { v: 1, incidents: {
        'incident-active': {
          id: 'incident-active', kind: 'event', status,
          latestAt: '2099-01-01T00:00:00Z'
        }
      } },
      updatedAt: '2099-01-01T00:00:00Z'
    });
    assert.strictEqual(merged.incidents.incidents['incident-active'].status, 'ACTIVE');
  });
}

test('omitted incoming status leaves the stored incident ACTIVE', () => {
  const merged = mergeState_(stored(), {
    incidents: { v: 1, incidents: {
      'incident-active': { id: 'incident-active', kind: 'event', latestAt: '2099-01-01T00:00:00Z' }
    } }
  });
  assert.strictEqual(merged.incidents.incidents['incident-active'].status, 'ACTIVE');
});

// (5) No valid stored state is not permission to treat it as an empty object.
test('unavailable stored state is refused rather than replaced by incoming state', () => {
  assert.throws(() => mergeState_(null, { seen: { 'V2I-CLIENT': 300 } }));
  assert.throws(() => mergeState_(undefined, { seen: { 'V2I-CLIENT': 300 } }));
});

// Exercise the real production Apps Script POST entrypoint, not a test-local
// merge-then-write imitation. Only storage/network/runtime services are fakes.
// Code.gs is deployed-source context, not a proposed state-fix implementation.
function postWithUnreadableState(failure) {
  const writes = [];
  let stateReads = 0;
  let storedBytes = '{"seen":';
  const stateFile = {
    getId: () => 'REV016-STATE', getName: () => 'PIPELINE_EXPLORER_STATE.json',
    getBlob: () => {
      stateReads++;
      if (failure === 'READ_ERROR') throw new Error('REV016 injected stored-file read failure');
      return { getDataAsString: () => storedBytes };
    },
    setContent: text => { writes.push(['setContent', text]); storedBytes = text; return stateFile; }
  };
  const iterator = entries => {
    let next = 0;
    return { hasNext: () => next < entries.length, next: () => entries[next++] };
  };
  const folder = {
    getFilesByName: name => iterator(name === 'PIPELINE_EXPLORER_STATE.json' ? [stateFile] : []),
    createFile: (name, text) => { writes.push(['createFile', name, text]); return stateFile; }
  };
  const sandbox = {
    mergeState_,
    DriveApp: {
      getFileById: id => id === 'REV016-STATE' ? stateFile : { getParents: () => iterator([folder]) },
      getRootFolder: () => folder
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, getProperties: () => ({}) }) },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: text => ({ setMimeType() { return this; }, getContent: () => text })
    },
    UrlFetchApp: { fetch: () => { throw new Error('REV016 forbids network in acceptance tests'); } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), sandbox);
  sandbox.PASSPHRASE = 'REV016-TEST-ONLY';
  const response = sandbox.doPost({ postData: { contents: JSON.stringify({
    key: 'REV016-TEST-ONLY', action: 'state',
    state: { seen: { 'V2I-CLIENT': 300 }, rulings: {}, incidents: { v: 1, incidents: {} } }
  }) } });
  return { result: JSON.parse(response.getContent()), writes, storedBytes, stateReads };
}

for (const failure of ['READ_ERROR', 'MALFORMED_JSON']) {
  test(`state POST refuses ${failure} and performs zero writes`, () => {
    const outcome = postWithUnreadableState(failure);
    assert.strictEqual(outcome.result.ok, false);
    assert.deepStrictEqual(outcome.writes, []);
    assert.strictEqual(outcome.storedBytes, '{"seen":');
    assert.ok(outcome.stateReads >= 1, 'refusal must be reached after attempting the actual stored-file read');
  });
}
