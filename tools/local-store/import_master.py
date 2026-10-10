#!/usr/bin/env python3
"""Import a Pipeline Explorer master text export into local SQLite.

Usage:
  python tools/local-store/import_master.py --master path/to/V2_CURRENT_POPULATION_MASTER.txt
  python tools/local-store/import_master.py --master path/to/master.txt --db data/pipeline_local.db

This importer is intentionally conservative:
- It does not talk to Google Drive.
- It does not mutate the source text file.
- It stores the original row line byte-for-byte for audit/rebuild.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

FIXED_N = 9
DEFAULT_DB = Path("data/pipeline_local.db")
SCHEMA = Path(__file__).with_name("schema.sql")

@dataclass
class ParsedRow:
    inv: int
    primary_id: str
    company: str
    title: str
    bucket: str
    disposition: str
    date_added: str
    req_id: str
    location: str
    payload_text: str
    payload: Dict[str, str]
    source_line: str
    source_hash: str
    is_archived: bool


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_payload(text: str) -> Dict[str, str]:
    payload: Dict[str, str] = {}
    last_key: Optional[str] = None
    for segment in text.split("; "):
        match = re.match(r"^([A-Z][A-Z0-9_]*)=([\s\S]*)$", segment)
        if match:
            last_key = match.group(1)
            if last_key in payload:
                payload[last_key] += "; " + match.group(2)
            else:
                payload[last_key] = match.group(2)
        elif last_key:
            payload[last_key] += "; " + segment
    return payload


def parse_row(line: str) -> Optional[ParsedRow]:
    if not re.match(r"^\d+ \| ", line):
        return None
    cells = line.rstrip("\n").split(" | ")
    if len(cells) < FIXED_N + 1:
        return None
    payload_text = " | ".join(cells[FIXED_N:])
    payload = parse_payload(payload_text)
    is_archived = "ARCHIVE_STATE" in payload or bool(re.search(r";\s*ARCHIVE_STATE=", payload_text))
    source_hash = hashlib.sha256(line.encode("utf-8")).hexdigest()
    return ParsedRow(
        inv=int(cells[0]),
        primary_id=cells[1].strip(),
        company=cells[2].strip(),
        title=cells[3].strip(),
        bucket=cells[4].strip(),
        disposition=cells[5].strip(),
        date_added=cells[6].strip(),
        req_id=cells[7].strip(),
        location=cells[8].strip(),
        payload_text=payload_text,
        payload=payload,
        source_line=line.rstrip("\n"),
        source_hash=source_hash,
        is_archived=is_archived,
    )


def iter_rows(master_text: str) -> Iterable[ParsedRow]:
    for line in master_text.splitlines():
        parsed = parse_row(line)
        if parsed:
            yield parsed


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def import_archive(conn: sqlite3.Connection, archive_path: Path) -> Dict[str, int]:
    text = archive_path.read_text(encoding="utf-8-sig")
    rows = [r for r in iter_rows(text)]
    now = utc_now()
    with conn:
        conn.execute("DELETE FROM archive_jobs")
        for row in rows:
            archive_key = f"{row.primary_id}#{row.inv}"
            conn.execute(
                """
                INSERT OR REPLACE INTO archive_jobs
                (archive_key, primary_id, inv, company, title, bucket, disposition, req_id, location, payload_text, source_line, source_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (archive_key, row.primary_id, row.inv, row.company, row.title, row.bucket, row.disposition, row.req_id, row.location, row.payload_text, row.source_line, row.source_hash),
            )
        conn.execute("INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES ('source_archive_path', ?, ?)", (str(archive_path), now))
        conn.execute("INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES ('source_archive_hash', ?, ?)", (file_sha256(archive_path), now))
        conn.execute("INSERT OR REPLACE INTO runtime_read_status (read_name, state, detail, row_count, last_ok_at, last_checked_at) VALUES ('terminal_archive', 'OK', ?, ?, ?, ?)", (str(archive_path), len(rows), now, now))
    return {"archive_source_lines": len(text.splitlines()), "archive_jobs": len(rows)}


