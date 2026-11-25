// Two separate HTTP servers:
//   • Fan API      (PORT, default 4000)          — events, checkout, tickets, squads, M-Pesa callback
//   • Business API (BUSINESS_PORT, default 4100) — organizer dashboard + gate scanner
// The fan server has no organizer or gate routes at all, so nothing about the business system
// is reachable or discoverable from the public site. SERVICE=public|business|all picks what runs
// in this process (deploy them as separate services on separate domains in production).
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config, ROOT } from './config.js';
import { connectDb } from './db.js';
import { reconcile } from './orders.js';
import { isSimulated } from './mpesa.js';
import { seedIfEmpty } from './seed.js';
import { pub } from './routes/public.js';
import { me } from './routes/me.js';
import { org } from './routes/org.js';
import { gate } from './routes/gate.js';
import { UserError } from './util.js';

function makeApp(mounts: [string, Router][], distDir: string, extraHeaders: Record<string, string> = {}) {
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', ...extraHeaders });
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  for (const [prefix, router] of mounts) app.use(prefix, router);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  if (existsSync(distDir)) {
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  }
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
    if ((err as { type?: string }).type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}

const service = (process.env.SERVICE || 'all').toLowerCase();
// Hosts like Render hand each service one PORT; a business-only service listens there.
const businessPort = service === 'business' && process.env.PORT ? Number(process.env.PORT) : config.businessPort;
await connectDb();
// Demo data only for local runs (embedded DB) or when explicitly asked — never into a real database by accident.
if (!config.mongoUri || process.env.SEED_DEMO === 'true') await seedIfEmpty();

if (service === 'all' || service === 'public') {
  makeApp([['/api', pub], ['/api', me]], path.join(ROOT, 'web', 'dist')).listen(config.port, () => {
    console.log(`[fan api]      http://localhost:${config.port}  ·  M-Pesa: ${config.mpesa.mode}${isSimulated ? ' (fake phone at /simulator)' : ''}`);
  });
  // Only one process should poll Safaricom for missing callbacks.
  setInterval(() => reconcile().catch((e) => console.error('[reconcile]', e.message)), 15000);
}
if (service === 'all' || service === 'business') {
  // Business system: never indexed by search engines, never framed by other sites.
  makeApp([['/api/org', org], ['/api/gate', gate]], path.join(ROOT, 'business', 'dist'), {
    'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store',
  }).listen(businessPort, () => console.log(`[business api] http://localhost:${businessPort}`));
}
