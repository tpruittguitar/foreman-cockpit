#!/usr/bin/env python3
"""Tiny local JSON API for Pipeline Explorer SQLite proof-of-concept.

No external packages. Uses Python stdlib http.server + sqlite3.

Run:
  python tools/local-store/local_store_api.py --db data/pipeline_local.db --port 8765

Endpoints:
  GET /health
  GET /api/counts
  GET /api/jobs?limit=50&offset=0&bucket=READY_TO_PURSUE&q=tesla
  GET /api/jobs/<PRIMARY_ID>
  GET /api/archive?limit=50&offset=0
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sqlite3
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Tuple

DEFAULT_DB = Path("data/pipeline_local.db")


def connect(db: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    return conn


def row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {k: row[k] for k in row.keys()}


class Handler(BaseHTTPRequestHandler):
    db_path: Path = DEFAULT_DB

    def send_json(self, payload: Dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        try:
            if parsed.path == "/health":
                return self.health()
            if parsed.path == "/api/counts":
                return self.counts()
            if parsed.path == "/api/master":
                return self.master()
            if parsed.path == "/api/jobs":
                return self.jobs(params)
            if parsed.path.startswith("/api/jobs/"):
                pid = urllib.parse.unquote(parsed.path.split("/api/jobs/", 1)[1])
                return self.job(pid)
            if parsed.path == "/api/archive":
                return self.archive(params)
            return self.send_json({"ok": False, "error": "not found", "path": parsed.path}, 404)
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)}, 500)

    def health(self) -> None:
        exists = self.db_path.exists()
        payload: Dict[str, Any] = {"ok": exists, "db": str(self.db_path)}
        if exists:
            with connect(self.db_path) as conn:
                payload["jobs"] = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
                payload["archive_jobs"] = conn.execute("SELECT COUNT(*) FROM archive_jobs").fetchone()[0]
                payload["meta"] = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM meta")}
        else:
            payload["error"] = "database not found; run import_master.py first"
        self.send_json(payload, 200 if exists else 503)

    def counts(self) -> None:
        with connect(self.db_path) as conn:
            buckets = [row_to_dict(r) for r in conn.execute("SELECT bucket, COUNT(*) AS count FROM jobs GROUP BY bucket ORDER BY count DESC, bucket")]
            self.send_json({
                "ok": True,
                "jobs": conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0],
                "archive_jobs": conn.execute("SELECT COUNT(*) FROM archive_jobs").fetchone()[0],
                "payload_fields": conn.execute("SELECT COUNT(*) FROM job_payload_fields").fetchone()[0],
                "buckets": buckets,
            })

    def master(self) -> None:
        with connect(self.db_path) as conn:
            rows = [r[0] for r in conn.execute("SELECT source_line FROM jobs ORDER BY inv, primary_id")]
            archive_rows = [r[0] + "; ARCHIVE_STATE=ARCHIVED_TERMINAL" for r in conn.execute("SELECT source_line FROM archive_jobs ORDER BY inv, primary_id")]
            bucket_counts = conn.execute("SELECT bucket, COUNT(*) FROM jobs GROUP BY bucket ORDER BY bucket").fetchall()
            total = len(rows) + len(archive_rows)
            counts = "COUNTS: TOTAL=" + str(total) + " " + " ".join([str(b) + "=" + str(c) for b, c in bucket_counts]) + " UNACCOUNTED=0"
            lines = [
                counts,
                "LOCAL_SQLITE_RUNTIME_VIEW (generated from structured SQLite records; not a Google Docs or Drive runtime read).",
                "========",
            ] + rows
            if archive_rows:
                lines.append("=== ARCHIVE_ROWS (" + str(len(archive_rows)) + ") ===")
                lines.extend(archive_rows)
            lines.append("END V2_CURRENT_POPULATION_MASTER (" + str(total) + " rows)")
            meta = conn.execute("SELECT key, value FROM meta").fetchall()
            meta_map = {r[0]: r[1] for r in meta}
            self.send_json({
                "ok": True,
                "id": "local-sqlite",
                "source": "local-sqlite",
                "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "modifiedTime": meta_map.get("last_import_at", ""),
                "rows": total,
                "text": "\n".join(lines) + "\n",
            })

    def jobs(self, params: Dict[str, List[str]]) -> None:
        limit = min(int(params.get("limit", [50])[0]), 500)
        offset = max(int(params.get("offset", [0])[0]), 0)
        bucket = params.get("bucket", [""])[0].strip()
        q = params.get("q", [""])[0].strip()
        where: List[str] = []
        values: List[Any] = []
        if bucket:
            where.append("bucket = ?")
            values.append(bucket)
        if q:
            where.append("(company LIKE ? OR title LIKE ? OR req_id LIKE ? OR location LIKE ?)")
            like = f"%{q}%"
            values.extend([like, like, like, like])
        clause = "WHERE " + " AND ".join(where) if where else ""
        sql = f"SELECT primary_id, inv, company, title, bucket, disposition, date_added, req_id, location FROM jobs {clause} ORDER BY inv LIMIT ? OFFSET ?"
        with connect(self.db_path) as conn:
            total_sql = f"SELECT COUNT(*) FROM jobs {clause}"
            total = conn.execute(total_sql, values).fetchone()[0]
            rows = [row_to_dict(r) for r in conn.execute(sql, values + [limit, offset])]
            self.send_json({"ok": True, "total": total, "limit": limit, "offset": offset, "rows": rows})

    def job(self, primary_id: str) -> None:
        with connect(self.db_path) as conn:
            row = conn.execute("SELECT * FROM jobs WHERE primary_id = ?", (primary_id,)).fetchone()
            if not row:
                return self.send_json({"ok": False, "error": "job not found", "primary_id": primary_id}, 404)
            payload = {r["field_key"]: r["field_value"] for r in conn.execute("SELECT field_key, field_value FROM job_payload_fields WHERE primary_id = ? ORDER BY field_key", (primary_id,))}
            item = row_to_dict(row)
            item["payload"] = payload
            self.send_json({"ok": True, "job": item})

    def archive(self, params: Dict[str, List[str]]) -> None:
        limit = min(int(params.get("limit", [50])[0]), 500)
        offset = max(int(params.get("offset", [0])[0]), 0)
        with connect(self.db_path) as conn:
            rows = [row_to_dict(r) for r in conn.execute("SELECT archive_key, primary_id, inv, company, title, bucket, disposition, req_id, location FROM archive_jobs ORDER BY inv LIMIT ? OFFSET ?", (limit, offset))]
            total = conn.execute("SELECT COUNT(*) FROM archive_jobs").fetchone()[0]
            self.send_json({"ok": True, "total": total, "limit": limit, "offset": offset, "rows": rows})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    Handler.db_path = Path(args.db)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Pipeline local store API listening on http://{args.host}:{args.port}")
    print(f"DB: {Handler.db_path}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("stopping")
    finally:
        server.server_close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())


