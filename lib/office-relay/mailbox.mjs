import {b64,unb64} from './crypto.mjs';
export const REPO='tpruittguitar/office-mailbox',PREFIX='coding-v1/';
const api='/repos/'+REPO;
// request is a trusted server-side GitHub client. No caller-selected URLs/repos.
export class CodingMailbox {
 constructor(request){this.request=request;}
 async verifyPrivate(){const r=await this.request({method:'GET',path:api});if(!r.ok)throw Error('Mailbox unavailable');const j=await r.json();if(j.private!==true||j.full_name!==REPO||j.default_branch!=='main')throw Error('Private mailbox binding changed');}
 path(name){if(!/^(jobs|ready|claims|status|rejected|images)\/[a-f0-9]{64}(?:\/[a-f0-9]{64})?\.json$/.test(name))throw Error('Invalid coding-only path');return api+'/contents/'+PREFIX+name;}
 async get(name,raw=false){const r=await this.request({method:'GET',path:this.path(name)+'?ref=main',accept:raw?'application/vnd.github.raw+json':undefined});if(r.status===404)return null;if(!r.ok)throw Error('Mailbox read failed');const j=await r.json();if(raw)return {value:j};if(j.type!=='file'||typeof j.sha!=='string'||j.encoding!=='base64')throw Error('Invalid mailbox file');return {sha:j.sha,value:JSON.parse(new TextDecoder().decode(unb64(j.content.replace(/\s/g,''))))};}
 async put(name,value,sha){const content=b64(new TextEncoder().encode(JSON.stringify(value)));const r=await this.request({method:'PUT',path:this.path(name),body:{branch:'main',message:'private coding relay',content,...(sha?{sha}:{})}});if([409,422].includes(r.status))return false;if(!r.ok)throw Error('Mailbox write uncertain; reconcile without execution retry');return true;}
 async listReady(){const r=await this.request({method:'GET',path:api+'/contents/'+PREFIX+'ready?ref=main'});if(r.status===404)return [];if(!r.ok)throw Error('Mailbox unavailable');const rows=await r.json();if(!Array.isArray(rows)||rows.length>=1000)throw Error('Reconcile mailbox backlog before polling');return rows.filter(x=>x.type==='file'&&/^[a-f0-9]{64}\.json$/.test(x.name)).map(x=>x.name.slice(0,-5));}
}
export function githubRequest(token,fetcher=fetch){if(!token)throw Error('Existing private mailbox credential required');return ({method,path,accept,body})=>fetcher('https://api.github.com'+path,{method,redirect:'error',headers:{Authorization:'Bearer '+token,Accept:accept||'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'office-coding-relay'},...(body?{body:JSON.stringify(body)}:{})});}
