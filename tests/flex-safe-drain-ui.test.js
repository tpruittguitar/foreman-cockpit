const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','pipeline.html'),'utf8');
test('missing measured capacity uses the proven single-commit batch size (Tim 2026-10-17), within the Writer max of 50',()=>{
 assert.match(source,/state:'PROVEN_BATCH',records:PipelineDerivedRefresh\.CHUNK/);
 assert.match(source,/admission\.state==='MEASURED'\|\|admission\.state==='PROVEN_BATCH'/);
 assert.ok(require('../pipeline-derived-refresh').CHUNK<=50);
});
test('remaining counts come from the master view the verifying load returned',()=>{
 assert.match(source,/var next=viewPlan_\(lv\)\|\|refreshPlan_\(\)/);
 assert.match(source,/var p=viewPlan_\(lv\),remaining=p\?p\.stale\.length:null/);
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
 assert.match(source,/return next\.stale\.length\?pass\(next\):undefined/);
 assert.match(source,/if\(rf\.stop\)throw/);
});
