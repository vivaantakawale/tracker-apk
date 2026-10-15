/**
 * Trend statistics. Calculation rules (also listed in Settings, "How numbers are calculated"):
 *
 * - Ordering: entries are sorted by `measured_at`, ties broken by
 *   `created_at` then `id`. The *latest* (current) weight is the last entry in
 *   that order, i.e. the reading with the most recent measurement time.
 * - Daily summary: when a local calendar day has several readings, the day is
 *   summarised by the arithmetic mean of its readings. Individual readings are
 *   never altered.
 * - N-day change: the latest reading minus the last reading taken on or
 *   before (latest reading's date − N days). If that baseline is more than a
 *   tolerance older than the comparison date, the result is "not enough data"
 *   rather than silently comparing against a much older value.
 * - Averages: mean of *daily summaries* in a window of calendar days, so a
 *   day with three readings does not count three times. Missing days are
 *   simply absent; they are never treated as zero or interpolated.
 * - Rolling 7-day average: for each logged day d, mean of daily summaries in
 *   [d − 6, d], shown only when at least 3 days in that window have data.
 * - Rate: least-squares regression of daily summaries against day number.
 */
import type { WeightEntry } from './types';
import { dayNumber, entryDateKey } from './dates';

export function compareEntries(a: WeightEntry, b: WeightEntry): number {
  const ta = Date.parse(a.measured_at);
  const tb = Date.parse(b.measured_at);
  if (ta !== tb) return ta - tb;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortEntries(entries: readonly WeightEntry[]): WeightEntry[] {
  return [...entries].sort(compareEntries);
}

export function latestEntry(sorted: readonly WeightEntry[]): WeightEntry | null {
  return sorted.length ? sorted[sorted.length - 1] : null;
}

export interface DailyPoint {
  date: string;
  day: number;
  weight_kg: number;
  count: number;
  entries: WeightEntry[];
}

export function dailySummaries(sorted: readonly WeightEntry[]): DailyPoint[] {
  const map = new Map<string, WeightEntry[]>();
  for (const e of sorted) {
    const key = entryDateKey(e.measured_at);
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  }
  return [...map.entries()]
    .map(([date, es]) => ({
      date,
      day: dayNumber(date),
      weight_kg: es.reduce((s, e) => s + e.weight_kg, 0) / es.length,
      count: es.length,
      entries: es,
    }))
    .sort((a, b) => a.day - b.day);
}

export interface Change {
  change: number;
  from: WeightEntry;
  to: WeightEntry;
}

/** Latest reading minus the reading before it. */
export function previousChange(sorted: readonly WeightEntry[]): Change | null {
  if (sorted.length < 2) return null;
  const to = sorted[sorted.length - 1];
  const from = sorted[sorted.length - 2];
  return { change: to.weight_kg - from.weight_kg, from, to };
}

/**
 * Change over `days` calendar days, anchored on the latest reading.
 * Baseline = last reading dated on or before (latest date − days), provided it
 * is no more than `toleranceDays` before that comparison date.
 */
export function changeOverDays(
  sorted: readonly WeightEntry[],
  days: number,
  toleranceDays: number,
): Change | null {
  const to = latestEntry(sorted);
  if (!to) return null;
  const compareDay = dayNumber(entryDateKey(to.measured_at)) - days;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const d = dayNumber(entryDateKey(sorted[i].measured_at));
    if (d <= compareDay) {
      if (compareDay - d > toleranceDays) return null;
      return { change: to.weight_kg - sorted[i].weight_kg, from: sorted[i], to };
    }
  }
  return null;
}

export interface WindowAverage {
  avg: number;
  days: number;
}

/** Mean of daily summaries for the `days` calendar days ending on `endDay`. */
export function windowAverage(
  daily: readonly DailyPoint[],
  endDay: number,
  days: number,
): WindowAverage | null {
  const pts = daily.filter((p) => p.day <= endDay && p.day > endDay - days);
  if (!pts.length) return null;
  return { avg: pts.reduce((s, p) => s + p.weight_kg, 0) / pts.length, days: pts.length };
}

