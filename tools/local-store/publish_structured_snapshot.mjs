#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { getStore } from '@netlify/blobs';

const file = process.argv[2] || 'data/structured_snapshot.json';
const key = 'snapshot/current';
const storeName = 'pipeline-structured-runtime-v1';

const raw = await readFile(file, 'utf8');
const parsed = JSON.parse(raw);
if (!parsed || parsed.ok !== true || !Array.isArray(parsed.jobs) || !parsed.counts) {
  throw new Error('Snapshot must be a structured snapshot with ok=true, counts, and jobs[]');
}
const store = getStore({ name: storeName, consistency: 'strong' });
await store.set(key, raw, { metadata: { generatedAt: parsed.meta?.generatedAt || '', jobs: String(parsed.jobs.length), schema: parsed.meta?.schema || '' } });
console.log(JSON.stringify({ ok: true, store: storeName, key, jobs: parsed.jobs.length, bytes: Buffer.byteLength(raw, 'utf8') }, null, 2));
