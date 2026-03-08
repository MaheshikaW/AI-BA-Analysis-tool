import Database from 'better-sqlite3';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';

const dir = path.dirname(config.dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(config.dbPath);

// Ensure client_name column exists (migration for existing DBs)
try {
  const info = db.prepare("PRAGMA table_info(client_requests)").all();
  const hasClientName = info.some((col) => col.name === 'client_name');
  if (!hasClientName) {
    db.prepare('ALTER TABLE client_requests ADD COLUMN client_name TEXT').run();
  }
} catch (_) {}

// Ensure verdicts table exists (persist verdicts across restarts)
db.exec(`
  CREATE TABLE IF NOT EXISTS verdicts (
    feature_id INTEGER PRIMARY KEY,
    verdict TEXT NOT NULL,
    problem_real TEXT,
    well_understood TEXT,
    right_time TEXT,
    next_steps TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);
