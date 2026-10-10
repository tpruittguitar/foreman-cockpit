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

This is a read-only development source. It does not use Writer, Apps Script, Google Docs, or Google Drive runtime reads for the Pipeline table load. By default it reads bounded `/api/jobs?mode=source` pages from SQLite and feeds the existing Pipeline parser. The older single `/api/master` compatibility endpoint remains available with `?src=local&bounded=0`.

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

## Bounded local UI read

The default local development path is now bounded and paged:

```text
http://127.0.0.1:8080/pipeline.html?src=local
```

That path reads:

```text
/api/jobs?mode=source&limit=250&offset=0
/api/jobs?mode=source&limit=250&offset=250
...
```

The browser rebuilds a Pipeline-compatible text view from those SQLite pages, then feeds the existing parser. This proves the UI can run from bounded structured JSON without one large `/api/master` runtime read.

Validation result from 2026-10-10:

- app served locally from `http://127.0.0.1:8080/pipeline.html?src=local`
- local API at `http://127.0.0.1:8765`
- 654 visible roles
- 741 row-lines
- readout: `Connected local SQLite bounded`

The Netlify-hosted page may fail to fetch `http://127.0.0.1:8765` from the browser. For local SQLite testing, serve the app locally or later provide a reachable local/tunnel/VPN endpoint.


## SQLite-generated export snapshots

Generate text/jsonl artifacts from the structured SQLite store:

```powershell
python tools/local-store/export_snapshots.py --db data\pipeline_local.db --out data\exports
```

This creates generated output files only. It does not upload to Google Drive and it does not make text files the runtime source again.

Validation result from 2026-10-10:

- `V2_CURRENT_POPULATION_MASTER__SQLITE_EXPORT_<stamp>.txt` — 741 rows
- `V2_TERMINAL_ARCHIVE__SQLITE_EXPORT_<stamp>.txt` — 522 rows
- `V2_EVIDENCE_COMPANION__SQLITE_EXPORT_<stamp>.jsonl` — 1,936 evidence records
- export records written to SQLite `export_snapshots`


## Publish generated exports to synced Drive

Publish the latest SQLite-generated master/archive/evidence snapshots into a dedicated synced Drive folder:

    python tools/local-store/publish_exports_to_drive.py

Default destination:

    C:\Users\Tim\My Drive\AI_Coordination\SQLite_Exports

Safety behavior:

- never overwrites the canonical live filenames;
- refuses to overwrite a same-named export if its content differs;
- verifies SHA-256 after each copy;
- only publishes filenames generated by `export_snapshots.py`.

Validated on 2026-10-10: master, archive, and evidence exports copied to `SQLite_Exports` with matching SHA-256 checksums.

## Convenience wrapper

Windows shortcut command:

    tools\local-store\publish_drive_exports.cmd

This wrapper calls the checksum-verifying publish_exports_to_drive.py; it does not implement a second publishing path.
## Mirror parity validation

Validate that SQLite still matches the current local Drive-synced source files:

    python tools/local-store/validate_mirror_parity.py

This checks live-row count, live-row text membership, archive-row count, archive-row text membership, evidence record count, evidence field count, and unresolved evidence chains. It does not mutate Drive, Writer, production, or the database.

Validated on 2026-10-10: 741 live rows, 522 archive rows, 1,936 evidence chains, 4,683 evidence field rows, and 0 unresolved evidence chains.

## Cutover preflight gate

Before any production default can move to structured storage, run:

    python tools/local-store/preflight_cutover_gate.py

Expected current result: local SQLite/parity/export/rollback checks pass, but production cutover remains blocked because no production-reachable structured endpoint or explicit Tim approval is in place.

See `docs/STORAGE_CUTOVER_GATE.md`.

## Production structured endpoint scaffold

Netlify endpoint:

    /api/structured/health

Current behavior: public health/status only; `/api/structured/counts`, `/api/structured/jobs`, and `/api/structured/jobs/<PRIMARY_ID>` use the existing Writer key and require a loaded Netlify Blob snapshot. No separate structured token layer is used.

### Build and publish a protected structured snapshot

Build the snapshot from the current local SQLite mirror:

    python tools/local-store/make_structured_snapshot.py

Publish it to Netlify Blobs after Netlify auth/site context is configured:

    node tools/local-store/publish_structured_snapshot.mjs data/structured_snapshot.json

The protected production endpoints are:

    /api/structured/counts
    /api/structured/jobs?limit=250&offset=0
    /api/structured/jobs/<PRIMARY_ID>

They use the existing Writer key in `x-writer-key` or `writerKey`. The snapshot file is ignored by Git and must not be committed.

### Browser test path for structured runtime

A non-default browser adapter is available for testing the structured endpoint without changing the production load path:

    https://foreman-cockpit.netlify.app/pipeline.html?src=structured

It uses the existing in-app Writer key and reads `/api/structured/jobs` in bounded pages. It will fail safely until the structured snapshot has been loaded. The normal production Pipeline Explorer path is unchanged.


### Browser-seeded structured import

The production UI has a non-default structured test path:

    https://foreman-cockpit.netlify.app/pipeline.html?src=structured

To seed the structured snapshot from the current Writer master using the existing in-browser Writer key, use:

    https://foreman-cockpit.netlify.app/pipeline.html?src=structured&import=1

This posts to `/api/structured/admin/import-from-writer`, stores a Netlify Blob snapshot, then rereads `/api/structured/jobs` in bounded pages. It does not change the normal production default path.
