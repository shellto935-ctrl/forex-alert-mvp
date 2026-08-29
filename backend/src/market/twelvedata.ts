import { config } from '../config.js';
import { logger } from '../logger.js';
import type { Candle, Symbol } from './types.js';
import { canonicalize5m } from './normalize.js';

const BASE_URL = 'https://api.twelvedata.com';
const PROVIDER_SETTLEMENT_MS = 10_000;

type TimeSeriesResponse = {
  status?: string;
  message?: string;
  values?: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
  }>;
};

function parseUtc(value: string): number {
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const time = Date.parse(normalized);
  if (!Number.isFinite(time)) throw new Error(`Invalid Twelve Data timestamp: ${value}`);
  return time;
}

export function normalizeClosed5m(rows: NonNullable<TimeSeriesResponse['values']>, nowMs = Date.now()): Candle[] {
  const candles = rows.map((row) => {
    const openTimeMs = parseUtc(row.datetime);
    return {
      openTimeMs,
      datetime: new Date(openTimeMs).toISOString(),
      open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close),
      volume: row.volume === undefined ? undefined : Number(row.volume)
    } satisfies Candle;
  });
  return canonicalize5m(candles, { nowMs, settlementMs: PROVIDER_SETTLEMENT_MS, trimBeforeLastGap: true });
}

export async function fetchCandles(symbol: Symbol, outputsize: number, nowMs = Date.now()): Promise<Candle[]> {
  const query = new URLSearchParams({
    symbol,
    interval: '5min',
    outputsize: String(outputsize),
    format: 'JSON',
    timezone: 'UTC',
    order: 'asc',
    apikey: config.TWELVEDATA_API_KEY
  });
  const response = await fetch(`${BASE_URL}/time_series?${query}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twelve Data HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const json = (await response.json()) as TimeSeriesResponse;
  if (json.status !== 'ok' || !json.values) throw new Error(`Twelve Data error: ${json.message ?? 'unknown'}`);
  return normalizeClosed5m(json.values, nowMs);
}

function apiDate(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('.000Z', '');
}

export async function fetchHistorical5m(symbol: Symbol, startMs: number, endMs: number): Promise<Candle[]> {
  const query = new URLSearchParams({
    symbol, interval: '5min', start_date: apiDate(startMs), end_date: apiDate(endMs),
    outputsize: '5000', format: 'JSON', timezone: 'UTC', order: 'asc', apikey: config.TWELVEDATA_API_KEY
  });
  const response = await fetch(`${BASE_URL}/time_series?${query}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Twelve Data historical HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = (await response.json()) as TimeSeriesResponse;
  if (json.status !== 'ok' || !json.values) throw new Error(`Twelve Data historical error: ${json.message ?? 'unknown'}`);
  const candles = json.values.map((row) => {
    const openTimeMs = parseUtc(row.datetime);
    return {
      openTimeMs, datetime: new Date(openTimeMs).toISOString(),
      open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close),
      volume: row.volume === undefined ? undefined : Number(row.volume)
    } satisfies Candle;
  });
  return canonicalize5m(candles);
}

export async function fetchLatest5m(symbol: Symbol, bars = 250): Promise<Candle[]> {
  try {
    return await fetchCandles(symbol, bars);
  } catch (error) {
    logger.error({ err: error, symbol }, 'Twelve Data fetch failed');
    return [];
  }
}
