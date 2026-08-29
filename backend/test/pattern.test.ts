import { describe, expect, it } from 'vitest';
import { detectPatterns, neckAt } from '../src/strategy/pattern.js';
import type { Pivot } from '../src/market/types.js';

const MIN = 60_000;
const p = (kind: 'H' | 'L', price: number, minute: number): Pivot => ({ kind, price, timeMs: minute * MIN, candleIndex: minute / 15 });

describe('chronological H&S detection', () => {
  it('detects a bearish H-L-H-L-H sequence with stable timestamps', () => {
    const candidates = detectPatterns([
      p('H', 1.1000, 0), p('L', 1.0950, 45), p('H', 1.1030, 90),
      p('L', 1.0945, 135), p('H', 1.1002, 180)
    ], 0.0005, 0.001, true, 0, 10 * 60 * MIN);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ direction: 'SELL', headTimeMs: 90 * MIN, rightShoulderTimeMs: 180 * MIN });
    expect(neckAt(candidates[0]!.neckline, 180 * MIN)).toBeCloseTo(1.09425, 6);
  });

  it('rejects shoulders outside tolerance', () => {
    expect(detectPatterns([
      p('H', 1.1000, 0), p('L', 1.0950, 45), p('H', 1.1040, 90),
      p('L', 1.0945, 135), p('H', 1.1020, 180)
    ], 0.0005, 0.001, true, 0, 10 * 60 * MIN)).toEqual([]);
  });
});
