import type { WeightUnit } from './types';

/** Exact international avoirdupois pound. */
export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;

/** Plausible adult body-weight bounds used for input validation (kg). */
export const WEIGHT_LIMITS_KG = { min: 20, max: 400 } as const;
/** Plausible height bounds (cm). */
export const HEIGHT_LIMITS_CM = { min: 50, max: 272 } as const;

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalIn = cm / CM_PER_INCH;
  let ft = Math.floor(totalIn / 12);
  let inches = Math.round((totalIn - ft * 12) * 10) / 10;
  if (inches >= 12) {
    ft += 1;
    inches -= 12;
  }
  return { ft, inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * CM_PER_INCH;
}

/**
 * Parse a user-typed decimal. Accepts a comma as the decimal separator
 * (common on Android keyboards in many locales). Returns null if invalid.
 */
export function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type ParseResult = { ok: true; kg: number } | { ok: false; error: string };

/** Validate a typed weight and convert it to kilograms (no rounding). */
export function parseWeightInput(raw: string, unit: WeightUnit): ParseResult {
  if (raw.trim() === '') return { ok: false, error: 'Enter a weight.' };
  const n = parseDecimal(raw);
  if (n === null) return { ok: false, error: 'Enter a number, e.g. 70.4' };
  const kg = toKg(n, unit);
  if (kg < WEIGHT_LIMITS_KG.min || kg > WEIGHT_LIMITS_KG.max) {
    const lo = fromKg(WEIGHT_LIMITS_KG.min, unit).toFixed(0);
    const hi = fromKg(WEIGHT_LIMITS_KG.max, unit).toFixed(0);
    return { ok: false, error: `Weight must be between ${lo} and ${hi} ${unit}.` };
  }
  return { ok: true, kg };
}
