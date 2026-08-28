import { config } from './config.js';
import { logger } from './logger.js';
import { sendWhatsApp } from './providers/whatsapp.js';
import { placeVoiceCall } from './providers/voice.js';
import type { DeliveryResult, Signal } from './types.js';
import type { PendingDelivery, SignalStore } from './store/store.js';
import { fetchLatest5m } from './market/twelvedata.js';
import { aggregateTo15m } from './market/aggregate.js';
import { getSession } from './strategy/session.js';
import { runStrategy, DEFAULT_PARAMS, type SetupMap } from './strategy/stateMachine.js';
import type { Candle, StrategyEvent, SetupState } from './market/types.js';

const SYMBOLS = ["EUR/USD", "GBP/USD"] as const;
const setups: SetupMap = new Map();

function eventToSignal(event: StrategyEvent): Signal {
  return {
    version: '1',
    setup_id: event.setupId,
    stage: event.stage,
    symbol: event.symbol,
    direction: event.direction,
    session: event.session,
    pattern_tf: event.patternTf,
    entry_tf: event.entryTf,
    event_time: event.eventTime,
    price: event.price,
    break_level: event.breakLevel,
    zone_low: event.zoneLow,
    zone_high: event.zoneHigh,
    invalidation: event.invalidation,
    reason: event.reason
  };
}

async function pollSymbol(store: SignalStore, symbol: "EUR/USD" | "GBP/USD") {
  if (!config.TWELVEDATA_API_KEY) {
    logger.warn('TWELVEDATA_API_KEY is not set; polling disabled');
    return;
  }

  const now = Date.now();
  const session = getSession(now);
  if (session === "NONE") return; // outside kill zones

  const fiveMin: Candle[] = await fetchLatest5m(symbol, 80);
  if (fiveMin.length < 10) return;

  const fifteenMin = aggregateTo15m(fiveMin);
  if (fifteenMin.length < 10) return;

  const events = runStrategy(symbol, fiveMin, fifteenMin, session, DEFAULT_PARAMS, setups);

  for (const event of events) {
    const signal = eventToSignal(event);
    const { accepted, id } = await store.insert(signal);
    if (accepted) {
      logger.info({ setupId: event.setupId, stage: event.stage, symbol: event.symbol }, 'strategy event detected');
      // The delivery worker will pick this up from the store queue.
    }
  }
}

export function startPolling(store: SignalStore): () => Promise<void> {
  let stopped = false;
  let busy = false;

  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      await Promise.all(SYMBOLS.map((symbol) => pollSymbol(store, symbol).catch((err) => {
        logger.error({ err: err, symbol }, 'poll error');
      })));
    } catch (error) {
      logger.error({ err: error }, 'polling tick failed');
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(() => void tick(), config.POLL_INTERVAL_MS);
  void tick();

  return async () => {
    stopped = true;
    clearInterval(timer);
  };
}
