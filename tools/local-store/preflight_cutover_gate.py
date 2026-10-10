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
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "pipeline_local.db"
VALIDATOR = ROOT / "tools" / "local-store" / "validate_mirror_parity.py"
EXPORT_DIR = Path(r"C:\Users\Tim\My Drive\AI_Coordination\SQLite_Exports")
ROLLBACK_PLAN = Path("docs/STORAGE_RUNTIME_ROLLBACK_PLAN.md")
CUTOVER_APPROVAL = Path("docs/STORAGE_CUTOVER_APPROVAL_2026-10-10.md")
STRUCTURED_HEALTH_URL = "https://foreman-cockpit.netlify.app/api/structured/health"


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


def rollback_check():
    required = [
        "restore the Drive/App Script runtime default",
        "Pipeline renders active jobs",
        "job-row click opens the detail drawer",
        "Build/version/commit is recorded",
    ]
    plan = ROOT / ROLLBACK_PLAN
    if not plan.exists():
        return {"gate": "production_rollback_path", "ok": False, "detail": "Rollback plan missing"}
    text = plan.read_text(encoding="utf-8")
    missing = [item for item in required if item not in text]
    return {
        "gate": "production_rollback_path",
        "ok": not missing,
        "detail": {"path": str(plan), "missing": missing},
    }


def structured_endpoint_check():
    try:
        with urllib.request.urlopen(STRUCTURED_HEALTH_URL, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
            return {"gate": "production_reachable_structured_endpoint", "ok": bool(data.get("ok") and data.get("service") == "structured-runtime"), "detail": {"url": STRUCTURED_HEALTH_URL, "status": res.status, "body": data}}
    except Exception as exc:
        return {"gate": "production_reachable_structured_endpoint", "ok": False, "detail": {"url": STRUCTURED_HEALTH_URL, "error": str(exc)}}


def structured_data_check(endpoint_result):
    body = ((endpoint_result.get("detail") or {}).get("body") or {})
    return {"gate": "production_structured_data_available", "ok": body.get("dataAvailable") is True, "detail": body.get("reason") or "Structured population data source is not configured"}


def export_files():
    if not EXPORT_DIR.exists():
        return []
    return sorted([p.name for p in EXPORT_DIR.glob("*SQLITE_EXPORT_*")])[-10:]


def main() -> int:
    parity_code, parity_out, parity_err = run([sys.executable, str(VALIDATOR)])
    counts = db_counts()
    files = export_files()
    endpoint_result = structured_endpoint_check()
    checks = [
        {"gate": "sqlite_db_exists", "ok": DB.exists(), "detail": str(DB)},
        {"gate": "sqlite_counts_present", "ok": bool(counts and counts["jobs"] and counts["archive_jobs"] and counts["evidence_chains"]), "detail": counts},
        {"gate": "parity_validator", "ok": parity_code == 0, "detail": json.loads(parity_out) if parity_out.startswith("{") else {"stdout": parity_out, "stderr": parity_err}},
        {"gate": "drive_synced_exports_present", "ok": len(files) >= 3, "detail": {"folder": str(EXPORT_DIR), "sample": files}},
        endpoint_result,
        structured_data_check(endpoint_result),
        rollback_check(),
        {"gate": "tim_explicit_cutover_approval", "ok": (ROOT / CUTOVER_APPROVAL).exists(), "detail": str(ROOT / CUTOVER_APPROVAL) if (ROOT / CUTOVER_APPROVAL).exists() else "Not given"},
    ]
    report = {"ok": all(c["ok"] for c in checks), "checks": checks}
    print(json.dumps(report, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
