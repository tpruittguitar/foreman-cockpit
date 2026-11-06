#!/usr/bin/env node
'use strict';
// Generate descriptive capabilities from the reviewed central registry. Registry
// presence never grants a native AI canonical write actions.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function catalogue(registryDirectory){
 const read=file=>fs.readFileSync(path.join(registryDirectory,'control',file),'utf8').replace(/\r\n/g,'\n');
 const raw=read('AI_AUTOMATION_TASKS.json'),bindingRaw=read('NATIVE_AUTOMATION_BINDINGS.json'),cutoverRaw=read('CHATGPT_OWNER_CUTOVER.json');
 const registry=JSON.parse(raw),bindings=JSON.parse(bindingRaw),cutover=JSON.parse(cutoverRaw);
 if(registry.schema!=='forge.ai-automation-tasks.v1'||bindings.schema!=='forge.native-automation-bindings.v1')throw Error('CURRENT_REGISTRY_REQUIRED');
 const retired=new Set((cutover.retired||[]).map(t=>t.taskKey));
 const tasks=Object.entries(registry.tasks).map(([key,t])=>{
  const matches=bindings.bindings.filter(b=>b.taskKey===key);if(matches.length>1)throw Error('AMBIGUOUS_NATIVE_TASK_BINDING');const binding=matches[0],active=t.owner==='ChatGPT'&&!retired.has(key);
  return {key,provider:t.owner,owner:t.owner.toUpperCase(),lane:t.executionMode==='EVIDENCE_ONLY'?'research':t.route,nativeId:binding?.nativeId||null,targetThreadId:binding?.targetThreadId||null,nativeScope:binding?.scope||'NOT_ENROLLED',intent:'Follow current registered '+t.procedure,procedure:t.procedure,executionMode:t.executionMode||'REGISTERED_PROCEDURE',actions:[],registered:true,retired:retired.has(key),active,availability:retired.has(key)?'RETIRED':active?'REGISTERED':'DEFERRED'};
 });
 return {schema:'forge.automation-capabilities.v1',source:{repository:'tpruittguitar/forge-coordination',registrySha256:hash(raw),bindingsSha256:hash(bindingRaw),cutoverSha256:hash(cutoverRaw)},canonicalAuthority:'NONE; task registration and native enrollment do not authorize adapter writes',tasks};
}
function generate(registryDirectory,outputDirectory=path.resolve(__dirname,'..'),check=false){
 const data=catalogue(registryDirectory),file=path.join(outputDirectory,'pipeline-alignment.js'),original=fs.readFileSync(file,'utf8'),start='  /* GENERATED AUTOMATION CATALOGUE */',end='  /* END GENERATED AUTOMATION CATALOGUE */',a=original.indexOf(start),b=original.indexOf(end);
 if(a<0||b<a)throw Error('CATALOGUE_TEMPLATE_MARKERS_REQUIRED');
 const next=original.slice(0,a)+start+'\n  var CATALOGUE='+JSON.stringify(data)+';\n'+end+original.slice(b+end.length);
 if(check){if(next!==original||fs.readFileSync(path.join(outputDirectory,'apps-script/PipelineAlignment.gs'),'utf8')!==next)throw Error('GENERATED_AUTOMATION_CATALOGUE_STALE');}
 else{fs.writeFileSync(file,next);fs.writeFileSync(path.join(outputDirectory,'apps-script/PipelineAlignment.gs'),next);}
 return {tasks:data.tasks.length,source:data.source,canonicalWriteActions:0};
}
if(require.main===module){try{if(!process.argv[2])throw Error('Usage: generate-automation-catalogue.cjs <current coordination checkout> [--check]');console.log(JSON.stringify(generate(path.resolve(process.argv[2]),undefined,process.argv.includes('--check'))));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={catalogue,generate};
