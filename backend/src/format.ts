import type { Signal } from './types.js';

export function messageText(signal: Signal): string {
  const title = signal.stage === 'WATCH' ? 'WATCH' : signal.stage === 'ENTRY_READY' ? 'ENTRY-READY' : 'INVALIDATED';
  const reasons = signal.reason.join(', ');
  return [
    `${title} — ${signal.symbol} — ${signal.direction} setup`,
    `Session: ${signal.session}`,
    `15M/5M: ${reasons}`,
    `Price: ${signal.price}`,
    `Break level: ${signal.break_level}`,
    `Retest zone: ${signal.zone_low}–${signal.zone_high}`,
    signal.invalidation ? `Invalidation reference: ${signal.invalidation}` : '',
    `Detected: ${signal.event_time}`,
    signal.chart_url ? `Chart: ${signal.chart_url}` : '',
    signal.stage === 'ENTRY_READY' ? 'Action: Review chart now; no automatic trade was placed.' : 'Status: Waiting for 5M entry confirmation.'
  ].filter(Boolean).join('\n');
}

export function templateParameters(signal: Signal): string[] {
  return [
    signal.stage,
    signal.symbol,
    signal.direction,
    signal.session,
    signal.reason.join(' + '),
    String(signal.price),
    `${signal.zone_low}-${signal.zone_high}`,
    signal.event_time
  ];
}
