import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Fetch main dashboard tab via Sheets API (Feature, Requested Clients, etc.). Sheet must be shared with the service account. */
async function fetchSheetRowsViaSheetsApi() {
  const raw = config.google.credentialsPath;
  if (!raw || !String(raw).trim()) return null;
  const keyPath = path.resolve(process.cwd(), String(raw).trim());
  if (!fs.existsSync(keyPath)) return null;
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = config.sheet.id;
    const gid = parseInt(config.sheet.gid, 10);
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabList = meta.data.sheets || [];
    const tab = tabList.find((s) => s.properties?.sheetId === gid) || tabList[0];
    const title = tab?.properties?.title || `gid_${gid}`;
    const range = `'${title.replace(/'/g, "''")}'!A:Z`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values || [];
    if (rows.length < 2) return null;
    const headers = (rows[0] || []).map((c) => String(c ?? '').trim());
    const col = (name) => {
      const want = name.toLowerCase().trim();
      const i = headers.findIndex((h) => String(h).toLowerCase().trim() === want || String(h).toLowerCase().replace(/\s/g, '') === want.replace(/\s/g, ''));
      return i >= 0 ? i : null;
    };
    const featureCol = col('Feature') ?? col('Feature Name') ?? 0;
    const descCol = col('Feature Description') ?? col('Feature description') ?? null;
    const moduleCol = col('Module') ?? col('Module Name') ?? col('Product Module') ?? null;
    const pocCol = col('Point of Contact') ?? col('Point of contact') ?? col('POC') ?? null;
    const clientsCol = col('Requested Clients') ?? col('Requested clients') ?? col('Requested Client(s)') ?? null;
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const name = String(row[featureCol] ?? '').trim();
      if (!name) continue;
      const clientsRaw = clientsCol != null ? String(row[clientsCol] ?? '').trim() : '';
      out.push({
        name,
        description: descCol != null ? String(row[descCol] ?? '').trim() : '',
        module: moduleCol != null ? String(row[moduleCol] ?? '').trim() : '',
        point_of_contact: pocCol != null ? String(row[pocCol] ?? '').trim() : '',
        requested_clients: splitRequestedClients(clientsRaw),
      });
    }
    return out.length > 0 ? out : null;
  } catch (e) {
    console.warn('Main sheet via Sheets API failed:', e.message);
    return null;
  }
}

/** Fetch insights tab via Sheets API. Sheet must be shared with the service account email. Finds tab by gid or by title "Sample Client Insights". */
async function fetchInsightsRowsViaSheetsApi() {
  const raw = config.google.credentialsPath;
  if (!raw || !String(raw).trim()) return null;
  const keyPath = path.resolve(process.cwd(), String(raw).trim());
  if (!fs.existsSync(keyPath)) return null;
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = config.sheet.id;
    const gid = parseInt(config.sheet.insightsGid, 10);
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabList = meta.data.sheets || [];
    let tab = tabList.find((s) => s.properties?.sheetId === gid);
    if (!tab) {
      tab = tabList.find((s) => {
        const t = (s.properties?.title || '').toLowerCase();
        return t.includes('client insights') || t === 'sample client insights';
      });
    }
    const title = tab?.properties?.title || `gid_${gid}`;
    const range = `'${title.replace(/'/g, "''")}'!A:Z`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values || [];
    if (rows.length < 2) return [];
    const headers = (rows[0] || []).map((c) => String(c ?? '').trim().toLowerCase());
    const col = (name) => {
      const i = headers.findIndex((h) => h === name || h.replace(/\s/g, '') === name.replace(/\s/g, ''));
      return i >= 0 ? i : null;
    };
    const featureCol = col('feature') ?? col('featurename') ?? 0;
    const clientCol = col('client') ?? col('customer') ?? 1;
    const insightCol = col('insight') ?? col('quote') ?? col('feedback') ?? 2;
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const feature = String(row[featureCol] ?? '').trim();
      if (!feature) continue;
      out.push({
        feature,
        client: String(row[clientCol] ?? '').trim(),
        insight: String(row[insightCol] ?? '').trim(),
      });
    }
    return out;
  } catch (e) {
    console.warn('Insights via Sheets API failed:', e.message);
    return null;
  }
}

