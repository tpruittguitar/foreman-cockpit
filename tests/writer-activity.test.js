const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const A=require('../pipeline-writer-activity.js');
const now=Date.parse('2026-10-29T00:00:00Z');
const item={pid:'V2I-1',op:'REPLACE',b:'old',a:'new'};
const entry=(w,items=[item],s='COMPLETE',at='2026-10-28T18:00:00Z')=>({w,items,s,at});
function fixture(requests){return {version:1,updatedAt:'2026-10-28T23:50:00Z',requests};}
test('GitHub pay aliases count one physical write and one row update, not one update per alias',()=>{
 const d=A.aggregate(fixture({'FORGE-ENRICH_ATS-ATSBOT-X-R1':entry('W1'),'FORGE-ENRICH_ATS-ATSBOT-X-R2':entry('W1')}),now);
 assert.equal(d.today.writes,1);assert.equal(d.today.updates,1);assert.equal(d.today.inserts,0);
 assert.equal(d.sources['Pay enrichment (GitHub)'].writes,1);assert.equal(d.buckets.reduce((s,b)=>s+b.writes,0),1);
});
test('new inserts differ from updates, repeated writes count but distinct jobs do not inflate',()=>{
 const d=A.aggregate(fixture({a:entry('W1',[{...item,op:'INSERT'}]),b:entry('W2'),c:entry('W3')}),now);
 assert.equal(d.today.inserts,1);assert.equal(d.today.updates,2);assert.equal(d.today.jobs,1);assert.equal(d.today.writes,3);
});
test('incomplete, conflicting, future and migrated receipts cannot inflate verified work',()=>{
 const d=A.aggregate(fixture({a:entry('W1'),b:entry('W1',[],'PENDING'),c:{s:'COMPLETE',src:'LEGACY_RECEIPTS',at:'2026-10-28T18:00:00Z'},d:entry('W2',[],'COMPLETE','2027-01-01'),e:entry('W3',[],'NOT_PERSISTED')}),now);
 assert.equal(d.recent.writes,0);assert.equal(d.pendingReceipts,1);assert.equal(d.problemReceipts,1);assert.equal(d.coverage.conflictedWrites,2);assert.equal(d.coverage.legacyReceiptsExcluded,1);
});
test('ET today crosses UTC midnight correctly; rolling 24h keeps the partial first hour',()=>{
 const d=A.aggregate(fixture({a:entry('W1',[],'COMPLETE','2026-10-28T02:00:00Z'),b:entry('W2',[],'COMPLETE','2026-10-28T04:00:00Z')}),Date.parse('2026-10-29T00:30:00Z'));
 assert.equal(d.todayDate,'2026-10-28');assert.equal(d.today.writes,1);assert.equal(d.recent.writes,2);assert.equal(d.buckets.length,25);
 const dst=A.aggregate(fixture({a:entry('W1',[],'COMPLETE','2026-11-01T04:30:00Z')}),Date.parse('2026-11-02T02:00:00Z'));assert.equal(dst.today.writes,1);
});
test('missing metadata is explicit and invalid schema is unavailable rather than zero',()=>{
 const d=A.aggregate(fixture({a:{w:'W1',s:'COMPLETE',at:'2026-10-28T18:00:00Z'},b:{s:'COMPLETE',at:'2026-10-28T18:00:00Z'}}),now);
 assert.equal(d.coverage.metadataGaps,1);assert.equal(d.coverage.missingWriteIds,1);
 assert.throws(()=>A.aggregate({requests:{}},now),/Unsupported/);
 const h=A.html({data:d},{columns:()=>'<svg/>',bars:()=>'<svg/>'});assert.match(h,/Coverage incomplete/);assert.match(h,/New job inserts/);assert.match(h,/not added/);
 assert.match(A.html({error:'network <bad>'}),/network &lt;bad&gt;/);assert.doesNotMatch(A.html({error:'failed'}),/<b>0/);
});
test('endpoint serves a bounded precomputed summary and fails honestly on stale or oversized data',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../functions/api/writer-activity.js'),'utf8');
 const mod=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const summary={...A.aggregate(fixture({secretId:entry('W1')}),now),schema:'forge.writer-activity.v1',publishedAt:new Date(now).toISOString(),source:{repo:'tpruittguitar/forge-writer-state',sha:'a'.repeat(40)}};
 let calls=0;
 const d=await mod.loadActivity(async(url)=>{calls++;assert.match(url,/forge-coordination\/main\/state\/WRITER_ACTIVITY.json/);return new Response(JSON.stringify(summary));},now);
 assert.equal(d.recent.writes,1);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(d),/secretId|V2I-1/);
 await assert.rejects(()=>mod.loadActivity(async()=>new Response('down',{status:503}),now),/unavailable/);
 await assert.rejects(()=>mod.loadActivity(async()=>new Response(JSON.stringify(summary)),now+31*60000),/stale/);
 await assert.rejects(()=>mod.loadActivity(async()=>new Response('x'.repeat(256*1024+1)),now),/size budget/);
 await assert.rejects(()=>mod.loadActivity(async()=>new Response(JSON.stringify({...summary,todayDate:'2026-10-27'})),now),/rollover/);
 let attempts=0;assert.equal((await mod.loadActivity(async()=>++attempts===1?new Response('temporary',{status:503}):new Response(JSON.stringify(summary)),now)).ok,true);
 assert.equal(attempts,2);
 const idle={...summary,indexUpdatedAt:'2026-10-20T00:00:00Z'};assert.equal((await mod.loadActivity(async()=>new Response(JSON.stringify(idle)),now)).ok,true,'a freshly read unchanged index is valid on an idle Writer');
 const sha='b'.repeat(40);await mod.loadActivity(async url=>{assert.ok(url.includes('/'+sha+'/state/WRITER_ACTIVITY.json'));return new Response(JSON.stringify(summary));},now,sha);
 await assert.rejects(()=>mod.loadActivity(async()=>{throw Error('must not fetch');},now,'bad/revision'),/Invalid evidence revision/);
});

