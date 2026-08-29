import { describe, expect, it } from 'vitest';
import { aggregateTo15m } from '../src/market/aggregate.js';
import type { Candle } from '../src/market/types.js';

process.env.WEBHOOK_SECRET = 'test-secret-at-least-16-characters';
process.env.DRY_RUN = 'true';
const { normalizeClosed5m } = await import('../src/market/twelvedata.js');

const raw = (datetime: string, open: number, high: number, low: number, close: number) => ({
  datetime, open: String(open), high: String(high), low: String(low), close: String(close)
});
const candle = (iso: string, open: number, high: number, low: number, close: number): Candle => ({
  openTimeMs: Date.parse(iso), datetime: iso, open, high, low, close
});

describe('market data normalization', () => {
  it('sorts descending provider rows, removes duplicates, and drops forming candles', () => {
    const now = Date.parse('2026-08-29T10:16:00Z');
    const result = normalizeClosed5m([
      raw('2026-08-29 10:15:00', 1, 2, 0.5, 1.5),
      raw('2026-08-29 10:05:00', 1, 2, 0.5, 1.5),
      raw('2026-08-29 10:10:00', 1, 2, 0.5, 1.5),
      raw('2026-08-29 10:05:00', 1, 2, 0.5, 1.5)
    ], now);
    expect(result.map((c) => c.datetime)).toEqual([
      '2026-08-29T10:05:00.000Z', '2026-08-29T10:10:00.000Z'
    ]);
  });
});

describe('15M aggregation', () => {
  it('aligns to UTC quarter-hour boundaries', () => {
    const bars = [
      candle('2026-08-29T10:05:00.000Z', 2, 3, 1, 2.5),
      candle('2026-08-29T10:10:00.000Z', 2.5, 4, 2, 3),
      candle('2026-08-29T10:15:00.000Z', 3, 4, 2, 3.5),
      candle('2026-08-29T10:20:00.000Z', 3.5, 5, 3, 4),
      candle('2026-08-29T10:25:00.000Z', 4, 6, 3.5, 5)
    ];
    const result = aggregateTo15m(bars);
    expect(result).toHaveLength(1);
    expect(result[0]!.datetime).toBe('2026-08-29T10:15:00.000Z');
    expect(result[0]).toMatchObject({ open: 3, high: 6, low: 2, close: 5 });
  });

  it('rejects a bucket with a missing child candle', () => {
    expect(aggregateTo15m([
      candle('2026-08-29T10:00:00.000Z', 1, 2, 0, 1),
      candle('2026-08-29T10:10:00.000Z', 1, 2, 0, 1)
    ])).toEqual([]);
  });
});
