# Storage Architecture Decision

Status date: 2026-10-10
Status: ACTIVE DECISION
Decision owner: Tim

## Decision

Pipeline Explorer must not rely on Google Docs as the primary runtime storage or retrieval layer for canonical app data.

Important correction: Tim already moved the live population master away from a Google Doc and into a plain text file. That was the right first fix. It removed the Google Docs document model and DocumentApp-style storage dependency from the master.

The remaining problem is the next layer down: production runtime still depends on Google Drive / Apps Script reading large text files and returning them as JSON to the browser. That is still not reliable enough for the live app.

## Plain rule

Do not use Google Docs as the live database.

Also do not use large Google Drive text files, read through Apps Script, as the long-term production runtime database.

Google Docs / Drive may be used only as:

- export copies
- human-readable reference documents
- emergency backup snapshots
- migration source material
- manual review artifacts

They must not be the long-term runtime source of truth for:

- current population master
- terminal archive retrieval
- evidence companion retrieval
- automation run history
- operation ledger
- scoring authority
- rules authority
- Writer queue state
- production UI data loading

## What has already been fixed

- [x] The live master was moved from Google Docs document storage to a plain text master file.
- [x] The old Google Doc master was frozen as rollback only.
- [x] The app no longer depends on the Google Docs document model for the live population master.

## What is still not fixed

The app still relies on Apps Script / Drive text-file reads for runtime data loading.

Current fragile pattern:

```text
browser -> Apps Script GET action -> DriveApp.getFileById(...).getBlob().getDataAsString() -> JSON response expected by browser
```

The archive failure showed this can still return an HTML error page, stall, or fail inconsistently.

## Required direction

Future implementation should move runtime storage and retrieval toward a real structured store with stable JSON APIs.

Preferred target shape:

1. canonical rows stored as structured records, not one giant runtime text file;
2. terminal history stored as structured archive records;
3. evidence stored as structured evidence records keyed by primary ID and version;
4. automation runs stored as durable run records;
5. Writer requests stored as durable transactions;
6. app reads served through bounded JSON endpoints;
7. UI load must not depend on reading large Google Docs or large Drive text blobs;
8. every endpoint must return controlled JSON on failure, never raw HTML;
9. Google Drive exports can be generated from the structured store, but must not be the runtime store.

## Immediate implication

The current archive read failure is not just a one-off bug. It exposes the remaining wrong dependency:

```text
archive read -> Google Drive text file -> Apps Script -> browser JSON expectation
```

The short-term fix may harden the archive endpoint so it returns controlled JSON failure, but the strategic fix is to remove Google Drive text files from the runtime read path.

## Follow-up work required

Create a storage migration track before expanding new table-control, automation-history, or Control Center authority features too deeply.

Minimum migration checklist:

- [ ] inventory every runtime read that depends on Google Drive text files or Apps Script file reads;
- [ ] classify each read as runtime-critical, export-only, backup-only, or removable;
- [x] design replacement structured storage schema (`docs/STORAGE_SQLITE_SCHEMA_DESIGN.md` and `tools/local-store/schema.sql`);
- [x] choose the durable store: local-first SQLite, not enterprise cloud;
- [x] build read-only mirror endpoint from the current text master, terminal archive, and evidence companion into structured records;
- [x] validate row counts, bucket counts, archive counts, and evidence resolution against the current local files;
- [ ] switch UI reads to structured JSON;
- [~] keep Drive exports as generated artifacts only; SQLite-generated master/archive/evidence snapshots can now publish checksum-verified copies to `AI_Coordination/SQLite_Exports`, but canonical live Drive files are not yet generated from SQLite;
- [ ] retire Drive text-file reads from the production UI load path.

## Hard rule

Do not build new core functionality on top of Google Docs runtime reads or large Google Drive text-file runtime reads.

If a future implementation needs reliable app data, it must use the new structured storage path or explicitly stay read-only/export-only until that path exists.

