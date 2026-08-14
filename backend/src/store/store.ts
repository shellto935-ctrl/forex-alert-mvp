import type { DeliveryChannel, DeliveryResult, Signal } from '../types.js';

export type PendingDelivery = {
  id: string;
  claimToken: string;
  signal: Signal;
  channel: DeliveryChannel;
  attempts: number;
};

export interface SignalStore {
  init(): Promise<void>;
  ping(): Promise<void>;
  insert(signal: Signal): Promise<{ accepted: boolean; id: string }>;
  claimPending(limit: number): Promise<PendingDelivery[]>;
  complete(id: string, claimToken: string, result: DeliveryResult): Promise<void>;
  fail(id: string, claimToken: string, result: DeliveryResult, maxAttempts: number): Promise<void>;
  close(): Promise<void>;
}
