const encoder=new TextEncoder();
export const b64=bytes=>{let s='';for(const n of bytes)s+=String.fromCharCode(n);return btoa(s);};
export const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export const url64=bytes=>b64(bytes).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export const from64=s=>unb64(s.replace(/-/g,'+').replace(/_/g,'/'));
export const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
export const jobId=j=>digest(JSON.stringify([j.tenant,j.owner,j.provider,j.conversationId,j.requestId]));
export async function seal(kind,payload,key) {
 const body=url64(encoder.encode(JSON.stringify({version:1,kind,payload})));
 return {body,signature:url64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(body))))};
}
export async function open(envelope,kind,key) {
 if(!envelope || typeof envelope.body!=='string' || envelope.body.length>24000 || typeof envelope.signature!=='string' || !await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,from64(envelope.signature),encoder.encode(envelope.body)))throw Error('Invalid signed relay record');
 const value=JSON.parse(new TextDecoder().decode(from64(envelope.body)));
 if(value.version!==1 || value.kind!==kind)throw Error('Wrong relay record type');return value.payload;
}
export function checkJob(value,config,now,allowExpired=false) {
 const j=value?.job;
 for(const k of ['tenant','owner','provider','conversationId','sessionId','repository','base','branch'])if(typeof config.binding?.[k]!=='string'||!config.binding[k])throw Error('Incomplete fixed owner scope');
 if(!config.workerId)throw Error('Missing designated worker');
 if(!j || value.workerId!==config.workerId || !Number.isSafeInteger(value.createdAt)||!Number.isSafeInteger(value.expiresAt)||value.createdAt>now+30||(!allowExpired&&value.expiresAt<=now)||value.expiresAt-value.createdAt>900)throw Error('Expired or wrong worker');
 for(const [k,v]of Object.entries(config.binding))if(j[k]!==v)throw Error('Wrong owner or workspace binding');
 if(j.provider!=='Dot'||!/^[\w-]{16,80}$/.test(j.requestId)||typeof j.text!=='string'||!j.text.trim()||j.text.length>2000||!Array.isArray(j.attachments||[])||(j.attachments||[]).length>4)throw Error('Invalid coding job');
 return j;
}
// A signed Access assertion is accepted only for one configured issuer/audience/subject.
// Email headers, the ordinary chat token and unverified JWT payloads are never identity.
export function accessAuthenticator({issuer,audience,subject,email,principal,fetcher=fetch,now=()=>Math.floor(Date.now()/1000)}) {
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!audience||(!subject&&!email)||(email&&!/^[^@\s]+@[^@\s]+$/.test(email)))throw Error('Configure verified Access identity');
 let cached,until=0;
 return async request=>{
  try {
   const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token||token.length>16000)return null;
   const parts=token.split('.');if(parts.length!==3)return null;
   const header=JSON.parse(new TextDecoder().decode(from64(parts[0]))),claims=JSON.parse(new TextDecoder().decode(from64(parts[1]))),t=now();
   if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==issuer||(subject&&claims.sub!==subject)||(email&&(typeof claims.email!=='string'||claims.email.toLowerCase()!==email.toLowerCase()))||claims.type!=='app'||!Array.isArray(claims.aud)||!claims.aud.includes(audience)||!Number.isSafeInteger(claims.exp)||claims.exp<=t||!Number.isSafeInteger(claims.iat)||claims.iat>t+30||claims.exp-claims.iat>86400||(claims.nbf!==undefined&&claims.nbf>t))return null;
   if(!cached||until<=t){const r=await fetcher(issuer+'/cdn-cgi/access/certs',{redirect:'error'});if(!r.ok)return null;cached=(await r.json()).keys;until=t+300;}
   const jwk=cached?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig'));if(!jwk)return null;
   const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
   if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,from64(parts[2]),encoder.encode(parts[0]+'.'+parts[1])))return null;
   return structuredClone(principal);
  } catch{return null;}
 };
}
