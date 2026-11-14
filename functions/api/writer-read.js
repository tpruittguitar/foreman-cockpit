// Read-only same-origin transport. Writer validates the caller's existing key.
// Never accept a destination URL or proxy a GET action with mutation side effects.
const WRITER = 'https://script.google.com/macros/s/AKfycbwShspSkto70NeFWjgTuyIf-W3EDgUmKmoWevE-jZq95pm6SAulrJYHX1HmiPg8tx3i/exec';
const READS = new Set(['ping','writer_status','queue_stats','row_readback','master','state','receipts','rules','runs','canonical_rules','scoring','events','interview_notes','documents','document_text','discovery_requests','request_result','receipt_index','archive','evidence','migration_status','operations','schedules','automation_alignment','held_emails']);
const HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','vary':'x-writer-key','x-content-type-options':'nosniff'};
const fail = (error,status) => Response.json({ok:false,error},{status,headers:HEADERS});
export async function onRequest({request}) {
  if (request.method !== 'GET') return fail('Read-only endpoint',405);
  const incoming = new URL(request.url), action = incoming.searchParams.get('action');
  if (!READS.has(action) || incoming.searchParams.getAll('action').length !== 1) return fail('Unsupported read action',400);
  const key = request.headers.get('x-writer-key');
  if (!key || key.length > 2048) return fail('Writer key required',401);
  const upstream = new URL(WRITER);
  for (const [k,v] of incoming.searchParams) if (!['action','key','writerKey'].includes(k)) upstream.searchParams.append(k,v);
  upstream.searchParams.set('action',action); upstream.searchParams.set('key',key);
  for (let attempt=0;attempt<2;attempt++) {
    try {
      const r = await fetch(upstream,{redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(30000)});
      if (!r.ok) { if (attempt===0 && r.status>=500) { await r.body?.cancel(); continue; } return fail('Writer read HTTP '+r.status,r.status>=500?502:r.status); }
      if (!/application\/json/i.test(r.headers.get('content-type')||'')) { await r.body?.cancel(); if (!attempt) continue; return fail('Writer returned a non-JSON response',502); }
      // Stream large canonical files; parsing/re-encoding here wastes edge CPU.
      return new Response(r.body,{status:200,headers:HEADERS});
    } catch { if (attempt) return fail('Writer read temporarily unavailable after two attempts',503); }
  }
}
