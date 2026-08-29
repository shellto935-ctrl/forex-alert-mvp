export type SessionType = "LONDON" | "NY_PM" | "NONE";

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

/** Classify the actual candle-open timestamp, with IANA DST handling. */
export function getSession(utcMs: number): SessionType {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (minutes >= 2 * 60 && minutes < 5 * 60) return 'LONDON';
  if (minutes >= 13 * 60 && minutes < 15 * 60) return 'NY_PM';
  return 'NONE';
}
