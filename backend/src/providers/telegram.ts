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
  // Then send a voice message with spoken Bengali text
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
    try {
      const directionBn = signal.direction === 'BUY' ? 'কেনার' : 'বেচার';
      const symbolBn = signal.symbol;
      const spokenText = `জরুরি! ${symbolBn} এ ${directionBn} সেটআপ পাওয়া গেছে। চার্ট দেখুন।`;

      // Use Google Translate TTS to generate audio
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=bn&client=tw-ob&q=${encodeURIComponent(spokenText)}`;
      const audioResponse = await fetch(ttsUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(30_000)
      });

      if (!audioResponse.ok) {
        throw new Error(`Google TTS failed: HTTP ${audioResponse.status}`);
      }

      const audioBuffer = await audioResponse.arrayBuffer();

      // Send as voice message
      const formData = new FormData();
      formData.append('chat_id', config.TELEGRAM_CHAT_ID);
      formData.append('voice', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'voice.mp3');

      const voiceResponse = await fetch(`${TELEGRAM_API}/bot${config.TELEGRAM_BOT_TOKEN}/sendVoice`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30_000)
      });

      const voiceJson = await voiceResponse.json() as { ok?: boolean; description?: string };
      if (!voiceResponse.ok || !voiceJson.ok) {
        logger.warn({ error: voiceJson.description }, 'Telegram voice message failed, but text messages were sent');
      }
    } catch (error) {
      logger.warn({ err: error }, 'Telegram voice message generation failed, but text messages were sent');
    }
  }

  return { channel: 'telegram', ok: true, providerId: lastMessageId };
}
