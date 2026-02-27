import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import featuresRouter from './routes/features.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/features', featuresRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ai-ideas-backend' });
});

const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const index = path.join(frontendDist, 'index.html');
    if (fs.existsSync(index)) res.sendFile(index);
    else next();
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`AI Ideas API running at http://localhost:${config.port}`);
  console.log(`Share on network: http://<this-ip>:${config.port}`);
});
