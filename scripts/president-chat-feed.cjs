#!/usr/bin/env node
/* Tim-President chat feed publisher (box side).
   Reads the box's Tim <-> President transcript (JSONL), redacts secrets, keeps the last N turns and writes
   <forge-coordination checkout>/control/PRESIDENT_CHAT_FEED.jsonl, one {at, from: 'Tim'|'President', text} per line.
   The office page (office/office-logic.js parseChatFeed) reads that file; until it exists the page treats the 404 as empty.

   usage: node scripts/president-chat-feed.cjs --source <transcript.jsonl> --repo <forge-coordination checkout> [--max 12] [--push] [--dry-run]
   env:   PRESIDENT_CHAT_SOURCE, FORGE_COORDINATION_DIR (flag defaults)
   Source lines are tolerant: time = at|timestamp|time|ts, speaker = from|role|speaker|author (user/tim -> Tim; assistant/president -> President),
   text = text|content|message (string, or an array of {text} parts). Unknown speakers and empty text are skipped.
   Exit 0 with no write when the source does not exist yet. Only rewrites (and pushes) when the redacted feed changed. */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const FEED_REL = path.join('control', 'PRESIDENT_CHAT_FEED.jsonl');
const REDACTIONS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[secret]'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[token]'],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/g, '[key]'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[key]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[token]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[token]'], // JWT
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{12,}/gi, '$1 [token]'],
  [/\b([A-Za-z0-9_.-]*(?:api[_-]?key|secret|token|passw(?:or)?d|passphrase|credential|auth)[A-Za-z0-9_.-]*)(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1$2[secret]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/(?:\+?\d[\s().-]{0,2}){7,}\d/g, '[phone]'],
  [/\b[A-Fa-f0-9]{32,}\b/g, '[token]'],
  [/[A-Za-z0-9_+\/=-]{24,}/g, '[token]'] // any other long opaque run
];
function redact(t) { let s = String(t == null ? '' : t); for (const [re, to] of REDACTIONS) s = s.replace(re, to); return s; }

const speaker = v => { const s = String(v || '').toLowerCase(); return ['user', 'tim', 'human'].includes(s) ? 'Tim' : ['assistant', 'president', 'agent'].includes(s) ? 'President' : null; };
function textOf(v) { if (typeof v === 'string') return v; if (Array.isArray(v)) return v.map(p => (typeof p === 'string' ? p : p && typeof p.text === 'string' ? p.text : '')).join(' '); return ''; }
function iso(v) { const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d+Z$/, 'Z'); }

/* transcript text -> redacted feed text (last `max` turns, oldest first, trailing newline; '' when nothing usable) */
function buildFeed(text, max = 12) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue; let r; try { r = JSON.parse(line); } catch (e) { continue; }
    if (!r || typeof r !== 'object') continue;
    const from = speaker(r.from || r.role || r.speaker || r.author), at = iso(r.at || r.timestamp || r.time || r.ts), body = redact(textOf(r.text != null ? r.text : r.content != null ? r.content : r.message).replace(/\s+/g, ' ').trim()).slice(0, 400);
    if (from && at && body) rows.push({ at, from, text: body });
  }
  rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const out = rows.slice(-max).map(r => JSON.stringify(r));
  return out.length ? out.join('\n') + '\n' : '';
}

function parseArgs(argv, env = process.env) {
  const o = { source: env.PRESIDENT_CHAT_SOURCE || '', repo: env.FORGE_COORDINATION_DIR || '', max: 12, push: false, dry: false };
  for (let i = 0; i < argv.length; i++) { const a = argv[i];
    if (a === '--source') o.source = argv[++i]; else if (a === '--repo') o.repo = argv[++i]; else if (a === '--max') o.max = Math.max(1, parseInt(argv[++i], 10) || 12);
    else if (a === '--push') o.push = true; else if (a === '--dry-run') o.dry = true; else throw new Error('unknown argument ' + a); }
  return o;
}

function main(argv) {
  const o = parseArgs(argv);
  if (!o.source || !o.repo) { console.error('usage: president-chat-feed.cjs --source <transcript.jsonl> --repo <forge-coordination checkout> [--max N] [--push] [--dry-run]'); return 2; }
  if (!fs.existsSync(o.source)) { console.log('no transcript yet: ' + o.source); return 0; }
  const feed = buildFeed(fs.readFileSync(o.source, 'utf8'), o.max);
  if (!feed) { console.log('transcript has no usable turns; nothing published'); return 0; }
  const dest = path.join(o.repo, FEED_REL);
  if (o.dry) { process.stdout.write(feed); return 0; }
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') === feed) { console.log('feed unchanged'); return 0; }
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, feed);
  console.log('wrote ' + dest);
  if (o.push) {
    const git = (...a) => cp.execFileSync('git', ['-C', o.repo, ...a], { stdio: 'inherit' });
    git('add', FEED_REL); git('commit', '-m', 'control: update PRESIDENT_CHAT_FEED.jsonl'); git('pull', '--rebase', '--autostash'); git('push');
  }
  return 0;
}

if (require.main === module) { try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(e.message); process.exit(1); } }
module.exports = { redact, buildFeed, parseArgs, FEED_REL };
