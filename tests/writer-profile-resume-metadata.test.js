const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');
const ID = 'synthetic_profile_resume';
const MODIFIED = '2026-10-25T12:30:00.000Z';
const NOW = '2026-11-07T04:30:00.000Z';
const SCHEMA = 'forge.profile-resume-metadata.v1';
const plain = value => JSON.parse(JSON.stringify(value));
const iterator = items => { let i = 0; return { hasNext: () => i < items.length, next: () => items[i++] }; };

function runtime(overrides = {}) {
  const calls = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } }
  const c = vm.createContext({ Date: Clock, PropertiesService: require('./helpers/writer-runtime-fixture.cjs').service() });
  vm.runInContext(source, c);
  Object.assign(c, {
    MASTER_ID: 'synthetic_active_master', FROZEN_MASTER_ID: 'synthetic_frozen_master', PASSPHRASE: 'synthetic-test-key',
    DOCS_ROOT_ID: 'synthetic_docs_root', RESUMES_FOLDER_ID: 'synthetic_resumes', COVER_LETTERS_FOLDER_ID: 'synthetic_cover_letters',
    SUPPORTING_DOCS_FOLDER_ID: 'synthetic_supporting', TIM_VOICE_FOLDER_ID: 'synthetic_voice', INTERVIEW_NOTES_FOLDER_ID: 'synthetic_interviews'
  });
  const file = new Proxy({
    getId: () => ID, isTrashed: () => false, getMimeType: () => 'application/vnd.google-apps.document',
    getLastUpdated: () => new Date(MODIFIED), ...overrides
  }, { get(target, name) { if (!(name in target)) throw new Error('Forbidden file operation: ' + String(name)); calls.push(String(name)); return target[name]; } });
  c.DriveApp = {
    getFileById: id => { calls.push(['getFileById', id]); return file; },
    getFolderById: () => { throw new Error('Unexpected folder read'); }
  };
  c.DocumentApp = new Proxy({}, { get() { throw new Error('Document contents are forbidden'); } });
  c.out_ = plain;
  return { c, calls, file };
}

function documentsRuntime({ config = { existing: true }, fileOverrides = {}, failMetadata = false } = {}) {
  const state = runtime(fileOverrides), { c, calls } = state;
  const old = { id: 'synthetic_older_resume', name: 'Synthetic inventory resume', mimeType: 'application/pdf', modifiedTime: '2026-09-01T00:00:00.000Z', url: 'https://example.test/synthetic', size: 12 };
  const configFile = { getBlob: () => ({ getDataAsString: () => typeof config === 'string' ? config : JSON.stringify(config) }) };
  c.DriveApp.getFolderById = id => {
    calls.push(['getFolderById', id]);
    if (id === c.DOCS_ROOT_ID) return {
      getFilesByName: name => { assert.equal(name, c.JOB_DOCS_CONFIG_NAME); return iterator(config === null ? [] : [configFile]); },
      createFile: () => { throw new Error('Documents GET must never create a config'); }
    };
    return { getFiles: () => iterator(id === c.RESUMES_FOLDER_ID ? [{
      getId: () => old.id, getName: () => old.name, getMimeType: () => old.mimeType,
      getLastUpdated: () => new Date(old.modifiedTime), getUrl: () => old.url, getSize: () => old.size
    }] : []) };
  };
  if (failMetadata) c.DriveApp.getFileById = () => { throw new Error('PRIVATE_ERROR_DETAILS'); };
  return { ...state, old };
}

function verifyShape(proof) {
  assert.equal(proof.schema, SCHEMA);
  assert.equal(proof.source, 'DIRECT_FILE_METADATA');
  assert.equal(proof.checkedAt, NOW);
  assert.deepEqual(Object.keys(proof).sort(), ['schema', 'status', 'source', 'id', 'modifiedTime', 'checkedAt', ...(proof.reason ? ['reason'] : [])].sort());
}

