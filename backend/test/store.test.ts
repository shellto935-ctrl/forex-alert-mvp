import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.js';
import type { Signal } from '../src/types.js';

function watchSignal(): Signal {
  return {
    version: '1', setup_id: 'EURUSD.BUY.WATCH.1', stage: 'WATCH', symbol: 'EURUSD',
    direction: 'BUY', session: 'LONDON', pattern_tf: '15', entry_tf: '5', event_time: new Date().toISOString(),
    price: 1.1012, break_level: 1.1, zone_low: 1.0998, zone_high: 1.1002,
    invalidation: 1.095, reason: ['INVERSE_HS', 'BULLISH_CHOCH']
  };
}

function entrySignal(): Signal {
  return {
    version: '1', setup_id: 'GBPUSD.SELL.ENTRY.1', stage: 'ENTRY_READY', symbol: 'GBPUSD',
    direction: 'SELL', session: 'NY_PM', pattern_tf: '15', entry_tf: '5', event_time: new Date().toISOString(),
    price: 1.275, break_level: 1.276, zone_low: 1.2758, zone_high: 1.2762,
    invalidation: 1.279, reason: ['HEAD_SHOULDERS', 'BEARISH_RETEST']
  };
}

describe('MemoryStore delivery channels', () => {
  it('WATCH creates only telegram job', async () => {
    const store = new MemoryStore();
    await store.init();
    await store.insert(watchSignal());
    const jobs = await store.claimPending(10);
    expect(jobs.map((j) => j.channel)).toEqual(['telegram']);
  });

  it('ENTRY_READY creates one telegram job (urgent repeats handled inside provider)', async () => {
    const store = new MemoryStore();
    await store.init();
    await store.insert(entrySignal());
    const jobs = await store.claimPending(10);
    expect(jobs.map((j) => j.channel)).toEqual(['telegram']);
  });

  it('never reclaims completed jobs', async () => {
    const store = new MemoryStore();
    await store.init();
    await store.insert(entrySignal());
    const jobs = await store.claimPending(10);
    for (const job of jobs) {
      await store.complete(job.id, job.claimToken, { channel: job.channel, ok: true, providerId: 'test' });
    }
    expect(await store.claimPending(10)).toEqual([]);
  });
});
