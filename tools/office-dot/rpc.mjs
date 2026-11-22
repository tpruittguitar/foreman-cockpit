import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';

export const CODEX_VERSION = '0.169.0';
export class CodexRPC extends EventEmitter {
  constructor(child, timeout = 30000) {
    super(); this.child = child; this.pending = new Map(); this.sequence = 0; this.timeout = timeout;
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => { try { this.receive(JSON.parse(line)); } catch { this.emit('protocolError'); } });
    child.stdin.on('error',()=>this.emit('disconnected')); child.on('error',()=>this.emit('disconnected'));
    child.stderr?.resume(); // Never publish stderr, config, credentials or transcript.
    child.on('exit', () => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(Error('Codex disconnected; reconcile before retry')); } this.pending.clear(); this.emit('disconnected'); });
  }
  send(message) { this.child.stdin.write(JSON.stringify(message) + '\n'); }
  receive(message) {
    if (message.method) return this.emit(message.id !== undefined ? 'approval' : 'notification', message);
    const pending = this.pending.get(message.id); if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(message.id);
    if (message.error) pending.reject(Error('Codex RPC rejected: ' + message.error.code)); else pending.resolve(message.result);
  }
  request(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error('Codex response unknown')); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer }); this.send({ id, method, params });
    });
  }
  async initialize() {
    await this.request('initialize', { clientInfo: { name: 'office_dot_local', version: '0.1.0' }, capabilities: { explicitGatewayOauth: true } });
    this.send({ method: 'initialized', params: {} });
  }
  async includedAccount() {
    const a = await this.request('account/read', { refreshToken: false });
    const usage = await this.request('account/rateLimits/read');
    const credits = usage.rateLimits?.credits;
    if (a.account?.type !== 'chatgpt' || !a.userId || !usage.accountId || usage.ordinaryUsageAllowed !== true || credits?.hasCredits !== false || credits?.unlimited !== false) throw Error('Included ChatGPT subscription usage must be verified; API keys and credits are not accepted');
    return { userId: a.userId, accountId: usage.accountId, plan: a.account.planType };
  }
  close() {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(this.child.pid), '/T', '/F'], { stdio: 'ignore' });
    else this.child.kill();
  }
}
export function launchCodex(command = 'codex', workspace = process.cwd()) {
  // Executable is selected locally by the owner, never by a browser request.
  const windows = process.platform === 'win32';
  const binary = windows ? 'cmd.exe' : command;
  const prefix = windows ? ['/d', '/c', command] : [];
  const version = execFileSync(binary, [...prefix, '--version'], { cwd: workspace, encoding: 'utf8', windowsHide: true });
  if (!version.trim().endsWith(' ' + CODEX_VERSION)) throw Error('This adapter requires installed Codex ' + CODEX_VERSION);
  const safeEnvironment = new Set(['PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','SYSTEMROOT','COMSPEC','PATHEXT','WINDIR','SYSTEMDRIVE','HOMEDRIVE','HOMEPATH','USERNAME','USER','LOGNAME','LANG','LC_ALL','TERM']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => safeEnvironment.has(k.toUpperCase())));
  return new CodexRPC(spawn(binary, [...prefix, 'app-server', '--stdio'], { cwd: workspace, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }));
}
