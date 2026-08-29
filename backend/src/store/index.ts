import { config } from '../config.js';
import { logger } from '../logger.js';
import { MemoryStore } from './memory.js';
import { PostgresStore } from './postgres.js';
import type { SignalStore } from './store.js';

export function createStore(): SignalStore {
  if (config.DATABASE_URL) {
    logger.info('Using durable PostgreSQL signal outbox');
    return new PostgresStore(config.DATABASE_URL);
  }
  logger.warn('DATABASE_URL unavailable; using non-durable memory store');
  return new MemoryStore();
}
