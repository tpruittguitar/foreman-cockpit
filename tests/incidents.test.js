const test=require('node:test'),assert=require('node:assert/strict'),P=require('../pipeline-incidents');
const T=(h,m)=>Date.parse('2026-10-06T'+String(h).padStart(2,'0')+':'+String(m||0).padStart(2,'0')+':00Z');
const iso=t=>new Date(t).toISOString();
const run=(file,status,at,error,extra)=>Object.assign({file,fileId:'id-'+file,terminalStatus:status,action:'',finishedAt:iso(at),error:error||''},extra||{});
const writer=(conds,auth)=>({name:'writer',authoritative:auth!==false,evidence:'writer_status',conditions:conds});
const active=s=>P.view(s,T(23)).active;

test('normalized operation strips retry suffixes but keeps run, batch and time identity',()=>{
  const same=['WRITER_QUEUE_CLAUDE_BACKLOG_20261005_SCHED.json','WRITER_QUEUE_CLAUDE_BACKLOG_20261005_SCHED_R2.json','WRITER_QUEUE_CLAUDE_BACKLOG_20261005_SCHED_R4.json','RESULT__WRITER_QUEUE_CLAUDE_BACKLOG_20261005_SCHED_R12B.json'].map(P.normalizeOperation);
  assert.equal(new Set(same).size,1);
  assert.equal(P.normalizeOperation('IDENTITY_RESOLVE_PASS2_20261004_RETRY.json'),P.normalizeOperation('IDENTITY_RESOLVE_PASS2_20261004.json'));
  assert.equal(P.normalizeOperation('CLAUDE-EMAIL-20261006-1630ET_intake_r2.json'),P.normalizeOperation('CLAUDE-EMAIL-20261006-1630ET_intake.json'));
  assert.notEqual(P.normalizeOperation('FORGE_FIT_EVIDENCE_20261004_RUN2.json'),P.normalizeOperation('FORGE_FIT_EVIDENCE_20261004_RUN4.json'));
  assert.notEqual(P.normalizeOperation('WRITER_QUEUE_GROK_RESCORE_PHASE1_20261006_B1.json'),P.normalizeOperation('WRITER_QUEUE_GROK_RESCORE_PHASE1_20261006_B2.json'));
});

test('normalized failure class masks timestamps, positions and counts but keeps the failure kind',()=>{
  const a=P.normalizeFailureClass('FAILED','','master changed during request (2026-10-02T14:00:40.189Z -> 2026-10-02T14:02:53.884Z); retry');
  const b=P.normalizeFailureClass('FAILED','','master changed during request; retry');
  assert.equal(a,b);
  assert.equal(P.normalizeFailureClass('FAILED','',"invalid JSON: Expected ',' or '}' after property value in JSON at position 573 (line 1 column 574)"),
    P.normalizeFailureClass('FAILED','',"invalid JSON: Expected ',' or '}' after property value in JSON at position 1876 (line 1 column 1877)"));
  assert.notEqual(P.normalizeFailureClass('FAILED','','Lock timeout: another process was holding the lock for too long.'),b);
  assert.notEqual(P.normalizeFailureClass('FAILED','BATCH_RULING',''),P.normalizeFailureClass('FAILED','','batch needs requests[]'));
});

test('repeated failures of one operation are one incident with attempt count, first and latest failure times',()=>{
  const s=P.empty(),err='The document is inaccessible. Please try again later.';
  P.observe(s,{runs:[run('WRITER_QUEUE_CLAUDE_BACKLOG_20261005_SCHED.json','FAILED',T(0,31),err),run('WRITER_QUEUE_CLAUDE_BACKLOG_20261005_SCHED_R2.json','FAILED',T(0,32),err),
    run('WRITER_QUEUE_CLAUDE_BACKLOG_20261005_SCHED_R3.json','FAILED',T(0,35),err),run('WRITER_QUEUE_CLAUDE_BACKLOG_20261005_SCHED_R4.json','FAILED',T(0,39),err)]},T(1));
  const a=active(s);assert.equal(a.length,1);assert.equal(a[0].attempts,4);assert.equal(a[0].firstAt,iso(T(0,31)));assert.equal(a[0].latestAt,iso(T(0,39)));
  assert.equal(a[0].latestFile,'WRITER_QUEUE_CLAUDE_BACKLOG_20261005_SCHED_R4.json');
});

test('the same failure event seen again on a later status poll is not counted twice',()=>{
  const s=P.empty(),r=run('FOO_20261006.json','FAILED',T(10),'batch too large (max 50 requests)');
  P.observe(s,{runs:[r]},T(10,1));P.observe(s,{runs:[r]},T(10,2));P.observe(s,{runs:[Object.assign({},r)]},T(10,3));
  assert.equal(active(s)[0].attempts,1);
});

