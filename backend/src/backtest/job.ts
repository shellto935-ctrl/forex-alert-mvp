import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { Candle, Symbol } from '../market/types.js';
import { fetchHistorical5m } from '../market/twelvedata.js';
import { labelEntries, replay } from './replay.js';
import { DEFAULT_PARAMS, type StrategyParams } from '../strategy/stateMachine.js';

const { Pool } = pg;
const pool = config.DATABASE_URL ? new Pool({ connectionString: config.DATABASE_URL, max: 2, ssl: config.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } }) : undefined;
const VERSION = 'strategy-v0.2-2026-08-29';
const SYMBOLS: Symbol[] = ['EUR/USD', 'GBP/USD'];

const BASELINE: StrategyParams = {
  ...DEFAULT_PARAMS,
  shoulderTolAtr: 0.60,
  minHeadDepthAtr: 0.35,
  retestZoneAtr: 0.20,
  expiryBars: 24,
  requireLiquiditySweep: false,
  minQualityScore: 0,
  displacementMultiplier: 0,
  displacementBodyRatio: 0,
  closeExtremeFraction: 1
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function init() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS historical_candles (
      symbol TEXT NOT NULL,
      open_time TIMESTAMPTZ NOT NULL,
      open DOUBLE PRECISION NOT NULL,
      high DOUBLE PRECISION NOT NULL,
      low DOUBLE PRECISION NOT NULL,
      close DOUBLE PRECISION NOT NULL,
      PRIMARY KEY (symbol, open_time)
    );
    CREATE TABLE IF NOT EXISTS backtest_runs (
      id UUID PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      progress JSONB,
      report JSONB,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function update(id: string, fields: { status?: string; progress?: unknown; report?: unknown; error?: string }) {
  await pool?.query(
    `UPDATE backtest_runs SET status=COALESCE($2,status), progress=COALESCE($3::jsonb,progress), report=COALESCE($4::jsonb,report), error=COALESCE($5,error), updated_at=now() WHERE id=$1`,
    [id, fields.status ?? null, fields.progress ? JSON.stringify(fields.progress) : null, fields.report ? JSON.stringify(fields.report) : null, fields.error ?? null]
  );
}

async function insertCandles(symbol: Symbol, candles: Candle[]) {
  if (!pool || !candles.length) return;
  for (let i = 0; i < candles.length; i += 500) {
    const rows = candles.slice(i, i + 500).map((c) => ({
      open_time: c.datetime, open: c.open, high: c.high, low: c.low, close: c.close
    }));
    await pool.query(
      `INSERT INTO historical_candles (symbol, open_time, open, high, low, close)
       SELECT $1, x.open_time::timestamptz, x.open, x.high, x.low, x.close
       FROM jsonb_to_recordset($2::jsonb) AS x(open_time text, open float8, high float8, low float8, close float8)
       ON CONFLICT (symbol, open_time) DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close`,
      [symbol, JSON.stringify(rows)]
    );
  }
}

async function loadCandles(symbol: Symbol): Promise<Candle[]> {
  const result = await pool!.query<{ open_time: Date; open: number; high: number; low: number; close: number }>(
    `SELECT open_time, open, high, low, close FROM historical_candles
     WHERE symbol=$1 AND open_time >= $2 AND open_time <= $3 ORDER BY open_time`,
    [symbol, config.BACKTEST_START, config.BACKTEST_END]
  );
  return result.rows.map((row) => ({
    openTimeMs: row.open_time.getTime(), datetime: row.open_time.toISOString(),
    open: row.open, high: row.high, low: row.low, close: row.close
  }));
}

function metrics(events: ReturnType<typeof replay>['events'], candles: Candle[]) {
  const labeled = labelEntries(events, candles);
  const counts = {
    WIN_1R: labeled.filter((x) => x.outcome === 'WIN_1R').length,
    WIN_2R: labeled.filter((x) => x.outcome === 'WIN_2R').length,
    LOSS: labeled.filter((x) => x.outcome === 'LOSS').length,
    TIMEOUT: labeled.filter((x) => x.outcome === 'TIMEOUT').length,
    AMBIGUOUS: labeled.filter((x) => x.outcome === 'AMBIGUOUS').length,
    NO_FILL: labeled.filter((x) => x.outcome === 'NO_FILL').length
  };
  const wins = counts.WIN_1R + counts.WIN_2R;
  const resolved = wins + counts.LOSS + counts.AMBIGUOUS;
  return {
    watch: events.filter((event) => event.stage === 'WATCH').length,
    entries: labeled.length,
    outcomes: counts,
    conservativeWinRate: resolved ? wins / resolved : null,
    avgMfeR: labeled.length ? labeled.reduce((sum, x) => sum + x.mfeR, 0) / labeled.length : null,
    avgMaeR: labeled.length ? labeled.reduce((sum, x) => sum + x.maeR, 0) / labeled.length : null
  };
}

async function run(id: string) {
  const startMs = Date.parse(config.BACKTEST_START);
  const endMs = Date.parse(config.BACKTEST_END);
  const windowMs = 14 * 24 * 60 * 60_000;
  let requestCount = 0;
  for (const symbol of SYMBOLS) {
    for (let cursor = startMs; cursor < endMs; cursor += windowMs) {
      const windowEnd = Math.min(endMs, cursor + windowMs - 1);
      const candles = await fetchHistorical5m(symbol, cursor, windowEnd);
      await insertCandles(symbol, candles);
      requestCount += 1;
      await update(id, { progress: { phase: 'backfill', symbol, cursor: new Date(windowEnd).toISOString(), requestCount } });
      await wait(12_000); // <= 5 historical requests/minute; reserves free-tier credits for live polling.
    }
  }

  const report: Record<string, unknown> = { version: VERSION, range: [config.BACKTEST_START, config.BACKTEST_END], generatedAt: new Date().toISOString(), symbols: {} };
  for (const symbol of SYMBOLS) {
    const candles = await loadCandles(symbol);
    const cut = Date.parse('2025-01-01T00:00:00Z');
    const validation = candles.filter((c) => c.openTimeMs < cut);
    const outOfSample = candles.filter((c) => c.openTimeMs >= cut);
    (report.symbols as Record<string, unknown>)[symbol] = {
      candleCount: candles.length,
      validation: {
        baseline: metrics(replay(symbol, validation, BASELINE).events, validation),
        v02: metrics(replay(symbol, validation, DEFAULT_PARAMS).events, validation)
      },
      outOfSample: {
        baseline: metrics(replay(symbol, outOfSample, BASELINE).events, outOfSample),
        v02: metrics(replay(symbol, outOfSample, DEFAULT_PARAMS).events, outOfSample)
      }
    };
  }
  await update(id, { status: 'COMPLETED', progress: { phase: 'done', requestCount }, report });
  logger.info({ backtestId: id }, 'historical backtest completed');
}

export async function startBacktestJob() {
  if (!config.BACKTEST_ENABLED || !pool || !config.TWELVEDATA_API_KEY) return;
  await init();
  const existing = await pool.query<{ id: string; status: string }>('SELECT id, status FROM backtest_runs WHERE version=$1', [VERSION]);
  if (existing.rows[0]?.status === 'COMPLETED' || existing.rows[0]?.status === 'RUNNING') return;
  // Previous run FAILED — allow restart
  const id = existing.rows[0]?.id ?? randomUUID();
  await pool.query(
    `INSERT INTO backtest_runs (id, version, status, progress) VALUES ($1,$2,'RUNNING',$3::jsonb)
     ON CONFLICT (version) DO UPDATE SET status='RUNNING', error=NULL, updated_at=now()`,
    [id, VERSION, JSON.stringify({ phase: 'starting' })]
  );
  void run(id).catch(async (error) => {
    logger.error({ err: error, backtestId: id }, 'historical backtest failed');
    await update(id, { status: 'FAILED', error: error instanceof Error ? error.message : String(error) });
  });
}

export async function getBacktestStatus() {
  if (!pool) return null;
  await init();
  const result = await pool.query('SELECT id, version, status, progress, report, error, created_at, updated_at FROM backtest_runs ORDER BY created_at DESC LIMIT 1');
  return result.rows[0] ?? null;
}
