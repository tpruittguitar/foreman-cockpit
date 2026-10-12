'use strict';
// REV-005: policy source switch. Drive is the default; GitHub only when POLICY_SOURCE=GITHUB.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const W = require('../apps-script/Code.gs');
const { world, RULES } = require('./helpers/writer-world');

const RULES_TEXT = 'TIM_PIPELINE_RULES_CANONICAL\nSTATUS=ACTIVE\nSECTION=DEGREE_FLEX\nFLEX_POLICY_VERSION=1\nHIGH_FLEX_MODIFIER=30\nSOFT_FLEX_MODIFIER=20\nNO_FLEX_MODIFIER=-10\nSTRICT_MODIFIER=-30\n';
const MODEL = { modelId: 'TIM_WEIGHTED_JOB_RATING', publishedRevision: 3, weights: { experience: 25, flex: 23, compensation: 20, geo: 23, ats: 0, title: 5, culture: 2, ownership: 2 } };

function github(t, props, repoFiles) {
  const w = world(t, { rulesText: RULES_TEXT });
  const files = new Map(Object.entries(repoFiles || {}).map(([k, v]) => [k, { text: v, sha: sha(v) }]));
  const calls = [];
  function sha(v) { return crypto.createHash('sha1').update(String(v)).digest('hex'); }
  const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body) });
  const saved = {};
  ['PropertiesService', 'UrlFetchApp', 'Logger'].forEach(k => { saved[k] = global[k]; });
  global.PropertiesService = { getScriptProperties: () => ({ getProperties: () => Object.assign({}, props) }) };
  global.Logger = { log() {} };
  global.UrlFetchApp = { fetch(url, opt) {
    calls.push({ url, opt });
    const raw = url.match(/^https:\/\/raw\.githubusercontent\.com\/tpruittguitar\/forge-policy\/main\/(.+)$/);
    if (raw) { const f = files.get(decodeURIComponent(raw[1])); return f ? resp(200, f.text) : resp(404, '404'); }
    const api = url.match(/^https:\/\/api\.github\.com\/repos\/tpruittguitar\/forge-policy\/contents\/([^?]+)/);
    if (!api) return resp(500, 'unexpected ' + url);
    const path = decodeURIComponent(api[1]), f = files.get(path);
    if (opt.method === 'get') return f ? resp(200, { sha: f.sha, content: Buffer.from(f.text).toString('base64').replace(/(.{60})/g, '$1\n'), html_url: 'https://github.com/x/' + path }) : resp(404, {});
    const body = JSON.parse(opt.payload);
    if ((f && body.sha !== f.sha) || (!f && body.sha)) return resp(409, {});
    const text = Buffer.from(body.content, 'base64').toString('utf8');
    files.set(path, { text, sha: sha(text), message: body.message });
    return resp(f ? 200 : 201, { content: { sha: sha(text) }, commit: { sha: 'c0ffee' } });
  } };
  const prevUtil = global.Utilities;
  global.Utilities = Object.assign({}, prevUtil, {
    base64Encode: (v) => Buffer.from(Array.isArray(v) ? Buffer.from(v.map(b => b & 255)) : String(v)).toString('base64'),
    base64Decode: (v) => [...Buffer.from(v, 'base64')],
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map(b => b & 255)).toString('utf8') }),
    Charset: { UTF_8: 'UTF-8' }, DigestAlgorithm: { SHA_256: 'SHA_256' }
  });
  t.after(() => { Object.entries(saved).forEach(([k, v]) => v === undefined ? delete global[k] : global[k] = v); global.Utilities = prevUtil; });
  W.resetExecution_();
  return { w, files, calls };
}

test('default (no properties) reads rules from the Drive Doc and makes no network call', t => {
  const { w, calls } = github(t, {}, {});
  const r = w.run(() => W.readCanonicalRules_());
  assert.equal(r.ok, true); assert.equal(r.source, 'DRIVE'); assert.equal(r.id, RULES); assert.equal(r.text, RULES_TEXT);
  assert.equal(w.run(() => W.readRules_()).policySource, 'DRIVE');
  assert.equal(calls.length, 0);
});

test('GITHUB with token reads rules and FLEX policy via the contents API', t => {
  const { w, calls } = github(t, { POLICY_SOURCE: 'github', GITHUB_POLICY_TOKEN: 'tkn' }, { 'rules/TIM_PIPELINE_RULES_CANONICAL.txt': RULES_TEXT.replace('HIGH_FLEX_MODIFIER=30', 'HIGH_FLEX_MODIFIER=31') });
  const r = w.run(() => W.readCanonicalRules_());
  assert.equal(r.ok, true); assert.equal(r.source, 'GITHUB'); assert.equal(r.id, 'tpruittguitar/forge-policy/rules/TIM_PIPELINE_RULES_CANONICAL.txt');
  assert.match(r.text, /HIGH_FLEX_MODIFIER=31/);
  assert.equal(calls[0].opt.headers.Authorization, 'Bearer tkn');
  assert.equal(w.opens[RULES] || 0, 0, 'Drive Doc not opened in GITHUB mode');
  assert.equal(w.run(() => W.readRules_()).policySource, 'GITHUB');
});

