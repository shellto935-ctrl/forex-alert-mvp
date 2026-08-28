import type { Candle } from '../market/types.js';

export type RejectionResult = { bullReject: boolean; bearReject: boolean };

export function detectRejection(
  candles: Candle[],
  index: number,
  useEngulfing: boolean,
  usePinBar: boolean
): RejectionResult {
  if (index < 1) return { bullReject: false, bearReject: false };

  const curr = candles[index]!;
  const prev = candles[index - 1]!;
  const mintick = 0.00001;

  const body = Math.max(Math.abs(curr.close - curr.open), mintick);
  const lowerWick = Math.min(curr.open, curr.close) - curr.low;
  const upperWick = curr.high - Math.max(curr.open, curr.close);

  const bullishEngulfing = useEngulfing && curr.close > curr.open && curr.close >= prev.open && curr.open <= prev.close;
  const bearishEngulfing = useEngulfing && curr.close < curr.open && curr.close <= prev.open && curr.open >= prev.close;

  const bullishPin = usePinBar && curr.close > curr.open && lowerWick >= body * 1.5 && curr.close >= (curr.high + curr.low) / 2;
  const bearishPin = usePinBar && curr.close < curr.open && upperWick >= body * 1.5 && curr.close <= (curr.high + curr.low) / 2;

  return {
    bullReject: bullishEngulfing || bullishPin,
    bearReject: bearishEngulfing || bearishPin
  };
}
