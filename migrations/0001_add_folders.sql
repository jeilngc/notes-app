-- Run this once if your database was created before folders existed.
-- Safe to run against a fresh database too (folders table already exists
-- via schema.sql, but CREATE TABLE IF NOT EXISTS makes this a no-op then).
--
-- Local:  wrangler d1 execute notes-db --local  --file=./migrations/0001_add_folders.sql
-- Remote: wrangler d1 execute notes-db --remote --file=./migrations/0001_add_folders.sql

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes (folder_id);
