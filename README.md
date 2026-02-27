# OHRM Feature Scoring – OrangeHRM

Implementation of the [AI Ideas for OrangeHRM](https://docs.google.com/spreadsheets/d/1y5PNfslFtC8sanhWKTnapd6SqbddF2qzckBA_rDnTdc/edit) plan: **feature scoring**, **AI Customer Insights**, and **AI Competitor Analysis**.

## Structure

```
ai/
├── backend/          # Node.js API (Express + SQLite)
├── frontend/         # Vue 3 dashboard (Vite)
└── README.md
```

## Quick start

### 1. Backend

```bash
cd backend
cp .env.example .env   # optional: set PORT, OPENAI_API_KEY, etc.
npm install
npm run init-db        # create SQLite DB and tables
npm run dev            # http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5174 (proxies /api to backend)
```

Open **http://localhost:5174** and use the dashboard to add features, add client requests (tier + count), and trigger **Customer insights** / **Competitor analysis**.

## Feature list from Google Sheet

The app **loads the feature list from the [AI Feature Priority Dashboard](https://docs.google.com/spreadsheets/d/1y5PNfslFtC8sanhWKTnapd6SqbddF2qzckBA_rDnTdc/edit?gid=1660060315) sheet** every time you open the dashboard. Expected columns: **Feature**, **Feature Description**, **Module**, **Point of Contact**, **Requested Clients** (comma- or newline-separated).

**Publish the sheet to web** so the app can fetch it without login:
1. In Google Sheets: **File → Share → Publish to web**
2. Choose the tab (e.g. “Sample Feature List” / gid 1660060315) and **Link** format, then **Publish**.
3. The backend will use the CSV export URL; no API key needed.

To use a different sheet or tab, set in backend `.env`: `GOOGLE_SHEET_ID` and `GOOGLE_SHEET_GID`. You can also trigger a sync manually: **POST /api/features/sync-from-sheet**.

## How to host

### 1. Same network (office / Wi‑Fi) – one URL

Best for sharing with colleagues on the same network. One port, one link.

```bash
# From the project root (ai/)
cd frontend && npm run build
cd ../backend && npm run dev
```

- **Your URL:** `http://<your-ip>:4000`  
  Find your IP: `hostname -I` (Linux) or `ipconfig` (Windows). Example: `http://192.168.1.10:4000`
- Others on the same network open that URL. No login; the app has no auth.

### 2. Same network – dev mode (two processes)

If you prefer the Vite dev server (hot reload):

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

- Share: `http://<your-ip>:5174` (frontend proxies API to backend).

### 3. Internet (public URL)

To host so anyone with the link can open it (e.g. from home or another office):

**Option A – Tunnel (no server needed)**  
On the machine where the app runs:

1. Build and run: `cd frontend && npm run build` then `cd ../backend && npm run dev`
2. Install a tunnel tool, e.g. [ngrok](https://ngrok.com): `ngrok http 4000`
3. Use the HTTPS URL ngrok gives you (e.g. `https://abc123.ngrok.io`). Share that link.

**Option B – Cloud server (VPS / PaaS)**  
Deploy the app to a server (e.g. Ubuntu VPS, Railway, Render, Fly.io):

- Build frontend and run the backend on the host (e.g. with `node src/index.js` or a process manager like `pm2`).
- Set `PORT` (often 80 or provided by the host) and keep `.env` (including `OPENAI_API_KEY`) on the server.
- The app has no auth; use the host’s firewall, VPN, or reverse proxy to limit who can access it if needed.

### Summary

| Where        | How                    | URL example              |
|-------------|------------------------|---------------------------|
| Same network| Build + backend        | `http://192.168.1.10:4000` |
| Same network| Dev (backend + frontend)| `http://192.168.1.10:5174` |
| Internet    | ngrok tunnel           | `https://xxx.ngrok.io`    |
| Internet    | VPS / PaaS             | Your server’s URL         |

## Features implemented

| Item | Status |
|------|--------|
| Feature list (module, name, description, POC) | ✅ CRUD + API |
| Client request counts by tier | ✅ Stored per feature, manual or sync |
| Multi-tier weighted score | ✅ Configurable weights (e.g. enterprise=3, professional=2, starter=1) |
| Dashboard (score-based list, filters, sort) | ✅ Vue UI |
| Request Customer Insights | ✅ Stub → create Google Doc (wire Google API for real) |
| AI Competitor Analysis | ✅ OpenAI maps feature to competitor terms + generates analysis; Google Doc stub |

## Configuration (backend `.env`)

| Variable | Purpose |
|----------|--------|
| `PORT` | API port (default 4000) |
| `DB_PATH` | SQLite file path (default `./data/ai-ideas.db`) |
| `OPENAI_API_KEY` | Required for real competitor analysis and feature classification |
| `PRODUCT_BOARD_API_KEY` | For syncing request counts from Product Board (optional, stub without it) |
| `SCORE_TIER_WEIGHTS` | JSON object, e.g. `{"enterprise":3,"professional":2,"starter":1}` |
| `GOOGLE_*` | For creating real Google Docs (optional, stub without it) |

## API (backend)

- `GET/POST /api/features` – list (query: `module`, `sort`) / create
- `GET/PATCH/DELETE /api/features/:id` – get / update / delete
- `GET/POST /api/features/:id/requests` – list / add client requests (tier, count, source)
- `POST /api/features/recalculate-scores` – recalc all weighted scores
- `POST /api/features/:id/customer-insights` – generate Customer Insights doc (stub)
- `GET /api/features/:id/competitor-mapping` – AI mapping to competitor terms
- `POST /api/features/:id/competitor-analysis` – full analysis + doc (stub)

## Next steps (when you have credentials)

1. **Product Board** – implement `productBoardService.js` using [Product Board API](https://developer.productboard.com/reference/introduction) and map features to request counts.
2. **CRM** – add a small client-tier sync from OrangeHRM CRM into `client_requests` or a separate tier lookup.
3. **Google Docs** – implement `googleDocsService.js` with OAuth and template IDs to create real Customer Insights and Competitor Analysis documents.
4. **productfeatures@ email** – optional pipeline (e.g. Gmail API or manual CSV import) to feed request counts into the same tables.
