import type { Pivot } from '../market/types.js';

export type NeckLine = { p1: number; t1: number; p2: number; t2: number };

export type PatternResult = {
  bullPattern: boolean;
  bearPattern: boolean;
  bullNeck?: NeckLine;
  bearNeck?: NeckLine;
  bullInvalidation?: number;
  bearInvalidation?: number;
  bullHeadTime?: number;
  bearHeadTime?: number;
};

/**
 * Detect Head-and-Shoulders geometry from the 3 most recent pivot highs and lows.
 *
 * Normal H&S (bearish):
 *   H2 = left shoulder, H1 = head (highest), H0 = right shoulder
 *   L1 and L0 form the neckline (lows between shoulders)
 *
 * Inverse H&S (bullish):
 *   L2 = left shoulder, L1 = head (lowest), L0 = right shoulder
 *   H1 and H0 form the neckline (highs between shoulders)
 */
export function detectPattern(
  highs: Pivot[],
  lows: Pivot[],
  shoulderTol: number,
  minHeadDepth: number,
  requireNeckSlope: boolean
): PatternResult {
  const result: PatternResult = {
    bullPattern: false,
    bearPattern: false
  };

  if (highs.length < 3 || lows.length < 3) return result;

  const h0 = highs[highs.length - 1]!;
  const h1 = highs[highs.length - 2]!;
  const h2 = highs[highs.length - 3]!;
  const l0 = lows[lows.length - 1]!;
  const l1 = lows[lows.length - 2]!;
  const l2 = lows[lows.length - 3]!;

  // Normal H&S (bearish): head must be highest, shoulders similar
  const bearGeometry =
    h2.time < l1.time && l1.time < h1.time && h1.time < l0.time && l0.time < h0.time &&
    h1.price > h2.price + minHeadDepth &&
    h1.price > h0.price + minHeadDepth &&
    Math.abs(h2.price - h0.price) <= shoulderTol;
  const bearSlopeOk = !requireNeckSlope || l0.price < l1.price;

  if (bearGeometry && bearSlopeOk) {
    result.bearPattern = true;
    result.bearNeck = { p1: l1.price, t1: l1.time, p2: l0.price, t2: l0.time };
    result.bearInvalidation = h1.price;
    result.bearHeadTime = h1.time;
  }

  // Inverse H&S (bullish): head must be lowest, shoulders similar
  const bullGeometry =
    l2.time < h1.time && h1.time < l1.time && l1.time < h0.time && h0.time < l0.time &&
    l1.price < l2.price - minHeadDepth &&
    l1.price < l0.price - minHeadDepth &&
    Math.abs(l2.price - l0.price) <= shoulderTol;
  const bullSlopeOk = !requireNeckSlope || h0.price > h1.price;

  if (bullGeometry && bullSlopeOk) {
    result.bullPattern = true;
    result.bullNeck = { p1: h1.price, t1: h1.time, p2: h0.price, t2: h0.time };
    result.bullInvalidation = l1.price;
    result.bullHeadTime = l1.time;
  }

  return result;
}

export function neckAt(neck: NeckLine, targetTime: number): number {
  const slope = neck.t2 === neck.t1 ? 0 : (neck.p2 - neck.p1) / (neck.t2 - neck.t1);
  return neck.p2 + slope * (targetTime - neck.t2);
}
