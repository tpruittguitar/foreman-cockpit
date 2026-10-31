const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../pipeline-control-room');
test('averaging selector uses measured window rates and changes constraint without changing queues',()=>{
 const rate=n=>({count:n*6,perHour:n,available:true}),model={now:Date.now(),activity:null,counts:{},checks:{},health:{},flow:{at:new Date().toISOString(),population:{total:10},queues:{enrichment:8,readyForReview:2,blockedClosed:0},completion:{enrichment:rate(1)},completionByWindow:{6:{enrichment:rate(4)},36:{enrichment:rate(1)}}},upstream:{counts:{PRESENT:1,EXCLUDED:0,WAITING:5,HELD:0,IDENTITY_HOLD:0,MISSING_PREVIOUSLY_PRESENT:0},reconciliation:{},coverage:{},ratesByWindow:{6:{discovery:rate(9),intake:rate(2)},36:{discovery:rate(9),intake:rate(3)}}},waiting:[{count:5},{count:8},{count:2}],outcomes:{recruiting:{needsStatus:0,jobs:[],stages:{}}},blocks:[],warnings:[],daily:[],decisions:0};
 const short=C.html(model,{rateWindowHours:6}),long=C.html(model,{rateWindowHours:36});
 assert.match(short,/CONSTRAINT: Intake/);assert.match(long,/CONSTRAINT: Enrichment/);
 assert.match(short,/4 <span class="cr-rate-unit">jobs\/hr/);assert.match(short,/6 h average/);
 assert.match(short,/value="6" selected/);assert.match(long,/value="36" selected/);
 assert.match(short,/8 awaiting enrichment/);assert.match(long,/8 awaiting enrichment/);
 assert.deepEqual([...short.matchAll(/<option value="(\d+)"/g)].map(m=>Number(m[1])),[36,24,12,6]);
 assert.equal(C.rateWindow('12'),12);assert.equal(C.rateWindow(7),36);
});
test('missing selected-window history is not replaced by a scaled 36-hour rate',()=>{
 const result=C.constraint([null,null,{perHour:2}],[null,5,8],6);assert.deepEqual(result.indices,[]);
});


