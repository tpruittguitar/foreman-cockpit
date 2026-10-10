#!/usr/bin/env python3
"""Build a compact structured JSON snapshot from the local SQLite mirror.

This creates the payload served by the token-gated Netlify structured endpoint.
It does not upload anything by itself.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "data" / "pipeline_local.db"
DEFAULT_OUT = ROOT / "data" / "structured_snapshot.json"


def rows(conn, sql, args=()):
    conn.row_factory = sqlite3.Row
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


def build(db: Path):
    conn = sqlite3.connect(db)
    try:
        jobs = rows(conn, """
            select primary_id as PRIMARY_ID,
                   inv as INV,
                   company as COMPANY,
                   title as TITLE,
                   bucket as BUCKET,
                   disposition as DISPOSITION,
                   date_added as DATE_ADDED,
                   req_id as REQ,
                   location as LOCATION,
                   payload_text as PAYLOAD_TEXT,
                   source_line as SOURCE_LINE
            from jobs
            order by inv, primary_id
        """)
        counts = {
            "jobs": conn.execute("select count(*) from jobs").fetchone()[0],
            "archive_jobs": conn.execute("select count(*) from archive_jobs").fetchone()[0],
            "evidence_chains": conn.execute("select count(*) from evidence_chains").fetchone()[0],
            "evidence_fields": conn.execute("select count(*) from evidence_records").fetchone()[0],
            "evidence_unresolved": conn.execute("select count(*) from evidence_chains where unresolved=1").fetchone()[0],
        }
        buckets = dict(conn.execute("select bucket, count(*) from jobs group by bucket order by bucket").fetchall())
        meta = {
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source": "local SQLite mirror",
            "schema": "pipeline-structured-snapshot-v1",
        }
        return {"ok": True, "meta": meta, "counts": counts, "buckets": buckets, "jobs": jobs}
    finally:
        conn.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ns = ap.parse_args()
    snap = build(Path(ns.db))
    out = Path(ns.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(out), "jobs": snap["counts"]["jobs"], "bytes": out.stat().st_size}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
