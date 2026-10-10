# Local SQLite Runtime Store

Purpose: local-first storage proof-of-concept for Pipeline Explorer.

This is intentionally small and free:

- no paid database
- no Google Docs runtime read
- no Google Drive runtime read
- no external Python packages
- SQLite file on Tim's computer
- JSON endpoints from a tiny local Python API

## Files

- `schema.sql` — SQLite schema
- `import_master.py` — imports a `V2_CURRENT_POPULATION_MASTER.txt` style export into SQLite
- `local_store_api.py` — serves local JSON endpoints

## Setup

From the repo root:

```powershell
python tools/local-store/import_master.py --master C:\path\to\V2_CURRENT_POPULATION_MASTER.txt
python tools/local-store/local_store_api.py --db data\pipeline_local.db --port 8765
```

Then open:

```text
http://127.0.0.1:8765/health
http://127.0.0.1:8765/api/counts
http://127.0.0.1:8765/api/jobs?limit=25
```

## Current status

This is not yet wired into production Pipeline Explorer. It is the local storage foundation.

Next steps:

1. Export/materialize the current text master onto Tim's computer.
2. Import it with `import_master.py`.
3. Validate counts against the current master.
4. Add a dev-only Pipeline Explorer source adapter that reads `http://127.0.0.1:8765/api/...`.
5. Only after validation, decide whether to replace production runtime reads.

## Design rule

The SQLite database becomes the local runtime source. Google Drive files become export/backup/source material only.

## Pipeline Explorer dev source

With the local API running, open Pipeline Explorer with:

```text
https://foreman-cockpit.netlify.app/?src=local
```

Default local API:

```text
http://127.0.0.1:8765
```

Override the API base when needed:

```text
https://foreman-cockpit.netlify.app/?src=local&localApi=http://127.0.0.1:8765
```

This is a read-only development source. It does not use Writer, Apps Script, Google Docs, or Google Drive runtime reads for the Pipeline table load. It reads the local SQLite `/api/master` endpoint and feeds the existing Pipeline parser.

## Final structured schema

The schema now includes additive Phase 2 tables for archive, evidence, automation runs, operation obligations, Writer transactions, scoring-model versions, rule versions, runtime read status, and export snapshots. See `docs/STORAGE_SQLITE_SCHEMA_DESIGN.md`.

## Full mirror import

To import the current local master plus terminal archive and evidence companion:

```powershell
python tools/local-store/import_master.py `
  --master "C:\Users\Tim\My Drive\AI_Coordination\V2_CURRENT_POPULATION_MASTER.txt" `
  --archive "C:\Users\Tim\My Drive\AI_Coordination\V2_TERMINAL_ARCHIVE.txt" `
  --evidence "C:\Users\Tim\My Drive\AI_Coordination\V2_EVIDENCE_COMPANION.jsonl" `
  --db data\pipeline_local.db
```

Validation result from 2026-10-10:

- live jobs: 741
- archive jobs: 522
- payload fields: 31,761
- evidence chains: 1,936
- evidence field rows: 4,683
- unresolved evidence chains: 0

Additional local API endpoints:

```text
/api/archive?limit=50
/api/evidence/<PRIMARY_ID>
/api/runtime-status
```
