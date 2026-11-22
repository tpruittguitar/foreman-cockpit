// Office /code agents (Tim, Nov 22): ChatGPT Dot runs Codex; Claude runs Claude Code; Grokbot runs Cursor's agent;
// Hermes runs its own agent. Each agent gets its own owner session, conversation and draft branch, derived from the
// reviewed Dot binding so no new hosted configuration is needed.
export const CODING_AGENTS = Object.freeze(['Dot', 'Claude', 'Grok', 'Hermes']);
const swap = (value, name) => /\bdot\b/.test(value) ? value.replace(/\bdot\b/, name) : value + '-' + name;
export function providerBinding(binding, provider) {
  if (!CODING_AGENTS.includes(provider)) throw Error('Unknown coding agent');
  if (provider === 'Dot') return { ...binding, provider: 'Dot' };
  const name = provider.toLowerCase();
  return { ...binding, provider, conversationId: swap(binding.conversationId, name), sessionId: swap(binding.sessionId, name), branch: swap(binding.branch, name) };
}
// /learn is a Hermes-only request: Hermes reads the board history and updates its own skills.
export const isLearn = text => /^\/learn(?:\s|$)/i.test(String(text || '').trim());
