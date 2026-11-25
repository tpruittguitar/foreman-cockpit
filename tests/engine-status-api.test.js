const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');

// The function is an ESM Pages Function inside a commonjs package, so Node cannot load it in place. Copy it into a temp
// "type":"module" folder and point its one relative import at the real PR 1 logic module by absolute file URL.
const SRC=path.join(__dirname,'../functions/api/engine-status.js');
const LOGIC=path.join(__dirname,'../pipeline-engine-status.js');
const FX=path.join(__dirname,'fixtures/engine-status');
let M;
test.before(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'engine-status-api-'));
 const source=fs.readFileSync(SRC,'utf8');
 assert.ok(source.includes("'../../pipeline-engine-status.js'"));
 fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(dir,'engine-status.js'),source.replace("'../../pipeline-engine-status.js'",JSON.stringify(pathToFileURL(LOGIC).href)));
 M=await import(pathToFileURL(path.join(dir,'engine-status.js')).href);
});

const MIN=60000,HOUR=60*MIN,AT_MS=Date.parse('2026-11-24T14:15:00-05:00');
const text=name=>fs.readFileSync(path.join(FX,name+'.json'),'utf8');
const fixture=name=>async p=>{assert.equal(p,M.FEED_PATH);return text(name);};
const missing=async()=>{throw Error('Engine status feed unavailable (404)');};
const ERR='Engine status not available';
function noNumbers(b){
 assert.equal(b.status,'error');assert.equal(b.copy,ERR);assert.equal(b.constraint,null);
 assert.deepEqual(b.steps,[]);assert.deepEqual(b.growingQueues,[]);assert.equal(b.writer,null);assert.equal(b.readyForDecision,null);assert.equal(b.asOf,null);
}

test('FEED_PATH is the one feed path constant',()=>{
 assert.equal(M.FEED_PATH,'tools/pipeline-v2/out/engine-status.json');
 const src=fs.readFileSync(SRC,'utf8');
 assert.equal((src.match(/engine-status\.json/g)||[]).length,1);
 assert.doesNotMatch(src,/github|raw\.githubusercontent|token|secret|Authorization/i);
});

test('fixtures are the PR 1 envelopes',()=>{
 const p=JSON.parse(text('populated'));
 assert.equal(p.schema,'forge.engine-status.v1');assert.equal(Date.parse(p.at),AT_MS);assert.equal(p.steps.length,19);
 assert.deepEqual(p.writer,{ratePerHour:18,lastWriteAt:new Date(AT_MS-MIN).toISOString()});
 assert.deepEqual(p.readyForDecision,{count:42,applied:27,declined:311});
 const x=JSON.parse(text('expired'));assert.equal(AT_MS-Date.parse(x.at),(24*60+35)*MIN);assert.deepEqual(x.steps.map(s=>s.id),p.steps.map(s=>s.id));
 assert.deepEqual(JSON.parse(text('empty')).steps,[]);
 assert.doesNotMatch(text('populated'),/GATE|WATCH|emailRejections|questions|Label/);
});

test('missing or unreadable feed with no last good: error, no constraint, no numbers',async()=>{
 noNumbers((await M.loadEngineStatus(missing,AT_MS)).body);
 noNumbers((await M.loadEngineStatus(async()=>'<!doctype html><html>',AT_MS)).body);
 noNumbers((await M.loadEngineStatus(async()=>'',AT_MS)).body);
});

test('populated feed at AT+5 min: ok, constraint 15, growth only postedpay, writer and ready passed through',async()=>{
 const {body,source}=await M.loadEngineStatus(fixture('populated'),AT_MS+5*MIN);
 assert.equal(source,'live');assert.equal(body.status,'ok');assert.equal(body.copy,null);
 assert.equal(body.constraint.n,15);assert.equal(body.constraint.id,'expfit');assert.equal(body.constraint.name,'Experience fit');
 assert.deepEqual(body.growingQueues.map(s=>[s.id,s.n,s.queue,s.queueDeltaPerHour]),[['postedpay',13,118,22]]);
 assert.deepEqual(body.writer,{queue:null,ratePerHour:18,lastWriteAt:new Date(AT_MS-MIN).toISOString()});
 assert.deepEqual(body.readyForDecision,{count:42,applied:27,declined:311});
});

test('stale-keep: a failed or missing refresh serves the last good envelope, recomputed at serve time',async()=>{
 const kept={value:null};
 assert.equal((await M.loadEngineStatus(fixture('populated'),AT_MS+MIN,kept)).body.status,'ok');
 assert.equal(typeof kept.value.at,'string','raw envelope kept, not an evaluated snapshot');assert.equal(kept.value.status,undefined);
 let r=await M.loadEngineStatus(missing,AT_MS+10*MIN,kept);
 assert.equal(r.source,'last-good');assert.equal(r.body.status,'ok');assert.equal(r.body.constraint.n,15);
 r=await M.loadEngineStatus(missing,AT_MS+2*HOUR,kept);
 assert.equal(r.source,'last-good');assert.equal(r.body.status,'stale');assert.equal(r.body.copy,'STALE · as of Nov 24, 2:15 PM ET');
 assert.equal(r.body.steps.length,19);assert.equal(r.body.constraint.n,15);assert.equal(r.body.growingQueues[0].queue,118);
 r=await M.loadEngineStatus(fixture('invalid'),AT_MS+2*HOUR,kept);
 assert.equal(r.source,'last-good');assert.equal(r.body.status,'stale','an invalid refresh does not replace or hide the last good copy');
 r=await M.loadEngineStatus(fixture('expired'),AT_MS+2*HOUR,kept);
 assert.equal(r.body.status,'expired');assert.equal(Date.parse(kept.value.at),AT_MS,'an older feed does not replace a newer last good');
});

