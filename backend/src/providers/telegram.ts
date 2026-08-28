import { config } from '../config.js';
import { logger } from '../logger.js';
import { messageText } from '../format.js';
import type { DeliveryResult, Signal } from '../types.js';
import { isRetryableStatus, parseProviderResponse } from './http.js';

export async function sendTelegram(signal: Signal): Promise<DeliveryResult> {
  if (config.DRY_RUN) {
    logger.info({ setupId: signal.setup_id, stage: signal.stage }, 'DRY_RUN Telegram message');
    return { channel: 'telegram', ok: true, providerId: 'dry-run' };
  }

  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    return { channel: 'telegram', ok: false, retryable: false, error: 'Telegram configuration is incomplete' };
  }

  const text = messageText(signal);
  const body = {
    chat_id: config.TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  };

  const response = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000)
    }
  );

  const { json, text: responseText } = await parseProviderResponse(response);
  const ok = (json as { ok?: boolean }).ok === true;
  const messageId = (json as { result?: { message_id?: number } }).result?.message_id;

  if (!response.ok || !ok) {
    const desc = (json as { description?: string }).description;
    return {
      channel: 'telegram',
      ok: false,
      retryable: isRetryableStatus(response.status),
      error: desc ?? `HTTP ${response.status}: ${responseText.slice(0, 300)}`
    };
  }

  return { channel: 'telegram', ok: true, providerId: messageId !== undefined ? String(messageId) : undefined };
}
