import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import type { SignalStore } from './store/store.js';
import { signalSchema } from './types.js';

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp(store: SignalStore) {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '32kb', strict: true }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true, service: 'forex-alert-backend', version: '0.1.0' });
  });

  app.get('/readyz', async (_req, res) => {
    try {
      await store.ping();
      res.status(200).json({ ok: true, ready: true });
    } catch (error) {
      logger.error({ err: error }, 'readiness check failed');
      res.status(503).json({ ok: false, ready: false });
    }
  });

  app.post('/webhook/tradingview', async (req, res) => {
    const suppliedToken = typeof req.body?.token === 'string' ? req.body.token : '';
    if (!secureEqual(suppliedToken, config.WEBHOOK_SECRET)) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    const parsed = signalSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.issues }, 'invalid TradingView payload');
      res.status(400).json({ ok: false, error: 'invalid_payload', issues: parsed.error.issues });
      return;
    }

    const eventTime = Date.parse(parsed.data.event_time);
    const now = Date.now();
    if (eventTime > now + 10 * 60_000 || eventTime < now - 2 * 60 * 60_000) {
      res.status(400).json({ ok: false, error: 'stale_or_future_event' });
      return;
    }

    try {
      const result = await store.insert(parsed.data);
      res.status(202).json({ ok: true, accepted: result.accepted, duplicate: !result.accepted, event_id: result.id });
    } catch (error) {
      req.log.error({ err: error }, 'failed to persist webhook event');
      res.status(503).json({ ok: false, error: 'storage_unavailable' });
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.warn({ err: error }, 'request parsing failed');
    res.status(400).json({ ok: false, error: 'invalid_json' });
  });

  return app;
}
