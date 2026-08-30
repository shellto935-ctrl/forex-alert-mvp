import type { Candle } from './types.js';

const FIVE_MIN_MS = 5 * 60_000;

export function canonicalize5m(candles: Candle[], options: { nowMs?: number; settlementMs?: number; trimBeforeLastGap?: boolean } = {}): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const input of candles) {
    const candle: Candle = { ...input, datetime: new Date(input.openTimeMs).toISOString() };
    const values = [candle.open, candle.high, candle.low, candle.close];
    if (!Number.isFinite(candle.openTimeMs) || candle.openTimeMs % FIVE_MIN_MS !== 0) throw new Error(`Invalid 5M timestamp: ${input.datetime}`);
    if (!values.every(Number.isFinite)) {
      // Skip non-finite/corrupt rows silently — provider sometimes returns nulls during low-liquidity periods
      continue;
    }
    // Fix obviously wrong OHLC ordering rather than throwing
    candle.high = Math.max(candle.high, candle.open, candle.close, candle.low);
    candle.low = Math.min(candle.low, candle.open, candle.close);
    if (options.nowMs !== undefined && candle.openTimeMs + FIVE_MIN_MS > options.nowMs - (options.settlementMs ?? 0)) continue;
    const existing = byTime.get(candle.openTimeMs);
    if (existing && (existing.open !== candle.open || existing.high !== candle.high || existing.low !== candle.low || existing.close !== candle.close)) {
      throw new Error(`Conflicting duplicate candle at ${input.datetime}`);
    }
    byTime.set(candle.openTimeMs, candle);
  }

  const sorted = [...byTime.values()].sort((a, b) => a.openTimeMs - b.openTimeMs);
  if (!options.trimBeforeLastGap) return sorted;
  // Live mode never calculates across a provider outage/weekend gap.
  let segmentStart = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.openTimeMs - sorted[i - 1]!.openTimeMs !== FIVE_MIN_MS) segmentStart = i;
  }
  return sorted.slice(segmentStart);
}
