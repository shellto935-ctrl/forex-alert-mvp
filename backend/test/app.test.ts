import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';

process.env.NODE_ENV = 'test';
process.env.WEBHOOK_SECRET = 'test-secret-at-least-16-characters';
process.env.DRY_RUN = 'true';

const { createApp } = await import('../src/app.js');
const { MemoryStore } = await import('../src/store/memory.js');

const validPayload = {
  token: process.env.WEBHOOK_SECRET,
  version: '1',
  setup_id: 'EURUSD.BUY.1723615200000',
  stage: 'WATCH',
  symbol: 'EURUSD',
  direction: 'BUY',
  session: 'LONDON',
  pattern_tf: '15',
  entry_tf: '5',
  event_time: new Date().toISOString(),
  price: 1.1012,
  break_level: 1.1,
  zone_low: 1.0998,
  zone_high: 1.1002,
  invalidation: 1.095,
  reason: ['INVERSE_HS', 'BULLISH_CHOCH'],
  chart_url: 'https://www.tradingview.com/chart/'
};

describe('TradingView webhook', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const store = new MemoryStore();
    await store.init();
    server = createApp(store).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not bind to TCP');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('reports readiness when the store is reachable', async () => {
    const response = await fetch(`${baseUrl}/readyz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, ready: true });
  });

  it('accepts a valid event and deduplicates the same setup stage', async () => {
    const url = `${baseUrl}/webhook/tradingview`;
    const first = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(validPayload) });
    expect(first.status).toBe(202);
    expect(await first.json()).toMatchObject({ ok: true, accepted: true, duplicate: false });

    const second = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(validPayload) });
    expect(second.status).toBe(202);
    expect(await second.json()).toMatchObject({ ok: true, accepted: false, duplicate: true });
  });

  it('rejects an invalid token', async () => {
    const response = await fetch(`${baseUrl}/webhook/tradingview`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...validPayload, token: 'wrong-token' })
    });
    expect(response.status).toBe(401);
  });

  it('rejects an invalid payload', async () => {
    const response = await fetch(`${baseUrl}/webhook/tradingview`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...validPayload, stage: 'UNKNOWN' })
    });
    expect(response.status).toBe(400);
  });
});
