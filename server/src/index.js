import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

import { getDb, migrate, isSeeded } from './db.js';
import { seed } from '../db/seed.js';
import { sendError } from './http.js';

import auth from './routes/auth.js';
import internships from './routes/internships.js';
import students from './routes/students.js';
import applications from './routes/applications.js';
import admin from './routes/admin.js';
import network from './routes/network.js';
import messages from './routes/messages.js';
import notifications from './routes/notifications.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);

async function prepareDatabase() {
  const db = await getDb();
  const hasSchema = await db.query(
    "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name='app_user'"
  );
  if (!hasSchema.rows[0].n) {
    console.log('[interniq] applying schema.sql');
    await migrate(db);
  }
  if (!(await isSeeded(db))) {
    console.log('[interniq] empty database - generating seed data through the NLP pipeline');
    const t0 = Date.now();
    const summary = await seed(db);
    console.log('[interniq] seeded in', ((Date.now() - t0) / 1000).toFixed(1) + 's', summary);
  }
}

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: true }));
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'InternIQ API', time: new Date().toISOString() }));

app.use('/api/auth', auth);
app.use('/api/internships', internships);
app.use('/api/students', students);
app.use('/api/admin', admin);
app.use('/api', applications);
app.use('/api', network);
app.use('/api', messages);
app.use('/api/notifications', notifications);

app.use('/api', (req, res) => res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` }));

// Serve the production build when it exists (single-process demo mode).
const clientDist = path.join(here, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    const index = path.join(clientDist, 'index.html');
    if (req.method !== 'GET') return next();
    res.sendFile(index, (err) => next(err));
  });
}

app.use((err, req, res, _next) => sendError(err, res));

prepareDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`[interniq] API listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('[interniq] failed to start', err);
    process.exit(1);
  });
