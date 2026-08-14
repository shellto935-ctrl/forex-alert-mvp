import { z } from 'zod';

export const signalSchema = z.object({
  version: z.literal('1'),
  setup_id: z.string().min(8).max(160).regex(/^[A-Za-z0-9_.:-]+$/),
  stage: z.enum(['WATCH', 'ENTRY_READY']),
  symbol: z.string().min(3).max(30),
  direction: z.enum(['BUY', 'SELL']),
  session: z.enum(['LONDON', 'NY_PM']),
  pattern_tf: z.literal('15'),
  entry_tf: z.literal('5'),
  event_time: z.string().datetime({ offset: true }),
  price: z.number().positive(),
  break_level: z.number().positive(),
  zone_low: z.number().positive(),
  zone_high: z.number().positive(),
  invalidation: z.number().positive().optional(),
  reason: z.array(z.string().min(1).max(80)).min(1).max(10),
  chart_url: z.string().url().optional()
}).superRefine((value, ctx) => {
  if (value.zone_low > value.zone_high) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['zone_low'], message: 'zone_low must be <= zone_high' });
  }
});

export type Signal = z.infer<typeof signalSchema>;
export type DeliveryChannel = 'whatsapp' | 'voice';
export type DeliveryResult = {
  channel: DeliveryChannel;
  ok: boolean;
  retryable?: boolean;
  providerId?: string;
  error?: string;
};
