const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../pipeline-derived-refresh'),Pol=require('../pipeline-policy'),W=require('../apps-script/Code.gs');
const V3={HIGH_FLEX_MODIFIER:30,SOFT_FLEX_MODIFIER:20,NO_FLEX_MODIFIER:-15,STRICT_MODIFIER:-30,NOT_STATED_CLASS:'HIGH_FLEX',EQUIVALENCY_CLASS:'SOFT_FLEX',HARD_DEGREE_CLASS:'NO_FLEX',SINGLE_PATH_CLASS:'STRICT',FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'};
const row=(id,bucket,payload)=>({id,PRIMARY_ID:id,BUCKET:bucket,COMPANY:'Co '+id,TITLE:'Title '+id,payload});
const line=(id,bucket,payload)=>['1',id,'Co','Title',bucket,'RESOLVED/NEEDS_RESOLUTION','SRC','LI-1','Remote','x'].join(' | ').replace(/ \| x$/,' | '+Object.keys(payload).map(k=>k+'='+payload[k]).join('; '));

test('a row stored under the old policy is stale; the planned values are what the current policy gives',()=>{
  const p=D.plan([row('A','MANUAL_RESEARCH',{FLEX_CLASS:'SOFT_FLEX',FLEX_MODIFIER:'6',SCOPE_FIT_RAW:'70',ADJUSTED_FIT:'76',PURSUIT_STATUS:'NEEDS_EVIDENCE'})],V3);
  assert.equal(p.stale.length,1);const c=Object.fromEntries(p.stale[0].changes.map(x=>[x.field,x]));
  assert.deepEqual([c.FLEX_MODIFIER.before,c.FLEX_MODIFIER.after],['6','20']);assert.deepEqual([c.ADJUSTED_FIT.before,c.ADJUSTED_FIT.after],['76','90']);
  assert.equal(p.byClass.SOFT_FLEX,1);assert.equal(p.upToDate,0);assert.deepEqual(p.policy,{HIGH_FLEX:30,SOFT_FLEX:20,NO_FLEX:-15,STRICT:-30});
});

test('rows already on the current policy are up to date, including numeric formatting differences',()=>{
  const p=D.plan([row('A','SCOUT_INTAKE',{FLEX_CLASS:'HIGH_FLEX',FLEX_MODIFIER:'30.0',SCOPE_FIT_RAW:'60',ADJUSTED_FIT:'90'}),row('B','SCOUT_INTAKE',{FLEX_CLASS:'NO_FLEX',FLEX_MODIFIER:'-15'})],V3);
  assert.equal(p.stale.length,0);assert.equal(p.upToDate,2);
});

test('a value that is simply absent is not "stale": only differences from a stored value select a row',()=>{
  const p=D.plan([row('A','SCOUT_INTAKE',{FLEX_CLASS:'SOFT_FLEX',SCOPE_FIT_RAW:'70'})],V3);
  assert.equal(p.stale.length,0,'nothing stored, nothing out of date');assert.equal(p.upToDate,1);
});

test('rows outside active work are counted but never planned; rows with no class or an unrecognised class are reported, not touched',()=>{
  const p=D.plan([row('APP','APPLIED',{FLEX_CLASS:'SOFT_FLEX',FLEX_MODIFIER:'6'}),row('NC','SCOUT_INTAKE',{FLEX_MODIFIER:'6'}),row('CF','SCOUT_INTAKE',{FLEX_CLASS:'BANANA',FLEX_MODIFIER:'6'})],V3);
  assert.equal(p.stale.length,0,'none of these is planned');assert.equal(p.outOfScopeStale,1,'the applied row is stale but left alone');
  assert.equal(p.noClass,1);assert.deepEqual(p.classConflict.map(x=>[x.id,x.stored,x.derived]),[['CF','BANANA','UNKNOWN']],'a class the policy does not recognise is surfaced for review, never rewritten');
});

test('an explicit FLEX_CLASS wins over legacy FLEX text, exactly as in the Writer, so such a row is judged on its stored class',()=>{
  const p=D.plan([row('A','SCOUT_INTAKE',{FLEX_CLASS:'HIGH_FLEX',FLEX_MODIFIER:'15',FLEX:'NO'})],V3);
  assert.equal(p.stale.length,1);assert.equal(p.stale[0].flexClass,'HIGH_FLEX');assert.equal(p.stale[0].changes[0].after,'30');
});

test('requests repeat the stored class only, are stamped EXPLORER, and have stable per-policy per-row ids',()=>{
  const p=D.plan([row('V2F-1','MANUAL_RESEARCH',{FLEX_CLASS:'NO_FLEX',FLEX_MODIFIER:'-10'}),row('V2F-2','MANUAL_RESEARCH',{FLEX_CLASS:'STRICT',FLEX_MODIFIER:'-10'})],V3);
  const r=D.requests(p.stale,p.policyId);assert.equal(r.length,2);
  r.forEach((x,i)=>{assert.equal(x.action,'ruling');assert.equal(x.ruling.kind,'ENRICH');assert.deepEqual(Object.keys(x.ruling.fields),['FLEX_CLASS']);assert.equal(x.ruling.fields.FLEX_CLASS,p.stale[i].flexClass);
    assert.equal(x.ruling.actor,'EXPLORER');assert.equal(x.ruling.requestId,'PX-REFRESH-'+p.policyId+'-'+p.stale[i].primaryId)});
  assert.deepEqual(D.requests(p.stale,p.policyId).map(x=>x.ruling.requestId),r.map(x=>x.ruling.requestId),'ids are reproducible, so a rerun cannot double-write');
  assert.notEqual(D.policyId(Pol.normalizeFlexPolicy(V3)),D.policyId(Pol.normalizeFlexPolicy({})),'a different policy gets a different id');
});

test('chunking keeps batches at 25 or fewer and covers every row once',()=>{
  const list=Array.from({length:61},(_,i)=>i),c=D.chunk(list);
  assert.deepEqual(c.map(x=>x.length),[25,25,11]);assert.deepEqual([].concat(...c),list);assert.equal(D.CHUNK,25);
});

test('the plan matches what the real Writer writes when it processes the refresh request (every case above)',()=>{
  const cases=[{FLEX_CLASS:'SOFT_FLEX',FLEX_MODIFIER:'6',SCOPE_FIT_RAW:'70',ADJUSTED_FIT:'76',PURSUIT_STATUS:'NEEDS_EVIDENCE'},{FLEX_CLASS:'NO_FLEX',FLEX_MODIFIER:'-10',SCOPE_FIT_RAW:'95',ADJUSTED_FIT:'85',PURSUIT_STATUS:'PURSUE_CANDIDATE'},
    {FLEX_CLASS:'STRICT',FLEX_MODIFIER:'-10',SCOPE_FIT_RAW:'50',ADJUSTED_FIT:'40'},{FLEX_CLASS:'HIGH_FLEX',FLEX_MODIFIER:'30',SCOPE_FIT_RAW:'60',ADJUSTED_FIT:'90'},{FLEX_CLASS:'HIGH_FLEX',FLEX_MODIFIER:'15',SCOPE_FIT_RAW:'98',ADJUSTED_FIT:'100'},{FLEX_CLASS:'UNKNOWN',FLEX_MODIFIER:'0',SCOPE_FIT_RAW:'70',ADJUSTED_FIT:'70'}];
  cases.forEach((payload,i)=>{const id='V2F-T'+i,rw=row(id,'MANUAL_RESEARCH',payload),p=D.plan([rw],V3),l=line(id,'MANUAL_RESEARCH',payload);
    const res=W.mutateRow(l,D.requests([{primaryId:id,flexClass:payload.FLEX_CLASS}],'T')[0].ruling,Pol.normalizeFlexPolicy(V3));assert.equal(res.ok,true,res.error);
    const after=W.parsePayload(res.after.split(' | ').slice(9).join(' | ')).payload;
    assert.equal(after.FLEX_CLASS,payload.FLEX_CLASS,'the class is never changed');assert.equal(res.after.split(' | ')[4],'MANUAL_RESEARCH','the bucket is never changed');
    const wrote=['FLEX_MODIFIER','ADJUSTED_FIT','PURSUIT_STATUS'].filter(k=>payload[k]!==undefined&&!D.same(after[k],payload[k]));
    assert.equal(p.stale.length>0,wrote.length>0,'case '+i+': the plan selects the row exactly when the Writer would change a stored value');
    (p.stale[0]?p.stale[0].changes:[]).forEach(c=>assert(D.same(after[c.field],c.after),'case '+i+' '+c.field+': predicted '+c.after+', Writer wrote '+after[c.field]))});
});
