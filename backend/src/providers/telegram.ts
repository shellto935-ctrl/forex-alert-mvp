import { config } from '../config.js';
import { logger } from '../logger.js';
import { messageText } from '../format.js';
import type { DeliveryResult, Signal } from '../types.js';
import { isRetryableStatus, parseProviderResponse } from './http.js';

const TELEGRAM_API = 'https://api.telegram.org';

async function tgRequest(endpoint: string, body: object): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const response = await fetch(`${TELEGRAM_API}/bot${config.TELEGRAM_BOT_TOKEN}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000)
  });
  const { json, text: responseText } = await parseProviderResponse(response);
  const ok = (json as { ok?: boolean }).ok === true;
  const messageId = (json as { result?: { message_id?: number } }).result?.message_id;
  if (!response.ok || !ok) {
    const desc = (json as { description?: string }).description;
    return { ok: false, error: desc ?? `HTTP ${response.status}: ${responseText.slice(0, 300)}` };
  }
  return { ok: true, messageId: messageId !== undefined ? String(messageId) : undefined };
}

export async function sendTelegram(signal: Signal): Promise<DeliveryResult> {
  if (config.DRY_RUN) {
    logger.info({ setupId: signal.setup_id, stage: signal.stage }, 'DRY_RUN Telegram message');
    return { channel: 'telegram', ok: true, providerId: 'dry-run' };
  }

  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    return { channel: 'telegram', ok: false, retryable: false, error: 'Telegram configuration is incomplete' };
  }

  const text = messageText(signal);
  const isUrgent = signal.stage === 'ENTRY_READY';

  // For ENTRY_READY: send 3 repeated text messages with 2s delay between each
  // Then send 1 voice message with spoken Bengali text
  const sendCount = isUrgent ? 3 : 1;
  let lastMessageId: string | undefined;

  for (let i = 0; i < sendCount; i++) {
    const body = {
      chat_id: config.TELEGRAM_CHAT_ID,
      text: isUrgent && i > 0 ? `🚨🚨🚨 জরুরি! 🚨🚨🚨\n\n${text}` : text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      disable_notification: false
    };

    const result = await tgRequest('sendMessage', body);
    if (!result.ok) {
      return { channel: 'telegram', ok: false, retryable: isRetryableStatus(500), error: result.error };
    }
    lastMessageId = result.messageId;

    if (isUrgent && i < sendCount - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // For ENTRY_READY: also send a voice message with spoken Bengali text
  if (isUrgent) {
    const directionBn = signal.direction === 'BUY' ? 'কেনার' : 'বেচার';
    const symbolBn = signal.symbol;
    const spokenText = `জরুরি! ${symbolBn} এ ${directionBn} সেটআপ পাওয়া গেছে। চার্ট দেখুন।`;

    const voiceResult = await tgRequest('sendVoice', {
      chat_id: config.TELEGRAM_CHAT_ID,
      voice: spokenText,
      duration: 10
    });

    if (!voiceResult.ok) {
      // If voice fails, log it but don't fail the whole delivery — text messages already sent
      logger.warn({ error: voiceResult.error }, 'Telegram voice message failed, but text messages were sent');
    }
  }

  return { channel: 'telegram', ok: true, providerId: lastMessageId };
}
