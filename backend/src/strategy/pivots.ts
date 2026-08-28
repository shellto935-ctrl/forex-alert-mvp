import type { Candle, Pivot } from '../market/types.js';

/**
 * Detect pivot highs and pivot lows from candle data.
 * A pivot high at index i requires `left` bars before and `right` bars after
 * all having lower highs. Symmetric for pivot lows.
 */
export function detectPivots(candles: Candle[], left = 2, right = 2): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];

  for (let i = left; i < candles.length - right; i++) {
    const pivotHigh = candles[i]!.high;
    const pivotLow = candles[i]!.low;
    let isHigh = true;
    let isLow = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j]!.high >= pivotHigh) { isHigh = false; }
      if (candles[j]!.low <= pivotLow) { isLow = false; }
    }

    if (isHigh) highs.push({ price: pivotHigh, time: i });
    if (isLow) lows.push({ price: pivotLow, time: i });
  }

  return { highs, lows };
}
