import { config } from './config.js';
import { logger } from './logger.js';
import { sendTelegram } from './providers/telegram.js';
import type { DeliveryResult } from './types.js';
import type { PendingDelivery, SignalStore } from './store/store.js';

async function deliver(job: PendingDelivery): Promise<DeliveryResult> {
  return sendTelegram(job.signal);
}

export function startWorker(store: SignalStore): () => Promise<void> {
  let stopped = false;
  let activePump: Promise<void> | undefined;

  const pump = async () => {
    if (stopped || activePump) return;
    activePump = (async () => {
      try {
        const jobs = await store.claimPending(10);
        for (const job of jobs) {
          let result: DeliveryResult;
          try {
            result = await deliver(job);
          } catch (error) {
            result = {
              channel: job.channel,
              ok: false,
              retryable: true,
              error: error instanceof Error ? error.message : String(error)
            };
          }

          if (result.ok) {
            await store.complete(job.id, job.claimToken, result);
            logger.info({ deliveryId: job.id, setupId: job.signal.setup_id, stage: job.signal.stage, channel: job.channel }, 'notification submitted');
          } else {
            await store.fail(job.id, job.claimToken, result, config.MAX_DELIVERY_ATTEMPTS);
            logger.error({ deliveryId: job.id, setupId: job.signal.setup_id, channel: job.channel, attempts: job.attempts, retryable: result.retryable, error: result.error }, 'notification submission failed');
          }
        }
      } catch (error) {
        logger.error({ err: error }, 'worker pump failed');
      }
    })();

    try {
      await activePump;
    } finally {
      activePump = undefined;
    }
  };

  const timer = setInterval(() => void pump(), 1_000);
  timer.unref();
  void pump();

  return async () => {
    stopped = true;
    clearInterval(timer);
    if (activePump) await activePump;
  };
}
