import { Router } from 'express';
import { config } from '../config.js';
import * as openaiService from '../services/openaiService.js';
import * as googleDocsService from '../services/googleDocsService.js';
import { fetchSheetRows, fetchInsightsRows, fetchScoringInfo, rowsToFeatureList, SHEET_FETCH_HEADERS, getServiceAccountEmail } from '../services/sheetSyncService.js';

/** Cache AI-matched insight names by feature id to avoid repeated OpenAI calls. */
const insightsAiMatchCache = new Map();

const router = Router();

/** In-memory cache for competitor analysis by feature id. Use ?refresh=1 to force recompute. */
const competitorAnalysisCache = new Map();

/** Get feature list from sheet (sheet = database). */
async function getSheetFeatures() {
  const rows = await fetchSheetRows();
  const clientScoreMap = await fetchScoringInfo();
  return rowsToFeatureList(rows, clientScoreMap);
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

/** GET quick test: can we read the insights sheet? */
router.get('/insights-test', async (req, res) => {
  try {
    const rows = await fetchInsightsRows(true);
    const payload = { ok: true, rowCount: rows.length };
    if (rows.length > 0) {
      payload.featureNames = [...new Set(rows.map((r) => r.feature).filter(Boolean))].slice(0, 10);
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET debug: try each insights CSV URL and report what we get (isHtml, firstLine, length). */
router.get('/insights-fetch-debug', async (req, res) => {
  const urlsToTry = [
    config.sheet.insightsExportUrlCanonical,
    ...(config.sheet.insightsPublishCsvUrl ? [config.sheet.insightsPublishCsvUrl] : []),
    config.sheet.insightsExportUrl,
  ].filter(Boolean);
  const results = [];
  for (const url of urlsToTry) {
    try {
      const r = await fetch(url, { headers: SHEET_FETCH_HEADERS });
      const text = await r.text();
      const isHtml = text.trimStart().startsWith('<');
      const firstLine = text.split(/\r?\n/)[0] || '';
      results.push({
        url: url.replace(/2PACX-[^/]+/, '2PACX-...'),
        status: r.status,
        length: text.length,
        isHtml,
        firstLine: firstLine.slice(0, 120),
      });
    } catch (e) {
      const errDetail = e.cause?.message || e.cause?.code || e.message;
      results.push({
        url: url.replace(/2PACX-[^/]+/, '2PACX-...'),
        error: e.message,
        detail: errDetail !== e.message ? errDetail : undefined,
        hint: e.message === 'fetch failed' ? 'Server may have no outbound access to Google (firewall/proxy). Try running backend where the feature list loads from the sheet, or set HTTP_PROXY/HTTPS_PROXY if behind a proxy.' : undefined,
      });
    }
  }
  res.json({ sheetId: config.sheet.id, insightsGid: config.sheet.insightsGid, results });
});

/** GET insights sheet diagnostic: raw fetch result so you can see why sheetRowCount is 0. Must be before /:id. */
router.get('/insights-diagnostic', async (req, res) => {
  const url = config.sheet.insightsExportUrl;
  try {
    const r = await fetch(url, { headers: SHEET_FETCH_HEADERS });
    const text = await r.text();
    const preview = text.slice(0, 1200);
    const isHtml = text.trimStart().startsWith('<');
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const firstLine = lines[0] || null;
    res.json({
      url,
      sheetId: config.sheet.id,
      insightsGid: config.sheet.insightsGid,
      httpStatus: r.status,
      ok: r.ok,
      contentType: r.headers.get('content-type'),
      responseLength: text.length,
      lineCount: lines.length,
      responsePreview: preview,
      firstLine,
      isHtml,
      hint: isHtml
        ? 'Sheet is not published to web. In Google Sheets: File > Share > Publish to web → choose "Entire document" or "Sample Client Insights" → Publish. Then the export URL returns CSV and insights will load.'
        : lines.length <= 1
          ? 'CSV has 0 or 1 line (header only). Add data rows to the Sample Client Insights tab, or check the GID matches that tab (see tab URL: ...#gid=NNN).'
          : null,
    });
  } catch (e) {
    res.json({
      url,
      sheetId: config.sheet.id,
      insightsGid: config.sheet.insightsGid,
      error: e.message,
      hint: 'Network or config error. Check GOOGLE_SHEET_ID and GOOGLE_SHEET_INSIGHTS_GID.',
    });
  }
});

/** GET export all use cases as one HTML (for Print to PDF). Must be before /:id. */
router.get('/export-all-use-cases', async (req, res) => {
  try {
    const list = await getSheetFeatures();
    const useCaseCache = new Map();
    const bodyParts = [];
    for (const feature of list) {
      let useCase = useCaseCache.get(String(feature.id));
      if (!useCase) {
        useCase = await openaiService.generateUseCaseSections(
          feature.name || '',
          feature.description || ''
        );
        useCaseCache.set(String(feature.id), useCase);
      }
      const fullHtml = buildUseCaseDocumentHtml(feature, null, useCase);
      const match = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      bodyParts.push(match ? match[1].trim() : fullHtml);
    }
    const combined = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>All use cases – Feature scoring</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.5; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #f97316; padding-bottom: 0.5rem; }
    h2 { font-size: 1.15rem; margin-top: 1.5rem; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.9rem; }
    th, td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; text-align: left; }
    a { color: #ea580c; }
    .section { margin-bottom: 1.5rem; }
    ul, ol { margin: 0.5rem 0; padding-left: 1.5rem; }
  </style>
</head>
<body>
${bodyParts.map((part) => `<div class="page">${part}</div>`).join('\n')}
<p style="margin-top:2rem;color:#9ca3af;font-size:0.85rem;">Generated by OHRM Feature Scoring. Save as PDF via File → Print → Save as PDF.</p>
</body>
</html>`;
    res.json({ html: combined });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/** GET export all competitor analyses (feature-wise) as one HTML for PDF. Must be before /:id. */
router.get('/export-all-competitor-analysis', async (req, res) => {
  try {
    const list = await getSheetFeatures();
    const bodyParts = [];
    for (const feature of list) {
      let analysis = competitorAnalysisCache.get(String(feature.id));
      if (!analysis) {
        analysis = await openaiService.generateCompetitorAnalysis(
          feature.name || '',
          feature.description || ''
        );
        competitorAnalysisCache.set(String(feature.id), analysis);
      }
      bodyParts.push(buildCompetitorAnalysisSectionHtml(feature, analysis));
    }
    const combined = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>All competitor analyses – Feature scoring</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.5; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #f97316; padding-bottom: 0.5rem; }
    h2 { font-size: 1.15rem; margin-top: 1rem; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.9rem; }
    th, td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; text-align: left; }
    a { color: #ea580c; }
    ul { margin: 0.5rem 0; padding-left: 1.5rem; }
  </style>
</head>
<body>
${bodyParts.map((part) => `<div class="page">${part}</div>`).join('\n')}
<p style="margin-top:2rem;color:#9ca3af;font-size:0.85rem;">Generated by OHRM Feature Scoring. Save as PDF via File → Print → Save as PDF.</p>
</body>
</html>`;
    res.json({ html: combined });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

async function getFeatureById(id) {
  const list = await getSheetFeatures();
  const numId = parseInt(id, 10);
  return list.find((f) => f.id === numId) || null;
}

/** Find a feature by name (normalized match). Returns first match if multiple. */
async function getFeatureByName(name) {
  if (!name || typeof name !== 'string') return null;
  const decoded = decodeURIComponent(String(name).trim());
  if (!decoded) return null;
  const list = await getSheetFeatures();
  const norm = normalizeFeatureName(decoded);
  return list.find((f) => normalizeFeatureName(f.name) === norm) || null;
}

/** GET mock UI spec (config, list, widgets) for a feature. Generated by OpenAI. Cached. Must be before GET /:id. */
const mockUICache = new Map();
router.get('/:id/mock-ui', async (req, res) => {
  try {
    const id = req.params.id;
    const forceRefresh = req.query.refresh === '1';
    const feature = await getFeatureById(id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });
    let spec = !forceRefresh ? mockUICache.get(String(id)) : undefined;
    if (!spec) {
      spec = await openaiService.generateMockUISpec(
        feature.name || '',
        feature.description || '',
        feature.module || ''
      );
      mockUICache.set(String(id), spec);
    }
    res.json(spec);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/** Normalize feature name for matching: strip quotes, trim, lowercase, collapse whitespace, unify dashes/slashes and common variants. */
function normalizeFeatureName(s) {
  let raw = (s || '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/[\u2013\u2014\u2212\u2010\u2011]/g, '-')
    .replace(/[/\u2044]+/g, ' / ')
    .replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(';')[0]
    .trim();
  raw = raw.toLowerCase();
  // Canonicalize so "Leave Black Out periods" matches "Leave Blackout Period"
  raw = raw.replace(/\bblack\s+out\b/g, 'blackout');
  raw = raw.replace(/\bperiods\b/g, 'period');
  return raw;
}

/** True if a contains b or b contains a (both normalized), or all significant words of shorter appear in longer in order. */
function namesMatch(nameA, nameB) {
  const a = normalizeFeatureName(nameA);
  const b = normalizeFeatureName(nameB);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const wordsA = a.split(/\s+/).filter((w) => w.length > 1);
  const wordsB = b.split(/\s+/).filter((w) => w.length > 1);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longer = wordsA.length <= wordsB.length ? wordsB.join(' ') : wordsA.join(' ');
  const allWordsInLonger = shorter.every((w) => longer.includes(w));
  if (allWordsInLonger && shorter.length >= 2) return true;
  return false;
}

/** Core string for fuzzy match: letters, digits, single spaces only (strip punctuation, &, etc.). */
function featureNameCore(s) {
  return (normalizeFeatureName(s) || '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Get insights rows that match this feature by name (same name in both sheets). Lenient: exact normalized, then contains either way. */
function filterInsightsByFeature(allRows, featureName) {
  const norm = normalizeFeatureName(featureName);
  const core = featureNameCore(featureName);
  if (!norm && !core) return [];

  // 1) Exact normalized match (same feature name in both sheets)
  const exact = allRows.filter((r) => normalizeFeatureName(r.feature) === norm);
  if (exact.length > 0) return exact;

  // 2) One contains the other (handles small wording differences)
  const byContains = allRows.filter((r) => {
    const sheetNorm = normalizeFeatureName(r.feature);
    if (!sheetNorm) return false;
    return sheetNorm === norm || sheetNorm.includes(norm) || norm.includes(sheetNorm);
  });
  if (byContains.length > 0) return byContains;

  // 3) Core (letters/numbers only) overlap
  const byCore = allRows.filter((r) => {
    const sheetCore = featureNameCore(r.feature);
    if (!core || !sheetCore) return false;
    return sheetCore === core || sheetCore.includes(core) || core.includes(sheetCore);
  });
  if (byCore.length > 0) return byCore;

  // 4) Word overlap (e.g. "Leave Blackout Period" vs "Leave Blackout")
  const byWordMatch = allRows.filter((r) => namesMatch(featureName, r.feature));
  if (byWordMatch.length > 0) return byWordMatch;

  return [];
}

/** Get insights for a feature: name match only (fast). Optionally use AI when useAi is true (slow). */
async function getInsightsForFeature(feature, allRows, opts = {}) {
  const useAi = opts.useAi === true;
  let matched = filterInsightsByFeature(allRows, feature.name);
  if (matched.length === 0 && useAi && allRows.length > 0 && feature.name) {
    const cacheKey = `${feature.id}:${(feature.name || '').trim().toLowerCase()}`;
    let aiMatchedIndices = insightsAiMatchCache.get(cacheKey);
    if (aiMatchedIndices === undefined) {
      try {
        const byMeaning = await openaiService.matchInsightsByMeaning(
          feature.name || '',
          feature.description || '',
          allRows
        );
        if (byMeaning.length > 0) {
          aiMatchedIndices = byMeaning;
        } else {
          const sheetNames = [...new Set(allRows.map((r) => r.feature).filter(Boolean))];
          const byLabelNames = await openaiService.matchInsightsToFeature(
            feature.name || '',
            feature.description || '',
            sheetNames
          );
          const labelSet = new Set(byLabelNames.map((n) => normalizeFeatureName(n)));
          aiMatchedIndices =
            byLabelNames.length > 0
              ? allRows
                  .map((r, i) => (r.feature && labelSet.has(normalizeFeatureName(r.feature)) ? i : -1))
                  .filter((i) => i >= 0)
              : [];
        }
        if (Array.isArray(aiMatchedIndices) && aiMatchedIndices.length > 0) {
          insightsAiMatchCache.set(cacheKey, aiMatchedIndices);
        }
      } catch (e) {
        console.warn('[insights] AI match failed:', e.message);
      }
    }
    if (Array.isArray(aiMatchedIndices) && aiMatchedIndices.length > 0) {
      const indexSet = new Set(aiMatchedIndices);
      matched = allRows.filter((_, i) => indexSet.has(i));
    }
  }
  return matched;
}

/** GET client insights by feature name. Same response as GET /:id/insights. Must be before /:id/insights. */
router.get('/by-name/:name/insights', async (req, res) => {
  try {
    const feature = await getFeatureByName(req.params.name);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });
    const doRefresh = req.query.refresh === '1';
    if (doRefresh) {
      const cacheKey = `${feature.id}:${(feature.name || '').trim().toLowerCase()}`;
      insightsAiMatchCache.delete(cacheKey);
    }
    const allRows = await fetchInsightsRows(doRefresh);
    const textMatched = filterInsightsByFeature(allRows, feature.name);
    const matched = await getInsightsForFeature(feature, allRows, { useAi: req.query.ai === '1' });
    const insights = matched.map(({ client, insight }) => ({ client: client || '', insight: insight || '' }));
    const payload = { insights };
    if (insights.length === 0) {
      payload._meta = { sheetRowCount: allRows.length };
      if (allRows.length > 0) {
        const sampleNames = [...new Set(allRows.map((r) => r.feature).filter(Boolean))].slice(0, 5);
        console.warn('[insights] No match for feature:', feature.name, '| sheet rows:', allRows.length, '| sample sheet names:', sampleNames);
      } else {
        console.warn('[insights] No match for feature:', feature.name, '| insights sheet has 0 rows (check GID / publish to web)');
      }
    }
    if (req.query.debug === '1') {
      const sheetFeatureNames = [...new Set(allRows.map((r) => r.feature).filter(Boolean))];
      payload.debug = {
        dashboardFeatureName: feature.name,
        normalized: normalizeFeatureName(feature.name),
        sheetFeatureNames: sheetFeatureNames.slice(0, 30),
        sheetRowCount: allRows.length,
        textMatchCount: textMatched.length,
        matchedCount: matched.length,
      };
    }
    res.json(payload);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/** GET client insights from sheet (Sample Client Insights tab). Match by feature name only (fast). ?ai=1 enables AI fallback (slow). ?refresh=1 refetches sheet. Must be before GET /:id. */
router.get('/:id/insights', async (req, res) => {
  try {
    const feature = await getFeatureById(req.params.id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });
    const doRefresh = req.query.refresh === '1';
    if (doRefresh) {
      const cacheKey = `${feature.id}:${(feature.name || '').trim().toLowerCase()}`;
      insightsAiMatchCache.delete(cacheKey);
    }
    const allRows = await fetchInsightsRows(doRefresh);
    const textMatched = filterInsightsByFeature(allRows, feature.name);
    const matched = await getInsightsForFeature(feature, allRows, { useAi: req.query.ai === '1' });
    const insights = matched.map(({ client, insight }) => ({ client: client || '', insight: insight || '' }));
    const payload = { insights };
    if (insights.length === 0) {
      payload._meta = { sheetRowCount: allRows.length };
      if (allRows.length > 0) {
        const sampleNames = [...new Set(allRows.map((r) => r.feature).filter(Boolean))].slice(0, 5);
        console.warn('[insights] No match for feature:', feature.name, '| sheet rows:', allRows.length, '| sample sheet names:', sampleNames);
      } else {
        console.warn('[insights] No match for feature:', feature.name, '| insights sheet has 0 rows (check GID / publish to web)');
      }
    }
    if (req.query.debug === '1') {
      const sheetFeatureNames = [...new Set(allRows.map((r) => r.feature).filter(Boolean))];
      payload.debug = {
        dashboardFeatureName: feature.name,
        normalized: normalizeFeatureName(feature.name),
        sheetFeatureNames: sheetFeatureNames.slice(0, 30),
        sheetRowCount: allRows.length,
        textMatchCount: textMatched.length,
        matchedCount: matched.length,
      };
    }
    res.json(payload);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/** GET Customer Insights as printable HTML (open in new tab → Print → Save as PDF). ?refresh=1 refetches sheet. Must be before GET /:id. */
router.get('/:id/customer-insights-html', async (req, res) => {
  try {
    const feature = await getFeatureById(req.params.id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });
    const allRows = await fetchInsightsRows(req.query.refresh === '1');
    const matched = await getInsightsForFeature(feature, allRows);
    const insights = matched.map(({ client, insight }) => ({ client: client || '', insight: insight || '' }));
    const html = buildCustomerInsightsHtml(feature, insights);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(502).send(`<p>Error: ${escapeHtml(e.message)}</p>`);
  }
});

/** GET use case sections (JSON) for a feature. Cached in memory. Must be before GET /:id. */
const useCaseCache = new Map();
router.get('/:id/use-case', async (req, res) => {
  try {
    const id = req.params.id;
    const forceRefresh = req.query.refresh === '1';
    const feature = await getFeatureById(id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });
    let useCase = !forceRefresh ? useCaseCache.get(String(id)) : undefined;
    if (!useCase) {
      useCase = await openaiService.generateUseCaseSections(
        feature.name || '',
        feature.description || ''
      );
      useCaseCache.set(String(id), useCase);
    }
    res.json({ useCase });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/** GET verdict for a feature (Are We Solving The Right Problem?). Cached. ?refresh=1 to regenerate. */
const verdictCache = new Map();
router.get('/:id/verdict', async (req, res) => {
  try {
    const id = req.params.id;
    const forceRefresh = req.query.refresh === '1';
    const feature = await getFeatureById(id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });
    if (!forceRefresh && verdictCache.has(String(id))) {
      return res.json(verdictCache.get(String(id)));
    }
    const verdict = await openaiService.generateVerdict(
      feature.name || '',
      feature.description || ''
    );
    verdictCache.set(String(id), verdict);
    res.json(verdict);
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

/** GET competitor analysis (from cache or generate). Use this to load the page; POST is for creating the Google Doc. */
router.get('/:id/competitor-analysis', async (req, res) => {
  try {
    const id = req.params.id;
    const forceRefresh = req.query.refresh === '1';
    const feature = await getFeatureById(id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });

    let analysis = !forceRefresh ? competitorAnalysisCache.get(String(id)) : undefined;
    if (!analysis) {
      try {
        analysis = await openaiService.generateCompetitorAnalysis(feature.name, feature.description || '');
        competitorAnalysisCache.set(String(id), analysis);
      } catch (e) {
        console.warn('generateCompetitorAnalysis failed:', e.message);
        analysis = { stub: true, error: e.message, competitors: [], similarities: [], differences: [] };
      }
    }
    res.json({ analysis });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.post('/:id/competitor-analysis', async (req, res) => {
  try {
    const id = req.params.id;
    const forceRefresh = req.query.refresh === '1' || req.body?.refresh === true;
    const feature = await getFeatureById(id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });

    let analysis = !forceRefresh ? competitorAnalysisCache.get(String(id)) : undefined;
    if (!analysis) {
      try {
        analysis = await openaiService.generateCompetitorAnalysis(feature.name, feature.description || '');
        competitorAnalysisCache.set(String(id), analysis);
      } catch (e) {
        console.warn('generateCompetitorAnalysis failed:', e.message);
        analysis = { stub: true, error: e.message, competitors: [], similarities: [], differences: [] };
      }
    }

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

/** Build Customer Insights as printable HTML (for Print → Save as PDF). */
function buildCustomerInsightsHtml(feature, insights) {
  const featureLabel = escapeHtml(feature?.name || 'Feature');
  const insightsRows =
    (insights || []).length > 0
      ? (insights || [])
          .map(
            (item) =>
              `<tr><td>${escapeHtml(item.client || '—')}</td><td>${escapeHtml(item.insight || '—')}</td></tr>`
          )
          .join('')
      : `<tr><td colspan="2" class="empty-hint">No rows in the <strong>Sample Client Insights</strong> sheet match this feature name (“${featureLabel}”). In that sheet tab, add rows with the same text in the <strong>Feature</strong> column to see client insights here.</td></tr>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Customer Insights – ${escapeHtml(feature?.name || 'Feature')}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.5; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #f97316; padding-bottom: 0.5rem; }
    .meta { color: #6b7280; font-size: 0.9rem; margin: 0.5rem 0; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
    th, td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 600; }
    .print-hint { margin-top: 2rem; padding: 0.75rem; background: #fef3c7; border-radius: 8px; font-size: 0.85rem; }
    .empty-hint { color: #6b7280; font-size: 0.9rem; padding: 1rem; }
    @media print { .print-hint { display: none; } body { margin: 1rem; } }
  </style>
</head>
<body>
  <h1>Customer Insights: ${escapeHtml(feature?.name || 'Feature')}</h1>
  <div class="meta">Module: ${escapeHtml(feature?.module || '—')} | Score: ${feature?.weighted_score ?? feature?.total_requests ?? 0} | Requested: ${escapeHtml(feature?.requested_clients || '—')}</div>
  ${feature?.description ? `<p>${escapeHtml(feature.description)}</p>` : ''}
  <h2>Client insights</h2>
  <table>
    <thead><tr><th>Client</th><th>Insight</th></tr></thead>
    <tbody>${insightsRows}</tbody>
  </table>
  <p class="print-hint">To save as PDF: File → Print → choose "Save as PDF" (or "Microsoft Print to PDF").</p>
</body>
</html>`;
}

/** One feature's competitor analysis as HTML section (for export-all-competitor-analysis). */
function buildCompetitorAnalysisSectionHtml(feature, analysis) {
  const competitors = analysis?.competitors;
  const hasCompetitors = Array.isArray(competitors) && competitors.length > 0;
  const similarities = analysis?.similarities;
  const differences = analysis?.differences;
  const hasSim = Array.isArray(similarities) && similarities.length > 0;
  const hasDiff = Array.isArray(differences) && differences.length > 0;
  const competitorRows = hasCompetitors
    ? competitors
        .map((c) => {
          const helpUrl = c.helpArticleUrl && String(c.helpArticleUrl).startsWith('http') ? c.helpArticleUrl : null;
          const searchQuery = c.helpSearchQuery && String(c.helpSearchQuery).trim() ? c.helpSearchQuery : `${c.name || ''} ${c.term || ''} documentation`.trim();
          const link = helpUrl || `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
          const linkText = (c.helpArticleTitle && String(c.helpArticleTitle).trim()) || (helpUrl ? 'Help article' : 'Search docs');
          return `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.term || '—')}</td><td>${escapeHtml(c.howItWorks || '—')}</td><td><a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(linkText)}</a></td></tr>`;
        })
        .join('')
    : '';
  return `
  <h1>${escapeHtml(feature.name)}</h1>
  <p class="meta">Module: ${escapeHtml(feature.module || '—')}</p>
  ${feature.description ? `<p>${escapeHtml(feature.description)}</p>` : ''}
  ${hasSim ? `<h2>Similarities</h2><ul>${similarities.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
  ${hasDiff ? `<h2>Differences</h2><ul>${differences.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
  ${hasCompetitors ? `<h2>Competitor mapping</h2><table><thead><tr><th>Competitor</th><th>Term</th><th>How it works</th><th>Help / links</th></tr></thead><tbody>${competitorRows}</tbody></table>` : ''}
`;
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