test('direct profile metadata verifies the exact ID/version without reading contents or other metadata', () => {
  const { c, calls } = runtime();
  const proof = plain(c.readProfileResumeMetadata_(ID));
  verifyShape(proof);
  assert.deepEqual(proof, { schema: SCHEMA, status: 'VERIFIED', source: 'DIRECT_FILE_METADATA', id: ID, modifiedTime: MODIFIED, checkedAt: NOW });
  assert.deepEqual(calls, [['getFileById', ID], 'getId', 'isTrashed', 'getMimeType', 'getLastUpdated']);
});

test('each request reads current metadata again instead of reusing a previous proof', () => {
  let modified = MODIFIED;
  const { c, calls } = runtime({ getLastUpdated: () => new Date(modified) });
  assert.equal(c.readProfileResumeMetadata_(ID).modifiedTime, MODIFIED);
  modified = '2026-11-07T04:25:00.000Z';
  assert.equal(c.readProfileResumeMetadata_(ID).modifiedTime, modified);
  assert.equal(calls.filter(call => Array.isArray(call) && call[0] === 'getFileById').length, 2);
});

test('invalid IDs fail closed without touching Drive or echoing arbitrary input', () => {
  for (const invalid of [undefined, null, '', [], {}, 123, 'short', 'https://example.test/file', ' synthetic_profile_resume', 'a\nb', 'a'.repeat(201)]) {
    const { c, calls } = runtime();
    const proof = c.readProfileResumeMetadata_(invalid);
    verifyShape(proof);
    assert.equal(proof.status, 'UNKNOWN'); assert.equal(proof.reason, 'INVALID_ID');
    assert.equal(proof.id, ''); assert.equal(proof.modifiedTime, ''); assert.deepEqual(calls, []);
  }
});

test('frozen rollback and active master cannot be profile sources and are never opened', () => {
  const { c, calls } = runtime();
  assert.equal(c.readProfileResumeMetadata_(c.FROZEN_MASTER_ID).reason, 'FROZEN_MASTER_FORBIDDEN');
  assert.equal(c.readProfileResumeMetadata_(c.MASTER_ID).reason, 'MASTER_FORBIDDEN');
  assert.deepEqual(calls, []);
  assert.throws(() => c.readMasterText_(c.FROZEN_MASTER_ID), /FROZEN_MASTER_FORBIDDEN/);
  assert.equal(c.readDocumentText_(c.FROZEN_MASTER_ID).error, 'FROZEN_MASTER_FORBIDDEN');
  assert.deepEqual(calls, []);
});

for (const [name, overrides, reason] of [
  ['mismatched file', { getId: () => 'synthetic_other_file' }, 'FILE_ID_MISMATCH'],
  ['trashed file', { isTrashed: () => true }, 'FILE_TRASHED'],
  ['folder', { getMimeType: () => 'application/vnd.google-apps.folder' }, 'FILE_TYPE_UNSUPPORTED'],
  ['shortcut', { getMimeType: () => 'application/vnd.google-apps.shortcut' }, 'FILE_TYPE_UNSUPPORTED'],
  ['missing MIME', { getMimeType: () => '' }, 'FILE_TYPE_UNSUPPORTED'],
  ['invalid date', { getLastUpdated: () => new Date('invalid') }, 'INVALID_MODIFIED_TIME'],
  ['missing date', { getLastUpdated: () => null }, 'INVALID_MODIFIED_TIME'],
  ['non-date value', { getLastUpdated: () => MODIFIED }, 'INVALID_MODIFIED_TIME']
]) test(name + ' cannot certify profile freshness', () => {
  const { c } = runtime(overrides);
  const proof = c.readProfileResumeMetadata_(ID);
  verifyShape(proof);
  assert.equal(proof.status, 'UNKNOWN'); assert.equal(proof.reason, reason); assert.equal(proof.modifiedTime, '');
});

