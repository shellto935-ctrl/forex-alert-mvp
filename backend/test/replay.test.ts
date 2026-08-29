import { describe, expect, it } from 'vitest';
import { replay } from '../src/backtest/replay.js';
import type { Candle } from '../src/market/types.js';

const candles: Candle[] = Array.from({ length: 100 }, (_, index) => {
  const open = 1.10 + Math.sin(index / 5) * 0.001;
  return {
    openTimeMs: Date.parse('2026-07-15T06:00:00Z') + index * 5 * 60_000,
    datetime: new Date(Date.parse('2026-07-15T06:00:00Z') + index * 5 * 60_000).toISOString(),
    open, high: open + 0.0004, low: open - 0.0004, close: open + 0.0001
  };
});

describe('deterministic replay', () => {
  it('produces byte-identical output across repeated runs', () => {
    expect(JSON.stringify(replay('EUR/USD', candles))).toBe(JSON.stringify(replay('EUR/USD', candles)));
  });
});
