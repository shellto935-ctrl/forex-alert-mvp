import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.js';
import type { Signal } from '../src/types.js';

function entrySignal(): Signal {
  return {
    version: '1', setup_id: 'GBPUSD.SELL.12345678', stage: 'ENTRY_READY', symbol: 'GBPUSD',
    direction: 'SELL', session: 'NY_PM', pattern_tf: '15', entry_tf: '5', event_time: new Date().toISOString(),
    price: 1.275, break_level: 1.276, zone_low: 1.2758, zone_high: 1.2762,
    invalidation: 1.279, reason: ['HEAD_SHOULDERS', 'BEARISH_RETEST']
  };
}

describe('MemoryStore delivery isolation', () => {
  it('creates one Telegram job and never reclaims completed jobs', async () => {
    const store = new MemoryStore();
    await store.init();
    await store.insert(entrySignal());
    const jobs = await store.claimPending(10);
    expect(jobs.map((job) => job.channel)).toEqual(['telegram']);

    const telegram = jobs.find((job) => job.channel === 'telegram')!;
    await store.complete(telegram.id, telegram.claimToken, { channel: 'telegram', ok: true, providerId: 'msg.1' });

    expect(await store.claimPending(10)).toEqual([]);
  });
});
