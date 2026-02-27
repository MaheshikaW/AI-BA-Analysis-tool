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
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
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
    get exportUrl() {
      return `https://docs.google.com/spreadsheets/d/${this.id}/export?format=csv&gid=${this.gid}`;
    },
  },
};
