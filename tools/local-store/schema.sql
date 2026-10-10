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

-- Phase 2 final structured storage design.
-- These tables are additive and keep the existing prototype importer/API compatible.

CREATE TABLE IF NOT EXISTS source_files (
  source_id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  path_or_drive_id TEXT NOT NULL,
  source_hash TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  row_count INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS job_versions (
  version_id TEXT PRIMARY KEY,
  primary_id TEXT NOT NULL,
  source_id TEXT,
  source_hash TEXT NOT NULL,
  bucket TEXT,
  disposition TEXT,
  source_line TEXT NOT NULL,
  payload_json TEXT,
  observed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (primary_id) REFERENCES jobs(primary_id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES source_files(source_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS evidence_chains (
  evidence_ref TEXT PRIMARY KEY,
  primary_id TEXT NOT NULL,
  head_version INTEGER NOT NULL,
  resolved_json TEXT NOT NULL,
  unresolved INTEGER NOT NULL DEFAULT 0,
  observed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_runs (
  run_id TEXT PRIMARY KEY,
  lane TEXT NOT NULL,
  provider TEXT,
  owner TEXT,
  intended_scope_json TEXT,
  completed_scope_json TEXT,
  skipped_scope_json TEXT,
  carry_forward_json TEXT,
  state TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  observed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_run_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_json TEXT,
  event_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES automation_runs(run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS operation_obligations (
  obligation_id TEXT PRIMARY KEY,
  run_id TEXT,
  stage TEXT,
  state TEXT NOT NULL,
  owner TEXT,
  source_json TEXT,
  outcome TEXT,
  next_action TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (run_id) REFERENCES automation_runs(run_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS scoring_model_versions (
  model_id TEXT PRIMARY KEY,
  version_label TEXT NOT NULL,
  status TEXT NOT NULL,
  model_json TEXT NOT NULL,
  source_ref TEXT,
  effective_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rule_versions (
  rule_set_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  rules_text TEXT NOT NULL,
  rules_hash TEXT NOT NULL,
  source_ref TEXT,
  effective_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runtime_read_status (
  read_name TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  detail TEXT,
  row_count INTEGER,
  last_ok_at TEXT,
  last_checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS export_snapshots (
  export_id TEXT PRIMARY KEY,
  export_kind TEXT NOT NULL,
  destination TEXT,
  source_query TEXT,
  source_hash TEXT,
  row_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_job_versions_primary ON job_versions(primary_id);
CREATE INDEX IF NOT EXISTS idx_evidence_chains_primary ON evidence_chains(primary_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_lane ON automation_runs(lane);
CREATE INDEX IF NOT EXISTS idx_automation_runs_state ON automation_runs(state);
CREATE INDEX IF NOT EXISTS idx_obligations_state ON operation_obligations(state);
CREATE INDEX IF NOT EXISTS idx_writer_transactions_target ON writer_transactions(target_primary_id);
CREATE INDEX IF NOT EXISTS idx_scoring_status ON scoring_model_versions(status);
CREATE INDEX IF NOT EXISTS idx_rule_status ON rule_versions(status);

