export type RangeKey = '7d' | '30d' | '3m' | '6m' | 'all';

export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '3m', label: 'Last 3 months', days: 91 },
  { key: '6m', label: 'Last 6 months', days: 182 },
  { key: 'all', label: 'All time', days: null },
];

/** Inclusive calendar-day bounds for a range ending today. */
export function rangeBounds(key: RangeKey, todayDay: number, firstDay: number | null): { startDay: number; endDay: number } {
  const r = RANGES.find((x) => x.key === key)!;
  if (r.days !== null) return { startDay: todayDay - r.days + 1, endDay: todayDay };
  const start = firstDay === null ? todayDay - 6 : Math.min(firstDay, todayDay - 6);
  return { startDay: start, endDay: todayDay };
}
