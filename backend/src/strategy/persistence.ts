import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { Symbol, SetupState } from '../market/types.js';
import type { SetupMap } from './stateMachine.js';

const { Pool } = pg;

export class StrategyPersistence {
  private readonly pool?: pg.Pool;

  constructor() {
    if (config.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: config.DATABASE_URL,
        max: 2,
        ssl: config.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
      });
    }
  }

  async init(): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS strategy_runtime (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async load(setups: SetupMap, lastProcessed: Map<Symbol, number>): Promise<void> {
    if (!this.pool) return;
    const result = await this.pool.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM strategy_runtime WHERE key IN ('setups', 'last_processed')`
    );
    for (const row of result.rows) {
      if (row.key === 'setups' && Array.isArray(row.value)) {
        for (const setup of row.value as SetupState[]) setups.set(setup.id, setup);
      }
      if (row.key === 'last_processed' && row.value && typeof row.value === 'object') {
        for (const [symbol, timestamp] of Object.entries(row.value as Record<string, number>)) {
          if ((symbol === 'EUR/USD' || symbol === 'GBP/USD') && Number.isFinite(timestamp)) lastProcessed.set(symbol, timestamp);
        }
      }
    }
    logger.info({ setupCount: setups.size }, 'strategy state restored');
  }

  async save(setups: SetupMap, lastProcessed: Map<Symbol, number>): Promise<void> {
    if (!this.pool) return;
    const cutoff = Date.now() - 14 * 24 * 60 * 60_000;
    for (const [id, setup] of setups) {
      if (setup.rightShoulderTimeMs < cutoff) setups.delete(id);
    }
    const runtime = Object.fromEntries(lastProcessed.entries());
    await this.pool.query(
      `INSERT INTO strategy_runtime (key, value, updated_at)
       VALUES ('setups', $1::jsonb, now()), ('last_processed', $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
      [JSON.stringify([...setups.values()]), JSON.stringify(runtime)]
    );
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }
}
