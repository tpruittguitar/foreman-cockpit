#!/usr/bin/env python3
"""Generate text/jsonl export snapshots from the local SQLite runtime store.

This keeps Google Drive/text artifacts as generated outputs, not runtime inputs.
No network or Drive API calls are made.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

DEFAULT_DB = Path("data/pipeline_local.db")
DEFAULT_OUT = Path("data/exports")


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def write_text(path: Path, text: str) -> Dict[str, object]:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256_text(text), "lines": len(text.splitlines())}


def bucket_counts(conn: sqlite3.Connection) -> List[Tuple[str, int]]:
    return [(r[0], r[1]) for r in conn.execute("SELECT bucket, COUNT(*) FROM jobs GROUP BY bucket ORDER BY bucket")]


def master_export(conn: sqlite3.Connection) -> Tuple[str, int]:
    rows = [r[0] for r in conn.execute("SELECT source_line FROM jobs ORDER BY inv, primary_id")]
    counts = "COUNTS: TOTAL=" + str(len(rows)) + " " + " ".join([f"{bucket}={count}" for bucket, count in bucket_counts(conn)]) + " UNACCOUNTED=0"
    text = "\n".join([
        counts,
        "SQLITE_GENERATED_CURRENT_POPULATION_MASTER (export snapshot; not runtime source).",
        "========",
        *rows,
        f"END V2_CURRENT_POPULATION_MASTER ({len(rows)} rows)",
    ]) + "\n"
    return text, len(rows)


def archive_export(conn: sqlite3.Connection) -> Tuple[str, int]:
    rows = [r[0] for r in conn.execute("SELECT source_line FROM archive_jobs ORDER BY inv, primary_id")]
    text = "\n".join([
        "V2_TERMINAL_ARCHIVE (SQLite-generated export snapshot; not runtime source)",
        "GENERATED_AT=" + utc_now(),
        "ROW FORMAT = canonical master row format, verbatim from SQLite archive_jobs.source_line.",
        "================================================================",
        *rows,
    ]) + "\n"
    return text, len(rows)


def evidence_export(conn: sqlite3.Connection) -> Tuple[str, int]:
    rows = []
    rows.append(json.dumps({
        "type": "HEADER",
        "schema": "EVC1_SQLITE_EXPORT",
        "createdAt": utc_now(),
        "rule": "Generated from SQLite evidence_records grouped by primary_id/version/source/created_at. Canonical runtime source is SQLite.",
    }, separators=(",", ":")))
    grouped: Dict[Tuple[str, int, str, str], Dict[str, str]] = {}
    for r in conn.execute("SELECT primary_id, version, field_key, field_value, source, created_at FROM evidence_records ORDER BY primary_id, version, field_key"):
        key = (r["primary_id"], int(r["version"]), r["source"] or "", r["created_at"] or "")
        grouped.setdefault(key, {})[r["field_key"]] = r["field_value"]
    for (pid, version, source, created_at), fields in grouped.items():
        rows.append(json.dumps({
            "pid": pid,
            "v": version,
            "base": 0,
            "ts": created_at,
            "src": source,
            "f": fields,
        }, separators=(",", ":"), sort_keys=True))
    text = "\n".join(rows) + "\n"
    return text, max(0, len(rows) - 1)


def record_export(conn: sqlite3.Connection, export_id: str, export_kind: str, info: Dict[str, object], row_count: int) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO export_snapshots
        (export_id, export_kind, destination, source_query, source_hash, row_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (export_id, export_kind, str(info["path"]), "sqlite-local-export", str(info["sha256"]), row_count, utc_now()),
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite database path")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Output folder")
    parser.add_argument("--kind", choices=["all", "master", "archive", "evidence"], default="all")
    args = parser.parse_args()

    db = Path(args.db)
    out = Path(args.out)
    if not db.exists():
        raise SystemExit(f"database not found: {db}")
    stamp = utc_stamp()
    results = []
    with connect(db) as conn:
        with conn:
            if args.kind in ("all", "master"):
                text, count = master_export(conn)
                info = write_text(out / f"V2_CURRENT_POPULATION_MASTER__SQLITE_EXPORT_{stamp}.txt", text)
                record_export(conn, f"master-{stamp}", "master", info, count)
                results.append({"kind": "master", "rows": count, **info})
            if args.kind in ("all", "archive"):
                text, count = archive_export(conn)
                info = write_text(out / f"V2_TERMINAL_ARCHIVE__SQLITE_EXPORT_{stamp}.txt", text)
                record_export(conn, f"archive-{stamp}", "archive", info, count)
                results.append({"kind": "archive", "rows": count, **info})
            if args.kind in ("all", "evidence"):
                text, count = evidence_export(conn)
                info = write_text(out / f"V2_EVIDENCE_COMPANION__SQLITE_EXPORT_{stamp}.jsonl", text)
                record_export(conn, f"evidence-{stamp}", "evidence", info, count)
                results.append({"kind": "evidence", "rows": count, **info})
    print(json.dumps({"ok": True, "db": str(db), "out": str(out), "exports": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
