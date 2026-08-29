import type { Candle } from './types.js';

const FIVE_MIN_MS = 5 * 60_000;
const FIFTEEN_MIN_MS = 15 * 60_000;

/** Aggregate only complete, UTC quarter-hour-aligned 15M buckets. */
export function aggregateTo15m(fiveMinCandles: Candle[]): Candle[] {
  const buckets = new Map<number, Map<number, Candle>>();
  for (const candle of fiveMinCandles) {
    const bucketStart = Math.floor(candle.openTimeMs / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS;
    const slot = (candle.openTimeMs - bucketStart) / FIVE_MIN_MS;
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) continue;
    const children = buckets.get(bucketStart) ?? new Map<number, Candle>();
    children.set(slot, candle);
    buckets.set(bucketStart, children);
  }

  const result: Candle[] = [];
  for (const [bucketStart, children] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (children.size !== 3 || !children.has(0) || !children.has(1) || !children.has(2)) continue;
    const a = children.get(0)!;
    const b = children.get(1)!;
    const c = children.get(2)!;
    result.push({
      openTimeMs: bucketStart,
      datetime: new Date(bucketStart).toISOString(),
      open: a.open,
      high: Math.max(a.high, b.high, c.high),
      low: Math.min(a.low, b.low, c.low),
      close: c.close,
      volume: [a.volume, b.volume, c.volume].every((v) => v !== undefined)
        ? (a.volume! + b.volume! + c.volume!)
        : undefined
    });
  }
  return result;
}

export function trueRange(candles: Candle[], index: number): number {
  const curr = candles[index]!;
  if (index === 0) return curr.high - curr.low;
  const prev = candles[index - 1]!;
  return Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
}

export function atr(candles: Candle[], period = 14, endIndex = candles.length - 1): number {
  if (endIndex < 1) return 0;
  const start = Math.max(1, endIndex - period + 1);
  const values: number[] = [];
  for (let i = start; i <= endIndex; i++) values.push(trueRange(candles, i));
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function medianTrueRange(candles: Candle[], lookback: number, endExclusive: number): number {
  const values: number[] = [];
  for (let i = Math.max(1, endExclusive - lookback); i < endExclusive; i++) values.push(trueRange(candles, i));
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
}
