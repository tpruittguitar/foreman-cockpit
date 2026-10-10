#!/usr/bin/env python3
"""Publish SQLite-generated export snapshots into a synced Google Drive folder.

Safety:
- never overwrites canonical runtime files;
- copies only files produced by export_snapshots.py;
- verifies SHA-256 after copy;
- publishes into a dedicated SQLite_Exports folder by default.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

DEFAULT_SOURCE = Path("data/exports")
DEFAULT_DEST = Path(r"C:\Users\Tim\My Drive\AI_Coordination\SQLite_Exports")

PREFIXES = (
    "V2_CURRENT_POPULATION_MASTER__SQLITE_EXPORT_",
    "V2_TERMINAL_ARCHIVE__SQLITE_EXPORT_",
    "V2_EVIDENCE_COMPANION__SQLITE_EXPORT_",
)

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def eligible(path: Path) -> bool:
    return path.is_file() and any(path.name.startswith(p) for p in PREFIXES)

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=str(DEFAULT_SOURCE))
    parser.add_argument("--dest", default=str(DEFAULT_DEST))
    parser.add_argument("--latest-only", action="store_true", default=True)
    args = parser.parse_args()

    source = Path(args.source)
    dest = Path(args.dest)
    if not source.exists():
        raise SystemExit(f"source folder not found: {source}")
    dest.mkdir(parents=True, exist_ok=True)

    candidates = [p for p in source.iterdir() if eligible(p)]
    if not candidates:
        raise SystemExit("no SQLite export snapshots found")

    selected = []
    for prefix in PREFIXES:
        matches = sorted((p for p in candidates if p.name.startswith(prefix)), key=lambda p: p.stat().st_mtime, reverse=True)
        if matches:
            selected.append(matches[0])

    published = []
    for src in selected:
        dst = dest / src.name
        if dst.exists():
            if sha256_file(dst) == sha256_file(src):
                published.append({"file": src.name, "state": "ALREADY_VERIFIED", "sha256": sha256_file(src), "destination": str(dst)})
                continue
            raise SystemExit(f"destination exists with different content; refusing overwrite: {dst}")
        shutil.copy2(src, dst)
        src_hash = sha256_file(src)
        dst_hash = sha256_file(dst)
        if src_hash != dst_hash:
            try:
                dst.unlink()
            except OSError:
                pass
            raise SystemExit(f"checksum mismatch after copy: {src.name}")
        published.append({"file": src.name, "state": "COPIED_VERIFIED", "sha256": src_hash, "destination": str(dst)})

    print(json.dumps({"ok": True, "source": str(source), "destination": str(dest), "published": published}, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
