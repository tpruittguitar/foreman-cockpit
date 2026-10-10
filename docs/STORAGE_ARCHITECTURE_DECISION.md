# Storage Architecture Decision

Status date: 2026-10-10
Status: ACTIVE DECISION
Decision owner: Tim

## Decision

Pipeline Explorer must not rely on Google Docs as the primary runtime storage or retrieval layer for canonical app data.

Google Docs and Google Drive have proven unreliable for this workload because large text reads, archive reads, companion reads, and Apps Script / Drive access can return HTML error pages, stall, or fail inconsistently when the app expects JSON or stable text.

## Plain rule

Do not use Google Docs as the live database.

Google Docs / Drive may be used only as:

- export copies
- human-readable reference documents
- emergency backup snapshots
- migration source material
- manual review artifacts

They must not be the runtime source of truth for:

- current population master
- terminal archive retrieval
- evidence companion retrieval
- automation run history
- operation ledger
- scoring authority
- rules authority
- Writer queue state
- production UI data loading

## Required direction

Future implementation should move runtime storage and retrieval toward a real structured store with stable JSON APIs.

Preferred target shape:

1. canonical rows stored as structured records, not one giant Doc string;
2. terminal history stored as structured archive records;
3. evidence stored as structured evidence records keyed by primary ID and version;
4. automation runs stored as durable run records;
5. Writer requests stored as durable transactions;
6. app reads served through bounded JSON endpoints;
7. UI load must not depend on reading large Google Docs or large Drive text blobs;
8. every endpoint must return controlled JSON on failure, never raw HTML;
9. Google Drive exports can be generated from the structured store, but must not be the store.

## Immediate implication

The current archive read failure is not just a one-off bug. It exposes the wrong storage dependency:

```text
archive read -> Google Drive file -> Apps Script -> browser JSON expectation
```

The short-term fix may harden the archive endpoint so it returns controlled JSON failure, but the strategic fix is to remove Google Docs / Drive text files from the runtime read path.

## Follow-up work required

Create a storage migration track before expanding new table-control, automation-history, or Control Center authority features too deeply.

Minimum migration checklist:

- [ ] inventory every runtime read that depends on Google Docs / Drive text files;
- [ ] classify each read as runtime-critical, export-only, backup-only, or removable;
- [ ] design replacement structured storage schema;
- [ ] choose the durable store;
- [ ] build read-only mirror endpoint from current master into structured records;
- [ ] validate row counts, bucket counts, archive counts, and evidence resolution against current master;
- [ ] switch UI reads to structured JSON;
- [ ] keep Drive exports as generated artifacts only;
- [ ] retire Doc/Drive reads from the production UI load path.

## Hard rule

Do not build new core functionality on top of Google Docs runtime reads.

If a future implementation needs reliable app data, it must use the new structured storage path or explicitly stay read-only/export-only until that path exists.
