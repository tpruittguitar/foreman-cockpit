/* Isolated synthetic Writer benchmark. Never connects to production or certifies native capacity. */
'use strict';
const fs=require('node:fs'),{performance}=require('node:perf_hooks'),{world}=require('../tests/helpers/writer-world'),Capacity=require('../pipeline-workload');
const samples=[];
for(const records of [5,10,20,30])for(let repeat=0;repeat<12;repeat++){
  const cleanup=[],f=world({after:fn=>cleanup.push(fn)},{rows:[]});
  try{
    const body={action:'intake',run:{SCOUT_RUN_ID:'BENCH-'+records+'-'+repeat,GROSS_FOUND:records},records:Array.from({length:records},(_,i)=>({COMPANY:'Synthetic employer '+i,TITLE:'Director of Operations',LOCATION:'Austin, TX',REQ_ID:'BENCHREQ'+i,SOURCE_URL:'https://example.invalid/'+i}))};
    const start=performance.now(),result=f.post(body),elapsedMs=performance.now()-start;
    f.run(()=>require('../apps-script/Code.gs').verifyPendingWrites_());
    samples.push({environment:'local-synthetic',records,elapsedMs,payloadBytes:Buffer.byteLength(JSON.stringify(body)),ok:result.ok===true,build:'working-checkpoint',storageModel:'synthetic-text/plain',operation:'intake'});
  }finally{cleanup.reverse().forEach(fn=>fn());}
}
const report={productionAcceptance:'NOT_TESTED',limitations:'Node service doubles; excludes Google API latency, quota, native schedulers and production scaling',generatedAt:new Date().toISOString(),summary:Capacity.summarize(samples),samples};
const target=process.argv[2];if(target)fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');else console.log(JSON.stringify(report));
if(samples.some(s=>!s.ok))process.exitCode=1;
