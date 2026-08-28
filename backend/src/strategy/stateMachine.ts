import type { Candle, StrategyEvent, SetupState } from '../market/types.js';
import type { SessionType } from './session.js';
import { detectPivots } from './pivots.js';
import { detectPattern, neckAt, type PatternResult } from './pattern.js';
import { detectRejection } from './rejection.js';
import { atr } from '../market/aggregate.js';

export type StrategyParams = {
  pivotLen: number;
  shoulderTolAtr: number;
  minHeadDepthAtr: number;
  breakBufferAtr: number;
  retestZoneAtr: number;
  expiryBars: number;
  requireNeckSlope: boolean;
  useEngulfing: boolean;
  usePinBar: boolean;
};

export const DEFAULT_PARAMS: StrategyParams = {
  pivotLen: 2,
  shoulderTolAtr: 0.60,
  minHeadDepthAtr: 0.35,
  breakBufferAtr: 0.05,
  retestZoneAtr: 0.20,
  expiryBars: 24,
  requireNeckSlope: true,
  useEngulfing: true,
  usePinBar: true
};

export type SetupMap = Map<string, SetupState>;

/**
 * Run the strategy engine on the latest candle data for a single symbol.
 * Returns any new WATCH or ENTRY_READY events.
 */
export function runStrategy(
  symbol: string,
  fiveMinCandles: Candle[],
  fifteenMinCandles: Candle[],
  session: SessionType,
  params: StrategyParams,
  setups: SetupMap
): StrategyEvent[] {
  if (session === "NONE") return [];
  if (fiveMinCandles.length < 10 || fifteenMinCandles.length < 10) return [];

  const events: StrategyEvent[] = [];
  const htfAtr = atr(fifteenMinCandles, 14);
  const atr5 = atr(fiveMinCandles, 14);
  const shoulderTol = htfAtr * params.shoulderTolAtr;
  const minHeadDepth = htfAtr * params.minHeadDepthAtr;

  const { highs, lows } = detectPivots(fifteenMinCandles, params.pivotLen, params.pivotLen);
  const pattern: PatternResult = detectPattern(highs, lows, shoulderTol, minHeadDepth, params.requireNeckSlope);

  const lastHtf = fifteenMinCandles[fifteenMinCandles.length - 1]!;
  const lastHtfIdx = fifteenMinCandles.length - 1;
  const last5mIdx = fiveMinCandles.length - 1;
  const last5m = fiveMinCandles[last5mIdx]!;

  const sessionName = session;

  // --- BULLISH (inverse H&S) ---
  const bullKey = `${symbol}:BUY`;
  let bull = setups.get(bullKey);

  if (pattern.bullPattern && pattern.bullNeck && pattern.bullHeadTime !== undefined) {
    const headTime = pattern.bullHeadTime;
    const existing = bull;
    if (!existing || existing.headTime !== headTime) {
      bull = {
        state: 0,
        headTime,
        neck1: pattern.bullNeck.p1,
        neckT1: pattern.bullNeck.t1,
        neck2: pattern.bullNeck.p2,
        neckT2: pattern.bullNeck.t2,
        invalidation: pattern.bullInvalidation!,
        watchBar: -1
      };
      setups.set(bullKey, bull);
    }
  }

  if (bull && bull.state === 0 && pattern.bullNeck) {
    const neckHtf = neckAt({ p1: bull.neck1, t1: bull.neckT1, p2: bull.neck2, t2: bull.neckT2 }, lastHtfIdx);
    if (lastHtf.close > neckHtf + htfAtr * params.breakBufferAtr) {
      bull.state = 1;
      bull.watchBar = last5mIdx;
      const zoneHalf = atr5 * params.retestZoneAtr;
      events.push(makeEvent(symbol, "BUY", "WATCH", sessionName, lastHtf.close, neckHtf, neckHtf - zoneHalf, neckHtf + zoneHalf, bull.invalidation, ["INVERSE_HS", "BULLISH_CHOCH", "BODY_CLOSE_BREAK"]));
    }
  }

  if (bull && bull.state === 1 && pattern.bullNeck) {
    const neckNow = neckAt({ p1: bull.neck1, t1: bull.neckT1, p2: bull.neck2, t2: bull.neckT2 }, last5mIdx);
    const zoneHalf = atr5 * params.retestZoneAtr;
    const touched = last5m.low <= neckNow + zoneHalf && last5m.high >= neckNow - zoneHalf;
    const { bullReject } = detectRejection(fiveMinCandles, last5mIdx, params.useEngulfing, params.usePinBar);

    if (touched && last5m.close > neckNow && bullReject) {
      bull.state = 2;
      events.push(makeEvent(symbol, "BUY", "ENTRY_READY", sessionName, last5m.close, neckNow, neckNow - zoneHalf, neckNow + zoneHalf, bull.invalidation, ["INVERSE_HS", "BULLISH_CHOCH", "5M_RETEST", "BULLISH_REJECTION"]));
    }

    if (last5mIdx - bull.watchBar > params.expiryBars || last5m.low < bull.invalidation) {
      bull.state = 0;
    }
  }

  // --- BEARISH (normal H&S) ---
  const bearKey = `${symbol}:SELL`;
  let bear = setups.get(bearKey);

  if (pattern.bearPattern && pattern.bearNeck && pattern.bearHeadTime !== undefined) {
    const headTime = pattern.bearHeadTime;
    const existing = bear;
    if (!existing || existing.headTime !== headTime) {
      bear = {
        state: 0,
        headTime,
        neck1: pattern.bearNeck.p1,
        neckT1: pattern.bearNeck.t1,
        neck2: pattern.bearNeck.p2,
        neckT2: pattern.bearNeck.t2,
        invalidation: pattern.bearInvalidation!,
        watchBar: -1
      };
      setups.set(bearKey, bear);
    }
  }

  if (bear && bear.state === 0 && pattern.bearNeck) {
    const neckHtf = neckAt({ p1: bear.neck1, t1: bear.neckT1, p2: bear.neck2, t2: bear.neckT2 }, lastHtfIdx);
    if (lastHtf.close < neckHtf - htfAtr * params.breakBufferAtr) {
      bear.state = 1;
      bear.watchBar = last5mIdx;
      const zoneHalf = atr5 * params.retestZoneAtr;
      events.push(makeEvent(symbol, "SELL", "WATCH", sessionName, lastHtf.close, neckHtf, neckHtf - zoneHalf, neckHtf + zoneHalf, bear.invalidation, ["HEAD_SHOULDERS", "BEARISH_CHOCH", "BODY_CLOSE_BREAK"]));
    }
  }

  if (bear && bear.state === 1 && pattern.bearNeck) {
    const neckNow = neckAt({ p1: bear.neck1, t1: bear.neckT1, p2: bear.neck2, t2: bear.neckT2 }, last5mIdx);
    const zoneHalf = atr5 * params.retestZoneAtr;
    const touched = last5m.high >= neckNow - zoneHalf && last5m.low <= neckNow + zoneHalf;
    const { bearReject } = detectRejection(fiveMinCandles, last5mIdx, params.useEngulfing, params.usePinBar);

    if (touched && last5m.close < neckNow && bearReject) {
      bear.state = 2;
      events.push(makeEvent(symbol, "SELL", "ENTRY_READY", sessionName, last5m.close, neckNow, neckNow - zoneHalf, neckNow + zoneHalf, bear.invalidation, ["HEAD_SHOULDERS", "BEARISH_CHOCH", "5M_RETEST", "BEARISH_REJECTION"]));
    }

    if (last5mIdx - bear.watchBar > params.expiryBars || last5m.high > bear.invalidation) {
      bear.state = 0;
    }
  }

  return events;
}

function makeEvent(
  symbol: string,
  direction: "BUY" | "SELL",
  stage: "WATCH" | "ENTRY_READY",
  session: "LONDON" | "NY_PM",
  price: number,
  breakLevel: number,
  zoneLow: number,
  zoneHigh: number,
  invalidation: number,
  reason: string[]
): StrategyEvent {
  const now = new Date().toISOString();
  const setupId = `${symbol.replace('/', '')}.${direction}.${Math.floor(Date.now() / 1000)}`;
  return {
    setupId,
    stage,
    symbol: symbol.replace('/', ''),
    direction,
    session,
    patternTf: "15",
    entryTf: "5",
    eventTime: now,
    price,
    breakLevel,
    zoneLow,
    zoneHigh,
    invalidation,
    reason
  };
}
