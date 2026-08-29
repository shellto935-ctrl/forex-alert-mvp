import type { Direction, Pivot } from '../market/types.js';

export type NeckLine = { p1: number; t1Ms: number; p2: number; t2Ms: number };
export type PatternCandidate = {
  direction: Direction;
  headTimeMs: number;
  rightShoulderTimeMs: number;
  neckline: NeckLine;
  invalidation: number;
  qualityScore: number;
};

function collapseAlternating(input: Pivot[]): Pivot[] {
  const result: Pivot[] = [];
  for (const pivot of input) {
    const last = result[result.length - 1];
    if (!last || last.kind !== pivot.kind) result.push(pivot);
    else if ((pivot.kind === 'H' && pivot.price > last.price) || (pivot.kind === 'L' && pivot.price < last.price)) result[result.length - 1] = pivot;
  }
  return result;
}

/** Search recent chronological H-L-H-L-H / L-H-L-H-L sequences. */
export function detectPatterns(
  pivots: Pivot[],
  shoulderTolerance: number,
  minHeadDepth: number,
  requireVideoSlope: boolean,
  minDurationMs = 12 * 15 * 60_000,
  maxDurationMs = 72 * 15 * 60_000
): PatternCandidate[] {
  const alternating = collapseAlternating(pivots).slice(-30);
  const found: PatternCandidate[] = [];
  for (let i = 0; i <= alternating.length - 5; i++) {
    const p = alternating.slice(i, i + 5);
    const duration = p[4]!.timeMs - p[0]!.timeMs;
    if (duration < minDurationMs || duration > maxDurationMs) continue;
    const leftWidth = p[2]!.timeMs - p[0]!.timeMs;
    const rightWidth = p[4]!.timeMs - p[2]!.timeMs;
    const widthRatio = leftWidth / rightWidth;
    if (widthRatio < 0.5 || widthRatio > 2.0) continue;

    if (p.map((x) => x.kind).join('') === 'HLHLH') {
      const [left, neck1, head, neck2, right] = p as [Pivot, Pivot, Pivot, Pivot, Pivot];
      if (head.price <= left.price + minHeadDepth || head.price <= right.price + minHeadDepth) continue;
      if (Math.abs(left.price - right.price) > shoulderTolerance) continue;
      if (requireVideoSlope && neck2.price >= neck1.price) continue;
      const symmetry = Math.max(0, 1 - Math.abs(left.price - right.price) / Math.max(shoulderTolerance, Number.EPSILON));
      const prominence = Math.min(1, Math.min(head.price - left.price, head.price - right.price) / Math.max(minHeadDepth * 2, Number.EPSILON));
      found.push({
        direction: 'SELL', headTimeMs: head.timeMs, rightShoulderTimeMs: right.timeMs,
        neckline: { p1: neck1.price, t1Ms: neck1.timeMs, p2: neck2.price, t2Ms: neck2.timeMs },
        invalidation: head.price, qualityScore: Math.round((0.6 * symmetry + 0.4 * prominence) * 100)
      });
    }

    if (p.map((x) => x.kind).join('') === 'LHLHL') {
      const [left, neck1, head, neck2, right] = p as [Pivot, Pivot, Pivot, Pivot, Pivot];
      if (head.price >= left.price - minHeadDepth || head.price >= right.price - minHeadDepth) continue;
      if (Math.abs(left.price - right.price) > shoulderTolerance) continue;
      if (requireVideoSlope && neck2.price <= neck1.price) continue;
      const symmetry = Math.max(0, 1 - Math.abs(left.price - right.price) / Math.max(shoulderTolerance, Number.EPSILON));
      const prominence = Math.min(1, Math.min(left.price - head.price, right.price - head.price) / Math.max(minHeadDepth * 2, Number.EPSILON));
      found.push({
        direction: 'BUY', headTimeMs: head.timeMs, rightShoulderTimeMs: right.timeMs,
        neckline: { p1: neck1.price, t1Ms: neck1.timeMs, p2: neck2.price, t2Ms: neck2.timeMs },
        invalidation: head.price, qualityScore: Math.round((0.6 * symmetry + 0.4 * prominence) * 100)
      });
    }
  }
  return found.sort((a, b) => a.rightShoulderTimeMs - b.rightShoulderTimeMs);
}

export function neckAt(neck: NeckLine, targetTimeMs: number): number {
  const slopePerMs = neck.t2Ms === neck.t1Ms ? 0 : (neck.p2 - neck.p1) / (neck.t2Ms - neck.t1Ms);
  return neck.p2 + slopePerMs * (targetTimeMs - neck.t2Ms);
}
