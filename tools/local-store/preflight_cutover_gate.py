#!/usr/bin/env python3
"""Preflight checks for SQLite runtime cutover.

This script does not cut over production. It reports whether the local prerequisites
are ready and explicitly marks production endpoint/cutover approval gates as blocked.
"""
from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "pipeline_local.db"
VALIDATOR = ROOT / "tools" / "local-store" / "validate_mirror_parity.py"
EXPORT_DIR = Path(r"C:\Users\Tim\My Drive\AI_Coordination\SQLite_Exports")


def run(cmd):
    p = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def db_counts():
    if not DB.exists():
        return None
    conn = sqlite3.connect(DB)
    try:
        return {
            "jobs": conn.execute("select count(*) from jobs").fetchone()[0],
            "archive_jobs": conn.execute("select count(*) from archive_jobs").fetchone()[0],
            "evidence_records": conn.execute("select count(*) from evidence_records").fetchone()[0],
            "evidence_chains": conn.execute("select count(*) from evidence_chains").fetchone()[0],
            "evidence_unresolved": conn.execute("select count(*) from evidence_chains where unresolved=1").fetchone()[0],
            "export_snapshots": conn.execute("select count(*) from export_snapshots").fetchone()[0],
        }
    finally:
        conn.close()


def export_files():
    if not EXPORT_DIR.exists():
        return []
    return sorted([p.name for p in EXPORT_DIR.glob("*SQLITE_EXPORT_*")])[-10:]


def main() -> int:
    parity_code, parity_out, parity_err = run([sys.executable, str(VALIDATOR)])
    counts = db_counts()
    files = export_files()
    checks = [
        {"gate": "sqlite_db_exists", "ok": DB.exists(), "detail": str(DB)},
        {"gate": "sqlite_counts_present", "ok": bool(counts and counts["jobs"] and counts["archive_jobs"] and counts["evidence_chains"]), "detail": counts},
        {"gate": "parity_validator", "ok": parity_code == 0, "detail": json.loads(parity_out) if parity_out.startswith("{") else {"stdout": parity_out, "stderr": parity_err}},
        {"gate": "drive_synced_exports_present", "ok": len(files) >= 3, "detail": {"folder": str(EXPORT_DIR), "sample": files}},
        {"gate": "production_reachable_structured_endpoint", "ok": False, "detail": "Not implemented"},
        {"gate": "production_rollback_path", "ok": False, "detail": "Not implemented"},
        {"gate": "tim_explicit_cutover_approval", "ok": False, "detail": "Not given"},
    ]
    report = {"ok": all(c["ok"] for c in checks), "checks": checks}
    print(json.dumps(report, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
