import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { DeliveryChannel, DeliveryResult, Signal } from '../types.js';
import type { PendingDelivery, SignalStore } from './store.js';

const { Pool } = pg;

export class PostgresStore implements SignalStore {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 5,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
    });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS signals (
        id UUID PRIMARY KEY,
        setup_id TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('WATCH', 'ENTRY_READY')),
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (setup_id, stage)
      );
      CREATE TABLE IF NOT EXISTS delivery_jobs (
        id UUID PRIMARY KEY,
        signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
        channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'voice')),
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SUBMITTED', 'FAILED')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        lease_until TIMESTAMPTZ,
        claim_token UUID,
        provider_id TEXT,
        last_error TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (signal_id, channel)
      );
      CREATE INDEX IF NOT EXISTS delivery_jobs_due_idx
        ON delivery_jobs (next_attempt_at, updated_at)
        WHERE status = 'PENDING';
      CREATE INDEX IF NOT EXISTS delivery_jobs_lease_idx
        ON delivery_jobs (lease_until)
        WHERE status = 'PROCESSING';
      UPDATE delivery_jobs SET status='PENDING', claim_token=NULL, lease_until=NULL
        WHERE status='PROCESSING' AND (lease_until IS NULL OR lease_until < now());
    `);
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async insert(signal: Signal): Promise<{ accepted: boolean; id: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const signalId = randomUUID();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO signals (id, setup_id, stage, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (setup_id, stage) DO NOTHING
         RETURNING id`,
        [signalId, signal.setup_id, signal.stage, JSON.stringify(signal)]
      );
      if (!inserted.rowCount) {
        const existing = await client.query<{ id: string }>(
          'SELECT id FROM signals WHERE setup_id=$1 AND stage=$2',
          [signal.setup_id, signal.stage]
        );
        await client.query('COMMIT');
        return { accepted: false, id: existing.rows[0]!.id };
      }

      const channels: DeliveryChannel[] = signal.stage === 'ENTRY_READY' ? ['whatsapp', 'voice'] : ['whatsapp'];
      for (const channel of channels) {
        await client.query(
          `INSERT INTO delivery_jobs (id, signal_id, channel) VALUES ($1, $2, $3)`,
          [randomUUID(), signalId, channel]
        );
      }
      await client.query('COMMIT');
      return { accepted: true, id: signalId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async claimPending(limit: number): Promise<PendingDelivery[]> {
    const result = await this.pool.query<{
      id: string; claim_token: string; payload: Signal; channel: DeliveryChannel; attempts: number;
    }>(
      `WITH picked AS (
         SELECT id FROM delivery_jobs
         WHERE (status='PENDING' AND next_attempt_at <= now())
            OR (status='PROCESSING' AND lease_until < now())
         ORDER BY updated_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE delivery_jobs d
       SET status='PROCESSING', attempts=attempts+1, lease_until=now()+interval '2 minutes',
           claim_token=$2, updated_at=now()
       FROM picked, signals s
       WHERE d.id=picked.id AND s.id=d.signal_id
       RETURNING d.id, d.claim_token, s.payload, d.channel, d.attempts`,
      [limit, randomUUID()]
    );
    return result.rows.map((row) => ({
      id: row.id,
      claimToken: row.claim_token,
      signal: row.payload,
      channel: row.channel,
      attempts: row.attempts
    }));
  }

  async complete(id: string, claimToken: string, result: DeliveryResult): Promise<void> {
    await this.pool.query(
      `UPDATE delivery_jobs
       SET status='SUBMITTED', provider_id=$3, last_error=NULL, claim_token=NULL,
           lease_until=NULL, updated_at=now()
       WHERE id=$1 AND status='PROCESSING' AND claim_token=$2`,
      [id, claimToken, result.providerId ?? null]
    );
  }

  async fail(id: string, claimToken: string, result: DeliveryResult, maxAttempts: number): Promise<void> {
    await this.pool.query(
      `UPDATE delivery_jobs
       SET status=CASE WHEN $3=false OR attempts >= $4 THEN 'FAILED' ELSE 'PENDING' END,
           last_error=$5, claim_token=NULL, lease_until=NULL, updated_at=now(),
           next_attempt_at=now() + (LEAST(60, POWER(2, attempts)) * interval '1 second')
       WHERE id=$1 AND status='PROCESSING' AND claim_token=$2`,
      [id, claimToken, result.retryable !== false, maxAttempts, (result.error ?? 'unknown provider error').slice(0, 1000)]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
