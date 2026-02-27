import Database from 'better-sqlite3';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';

const dir = path.dirname(config.dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(config.dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    point_of_contact TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(module, name)
  );

  CREATE TABLE IF NOT EXISTS client_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_id INTEGER NOT NULL REFERENCES features(id),
    client_tier TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    client_name TEXT,
    source TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_id INTEGER NOT NULL REFERENCES features(id) UNIQUE,
    weighted_score REAL NOT NULL,
    total_requests INTEGER NOT NULL DEFAULT 0,
    tier_breakdown TEXT,
    calculated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (feature_id) REFERENCES features(id)
  );

  CREATE INDEX IF NOT EXISTS idx_client_requests_feature ON client_requests(feature_id);
  CREATE INDEX IF NOT EXISTS idx_scores_feature ON scores(feature_id);
`);

try {
  db.prepare('ALTER TABLE client_requests ADD COLUMN client_name TEXT').run();
} catch (e) {
  if (!e.message?.includes('duplicate column')) throw e;
}

console.log('Database initialized at', config.dbPath);
db.close();