def import_evidence(conn: sqlite3.Connection, evidence_path: Path) -> Dict[str, int]:
    now = utc_now()
    parsed = []
    header = None
    for line_number, line in enumerate(evidence_path.read_text(encoding="utf-8-sig").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        record = json.loads(line)
        if record.get("type") == "HEADER":
            header = record
            continue
        pid = str(record.get("pid") or "").strip()
        version = int(record.get("v") or 0)
        fields = record.get("f") or {}
        if not pid or version <= 0 or not isinstance(fields, dict):
            raise ValueError(f"invalid evidence record at line {line_number}")
        parsed.append({"pid": pid, "v": version, "base": int(record.get("base") or 0), "ts": str(record.get("ts") or ""), "src": str(record.get("src") or ""), "fields": fields})
    by_pid_version = {(r["pid"], r["v"]): r for r in parsed}

    def resolve(pid: str, version: int) -> Tuple[Dict[str, str], bool]:
        chain = []
        seen = set()
        cur = version
        unresolved = False
        while cur:
            key = (pid, cur)
            if key in seen or key not in by_pid_version:
                unresolved = True
                break
            seen.add(key)
            rec = by_pid_version[key]
            chain.append(rec)
            cur = rec["base"]
        merged: Dict[str, str] = {}
        for rec in reversed(chain):
            for k, v in rec["fields"].items():
                merged[str(k)] = str(v)
        return merged, unresolved

    with conn:
        conn.execute("DELETE FROM evidence_records")
        conn.execute("DELETE FROM evidence_chains")
        for rec in parsed:
            pid, version = rec["pid"], rec["v"]
            for field_key, field_value in rec["fields"].items():
                evidence_id = f"{pid}:EVC1:{version}:{field_key}"
                conn.execute(
                    """
                    INSERT OR REPLACE INTO evidence_records
                    (evidence_id, primary_id, version, field_key, field_value, source, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (evidence_id, pid, version, str(field_key), str(field_value), rec["src"], rec["ts"] or now),
                )
            merged, unresolved = resolve(pid, version)
            conn.execute(
                """
                INSERT OR REPLACE INTO evidence_chains
                (evidence_ref, primary_id, head_version, resolved_json, unresolved, observed_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (f"{pid}:EVC1:{version}", pid, version, json.dumps(merged, sort_keys=True), 1 if unresolved else 0, now),
            )
        conn.execute("INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES ('source_evidence_path', ?, ?)", (str(evidence_path), now))
        conn.execute("INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES ('source_evidence_hash', ?, ?)", (file_sha256(evidence_path), now))
        conn.execute("INSERT OR REPLACE INTO runtime_read_status (read_name, state, detail, row_count, last_ok_at, last_checked_at) VALUES ('evidence_companion', 'OK', ?, ?, ?, ?)", (str(evidence_path), len(parsed), now, now))
    return {
        "evidence_header": 1 if header else 0,
        "evidence_records": len(parsed),
        "evidence_fields": sum(len(r["fields"]) for r in parsed),
        "evidence_chains": len(parsed),
        "evidence_unresolved": conn.execute("SELECT COUNT(*) FROM evidence_chains WHERE unresolved = 1").fetchone()[0],
    }


def open_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    return conn


def import_master(conn: sqlite3.Connection, master_path: Path) -> Dict[str, int]:
    text = master_path.read_text(encoding="utf-8-sig")
    rows = list(iter_rows(text))
    now = utc_now()
    with conn:
        conn.execute("DELETE FROM job_payload_fields")
        conn.execute("DELETE FROM jobs")
        conn.execute("DELETE FROM archive_jobs")
        for row in rows:
            if row.is_archived:
                archive_key = f"{row.primary_id}#{row.inv}"
                conn.execute(
                    """
                    INSERT OR REPLACE INTO archive_jobs
                    (archive_key, primary_id, inv, company, title, bucket, disposition, req_id, location, payload_text, source_line, source_hash)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (archive_key, row.primary_id, row.inv, row.company, row.title, row.bucket, row.disposition, row.req_id, row.location, row.payload_text, row.source_line, row.source_hash),
                )
                continue
            conn.execute(
                """
                INSERT OR REPLACE INTO jobs
                (primary_id, inv, company, title, bucket, disposition, date_added, req_id, location, payload_text, source_line, source_hash, is_archived, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (row.primary_id, row.inv, row.company, row.title, row.bucket, row.disposition, row.date_added, row.req_id, row.location, row.payload_text, row.source_line, row.source_hash, now),
            )
            for key, value in row.payload.items():
                conn.execute(
                    "INSERT OR REPLACE INTO job_payload_fields (primary_id, field_key, field_value) VALUES (?, ?, ?)",
                    (row.primary_id, key, value),
                )
        conn.execute("INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES ('source_master_path', ?, ?)", (str(master_path), now))
        conn.execute("INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES ('source_master_hash', ?, ?)", (hashlib.sha256(text.encode("utf-8")).hexdigest(), now))
        conn.execute("INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES ('last_import_at', ?, ?)", (now, now))
    counts = dict(conn.execute("SELECT bucket, COUNT(*) AS n FROM jobs GROUP BY bucket").fetchall())
    return {
        "source_lines": len(text.splitlines()),
        "parsed_rows": len(rows),
        "jobs": conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0],
        "archive_jobs": conn.execute("SELECT COUNT(*) FROM archive_jobs").fetchone()[0],
        "payload_fields": conn.execute("SELECT COUNT(*) FROM job_payload_fields").fetchone()[0],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", required=True, help="Path to V2_CURRENT_POPULATION_MASTER.txt or exported master text")
    parser.add_argument("--archive", help="Optional path to V2_TERMINAL_ARCHIVE.txt")
    parser.add_argument("--evidence", help="Optional path to V2_EVIDENCE_COMPANION.jsonl")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite database path")
    args = parser.parse_args()
    master_path = Path(args.master)
    db_path = Path(args.db)
    if not master_path.exists():
        raise SystemExit(f"Master file not found: {master_path}")
    conn = open_db(db_path)
    stats = import_master(conn, master_path)
    if args.archive:
        archive_path = Path(args.archive)
        if not archive_path.exists():
            raise SystemExit(f"Archive file not found: {archive_path}")
        stats.update(import_archive(conn, archive_path))
    if args.evidence:
        evidence_path = Path(args.evidence)
        if not evidence_path.exists():
            raise SystemExit(f"Evidence companion file not found: {evidence_path}")
        stats.update(import_evidence(conn, evidence_path))
    print({"ok": True, "db": str(db_path), **stats})
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
