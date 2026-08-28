import { config } from '../config.js';
import { logger } from '../logger.js';
import type { Candle, Symbol } from './types.js';

const BASE_URL = 'https://api.twelvedata.com';

type TimeSeriesResponse = {
  meta?: { status?: string };
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

export async function fetchCandles(symbol: Symbol, interval: string, outputsize: number): Promise<Candle[]> {
  const url = `${BASE_URL}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&format=JSON&apikey=${config.TWELVEDATA_API_KEY}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twelve Data HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = (await response.json()) as TimeSeriesResponse;
  if (json.status !== 'ok' || !json.values) {
    throw new Error(`Twelve Data error: ${json.message ?? 'unknown'}`);
  }

  return json.values.map((row) => ({
    datetime: row.datetime,
    open: parseFloat(row.open),
    high: parseFloat(row.high),
    low: parseFloat(row.low),
    close: parseFloat(row.close),
    volume: row.volume ? parseFloat(row.volume) : undefined
  }));
}

export async function fetchLatest5m(symbol: Symbol, bars = 80): Promise<Candle[]> {
  try {
    return await fetchCandles(symbol, '5min', bars);
  } catch (error) {
    logger.error({ err: error, symbol }, 'Twelve Data fetch failed');
    return [];
  }
}
