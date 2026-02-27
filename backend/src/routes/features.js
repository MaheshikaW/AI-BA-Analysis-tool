import { Router } from 'express';
import * as openaiService from '../services/openaiService.js';
import * as googleDocsService from '../services/googleDocsService.js';
import { fetchSheetRows, rowsToFeatureList } from '../services/sheetSyncService.js';

const router = Router();

/** Get feature list from sheet (sheet = database). */
async function getSheetFeatures() {
  const rows = await fetchSheetRows();
  return rowsToFeatureList(rows);
}

router.get('/', async (req, res) => {
  try {
    let list = await getSheetFeatures();
    const moduleFilter = req.query.module;
    const sort = req.query.sort || 'score';
    if (moduleFilter) list = list.filter((f) => f.module === moduleFilter);
    if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sort === 'module') list.sort((a, b) => (a.module || '').localeCompare(b.module || '') || (a.name || '').localeCompare(b.name || ''));
    else list.sort((a, b) => (b.weighted_score || 0) - (a.weighted_score || 0));
    res.json(list);
  } catch (e) {
    console.error('Sheet fetch failed:', e.message);
    res.status(502).json({ error: 'Could not load feature list from Google Sheet. Publish the sheet to web (File > Share > Publish to web).' });
  }
});

router.post('/sync-from-sheet', async (req, res) => {
  try {
    const list = await getSheetFeatures();
    res.json({ ok: true, message: 'Sheet is the database; data is always read from the sheet.', count: list.length });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

router.get('/modules', async (req, res) => {
  try {
    const list = await getSheetFeatures();
    const modules = [...new Set(list.map((f) => f.module).filter(Boolean))].sort();
    res.json(modules);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const list = await getSheetFeatures();
    const id = parseInt(req.params.id, 10);
    const row = list.find((f) => f.id === id);
    if (!row) return res.status(404).json({ error: 'Feature not found' });
    res.json(row);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  res.status(403).json({ error: 'Feature list is read-only. Edit the Google Sheet to add or change features.' });
});

router.patch('/:id', (req, res) => {
  res.status(403).json({ error: 'Feature list is read-only. Edit the Google Sheet to update features.' });
});

router.delete('/:id', (req, res) => {
  res.status(403).json({ error: 'Feature list is read-only. Edit the Google Sheet to remove features.' });
});

router.get('/:id/requests', async (req, res) => {
  try {
    const list = await getSheetFeatures();
    const id = parseInt(req.params.id, 10);
    const row = list.find((f) => f.id === id);
    if (!row) return res.status(404).json({ error: 'Feature not found' });
    const clients = (row.requested_clients || '').split(',').map((s) => s.trim()).filter(Boolean);
    res.json(clients.map((client_name) => ({ client_name, client_tier: 'professional', request_count: 1 })));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.post('/:id/requests', (req, res) => {
  res.status(403).json({ error: 'Edit the Google Sheet to add or change requested clients.' });
});

router.post('/recalculate-scores', (req, res) => {
  res.json({ message: 'Scores are computed from the sheet (number of requested clients per feature).', recalculated: 0 });
});

async function getFeatureById(id) {
  const list = await getSheetFeatures();
  const numId = parseInt(id, 10);
  return list.find((f) => f.id === numId) || null;
}

router.post('/:id/customer-insights', async (req, res) => {
  try {
    const feature = await getFeatureById(req.params.id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });
    const insightsContent = `Feature: ${feature.name}\nModule: ${feature.module}\nRequests: ${feature.total_requests || 0}\n\n(Data from Google Sheet.)`;
    const result = await googleDocsService.createCustomerInsightsDoc(feature, insightsContent);
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.get('/:id/competitor-mapping', async (req, res) => {
  try {
    const feature = await getFeatureById(req.params.id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });
    const result = await openaiService.mapToCompetitorTerms(feature.name, feature.description);
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.post('/:id/competitor-analysis', async (req, res) => {
  try {
    const feature = await getFeatureById(req.params.id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });
    const analysis = await openaiService.generateCompetitorAnalysis(feature.name, feature.description || '');
    const docResult = await googleDocsService.createCompetitorAnalysisDoc(feature, analysis);
    res.json({ analysis, doc: docResult });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/** Build use case document as HTML (for PDF via print). Optional competitor analysis and useCase sections. */
function buildUseCaseDocumentHtml(feature, competitorAnalysis = null, useCase = null) {
  const uc = useCase || {
    objective: 'Allow the organization to benefit from the capability described above.',
    actors: 'HR Admin, relevant employees (depending on feature).',
    preconditions: 'Feature is configured and enabled.',
    basicFlow: ['User performs the main actions supported by this feature.', 'System processes and reflects the outcome.'],
    postconditions: 'Desired outcome is achieved and reflected in the system.',
    acceptanceCriteria: [],
  };
  const competitors = competitorAnalysis?.competitors;
  const hasCompetitors = Array.isArray(competitors) && competitors.length > 0;
  const similarities = competitorAnalysis?.similarities;
  const differences = competitorAnalysis?.differences;
  const hasSimilarities = Array.isArray(similarities) && similarities.length > 0;
  const hasDifferences = Array.isArray(differences) && differences.length > 0;
  const competitorRows = hasCompetitors
    ? competitors
        .map((c) => {
          const helpUrl = c.helpArticleUrl && String(c.helpArticleUrl).startsWith('http') ? c.helpArticleUrl : null;
          const searchQuery = c.helpSearchQuery && String(c.helpSearchQuery).trim() ? c.helpSearchQuery : `${c.name || ''} ${c.term || ''} documentation`.trim();
          const link = helpUrl || `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
          const linkText = (c.helpArticleTitle && String(c.helpArticleTitle).trim()) || (helpUrl ? 'Help article' : 'Search docs');
          const helpCell = `<a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(linkText)}</a>`;
          return `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.term || '—')}</td><td>${escapeHtml(c.howItWorks || '—')}</td><td>${helpCell}</td></tr>`;
        })
        .join('')
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Use case: ${escapeHtml(feature.name)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.5; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #f97316; padding-bottom: 0.5rem; }
    h2 { font-size: 1.15rem; margin-top: 1.5rem; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.9rem; }
    th, td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; text-align: left; }
    a { color: #ea580c; text-decoration: none; }
    a:hover { text-decoration: underline; }
    th { background: #f3f4f6; font-weight: 600; }
    .meta { color: #6b7280; font-size: 0.9rem; margin: 0.5rem 0; }
    .section { margin-bottom: 1.5rem; }
    ul { margin: 0.5rem 0; padding-left: 1.5rem; }
    @media print { body { margin: 1rem; } }
  </style>
</head>
<body>
  <h1>Use case: ${escapeHtml(feature.name)}</h1>
  <div class="meta">Module: ${escapeHtml(feature.module || '—')} | Point of contact: ${escapeHtml(feature.point_of_contact || '—')} | Requested clients: ${escapeHtml(feature.requested_clients || '—')}</div>

  <div class="section">
    <h2>Feature description</h2>
    <p>${escapeHtml(feature.description || '—')}</p>
  </div>

  ${hasCompetitors || hasSimilarities || hasDifferences ? `
  <div class="section">
    <h2>Competitor analysis</h2>
    ${hasSimilarities ? `<p><strong>Similarities</strong> (vs competitors):</p><ul>${similarities.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
    ${hasDifferences ? `<p><strong>Differences</strong> (vs competitors):</p><ul>${differences.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
    ${hasCompetitors ? `<p><strong>Competitor mapping</strong></p><table>
      <thead><tr><th>Competitor</th><th>Term</th><th>How it works</th><th>Help / links</th></tr></thead>
      <tbody>${competitorRows}</tbody>
    </table>` : ''}
  </div>
  ` : ''}

  <div class="section">
    <h2>Use case</h2>
    <p><strong>Objective:</strong> ${escapeHtml(uc.objective)}</p>
    <p><strong>Actors:</strong> ${escapeHtml(uc.actors)}</p>
    <p><strong>Preconditions:</strong> ${escapeHtml(uc.preconditions)}</p>
    <p><strong>Basic flow:</strong></p>
    <ol>${(uc.basicFlow || []).map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    <p><strong>Postconditions:</strong> ${escapeHtml(uc.postconditions)}</p>
    ${(uc.acceptanceCriteria && uc.acceptanceCriteria.length) ? `<p><strong>Acceptance criteria:</strong></p><ul>${uc.acceptanceCriteria.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''}
  </div>

  <p style="margin-top:2rem;color:#9ca3af;font-size:0.85rem;">Generated by OHRM Feature Scoring. Save as PDF via File → Print → Save as PDF.</p>
</body>
</html>`;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

router.post('/:id/use-case-document', async (req, res) => {
  try {
    const feature = await getFeatureById(req.params.id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });
    const competitorAnalysis = req.body?.competitorAnalysis || null;
    const useCaseSections = await openaiService.generateUseCaseSections(
      feature.name || '',
      feature.description || ''
    );
    const html = buildUseCaseDocumentHtml(feature, competitorAnalysis, useCaseSections);
    res.json({ html });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

export default router;
