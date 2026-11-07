// Local CPU comparison using a read-only forge-coordination checkout. No network,
// credentials, report contents, or generated sidecars are written or printed.
// Usage: node scripts/benchmark-health.cjs /path/to/forge-coordination [baseline-function.js]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.argv[2];if(!root){console.error('Usage: node scripts/benchmark-health.cjs <coordination checkout> [baseline-function.js]');process.exit(1);}
const reports=new Map(),sidecars=new Map();
for(const [key,file] of Object.entries({processStates:'state/PROCESS_COMPLETIONS.json',processFlow:'state/ENRICHMENT_FLOW.json',applicationOutcomes:'state/APPLICATION_OUTCOMES.json',emailRecovery:'state/EMAIL_RECOVERY_SUMMARY.json',attention:'attention/NEEDS_TIM.json',sources:'state/source-trial-report.json',boards:'state/board-discovery-report.json',schedules:'state/AUTOMATION_SCHEDULE_READBACK.json',boardHealth:'state/board-health.json',execution:'state/AUTOMATION_EXECUTION_EVIDENCE.json'})){
 const text=fs.readFileSync(path.join(root,file),'utf8');reports.set(file,text);
 if(key==='sources'||key==='boards'){
  const j=JSON.parse(text),urls=[...new Set(j.new_roles.filter(x=>x&&typeof x.url==='string'&&/^https:\/\//.test(x.url)).map(x=>x.url.replace(/#.*$/,'')))];
  sidecars.set(file.replace('.json','.health.json'),JSON.stringify({schema:'forge.discovery-health.v1',at:j.summary.at,failedBoards:j.summary.boards?.failed||0,candidates:j.new_roles.length,urls}));
 }
}
const sha='a'.repeat(40),now=Math.floor(Date.now()/60000)*60000;
function fixture(compact){let bytes=0;const fetcher=async url=>{
 if(url.startsWith('https://api.github.com/'))return Response.json({ref:'refs/heads/main',object:{type:'commit',sha}});
 const file=new URL(url).pathname.split('/').slice(4).join('/');const text=compact&&sidecars.has(file)?sidecars.get(file):reports.get(file);
 if(text===undefined)return new Response('',{status:404});bytes+=Buffer.byteLength(text);return new Response(text);
 };return {fetcher,bytes:()=>bytes};}
async function measure(run){for(let i=0;i<5;i++)await run();const times=[];for(let i=0;i<30;i++){const start=process.cpuUsage();await run();const t=process.cpuUsage(start);times.push((t.user+t.system)/1000);}times.sort((a,b)=>a-b);return {medianCpuMs:times[15],p95CpuMs:times[28]};}
async function moduleFrom(file){return import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(file,'utf8')).toString('base64'));}
(async()=>{
 const current=await moduleFrom(path.join(__dirname,'../functions/api/pipeline-health.js'));
 const baseline=process.argv[3]?await moduleFrom(process.argv[3]):current;
 const old=fixture(false),small=fixture(true),expected=await baseline.loadHealth(old.fetcher,now,sha),actual=await current.loadHealth(small.fetcher,now,sha);
 assert.deepEqual(actual,expected,'Compact and legacy health output must match exactly');
 const bytes={legacy:old.bytes(),compact:small.bytes()};
 const legacy=await measure(()=>baseline.loadHealth(old.fetcher,now,sha));
 const compact=await measure(()=>current.loadHealth(small.fetcher,now,sha));
 const warm=fixture(true);await current.healthResponse(warm.fetcher,null,now);
 const before=warm.bytes(),cached=await measure(()=>current.healthResponse(warm.fetcher,null,now));
 assert.equal(warm.bytes(),before,'Warm requests must not read evidence again');
 console.log(JSON.stringify({note:'Local Node process CPU, not production Cloudflare telemetry. 30 measured iterations per path; same real snapshot, output equality asserted.',bytes,legacy,compact,cached},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
