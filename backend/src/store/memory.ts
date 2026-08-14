import { randomUUID } from 'node:crypto';
import type { DeliveryChannel, DeliveryResult, Signal } from '../types.js';
import type { PendingDelivery, SignalStore } from './store.js';

type SignalRow = { id: string; signal: Signal };
type DeliveryRow = {
  id: string;
  signalId: string;
  channel: DeliveryChannel;
  status: 'PENDING' | 'PROCESSING' | 'SUBMITTED' | 'FAILED';
  attempts: number;
  nextAttemptAt: number;
  leaseUntil: number;
  claimToken?: string;
  result?: DeliveryResult;
};

export class MemoryStore implements SignalStore {
  private readonly signals = new Map<string, SignalRow>();
  private readonly deliveries = new Map<string, DeliveryRow>();

  async init(): Promise<void> {}
  async ping(): Promise<void> {}

  async insert(signal: Signal): Promise<{ accepted: boolean; id: string }> {
    const key = `${signal.setup_id}:${signal.stage}`;
    const existing = this.signals.get(key);
    if (existing) return { accepted: false, id: existing.id };

    const signalRow: SignalRow = { id: randomUUID(), signal };
    this.signals.set(key, signalRow);
    const channels: DeliveryChannel[] = signal.stage === 'ENTRY_READY' ? ['whatsapp', 'voice'] : ['whatsapp'];
    for (const channel of channels) {
      const row: DeliveryRow = {
        id: randomUUID(), signalId: signalRow.id, channel, status: 'PENDING',
        attempts: 0, nextAttemptAt: Date.now(), leaseUntil: 0
      };
      this.deliveries.set(row.id, row);
    }
    return { accepted: true, id: signalRow.id };
  }

  async claimPending(limit: number): Promise<PendingDelivery[]> {
    const now = Date.now();
    const claimed: PendingDelivery[] = [];
    for (const row of this.deliveries.values()) {
      if (claimed.length >= limit) break;
      const due = row.status === 'PENDING' && row.nextAttemptAt <= now;
      const expired = row.status === 'PROCESSING' && row.leaseUntil <= now;
      if (!due && !expired) continue;
      const signal = [...this.signals.values()].find((item) => item.id === row.signalId)?.signal;
      if (!signal) continue;
      row.status = 'PROCESSING';
      row.attempts += 1;
      row.leaseUntil = now + 120_000;
      row.claimToken = randomUUID();
      claimed.push({ id: row.id, claimToken: row.claimToken, signal, channel: row.channel, attempts: row.attempts });
    }
    return claimed;
  }

  async complete(id: string, claimToken: string, result: DeliveryResult): Promise<void> {
    const row = this.deliveries.get(id);
    if (!row || row.status !== 'PROCESSING' || row.claimToken !== claimToken) return;
    row.status = 'SUBMITTED';
    row.result = result;
    row.claimToken = undefined;
  }

  async fail(id: string, claimToken: string, result: DeliveryResult, maxAttempts: number): Promise<void> {
    const row = this.deliveries.get(id);
    if (!row || row.status !== 'PROCESSING' || row.claimToken !== claimToken) return;
    row.result = result;
    row.claimToken = undefined;
    const terminal = result.retryable === false || row.attempts >= maxAttempts;
    row.status = terminal ? 'FAILED' : 'PENDING';
    row.nextAttemptAt = Date.now() + Math.min(60_000, 1_000 * 2 ** row.attempts);
  }

  async close(): Promise<void> {}
}
