#!/usr/bin/env node
// Reads name + description from each <skills dir>/<slug>/SKILL.md frontmatter and writes office/skills.json:
//   [{slug, title, bullets:[3 short plain-English lines]}]
// Usage: node tools/sync-office-skills.mjs [skillsDir] [outFile]
// Only name/description are read; nothing else from the files is copied.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] || '/home/box/agent-data/workflows';
const out = process.argv[3] || path.join(root, 'office', 'skills.json');
const MAX = 32;

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text); if (!m) return null;
  const f = {}; let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) { key = kv[1]; f[key] = /^[>|][-+]?$/.test(kv[2].trim()) ? '' : kv[2].trim(); }
    else if (key && /^\s+\S/.test(line)) f[key] = (f[key] + ' ' + line.trim()).trim();
  }
  return f;
}
const clean = s => String(s || '').replace(/[`*_"“”]/g, '').replace(/\s+/g, ' ').trim();
function clip(s) { s = s.replace(/[.,;:]+$/, ''); if (s.length <= MAX) return s; const cut = s.slice(0, MAX + 1).replace(/\s+\S*$/, ''); return (cut || s.slice(0, MAX)).replace(/[\s,;:(]+$/, ''); }
// Hand-tightened plain-English bullets (each distilled from that skill's description) for skills we know.
// Any skill not listed here gets bullets word-wrapped straight from its description.
const CURATED = {
  'claude-code-on-the-box': ['Run big tasks in Claude Code', 'Uses the Claude subscription', 'Installs / signs in if needed'],
  'forge-working-style': ['Read before any Forge work', "Tim's design + approval rules", 'Follow his reporting style'],
  'free-research': ['Source-backed facts from the web', 'Free Groq / OpenRouter models', 'Saves Grok Bot usage'],
  'keep-live-work-terminal-open': ['Keep a live terminal open', 'Maximized while work runs', 'Close only when truly idle'],
  'message-chatgpt-dot': ['Send a link, file or question', "To Tim's ChatGPT dot agent", 'Or open the dot page'],
  'run-codex-cli-with-chatgpt-login': ['Hand big code tasks to Codex', "Billed to Tim's ChatGPT plan", 'Installs / re-signs-in if needed']
};
function wrap(desc) {
  const words = clean(desc).replace(/^use (this )?(when|before|if)\s+/i, '').split(' '), lines = [''];
  for (const w of words) { const cur = lines[lines.length - 1]; if ((cur + ' ' + w).trim().length <= MAX) lines[lines.length - 1] = (cur + ' ' + w).trim(); else if (lines.length < 3) lines.push(w.slice(0, MAX)); else { lines[2] = lines[2].replace(/[\s,;:.]+$/, '').slice(0, MAX - 1) + '…'; break; } }
  while (lines.length < 3) lines.push('');
  return lines.map(l => l.charAt(0).toUpperCase() + l.slice(1));
}
export function bulletsFrom(desc, slug) { const c = CURATED[slug]; return c && c.every(b => b.length <= MAX) ? c.slice() : wrap(desc); }
// Names too long for the whiteboard get a short form.
const SHORT_TITLE = { 'run-codex-cli-with-chatgpt-login': 'Run Codex CLI', 'keep-live-work-terminal-open': 'Keep live terminal open' };
export function titleOf(name, slug) { if (SHORT_TITLE[slug]) return SHORT_TITLE[slug]; let t = clean(name) || slug; if (/^[a-z0-9-]+$/.test(t)) t = t.replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); }

export function build(skillsDir) {
  const res = [];
  for (const slug of fs.readdirSync(skillsDir).sort()) {
    const f = path.join(skillsDir, slug, 'SKILL.md');
    if (!fs.existsSync(f)) continue;
    const fm = frontmatter(fs.readFileSync(f, 'utf8'));
    if (!fm || !fm.description) continue;
    res.push({ slug, title: titleOf(fm.name, slug), bullets: bulletsFrom(fm.description, slug) });
  }
  return res;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const skills = build(dir);
  fs.writeFileSync(out, JSON.stringify(skills, null, 2) + '\n');
  console.log(`wrote ${skills.length} skills to ${out}`);
}
