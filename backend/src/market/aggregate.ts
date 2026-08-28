import type { Candle } from './types.js';

/**
 * Aggregate 5M candles into 15M candles.
 * Every 3 consecutive 5M candles (sorted oldest-first) form one 15M candle.
 */
export function aggregateTo15m(fiveMinCandles: Candle[]): Candle[] {
  if (fiveMinCandles.length < 3) return [];

  const sorted = [...fiveMinCandles].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const result: Candle[] = [];

  for (let i = 0; i + 2 < sorted.length; i += 3) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const c = sorted[i + 2]!;

    result.push({
      datetime: a.datetime,
      open: a.open,
      high: Math.max(a.high, b.high, c.high),
      low: Math.min(a.low, b.low, c.low),
      close: c.close,
      volume: [a.volume, b.volume, c.volume].filter((v): v is number => v !== undefined).reduce((s, v) => s + v, 0) || undefined
    });
  }

  return result;
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;
    trs.push(Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    ));
  }
  const slice = trs.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / (slice.length || 1);
}
