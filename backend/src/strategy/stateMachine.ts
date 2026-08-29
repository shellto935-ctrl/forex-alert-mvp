import type { Candle, Direction, Session, StrategyEvent, SetupState } from '../market/types.js';
import { getSession, type SessionType } from './session.js';
import { detectPivots } from './pivots.js';
import { detectPatterns, neckAt, type PatternCandidate } from './pattern.js';
import { detectRejection } from './rejection.js';
import { atr, medianTrueRange, trueRange } from '../market/aggregate.js';

const FIVE_MIN_MS = 5 * 60_000;

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
  displacementMultiplier: number;
  displacementBodyRatio: number;
  closeExtremeFraction: number;
  minQualityScore: number;
  requireLiquiditySweep: boolean;
};

export const DEFAULT_PARAMS: StrategyParams = {
  pivotLen: 2,
  shoulderTolAtr: 0.50,
  minHeadDepthAtr: 0.20,
  breakBufferAtr: 0.05,
  retestZoneAtr: 0.10,
  expiryBars: 8,
  requireNeckSlope: true,
  useEngulfing: true,
  usePinBar: true,
  displacementMultiplier: 1.5,
  displacementBodyRatio: 0.60,
  closeExtremeFraction: 0.25,
  minQualityScore: 70,
  requireLiquiditySweep: true
};

export type SetupMap = Map<string, SetupState>;

function setupId(symbol: string, candidate: PatternCandidate): string {
  return `${symbol.replace('/', '')}.${candidate.direction}.${candidate.headTimeMs}.${candidate.rightShoulderTimeMs}`;
}

function liquiditySweep(candidate: PatternCandidate, candles: Candle[], htfAtr: number): boolean {
  const headIndex = candles.findIndex((c) => c.openTimeMs === candidate.headTimeMs);
  if (headIndex < 3) return false;
  const prior = candles.slice(Math.max(0, headIndex - 32), headIndex);
  if (!prior.length) return false;
  if (candidate.direction === 'SELL') {
    const reference = Math.max(...prior.map((c) => c.high));
    const pierced = candles[headIndex]!.high >= reference + 0.05 * htfAtr;
    const reclaimed = candles.slice(headIndex + 1, headIndex + 4).some((c) => c.close < reference);
    return pierced && reclaimed;
  }
  const reference = Math.min(...prior.map((c) => c.low));
  const pierced = candles[headIndex]!.low <= reference - 0.05 * htfAtr;
  const reclaimed = candles.slice(headIndex + 1, headIndex + 4).some((c) => c.close > reference);
  return pierced && reclaimed;
}

function displacement(candles: Candle[], index: number, direction: Direction, params: StrategyParams): boolean {
  if (index < 20) return false;
  const candle = candles[index]!;
  const range = candle.high - candle.low;
  if (range <= 0) return false;
  const median = medianTrueRange(candles, 20, index);
  const bodyRatio = Math.abs(candle.close - candle.open) / range;
  const extremeOk = direction === 'BUY'
    ? candle.close >= candle.high - range * params.closeExtremeFraction
    : candle.close <= candle.low + range * params.closeExtremeFraction;
  return trueRange(candles, index) >= params.displacementMultiplier * median
    && bodyRatio >= params.displacementBodyRatio
    && extremeOk;
}

function eventFrom(setup: SetupState, stage: 'WATCH' | 'ENTRY_READY', candle: Candle, level: number, zoneHalf: number, reason: string[]): StrategyEvent {
  return {
    setupId: setup.id,
    stage,
    symbol: setup.symbol.replace('/', ''),
    direction: setup.direction,
    session: setup.session!,
    eventTime: new Date(candle.openTimeMs + (stage === 'WATCH' ? 15 * 60_000 : FIVE_MIN_MS)).toISOString(),
    price: candle.close,
    breakLevel: level,
    zoneLow: level - zoneHalf,
    zoneHigh: level + zoneHalf,
    invalidation: setup.invalidation,
    reason: [...reason, `QUALITY_${setup.qualityScore}`],
    qualityScore: setup.qualityScore
  };
}

