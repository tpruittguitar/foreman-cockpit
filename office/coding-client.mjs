// Explicit user action only. No keyword classification, log watching or ALL dispatch.
export const codingText = text => /^\/code(?:\s|$)/i.test(text.trim()) ? text.trim().replace(/^\/code\s*/i, '') : null;
export function createCodingClient(fetcher, uuid = () => crypto.randomUUID()) {
  const conversations = new Map(), pending = new Map();
  let generation = 0;
  return {
    clear() { generation++; conversations.clear(); pending.clear(); },
    async send(provider, text) {
      if (!['Claude', 'Hermes', 'Dot', 'Grok'].includes(provider)) return { status: 'not_connected', message: 'Select one agent; All cannot receive coding requests' };
      if (!text.trim()) return { status: 'not_connected', message: 'Type /code followed by your coding request' };
      const startGeneration = generation;
      if (!conversations.has(provider)) {
        try {
          const r = await fetcher('/api/agent-coding', { credentials: 'same-origin', cache: 'no-store' });
          const j = await r.json();
          if (startGeneration !== generation) return null;
          const capability = r.ok && j.providers?.find(p => p.provider === provider && p.connected === true);
          if (!capability || !/^[a-zA-Z0-9_-]{16,80}$/.test(capability.conversationId)) return { provider, text, status: 'not_connected', message: 'Not connected — owner coding session unavailable' };
          conversations.set(provider, capability.conversationId);
        } catch { return { provider, text, status: 'not_connected', message: 'Not connected — could not verify owner coding session' }; }
      }
      const key = JSON.stringify([provider, text]);
      if (!pending.has(key)) pending.set(key, uuid());
      const body = { provider, conversationId: conversations.get(provider), requestId: pending.get(key), intent: 'owner_coding_request', text };
      const g = generation;
      try {
        const r = await fetcher('/api/agent-coding', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        if (g !== generation) return null;
        if (r.status === 401 || r.status === 503 && j.status === 'not_connected') return { ...body, status: 'not_connected', message: 'Not connected — owner coding session unavailable' };
        if (!r.ok) return { ...body, status: 'unknown', message: 'Coding request not accepted; keep this request ID' };
        if (j.provider !== provider || j.requestId !== body.requestId || j.conversationId !== body.conversationId) throw Error('mismatch');
        return { ...body, ...j };
      } catch { return g === generation ? { ...body, status: 'unknown', message: 'Coding status unknown; retry keeps the same request ID' } : null; }
    },
    async status(job) {
      const g = generation;
      try {
        const q = new URLSearchParams({ provider: job.provider, conversationId: job.conversationId, requestId: job.requestId });
        const r = await fetcher('/api/agent-coding?' + q, { credentials: 'same-origin', cache: 'no-store' });
        const j = await r.json();
        if (g !== generation || !r.ok || j.provider !== job.provider || j.conversationId !== job.conversationId || j.requestId !== job.requestId) return null;
        if (['completed', 'failed'].includes(j.status)) pending.delete(JSON.stringify([job.provider, job.text]));
        return j;
      } catch { return null; }
    }
  };
}
