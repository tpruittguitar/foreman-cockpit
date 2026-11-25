// Phone Status tab data (PipelineControlRoom.summary): same constraint rule as the desktop viewer; unknown stays null.
const test=require('node:test'),assert=require('assert'),CR=require('../pipeline-control-room.js');
const base={waiting:[{count:4576},{count:1273},{count:570}],upstream:{rates:{discovery:{perHour:40},intake:{perHour:44}}},
  flow:{completion:{enrichment:{perHour:17}},queues:{readyForReview:180}},rowsKnown:true,contactsKnown:true,
  outcomes:{applied:353,recruiting:{stages:{RECRUITER_SCREEN:1,HIRING_MANAGER:0,ONSITE_PANEL:0,OFFER:0}}}};
test('summary: four stages, waiting counts and the slowest stage with waiting work is the constraint',()=>{
  const s=CR.summary(base,{rateWindowHours:36});
  assert.deepStrictEqual(s.stages.map(x=>x.name),['Discovery','Intake','Enrichment','Your decisions']);
  assert.deepStrictEqual(s.stages.map(x=>x.perHour),[40,44,17,undefined]);
  assert.deepStrictEqual(s.stages.map(x=>x.constraint),[false,false,true,false]);
  assert.deepStrictEqual(s.waiting.map(w=>w.count),[4576,1273,570]);
  assert.deepStrictEqual([s.needDecision,s.applied,s.interviews],[180,353,1]);
});
test('summary: unknown evidence stays null, never zero, and names no constraint',()=>{
  const s=CR.summary({waiting:[{count:null},{count:null},{count:null}],outcomes:{}},{});
  assert.deepStrictEqual(s.stages.slice(0,3).map(x=>x.perHour),[null,null,null]);assert.ok(s.stages.every(x=>!x.constraint));
  assert.deepStrictEqual([s.needDecision,s.applied,s.interviews],[null,null,null]);
});
test('summary: a stage is the constraint only when work is waiting in front of it',()=>{
  const s=CR.summary(Object.assign({},base,{waiting:[{count:4576},{count:0},{count:570}]}),{});   // nothing waiting before Enrichment
  assert.deepStrictEqual(s.stages.map(x=>x.constraint),[false,true,false,false],'Intake (work waiting in front) is the constraint, not the slower idle Enrichment');
  const none=CR.summary(Object.assign({},base,{waiting:[{count:0},{count:0},{count:570}]}),{});
  assert.ok(none.stages.every(x=>!x.constraint),'no waiting work in front of any process: no constraint');
});
test('summary: delayed evidence keeps the last rates with their as-of time',()=>{
  const at='2026-11-18T02:06:00Z',live=CR.summary(base,{}),s=CR.summary(Object.assign({},base,{evidenceDelayed:true,flow:Object.assign({},base.flow,{at})}),{});
  assert.deepStrictEqual(s.stages.slice(0,3).map(x=>x.perHour),[40,44,17]);assert.ok(s.evidenceDelayed);
  assert.strictEqual(s.ratesAsOf,at);assert.strictEqual(live.ratesAsOf,null);
});

test('summary fallback rejects source-report-only discovery and checks capture evidence age independently',()=>{
 const now=Date.parse('2026-11-05T22:00:00Z'),m={now,activity:{rates36:{discovery:{count:40,perHour:40/36},intake:{count:36,perHour:1}}},waiting:[{count:10},{count:0},{count:0}],outcomes:{}};
 assert.strictEqual(CR.summary(m,{}).stages[0].perHour,null,'legacy automatic-source report rates are not all-source discovery');
 assert.strictEqual(CR.summary(m,{}).stages[1].perHour,null,'verification-time receipts are not admission-time history');
 Object.assign(m.activity.rates36.discovery,{unit:'candidate identities',sourceAt:new Date(now-60000).toISOString()});assert.strictEqual(CR.summary(m,{}).stages[0].perHour,40/36);
 m.activity.rates36.discovery.sourceAt=new Date(now-31*60000).toISOString();assert.strictEqual(CR.summary(m,{}).stages[0].perHour,null,'fresh Writer activity cannot make old discovery current');
 for(const h of [6,12,24])assert.strictEqual(CR.summary(m,{rateWindowHours:h}).stages[0].perHour,null,'36-hour fallback cannot fill another window');
});


test('mobile summary preserves partial coverage for every process rate',()=>{
 const m={...base,upstream:{rates:{discovery:{perHour:40,partial:true},intake:{perHour:44,partial:true}}},flow:{...base.flow,completion:{enrichment:{perHour:17,partial:true}}}};
 const s=CR.summary(m,{});assert.deepStrictEqual(s.stages.slice(0,3).map(x=>x.partial),[true,true,true]);
});

test('summary: a fresh load with flow older than 90 min keeps rates, names the constraint, and is STALE (cs-5ae582a6)',()=>{
  const now=Date.parse('2026-10-29T00:00:00Z'),at=new Date(now-120*60000).toISOString();
  const f={now,health:{ok:true,processFlow:{at,population:{total:3,reconciled:true},queues:{verification:0,enrichment:2,readyForReview:1,blockedClosed:0},completion:{enrichment:{available:true,perHour:2.2,count36:79,last24h:50}},upstream:{at,reconciled:true,total:2,accounted:2,waiting:2,counts:{WAITING:2,PRESENT:0,EXCLUDED:0,HELD:0,IDENTITY_HOLD:0,MISSING_PREVIOUSLY_PRESENT:0},rates:{discovery:{perHour:9.1,available:true,unit:'candidate identities'},intake:{perHour:4.1,available:true}}}}},master:{loaded:true,freshness:'FRESH',rows:[]},activity:{ok:true,today:{writes:0}}};
  const s=CR.summary(CR.model(f),{});
  assert.strictEqual(s.stale,true);
  assert.strictEqual(s.ratesAsOf,at);
  assert.deepStrictEqual(s.stages.slice(0,3).map(x=>x.perHour),[9.1,4.1,2.2]);
  assert.ok(s.stages.some(x=>x.constraint),'names a real constraint on a feed older than 90 min');
  assert.strictEqual(s.needDecision,1);
  assert.strictEqual(s.waiting[1].count,2);
  const dead=CR.summary(CR.model(Object.assign({},f,{now:now+25*3600000-120*60000})),{});
  assert.notStrictEqual(dead.stale,true,'older than 24 h still fails closed');
  assert.deepStrictEqual(dead.stages.slice(0,3).map(x=>x.perHour),[null,null,null]);
});
