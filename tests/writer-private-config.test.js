const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const fixture = require('./helpers/writer-runtime-fixture.cjs');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function load(properties = fixture.properties, options = {}) {
  const calls = [];
  const blockedService = new Proxy({}, { get(_target, name) { calls.push(String(name)); throw new Error('External I/O forbidden'); } });
  const c = vm.createContext({
    DriveApp: blockedService, DocumentApp: blockedService, UrlFetchApp: blockedService, ScriptApp: blockedService,
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => { if (options.readError) throw new Error('PRIVATE_VALUE_DO_NOT_LOG'); return properties; } }) }
  });
  if (options.noService) delete c.PropertiesService;
  return { c, calls, run: suffix => vm.runInContext(source + (suffix || ''), c) };
}

function refuses(properties, options, code = 'WRITER_RUNTIME_CONFIG_INVALID') {
  for (const suffix of [';doGet({parameter:{action:"documents",profileResumeId:"synthetic_profile_resume"}});', ';doPost({});', ';processWriterQueue();']) {
    const h = load(properties, options);
    assert.throws(() => h.run(suffix), e => e.message === code);
    assert.deepEqual(h.calls, []);
  }
}

test('missing or unreadable property service fails before handlers and triggers can do I/O', () => {
  refuses(fixture.properties, { noService: true }, 'WRITER_RUNTIME_CONFIG_UNAVAILABLE');
  refuses(fixture.properties, { readError: true }, 'WRITER_RUNTIME_CONFIG_UNAVAILABLE');
});

test('missing, unsupported or non-string schema is rejected without values in errors', () => {
  for (const value of [undefined, '', '2', 1, null]) refuses({ ...fixture.properties, WRITER_CONFIG_VERSION: value });
});

test('empty, placeholder, non-string or overlong credential is rejected', () => {
  for (const value of [undefined, '', ' ', 'CHANGE-ME', 'change_me', 'placeholder', null, 123, {}, 'x'.repeat(2049)]) {
    refuses({ ...fixture.properties, WRITER_PASSPHRASE: value });
  }
});

test('every required private target must be a valid string ID', () => {
  for (const key of Object.keys(fixture.properties).filter(k => k.endsWith('_ID'))) {
    for (const value of [undefined, null, '', 'short', 123, {}, 'https://example.test/file', 'synthetic id', 'x'.repeat(201)]) {
      refuses({ ...fixture.properties, [key]: value });
    }
  }
});

test('equal active and frozen master targets fail closed', () => {
  refuses({ ...fixture.properties, WRITER_FROZEN_MASTER_ID: fixture.properties.WRITER_MASTER_ID });
});

test('valid config reads one snapshot, keeps exact targets and preserves authentication and frozen guards', () => {
  const h = load(); let reads = 0;
  h.c.PropertiesService = { getScriptProperties: () => ({ getProperties: () => { reads++; return { ...fixture.properties }; } }) };
  h.run();
  assert.equal(reads, 1); assert.deepEqual(h.calls, []);
  assert.equal(h.c.MASTER_ID, fixture.properties.WRITER_MASTER_ID);
  assert.equal(h.c.FROZEN_MASTER_ID, fixture.properties.WRITER_FROZEN_MASTER_ID);
  assert.equal(h.c.auth_('synthetic-test-key'), true); assert.equal(h.c.auth_('wrong'), false); assert.equal(h.c.auth_(''), false);
  assert.equal(h.c.readProfileResumeMetadata_(h.c.MASTER_ID).status, 'UNKNOWN');
  assert.equal(h.c.readProfileResumeMetadata_(h.c.FROZEN_MASTER_ID).reason, 'FROZEN_MASTER_FORBIDDEN');
  assert.throws(() => h.c.readMasterText_(h.c.FROZEN_MASTER_ID), /FROZEN_MASTER_FORBIDDEN/);
  assert.deepEqual(h.calls, []);
});

