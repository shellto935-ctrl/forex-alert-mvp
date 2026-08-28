import type { Signal } from './types.js';

export function messageText(signal: Signal): string {
  const stageBn = signal.stage === 'WATCH' ? 'সতর্কতা' : signal.stage === 'ENTRY_READY' ? 'এন্ট্রি প্রস্তুত' : 'বাতিল';
  const directionBn = signal.direction === 'BUY' ? 'কেনা (BUY)' : 'বেচা (SELL)';
  const sessionBn = signal.session === 'LONDON' ? 'লন্ডন সেশন' : 'নিউইয়র্ক PM সেশন';
  const reasons = signal.reason.join(', ');
  const lines = [
    `📢 ${stageBn} — ${signal.symbol} — ${directionBn}`,
    `🕐 সেশন: ${sessionBn}`,
    `📊 কারণ: ${reasons}`,
    `💰 বর্তমান দাম: ${signal.price}`,
    `📉 ব্রেক লেভেল: ${signal.break_level}`,
    `🎯 রিটেস্ট জোন: ${signal.zone_low}–${signal.zone_high}`,
    signal.invalidation ? `🚫 ইনভ্যালিডেশন: ${signal.invalidation}` : '',
    `🕒 সময়: ${signal.event_time}`,
    signal.chart_url ? `📈 চার্ট: ${signal.chart_url}` : '',
  ];

  if (signal.stage === 'ENTRY_READY') {
    lines.push('⚠️ এখনই চার্ট দেখুন! কোনো অটোমেটিক ট্রেড হয়নি।');
  } else {
    lines.push('⏳ ৫ মিনিট চার্টে এন্ট্রি কনফার্মেশনের অপেক্ষায়।');
  }

  return lines.filter(Boolean).join('\n');
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
