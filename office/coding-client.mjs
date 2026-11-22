export const CODING_SIGN_IN = '/api/agent-coding?signin=1';
const signInResult = (job, status = 'not_connected') => ({ ...job, status, signIn: true, message: 'Check coding sign-in in a new tab; your draft is kept. Then return and press Send (same request ID).' });
// Explicit user action only. No keyword classification, log watching or ALL dispatch.
export const codingText = text => /^\/code(?:\s|$)/i.test(text.trim()) ? text.trim().replace(/^\/code\s*/i, '') : /^\/learn(?:\s|$)/i.test(text.trim()) ? text.trim() : null;
// /learn (Tim, Nov 22): Hermes reads the board history since the last /learn and updates its skills. Same sign-in and worker as /code.
export function createCodingClient(fetcher, uuid = () => crypto.randomUUID()) {
  const conversations = new Map(), pending = new Map(), requestKeys = new Map();
  let generation = 0;
  return {
    clear() { generation++; conversations.clear(); pending.clear(); requestKeys.clear(); },
    async send(provider, text, attachments = []) {
      if (!['Claude', 'Hermes', 'Dot', 'Grok'].includes(provider)) return { status: 'not_connected', message: 'Select one agent; All cannot receive coding requests' };
      if (!text.trim()) return { status: 'not_connected', message: 'Type /code followed by your coding request' };
      if (/^\/learn(?:\s|$)/i.test(text.trim()) && provider !== 'Hermes') return { status: 'not_connected', message: 'Only Hermes can /learn; pick Hermes in To' };
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
// Tim Nov 22: a /code request must stay on the board after a reload or a change of "To". Only the request's ids, text, state and
// summaries are kept (never image data), for one day, in this browser; locking the chat clears them.
export const CODING_STORE = 'office.codingJobs', CODING_KEEP_MS = 24 * 3600 * 1000, CODING_KEEP_MAX = 10;
const KEEP = ['provider', 'conversationId', 'requestId', 'text', 'status', 'approach', 'outcome', 'draftUrl', 'at'];
export const etClock = ms => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)); const v = k => (p.find(x => x.type === k) || {}).value; return v('hour') + ':' + v('minute'); };
export function keepCodingJobs(jobs, now = Date.now()) {
  return [...jobs].filter(j => j && j.requestId && j.conversationId && now - (j.at || 0) < CODING_KEEP_MS).slice(-CODING_KEEP_MAX)
    .map(j => Object.fromEntries(KEEP.filter(k => j[k] !== undefined).map(k => [k, j[k]])));
}
export function restoreCodingJobs(raw, now = Date.now()) {
  try { const list = JSON.parse(raw || '[]'); return Array.isArray(list) ? keepCodingJobs(list.filter(j => j && typeof j.text === 'string' && typeof j.provider === 'string'), now) : []; } catch { return []; }
}
