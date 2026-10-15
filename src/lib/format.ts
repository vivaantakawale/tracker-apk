import type { WeightUnit } from './types';
import { fromKg } from './units';
import { parseDateKey } from './dates';

/** All rounding happens here, at presentation time. */
export function fmtWeight(kg: number, unit: WeightUnit, digits = 1): string {
  return fromKg(kg, unit).toFixed(digits);
}

/** Signed change, using a true minus sign. "0.0" carries no sign. */
export function fmtDelta(kg: number, unit: WeightUnit, digits = 1): string {
  const v = fromKg(kg, unit);
  const s = Math.abs(v).toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return `${v > 0 ? '+' : '−'}${s}`;
}

const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, o);
const F = {
  short: dtf({ day: 'numeric', month: 'short' }),
  medium: dtf({ day: 'numeric', month: 'short', year: 'numeric' }),
  weekday: dtf({ weekday: 'short', day: 'numeric', month: 'short' }),
  long: dtf({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  monthYear: dtf({ month: 'long', year: 'numeric' }),
  monthShortYear: dtf({ month: 'short', year: '2-digit' }),
  time: dtf({ hour: 'numeric', minute: '2-digit' }),
};

type DateStyle = keyof typeof F;

export function fmtDateKey(key: string, style: DateStyle = 'medium'): string {
  return F[style].format(parseDateKey(key));
}

export function fmtDate(d: Date, style: DateStyle = 'medium'): string {
  return F[style].format(d);
}

export function fmtTime(iso: string): string {
  return F.time.format(new Date(iso));
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${F.medium.format(d)}, ${F.time.format(d)}`;
}

export function fmtDuration(days: number): string {
  if (days < 1) return 'Less than a day';
  if (days === 1) return '1 day';
  if (days < 14) return `${days} days`;
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  return rem ? `${weeks} wk ${rem} d` : `${weeks} weeks`;
}

/** "early / mid / late <Month Year>": deliberately coarse for estimates. */
export function fmtApproxDate(d: Date): string {
  const day = d.getDate();
  const part = day <= 10 ? 'Early' : day <= 20 ? 'Mid' : 'Late';
  return `${part} ${F.monthYear.format(d)}`;
}