test('GITHUB without token reads from raw and refuses to save', t => {
  const { w, calls } = github(t, { POLICY_SOURCE: 'GITHUB' }, { 'rules/TIM_PIPELINE_RULES_CANONICAL.txt': RULES_TEXT });
  assert.equal(w.run(() => W.readCanonicalRules_()).text, RULES_TEXT);
  assert.match(calls[0].url, /^https:\/\/raw\.githubusercontent\.com\//);
  const s = w.run(() => W.saveCanonicalRules_({ text: RULES_TEXT + 'X=1\n' }));
  assert.equal(s.ok, false); assert.equal(s.mode, 'GITHUB_TOKEN_MISSING');
});

test('GITHUB read failure does not fall back to Drive', t => {
  const { w } = github(t, { POLICY_SOURCE: 'GITHUB', GITHUB_POLICY_TOKEN: 'tkn' }, {});
  const r = w.run(() => W.readCanonicalRules_());
  assert.equal(r.ok, false); assert.match(r.error, /not found/);
  assert.equal(w.run(() => W.readRules_()).status, 'UNAVAILABLE');
  assert.equal(w.opens[RULES] || 0, 0);
});

test('GITHUB rules save: commits with TIM label, verifies readback, rejects stale baseText', t => {
  const path = 'rules/TIM_PIPELINE_RULES_CANONICAL.txt';
  const { w, files } = github(t, { POLICY_SOURCE: 'GITHUB', GITHUB_POLICY_TOKEN: 'tkn' }, { [path]: RULES_TEXT });
  const next = RULES_TEXT + 'NOTE=saved\n';
  const stale = w.run(() => W.saveCanonicalRules_({ text: next, baseText: 'something else' }));
  assert.equal(stale.mode, 'REVISION_CONFLICT');
  const ok = w.run(() => W.saveCanonicalRules_({ text: next, baseText: RULES_TEXT, requestId: 'REQ-1' }));
  assert.equal(ok.ok, true); assert.equal(ok.source, 'GITHUB'); assert.equal(ok.history.verified, true);
  assert.equal(files.get(path).text, next.trim());
  assert.match(files.get(path).message, /^TIM REQ-1 rules saved/);
  assert.match(w.text('PIPELINE_RULESET_HISTORY.jsonl'), /"source":"GITHUB"/);
  assert.equal(w.text(RULES), RULES_TEXT, 'Drive Doc untouched');
});

test('GITHUB scoring model: read, publish with revision check, conflict on stale base', t => {
  const path = 'scoring/PIPELINE_SCORING_MODEL.json';
  const { w, files } = github(t, { POLICY_SOURCE: 'GITHUB', GITHUB_POLICY_TOKEN: 'tkn' }, { [path]: JSON.stringify(MODEL) });
  const r = w.run(() => W.readScoringModel_());
  assert.equal(r.ok, true); assert.equal(r.source, 'GITHUB'); assert.equal(r.model.publishedRevision, 3);
  const stale = w.run(() => W.saveScoringModel_(Object.assign({}, MODEL, { baseRevision: 2 })));
  assert.equal(stale.mode, 'REVISION_CONFLICT');
  const pub = w.run(() => W.saveScoringModel_(Object.assign({}, MODEL, { baseRevision: 3, requestId: 'REQ-2' })));
  assert.equal(pub.ok, true); assert.equal(pub.model.publishedRevision, 4);
  assert.equal(JSON.parse(files.get(path).text).publishedRevision, 4);
  assert.match(files.get(path).message, /^TIM REQ-2 scoring model revision 4 published/);
  assert.equal(w.files.has('PIPELINE_SCORING_MODEL.json'), false, 'no Drive scoring file created');
});

test('concurrent GitHub change between read and write is a conflict, not an overwrite', t => {
  const path = 'rules/TIM_PIPELINE_RULES_CANONICAL.txt';
  const { w, files } = github(t, { POLICY_SOURCE: 'GITHUB', GITHUB_POLICY_TOKEN: 'tkn' }, { [path]: RULES_TEXT });
  const realFetch = global.UrlFetchApp.fetch;
  global.UrlFetchApp.fetch = (url, opt) => { if (opt.method === 'put') files.set(path, { text: 'OTHER', sha: 'zzz' }); return realFetch(url, opt); };
  const s = w.run(() => W.saveCanonicalRules_({ text: RULES_TEXT + 'A=1\n' }));
  assert.equal(s.ok, false); assert.equal(s.mode, 'REVISION_CONFLICT');
  assert.equal(files.get(path).text, 'OTHER');
});
