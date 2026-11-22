import { createCodingService } from '../../lib/office-coding.mjs';
import { configuredHostedCoding } from '../../lib/office-relay/configured.mjs';
// Disabled unless an operator supplies the reviewed owner assertion, fixed scope,
// private signing key and pinned worker key. Chat unlock never authorizes coding.
const handle = createCodingService();
async function route({request,env}) {
  const signIn=request.method==='GET' && new URL(request.url).search==='?signin=1';
  const unavailable=()=>new Response('Office coding is not enabled or configured yet. Return to your original Office tab; your draft stays there. Nothing was submitted.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  if(env?.OFFICE_CODING_RELAY_ENABLED!=='reviewed-v1')return signIn?unavailable():handle(request);
  try { return await (await configuredHostedCoding(env))(request); }
  catch { if(signIn)return unavailable();return Response.json({status:'not_connected',error:'Owner coding relay is not configured'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
export const onRequestGet = route;
export const onRequestPost = route;
