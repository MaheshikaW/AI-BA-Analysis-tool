const base = '/api';

export async function getFeatures(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${base}/features${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getModules() {
  const res = await fetch(`${base}/features/modules`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getFeature(id) {
  const res = await fetch(`${base}/features/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createFeature(data) {
  const res = await fetch(`${base}/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateFeature(id, data) {
  const res = await fetch(`${base}/features/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteFeature(id) {
  const res = await fetch(`${base}/features/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

export async function addRequest(featureId, data) {
  const res = await fetch(`${base}/features/${featureId}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function recalculateScores() {
  const res = await fetch(`${base}/features/recalculate-scores`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function requestCustomerInsights(featureId) {
  const res = await fetch(`${base}/features/${featureId}/customer-insights`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getCompetitorMapping(featureId) {
  const res = await fetch(`${base}/features/${featureId}/competitor-mapping`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function requestCompetitorAnalysis(featureId) {
  const res = await fetch(`${base}/features/${featureId}/competitor-analysis`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getUseCaseDocument(featureId, competitorAnalysis = null) {
  const res = await fetch(`${base}/features/${featureId}/use-case-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ competitorAnalysis }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
