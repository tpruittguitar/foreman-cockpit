'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../apps-script/Automation.gs');
test('queue rejects unexplained gross mismatch before dispatch',()=>{
 const b={action:'intake',run:{SCOUT_RUN_ID:'BATCH02',GROSS_FOUND:28},records:Array.from({length:20},(_,i)=>({INTAKE_KEY:'K'+i}))};
 assert.match(A.intakeAccountingError_(b),/COUNT_MISMATCH/);
});
test('legacy matching count remains permissible',()=>{
 assert.equal(A.intakeAccountingError_({action:'intake',run:{GROSS_FOUND:2},records:[{},{}]}),'');
});
test('gross larger than submitted remains permissible with complete disposition ledger',()=>{
 const ledger=[
  {candidateId:'1',sourceMessageId:'M',initiatingUrl:'https://example.com/1',disposition:'SUBMITTED'},
  {candidateId:'2',sourceMessageId:'M',initiatingUrl:'https://example.com/2',disposition:'CARRY_FORWARD'}
 ];
 assert.equal(A.intakeAccountingError_({action:'intake',run:{GROSS_FOUND:2,DISPOSITION_LEDGER:ledger},records:[{}]}),'');
});
test('writer fingerprint is based on unmodified input bytes',()=>{
 global.Utilities={
   newBlob:text=>({getBytes:()=>Array.from(Buffer.from(text,'utf8')).map(n=>n>127?n-256:n)}),
   DigestAlgorithm:{SHA_256:'SHA_256'},
   computeDigest:(_algo,bytes)=>Array.from(require('node:crypto').createHash('sha256').update(Buffer.from(bytes.map(x=>x&255))).digest()).map(n=>n>127?n-256:n)
 };
 const a=A.queuePayloadProof_('{"action":"intake"}');
 const b=A.queuePayloadProof_(' {"action":"intake"}');
 assert.equal(a.rawByteLength,19);
 assert.notEqual(a.rawSha256,b.rawSha256);
 assert.equal(a.rawSha256.length,64);
});
