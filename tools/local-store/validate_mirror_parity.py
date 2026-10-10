#!/usr/bin/env python3
"""Validate local SQLite mirror parity against Drive-synced source files.

This is a pre-cutover guard. It does not mutate Drive files, Writer, or production.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

DEFAULT_DB = Path("data/pipeline_local.db")
DEFAULT_MASTER = Path(r"C:\Users\Tim\My Drive\AI_Coordination\V2_CURRENT_POPULATION_MASTER.txt")
DEFAULT_ARCHIVE = Path(r"C:\Users\Tim\My Drive\AI_Coordination\V2_TERMINAL_ARCHIVE.txt")
DEFAULT_EVIDENCE = Path(r"C:\Users\Tim\My Drive\AI_Coordination\V2_EVIDENCE_COMPANION.jsonl")


def parse_rows(path: Path) -> List[str]:
    rows: List[str] = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line and line[0].isdigit() and " | " in line:
            rows.append(line.rstrip("\n"))
    return rows


def parse_evidence(path: Path) -> Tuple[int, int, int]:
    records = 0
    fields = 0
    headers = 0
    for line_number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        rec = json.loads(line)
        if rec.get("type") == "HEADER":
            headers += 1
            continue
        if not rec.get("pid") or not rec.get("v") or not isinstance(rec.get("f"), dict):
            raise ValueError(f"invalid evidence record at line {line_number}")
        records += 1
        fields += len(rec["f"])
    return headers, records, fields


def fetch_source_lines(conn: sqlite3.Connection, table: str) -> List[str]:
    order = "ORDER BY inv, primary_id"
    return [r[0] for r in conn.execute(f"SELECT source_line FROM {table} {order}")]


def membership_mismatch(source: List[str], sqlite_rows: List[str]) -> Dict[str, object] | None:
    source_set = set(source)
    sqlite_set = set(sqlite_rows)
    missing = sorted(source_set - sqlite_set)
    extra = sorted(sqlite_set - source_set)
    duplicate_source = len(source) - len(source_set)
    duplicate_sqlite = len(sqlite_rows) - len(sqlite_set)
    if missing or extra or duplicate_source or duplicate_sqlite:
        return {
            "missing_from_sqlite": len(missing),
            "extra_in_sqlite": len(extra),
            "duplicate_source_rows": duplicate_source,
            "duplicate_sqlite_rows": duplicate_sqlite,
            "first_missing": missing[0][:300] if missing else None,
            "first_extra": extra[0][:300] if extra else None,
        }
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--master", default=str(DEFAULT_MASTER))
    parser.add_argument("--archive", default=str(DEFAULT_ARCHIVE))
    parser.add_argument("--evidence", default=str(DEFAULT_EVIDENCE))
    args = parser.parse_args()

    db = Path(args.db)
    master = Path(args.master)
    archive = Path(args.archive)
    evidence = Path(args.evidence)
    for p in [db, master, archive, evidence]:
        if not p.exists():
            raise SystemExit(f"missing required file: {p}")

    master_rows = parse_rows(master)
    archive_rows = parse_rows(archive)
    evidence_headers, evidence_records, evidence_fields = parse_evidence(evidence)

    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    sqlite_master_rows = fetch_source_lines(conn, "jobs")
    sqlite_archive_rows = fetch_source_lines(conn, "archive_jobs")
    sqlite_evidence_records = conn.execute("SELECT COUNT(*) FROM evidence_chains").fetchone()[0]
    sqlite_evidence_fields = conn.execute("SELECT COUNT(*) FROM evidence_records").fetchone()[0]
    sqlite_unresolved = conn.execute("SELECT COUNT(*) FROM evidence_chains WHERE unresolved = 1").fetchone()[0]

    checks = [
        {"check": "master_row_count", "ok": len(master_rows) == len(sqlite_master_rows), "source": len(master_rows), "sqlite": len(sqlite_master_rows)},
        {"check": "master_row_text_membership", "ok": membership_mismatch(master_rows, sqlite_master_rows) is None, "mismatch": membership_mismatch(master_rows, sqlite_master_rows)},
        {"check": "archive_row_count", "ok": len(archive_rows) == len(sqlite_archive_rows), "source": len(archive_rows), "sqlite": len(sqlite_archive_rows)},
        {"check": "archive_row_text_membership", "ok": membership_mismatch(archive_rows, sqlite_archive_rows) is None, "mismatch": membership_mismatch(archive_rows, sqlite_archive_rows)},
        {"check": "evidence_record_count", "ok": evidence_records == sqlite_evidence_records, "source": evidence_records, "sqlite": sqlite_evidence_records},
        {"check": "evidence_field_count", "ok": evidence_fields == sqlite_evidence_fields, "source": evidence_fields, "sqlite": sqlite_evidence_fields},
        {"check": "evidence_unresolved_chains", "ok": sqlite_unresolved == 0, "sqlite": sqlite_unresolved},
    ]
    ok = all(c["ok"] for c in checks)
    result = {
        "ok": ok,
        "db": str(db),
        "master": str(master),
        "archive": str(archive),
        "evidence": str(evidence),
        "source_counts": {
            "master_rows": len(master_rows),
            "archive_rows": len(archive_rows),
            "evidence_headers": evidence_headers,
            "evidence_records": evidence_records,
            "evidence_fields": evidence_fields,
        },
        "sqlite_counts": {
            "master_rows": len(sqlite_master_rows),
            "archive_rows": len(sqlite_archive_rows),
            "evidence_chains": sqlite_evidence_records,
            "evidence_fields": sqlite_evidence_fields,
            "evidence_unresolved": sqlite_unresolved,
        },
        "checks": checks,
    }
    print(json.dumps(result, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
