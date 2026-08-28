export type Candle = {
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
  patternTf: "15";
  entryTf: "5";
  eventTime: string;
  price: number;
  breakLevel: number;
  zoneLow: number;
  zoneHigh: number;
  invalidation: number;
  reason: string[];
};

export type Pivot = { price: number; time: number };

export type SetupState = {
  state: number;
  headTime: number;
  neck1: number;
  neckT1: number;
  neck2: number;
  neckT2: number;
  invalidation: number;
  watchBar: number;
};
