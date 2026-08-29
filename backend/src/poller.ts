import { config } from './config.js';
import { logger } from './logger.js';
import { fetchLatest5m } from './market/twelvedata.js';
import { aggregateTo15m } from './market/aggregate.js';
import { getSession } from './strategy/session.js';
import { runStrategy, DEFAULT_PARAMS, type SetupMap } from './strategy/stateMachine.js';
import { StrategyPersistence } from './strategy/persistence.js';
import type { Candle, StrategyEvent, Symbol } from './market/types.js';
import type { Signal } from './types.js';
import type { SignalStore } from './store/store.js';

const SYMBOLS: Symbol[] = ['EUR/USD', 'GBP/USD'];
const setups: SetupMap = new Map();
const lastProcessed = new Map<Symbol, number>();
const FIVE_MIN_MS = 5 * 60_000;

function eventToSignal(event: StrategyEvent): Signal {
  return {
    version: '1', setup_id: event.setupId, stage: event.stage,
    symbol: event.symbol, direction: event.direction, session: event.session,
    pattern_tf: '15', entry_tf: '5', event_time: event.eventTime,
    price: event.price, break_level: event.breakLevel,
    zone_low: event.zoneLow, zone_high: event.zoneHigh,
    invalidation: event.invalidation, reason: event.reason
  };
}

function isForexWeekend(nowMs: number): boolean {
  const day = new Date(nowMs).getUTCDay();
  return day === 6 || (day === 0 && new Date(nowMs).getUTCHours() < 21);
}

async function pollSymbol(store: SignalStore, symbol: Symbol, nowMs: number) {
  const fiveMin: Candle[] = await fetchLatest5m(symbol, 250);
  if (fiveMin.length < 60) return;
  const latest = fiveMin[fiveMin.length - 1]!;
  if (nowMs - (latest.openTimeMs + FIVE_MIN_MS) > 15 * 60_000) {
    logger.warn({ symbol, latest: latest.datetime }, 'stale market data; strategy skipped');
    return;
  }
  if (lastProcessed.get(symbol) === latest.openTimeMs) return;
  lastProcessed.set(symbol, latest.openTimeMs);

  const fifteenMin = aggregateTo15m(fiveMin);
  if (fifteenMin.length < 25) return;
  const session = getSession(latest.openTimeMs);
  const events = runStrategy(symbol, fiveMin, fifteenMin, session, DEFAULT_PARAMS, setups);

  for (const event of events) {
    const { accepted } = await store.insert(eventToSignal(event));
    if (accepted) logger.info({ setupId: event.setupId, stage: event.stage, symbol: event.symbol, quality: event.qualityScore }, 'strategy event detected');
  }
}

export function startPolling(store: SignalStore): () => Promise<void> {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let active: Promise<void> | undefined;
  const persistence = new StrategyPersistence();
  const ready = persistence.init()
    .then(() => persistence.load(setups, lastProcessed))
    .catch((error) => logger.error({ err: error }, 'strategy persistence unavailable; continuing in memory'));

  const scheduleNext = () => {
    if (stopped) return;
    const now = Date.now();
    const nextBoundary = Math.floor(now / FIVE_MIN_MS) * FIVE_MIN_MS + FIVE_MIN_MS + 10_000;
    timer = setTimeout(() => void tick(), Math.max(1_000, nextBoundary - now));
    timer.unref();
  };

  const tick = async () => {
    if (stopped || active) return;
    active = (async () => {
      await ready;
      const now = Date.now();
      if (!config.TWELVEDATA_API_KEY) {
        logger.warn('TWELVEDATA_API_KEY is not set; polling disabled');
        return;
      }
      if (isForexWeekend(now)) return;
      await Promise.all(SYMBOLS.map((symbol) => pollSymbol(store, symbol, now).catch((err) => logger.error({ err, symbol }, 'poll error'))));
      await persistence.save(setups, lastProcessed)
        .catch((error) => logger.error({ err: error }, 'strategy state save failed'));
    })();
    try { await active; } finally { active = undefined; scheduleNext(); }
  };

  void tick();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (active) await active;
    await ready;
    await persistence.save(setups, lastProcessed).catch(() => undefined);
    await persistence.close().catch(() => undefined);
  };
}
