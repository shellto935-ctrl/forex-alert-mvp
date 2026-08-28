import { config } from '../config.js';
import { logger } from '../logger.js';
import { MemoryStore } from './memory.js';
import { PostgresStore } from './postgres.js';
import type { SignalStore } from './store.js';

export function createStore(): SignalStore {
  // In DRY_RUN mode, use in-memory store to avoid Postgres migration issues during testing.
  // When DRY_RUN=false (live notifications), Postgres is required for durability.
  if (config.DRY_RUN) {
    logger.info('DRY_RUN mode: using in-memory store for testing');
    return new MemoryStore();
  }
  if (config.DATABASE_URL) return new PostgresStore(config.DATABASE_URL);
  logger.warn('DATABASE_URL is empty; using non-durable in-memory storage');
  return new MemoryStore();
}