/**
 * Parse CSV with quote-aware row boundaries: newlines inside double-quoted fields
 * do not start a new row, so feature name/description with line breaks stay in one cell.
 */
function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const rawHeaders = rows[0].map((c) => String(c).trim());
  const headers = rawHeaders;
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const row = {};
    headers.forEach((h, j) => {
      row[h] = (values[j] != null ? String(values[j]) : '').trim();
    });
    result.push(row);
  }
  return result;
}

/** Split CSV text into rows (each row = array of cell values). Respects "..." so newlines inside quotes don't break rows. */
function parseCsvRows(text) {
  const rows = [];
  let currentRow = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"') {
        if (next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ',') {
      currentRow.push(current.trim());
      current = '';
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && next === '\n') i++;
      currentRow.push(current.trim());
      rows.push(currentRow);
      currentRow = [];
      current = '';
      continue;
    }
    current += c;
  }
  currentRow.push(current.trim());
  rows.push(currentRow);
  return rows;
}

/** Strip surrounding double/single quotes (CSV export sometimes leaves them). */
function stripQuotes(s) {
  if (s == null || typeof s !== 'string') return '';
  return s.replace(/^["']+|["']+$/g, '').trim();
}

/** Get value from row by header name only (case-insensitive). No positional fallback to avoid wrong column. */
function getColumn(row, possibleNames) {
  const norm = (s) => String(s ?? '').toLowerCase().trim();
  for (const name of possibleNames) {
    const want = norm(name);
    for (const k of Object.keys(row || {})) {
      if (norm(k) === want) {
        const v = row[k];
        return stripQuotes(v != null ? String(v).trim() : '');
      }
    }
  }
  return '';
}


/** Load fallback feature list from seed JSON when the sheet is not published. */
function loadFallbackSeed() {
  const seedPath = path.join(__dirname, '..', 'data', 'seed-from-sheet.json');
  if (!fs.existsSync(seedPath)) return [];
  const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  return Array.isArray(data) ? data : [];
}

const SHEET_CACHE_TTL_MS = 60 * 1000; // 1 minute
let sheetCache = { rows: null, at: 0 };

/** Headers for Google Sheets export: User-Agent often required so Google returns CSV instead of HTML. */
export const SHEET_FETCH_HEADERS = {
  Accept: 'text/csv',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

/**
 * Fetch feature list from the Google Sheet (AI Feature Priority Dashboard).
 * Results are cached for 1 minute to avoid repeated network calls.
 * If the sheet is not published to web, falls back to built-in seed data.
 */
export async function fetchSheetRows() {
  const now = Date.now();
  if (sheetCache.rows != null && now - sheetCache.at < SHEET_CACHE_TTL_MS) {
    return sheetCache.rows;
  }
  const baseUrl = config.sheet.exportUrl;
  const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}_=${now}`;
  try {
    const res = await fetch(url, { headers: SHEET_FETCH_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let text = await res.text();
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.trimStart().startsWith('<')) throw new Error('Sheet not published (got HTML)');
    const rows = parseCsv(text);
    const out = rows.map((row) => {
      const feature = getColumn(row, ['Feature', 'Feature Name', 'feature']);
      const description = getColumn(row, ['Feature Description', 'Feature description']);
      const module = getColumn(row, ['Module', 'module', 'Module Name', 'Product Module']);
      const poc = getColumn(row, ['Point of Contact', 'Point of contact', 'POC']);
      const clientsRaw = getColumn(row, ['Requested Clients', 'Requested clients', 'Requested Client(s)']);
      const requested_clients = splitRequestedClients(clientsRaw);
      return { name: feature, description, module, point_of_contact: poc, requested_clients };
    }).filter((r) => r.name && r.name.length > 0);
    if (out.length > 0) {
      sheetCache = { rows: out, at: now };
      return out;
    }
  } catch (e) {
    console.warn('Sheet fetch failed:', e.message);
  }
  const apiRows = await fetchSheetRowsViaSheetsApi();
  if (apiRows && apiRows.length > 0) {
    sheetCache = { rows: apiRows, at: now };
    return apiRows;
  }
  const fallback = loadFallbackSeed();
  if (fallback.length > 0) sheetCache = { rows: fallback, at: now };
  return fallback;
}

/** Split by comma, semicolon, or newline only. Names containing " - " (e.g. "MC Systems - Home Choice Enterprise Limited") stay as one client. */
function splitRequestedClients(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normalize client name for score lookup: trim, lowercase, collapse spaces. */
/**
 * Normalize client name for matching: fix mojibake, strip accents, all dashes to space, lowercase, collapse spaces.
 * So "MC Systems - Home Choice" (hyphen) and "MC Systems – Home Choice" (en-dash) match, and "Consolidé - Puma" matches "ConsolidÃ© - Puma".
 */
function normalizeClientName(s) {
  let t = (s || '').trim();
  // Fix UTF-8-mojibake (e.g. sheet exported as Latin-1): "ConsolidÃ©" → "Consolidé"
  try {
    if (Buffer.isEncoding('latin1')) t = Buffer.from(t, 'latin1').toString('utf8');
  } catch (_) {}
  // Strip accents so "consolidé" and "consolide" match
  t = t.normalize('NFD').replace(/\u0300-\u036f/g, '');
  // All dash-like chars (hyphen, en-dash, em-dash, etc.) → space so "MC Systems - X" and "MC Systems – X" match
  t = t.replace(/[\u002D\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, ' ');
  t = t.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

/** Cache for Scoring Info (client name -> score). */
let scoringCache = { map: null, at: 0 };

/** Clear sheet and scoring caches so the next request refetches from the sheet. Call when user clicks Refresh. */
export function clearSheetCaches() {
  sheetCache = { rows: null, at: 0 };
  scoringCache = { map: null, at: 0 };
  insightsCache = { rows: null, at: 0 };
}

/**
 * Parse Client Score column: number 1–9, or tier label.
 * High-Platinum → 4, Tier3 → 3, Tier2/Gold → 2, Tier1/Silver → 1.
 */
function parseScoreOrTier(scoreStr) {
  const n = parseInt(scoreStr, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= 9) return n;
  const s = (scoreStr || '')
    .toLowerCase()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\bhigh[\s-]*platinum\b|(platinum.*high|high.*platinum)|^platinum$/.test(s)) return 4;
  if (/tier\s*3|^3$/.test(s) && !/platinum|high/.test(s)) return 3;
  if (/tier\s*2|tier2|gold|^2$/.test(s)) return 2;
  if (/tier\s*1|tier1|silver|^1$/.test(s)) return 1;
  return null;
}

/**
 * Fetch Scoring Info tab (Client Name, Client Score). Returns Map(normalizedClientName -> score).
 * Score = sum of these values for each requesting client (formula).
 */
export async function fetchScoringInfo(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && scoringCache.map != null && now - scoringCache.at < SHEET_CACHE_TTL_MS) {
    return scoringCache.map;
  }
  const url = `https://docs.google.com/spreadsheets/d/${config.sheet.id}/export?format=csv&gid=${config.sheet.scoringGid}`;
  try {
    const res = await fetch(url, { headers: SHEET_FETCH_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let text = await res.text();
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.trimStart().startsWith('<')) throw new Error('Got HTML');
    const rows = parseCsv(text);
    const map = new Map();
    for (const row of rows) {
      const name = getColumn(row, ['Client Name', 'Client', 'client name', 'client']).trim();
      const scoreStr = String(getColumn(row, ['Client Score', 'Score', 'client score', 'score'])).trim();
      if (!name) continue;
      const score = parseScoreOrTier(scoreStr);
      if (score == null || score < 0) continue;
      map.set(normalizeClientName(name), score);
    }
    scoringCache = { map, at: now };
    return map;
  } catch (e) {
    console.warn('Scoring Info fetch failed:', e.message);
    if (scoringCache.map != null) return scoringCache.map;
    return new Map();
  }
}

/** Return service account email from key file so the user can share the sheet. */
export function getServiceAccountEmail() {
  const raw = config.google.credentialsPath;
  if (!raw || !String(raw).trim()) return null;
  const keyPath = path.resolve(process.cwd(), String(raw).trim());
  if (!fs.existsSync(keyPath)) return null;
  try {
    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    return key.client_email || null;
  } catch {
    return null;
  }
}

/** Cache for insights sheet (Feature, Client, Insight). */
let insightsCache = { rows: null, at: 0 };

/**
 * Fetch Client Insights rows from the "Sample Client Insights" tab.
 * Columns: Feature, Client, Insight. Returns [{ feature, client, insight }, ...].
 * Reads CSV from the sheet export URL only (no Google API). Publish the tab to web if needed.
 */
export async function fetchInsightsRows(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && insightsCache.rows != null && now - insightsCache.at < SHEET_CACHE_TTL_MS) {
    return insightsCache.rows;
  }
  if (forceRefresh) insightsCache = { rows: null, at: 0 };

  const urlsToTry = [
    config.sheet.insightsExportUrlCanonical,
    ...(config.sheet.insightsPublishCsvUrl ? [config.sheet.insightsPublishCsvUrl] : []),
    config.sheet.insightsExportUrl,
  ].filter(Boolean);
  let text = null;
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, { headers: SHEET_FETCH_HEADERS });
      if (!res.ok) continue;
      text = await res.text();
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      if (text.trimStart().startsWith('<')) continue;
      break;
    } catch (e) {
      continue;
    }
  }
  if (!text || text.trimStart().startsWith('<')) {
    const apiRows = await fetchInsightsRowsViaSheetsApi();
    if (apiRows && apiRows.length > 0) {
      const out = apiRows.map((r) => ({
        feature: (r.feature || '').trim(),
        client: (r.client || '').trim(),
        insight: (r.insight || '').trim(),
      })).filter((r) => (r.insight && r.insight.trim()) || (r.feature && r.feature.trim()));
      insightsCache = { rows: out, at: now };
      return out;
    }
    console.warn('Insights fetch failed: got HTML or no CSV from any URL. Publish the sheet to web (File → Share → Publish to web) or share the sheet with the service account email.');
    insightsCache = { rows: [], at: now };
    return [];
  }
  try {
    let rows = parseCsv(text);
    if (rows.length > 2) {
      const keys = Object.keys(rows[0] || {});
      const looksLikeHeader = keys.some((k) => /client|insight|feature|quote|feedback/i.test(String(k)));
      if (!looksLikeHeader && keys.length <= 2) {
        const rawRows = parseCsvRows(text);
        if (rawRows.length >= 3) {
          const headerRow = rawRows[1].map((c) => String(c ?? '').trim());
          rows = [];
          for (let i = 2; i < rawRows.length; i++) {
            const row = {};
            headerRow.forEach((h, j) => {
              row[h || `col_${j}`] = (rawRows[i][j] != null ? String(rawRows[i][j]) : '').trim();
            });
            rows.push(row);
          }
        }
      }
    }
    const firstColVal = (r) => {
      const k = Object.keys(r || {})[0];
      return k != null ? String(r[k] ?? '').trim() : '';
    };
    const valsFromRow = (r) => Object.values(r || {}).map((v) => stripQuotes(String(v ?? '').trim()));
    if (rows.length >= 2) {
      const firstKeys = Object.keys(rows[0] || {});
      const hasInsightCol = firstKeys.some((k) => /insight|quote|feedback/i.test(String(k)));
      const hasClientCol = firstKeys.some((k) => /client|customer|company/i.test(String(k)));
      if (!hasInsightCol && !hasClientCol && firstKeys.length >= 2) {
        const firstVals = valsFromRow(rows[0]);
        if (firstVals.some((v) => v.length > 50)) {
          rows = rows.map((r, i) => {
            const v = valsFromRow(r);
            return { Client: v[0] || '', Insight: v[1] || '' };
          });
        }
      }
    }
    const out = rows
      .map((row) => {
        let featureVal =
          getColumn(row, ['Feature', 'Feature Name', 'feature', 'Feature ']) || stripQuotes(firstColVal(row));
        featureVal = stripQuotes(featureVal);
        if (featureVal.includes(';')) featureVal = featureVal.split(';')[0].trim();
        let clientVal = stripQuotes(getColumn(row, ['Client', 'client', 'Customer', 'Company', 'Organization', 'Customer Name']));
        let insightVal = stripQuotes(getColumn(row, ['Insight', 'insight', 'Quote', 'Feedback', 'Comment', 'Notes', 'Client Quote', 'Feedback/Quote']));
        if (!clientVal && !insightVal && featureVal) {
          const parts = (firstColVal(row) || '').split(';');
          if (parts.length >= 3) {
            featureVal = stripQuotes(parts[0]).trim();
            return { feature: featureVal, client: stripQuotes(parts[1]).trim(), insight: stripQuotes(parts[2]).trim() };
          }
        }
        const vals = valsFromRow(row);
        if ((!featureVal || !clientVal) && vals.length >= 3 && vals[0]) {
          featureVal = featureVal || vals[0];
          clientVal = clientVal || vals[1] || '';
          insightVal = insightVal || vals[2] || '';
        }
        if (vals.length >= 2 && (!insightVal || !clientVal)) {
          if (!clientVal && vals[0]) clientVal = vals[0];
          if (!insightVal && vals[1]) insightVal = vals[1];
        }
        if (!insightVal && (featureVal || clientVal)) {
          const byLen = vals.filter(Boolean).sort((a, b) => b.length - a.length);
          if (byLen[0] && byLen[0].length > 20) insightVal = byLen[0];
        }
        return { feature: (featureVal || '').trim(), client: clientVal, insight: insightVal };
      })
      .filter((r) => (r.insight && r.insight.trim()) || (r.feature && (r.feature = r.feature.trim())));
    if (rows.length > 1 && out.length === 0) {
      console.warn('Insights sheet: parsed', rows.length, 'rows but none had Insight or Feature. First row keys:', Object.keys(rows[0] || {}));
    }
    insightsCache = { rows: out, at: now };
    return out;
  } catch (e) {
    console.warn('Insights sheet fetch failed:', e.message);
    insightsCache = { rows: [], at: now };
    return [];
  }
}

