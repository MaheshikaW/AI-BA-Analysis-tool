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

/** Fetch Customer Insights as HTML (for Print → Save as PDF). */
export async function getCustomerInsightsHtml(featureId) {
  const res = await fetch(`/api/features/${featureId}/customer-insights-html`);
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

export async function getCompetitorMapping(featureId) {
  const res = await fetch(`${base}/features/${featureId}/competitor-mapping`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GET competitor analysis (load page). Returns { analysis }. */
export async function getCompetitorAnalysis(featureId, refresh = false) {
  const url = `${base}/features/${featureId}/competitor-analysis${refresh ? '?refresh=1' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST chat about competitor analysis. Body: { message }. Returns { reply }. */
export async function competitorChat(featureId, message) {
  const res = await fetch(`${base}/features/${featureId}/competitor-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** POST competitor analysis (generate + create Google Doc). Returns { analysis, doc }. */
export async function requestCompetitorAnalysis(featureId) {
  const res = await fetch(`${base}/features/${featureId}/competitor-analysis`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getFeatureInsights(featureId, refresh = false) {
  const url = `${base}/features/${featureId}/insights${refresh ? '?refresh=1' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Get client insights by context (feature name + description). No feature ID needed. */
export async function getInsightsByContext({ name, description = '' }, refresh = false) {
  const res = await fetch(`${base}/features/insights-by-context${refresh ? '?refresh=1' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name || '', description: description || '', refresh }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getUseCase(featureId) {
  const res = await fetch(`${base}/features/${featureId}/use-case`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getFeatureVerdict(featureId, refresh = false) {
  const url = `${base}/features/${featureId}/verdict${refresh ? '?refresh=1' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getMockUI(featureId) {
  const res = await fetch(`${base}/features/${featureId}/mock-ui`);
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

export async function exportAllUseCases() {
  const res = await fetch(`${base}/features/export-all-use-cases`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportAllCompetitorAnalysis() {
  const res = await fetch(`${base}/features/export-all-competitor-analysis`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
