import { config } from '../config.js';

/**
 * Stub for Product Board API.
 * Replace with real calls to https://developer.productboard.com/reference/introduction
 * when PRODUCT_BOARD_API_KEY is set.
 */
export async function fetchFeatureRequests() {
  if (!config.productBoard.apiKey) {
    return { ok: false, stub: true, message: 'Product Board API key not configured' };
  }
  // TODO: GET /features, /notes, etc. and map to feature request counts
  const response = await fetch(`${config.productBoard.baseUrl}/v1/features`, {
    headers: { Authorization: `Bearer ${config.productBoard.apiKey}` },
  });
  if (!response.ok) return { ok: false, status: response.status };
  const data = await response.json();
  return { ok: true, data };
}

export async function syncRequestCountsToDb(featureNameToIdMap) {
  const result = await fetchFeatureRequests();
  if (!result.ok || result.stub) return result;
  // Map Product Board features to our feature IDs and upsert client_requests
  return { ok: true, synced: 0 };
}
