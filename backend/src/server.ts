import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { createStore } from './store/index.js';
import { startWorker } from './worker.js';
import { startPolling } from './poller.js';
import { startBacktestJob } from './backtest/job.js';

const store = createStore();
await store.init();
const stopWorker = startWorker(store);
const stopPolling = startPolling(store);
const app = createApp(store);
const server = app.listen(config.PORT, '0.0.0.0', () => {
  logger.info({ port: config.PORT, dryRun: config.DRY_RUN, polling: !!config.TWELVEDATA_API_KEY }, 'forex alert backend listening');
});
void startBacktestJob().catch((error) => logger.error({ err: error }, 'backtest startup failed'));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const forceExit = setTimeout(() => process.exit(1), 15_000);
  forceExit.unref();

  server.close();
  await stopPolling();
  await stopWorker();
  await store.close();
  clearTimeout(forceExit);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
