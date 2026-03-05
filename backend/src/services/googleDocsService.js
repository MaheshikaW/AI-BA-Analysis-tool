import { existsSync } from 'fs';
import { resolve } from 'path';
import { google } from 'googleapis';
import { config } from '../config.js';

const hasGoogleConfig = () => !!(config.google.apiKey || config.google.clientId);
const hasServiceAccount = () => !!config.google.credentialsPath;

/** Resolve key file path; return null if file does not exist. */
function getResolvedKeyPath() {
  const raw = config.google.credentialsPath;
  if (!raw || !String(raw).trim()) return null;
  const keyPath = resolve(process.cwd(), String(raw).trim());
  return existsSync(keyPath) ? keyPath : null;
}

/** Get auth and Drive/Docs clients when service account key file exists. */
async function getClients() {
  const keyPath = getResolvedKeyPath();
  if (!keyPath) return null;
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
    ],
  });
  const drive = google.drive({ version: 'v3', auth });
  const docs = google.docs({ version: 'v1', auth });
  return { drive, docs, auth };
}

/**
 * Create a new Google Doc via Drive, insert text via Docs API, return view link.
 */
async function createDocWithContent(title, bodyText) {
  const clients = await getClients();
  if (!clients) return { docId: null, docUrl: null };

  const { drive, docs } = clients;
  const requestBody = {
    name: title,
    mimeType: 'application/vnd.google-apps.document',
  };
  if (config.google.driveFolderId) {
    requestBody.parents = [config.google.driveFolderId];
  }
  const createRes = await drive.files.create({
    requestBody,
    fields: 'id, webViewLink',
  });
  const fileId = createRes.data.id;
  const docUrl = createRes.data.webViewLink || `https://docs.google.com/document/d/${fileId}/edit`;

  if (bodyText && bodyText.trim()) {
    await docs.documents.batchUpdate({
      documentId: fileId,
      requestBody: {
        requests: [
          { insertText: { location: { index: 1 }, text: bodyText.trim() + '\n' } },
        ],
      },
    });
  }

  return { docId: fileId, docUrl };
}

export async function createCustomerInsightsDoc(feature, insightsContent) {
  if (!hasGoogleConfig() && !hasServiceAccount()) {
    return {
      ok: true,
      stub: true,
      message: 'Google API not configured. Set GOOGLE_API_KEY or OAuth credentials in backend/.env',
      preview: { feature: feature?.name, insights: insightsContent?.substring?.(0, 200) },
    };
  }

  if (!hasServiceAccount()) {
    return {
      ok: true,
      stub: false,
      docId: null,
      docUrl: null,
      message: 'Set GOOGLE_APPLICATION_CREDENTIALS in .env to the path of your service account JSON key file to create Google Docs.',
    };
  }

  const keyPath = getResolvedKeyPath();
  if (!keyPath) {
    const raw = config.google.credentialsPath;
    const resolved = raw ? resolve(process.cwd(), String(raw).trim()) : '';
    return {
      ok: false,
      stub: false,
      error: `Service account key file not found. Put your JSON key at: ${resolved || 'path in GOOGLE_APPLICATION_CREDENTIALS'}`,
      docId: null,
      docUrl: null,
    };
  }

  try {
    const title = `Customer Insights – ${(feature?.name || 'Feature').replace(/[/\\?*:"]/g, '-')}`;
    const body = [
      `Feature: ${feature?.name || '—'}`,
      `Module: ${feature?.module || '—'}`,
      `Requests: ${feature?.total_requests ?? feature?.weighted_score ?? 0}`,
      '',
      typeof insightsContent === 'string' ? insightsContent : '',
    ].join('\n');
    const { docId, docUrl } = await createDocWithContent(title, body);
    return { ok: true, stub: false, docId, docUrl };
  } catch (e) {
    console.error('createCustomerInsightsDoc:', e.message);
    let errorMsg = e.message || 'Failed to create Google Doc';
    if (errorMsg.includes('quota') || errorMsg.includes('storage')) {
      errorMsg =
        "Drive storage quota exceeded. Free up space in the Google account that owns the folder (see drive.google.com/drive/quota), or use GOOGLE_DRIVE_FOLDER_ID to point to a folder in an account with free space.";
    }
    return {
      ok: false,
      stub: false,
      error: errorMsg,
      docId: null,
      docUrl: null,
    };
  }
}

function escapeForDoc(s) {
  if (s == null) return '';
  return String(s).replace(/\r/g, '');
}

export async function createCompetitorAnalysisDoc(feature, analysis) {
  if (!hasGoogleConfig() && !hasServiceAccount()) {
    return {
      ok: true,
      stub: true,
      message: 'Google API not configured. Set GOOGLE_API_KEY or OAuth credentials in backend/.env',
      preview: { feature: feature?.name, competitors: analysis?.competitors?.length },
    };
  }

  if (!hasServiceAccount()) {
    return {
      ok: true,
      stub: false,
      docId: null,
      docUrl: null,
      message: 'Set GOOGLE_APPLICATION_CREDENTIALS in .env to the path of your service account JSON key file to create Google Docs.',
    };
  }

  if (!getResolvedKeyPath()) {
    const raw = config.google.credentialsPath;
    const resolved = raw ? resolve(process.cwd(), String(raw).trim()) : '';
    return {
      ok: false,
      stub: false,
      error: `Service account key file not found. Put your JSON key at: ${resolved || 'path in GOOGLE_APPLICATION_CREDENTIALS'}`,
      docId: null,
      docUrl: null,
    };
  }

  try {
    const title = `Competitor Analysis – ${(feature?.name || 'Feature').replace(/[/\\?*:"]/g, '-')}`;
    const lines = [
      escapeForDoc(feature?.name),
      `Module: ${escapeForDoc(feature?.module)}`,
      '',
      escapeForDoc(feature?.description),
      '',
      '---',
      'Similarities',
      '---',
      ...(analysis?.similarities || []).map((s) => `• ${escapeForDoc(s)}`),
      '',
      '---',
      'Differences',
      '---',
      ...(analysis?.differences || []).map((d) => `• ${escapeForDoc(d)}`),
      '',
    ];
    if (analysis?.competitors?.length) {
      lines.push('---', 'Competitor mapping', '---');
      for (const c of analysis.competitors) {
        lines.push(`${escapeForDoc(c.name)}: ${escapeForDoc(c.term || '—')}`, `  How: ${escapeForDoc(c.howItWorks || '—')}`, '');
      }
    }
    const body = lines.join('\n');
    const { docId, docUrl } = await createDocWithContent(title, body);
    return { ok: true, stub: false, docId, docUrl };
  } catch (e) {
    console.error('createCompetitorAnalysisDoc:', e.message);
    let errorMsg = e.message || 'Failed to create Google Doc';
    if (errorMsg.includes('quota') || errorMsg.includes('storage')) {
      errorMsg =
        "Drive storage quota exceeded. Free up space in the Google account that owns the folder (see drive.google.com/drive/quota), or use GOOGLE_DRIVE_FOLDER_ID to point to a folder in an account with free space.";
    }
    return {
      ok: false,
      stub: false,
      error: errorMsg,
      docId: null,
      docUrl: null,
    };
  }
}
