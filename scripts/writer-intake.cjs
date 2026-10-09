#!/usr/bin/env node
/* Supported Writer HTTP path for environments that can execute an authorized endpoint.
 * Usage: node scripts/writer-intake.cjs connection.json candidate-request.json checkpoint-directory
 * Request: {requestId, body:{action:'intake',run:{SCOUT_RUN_ID},records:[...]}, source:{initiatingUrl,...}}
 * Source retains Gmail ids/body/card evidence. Checkpoints must survive task restarts.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Transport=require('../pipeline-writer-transport'),Parser=require('../pipeline-parser'),rowHash=require('../apps-script/Code.gs').textHash_;
async function main(args){
  if(args.length!==3)throw new Error('Usage: writer-intake.cjs connection.json candidate-request.json checkpoint-directory');
  const config=JSON.parse(fs.readFileSync(args[0],'utf8')),request=JSON.parse(fs.readFileSync(args[1],'utf8'));
  const endpoint=new URL(config.url);
  if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname))throw new Error('SUPPORTED_WRITER_ENDPOINT_REQUIRED');
  if(!config.key||request.body.action!=='intake'||!request.body.run||request.body.run.SCOUT_RUN_ID!==request.requestId)throw new Error('INTAKE_ID_MUST_EQUAL_SCOUT_RUN_ID');
  fs.mkdirSync(args[2],{recursive:true});
  const checkpoint=path.join(args[2],crypto.createHash('sha256').update(request.requestId).digest('hex')+'.json');
  const adapter={
    load:async()=>fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null,
    persist:async item=>{const temporary=checkpoint+'.tmp';fs.writeFileSync(temporary,JSON.stringify(item,null,2)+'\n',{mode:0o600});const fd=fs.openSync(temporary,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temporary,checkpoint);},
    post:async body=>json(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({...body,key:config.key})}),
    result:async id=>get('request_result',{requestId:id}),
    master:async()=>{const j=await get('master');if(!j.ok||typeof j.text!=='string')throw new Error('FRESH_MASTER_UNAVAILABLE');return Parser.parse(j.text).rows;},
    verify:async(item,rows,result)=>{
      const intents=result.entry&&result.entry.items;
      if(!Array.isArray(intents)||!intents.length)return {matches:false,reason:'Exact intended row hashes unavailable on this Writer version'};
      const comparisons=intents.map(intent=>{const found=rows.filter(r=>r.PRIMARY_ID===intent.pid);const actual=found.length===1?rowHash(found[0].raw):'';return {primaryId:intent.pid,expected:intent.a,actual,matches:actual===intent.a&&found.length===1};});
      return {matches:comparisons.every(x=>x.matches),rows:comparisons,observedAt:new Date().toISOString()};
    }
  };
  async function json(url,options){const response=await fetch(url,{...options,redirect:'follow',signal:AbortSignal.timeout(45000)});if(!response.ok)throw new Error('Writer HTTP '+response.status);return response.json();}
  function get(action,params){const url=new URL(endpoint);url.searchParams.set('key',config.key);url.searchParams.set('action',action);Object.entries(params||{}).forEach(([key,value])=>url.searchParams.set(key,value));return json(url);}
  const result=await Transport.create(adapter).submit(request.requestId,request.body,request.source);
  console.log(JSON.stringify({requestId:result.requestId,state:result.state,checkpoint,error:result.error||'',proof:result.proof||null}));
  if(result.state!=='VERIFIED_COMPLETE')process.exitCode=2;
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
