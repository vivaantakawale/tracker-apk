/**
 * BMI = weight (kg) / height (m)². Always derived from the latest reading and
 * stored height, never persisted. Categories use the standard adult thresholds.
 */
export type BmiCategory = 'Underweight' | 'Normal weight' | 'Overweight' | 'Obesity';

export function computeBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg === null || heightCm === null) return null;
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || weightKg <= 0 || heightCm <= 0) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal weight';
  if (bmi < 30) return 'Overweight';
  return 'Obesity';
}

/**
 * Colour bands for the BMI bar (WHO sub-ranges, display only; the category
 * label always uses the four standard adult categories above). Bands are
 * drawn with visual weights rather than to scale so the healthy range is
 * prominent; the marker is placed piecewise-linearly within its band, so the
 * position is always consistent with the category.
 */
export const BMI_BANDS = [
  { from: 15, to: 16, weight: 1 },
  { from: 16, to: 17, weight: 1 },
  { from: 17, to: 18.5, weight: 1 },
  { from: 18.5, to: 25, weight: 2.5 },
  { from: 25, to: 30, weight: 1 },
  { from: 30, to: 35, weight: 1 },
  { from: 35, to: 40, weight: 1 },
] as const;

const BAND_TOTAL = BMI_BANDS.reduce((s, b) => s + b.weight, 0);

/** 0..1 position of a BMI value along the banded bar (clamped to 15–40). */
export function bmiBarPosition(bmi: number): number {
  const v = Math.min(40, Math.max(15, bmi));
  let acc = 0;
  for (const b of BMI_BANDS) {
    if (v <= b.to) return (acc + (b.weight * (v - b.from)) / (b.to - b.from)) / BAND_TOTAL;
    acc += b.weight;
  }
  return 1;
}

/** Index into BMI_BANDS for colouring. */
export function bmiBandIndex(bmi: number): number {
  const i = BMI_BANDS.findIndex((b) => bmi < b.to);
  return i === -1 ? BMI_BANDS.length - 1 : i;
}