test('manual configuration check returns status only, rereads properties, and never writes', () => {
  const h = load(); h.run();
  assert.deepEqual(clone(h.c.checkWriterRuntimeConfiguration()), { ok: true, schema: 'forge.writer-runtime-config.v1', configured: true });
  h.c.PropertiesService = { getScriptProperties: () => ({ getProperties: () => ({}) }) };
  assert.throws(() => h.c.checkWriterRuntimeConfiguration(), /WRITER_RUNTIME_CONFIG_INVALID/);
  assert.deepEqual(h.calls, []);
});

test('production source does not import synthetic fixtures or install properties', () => {
  assert.doesNotMatch(source, /synthetic[-_]|writer-runtime-fixture|setProperties\(|WRITER_[A-Z_]+\s*:\s*['"]/);
  assert.match(source, /var WRITER_PRIVATE_CONFIG_ = loadWriterRuntimeConfig_\(\)/);
  for (const key of ['MASTER_ID', 'FROZEN_MASTER_ID', 'PASSPHRASE', 'CANONICAL_RULES_DOC_ID', 'DOCS_ROOT_ID', 'RESUMES_FOLDER_ID', 'COVER_LETTERS_FOLDER_ID', 'SUPPORTING_DOCS_FOLDER_ID', 'TIM_VOICE_FOLDER_ID', 'INTERVIEW_NOTES_FOLDER_ID']) {
    assert.match(source, new RegExp('var ' + key + ' = WRITER_PRIVATE_CONFIG_\\.' + key));
    assert.doesNotMatch(source, new RegExp('var ' + key + ' = [\\\'\"]'));
  }
});

test('both deployment entrypoints refuse all modes before any external command, with no bypass', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-deploy-gate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const script of ['deploy.sh', 'activate_v5.sh']) for (const args of [[], ['--head'], ['--runtime-config-verified']]) {
    const result = spawnSync('/bin/bash', [path.join(root, 'apps-script', script), ...args], {
      env: { PATH: dir, WRITER_CONFIG_MIGRATED: '1', WRITER_CONFIG_VERIFIED: '1', SKIP_STATE_CHECK: '1' }, encoding: 'utf8'
    });
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.match(result.stderr, /^WRITER_DEPLOYMENT_BLOCKED:/);
    assert.doesNotMatch(result.stderr, /command not found/);
  }
});

test('empty published connection defaults preserve explicit saved settings and save no credentials', () => {
  const connection = fs.readFileSync(path.join(root, 'pipeline-connection.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'pipeline.html'), 'utf8');
  const cfg = html.match(/cfg:(LS\.get\('cfg',PipelineConnection\))/)[1];
  const normalization = html.split('\n').filter(line => /^if\(S\.cfg===PipelineConnection\)|^if\(!S\.cfg\.url\)/.test(line)).join('\n');
  for (const saved of [null, { url: 'https://example.test/synthetic-writer', key: 'synthetic-saved-key', deliberate: true }]) {
    const writes = [], c = vm.createContext({ LS: { get: (_key, fallback) => saved || fallback, set: (_key, value) => writes.push(clone(value)) } });
    vm.runInContext(connection + ';var S={cfg:' + cfg + '};' + normalization, c);
    if (saved) { assert.deepEqual(clone(c.S.cfg), saved); assert.deepEqual(writes, []); }
    else { assert.equal(c.S.cfg.key, ''); assert.equal(c.S.cfg.url, ''); assert.ok(writes.every(value => !value.key && !value.url)); }
  }
});

test('unconfigured impact analysis reports NOT_RUN before loading modules or attempting network', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-impact-not-run-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'impact.json');
  const result = spawnSync(process.execPath, [path.join(root, 'tools/salary-floor-impact.js'), '--old', 'nonexistent-synthetic-module-dir', '--out', out], {
    env: { PATH: process.env.PATH, GITHUB_ACTIONS: 'true' }, encoding: 'utf8'
  });
  assert.equal(result.status, 0); assert.equal(result.stderr, '');
  assert.match(result.stdout, /Writer impact NOT RUN/); assert.match(result.stdout, /not an impact pass/);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), { status: 'NOT_RUN', reason: 'PRIVATE_WRITER_CONFIGURATION_REQUIRED', liveDataRead: false });
});
