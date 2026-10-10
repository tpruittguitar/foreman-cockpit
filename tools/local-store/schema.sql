-- Local SQLite runtime store for Pipeline Explorer.
-- Personal/local-first replacement for Google Drive/App Script runtime reads.

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  primary_id TEXT PRIMARY KEY,
  inv INTEGER,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  bucket TEXT NOT NULL,
  disposition TEXT,
  date_added TEXT,
  req_id TEXT,
  location TEXT,
  payload_text TEXT,
  source_line TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_payload_fields (
  primary_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_value TEXT NOT NULL,
  PRIMARY KEY (primary_id, field_key),
  FOREIGN KEY (primary_id) REFERENCES jobs(primary_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS archive_jobs (
  archive_key TEXT PRIMARY KEY,
  primary_id TEXT NOT NULL,
  inv INTEGER,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  bucket TEXT NOT NULL,
  disposition TEXT,
  req_id TEXT,
  location TEXT,
  payload_text TEXT,
  source_line TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evidence_records (
  evidence_id TEXT PRIMARY KEY,
  primary_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  field_key TEXT,
  field_value TEXT,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS operations (
  operation_id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL,
  state TEXT NOT NULL,
  owner TEXT,
  summary TEXT,
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS writer_transactions (
  request_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  state TEXT NOT NULL,
  target_primary_id TEXT,
  receipt_ref TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_bucket ON jobs(bucket);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_title ON jobs(title);
CREATE INDEX IF NOT EXISTS idx_jobs_req ON jobs(req_id);
CREATE INDEX IF NOT EXISTS idx_payload_key ON job_payload_fields(field_key);
CREATE INDEX IF NOT EXISTS idx_archive_primary ON archive_jobs(primary_id);
CREATE INDEX IF NOT EXISTS idx_operations_state ON operations(state);
