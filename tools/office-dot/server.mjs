import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { createCodingService } from '../../lib/office-coding.mjs';

const token=()=>randomBytes(32).toString('hex');
const same=(a,b)=>typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
// Loopback only. The OS owner starts it and opens a single-use local launch link.
// No additional provider account/login, hosted connector exposure, or mailbox relay.
export async function startLocalServer({root,adapter,store,identity,scope,port=0}) {
  root=realpathSync(root);let bootstrap=token();const cookie=token(),expires=Date.now()+60*60*1000;
  let origin,service;
  const server=http.createServer(async(req,res)=>{
    const reject=(status,error)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error,status:'not_connected'}));};
    if(req.headers.host!==new URL(origin).host)return reject(403,'Invalid host');
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    const u=new URL(req.url,origin),cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
    const signed=Date.now()<expires&&same(cookies.office_dot,cookie);
    if(u.pathname==='/start'){
      if(req.method!=='GET'||!bootstrap||!same(u.searchParams.get('once'),bootstrap)||!['none','same-origin',undefined].includes(req.headers['sec-fetch-site'])||req.headers.origin&&req.headers.origin!==origin)return reject(403,'Local launch link required');
      bootstrap=null;res.writeHead(303,{'Set-Cookie':'office_dot='+cookie+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600','Location':'/office'});res.end();return;
    }
    if(!signed)return reject(401,'Open the launch link from the local owner terminal');
    if(req.headers.origin&&req.headers.origin!==origin)return reject(403,'Origin mismatch');
    if(req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))return reject(403,'Cross-site request rejected');
    try{
      if(u.pathname==='/api/agent-coding'){
        const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>12000)return reject(413,'Too large');chunks.push(c);}
        const request=new Request(origin+req.url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined});
        const response=await service(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
      }
      if(u.pathname==='/api/agent-chat'){
        if(req.method!=='GET')return reject(503,'Local pilot does not send ordinary chat or shared-log messages');
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,lines:[],queued:0}));return;
      }
      if(req.method!=='GET'||u.pathname.startsWith('/api/'))return reject(404,'Not available in local pilot');
      const filename=['/','/office','/office.html'].includes(u.pathname)?'office.html':decodeURIComponent(u.pathname).slice(1);
      if(!/^(office\.html|pipeline-control-room\.js|pipeline-ai-usage\.js|build-info\.json|office\/[\w./-]+|fonts\/[\w./-]+)$/.test(filename)||filename.split('/').includes('..'))return reject(404,'Not found');
      const file=realpathSync(path.join(root,filename));if(!file.startsWith(root+path.sep)||!statSync(file).isFile())return reject(404,'Not found');
      const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.glb':'model/gltf-binary','.woff2':'font/woff2'}[path.extname(file)];if(!mime)return reject(404,'Not found');
      let bytes=readFileSync(file);
      if(filename==='office.html'){
        // Nonprivileged UI marker: the HttpOnly cookie is the actual local authority.
        const init=`<script>localStorage.setItem('office.agentChatToken',JSON.stringify({token:'local-display-only',exp:${expires}}));</script>`;
        bytes=Buffer.from(bytes.toString().replace('<head>','<head>'+init));
      }
      res.setHeader('Content-Type',mime);res.end(bytes);
    }catch{return reject(503,'Local service unavailable');}
  });
  await new Promise(r=>server.listen(port,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  const principal={...identity,role:'owner',sessions:{Dot:{[scope.conversationId]:scope}}};
  service=createCodingService({origin,authenticate:async()=>principal,adapters:{Dot:adapter},store});
  return {origin,launchUrl:origin+'/start?once='+bootstrap,close:()=>new Promise(r=>server.close(r))};
}
export const ownerIdentity=(userId,accountId)=>({userId,accountId,owner:createHash('sha256').update(userId).digest('hex'),tenant:createHash('sha256').update(accountId).digest('hex')});
