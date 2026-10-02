import {getStore} from '@netlify/blobs';
import core from '../lib/manual-intake.cjs';
import parser from '../../pipeline-parser.js';
const WRITER='https://script.google.com/macros/s/AKfycbwShspSkto70NeFWjgTuyIf-W3EDgUmKmoWevE-jZq95pm6SAulrJYHX1HmiPg8tx3i/exec';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function readWriter(action,key){let last;for(let n=0;n<3;n++){try{const r=await fetch(WRITER+'?action='+action+'&key='+encodeURIComponent(key),{signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error('Writer read unavailable');const j=await r.json();return j}catch(e){last=e}}throw last}
export default async function(req){try{
 const url=new URL(req.url);let body={};if(req.method==='POST'){if(+(req.headers.get('content-length')||0)>25000)return response({ok:false,error:'Request too large'},413);const raw=await req.text();if(raw.length>25000)return response({ok:false,error:'Request too large'},413);body=JSON.parse(raw)}else if(req.method!=='GET')return response({ok:false,error:'Use GET or POST'},405);
 const key=req.headers.get('x-writer-key')||body.key||url.searchParams.get('key');if(!key)return response({ok:false,error:'Writer setup is required before saving manual intake'},401);
 const auth=await readWriter('ping',key);if(!auth.ok)return response({ok:false,error:'Writer key was not accepted'},401);
 const store=getStore({name:'manual-job-intake-v1',consistency:'strong'}),service=core.createService({store,readMaster:async()=>{const m=await readWriter('master',key);if(!m.ok)throw new Error('Master readback unavailable');return parser.parse(m.text)}});
 const action=body.action||url.searchParams.get('action')||'list';if(req.method==='GET'&&!['list','get'].includes(action))return response({ok:false,error:'State changes require POST'},405);
 if(action==='get')body.id=body.id||url.searchParams.get('id');return response(await service(action,body));
 }catch(e){return response({ok:false,error:String(e.message||e)},400)}};
export const config={path:'/api/manual-intake'};
