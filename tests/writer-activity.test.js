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
test('read-only endpoint fetches fixed public source and returns aggregate without raw identities',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../functions/api/writer-activity.js'),'utf8').replace('../../pipeline-writer-activity.js',pathToFileURL(path.join(__dirname,'../pipeline-writer-activity.js')).href);
 const mod=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const d=await mod.loadActivity(async(url,options)=>{assert.match(url,/^https:\/\/raw.githubusercontent.com\/tpruittguitar\/forge-writer-state\/main\/PIPELINE_RECEIPT_INDEX.json\?cb=/);assert.equal(options.method,undefined);return new Response(JSON.stringify(fixture({secretId:entry('W1')})));},now);
 assert.equal(d.recent.writes,1);assert.doesNotMatch(JSON.stringify(d),/secretId|V2I-1/);
 await assert.rejects(()=>mod.loadActivity(async()=>new Response('down',{status:503}),now),/unavailable/);
});
