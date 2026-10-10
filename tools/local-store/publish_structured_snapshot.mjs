#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const file = process.argv[2] || 'data/structured_snapshot.json';
const endpoint = process.env.STRUCTURED_ENDPOINT || 'https://foreman-cockpit.netlify.app/api/structured/admin/snapshot';
const writerKey = process.env.WRITER_KEY || process.env.PIPELINE_WRITER_KEY || process.env.STRUCTURED_WRITER_KEY || '';
const structuredToken = process.env.STRUCTURED_READ_TOKEN || process.env.PIPELINE_STRUCTURED_TOKEN || '';

const raw = await readFile(file, 'utf8');
const parsed = JSON.parse(raw);
if (!parsed || parsed.ok !== true || !Array.isArray(parsed.jobs) || !parsed.counts) {
  throw new Error('Snapshot must be a structured snapshot with ok=true, counts, and jobs[]');
}

const headers = { 'Content-Type': 'application/json' };
if (writerKey) headers['x-writer-key'] = writerKey;
else if (structuredToken) headers.Authorization = `Bearer ${structuredToken}`;
else throw new Error('Set WRITER_KEY or STRUCTURED_READ_TOKEN in the local shell; do not commit it.');

const res = await fetch(endpoint, { method: 'POST', headers, body: raw });
const bodyText = await res.text();
let body;
try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText }; }
if (!res.ok || !body.ok) {
  throw new Error(`Structured snapshot publish failed: HTTP ${res.status} ${JSON.stringify(body)}`);
}
console.log(JSON.stringify({ ok: true, endpoint, jobs: body.jobs, counts: body.counts, bytes: Buffer.byteLength(raw, 'utf8') }, null, 2));