test('24 h cutoff: expired copy, no current steps or constraint, including an old last good',async()=>{
 const detail='Last update over 24 h ago (as of Nov 23, 1:40 PM). Steps are unknown.';
 let {body}=await M.loadEngineStatus(fixture('expired'),AT_MS);
 assert.equal(body.status,'expired');assert.equal(body.copy,'No engine status');assert.equal(body.copyDetail,detail);
 assert.equal(body.constraint,null);assert.deepEqual(body.steps,[]);assert.deepEqual(body.growingQueues,[]);
 ({body}=await M.loadEngineStatus(fixture('populated'),AT_MS+24*HOUR));
 assert.equal(body.status,'expired');assert.equal(body.copyDetail,'Last update over 24 h ago (as of Nov 24, 2:15 PM). Steps are unknown.');assert.deepEqual(body.steps,[]);
 const kept={value:null};await M.loadEngineStatus(fixture('populated'),AT_MS,kept);
 const r=await M.loadEngineStatus(missing,AT_MS+24*HOUR+MIN,kept);
 assert.equal(r.source,'last-good');assert.equal(r.body.status,'expired');assert.equal(r.body.constraint,null);assert.deepEqual(r.body.steps,[]);
});

test('empty feed: "No steps reported yet", no constraint',async()=>{
 const {body}=await M.loadEngineStatus(fixture('empty'),AT_MS+MIN);
 assert.equal(body.status,'empty');assert.equal(body.copy,'No steps reported yet');assert.equal(body.constraint,null);assert.deepEqual(body.steps,[]);
});

test('invalid fixture or garbage: error state',async()=>{
 noNumbers((await M.loadEngineStatus(fixture('invalid'),AT_MS)).body);
 noNumbers((await M.loadEngineStatus(async()=>'{"schema":"forge.engine-status.v1","at":"x","steps":[]}',AT_MS)).body);
 noNumbers((await M.loadEngineStatus(async()=>'{{{',AT_MS)).body);
});

test('GET handler: same-origin read of /FEED_PATH, 200 JSON for every v1 state, never cached as fresh',async()=>{
 const seen=[];
 const assets=name=>({ASSETS:{fetch:async u=>{seen.push(u);return name?new Response(text(name)):new Response('Not found',{status:404});}}});
 for(const [name,status] of [['populated','ok'],['empty','empty'],['invalid','error'],[null,'error']]){
  const res=await M.handleGet({request:new Request('https://cockpit.example/api/engine-status'),env:assets(name)},{now:()=>AT_MS+5*MIN,kept:{value:null}});
  assert.equal(res.status,200);assert.equal(res.headers.get('Content-Type'),'application/json');
  assert.match(res.headers.get('Cache-Control'),/no-store/);assert.doesNotMatch(res.headers.get('Cache-Control'),/public/);
  assert.equal((await res.json()).status,status);
 }
 const kept={value:null},ctx=name=>({request:new Request('https://cockpit.example/api/engine-status'),env:assets(name)});
 await M.handleGet(ctx('populated'),{now:()=>AT_MS,kept});
 const res=await M.handleGet(ctx(null),{now:()=>AT_MS+2*HOUR,kept});
 assert.equal(res.status,200);assert.equal(res.headers.get('X-Engine-Status-Source'),'last-good');assert.match(res.headers.get('Cache-Control'),/no-store/);
 assert.equal((await res.json()).status,'stale');
 const res2=await M.handleGet(ctx('expired'),{now:()=>AT_MS,kept:{value:null}});
 assert.equal(res2.status,200);assert.equal((await res2.json()).status,'expired');
 assert.ok(seen.every(u=>u==='https://cockpit.example/'+M.FEED_PATH));
 const urls=[];const read=M.sameOriginReader(new Request('https://cockpit.example/api/engine-status?x=1'),{},async(u,o)=>{urls.push([u,o.cache]);return new Response('missing',{status:404});});
 await assert.rejects(()=>read(M.FEED_PATH),/unavailable \(404\)/);
 assert.deepEqual(urls,[['https://cockpit.example/tools/pipeline-v2/out/engine-status.json','no-store']]);
});

test('no writes and GET only',async()=>{
 assert.equal(typeof M.onRequestGet,'function');
 for(const k of ['onRequest','onRequestPost','onRequestPut','onRequestPatch','onRequestDelete'])assert.equal(M[k],undefined);
 const src=fs.readFileSync(SRC,'utf8');
 assert.doesNotMatch(src,/writeFile|\.put\(|\.delete\(|method\s*:\s*['"](POST|PUT|PATCH|DELETE)/);
 const before=fs.readdirSync(FX).map(f=>[f,fs.readFileSync(path.join(FX,f),'utf8')]);
 const kv=new Proxy({},{get(){throw Error('KV touched');}});
 const res=await M.handleGet({request:new Request('https://cockpit.example/api/engine-status'),env:{ASSETS:{fetch:async()=>new Response(text('populated'))},KV:kv,FORGE_KV:kv}},{now:()=>AT_MS,kept:{value:null}});
 assert.equal((await M.onRequestGet({request:new Request('https://cockpit.example/api/engine-status'),env:{ASSETS:{fetch:async()=>new Response('nope',{status:404})}}})).status,200);
 assert.equal(res.status,200);
 assert.deepEqual(fs.readdirSync(FX).map(f=>[f,fs.readFileSync(path.join(FX,f),'utf8')]),before);
 assert.equal(fs.existsSync(path.join(__dirname,'..',M.FEED_PATH)),false);
});
