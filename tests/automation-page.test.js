const test=require('node:test'),a=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),P=require('../automation-planner');
test('same page refresh uses changed schedules, withdraws gaps for running jobs and fails closed',async()=>{
 const elements={},el=id=>elements[id]||(elements[id]={value:id==='duration'?'15':id==='ai-duration'?'10':'',textContent:'',innerHTML:'',querySelectorAll:()=>[],scrollIntoView:()=>{}});
 let cron='0 * * * *',running=false,fail=false;
 const ctx={AutomationPlanner:P,document:{getElementById:el,hidden:false},setTimeout,clearTimeout,setInterval:()=>{},AbortController,Date,Intl,console,fetch:async url=>{
  if(fail)throw Error('offline');let result;
  if(url.endsWith('AI_AUTOMATION_TASKS.json'))result={tasks:{}};
  else if(url.endsWith('AUTOMATION_SCHEDULE_READBACK.json'))result={at:new Date().toISOString(),local:[],external:[]};
  else if(url.endsWith('CLOUD_AUTOMATION_READBACK.json'))result={at:new Date().toISOString(),tasks:[]};
  else if(url.includes('/contents/'))result=[{name:'worker.yml',path:'.github/workflows/worker.yml'}];
  else if(url.includes('/actions/runs'))result={total_count:running?1:0,workflow_runs:running?[{name:'writer',status:'in_progress',html_url:'https://github.com/tpruittguitar/forge-coordination/actions/runs/1'}]:[]};
  else result='name: worker\non:\n  workflow_dispatch:\n  schedule:\n    - cron: "'+cron+'"\njobs:\n  worker:\n    timeout-minutes: 10';
  return{ok:true,json:async()=>result,text:async()=>result};
 }};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../automation-page.js'),'utf8'),ctx);await new Promise(r=>setTimeout(r,20));a.match(el('code').innerHTML,/0 \* \* \* \*/);
 cron='37 * * * *';await vm.runInContext('refresh()',ctx);a.match(el('code').innerHTML,/37 \* \* \* \*/);
 running=true;await vm.runInContext('refresh()',ctx);a.match(el('gaps').innerHTML,/Wait and recheck/);
 fail=true;await vm.runInContext('refresh()',ctx);a.match(el('gaps').textContent,/No timing advice/);
});
