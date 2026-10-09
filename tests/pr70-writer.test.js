'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),W=require('../apps-script/Code.gs'),{world,MASTER}=require('./helpers/writer-world'),Policy=require('../pipeline-policy'),Rules=require('../pipeline-rules');
const make=(pid,company,req,url,bucket='SCOUT_INTAKE')=>'1 | '+pid+' | '+company+' | Director of Operations | '+bucket+' | ANALYSIS_PENDING | - | '+req+' | Austin, TX | SOURCE_URL='+url;
const intake=(id,records)=>({action:'intake',run:{SCOUT_RUN_ID:id,GROSS_FOUND:records.length},records});
test('Alvarez & Marsal versus Daniel Defense shared URL: original applied history unchanged, conflict durable',t=>{
 const row=make('DD','Daniel Defense','REQ123456','https://example.invalid/shared','APPLIED'),f=world(t,{rows:[row]});
 const r=f.post(intake('COLLISION',[{COMPANY:'Alvarez & Marsal',TITLE:'Director of Operations',LOCATION:'Austin, TX',REQ_ID:'REQ654321',SOURCE_URL:'https://example.invalid/shared',GMAIL_ID:'original-email'}]));
 assert.equal(r.results[0].outcome,'IDENTITY_CONFLICT');assert.equal(f.row('DD'),row);assert.equal(f.masterSaves(),0);
 const ledger=f.run(()=>W.operationsRead_());const o=ledger.summary.open[0];assert.equal(o.state,'NEEDS_RESOLUTION');assert.equal(o.source.GMAIL_ID,'original-email');assert.ok(o.candidateIds.includes('DD'));
});
test('Ash Grove exact employer/requisition across different intake URLs creates no duplicate',t=>{
 const f=world(t,{rows:[make('ASH','Ash Grove Cement','REQ987654','https://example.invalid/first')]});
 const r=f.post(intake('ASH-REDISCOVERY',[{COMPANY:'Ash Grove Cement',TITLE:'Director of Operations',LOCATION:'Austin, TX',REQ_ID:'REQ987654',SOURCE_URL:'https://example.invalid/second'}]));
 assert.equal(r.results[0].outcome,'EXISTING_MATCH');assert.equal(r.results[0].PRIMARY_ID,'ASH');assert.equal(f.masterSaves(),0);
});
test('mixed intake preserves independent insertion and conflicting original payload; later receipt/readback alone completes insert',t=>{
 const f=world(t,{rows:[make('OLD','Protected Co','REQ123456','https://example.invalid/shared','APPLIED')]});
 const r=f.post(intake('MIXED',[{COMPANY:'Other Co',TITLE:'Director of Operations',LOCATION:'Austin, TX',SOURCE_URL:'https://example.invalid/shared'}, {COMPANY:'New Co',TITLE:'Director of Operations',LOCATION:'Austin, TX',REQ_ID:'REQ777777',SOURCE_URL:'https://example.invalid/new'}]));
 assert.equal(r.results[0].outcome,'IDENTITY_CONFLICT');assert.equal(r.results[1].outcome,'INSERTED');assert.equal(f.masterSaves(),1);
 assert.equal(f.run(()=>W.operationsRead_()).summary.done,0);f.run(()=>W.verifyPendingWrites_());
 const summary=f.run(()=>W.operationsRead_()).summary;assert.equal(summary.done,1);assert.equal(summary.open.length,1);assert.equal(summary.open[0].outcome,'IDENTITY_CONFLICT');
});
test('alias identity requires documented evidence; uncertain alias stays held',()=>{
 const idx=W.indexExisting([make('OLD','Parent Manufacturing','REQ222222','https://example.invalid/role')]);
 const rec={COMPANY:'Subsidiary Manufacturing',TITLE:'Director of Operations',LOCATION:'Austin, TX',REQ_ID:'REQ222222',SOURCE_URL:'https://example.invalid/role',EMPLOYER_ALIASES:'Parent Manufacturing'};
 assert.equal(W.matchExisting(rec,idx).kind,'ambiguous');
 assert.equal(W.matchExisting({...rec,EMPLOYER_RELATIONSHIP_EVIDENCE:'Employer confirms subsidiary is recruiting under parent entity',EMPLOYER_RELATIONSHIP_URL:'https://example.invalid/relationship'},idx).kind,'exact');
});
test('owner-confirmed +30/+20 is shared by frontend and Writer policy; STRICT remains -30 reporting hold',()=>{
 const text='STATUS=ACTIVE\nPOLICY_VERSION=RULES_V4_20261007\nSECTION=DEGREE_FLEX\nFLEX_POLICY_VERSION=1\nHIGH_FLEX_MODIFIER=30\nSOFT_FLEX_MODIFIER=20\nNO_FLEX_MODIFIER=-10\nSTRICT_MODIFIER=-30\nSECTION=END';
 const p=Rules.flexPolicy(text);assert.equal(Policy.flex({DEGREE_TEXT:'Equivalent experience accepted'},p).modifier,30);
 assert.equal(Policy.flex({DEGREE_TEXT:'Bachelor degree or 12 years experience'},p).modifier,20);assert.equal(Policy.flex({DEGREE_TEXT:'Bachelor degree required; only degree path; no substitutions'},p).blocked,true);
});
test('migration-state transient reads retry before any commit; malformed metadata stays fail closed',t=>{
 const f=world(t,{rows:[make('ONE','Fixture Co','REQ123456','https://example.invalid/1')]});
 global.DriveApp.getRootFolder().createFile('PIPELINE_MIGRATION_STATE.json','{}');
 f.fail('PIPELINE_MIGRATION_STATE.json','read',{message:'Service error: Drive',times:2});
 assert.deepEqual(f.run(()=>W.readMigrationState_()),{});assert.equal(f.masterSaves(),0);
 f.files.get('PIPELINE_MIGRATION_STATE.json').content='{bad';assert.throws(()=>f.run(()=>W.readMigrationState_()),/unreadable/);assert.equal(f.masterSaves(),0);
});
test('120 full synthetic transactions survive receipt crashes and restart without disappeared obligations or replay',t=>{
 const f=world(t,{rows:[make('ONE','Fixture Co','REQ123456','https://example.invalid/1')]});
 for(let i=0;i<120;i++){
   const req={action:'ruling',ruling:{primaryId:'ONE',kind:'ENRICH',actor:'FORGE',requestId:'ENDURANCE-'+i,fields:{FORGE_NOTE:'Synthetic evidence '+i}}};
   if(i%13===0)f.fail('PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS');
   try{f.post(req);}catch(e){assert.match(e.message,/Synthetic crash/);}
   assert.equal(f.run(()=>W.verifyPendingWrites_()).decided[0].decision,'COMPLETE');
   assert.equal(f.post(req).mode,'ALREADY_APPLIED');
 }
 assert.equal(f.masterSaves(),120);assert.equal(Object.keys(f.index().requests).length,120);assert.equal(f.index().pending.length,0);
 assert.equal(Object.keys(W.completedReceiptRequestIds_(f.receipts())).length,120);
});
