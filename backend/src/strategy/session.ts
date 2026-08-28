export type SessionType = "LONDON" | "NY_PM" | "NONE";

/**
 * Determine if a UTC timestamp falls inside an ICT Kill Zone, expressed in
 * America/New_York time with automatic DST handling.
 * London: 02:00–05:00 ET
 * NY PM:  13:00–15:00 ET
 */
export function getSession(utcMs: number): SessionType {
  const etOffsetMin = getEtOffsetMinutes(utcMs);
  const etMinutes = ((utcMs / 60_000) + etOffsetMin + 24 * 60) % (24 * 60);

  if (etMinutes >= 2 * 60 && etMinutes < 5 * 60) return "LONDON";
  if (etMinutes >= 13 * 60 && etMinutes < 15 * 60) return "NY_PM";
  return "NONE";
}

/**
 * Returns the ET offset in minutes from UTC for a given UTC timestamp.
 * EST = -300, EDT = -240.
 * US DST: second Sunday of March 2:00 AM → first Sunday of November 2:00 AM.
 */
function getEtOffsetMinutes(utcMs: number): number {
  const date = new Date(utcMs);
  const year = date.getUTCFullYear();

  const secondSundayMarch = nthSunday(year, 2, 2, 7); // March is month 2
  const firstSundayNovember = nthSunday(year, 1, 10, 7); // November is month 10

  const dstStartUtc = secondSundayMarch + 7 * 3600_000; // 2:00 AM local = 7:00 UTC
  const dstEndUtc = firstSundayNovember + 6 * 3600_000; // 2:00 AM local falls back to 1:00 AM

  return utcMs >= dstStartUtc && utcMs < dstEndUtc ? -240 : -300;
}

function nthSunday(year: number, nth: number, month: number, _dow: number): number {
  const firstOfMonth = Date.UTC(year, month, 1);
  const firstDow = new Date(firstOfMonth).getUTCDay();
  const offset = (7 - firstDow) % 7;
  return firstOfMonth + (offset + (nth - 1) * 7) * 86400_000;
}