/** Pure bar-close strategy evaluation. Input candles must be closed and ascending. */
export function runStrategy(
  symbol: string,
  fiveMinCandles: Candle[],
  fifteenMinCandles: Candle[],
  currentSession: SessionType,
  params: StrategyParams,
  setups: SetupMap
): StrategyEvent[] {
  if (fiveMinCandles.length < 60 || fifteenMinCandles.length < 25) return [];
  const events: StrategyEvent[] = [];
  const last5m = fiveMinCandles[fiveMinCandles.length - 1]!;
  const last15m = fifteenMinCandles[fifteenMinCandles.length - 1]!;
  const htfSession = getSession(last15m.openTimeMs);
  const htfAtr = atr(fifteenMinCandles, 14);
  const atr5 = atr(fiveMinCandles, 14);
  if (!htfAtr || !atr5) return [];

  // Invalidation always precedes breakout/retest logic and runs outside sessions.
  for (const setup of setups.values()) {
    if (setup.symbol !== symbol || !['DETECTED', 'WATCHING'].includes(setup.status)) continue;
    const candle = setup.status === 'DETECTED' ? last15m : last5m;
    const invalid = setup.direction === 'BUY' ? candle.low <= setup.invalidation : candle.high >= setup.invalidation;
    if (invalid) {
      setup.status = 'INVALIDATED';
      continue;
    }
    if (setup.status === 'WATCHING' && setup.expiresAtMs && last5m.openTimeMs >= setup.expiresAtMs) setup.status = 'EXPIRED';
  }

  const pivots = detectPivots(fifteenMinCandles, params.pivotLen, params.pivotLen);
  const candidates = detectPatterns(pivots, htfAtr * params.shoulderTolAtr, htfAtr * params.minHeadDepthAtr, params.requireNeckSlope);
  for (const candidate of candidates) {
    const id = setupId(symbol, candidate);
    if (setups.has(id)) continue;
    const swept = liquiditySweep(candidate, fifteenMinCandles, htfAtr);
    const qualityScore = Math.min(100, candidate.qualityScore + (swept ? 15 : 0));
    const afterRightShoulder = fifteenMinCandles.filter((candle) => candle.openTimeMs > candidate.rightShoulderTimeMs);
    const invalidatedSinceFormation = candidate.direction === 'BUY'
      ? afterRightShoulder.some((candle) => candle.low <= candidate.invalidation)
      : afterRightShoulder.some((candle) => candle.high >= candidate.invalidation);
    setups.set(id, {
      id, status: invalidatedSinceFormation ? 'INVALIDATED' : 'DETECTED', symbol, direction: candidate.direction,
      headTimeMs: candidate.headTimeMs, rightShoulderTimeMs: candidate.rightShoulderTimeMs,
      neck1: candidate.neckline.p1, neckT1Ms: candidate.neckline.t1Ms,
      neck2: candidate.neckline.p2, neckT2Ms: candidate.neckline.t2Ms,
      invalidation: candidate.invalidation, qualityScore, liquiditySweep: swept
    });
  }

  if (htfSession !== 'NONE') {
    for (const setup of setups.values()) {
      if (setup.symbol !== symbol || setup.status !== 'DETECTED') continue;
      if ((params.requireLiquiditySweep && !setup.liquiditySweep) || setup.qualityScore < params.minQualityScore) continue;
      const level = neckAt({ p1: setup.neck1, t1Ms: setup.neckT1Ms, p2: setup.neck2, t2Ms: setup.neckT2Ms }, last15m.openTimeMs);
      const bodyBreak = setup.direction === 'BUY'
        ? last15m.close > level + htfAtr * params.breakBufferAtr
        : last15m.close < level - htfAtr * params.breakBufferAtr;
      if (!bodyBreak || !displacement(fifteenMinCandles, fifteenMinCandles.length - 1, setup.direction, params)) continue;

      setup.status = 'WATCHING';
      setup.session = htfSession as Session;
      setup.watchTimeMs = last15m.openTimeMs;
      setup.breakoutTimeMs = last15m.openTimeMs;
      setup.expiresAtMs = last15m.openTimeMs + 15 * 60_000 + params.expiryBars * FIVE_MIN_MS;
      setup.qualityScore = Math.min(100, setup.qualityScore + 15);
      const zoneHalf = atr5 * params.retestZoneAtr;
      events.push(eventFrom(setup, 'WATCH', last15m, level, zoneHalf,
        [setup.direction === 'BUY' ? 'INVERSE_HS' : 'HEAD_SHOULDERS', 'LIQUIDITY_SWEEP', 'CHOCH_MSS', 'DISPLACEMENT', 'BODY_CLOSE_BREAK']));
    }
  }

  // Retest must occur on a later closed 5M candle and inside the same active session.
  if (currentSession !== 'NONE') {
    for (const setup of setups.values()) {
      if (setup.symbol !== symbol || setup.status !== 'WATCHING' || setup.session !== currentSession) continue;
      if (!setup.breakoutTimeMs || last5m.openTimeMs < setup.breakoutTimeMs + 15 * 60_000) continue;
      if (setup.expiresAtMs && last5m.openTimeMs >= setup.expiresAtMs) {
        setup.status = 'EXPIRED';
        continue;
      }
      const level = neckAt({ p1: setup.neck1, t1Ms: setup.neckT1Ms, p2: setup.neck2, t2Ms: setup.neckT2Ms }, last5m.openTimeMs);
      const zoneHalf = atr5 * params.retestZoneAtr;
      const touched = last5m.low <= level + zoneHalf && last5m.high >= level - zoneHalf;
      const rejection = detectRejection(fiveMinCandles, fiveMinCandles.length - 1, params.useEngulfing, params.usePinBar);
      const accepted = setup.direction === 'BUY'
        ? touched && last5m.close > level && rejection.bullReject
        : touched && last5m.close < level && rejection.bearReject;
      if (!accepted) continue;
      setup.status = 'ENTERED';
      events.push(eventFrom(setup, 'ENTRY_READY', last5m, level, zoneHalf,
        [setup.direction === 'BUY' ? 'INVERSE_HS' : 'HEAD_SHOULDERS', '5M_RETEST', setup.direction === 'BUY' ? 'BULLISH_REJECTION' : 'BEARISH_REJECTION']));
    }
  }

  return events;
}
