# Hosting on a server (Docker)

Deploy the app on a Linux server (e.g. Ubuntu) using Docker. One container serves both the API and the frontend.

## 1. Server requirements

- **Docker** and **Docker Compose**
- Port **4080** (or 4000) open on the firewall

### Install Docker (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
# Log out and back in, or run: newgrp docker
```

## 2. Deploy the app

### Option A: Clone from Git (if the project is in a repo)

```bash
cd /opt   # or your preferred path
sudo git clone <your-repo-url> ai
cd ai
```

### Option B: Copy files to the server

From your dev machine, copy the project (excluding `node_modules` and `.env`):

```bash
rsync -av --exclude=node_modules --exclude=frontend/node_modules --exclude=backend/node_modules --exclude=backend/.env --exclude=.git ./ai/ user@your-server:/opt/ai/
```

Then on the server:

```bash
cd /opt/ai
```

### 3. Configure environment

On the server, create the backend env file from the example:

```bash
cp backend/.env.example backend/.env
nano backend/.env   # or vim
```

Set at least:

- **PORT** – leave `4000` (container internal port).
- **OPENAI_API_KEY** – required for competitor analysis and use case generation.
- **GOOGLE_SHEET_ID** / **GOOGLE_SHEET_GID** – if using a different sheet than the default.

Do **not** commit `.env`; it contains secrets.

### 4. Build and run

```bash
cd /opt/ai
docker compose build
docker compose up -d
```

Check that the container is running:

```bash
docker compose ps
docker compose logs -f app   # optional: follow logs
```

### 5. Access the app

- **On the server:** http://localhost:4080  
- **From other machines:** http://YOUR_SERVER_IP:4080  

Open the firewall if needed:

```bash
sudo ufw allow 4080/tcp
sudo ufw reload
```

---

## Optional: Use port 80 and a domain

If you want the app on port 80 or behind a domain with HTTPS, put a reverse proxy (e.g. Nginx or Caddy) in front.

### Example: Nginx as reverse proxy (port 80 → 4080)

```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/ai-app
```

Add (replace `your-domain.com` or use your server IP):

```nginx
server {
    listen 80;
    server_name your-domain.com;   # or _ for any host
    location / {
        proxy_pass http://127.0.0.1:4080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/ai-app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Then open http://your-domain.com or http://YOUR_SERVER_IP.

### HTTPS with Let's Encrypt (Caddy example)

```bash
sudo apt install caddy
sudo nano /etc/caddy/Caddyfile
```

Add:

```
your-domain.com {
    reverse_proxy 127.0.0.1:4080
}
```

```bash
sudo systemctl reload caddy
```

Caddy will obtain and renew a certificate automatically.

---

## Useful commands

| Command | Description |
|--------|-------------|
| `docker compose up -d` | Start in background |
| `docker compose down` | Stop and remove container |
| `docker compose logs -f app` | Follow app logs |
| `docker compose build --no-cache` | Rebuild image from scratch |
| `docker compose pull` | Not used (you build locally) |

## Updating the app

After pulling new code or changing config:

```bash
cd /opt/ai
docker compose build
docker compose up -d
```

Data (e.g. SQLite under `backend/data`) is stored inside the container. For persistence across rebuilds, add a volume in `docker-compose.yml` (see below).

### Persist database across container recreations

In `docker-compose.yml`, add a volume for the backend data directory:

```yaml
services:
  app:
    build: .
    ports:
      - "4080:4000"
    env_file:
      - backend/.env
    environment:
      - PORT=4000
      - NODE_ENV=production
    volumes:
      - app-data:/app/backend/data
    restart: unless-stopped

volumes:
  app-data:
```

Then the SQLite file (and any other files in `backend/data`) will survive `docker compose down` and `up`.
