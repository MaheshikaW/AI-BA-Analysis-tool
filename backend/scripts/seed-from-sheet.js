/**
 * Seed features and requested clients from the AI Feature Priority Dashboard sheet.
 * Data source: https://docs.google.com/spreadsheets/d/1y5PNfslFtC8sanhWKTnapd6SqbddF2qzckBA_rDnTdc/edit?gid=1660060315
 *
 * Run: node scripts/seed-from-sheet.js
 * (from backend folder, or: node scripts/seed-from-sheet.js from repo root)
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(__dirname, '..');
const dbPath = path.join(backendDir, 'data', 'ai-ideas.db');
const seedPath = path.join(backendDir, 'src', 'data', 'seed-from-sheet.json');

const db = new Database(dbPath);
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const insertFeature = db.prepare(`
  INSERT OR IGNORE INTO features (module, name, description, point_of_contact)
  VALUES (?, ?, ?, ?)
`);
const getFeatureId = db.prepare(`
  SELECT id FROM features WHERE module = ? AND name = ?
`);
const insertRequest = db.prepare(`
  INSERT INTO client_requests (feature_id, client_tier, request_count, client_name)
  VALUES (?, ?, 1, ?)
`);

function recalculateScore(featureId) {
  const rows = db.prepare(`
    SELECT client_tier, SUM(request_count) AS total FROM client_requests WHERE feature_id = ? GROUP BY client_tier
  `).all(featureId);
  const tierWeights = { enterprise: 3, professional: 2, starter: 1 };
  let weightedScore = 0;
  let totalRequests = 0;
  const breakdown = {};
  for (const r of rows) {
    const w = tierWeights[r.client_tier] ?? 1;
    weightedScore += Number(r.total) * w;
    totalRequests += Number(r.total);
    breakdown[r.client_tier] = { requests: r.total, weight: w };
  }
  db.prepare(`
    INSERT INTO scores (feature_id, weighted_score, total_requests, tier_breakdown, calculated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(feature_id) DO UPDATE SET
      weighted_score = excluded.weighted_score,
      total_requests = excluded.total_requests,
      tier_breakdown = excluded.tier_breakdown,
      calculated_at = excluded.calculated_at
  `).run(featureId, weightedScore, totalRequests, JSON.stringify(breakdown));
}

let added = 0;
let skipped = 0;

for (const row of seed) {
  const { module, name, description, point_of_contact, requested_clients } = row;
  insertFeature.run(module, name, description || null, point_of_contact || null);
  const r = getFeatureId.get(module, name);
  if (!r) {
    skipped++;
    continue;
  }
  const featureId = r.id;
  const existing = db.prepare('SELECT 1 FROM client_requests WHERE feature_id = ?').get(featureId);
  if (existing) {
    skipped++;
    continue;
  }
  const clients = Array.isArray(requested_clients) ? requested_clients : [];
  for (const client of clients) {
    const trimmed = String(client).trim();
    if (trimmed) insertRequest.run(featureId, 'professional', trimmed);
  }
  recalculateScore(featureId);
  added++;
}

db.close();
console.log(`Seed complete: ${added} features with requested clients added, ${skipped} skipped (already present).`);
console.log('Data from: AI Feature Priority Dashboard / Sample Feature List');
