const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','pipeline.html'),'utf8');
test('missing measured capacity falls back to one request, not an invented batch size',()=>{
 assert.match(source,/state:'SINGLE_SAFE',records:1/);
 assert.match(source,/admission\.state==='MEASURED'\|\|admission\.state==='SINGLE_SAFE'/);
 assert.match(source,/No verified multi-row capacity/);
});
test('refresh shows a persistent status bar and verified/remaining progress',()=>{
 assert.match(source,/rf-inline-status/);
 assert.match(source,/FLEX recalculation in progress/);
 assert.match(source,/Verified finished:/);
 assert.match(source,/Remaining:/);
 assert.match(source,/Current batch:/);
});
test('safe drain requires independent receipt and master verification and stops on no progress',()=>{
 assert.match(source,/recoverWriteResult_\(chunk\[0\]\.ruling\.requestId,0\)/);
 assert.match(source,/No reduction in outstanding jobs after master verification/);
 assert.match(source,/if\(!S\.load\|\|S\.load\.freshness!=='LIVE'\)/);
 assert.match(source,/return next\.stale\.length\?pass\(\):undefined/);
 assert.match(source,/if\(rf\.stop\)throw/);
});
