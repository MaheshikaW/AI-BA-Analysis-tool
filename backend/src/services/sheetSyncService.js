import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

/** Get value from row by header name only (case-insensitive). No positional fallback to avoid wrong column. */
function getColumn(row, possibleNames) {
  const norm = (s) => String(s ?? '').toLowerCase().trim();
  for (const name of possibleNames) {
    const want = norm(name);
    for (const k of Object.keys(row || {})) {
      if (norm(k) === want) {
        const v = row[k];
        return v != null ? String(v).trim() : '';
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

/**
 * Fetch feature list from the Google Sheet (AI Feature Priority Dashboard).
 * If the sheet is not published to web, falls back to built-in seed data.
 * Columns: Feature (A), Feature Description (B), Module (C), Point of Contact (D), Requested Clients (E).
 */
export async function fetchSheetRows() {
  const url = config.sheet.exportUrl;
  try {
    const res = await fetch(url, { headers: { Accept: 'text/csv' } });
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
    }).filter((r) => r.name && r.name.length > 0 && r.module && r.module.length > 0);
    if (out.length > 0) return out;
  } catch (e) {
    console.warn('Sheet fetch failed, using fallback seed:', e.message);
  }
  return loadFallbackSeed();
}

function splitRequestedClients(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Return rows in database-like shape: id, weighted_score, total_requests, tier_breakdown, requested_clients (string). */
export function rowsToFeatureList(rows) {
  return rows.map((r, i) => {
    const count = (r.requested_clients || []).length;
    const requested_clients_str = (r.requested_clients || []).join(', ');
    return {
      id: i + 1,
      module: r.module,
      name: r.name,
      description: r.description || null,
      point_of_contact: r.point_of_contact || null,
      weighted_score: count,
      total_requests: count,
      tier_breakdown: count ? JSON.stringify({ professional: { requests: count, weight: 1 } }) : null,
      requested_clients: requested_clients_str || null,
    };
  });
}
