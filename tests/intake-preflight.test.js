'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../pipeline-intake-preflight');
function request(){
 return {action:'intake',requestId:'BATCH-1',run:{SCOUT_RUN_ID:'BATCH-1',GROSS_FOUND:2,DISPOSITION_LEDGER:[
  {candidateId:'message-1:a',sourceMessageId:'message-1',initiatingUrl:'https://example.com/a',disposition:'SUBMITTED'},
  {candidateId:'message-1:b',sourceMessageId:'message-1',initiatingUrl:'https://example.com/b',disposition:'CARRY_FORWARD'}
 ]},records:[{INTAKE_KEY:'job-company-a',COMPANY:'Company',TITLE:'Director',SOURCE_URL:'https://example.com/a'}]};
}
test('accepts accounted partial batch with source-grounded carry forward',()=>{
 const r=validate(request());assert.equal(r.ok,true);assert.equal(r.stats.gross,2);assert.equal(r.stats.records,1);assert.equal(r.sha256.length,64);
});
test('rejects the incident pattern of gross=28 but 20 unexplained records',()=>{
 const q=request();q.run.GROSS_FOUND=28;
 assert.equal(validate(q).ok,false);assert.match(validate(q).errors.join(','),/GROSS_LEDGER_MISMATCH/);
});
test('rejects missing ledger instead of silently rewriting gross count',()=>{
 const q=request();delete q.run.DISPOSITION_LEDGER;
 assert.match(validate(q).errors.join(','),/DISPOSITION_LEDGER_REQUIRED/);
});
test('rejects mismatched submitted counts',()=>{
 const q=request();q.run.DISPOSITION_LEDGER[1].disposition='SUBMITTED';
 assert.match(validate(q).errors.join(','),/SUBMITTED_LEDGER_MISMATCH/);
});
test('never accepts duplicate intake identities',()=>{
 const q=request();q.records.push({...q.records[0]});
 assert.match(validate(q).errors.join(','),/DUPLICATE_INTAKE_KEY/);
});
