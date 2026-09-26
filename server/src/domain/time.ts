/**
 * All user-facing dates/hours are Iran time. Iran has used a fixed UTC+03:30
 * offset since daylight saving was abolished in 2022, so a constant offset is
 * exact for every flight this app can list — and independent of the server's TZ.
 */
export const TEHRAN_OFFSET_MS = 210 * 60_000;
const DAY_MS = 86_400_000;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Hour of day (0–23) in Tehran for an epoch-ms timestamp. */
export function tehranHour(epochMs: number): number {
  return new Date(epochMs + TEHRAN_OFFSET_MS).getUTCHours();
}

/** `yyyy-mm-dd` → [start, end) epoch-ms of that calendar day in Tehran, or null if invalid. */
export function tehranDayBounds(dateKey: string): readonly [number, number] | null {
  const m = DATE_KEY_RE.exec(dateKey);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utcMidnight = Date.UTC(y, mo - 1, d);
  const check = new Date(utcMidnight);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return null;
  }
  const start = utcMidnight - TEHRAN_OFFSET_MS;
  return [start, start + DAY_MS];
}

export function isValidDateKey(dateKey: string): boolean {
  return tehranDayBounds(dateKey) !== null;
}

/** A Tehran wall-clock time `dayOffset` days from `now` (used for demo data). */
export function tehranWallClock(dayOffset: number, hour: number, minute: number, now = Date.now()): Date {
  const shifted = new Date(now + TEHRAN_OFFSET_MS);
  const utc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + dayOffset, hour, minute);
  return new Date(utc - TEHRAN_OFFSET_MS);
}
