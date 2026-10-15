import type { WeightEntry } from './types';
import { WEIGHT_LIMITS_KG } from './units';

/** Readings may be at most this far in the future (clock skew allowance). */
export const FUTURE_TOLERANCE_MS = 5 * 60_000;
export const MIN_MEASURED_AT = Date.parse('1900-01-01T00:00:00Z');
export const NOTES_MAX = 500;

export interface EntryInput {
  weight_kg: number;
  measured_at: string;
  notes: string;
}

/**
 * Validate a reading before saving. Returns an error message or null.
 * Future readings are rejected deliberately: a weight can only be measured
 * once it has happened.
 */
export function validateEntry(
  input: EntryInput,
  existing: readonly WeightEntry[],
  editingId: string | null,
  now: Date = new Date(),
): string | null {
  if (!Number.isFinite(input.weight_kg)) return 'Enter a valid weight.';
  if (input.weight_kg < WEIGHT_LIMITS_KG.min || input.weight_kg > WEIGHT_LIMITS_KG.max) {
    return 'That weight is outside the plausible range.';
  }
  const t = Date.parse(input.measured_at);
  if (!Number.isFinite(t)) return 'Choose a valid date and time.';
  if (t > now.getTime() + FUTURE_TOLERANCE_MS) return 'Measurements cannot be in the future.';
  if (t < MIN_MEASURED_AT) return 'That date is too far in the past.';
  if (input.notes.length > NOTES_MAX) return `Notes can be at most ${NOTES_MAX} characters.`;
  const dup = existing.find(
    (e) =>
      e.id !== editingId &&
      Math.abs(Date.parse(e.measured_at) - t) < 60_000 &&
      Math.abs(e.weight_kg - input.weight_kg) < 0.005,
  );
  if (dup) return 'An identical reading at this time is already saved.';
  return null;
}
