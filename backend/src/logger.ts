import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.x-webhook-secret',
      'WHATSAPP_ACCESS_TOKEN',
      'TWILIO_AUTH_TOKEN'
    ],
    censor: '[REDACTED]'
  }
});
