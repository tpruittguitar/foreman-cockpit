export const CODING_SIGN_IN = '/api/agent-coding?signin=1';
const signInResult = (job, status = 'not_connected') => ({ ...job, status, signIn: true, message: 'Check coding sign-in in a new tab; your draft is kept. Then return and press Send (same request ID).' });
// Explicit user action only. No keyword classification, log watching or ALL dispatch.
export const codingText = text => /^\/code(?:\s|$)/i.test(text.trim()) ? text.trim().replace(/^\/code\s*/i, '') : null;
export function createCodingClient(fetcher, uuid = () => crypto.randomUUID()) {
  const conversations = new Map(), pending = new Map(), requestKeys = new Map();
  let generation = 0;
  return {
    clear() { generation++; conversations.clear(); pending.clear(); requestKeys.clear(); },
    async send(provider, text, attachments = []) {
      if (!['Claude', 'Hermes', 'Dot', 'Grok'].includes(provider)) return { status: 'not_connected', message: 'Select one agent; All cannot receive coding requests' };
      if (!text.trim()) return { status: 'not_connected', message: 'Type /code followed by your coding request' };
      if (attachments.some(f=>!f.data)) return {status:'rejected',message:'Image is still loading; try Send again when ready'};
      if (attachments.some(f=>!['image/png','image/jpeg'].includes(f.type))) return {status:'rejected',message:'Coding accepts PNG or JPEG images; remove unsupported files'};
      const startGeneration = generation;
      if (!conversations.has(provider)) {
        try {
          const r = await fetcher('/api/agent-coding', { credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
          const j = await r.json();
          if (startGeneration !== generation) return null;
          if (r.status === 401 && j.signIn) return signInResult({provider,text});
          const capability = r.ok && j.providers?.find(p => p.provider === provider && p.connected === true);
          if (!capability || !/^[a-zA-Z0-9_-]{16,80}$/.test(capability.conversationId)) return { provider, text, status: 'not_connected', message: 'Not connected — owner coding session unavailable' };
          conversations.set(provider, capability.conversationId);
        } catch { return startGeneration === generation ? signInResult({provider,text}) : null; }
      }
      const key = JSON.stringify([provider, text, attachments]);
      if (!pending.has(key)) pending.set(key, uuid());
      requestKeys.set(pending.get(key),key);
      const body = { provider, conversationId: conversations.get(provider), requestId: pending.get(key), intent: 'owner_coding_request', text, ...(attachments.length?{attachments}: {}) };
      const g = generation;
      try {
        const r = await fetcher('/api/agent-coding', { method: 'POST', redirect: 'error', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        if (g !== generation) return null;
        if (r.status === 401 && j.signIn) return signInResult(body);
        if (r.status === 401 || r.status === 503 && j.status === 'not_connected') return { ...body, status: 'not_connected', message: j.error || 'Not connected — owner coding session unavailable' };
        if (j.status==='rejected' || [400,413,415].includes(r.status)) { pending.delete(key); return {...body,status:'rejected',message:j.error||'Image request rejected; your draft and images are preserved'}; }
        if (!r.ok) return { ...body, status: 'unknown', message: 'Coding request not accepted; keep this request ID' };
        if (j.provider !== provider || j.requestId !== body.requestId || j.conversationId !== body.conversationId) throw Error('mismatch');
        return { ...body, ...j, signIn: false };
      } catch { return g === generation ? signInResult(body, 'unknown') : null; }
    },
    async status(job) {
      const g = generation;
      try {
        const q = new URLSearchParams({ provider: job.provider, conversationId: job.conversationId, requestId: job.requestId });
        const r = await fetcher('/api/agent-coding?' + q, { credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
        const j = await r.json();
        if(g===generation && r.status===401 && j.signIn)return {...job,signIn:true,message:'Coding status needs sign-in; open the sign-in tab, then return. Do not resend as a new request.'};
        if (g !== generation || !r.ok || j.provider !== job.provider || j.conversationId !== job.conversationId || j.requestId !== job.requestId) return null;
        if (['completed', 'finished', 'awaiting_review', 'failed'].includes(j.status)) pending.delete(requestKeys.get(job.requestId));
        return {...j,signIn:false,message:undefined};
      } catch { return g===generation?{...job,signIn:true,message:'Coding status unavailable; check sign-in in a new tab. Do not resend as a new request.'}:null; }
    }
  };
}
