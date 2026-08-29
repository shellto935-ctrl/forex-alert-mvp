export type Candle = {
  /** UTC bar-open timestamp. */
  openTimeMs: number;
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type Symbol = "EUR/USD" | "GBP/USD";
export type Direction = "BUY" | "SELL";
export type Stage = "WATCH" | "ENTRY_READY";
export type Session = "LONDON" | "NY_PM";

export type StrategyEvent = {
  setupId: string;
  stage: Stage;
  symbol: string;
  direction: Direction;
  session: Session;
  eventTime: string;
  price: number;
  breakLevel: number;
  zoneLow: number;
  zoneHigh: number;
  invalidation: number;
  reason: string[];
  qualityScore: number;
};

export type PivotKind = "H" | "L";
export type Pivot = {
  kind: PivotKind;
  price: number;
  timeMs: number;
  candleIndex: number;
};

export type SetupStatus = "DETECTED" | "WATCHING" | "ENTERED" | "EXPIRED" | "INVALIDATED";

export type SetupState = {
  id: string;
  status: SetupStatus;
  symbol: string;
  direction: Direction;
  headTimeMs: number;
  rightShoulderTimeMs: number;
  neck1: number;
  neckT1Ms: number;
  neck2: number;
  neckT2Ms: number;
  invalidation: number;
  qualityScore: number;
  liquiditySweep: boolean;
  session?: Session;
  watchTimeMs?: number;
  breakoutTimeMs?: number;
  expiresAtMs?: number;
};
