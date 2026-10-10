const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs'), T = require('../apps-script/WriterTransactions.gs');
const { world, MASTER } = require('./helpers/writer-world');
const row = '1 | TEST-ONE | Fixture Co | Director Quality | SCOUT_INTAKE | ANALYSIS_PENDING | - | TEST-REQ | Austin, TX | SOURCE_URL=https://example.invalid/role';
const receipt = (extra = '') => `RECEIPT=INTAKE_RECEIPT
SCOUT_RUN_ID=EMAIL-RUN
WRITE_ID=W-LEGACY
NEW_PRIMARY_IDS=["TEST-ONE"]
TARGET_FILE_ID=${MASTER}
COMPLETION_STATUS=COMPLETE
READBACK_VERIFIED=YES
WRITE_VERIFIED=YES
RUN_ACCOUNTING=RECONCILED
VERIFICATION=POST_EXECUTION_INDEPENDENT
VERIFICATION_RESULT=COMPLETE
WRITE_EXECUTED_AT=2026-10-09T22:04:24Z
VERIFIED_AT=2026-10-09T22:05:01Z
${extra}END INTAKE_RECEIPT
`;
const repair = { action: 'reconcile_intake_receipt', requestId: 'EMAIL-RUN', writeId: 'W-LEGACY' };
test('explicit aliases override run identity; legacy intake falls back to run identity', () => {
 assert.deepEqual(T.requestIds({ action:'intake',request_id:'REQ',run:{SCOUT_RUN_ID:'RUN'} }), ['REQ']);
 assert.deepEqual(T.requestIds({ action:'intake',run:{SCOUT_RUN_ID:'RUN'} }), ['RUN']);
});
test('recovery maps historical independent proof without any master mutation or evidence promotion', t => {
 const f = world(t,{rows:[row],receipts:receipt()}); const before=f.master();
 const r=f.post(repair); assert.equal(r.ok,true); assert.equal(f.index().requests['EMAIL-RUN'].s,'COMPLETE');
 assert.equal(r.request.evidenceCompleteness,'NOT_ASSESSED'); assert.deepEqual(f.master(),before); assert.equal(f.masterSaves(),0);
 assert.equal(f.post(repair).mode,'ALREADY_RECORDED'); assert.equal(f.post({...repair,writeId:'OTHER'}).ok,false);
});
test('pending, malformed, corrected, wrong-master and same-execution receipts cannot grant recovery', () => {
 for(const text of [receipt().replace('COMPLETION_STATUS=COMPLETE','COMPLETION_STATUS=PENDING_VERIFICATION'),
 receipt('READBACK_VERIFIED=NO\n'),receipt().replace(MASTER,'WRONG'),receipt().replace('22:05:01','22:04:24'),
 receipt().replace('END INTAKE_RECEIPT',''),receipt()+'RECEIPT=RECEIPT_CORRECTION\nREQUEST_ID=EMAIL-RUN\nCORRECTION=FALSE_COMPLETE\nEND RECEIPT_CORRECTION\n'])
 assert.equal(W.legacyIntakeProof_(text,'EMAIL-RUN','W-LEGACY'),null);
});
test('missing receipt rows and invalid trailers keep recovery closed', t => {
 const f=world(t,{rows:[],receipts:receipt()});assert.equal(f.post(repair).ok,false);assert.equal(f.index(),null);
});
test('partial email evidence can be written and independently verified under request_id', t => {
 const f=world(t,{rows:[row]});
 const req={action:'intake',request_id:'EMAIL-ALIAS',run:{SCOUT_RUN_ID:'EMAIL-SOURCE'},records:[{COMPANY:'Other Fixture',TITLE:'Quality Director',LOCATION:'Austin, TX',REQ_ID:'OTHER',SOURCE_URL:'https://example.invalid/other'}]};
 assert.equal(f.post(req).ok,true);assert.equal(f.index().requests['EMAIL-ALIAS'].s,'PENDING');
 f.run(()=>W.verifyPendingWrites_());assert.equal(f.index().requests['EMAIL-ALIAS'].s,'COMPLETE');
 assert.match(f.receipts(),/SCOUT_RUN_ID=EMAIL-SOURCE/);assert.match(f.receipts(),/REQUEST_ID=EMAIL-ALIAS/);
});

test('automation recognizes intake run identity with the same precedence as Writer', () => {
 const A = require('../apps-script/Automation.gs');
 assert.equal(A.partialHoldRecovered_({action:'intake',run:{SCOUT_RUN_ID:'EMAIL-RUN'}},{'EMAIL-RUN':{s:'COMPLETE'}}),true);
 assert.equal(A.partialHoldRecovered_({action:'intake',requestId:'REQ',run:{SCOUT_RUN_ID:'RUN'}},{REQ:{s:'COMPLETE'}}),true);
 assert.equal(A.partialHoldRecovered_({action:'intake',run:{SCOUT_RUN_ID:'RUN'}},{RUN:{s:'PENDING'}}),false);
});
test('valid receipt cannot repair a damaged live trailer', t => {
 const f=world(t,{rows:[row],receipts:receipt()});f.files.get(MASTER).content=f.files.get(MASTER).content.replace('END V2_CURRENT_POPULATION_MASTER (1 rows)','END V2_CURRENT_POPULATION_MASTER (2 rows)');
 assert.equal(f.post(repair).ok,false);assert.equal(f.index(),null);
});

test('identical legacy END markers do not block identity repair or durable planning; conflicting markers do', t => {
 const f=world(t,{rows:[row],receipts:receipt()});const text=f.files.get(MASTER).content;
 f.files.get(MASTER).content=text+'END V2_CURRENT_POPULATION_MASTER (1 rows)\n';
 assert.equal(f.post(repair).ok,true);assert.equal(f.masterSaves(),0);
 const before=f.master(),after=before.map(x=>x===row?x.replace('Fixture Co','Changed Co'):x);
 assert.equal(T.intent(before,after,{action:'ruling',requestId:'NEW'},'2026-10-10T00:00:00Z',W.textHash_,MASTER,{}).requestIds[0],'NEW');
 after.push('END V2_CURRENT_POPULATION_MASTER (2 rows)');
 assert.throws(()=>T.intent(before,after,{action:'ruling',requestId:'NEW'},'2026-10-10T00:00:00Z',W.textHash_,MASTER,{}),/TRAILER_INVALID/);
});
