import type { Candle, Pivot } from '../market/types.js';

/** Confirmed, non-repainting pivots. A pivot is usable only after right bars close. */
export function detectPivots(candles: Candle[], left = 2, right = 2): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const candle = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j]!.high >= candle.high) isHigh = false;
      if (candles[j]!.low <= candle.low) isLow = false;
    }
    if (isHigh) pivots.push({ kind: 'H', price: candle.high, timeMs: candle.openTimeMs, candleIndex: i });
    if (isLow) pivots.push({ kind: 'L', price: candle.low, timeMs: candle.openTimeMs, candleIndex: i });
  }
  return pivots.sort((a, b) => a.timeMs - b.timeMs || a.kind.localeCompare(b.kind));
}
