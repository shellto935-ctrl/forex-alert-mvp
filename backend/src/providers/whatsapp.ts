import { config } from '../config.js';
import { logger } from '../logger.js';
import { templateParameters } from '../format.js';
import type { DeliveryResult, Signal } from '../types.js';
import { isRetryableStatus, parseProviderResponse } from './http.js';

export async function sendWhatsApp(signal: Signal): Promise<DeliveryResult> {
  if (config.DRY_RUN) {
    logger.info({ setupId: signal.setup_id, stage: signal.stage }, 'DRY_RUN WhatsApp message');
    return { channel: 'whatsapp', ok: true, providerId: 'dry-run' };
  }

  if (!config.WHATSAPP_PHONE_NUMBER_ID || !config.WHATSAPP_ACCESS_TOKEN || !config.WHATSAPP_TO) {
    return { channel: 'whatsapp', ok: false, retryable: false, error: 'WhatsApp configuration is incomplete' };
  }

  const templateName = signal.stage === 'ENTRY_READY' ? config.WHATSAPP_ENTRY_TEMPLATE : config.WHATSAPP_WATCH_TEMPLATE;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: config.WHATSAPP_TO,
    type: 'template',
    template: {
      name: templateName,
      language: { code: config.WHATSAPP_TEMPLATE_LANGUAGE },
      components: [{
        type: 'body',
        parameters: templateParameters(signal).map((text) => ({ type: 'text', text }))
      }]
    }
  };

  const response = await fetch(
    `https://graph.facebook.com/${config.WHATSAPP_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000)
    }
  );
  const { json, text } = await parseProviderResponse(response);
  const error = json.error as { message?: string } | undefined;
  const messages = json.messages as Array<{ id?: string }> | undefined;
  if (!response.ok) {
    return {
      channel: 'whatsapp', ok: false, retryable: isRetryableStatus(response.status),
      error: error?.message ?? `HTTP ${response.status}: ${text.slice(0, 300)}`
    };
  }
  return { channel: 'whatsapp', ok: true, providerId: messages?.[0]?.id };
}