test('a later verified SUCCESS of the same operation recovers the incident with evidence; health returns to LIVE',()=>{
  const s=P.empty();
  P.observe(s,{runs:[run('CLAUDE-EMAIL-20261006-1630ET_intake.json','FAILED',T(20,42),'invalid JSON: Expected , at position 1876')],unverifiedCount:0},T(20,43));
  assert.equal(P.health(s).state,'LIVE / WARNING');
  P.observe(s,{runs:[run('CLAUDE-EMAIL-20261006-1630ET_intake_r2.json','SUCCESS',T(20,47))],unverifiedCount:0},T(20,48));
  const v=P.view(s,T(21));assert.equal(v.active.length,0);assert.equal(v.recovered.length,1);
  assert.match(v.recovered[0].recoveryEvidence,/SUCCESS · CLAUDE-EMAIL-20261006-1630ET_intake_r2\.json/);assert.match(v.recovered[0].resolution,/Recovered/);
  assert.equal(P.health(s).state,'LIVE');
});

test('a SUCCESS before the failure, or of a different operation, does not recover it',()=>{
  const s=P.empty();
  P.observe(s,{runs:[run('A_20261006.json','SUCCESS',T(9)),run('A_20261006_R2.json','FAILED',T(10),'Lock timeout'),run('B_20261006.json','SUCCESS',T(11))],unverifiedCount:0},T(12));
  assert.equal(active(s).length,1);
});

test('retries create a new incident only after recovery or with a materially different failure class',()=>{
  const s=P.empty();
  P.observe(s,{runs:[run('TIM_IDENTITY_RESOLVE_20261005.json','FAILED',T(6,50),'batch needs requests[]'),run('TIM_IDENTITY_RESOLVE_20261005_R2.json','FAILED',T(6,55),'',{action:'BATCH_RULING'}),
    run('TIM_IDENTITY_RESOLVE_20261005_R3.json','FAILED',T(6,58),'',{action:'BATCH_RULING'})]},T(7));
  const a=active(s).sort((x,y)=>x.attempts-y.attempts);assert.equal(a.length,2,'different class = new incident');assert.deepEqual(a.map(i=>i.attempts),[1,2]);
  const t=P.empty();
  P.observe(t,{runs:[run('X_20261006.json','FAILED',T(1),'Lock timeout'),run('X_20261006_R2.json','SUCCESS',T(2)),run('X_20261006_R3.json','FAILED',T(3),'Lock timeout')],unverifiedCount:0},T(4));
  const all=Object.values(t.incidents);assert.equal(all.length,2,'a failure after recovery opens a new incident');
  assert.equal(all.filter(i=>i.status==='ACTIVE').length,1);assert.equal(all.filter(i=>i.status==='RECOVERED').length,1);
});

test('an unresolved incident never ages out of ACTIVE; resolved ones move to HISTORICAL outside the window',()=>{
  const s=P.empty();P.observe(s,{runs:[run('OLD_20261001.json','FAILED',Date.parse('2026-10-01T03:00:00Z'),'no JSON object found in file'),
    run('GONE_20261001.json','FAILED',Date.parse('2026-10-01T04:00:00Z'),'Lock timeout'),run('GONE_20261001_R2.json','SUCCESS',Date.parse('2026-10-01T04:05:00Z'))],unverifiedCount:0},Date.parse('2026-10-01T05:00:00Z'));
  const later=Date.parse('2026-10-20T00:00:00Z');P.observe(s,{runs:[]},later);
  const v=P.view(s,later);assert.equal(v.active.length,1);assert.equal(v.active[0].operation,'OLD_20261001');assert.equal(v.recovered.length,0);assert.equal(v.historical.length,1);
  assert.equal(P.health(s).state,'LIVE / WARNING');
});

test('HOLD-type failures recover only when no master write is left unverified, or by the Writer receipt check',()=>{
  const s=P.empty();
  P.observe(s,{runs:[run('GROK_RECON_20261005_0223ET.json','PARTIAL_HOLD',T(6,28),'PARTIAL: ran 2 of 4 requests'),run('GROK_RECON_20261005_0223ET_R2.json','SUCCESS',T(6,40))],unverifiedCount:1},T(6,41));
  assert.equal(active(s).length,1,'unverified write outstanding: downstream consequence may remain');
  P.observe(s,{runs:[run('GROK_RECON_20261005_0223ET_R2.json','SUCCESS',T(6,40))],unverifiedCount:0},T(6,50));
  assert.equal(active(s).length,0);
  const t=P.empty();P.observe(t,{runs:[run('CAT_SANFORD_intake.json','PARTIAL_HOLD',T(15,15),'PARTIAL: ran 1 of 2 requests',{recovered:true})]},T(16));
  const v=P.view(t,T(16));assert.equal(v.active.length,0);assert.match(v.recovered[0].recoveryEvidence,/Receipt index/);
});