export interface WeeklyComparison {
  current: WindowAverage | null;
  previous: WindowAverage | null;
  diff: number | null;
}

/** Last 7 calendar days (ending `endDay`) vs. the 7 days before them. */
export function weeklyComparison(daily: readonly DailyPoint[], endDay: number): WeeklyComparison {
  const current = windowAverage(daily, endDay, 7);
  const previous = windowAverage(daily, endDay - 7, 7);
  return {
    current,
    previous,
    diff: current && previous ? current.avg - previous.avg : null,
  };
}

export interface TrendPoint {
  day: number;
  date: string;
  value: number;
}

export const ROLLING_WINDOW_DAYS = 7;
export const ROLLING_MIN_DAYS = 3;

export function rollingAverage(
  daily: readonly DailyPoint[],
  windowDays = ROLLING_WINDOW_DAYS,
  minDays = ROLLING_MIN_DAYS,
): TrendPoint[] {
  const out: TrendPoint[] = [];
  let start = 0;
  let sum = 0;
  for (let i = 0; i < daily.length; i++) {
    sum += daily[i].weight_kg;
    while (daily[start].day <= daily[i].day - windowDays) {
      sum -= daily[start].weight_kg;
      start++;
    }
    const n = i - start + 1;
    if (n >= minDays) out.push({ day: daily[i].day, date: daily[i].date, value: sum / n });
  }
  return out;
}

export function extremes(
  sorted: readonly WeightEntry[],
): { min: WeightEntry; max: WeightEntry } | null {
  if (!sorted.length) return null;
  let min = sorted[0];
  let max = sorted[0];
  for (const e of sorted) {
    if (e.weight_kg < min.weight_kg) min = e;
    if (e.weight_kg > max.weight_kg) max = e;
  }
  return { min, max };
}

export interface Regression {
  slope: number;
  intercept: number;
  n: number;
  /** Standard error of the slope; null when n < 3. */
  slopeSE: number | null;
}

export function linearRegression(points: readonly { x: number; y: number }[]): Regression | null {
  const n = points.length;
  if (n < 2) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let slopeSE: number | null = null;
  if (n > 2) {
    let ss = 0;
    for (const p of points) ss += (p.y - (intercept + slope * p.x)) ** 2;
    slopeSE = Math.sqrt(ss / (n - 2) / sxx);
  }
  return { slope, intercept, n, slopeSE };
}

export interface TrendRate {
  /** kg per day */
  slope: number;
  slopeSE: number | null;
  /** Fitted trend value on the last day of the window (kg). */
  fittedEnd: number;
  endDay: number;
  days: number;
  spanDays: number;
}

/**
 * Regression of daily summaries over the `windowDays` calendar days ending on
 * the most recent logged day. Requires `minDays` logged days covering at least
 * `minSpanDays` between first and last.
 */
export function trendRate(
  daily: readonly DailyPoint[],
  windowDays: number,
  minDays: number,
  minSpanDays: number,
): TrendRate | null {
  if (!daily.length) return null;
  const endDay = daily[daily.length - 1].day;
  const pts = daily.filter((p) => p.day > endDay - windowDays);
  if (pts.length < minDays) return null;
  const spanDays = pts[pts.length - 1].day - pts[0].day;
  if (spanDays < minSpanDays) return null;
  const reg = linearRegression(pts.map((p) => ({ x: p.day - endDay, y: p.weight_kg })));
  if (!reg) return null;
  return {
    slope: reg.slope,
    slopeSE: reg.slopeSE,
    fittedEnd: reg.intercept,
    endDay,
    days: pts.length,
    spanDays,
  };
}

/** Weekly rate shown in trend statistics: 28-day window, ≥5 days over ≥7 days. */
export function weeklyRate(daily: readonly DailyPoint[]): number | null {
  const t = trendRate(daily, 28, 5, 7);
  return t ? t.slope * 7 : null;
}
