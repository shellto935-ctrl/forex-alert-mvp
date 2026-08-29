import type { Candle, StrategyEvent, Symbol } from '../market/types.js';
import { aggregateTo15m } from '../market/aggregate.js';
import { canonicalize5m } from '../market/normalize.js';
import { getSession } from '../strategy/session.js';
import { DEFAULT_PARAMS, runStrategy, type SetupMap, type StrategyParams } from '../strategy/stateMachine.js';

export type ReplayResult = { events: StrategyEvent[]; processedBars: number };

/** Deterministic prefix replay: each call sees only candles closed at that time. */
export function replay(symbol: Symbol, candles: Candle[], params: StrategyParams = DEFAULT_PARAMS): ReplayResult {
  const sorted = canonicalize5m(candles);
  let setups: SetupMap = new Map();
  const events: StrategyEvent[] = [];
  let segmentStart = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]!.openTimeMs - sorted[i - 1]!.openTimeMs !== 5 * 60_000) {
      segmentStart = i;
      setups = new Map();
    }
    const prefix = sorted.slice(segmentStart, i + 1);
    if (prefix.length < 60) continue;
    const fifteen = aggregateTo15m(prefix);
    if (fifteen.length < 25) continue;
    events.push(...runStrategy(symbol, prefix, fifteen, getSession(prefix[prefix.length - 1]!.openTimeMs), params, setups));
  }
  return { events, processedBars: sorted.length };
}

export type Outcome = 'WIN_1R' | 'WIN_2R' | 'LOSS' | 'TIMEOUT' | 'AMBIGUOUS' | 'NO_FILL';
export type LabeledEvent = { event: StrategyEvent; outcome: Outcome; mfeR: number; maeR: number };

export function labelEntries(events: StrategyEvent[], candles: Candle[], horizonBars = 72): LabeledEvent[] {
  const sorted = canonicalize5m(candles);
  return events.filter((event) => event.stage === 'ENTRY_READY').map((event) => {
    const eventTime = Date.parse(event.eventTime);
    const entryIndex = sorted.findIndex((c) => c.openTimeMs >= eventTime);
    if (entryIndex < 0) return { event, outcome: 'NO_FILL' as const, mfeR: 0, maeR: 0 };
    const entry = sorted[entryIndex]!.open;
    const risk = Math.abs(entry - event.invalidation);
    if (!risk) return { event, outcome: 'NO_FILL' as const, mfeR: 0, maeR: 0 };
    let mfeR = 0;
    let maeR = 0;
    let outcome: Outcome = 'TIMEOUT';
    for (const candle of sorted.slice(entryIndex, entryIndex + horizonBars)) {
      const favorable = event.direction === 'BUY' ? candle.high - entry : entry - candle.low;
      const adverse = event.direction === 'BUY' ? entry - candle.low : candle.high - entry;
      mfeR = Math.max(mfeR, favorable / risk);
      maeR = Math.max(maeR, adverse / risk);
      const hitStop = event.direction === 'BUY' ? candle.low <= event.invalidation : candle.high >= event.invalidation;
      const hit2R = favorable >= 2 * risk;
      const hit1R = favorable >= risk;
      if (hitStop && hit1R) { outcome = 'AMBIGUOUS'; break; }
      if (hitStop) { outcome = 'LOSS'; break; }
      if (hit2R) { outcome = 'WIN_2R'; break; }
      if (hit1R) outcome = 'WIN_1R';
    }
    return { event, outcome, mfeR, maeR };
  });
}