function recoveryCase(id,e){return {requestId:id,sourceEntry:e,status:'PROVEN_PERSISTED',reason:'EXACT_SAVED_WRITE_EVIDENCE',rows:e.items.map(i=>({primaryId:i.pid,expectedAfter:i.a,observedHash:i.a,sha256:'f'.repeat(64),readAt:'2026-10-28T23:58:00Z',status:'EXACT_AFTER_IMAGE'}))};}
function recovery(cases){return {schema:'forge.receipt-recovery.v1',at:'2026-10-28T23:59:00Z',writerSubmissions:0,masterMutations:0,canonicalReceiptMutations:0,source:{repo:'tpruittguitar/forge-writer-state',path:'PIPELINE_RECEIPT_INDEX.json',sha:'a'.repeat(40)},cases};}
test('fresh exact recovery closes a problem flag without changing receipt history or counting a successful write',()=>{
 const e=entry('W-FAIL',[{pid:'V2I-1',op:'REPLACE',b:'b:1',a:'a:1'}],'NOT_PERSISTED'),index=fixture({old:e}),before=JSON.stringify(index),r=recovery([recoveryCase('old',e)]),d=A.aggregate(index,now,r);
 assert.equal(d.problemReceipts,0);assert.equal(d.rawProblemReceipts,1);assert.equal(d.recoveredReceipts,1);assert.equal(d.today.writes,0);assert.equal(JSON.stringify(index),before);
 assert.equal(A.aggregate(index,now+3*3600000,r).problemReceipts,0,'a report getting old cannot undo a proven historical recovery');
 assert.equal(A.aggregate(index,now,r).recovery.groups.length,0,'resolved cases are retained as proof, not displayed as faults');
 r.cases[0].sourceEntry={...e,s:'FALSE_COMPLETE'};assert.equal(A.aggregate(index,now,r).problemReceipts,1);
});
test('duplicates, incomplete snapshots, forged row proofs and unverified later changes never hide failures',()=>{
 const e=entry('W-FAIL',[{pid:'V2I-1',op:'REPLACE',b:'b:1',a:'a:1'}],'NOT_PERSISTED'),index=fixture({old:e}),c=recoveryCase('old',e);
 for(const mutate of [r=>r.inProgress=true,r=>r.cases.push(r.cases[0]),r=>r.cases[0].rows[0].observedHash='wrong',r=>r.cases[0].rows[0].sha256='',r=>r.cases=[null]]){const r=recovery([JSON.parse(JSON.stringify(c))]);mutate(r);assert.equal(A.aggregate(index,now,r).problemReceipts,1);}
 const r=recovery([c]);c.rows[0]={...c.rows[0],status:'LATER_VERIFIED_HASH_CHAIN',observedHash:'c:1',chain:[{requestId:'later',writeId:'W-LATER',at:'2026-10-28T23:00:00Z',from:'a:1',to:'c:1'}]};
 assert.equal(A.aggregate(index,now,r).problemReceipts,1);
 index.requests.later=entry('W-LATER',[{pid:'V2I-1',op:'REPLACE',b:'a:1',a:'c:1'}],'COMPLETE','2026-10-28T23:00:00Z');assert.equal(A.aggregate(index,now,r).problemReceipts,0);
 index.requests.conflict=entry('W-LATER',[],'NOT_PERSISTED');assert.equal(A.aggregate(index,now,r).recoveredReceipts,0);
});
test('shared failed-batch aliases count separate receipts but one recovery incident',()=>{
 const e=entry('W-FAIL',[],'NOT_PERSISTED'),d=A.aggregate(fixture({alias1:e,alias2:e,alias3:e}),now,recovery([]));assert.equal(d.problemReceipts,3);assert.equal(d.problemWriteIncidents,1);assert.equal(d.recovery.status,'CURRENT');
});

