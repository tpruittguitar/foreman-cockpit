// Governed identity correction (ruling kind IDENTITY): fixed identity columns change together with their evidence, never as a
// contradicting payload copy; POSSIBLE_MATCHES clears only when every listed row is reconciled; collisions are refused.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const W = require('../apps-script/Code.gs');
const P = require('../pipeline-parser.js');

const URL1 = 'https://careers.example.com/jobs/r26_04429';
const row = (inv, pid, company, title, req, loc, extra) => [inv, pid, company, title, 'DISCOVERY_LEAD', 'INTAKE/IDENTITY_UNRESOLVED', '-', req, loc,
  'NOTIFICATION_SOURCE=Ladders; SOURCE_URL=https://t.ladders.co/x' + inv + (extra ? '; ' + extra : '')].join(' | ');
const hidden = row(10, 'V2I-HIDDEN000001', 'Hidden client (Ladders)', 'Vice President, Supply Chain', 'LADDERS-EMAIL-1', 'Remote', 'IDENTITY_CONFIDENCE=LOW; LOCATION=Remote; preferred Rosemont, IL');
const base = { kind: 'IDENTITY', actor: 'CLAUDE', requestId: 'IDT-1', ts: '2026-10-05T07:00:00.000Z',
  identity: { COMPANY: 'Regal Rexnord', REQ: 'R26_04429', LOCATION: 'Remote; preferred Rosemont, IL or Milwaukee, WI' },
  evidence: 'Regal Rexnord first-party posting R26_04429 shows title, remote with Rosemont/Milwaukee preference', evidenceUrl: URL1,
  fields: { IDENTITY_CONFIDENCE: 'HIGH', IDENTITY_RESOLUTION: 'RESOLVED_FIRST_PARTY', COMPANY_SOURCE_URL: URL1 } };
const cells = l => l.split(' | ');
const payload = l => W.parsePayload(cells(l).slice(9).join(' | ')).payload;

test('IDENTITY rewrites the fixed columns together, keeps every prior value, and removes a contradicting payload copy', () => {
  const r = W.mutateRow(hidden, base);
  assert.equal(r.ok, true, r.error);
  const c = cells(r.after), p = payload(r.after);
  assert.equal(c[2], 'Regal Rexnord'); assert.equal(c[7], 'R26_04429'); assert.equal(c[8], 'Remote, preferred Rosemont, IL or Milwaukee, WI');
  assert.equal(c[3], 'Vice President, Supply Chain', 'title untouched when not given');
  assert.equal(p.IDENTITY_PRIOR_COMPANY, 'Hidden client (Ladders)'); assert.equal(p.IDENTITY_PRIOR_REQ, 'LADDERS-EMAIL-1'); assert.equal(p.IDENTITY_PRIOR_LOCATION, 'Remote');
  assert.equal(p.LOCATION, undefined, 'payload LOCATION copy removed');
  assert.match(p.IDENTITY_PRIOR_PAYLOAD_LOCATION, /^Remote/);
  assert.equal(p.IDENTITY_EVIDENCE_URL, URL1); assert.match(p.IDENTITY_EVIDENCE, /first-party posting/);
  assert.equal(p.IDENTITY_SOURCE, 'CLAUDE:IDT-1'); assert.equal(p.STATE_SOURCE, undefined, 'state provenance untouched');
  assert.equal(c[4], 'DISCOVERY_LEAD'); assert.equal(c[5], 'INTAKE/IDENTITY_UNRESOLVED', 'bucket and disposition untouched');
});

test('IDENTITY requires evidence text and an http(s) evidence URL, and refuses placeholders and unknown keys', () => {
  assert.match(W.mutateRow(hidden, Object.assign({}, base, { evidence: 'short' })).error, /requires evidence/);
  assert.match(W.mutateRow(hidden, Object.assign({}, base, { evidenceUrl: 'not a url' })).error, /requires evidenceUrl/);
  assert.match(W.mutateRow(hidden, Object.assign({}, base, { identity: { LOCATION: 'NOT_STATED' } })).error, /placeholder/);
  assert.match(W.mutateRow(hidden, Object.assign({}, base, { identity: { BUCKET: 'APPLIED' } })).error, /not one of/);
});

test('identity columns and POSSIBLE_MATCHES can never be set through fields (ENRICH or IDENTITY)', () => {
  for (const k of ['COMPANY', 'TITLE', 'LOCATION', 'REQ', 'POSSIBLE_MATCHES', 'location']) {
    assert.match(W.mutateRow(hidden, { kind: 'ENRICH', ts: base.ts, fields: { [k]: 'X Corp' } }).error, /only through kind IDENTITY/, 'ENRICH ' + k);
    assert.match(W.mutateRow(hidden, Object.assign({}, base, { fields: { [k]: 'X Corp' } })).error, /only through kind IDENTITY/, 'IDENTITY ' + k);
  }
  assert.equal(W.mutateRow(hidden, { kind: 'ENRICH', ts: base.ts, fields: { LOCATION_VERIFIED: 'Remote' } }).ok, true, 'other keys still fine');
});

