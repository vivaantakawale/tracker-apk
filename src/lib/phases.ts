/**
 * Phases are inclusive date ranges [start_date, end_date]; an open phase
 * (end_date = null) extends indefinitely. Phases may not overlap, which
 * guarantees at most one phase is active on any given day.
 *
 * Phase statistics only use readings whose local date falls inside the
 * phase's range (the range is capped at today for open phases).
 */
import type { PhaseType, WeightEntry, WeightPhase } from './types';
import { diffDays, entryDateKey, isValidDateKey } from './dates';
import { dailySummaries, linearRegression } from './stats';

export const PHASE_TYPES: { value: PhaseType; label: string; short: string }[] = [
  { value: 'bulk', label: 'Bulk / weight gain', short: 'Bulk' },
  { value: 'cut', label: 'Cut / weight loss', short: 'Cut' },
  { value: 'maintenance', label: 'Maintenance', short: 'Maintenance' },
];

export function phaseTypeLabel(t: PhaseType): string {
  return PHASE_TYPES.find((p) => p.value === t)?.short ?? t;
}

export function isPhaseActive(p: WeightPhase, today: string): boolean {
  return p.start_date <= today && (p.end_date === null || p.end_date >= today);
}

export function activePhase(phases: readonly WeightPhase[], today: string): WeightPhase | null {
  return phases.find((p) => isPhaseActive(p, today)) ?? null;
}

export function sortPhases(phases: readonly WeightPhase[]): WeightPhase[] {
  return [...phases].sort((a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0));
}

function overlaps(a: WeightPhase, b: WeightPhase): boolean {
  const aEnd = a.end_date ?? '9999-12-31';
  const bEnd = b.end_date ?? '9999-12-31';
  return a.start_date <= bEnd && b.start_date <= aEnd;
}

/** Returns an error message, or null when the phase is valid against `others`. */
export function validatePhase(p: WeightPhase, others: readonly WeightPhase[]): string | null {
  if (!p.name.trim()) return 'Give the phase a name.';
  if (!isValidDateKey(p.start_date)) return 'Choose a valid start date.';
  if (p.end_date !== null) {
    if (!isValidDateKey(p.end_date)) return 'Choose a valid end date.';
    if (p.end_date < p.start_date) return 'The end date cannot be before the start date.';
  }
  const clash = others.find((o) => o.id !== p.id && overlaps(p, o));
  if (clash) return `These dates overlap with "${clash.name}". Phases cannot overlap.`;
  return null;
}

export interface PhaseStats {
  count: number;
  startEntry: WeightEntry | null;
  latestEntry: WeightEntry | null;
  change: number | null;
  elapsedDays: number;
  /** kg per week; requires ≥4 logged days spanning ≥7 days. */
  ratePerWeek: number | null;
}

export function phaseStats(p: WeightPhase, sorted: readonly WeightEntry[], today: string): PhaseStats {
  const end = p.end_date ?? today;
  const inRange = sorted.filter((e) => {
    const k = entryDateKey(e.measured_at);
    return k >= p.start_date && k <= end;
  });
  const startEntry = inRange[0] ?? null;
  const latestEntry = inRange[inRange.length - 1] ?? null;
  const elapsedDays = Math.max(0, diffDays(p.start_date, end < today ? end : today) + 1);
  let ratePerWeek: number | null = null;
  const daily = dailySummaries(inRange);
  if (daily.length >= 4 && daily[daily.length - 1].day - daily[0].day >= 7) {
    const reg = linearRegression(daily.map((d) => ({ x: d.day, y: d.weight_kg })));
    if (reg) ratePerWeek = reg.slope * 7;
  }
  return {
    count: inRange.length,
    startEntry,
    latestEntry,
    change: startEntry && latestEntry && inRange.length > 1 ? latestEntry.weight_kg - startEntry.weight_kg : null,
    elapsedDays: p.start_date > today ? 0 : elapsedDays,
    ratePerWeek,
  };
}
