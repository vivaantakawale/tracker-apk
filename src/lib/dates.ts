/**
 * Date helpers. Calendar logic works on local `YYYY-MM-DD` keys. Day
 * arithmetic uses integer "day numbers" derived from the Y/M/D components via
 * Date.UTC, so daylight-saving transitions never produce 23- or 25-hour days.
 */

export const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeValue(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function isValidDateKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  const m = KEY_RE.exec(key);
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Local midnight at the start of the given date key. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function keyFromDayNumber(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(key: string, n: number): string {
  return keyFromDayNumber(dayNumber(key) + n);
}

/** Calendar days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/** Local calendar date of an ISO timestamp. */
export function entryDateKey(iso: string): string {
  return toDateKey(new Date(iso));
}

export function isValidIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 10 && Number.isFinite(Date.parse(value));
}

/** Combine a local date key and `HH:MM` into a Date; null if invalid. */
export function combineDateTime(dateKey: string, time: string): Date | null {
  if (!isValidDateKey(dateKey)) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = +m[1];
  const mi = +m[2];
  if (h > 23 || mi > 59) return null;
  const [y, mo, d] = dateKey.split('-').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}
