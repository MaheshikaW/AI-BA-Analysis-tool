import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const url = config.sheet.exportUrl;
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
    console.warn('Sheet fetch failed, using fallback seed:', e.message);
  }
  const fallback = loadFallbackSeed();
  if (fallback.length > 0) sheetCache = { rows: fallback, at: now };
  return fallback;
}

function splitRequestedClients(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normalize client name for score lookup: trim, lowercase, collapse spaces. */
function normalizeClientName(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Cache for Scoring Info (client name -> score). */
let scoringCache = { map: null, at: 0 };

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
      const scoreStr = getColumn(row, ['Client Score', 'Score', 'client score', 'score']);
      if (!name) continue;
      const score = parseInt(scoreStr, 10);
      if (Number.isNaN(score) || score < 0) continue;
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

  const url = `https://docs.google.com/spreadsheets/d/${config.sheet.id}/export?format=csv&gid=${config.sheet.insightsGid}`;
  let text = null;
  try {
    const res = await fetch(url, { headers: SHEET_FETCH_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.trimStart().startsWith('<')) throw new Error('Got HTML');
  } catch (e) {
    console.warn('Insights fetch failed:', e.message, e.cause?.message || '');
    insightsCache = { rows: [], at: now };
    return [];
  }
  try {
    const rows = parseCsv(text);
    const firstColVal = (r) => {
      const k = Object.keys(r || {})[0];
      return k != null ? String(r[k] ?? '').trim() : '';
    };
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
        const vals = Object.values(row || {}).map((v) => stripQuotes(String(v ?? '').trim()));
        if ((!featureVal || !clientVal) && vals.length >= 3 && vals[0]) {
          featureVal = featureVal || vals[0];
          clientVal = clientVal || vals[1] || '';
          insightVal = insightVal || vals[2] || '';
        }
        return { feature: featureVal, client: clientVal, insight: insightVal };
      })
      .filter((r) => (r.feature && (r.feature = r.feature.trim())));
    if (rows.length > 1 && out.length === 0) {
      console.warn('Insights sheet: parsed', rows.length, 'rows but none had a Feature column. First row keys:', Object.keys(rows[0] || {}));
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
 * Return rows in database-like shape: id, weighted_score, total_requests, tier_breakdown, requested_clients (string).
 * If clientScoreMap is provided, weighted_score = sum of (Client Score from Scoring Info) per requesting client.
 */
export function rowsToFeatureList(rows, clientScoreMap = null) {
  return rows.map((r, i) => {
    const requested = r.requested_clients || [];
    const count = requested.length;
    const requested_clients_str = requested.join(', ');
    let weighted_score = count;
    let tier_breakdown = count ? JSON.stringify({ professional: { requests: count, weight: 1 } }) : null;
    if (clientScoreMap && count > 0) {
      let sum = 0;
      const byTier = {};
      for (const clientName of requested) {
        const score = clientScoreMap.get(normalizeClientName(clientName)) ?? 1;
        sum += score;
        const key = `score_${score}`;
        if (!byTier[key]) byTier[key] = { requests: 0, weight: score };
        byTier[key].requests += 1;
      }
      weighted_score = sum;
      tier_breakdown = JSON.stringify(byTier);
    }
    return {
      id: i + 1,
      module: r.module,
      name: r.name,
      description: r.description || null,
      point_of_contact: r.point_of_contact || null,
      weighted_score,
      total_requests: count,
      tier_breakdown,
      requested_clients: requested_clients_str || null,
    };
  });
}
