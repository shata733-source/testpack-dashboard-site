-- Use this only during setup/testing to remove the wrong first sync and rebuild clean IDs/statuses.
-- It keeps the users table.
DELETE FROM bitem_registry;
DELETE FROM bitem_user_edits;
DELETE FROM bitem_audit_log;
DELETE FROM bitem_sync_runs;
DELETE FROM bitem_counters;
