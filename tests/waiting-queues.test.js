const{test}=require('node:test'),a=require('node:assert/strict'),Q=require('../pipeline-waiting-queues'),crypto=require('node:crypto');const at='2026-11-01T22:00:00Z',rev='a'.repeat(40),page={schema:'forge.intake-waiting-page.v1',items:[{key:'k',company:'Factory <script>',title:'Plant Manager',location:'Austin',status:'HELD',reason:'Identity review',sourceUrl:'javascript:bad'}]},text=JSON.stringify(page),digest=s=>crypto.createHash('sha256').update(s).digest('hex');function fixture(){return{health:{sourceRevision:rev,processFlow:{at,population:{reconciled:true},queues:{enrichment:1,readyForReview:1},upstream:{reconciled:true,waiting:1}}},index:{schema:'forge.waiting-queues.v1',at,reconciled:true,counts:{intake:1,enrichment:1,decision:1},ids:{enrichment:['V2I-E'],decision:['V2I-D']},intake:{pages:[{path:'state/waiting-queues/intake-0001.json',count:1,sha256:digest(text)}]}}};}
test('queue membership requires matching snapshot, distinct IDs and exact backlog counts',()=>{const f=fixture();a.equal(Q.validate(f.index,f.health,Date.parse(at)),f.index);f.index.counts.enrichment=2;a.throws(()=>Q.validate(f.index,f.health,Date.parse(at)));f.index.counts.enrichment=1;f.index.at='2026-10-31T22:00:00Z';a.throws(()=>Q.validate(f.index,f.health,Date.parse(at)));});
test('candidate pages are revision-pinned, hash checked and remain outside the master',async()=>{const f=fixture(),urls=[],c=Q.create({now:()=>Date.parse(at),digest,fetch:async url=>{urls.push(url);return url.endsWith('PIPELINE_WAITING_QUEUES.json')?{ok:true,json:async()=>f.index}:{ok:true,text:async()=>text}}});await c.accept(f.health);a.equal(c.ids('enrichment').has('V2I-E'),true);await c.intake();a.equal(c.state.intakeStatus,'complete');a.equal(c.state.loaded,1);a.ok(urls.every(u=>u.includes('/'+rev+'/')));const h=Q.intakeHtml(c.state,'factory',0);a.match(h,/Factory &lt;script&gt;/);a.doesNotMatch(h,/href="javascript/);a.doesNotMatch(h,/data-id=|data-ruling|data-bulk/);});
test('failed page reads are incomplete coverage, never an empty successful queue',async()=>{const f=fixture(),c=Q.create({now:()=>Date.parse(at),digest,fetch:async u=>u.endsWith('PIPELINE_WAITING_QUEUES.json')?{ok:true,json:async()=>f.index}:{ok:false,status:503}});await c.accept(f.health);await c.intake();a.equal(c.state.intakeStatus,'error');a.match(Q.intakeHtml(c.state,'',0),/results incomplete/);});
test('tampered pages and canonical-looking candidate rows are rejected',async()=>{const f=fixture();a.throws(()=>Q.pageItems({...page,items:[{...page.items[0],PRIMARY_ID:'V2I-FAKE'}]},f.index.intake.pages[0]));const c=Q.create({now:()=>Date.parse(at),digest,fetch:async u=>u.endsWith('PIPELINE_WAITING_QUEUES.json')?{ok:true,json:async()=>f.index}:{ok:true,text:async()=>text+'changed'}});await c.accept(f.health);await c.intake();a.match(c.state.error,/hash mismatch/);a.equal(c.state.intakeStatus,'error');});

test('waiting cards show provisional resume evidence and rule review without inventing a score',()=>{
 const item={...page.items[0],preliminaryScreen:{ats:{status:'PRELIMINARY_OVERLAP',resumeVersion:'2026-10-13T22:42:09Z',matches:[{competencyId:'quality_systems'},{competencyId:'startup_launch'}]},neverConsider:{status:'REVIEW_PROTECTED_SUPPLIER'}}};
 const h=Q.intakeHtml({items:[item],loaded:1,intakeStatus:'complete'},'',0);a.match(h,/2 resume-supported competency areas/);a.match(h,/Resume 2026-10-13/);a.match(h,/Supplier exception/);a.doesNotMatch(h,/%|ATS score/);
 item.preliminaryScreen.ats.status='RESUME_UPDATE_REQUIRED';a.match(Q.intakeHtml({items:[item],loaded:1,intakeStatus:'complete'},'',0),/Resume update needed/);
});


test('backlog capture age is visible without inventing a date for old undated records',()=>{
 const state={items:[{...page.items[0],firstSeen:'2026-11-01T20:00:00Z'}],loaded:1,intakeStatus:'complete'};
 a.match(Q.intakeHtml(state,'',0),/Captured 11\/1\/2026/);delete state.items[0].firstSeen;a.match(Q.intakeHtml(state,'',0),/Capture date unknown/);a.match(Q.intakeHtml(state,'',0),/not all ready for intake/);
});

test('saved discovery evidence is pinned to the snapshot and only shows supported facts',()=>{
 const path='state/discovery-evidence/'+ 'b'.repeat(64)+'.json',item={...page.items[0],evidenceRefs:[{path,sha256:'b'.repeat(64),fullPosting:true,observedAt:at}],discoveredFacts:{fullPosting:true,sourceRef:path,degree:{req:'PREFERRED'},pay:{low:175000,high:200000}}},state={items:[item],loaded:1,intakeStatus:'complete',revision:rev};
 let h=Q.intakeHtml(state,'',0);a.match(h,/Saved posting/);a.match(h,new RegExp('/blob/'+rev+'/state/discovery-evidence/'));a.match(h,/Degree: PREFERRED/);a.match(h,/175,000/);
 item.discoveredFacts.sourceRef='different';h=Q.intakeHtml(state,'',0);a.doesNotMatch(h,/Posted annual base|Degree:/);item.evidenceRefs[0].path='javascript:bad';a.doesNotMatch(Q.intakeHtml(state,'',0),/Saved posting/);
});

test('a non-SHA source revision is an error and does not fetch a snapshot',async()=>{
 const f=fixture(),urls=[],c=Q.create({now:()=>Date.parse(at),digest,fetch:async url=>{urls.push(url);return {ok:true,json:async()=>f.index}}});
 await c.accept({...f.health,sourceRevision:'main'});
 a.equal(c.state.status,'error');
 a.equal(c.state.error,'Queue snapshot revision is unverified');
 a.equal(c.state.index,null);
 a.equal(urls.length,0);
 await c.accept({...f.health,sourceRevision:undefined});
 a.equal(c.state.error,'Queue snapshot revision is unverified');
 a.equal(urls.length,0);
});

test('cs-e3a8680f (4): a snapshot past 90 min is kept, marked STALE with its as-of time; fresh is unchanged; past 24 h still fails',async()=>{
 const f=fixture(),t0=Date.parse(at);let clock=t0,fetches=0;
 const c=Q.create({now:()=>clock,digest,fetch:async()=>{fetches++;return {ok:true,json:async()=>f.index};}});
 await c.accept(f.health);a.equal(c.state.status,'ready');a.equal(c.state.stale,false);a.equal(c.state.asOf,at);
 clock=t0+120*60000;const kept=await c.accept(f.health);
 a.equal(kept,f.index);a.equal(c.state.index,f.index,'the last snapshot is kept, not cleared');a.equal(c.state.status,'ready');a.equal(c.state.stale,true);a.equal(c.state.asOf,at);a.equal(fetches,1);
 a.equal(Q.validate(f.index,f.health,t0+120*60000),f.index,'a 2-hour-old snapshot still validates');
 a.throws(()=>Q.validate(f.index,f.health,t0+25*3600000),/unavailable/,'older than 24 h still fails closed');
});

test('GUI review (cs-e3a8680f): the kept snapshot reads STALE · as of <boardTime> ET on every queue surface',()=>{
 a.equal(Q.asOfLabel('2026-11-24T19:15:00Z'),'as of Nov 24, 2:15 PM ET');
 a.equal(Q.staleLabel({stale:true,asOf:'2026-11-24T19:15:00Z'}),'STALE · as of Nov 24, 2:15 PM ET');
 a.equal(Q.staleLabel({stale:false,asOf:'2026-11-24T19:15:00Z'}),'');a.equal(Q.staleLabel({stale:true,asOf:null}),'','no invented as-of');
 const fs=require('node:fs'),path=require('node:path'),html=fs.readFileSync(path.join(__dirname,'../pipeline.html'),'utf8'),mob=fs.readFileSync(path.join(__dirname,'../pipeline-mobile.js'),'utf8');
 a.ok(html.includes("note=index?(PipelineWaitingQueues.staleLabel(st)||"),'desktop queue bar');a.ok(html.includes('staleLabel:PipelineWaitingQueues.staleLabel(st)'),'mobile feed');
 a.ok(mob.includes("esc('Decision queue is ' + qs.staleLabel.replace(' · ', ', '))")&&mob.includes("gl('caution') + '<span>' + esc(qs.staleLabel)"),'mobile Decide banner: word, glyph, accessible name');
});
