import { config } from '../config.js';
import { logger } from '../logger.js';
import { messageText } from '../format.js';
import type { DeliveryResult, Signal } from '../types.js';
import { isRetryableStatus, parseProviderResponse } from './http.js';

function xmlEscape(value: string): string {
  return value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]!);
}

export async function placeVoiceCall(signal: Signal): Promise<DeliveryResult> {
  if (config.DRY_RUN) {
    logger.info({ setupId: signal.setup_id }, 'DRY_RUN voice call');
    return { channel: 'voice' as never, ok: true, providerId: 'dry-run' };
  }

  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_FROM || !config.TWILIO_TO) {
    return { channel: 'voice' as never, ok: false, retryable: false, error: 'Twilio configuration is incomplete' };
  }

  // Build a Bengali voice message using Twilio's Say verb
  const directionBn = signal.direction === 'BUY' ? 'কেনার' : 'বেচার';
  const symbolBn = signal.symbol;
  const stageBn = signal.stage === 'ENTRY_READY' ? 'এন্ট্রি প্রস্তুত' : 'সতর্কতা';

  const spokenText = `জরুরি! ${symbolBn} এ ${directionBn} সেটআপ পাওয়া গেছে। ${stageBn}। চার্ট দেখুন।`;

  const form = new URLSearchParams({
    From: config.TWILIO_FROM,
    To: config.TWILIO_TO,
    Twiml: `<Response><Say language="bn-IN" voice="Polly.Aditi">${xmlEscape(spokenText)}</Say><Pause length="2"/><Say language="bn-IN" voice="Polly.Aditi">${xmlEscape(spokenText)}</Say></Response>`
  });

  const auth = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(15_000)
      }
    );

    const { json, text: responseText } = await parseProviderResponse(response);
    const sid = (json as { sid?: string }).sid;
    const message = (json as { message?: string }).message;

    if (!response.ok) {
      return {
        channel: 'voice' as never,
        ok: false,
        retryable: isRetryableStatus(response.status),
        error: message ?? `HTTP ${response.status}: ${responseText.slice(0, 300)}`
      };
    }

    return { channel: 'voice' as never, ok: true, providerId: sid };
  } catch (error) {
    return {
      channel: 'voice' as never,
      ok: false,
      retryable: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