test('Drive or individual metadata failures are sanitized and remain unknown', () => {
  for (const method of ['getFileById', 'getId', 'isTrashed', 'getMimeType', 'getLastUpdated']) {
    const failure = () => { throw new Error('PRIVATE_ERROR_DETAILS'); };
    const { c } = runtime(method === 'getFileById' ? {} : { [method]: failure });
    if (method === 'getFileById') c.DriveApp.getFileById = failure;
    const proof = c.readProfileResumeMetadata_(ID);
    verifyShape(proof);
    assert.equal(proof.status, 'UNKNOWN'); assert.equal(proof.reason, 'FILE_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(proof), /PRIVATE_ERROR_DETAILS/);
  }
});

test('authenticated documents GET includes independent exact-file proof and leaves inventory intact', () => {
  const { c, old } = documentsRuntime();
  const without = c.doGet({ parameter: { action: 'documents', key: 'synthetic-test-key' } });
  const withProof = c.doGet({ parameter: { action: 'documents', key: 'synthetic-test-key', profileResumeId: ID } });
  assert.equal(withProof.ok, true); assert.equal(withProof.profileResume.status, 'VERIFIED');
  assert.deepEqual(withProof.resumes, [old]); assert.equal(withProof.resumes.some(file => file.id === ID), false);
  delete withProof.profileResume;
  assert.deepEqual(withProof, without);
  assert.equal(Object.hasOwn(without, 'profileResume'), false);
});

test('bad authentication refuses both folder and direct file access', () => {
  const { c, calls } = documentsRuntime();
  assert.deepEqual(c.doGet({ parameter: { action: 'documents', key: 'wrong', profileResumeId: ID } }), { ok: false, error: 'bad key' });
  assert.deepEqual(calls, []);
});

test('unavailable profile metadata does not destroy the documents response', () => {
  const { c, old } = documentsRuntime({ failMetadata: true });
  const result = c.doGet({ parameter: { action: 'documents', key: 'synthetic-test-key', profileResumeId: ID } });
  assert.equal(result.ok, true); assert.deepEqual(result.resumes, [old]);
  assert.equal(result.profileResume.status, 'UNKNOWN'); assert.equal(result.profileResume.reason, 'FILE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ERROR_DETAILS/);
});

test('missing or unreadable config is not created by documents GET, with or without profile ID', () => {
  for (const config of [null, '{invalid']) for (const profileResumeId of [undefined, ID]) {
    const { c, old } = documentsRuntime({ config });
    const result = plain(c.readJobDocuments_(profileResumeId));
    assert.equal(result.ok, true); assert.deepEqual(result.config, {}); assert.deepEqual(result.resumes, [old]);
    if (profileResumeId) assert.equal(result.profileResume.status, 'VERIFIED');
  }
});

test('approve-resume retains explicit creation and canonical-folder enforcement', () => {
  const { c } = runtime();
  let stored = null, creates = 0, writes = 0, events = 0;
  const configFile = { getBlob: () => ({ getDataAsString: () => stored }), setContent: value => { writes++; stored = value; } };
  c.MimeType = { PLAIN_TEXT: 'text/plain' };
  c.DriveApp.getFolderById = id => {
    assert.equal(id, c.DOCS_ROOT_ID);
    return { getFilesByName: () => iterator(stored === null ? [] : [configFile]), createFile: (_name, value) => { creates++; stored = value; return configFile; } };
  };
  c.DriveApp.getFileById = id => { assert.equal(id, ID); return { getParents: () => iterator([{ getId: () => c.RESUMES_FOLDER_ID }]), getName: () => 'Synthetic approved resume' }; };
  c.appendEvent_ = () => { events++; };
  assert.equal(c.approveResume_({ fileId: ID }).ok, true);
  assert.equal(JSON.parse(stored).latest_approved_resume_file_id, ID);
  assert.equal(creates, 1); assert.equal(writes, 1); assert.equal(events, 1);
  c.DriveApp.getFileById = () => ({ getParents: () => iterator([{ getId: () => 'synthetic_other_folder' }]) });
  assert.equal(c.approveResume_({ fileId: ID }).ok, false);
  assert.equal(creates, 1); assert.equal(writes, 1); assert.equal(events, 1);
});
