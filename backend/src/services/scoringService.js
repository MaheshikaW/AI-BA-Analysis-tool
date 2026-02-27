import { db } from '../db/db.js';
import { config } from '../config.js';

const tierWeights = config.scoring.tierWeights;

/**
 * Weighted score = sum over (request_count * tier_weight) per feature.
 * Unknown tiers get weight 1.
 */
function getTierWeight(tier) {
  const key = (tier || '').toLowerCase().replace(/\s+/g, '_');
  return tierWeights[key] ?? 1;
}

export function recalculateScore(featureId) {
  const rows = db.prepare(`
    SELECT client_tier, SUM(request_count) AS total
    FROM client_requests
    WHERE feature_id = ?
    GROUP BY client_tier
  `).all(featureId);

  let weightedScore = 0;
  let totalRequests = 0;
  const breakdown = {};

  for (const r of rows) {
    const w = getTierWeight(r.client_tier);
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

  return { weightedScore, totalRequests, breakdown };
}

export function recalculateAllScores() {
  const featureIds = db.prepare('SELECT id FROM features').all().map(r => r.id);
  for (const id of featureIds) recalculateScore(id);
  return featureIds.length;
}
