import { config } from '../config.js';

/**
 * Stub for Google Docs API.
 * When Google OAuth is configured, create a doc from template and fill placeholders.
 * See: https://developers.google.com/docs/api
 */
export async function createCustomerInsightsDoc(feature, insightsContent) {
  if (!config.google.clientId) {
    return {
      ok: true,
      stub: true,
      message: 'Google API not configured',
      preview: { feature: feature?.name, insights: insightsContent?.substring?.(0, 200) },
    };
  }
  // TODO: Use googleapis drive.docs.create + batchUpdate to fill template
  return { ok: true, docId: null, docUrl: null };
}

export async function createCompetitorAnalysisDoc(feature, analysis) {
  if (!config.google.clientId) {
    return {
      ok: true,
      stub: true,
      message: 'Google API not configured',
      preview: { feature: feature?.name, competitors: analysis?.competitors?.length },
    };
  }
  // TODO: Create doc with heading + table: Competitor | Term | How it works
  return { ok: true, docId: null, docUrl: null };
}
