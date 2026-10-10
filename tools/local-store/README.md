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
