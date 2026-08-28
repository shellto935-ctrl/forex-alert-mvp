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
  TWELVEDATA_API_KEY: z.string().optional().default(''),
  POLL_INTERVAL_MS: z.coerce.number().int().min(10_000).default(300_000),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default('')
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.DATABASE_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DATABASE_URL'], message: 'DATABASE_URL is required in production' });
  }
  if (!value.DRY_RUN) {
    if (!value.TELEGRAM_BOT_TOKEN) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['TELEGRAM_BOT_TOKEN'], message: 'TELEGRAM_BOT_TOKEN is required when DRY_RUN=false' });
    }
    if (!value.TELEGRAM_CHAT_ID) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['TELEGRAM_CHAT_ID'], message: 'TELEGRAM_CHAT_ID is required when DRY_RUN=false' });
    }
    if (!value.TWELVEDATA_API_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['TWELVEDATA_API_KEY'], message: 'TWELVEDATA_API_KEY is required when DRY_RUN=false' });
    }
  }
});

export type Config = z.infer<typeof schema>;
export const config = schema.parse(process.env);