test('retired failed obligations disappear without adding successful throughput or rewriting original failures',()=>{
 const e=entry('W-bad',[item],'NOT_PERSISTED','2026-10-20T00:00:00Z'),index=fixture({OLD:e}),report={schema:'forge.receipt-recovery.v1',at:'2026-10-28T23:55:00Z',source:{repo:'tpruittguitar/forge-writer-state',path:'PIPELINE_RECEIPT_INDEX.json',sha:'a'.repeat(40)},writerSubmissions:0,masterMutations:0,canonicalReceiptMutations:0,cases:[{requestId:'OLD',sourceEntry:e,status:'CLOSED_NO_ACTIVE_WORK',closure:{kind:'CURRENT_OBLIGATION_SATISFIED'},rows:[{primaryId:'V2I-1',sha256:'b'.repeat(64),readAt:'2026-10-28T23:54:00Z',bucket:'DECLINED_BY_TIM',status:'TERMINAL_NO_REWORK'}]}]};const d=A.aggregate(index,now,report);assert.equal(d.problemReceipts,0);assert.equal(d.closedObligations,1);assert.equal(d.rawProblemReceipts,1);assert.equal(d.recent.writes,0);assert.equal(index.requests.OLD.s,'NOT_PERSISTED');report.cases[0].rows[0].bucket='SCOUT_INTAKE';assert.equal(A.aggregate(index,now,report).problemReceipts,1);
});

test('36-hour rates include the older 12 hours, deduplicate jobs and exclude future and failed writes',()=>{
 const d=A.aggregate(fixture({old:entry('OLD',[{...item,op:'INSERT'}],'COMPLETE',new Date(now-35*3600000).toISOString()),alias:entry('OLD',[{...item,op:'INSERT'}],'COMPLETE',new Date(now-35*3600000).toISOString()),'FORGE-ENRICH_ATS-ATSBOT-A':entry('E1'),'FORGE-ENRICH_ATS-ATSBOT-B':entry('E2'),outside:entry('OUT',[{...item,pid:'OUT'}],'COMPLETE',new Date(now-36*3600000-1).toISOString()),future:entry('F',[{...item,pid:'F'}],'COMPLETE',new Date(now+1).toISOString()),bad:entry('BAD',[{...item,pid:'BAD'}],'NOT_PERSISTED')}),now);
 assert.equal(d.rates36.hours,36);assert.equal(d.rates36.intake.count,1);assert.equal(d.rates36.verification.count,1);assert.equal(d.rates36.enrichment.count,1);assert.equal(d.rates36.verification.perHour,1/36);assert.equal(d.recent.inserts,0);
});
