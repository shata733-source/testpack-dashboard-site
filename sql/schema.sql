-- B Item Tracking System schema for Cloudflare D1
-- Run once: wrangler d1 execute <DB_NAME> --file=sql/schema.sql --remote

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  password_plain TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bitem_counters (
  counter_key TEXT PRIMARY KEY,
  contractor TEXT,
  tp_no TEXT,
  next_no INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS bitem_registry (
  fingerprint TEXT PRIMARY KEY,
  bitem_id TEXT UNIQUE NOT NULL,
  contractor TEXT,
  tp_no TEXT,
  construction_stage TEXT,
  punch_category TEXT,
  comment_text TEXT,
  material_type TEXT,
  iso_or_spool TEXT,
  area TEXT,

  query_status TEXT DEFAULT 'OPEN',
  query_cleared_date TEXT,

  final_status TEXT DEFAULT 'OPEN',
  final_cleared_date TEXT,
  user_cleared_date TEXT,

  last_edited_by TEXT,
  last_edited_at TEXT,

  source_flag TEXT,
  sync_note TEXT,
  active INTEGER NOT NULL DEFAULT 1,

  first_seen_at TEXT,
  last_seen_at TEXT,
  last_sync_id TEXT,
  row_json TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_bitem_registry_bitem_id ON bitem_registry(bitem_id);
CREATE INDEX IF NOT EXISTS idx_bitem_registry_tp ON bitem_registry(tp_no);
CREATE INDEX IF NOT EXISTS idx_bitem_registry_active ON bitem_registry(active);
CREATE INDEX IF NOT EXISTS idx_bitem_registry_flag ON bitem_registry(source_flag);
CREATE INDEX IF NOT EXISTS idx_bitem_registry_status ON bitem_registry(final_status);

CREATE TABLE IF NOT EXISTS bitem_user_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bitem_id TEXT,
  fingerprint TEXT,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  edited_by TEXT,
  edited_by_name TEXT,
  remarks TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bitem_user_edits_bitem ON bitem_user_edits(bitem_id);
CREATE INDEX IF NOT EXISTS idx_bitem_user_edits_created ON bitem_user_edits(created_at);

CREATE TABLE IF NOT EXISTS bitem_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  bitem_id TEXT,
  fingerprint TEXT,
  username TEXT,
  display_name TEXT,
  role TEXT,
  ip TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bitem_audit_created ON bitem_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_bitem_audit_action ON bitem_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_bitem_audit_bitem ON bitem_audit_log(bitem_id);

CREATE TABLE IF NOT EXISTS bitem_sync_runs (
  sync_id TEXT PRIMARY KEY,
  started_by TEXT,
  started_at TEXT,
  finished_at TEXT,
  total_input_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  inserted_rows INTEGER DEFAULT 0,
  updated_rows INTEGER DEFAULT 0,
  removed_rows INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  status TEXT
);

-- Optional sample users; change passwords after setup.
INSERT OR IGNORE INTO users(username, display_name, role, password_plain, is_active)
VALUES
  ('admin', 'Mohamed Shata', 'admin', 'admin2026', 1),
  ('ccc_user', 'CCC User', 'user', 'ccc2026', 1);
