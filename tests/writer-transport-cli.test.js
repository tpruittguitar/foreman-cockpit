'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {main}=require('../scripts/writer-intake.cjs'),W=require('../apps-script/Code.gs'),{world}=require('./helpers/writer-world');
test('supported HTTP intake persists raw Gmail evidence, verifies exact row hashes and reconciles restart without reposting',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pr70-transport-')),f=world(t,{rows:[]}),prior=global.fetch;let posts=0;
 t.after(()=>{global.fetch=prior;fs.rmSync(dir,{recursive:true,force:true});});
 const id='HTTP-SYNTHETIC',source={initiatingUrl:'https://example.invalid/job',gmailMessageId:'synthetic-email',card:2,rawBody:'Original synthetic digest evidence'};
 const body={action:'intake',run:{SCOUT_RUN_ID:id,GROSS_FOUND:1},records:[{COMPANY:'Synthetic HTTP employer',TITLE:'Director of Operations',LOCATION:'Austin, TX',REQ_ID:'REQ987654',SOURCE_URL:source.initiatingUrl,GMAIL_ID:source.gmailMessageId}]};
 fs.writeFileSync(path.join(dir,'connection.json'),JSON.stringify({url:'https://script.google.com/macros/s/synthetic/exec',key:'test-only'}));
 fs.writeFileSync(path.join(dir,'request.json'),JSON.stringify({requestId:id,body,source}));
 global.fetch=async(url,options)=>{let data;
   if(options.method==='POST'){posts++;assert.equal(options.headers['Content-Type'],'text/plain');data=f.post(JSON.parse(options.body));}
   else if(new URL(url).searchParams.get('action')==='request_result'){f.run(()=>W.verifyPendingWrites_());const entry=f.index().requests[id];data={ok:true,found:true,status:entry.s,durable:entry.s==='COMPLETE',entry};}
   else data={ok:true,text:f.master()[0]+'\n========\n'+f.master().slice(1).join('\n')};
   return {ok:true,json:async()=>data};
 };
 const args=[path.join(dir,'connection.json'),path.join(dir,'request.json'),path.join(dir,'checkpoints')];
 await main(args);await main(args);assert.equal(posts,1);
 const saved=JSON.parse(fs.readFileSync(path.join(args[2],crypto.createHash('sha256').update(id).digest('hex')+'.json')));
 assert.equal(saved.state,'VERIFIED_COMPLETE');assert.deepEqual(saved.source,source);assert(saved.proof.readback.rows[0].matches);
});

test('supported intake CLI imports and shows usage without Apps Script configuration or test preload',()=>{
 const {spawnSync}=require('node:child_process'),script=path.resolve(__dirname,'../scripts/writer-intake.cjs');
 const env={PATH:process.env.PATH,NODE_OPTIONS:''};
 const imported=spawnSync(process.execPath,['-e',`delete global.PropertiesService; require(${JSON.stringify(script)}); console.log('CLI_IMPORT_OK')`],{env,encoding:'utf8'});
 assert.equal(imported.status,0);assert.equal(imported.stdout.trim(),'CLI_IMPORT_OK');assert.equal(imported.stderr,'');
 const usage=spawnSync(process.execPath,[script],{env,encoding:'utf8'});
 assert.equal(usage.status,1);assert.match(usage.stderr,/Usage: writer-intake.cjs/);assert.doesNotMatch(usage.stderr,/WRITER_RUNTIME_CONFIG/);
});
test('standalone CLI row-proof hash stays identical to Writer for synthetic values',()=>{
 const {rowHash}=require('../scripts/writer-intake.cjs');
 for(const value of [null,undefined,'',0,'synthetic row','1 | SYNTHETIC | Example | Director | SCOUT_INTAKE | ANALYSIS_PENDING | - | R1 | Austin, TX | NOTE=Example','Unicode résumé 🔧','x'.repeat(10000)])assert.equal(rowHash(value),W.textHash_(value));
});
