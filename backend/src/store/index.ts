import { config } from '../config.js';
import { logger } from '../logger.js';
import { MemoryStore } from './memory.js';
import { PostgresStore } from './postgres.js';
import type { SignalStore } from './store.js';

export function createStore(): SignalStore {
  // Always use in-memory store for this alert-only MVP.
  // Postgres is available but the delivery_jobs constraint migration is flaky on Railway.
  // Alert-only system does not need durable storage — signals are ephemeral.
  // When DRY_RUN=false (live notifications), in-memory store is sufficient.
  logger.info('Using in-memory store (alert-only mode)');
  return new MemoryStore();
}
