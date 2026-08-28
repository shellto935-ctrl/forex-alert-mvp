import 'dotenv/config';
import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WEBHOOK_SECRET: z.string().min(16),
  DATABASE_URL: z.string().optional().default(''),
  DRY_RUN: booleanString.default('true'),
  MAX_DELIVERY_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(6),
  WHATSAPP_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v25.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_TO: z.string().optional().default(''),
  WHATSAPP_WATCH_TEMPLATE: z.string().default('forex_watch_alert'),
  WHATSAPP_ENTRY_TEMPLATE: z.string().default('forex_entry_ready_alert'),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default('en_US'),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_FROM: z.string().optional().default(''),
  TWILIO_TO: z.string().optional().default(''),
  TWELVEDATA_API_KEY: z.string().optional().default(''),
  POLL_INTERVAL_MS: z.coerce.number().int().min(10_000).default(300_000),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default('')
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.DATABASE_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DATABASE_URL'], message: 'DATABASE_URL is required in production' });
  }
  if (!value.DRY_RUN) {
    const required = [
      'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_TO',
      'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'TWILIO_TO'
    ] as const;
    for (const key of required) {
      if (!value[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required when DRY_RUN=false` });
    }
  }
});

export type Config = z.infer<typeof schema>;
export const config = schema.parse(process.env);