/**
 * Per-feature score (when tierTotals and tierWeightsByScore are set):
 *   Demand Rate(tier) = requests for this feature from that tier / total clients in that tier
 *   Weighted Score = Σ ( Demand Rate × tier_weight ) → normalized to 100
 * If config is missing, falls back to sum of tier scores per request.
 */
export function rowsToFeatureList(rows, clientScoreMap = null) {
  const tierTotals = config.scoring.tierTotals && typeof config.scoring.tierTotals === 'object' ? config.scoring.tierTotals : null;
  const tierWeightsByScore = config.scoring.tierWeightsByScore && typeof config.scoring.tierWeightsByScore === 'object' ? config.scoring.tierWeightsByScore : null;
  const simpleScoreMode = config.scoring.simpleScoreMode === true;
  const useDemandRate = !simpleScoreMode && tierTotals && tierWeightsByScore && Object.keys(tierTotals).length > 0 && Object.keys(tierWeightsByScore).length > 0;

  const scoreToTierName = (score) => {
    const n = Number(score);
    if (n === 4) return 'High-Platinum';
    if (n === 3) return 'Tier3';
    if (n === 2) return 'Tier2';
    if (n === 1) return 'Tier1';
    return `Tier${n}`;
  };
  const list = rows.map((r, i) => {
    const requested = r.requested_clients || [];
    const count = requested.length;
    const requested_clients_str = requested.join(', ');
    let weighted_score = count;
    let tier_breakdown = count ? JSON.stringify({ professional: { requests: count, weight: 1 } }) : null;
    const requested_clients_with_tier = [];
    let rawScore = count;
    let sum = 0;
    const byTier = {};
    if (clientScoreMap && clientScoreMap.size > 0 && count > 0) {
      for (const clientName of requested) {
        const normalized = normalizeClientName(clientName);
        let score = clientScoreMap.get(normalized);
        // If request is "MC Systems - Home Choice Enterprise Limited" and sheet has "Home Choice Enterprise Limited" as Tier1, use Tier1
        const homeChoiceKey = 'home choice enterprise limited';
        if (normalized.includes(homeChoiceKey)) {
          const homeChoiceScore = clientScoreMap.get(homeChoiceKey);
          if (homeChoiceScore === 1) score = 1;
        }
        if (score == null && normalized) {
          let bestKey = null;
          let bestKeyLen = -1;
          for (const [key, val] of clientScoreMap) {
            if (!key.includes(normalized) && !normalized.includes(key)) continue;
            if (key.length > bestKeyLen) {
              bestKeyLen = key.length;
              bestKey = key;
            }
          }
          if (bestKey != null) score = clientScoreMap.get(bestKey);
        }
        score = score ?? 2;
        requested_clients_with_tier.push({ client: clientName, tier: scoreToTierName(score) });
        sum += score;
        const key = `score_${score}`;
        if (!byTier[key]) byTier[key] = { requests: 0, weight: score };
        byTier[key].requests += 1;
      }
      if (!useDemandRate) {
        weighted_score = sum;
      } else {
        rawScore = 0;
        for (const [key, data] of Object.entries(byTier)) {
          const scoreNum = data.weight;
          const requests = data.requests ?? 0;
          const totalInTier = Number(tierTotals[scoreNum] ?? tierTotals[String(scoreNum)]) || 0;
          const weight = Number(tierWeightsByScore[scoreNum] ?? tierWeightsByScore[String(scoreNum)]) || 0;
          if (totalInTier > 0) rawScore += (requests / totalInTier) * weight;
        }
      }
      tier_breakdown = JSON.stringify(byTier);
    } else if (count > 0) {
      requested.forEach((clientName) => requested_clients_with_tier.push({ client: clientName, tier: '—' }));
    }
    return {
      id: i + 1,
      module: r.module,
      name: r.name,
      description: r.description || null,
      point_of_contact: r.point_of_contact || null,
      weighted_score: useDemandRate ? rawScore : weighted_score,
      _rawScore: (useDemandRate || simpleScoreMode) ? (useDemandRate ? rawScore : (sum || 0)) : undefined,
      total_requests: count,
      tier_breakdown,
      requested_clients: requested_clients_str || null,
      requested_clients_with_tier: requested_clients_with_tier.length ? requested_clients_with_tier : null,
    };
  });

  const doNormalize = (useDemandRate || simpleScoreMode) && config.scoring.normalizeTo100 !== false;
  if (doNormalize) {
    const maxRaw = Math.max(...list.map((f) => f._rawScore ?? 0), 0);
    for (const f of list) {
      f.weighted_score = maxRaw > 0 ? 100 * ((f._rawScore ?? 0) / maxRaw) : 0;
      delete f._rawScore;
    }
  } else if (useDemandRate || simpleScoreMode) {
    for (const f of list) {
      let raw = f._rawScore ?? 0;
      if (useDemandRate && raw > 0 && raw < 1) raw = raw * 1000;
      f.weighted_score = raw;
      delete f._rawScore;
    }
  }
  return list;
}
