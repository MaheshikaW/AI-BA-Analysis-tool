import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  dbPath: process.env.DB_PATH || './data/ai-ideas.db',
  productBoard: {
    apiKey: process.env.PRODUCT_BOARD_API_KEY || '',
    baseUrl: process.env.PRODUCT_BOARD_BASE_URL || 'https://api.productboard.com',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    competitors: (process.env.COMPETITORS || 'BambooHR, Workday, HiBOB, SAP SuccessFactors, ADP')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  google: {
    apiKey: process.env.GOOGLE_API_KEY || '',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    /** Path to service account JSON key file. If set, used to create Google Docs (no user sign-in). */
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || '',
    /** Optional. Google Drive folder ID (or full folder URL) where new docs are created. */
    get driveFolderId() {
      const raw = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
      if (!raw) return null;
      const m = raw.match(/[/]folders[/]([a-zA-Z0-9_-]+)/);
      return m ? m[1] : raw;
    },
  },
  scoring: {
    tierWeights: (() => {
      try {
        return JSON.parse(process.env.SCORE_TIER_WEIGHTS || '{}');
      } catch {
        return { enterprise: 3, professional: 2, starter: 1 };
      }
    })(),
  },
  sheet: {
    id: process.env.GOOGLE_SHEET_ID || '1y5PNfslFtC8sanhWKTnapd6SqbddF2qzckBA_rDnTdc',
    gid: process.env.GOOGLE_SHEET_GID || '1660060315',
    /** GID for "Sample Client Insights" tab (Feature, Client, Insight columns). */
    insightsGid: process.env.GOOGLE_SHEET_INSIGHTS_GID || '451205175',
    /** GID for "Scoring Info" tab (Client Name, Client Score / tier value). */
    scoringGid: process.env.GOOGLE_SHEET_SCORING_GID || '671984587',
    /** Optional. Publish ID from YOUR "Publish to web" link (the part after /d/e/). Set GOOGLE_SHEET_INSIGHTS_PUBLISH_ID in .env from the link you get when you publish. */
    insightsPublishId: (process.env.GOOGLE_SHEET_INSIGHTS_PUBLISH_ID || '').trim() || null,
    get exportUrl() {
      return `https://docs.google.com/spreadsheets/d/${this.id}/export?format=csv&gid=${this.gid}`;
    },
    get insightsExportUrl() {
      if (this.insightsPublishId) {
        return `https://docs.google.com/spreadsheets/d/e/${this.insightsPublishId}/export?format=csv&gid=${this.insightsGid}`;
      }
      return `https://docs.google.com/spreadsheets/d/${this.id}/export?format=csv&gid=${this.insightsGid}`;
    },
    /** Publish-to-web CSV URL (pub?output=csv) – use when sheet is published. */
    get insightsPublishCsvUrl() {
      if (!this.insightsPublishId) return null;
      return `https://docs.google.com/spreadsheets/d/e/${this.insightsPublishId}/pub?gid=${this.insightsGid}&single=true&output=csv`;
    },
    /** Canonical export URL (no publish ID); used as fallback when publish URL returns HTML. */
    get insightsExportUrlCanonical() {
      return `https://docs.google.com/spreadsheets/d/${this.id}/export?format=csv&gid=${this.insightsGid}`;
    },
  },
};