test('IDENTITY is refused on protected applicant rows', () => {
  const applied = hidden.replace('DISCOVERY_LEAD | INTAKE/IDENTITY_UNRESOLVED', 'APPLIED | RESOLVED/APPLIED_CONFIRMED');
  assert.match(W.mutateRow(applied, base).error, /protected applicant state/);
});

const withPM = row(11, 'V2I-PM0000000001', 'Anduril Industries', 'Director, Supply Chain', 'Indeed-jk-00ce4353e1baaddb', 'Columbus, OH', 'IDENTITY_CONFIDENCE=HIGH_DISTINCT; POSSIBLE_MATCHES=V2I-OTHER0000002, V2I-OTHER0000003');
const pmRuling = (reconciled) => Object.assign({}, base, { identity: { LOCATION: 'Ashville, OH', REQ: '5200299007' }, reconciled,
  evidence: 'Anduril Greenhouse requisition 5200299007 Director Supply Chain at Arsenal-1 in Ashville, OH', evidenceUrl: 'https://job-boards.greenhouse.io/andurilindustries/jobs/5200299007', fields: { IDENTITY_CONFIDENCE: 'HIGH' } });

test('POSSIBLE_MATCHES clears only when every listed row is reconciled, and the reconciliation is kept', () => {
  assert.match(W.mutateRow(withPM, pmRuling({})).error, /not reconciled V2I-OTHER0000002, V2I-OTHER0000003/);
  assert.match(W.mutateRow(withPM, pmRuling({ 'V2I-OTHER0000002': 'DISTINCT: different req 1234567 in Atlanta' })).error, /not reconciled V2I-OTHER0000003/);
  assert.match(W.mutateRow(withPM, pmRuling({ 'V2I-OTHER0000002': 'looks different', 'V2I-OTHER0000003': 'DISTINCT: x' })).error, /must read "DISTINCT/);
  const r = W.mutateRow(withPM, pmRuling({ 'V2I-OTHER0000002': 'DISTINCT: req 5200301 is Atlanta, GA (different site)', 'V2I-OTHER0000003': 'DUPLICATE_RESOLVED: same posting, already marked DUPLICATE' }));
  assert.equal(r.ok, true, r.error);
  const p = payload(r.after);
  assert.equal(p.POSSIBLE_MATCHES, undefined);
  assert.equal(p.IDENTITY_PRIOR_POSSIBLE_MATCHES, 'V2I-OTHER0000002, V2I-OTHER0000003');
  assert.equal(p.POSSIBLE_MATCHES_RECONCILED, 'V2I-OTHER0000002 DISTINCT, V2I-OTHER0000003 DUPLICATE_RESOLVED');
});

test('identityConflicts_: a corrected identity that matches another row is refused unless that row is reconciled', () => {
  const other = row(12, 'V2I-REGAL0000099', 'Regal Rexnord', 'Vice President, Supply Chain', 'R26_04429', 'Rosemont, IL');
  const lines = ['COUNTS: TOTAL=2', hidden, other];
  const after = W.mutateRow(hidden, base).after;
  assert.match(W.identityConflicts_(lines, 1, after, base, []), /IDENTITY_COLLISION: corrected identity matches V2I-REGAL0000099 by REQ_ID/);
  assert.equal(W.identityConflicts_(lines, 1, after, Object.assign({}, base, { reconciled: { 'V2I-REGAL0000099': 'DISTINCT: archived 2025 posting, new req' } }), []), '');
  assert.equal(W.identityConflicts_(['COUNTS: TOTAL=1', hidden], 1, after, base, []), '', 'no other row, no conflict');
  // archived rows count too
  assert.match(W.identityConflicts_(['COUNTS: TOTAL=1', hidden], 1, after, base, [other.replace('DISCOVERY_LEAD', 'DECLINED_BY_TIM')]), /IDENTITY_COLLISION/);
});

test('identityConflicts_: DUPLICATE_RESOLVED requires the other row to be DUPLICATE already', () => {
  const dupLive = row(13, 'V2I-OTHER0000003', 'Anduril Industries', 'Director, Supply Chain', '-', 'Columbus, OH').replace('DISCOVERY_LEAD', 'DUPLICATE');
  const stillLive = row(13, 'V2I-OTHER0000003', 'Anduril Industries', 'Director, Supply Chain', '-', 'Columbus, OH');
  const ru = pmRuling({ 'V2I-OTHER0000002': 'DISTINCT: req 5200301 is Atlanta, GA (different site)', 'V2I-OTHER0000003': 'DUPLICATE_RESOLVED: same posting, already marked DUPLICATE' });
  const after = W.mutateRow(withPM, ru).after;
  assert.match(W.identityConflicts_(['C', withPM, stillLive], 1, after, ru, []), /requires the other row to be DUPLICATE already: V2I-OTHER0000003 is DISCOVERY_LEAD/);
  assert.equal(W.identityConflicts_(['C', withPM, dupLive], 1, after, ru, []), '');
});

test('the Explorer counts a fully corrected row as identity-resolved (predicate unchanged)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');
  const resolved = new Function(html.match(/function usableReq_\(v\)\{[\s\S]*?\n/)[0] + html.match(/function hasResolvedIdentity_\(r\)\{[\s\S]*?\n/)[0] + ';return hasResolvedIdentity_;')();
  const parse = l => P.parse('COUNTS: TOTAL=1 DISCOVERY_LEAD=1\n================\n' + l).rows[0];
  assert.equal(resolved(parse(hidden)), false);
  assert.equal(resolved(parse(W.mutateRow(hidden, base).after)), true);
  assert.equal(resolved(parse(withPM)), false);
  const ok = W.mutateRow(withPM, pmRuling({ 'V2I-OTHER0000002': 'DISTINCT: req 5200301 is Atlanta, GA (different site)', 'V2I-OTHER0000003': 'DISTINCT: req 5200302 is Mesa, AZ (different site)' }));
  assert.equal(resolved(parse(ok.after)), true);
});

// ---------- end to end through the batch path with in-memory services ----------
const MASTER = '19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI';
function services(lines) {
  const para = t => { let s = t; return { getText: () => s, setText: v => { s = v; } }; };
  const master = lines.map(para); let saves = 0, events = '';
  const files = { PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS: { getId: () => 'R', getMimeType: () => 'application/vnd.google-apps.document' }, 'PIPELINE_EVENT_LOG.jsonl': { getId: () => 'E', getBlob: () => ({ getDataAsString: () => events }), setContent: v => { events = v; } } };
  const iter = list => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
  const folder = { getFilesByName: n => iter(files[n] ? [files[n]] : []), createFile: (n, c) => { let v = c; return files[n] = { getId: () => n, getMimeType: () => 'text/plain', getBlob: () => ({ getDataAsString: () => v }), setContent: x => { v = x; } }; } };
  const receipts = [para('')];
  global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  global.DriveApp = { getFileById: id => ({ getLastUpdated: () => new Date('2026-10-05T06:00:00Z'), getParents: () => iter([folder]), getId: () => id }) };
  global.DocumentApp = { openById: id => id === MASTER ? { getBody: () => ({ getParagraphs: () => master }), saveAndClose: () => { saves++; } } : { getBody: () => ({ getText: () => receipts.map(p => p.getText()).join('\n'), appendParagraph: t => receipts.push(para(t)) }), saveAndClose: () => {} } };
  global.MimeType = { PLAIN_TEXT: 'text/plain' };
  return { line: pid => master.map(p => p.getText()).find(l => cells(l)[1] === pid), saves: () => saves };
}

test('end to end: an IDENTITY batch commits once and stays pending verification; a colliding ruling is held, not written', () => {
  const other = row(12, 'V2I-REGAL0000099', 'Regal Rexnord', 'Vice President, Supply Chain', 'R26_04429', 'Rosemont, IL');
  const f = services(['COUNTS: TOTAL=2 DISCOVERY_LEAD=2 UNACCOUNTED=0', hidden, other, 'END V2_CURRENT_POPULATION_MASTER (2 rows)']);
  W.resetExecution_();
  const held = W.dispatchWrite_({ action: 'batch', requests: [{ action: 'ruling', ruling: Object.assign({ primaryId: 'V2I-HIDDEN000001' }, base) }] });
  assert.equal(held.results[0].mode, 'HOLD'); assert.match(held.results[0].error, /IDENTITY_COLLISION/);
  assert.equal(f.saves(), 0, 'nothing written');
  W.resetExecution_();
  const r = W.dispatchWrite_({ action: 'batch', requests: [{ action: 'ruling', ruling: Object.assign({ primaryId: 'V2I-HIDDEN000001', reconciled: { 'V2I-REGAL0000099': 'DISTINCT: different worksite and posting date, both live' } }, base) }] });
  assert.equal(r.ok, true, JSON.stringify(r.results));
  assert.equal(r.mode, 'BATCH_RULING_SINGLE_COMMIT'); assert.equal(r.verification, 'PENDING'); assert.equal(f.saves(), 1);
  assert.equal(cells(f.line('V2I-HIDDEN000001'))[2], 'Regal Rexnord');
});
