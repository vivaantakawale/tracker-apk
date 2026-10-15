/**
 * Target-date forecast.
 *
 * Method: ordinary least-squares regression of daily summaries (mean of each
 * day's readings) against calendar day, over the 42 days ending on the most
 * recent logged day. Requirements: ≥10 logged days spanning ≥14 days.
 *
 * The regression's fitted value on the last day is used as "current" weight,
 * which damps day-to-day noise (water, food, scale variance). Then
 *
 *   days remaining = (target − fitted current) / slope
 *
 * No forecast is produced when:
 *  - the trend is effectively flat (|rate| < 0.05 kg/week),
 *  - the trend points away from the target,
 *  - the estimate is beyond ~2 years (too speculative to show).
 * A rough range is derived from slope ± 1 standard error; the date is shown
 * at early/mid/late-month resolution to avoid false precision.
 */
import type { WeightGoal } from './types';
import type { DailyPoint } from './stats';
import { trendRate } from './stats';
import { goalDirection } from './goal';
import { DAY_MS, keyFromDayNumber, parseDateKey } from './dates';

export const FORECAST_WINDOW_DAYS = 42;
export const FORECAST_MIN_DAYS = 10;
export const FORECAST_MIN_SPAN = 14;
export const FLAT_RATE_KG_PER_WEEK = 0.05;
export const MAX_FORECAST_DAYS = 730;

export type Forecast =
  | { status: 'no-goal' }
  | { status: 'maintain' }
  | { status: 'reached' }
  | { status: 'insufficient'; days: number; spanDays: number }
  | { status: 'flat'; ratePerWeek: number }
  | { status: 'wrong-direction'; ratePerWeek: number }
  | { status: 'too-far'; ratePerWeek: number }
  | {
      status: 'ok';
      ratePerWeek: number;
      daysRemaining: number;
      date: Date;
      rangeStart: Date | null;
      rangeEnd: Date | null;
      windowDays: number;
      daysUsed: number;
    };

export function computeForecast(
  daily: readonly DailyPoint[],
  goal: WeightGoal | null,
  latestKg: number | null,
): Forecast {
  if (!goal) return { status: 'no-goal' };
  const direction = goalDirection(goal);
  if (direction === 'maintain') return { status: 'maintain' };
  if (latestKg !== null) {
    const reached = direction === 'gain' ? latestKg >= goal.target_weight_kg : latestKg <= goal.target_weight_kg;
    if (reached) return { status: 'reached' };
  }

  const endDay = daily.length ? daily[daily.length - 1].day : 0;
  const recent = daily.filter((p) => p.day > endDay - FORECAST_WINDOW_DAYS);
  const t = trendRate(daily, FORECAST_WINDOW_DAYS, FORECAST_MIN_DAYS, FORECAST_MIN_SPAN);
  if (!t) {
    const span = recent.length ? recent[recent.length - 1].day - recent[0].day : 0;
    return { status: 'insufficient', days: recent.length, spanDays: span };
  }

  const ratePerWeek = t.slope * 7;
  if (Math.abs(ratePerWeek) < FLAT_RATE_KG_PER_WEEK) return { status: 'flat', ratePerWeek };
  const sign = direction === 'gain' ? 1 : -1;
  if (Math.sign(t.slope) !== sign) return { status: 'wrong-direction', ratePerWeek };

  const remaining = goal.target_weight_kg - t.fittedEnd;
  const daysRemaining = Math.max(0, remaining / t.slope);
  if (daysRemaining > MAX_FORECAST_DAYS) return { status: 'too-far', ratePerWeek };

  const endDate = parseDateKey(keyFromDayNumber(t.endDay));
  const toDate = (days: number) => new Date(endDate.getTime() + Math.round(days) * DAY_MS);

  let rangeStart: Date | null = null;
  let rangeEnd: Date | null = null;
  if (t.slopeSE !== null && remaining * sign > 0) {
    const fast = t.slope + sign * t.slopeSE;
    const slow = t.slope - sign * t.slopeSE;
    rangeStart = toDate(remaining / fast);
    if (Math.sign(slow) === sign && Math.abs(slow * 7) >= FLAT_RATE_KG_PER_WEEK) {
      const d = remaining / slow;
      rangeEnd = d <= MAX_FORECAST_DAYS ? toDate(d) : null;
    }
  }

  return {
    status: 'ok',
    ratePerWeek,
    daysRemaining,
    date: toDate(daysRemaining),
    rangeStart,
    rangeEnd,
    windowDays: FORECAST_WINDOW_DAYS,
    daysUsed: t.days,
  };
}
