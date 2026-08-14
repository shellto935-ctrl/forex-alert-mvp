import { config } from '../config.js';
import { logger } from '../logger.js';
import { messageText } from '../format.js';
import type { DeliveryResult, Signal } from '../types.js';
import { isRetryableStatus, parseProviderResponse } from './http.js';

function xmlEscape(value: string): string {
  return value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]!);
}

export async function placeVoiceCall(signal: Signal): Promise<DeliveryResult> {
  if (signal.stage !== 'ENTRY_READY') return { channel: 'voice', ok: true, providerId: 'not-required' };
  if (config.DRY_RUN) {
    logger.info({ setupId: signal.setup_id }, 'DRY_RUN voice call');
    return { channel: 'voice', ok: true, providerId: 'dry-run' };
  }
  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_FROM || !config.TWILIO_TO) {
    return { channel: 'voice', ok: false, retryable: false, error: 'Twilio configuration is incomplete' };
  }

  const form = new URLSearchParams({
    From: config.TWILIO_FROM,
    To: config.TWILIO_TO,
    Twiml: `<Response><Say language="en-US">${xmlEscape(messageText(signal))}</Say></Response>`
  });
  const auth = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Calls.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(10_000)
  });
  const { json, text } = await parseProviderResponse(response);
  if (!response.ok) {
    return {
      channel: 'voice', ok: false, retryable: isRetryableStatus(response.status),
      error: typeof json.message === 'string' ? json.message : `HTTP ${response.status}: ${text.slice(0, 300)}`
    };
  }
  return { channel: 'voice', ok: true, providerId: typeof json.sid === 'string' ? json.sid : undefined };
}
