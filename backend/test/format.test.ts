import { describe, expect, it } from 'vitest';
import { messageText } from '../src/format.js';
import type { Signal } from '../src/types.js';

const signal: Signal = {
  version: '1', setup_id: 'x.12345678', stage: 'ENTRY_READY', symbol: 'GBPUSD', direction: 'SELL',
  session: 'NY_PM', pattern_tf: '15', entry_tf: '5', event_time: '2026-08-14T13:30:00-04:00',
  price: 1.275, break_level: 1.276, zone_low: 1.2758, zone_high: 1.2762,
  invalidation: 1.279, reason: ['HEAD_SHOULDERS', 'BEARISH_RETEST']
};

describe('messageText', () => {
  it('contains the decision-critical fields', () => {
    const text = messageText(signal);
    expect(text).toContain('ENTRY-READY');
    expect(text).toContain('GBPUSD');
    expect(text).toContain('SELL');
    expect(text).toContain('NY_PM');
    expect(text).toContain('no automatic trade was placed');
  });
});
