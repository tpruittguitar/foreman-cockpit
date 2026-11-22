import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
export class PrivateStore {
  constructor(directory) {
    mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
    this.db = new DatabaseSync(path.join(directory, 'office-dot.sqlite'));
    chmodSync(path.join(directory, 'office-dot.sqlite'), 0o600);
    this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records (space TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(space,key))');
    // A prior process may have sent a native turn. Never replay it after a restart.
    for (const row of this.db.prepare("SELECT key,value FROM records WHERE space='native'").all()) {
      const j = JSON.parse(row.value); if (['queued','running','awaiting_approval'].includes(j.status)) this.set('native', row.key, { ...j, status: 'unknown' });
    }
  }
  read(space, key) { const r = this.db.prepare('SELECT value FROM records WHERE space=? AND key=?').get(space, key); return r ? JSON.parse(r.value) : null; }
  set(space, key, value) { this.db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(space,key) DO UPDATE SET value=excluded.value').run(space,key,JSON.stringify(value)); }
  async claim(key, job) {
    const inserted = this.db.prepare("INSERT OR IGNORE INTO records VALUES('http',?,?)").run(key, JSON.stringify(job));
    return inserted.changes ? { created: true } : { created: false, job: this.read('http',key) };
  }
  async get(key) { return this.read('http',key); }
  async update(key, change) { const old=this.read('http',key); if (!old) throw Error('Unknown request'); if (['completed','failed'].includes(old.status)) return; this.set('http',key,{...old,...change}); }
  hasUncertain() { return this.db.prepare("SELECT value FROM records WHERE space IN ('native','publication')").all().some(r=>JSON.parse(r.value).status==='unknown'||JSON.parse(r.value).status==='publishing'); }
  close() { this.db.close(); }
}