test('live conditions: one incident while present, recovered by an authoritative read, untouched by a non-authoritative one',()=>{
  const s=P.empty(),c={component:'writer',code:'QUEUE_BACKLOG',severity:'critical',title:'Queue backlog',text:'3 request(s) waiting; oldest for 22 min.'};
  P.observe(s,{writer:writer([c])},T(10));P.observe(s,{writer:writer([Object.assign({},c,{text:'4 request(s) waiting; oldest for 23 min.'})])},T(10,1));
  assert.equal(active(s).length,1);assert.equal(active(s)[0].checks,2);assert.equal(P.health(s).state,'DEGRADED');
  P.observe(s,{writer:writer([{component:'writer',code:'WRITER_UNREACHABLE',severity:'critical',title:'Writer unreachable',text:'timeout'}],false)},T(10,2));
  assert.equal(active(s).length,2,'an unreachable Writer cannot prove the backlog cleared');
  P.observe(s,{writer:writer([])},T(10,3));
  const v=P.view(s,T(10,4));assert.equal(v.active.length,0);assert.equal(v.recovered.length,2);assert.match(v.recovered[0].recoveryEvidence,/writer_status at .* no longer reports it/);
  assert.equal(P.health(s).state,'LIVE');
});

test('a condition check is counted once per status read, not once per re-render',()=>{
  const s=P.empty(),src=(tok,at)=>({name:'writer',authoritative:true,token:tok,at,conditions:[{component:'writer',code:'TRIGGER_MISSING',severity:'critical',title:'t',text:'x'}]});
  P.observe(s,{writer:src('r1',T(9))},T(9));P.observe(s,{writer:src('r1',T(9))},T(9,0));P.observe(s,{writer:src('r1',T(9))},T(9,0));
  assert.equal(active(s)[0].checks,1);P.observe(s,{writer:src('r2',T(9,1))},T(9,1));assert.equal(active(s)[0].checks,2);assert.equal(active(s)[0].latestAt,iso(T(9,1)));
});

test('health: only ACTIVE incidents count; critical beats warning; resolved never degrade',()=>{
  const s=P.empty();assert.deepEqual(P.health(s),{state:'LIVE',critical:0,warning:0,recurring:[]});
  P.observe(s,{runs:[run('W_20261006.json','FAILED',T(1),'x')]},T(2));assert.equal(P.health(s).state,'LIVE / WARNING');
  P.observe(s,{writer:writer([{component:'writer',code:'TRIGGER_MISSING',severity:'critical',title:'Trigger missing',text:'not installed'}])},T(3));
  assert.deepEqual(P.health(s),{state:'DEGRADED',critical:1,warning:1,recurring:[]});
  P.observe(s,{writer:writer([])},T(4));assert.deepEqual(P.health(s),{state:'LIVE / WARNING',critical:0,warning:1,recurring:[]});
});

test('acknowledge retains a queue incident until verified recovery; live conditions cannot be acknowledged away',()=>{
  const s=P.empty();P.observe(s,{runs:[run('LOCK_GROKBOT_20261003T081944Z.txt','FAILED',T(8),'no JSON object found in file')],writer:writer([{component:'writer',code:'TRIGGER_MISSING',severity:'critical',title:'Trigger missing',text:'x'}])},T(9));
  const [cond,ev]=active(s);assert.equal(cond.kind,'condition');
  assert.equal(P.acknowledge(s,cond.id,'TIM',T(9,1)),false);assert.equal(P.acknowledge(s,ev.id,'TIM',T(9,1)),true);
  const v=P.view(s,T(9,2));assert.equal(v.active.length,2);assert.equal(v.recovered.length,0);assert.equal(v.active[1].status,'ACKNOWLEDGED_UNRESOLVED');assert.match(v.active[1].resolution,/Acknowledged by TIM/);
  assert.equal(P.health(s).state,'DEGRADED');
});

test('sync: only queue incidents are shared; ids match across devices; resolution and attempts merge without double counting',()=>{
  const a=P.empty(),b=P.empty(),r1=run('X_20261006.json','FAILED',T(1),'Lock timeout'),r2=run('X_20261006_R2.json','FAILED',T(2),'Lock timeout');
  P.observe(a,{runs:[r1,r2],writer:writer([{component:'writer',code:'QUEUE_BACKLOG',severity:'critical',title:'b',text:'1 waiting'}])},T(3));
  P.observe(b,{runs:[r1]},T(3));
  const synced=P.forSync(a);assert.equal(Object.values(synced.incidents).length,1);
  const m=P.merge(b,synced);assert(m.changed);const inc=Object.values(m.store.incidents)[0];assert.equal(inc.attempts,2);
  P.observe(m.store,{runs:[r1,r2]},T(4));assert.equal(Object.values(m.store.incidents)[0].attempts,2,'events already counted elsewhere are not re-counted');
  P.acknowledge(a,Object.values(a.incidents).find(i=>i.kind==='event').id,'TIM',T(5));
  const m2=P.merge(m.store,P.forSync(a));assert.equal(Object.values(m2.store.incidents)[0].status,'ACKNOWLEDGED_UNRESOLVED');
});
