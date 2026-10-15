import { describe, expect, it } from 'vitest';
import { entry, goal, key } from './helpers';
import { cmToFtIn, fromKg, ftInToCm, parseDecimal, parseWeightInput, toKg } from '../units';
import {
  changeOverDays,
  dailySummaries,
  extremes,
  latestEntry,
  linearRegression,
  previousChange,
  rollingAverage,
  sortEntries,
  weeklyComparison,
  weeklyRate,
  windowAverage,
} from '../stats';
import { goalProgress } from '../goal';
import { bmiBandIndex, bmiBarPosition, bmiCategory, computeBmi } from '../bmi';
import { dayNumber, addDays, diffDays, isValidDateKey, combineDateTime } from '../dates';
import { fmtDelta } from '../format';
import { validateEntry } from '../entries';

describe('units', () => {
  it('converts kg and lb exactly and reversibly', () => {
    expect(toKg(1, 'lb')).toBeCloseTo(0.45359237, 10);
    expect(fromKg(100, 'lb')).toBeCloseTo(220.462262, 5);
    expect(fromKg(toKg(154.3, 'lb'), 'lb')).toBeCloseTo(154.3, 10);
    expect(toKg(70, 'kg')).toBe(70);
  });
  it('converts height', () => {
    expect(ftInToCm(5, 10)).toBeCloseTo(177.8, 6);
    expect(cmToFtIn(177.8)).toEqual({ ft: 5, inches: 10 });
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, inches: 0 });
  });
  it('parses decimals including comma separators', () => {
    expect(parseDecimal('70.4')).toBe(70.4);
    expect(parseDecimal('70,4')).toBe(70.4);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('7o')).toBeNull();
    expect(parseDecimal('-5')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });
  it('validates plausible weights', () => {
    expect(parseWeightInput('', 'kg').ok).toBe(false);
    expect(parseWeightInput('5', 'kg').ok).toBe(false);
    expect(parseWeightInput('500', 'kg').ok).toBe(false);
    expect(parseWeightInput('abc', 'kg').ok).toBe(false);
    const r = parseWeightInput('154', 'lb');
    expect(r.ok && r.kg).toBeCloseTo(69.853, 3);
  });
});

describe('dates', () => {
  it('does day arithmetic across month and DST boundaries', () => {
    expect(addDays('2026-03-28', 3)).toBe('2026-03-31');
    expect(addDays('2026-10-24', 3)).toBe('2026-10-27');
    expect(diffDays('2026-02-27', '2026-03-01')).toBe(2);
    expect(dayNumber('2026-01-02') - dayNumber('2026-01-01')).toBe(1);
  });
  it('validates dates and times', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-02-28')).toBe(true);
    expect(combineDateTime('2026-01-01', '25:00')).toBeNull();
    expect(combineDateTime('2026-01-01', '07:30')!.getHours()).toBe(7);
  });
});

describe('ordering and latest weight', () => {
  it('uses the most recent measurement time, not insertion order', () => {
    const a = entry(5, 70);
    const b = entry(2, 72); // historical entry added later
    const sorted = sortEntries([a, b]);
    expect(latestEntry(sorted)!.id).toBe(a.id);
  });
  it('previous change compares the two most recent readings', () => {
    const s = sortEntries([entry(0, 70), entry(1, 70.6)]);
    expect(previousChange(s)!.change).toBeCloseTo(0.6);
    expect(previousChange([entry(0, 70)])).toBeNull();
  });
});

describe('daily summaries and averages', () => {
  it('averages multiple readings on one day without altering them', () => {
    const s = sortEntries([entry(0, 70, 7), entry(0, 71, 21), entry(1, 70.5)]);
    const d = dailySummaries(s);
    expect(d).toHaveLength(2);
    expect(d[0].weight_kg).toBeCloseTo(70.5);
    expect(d[0].count).toBe(2);
  });
  it('7-day average uses logged days only (missing days are not zero)', () => {
    // Window ending day 16 covers days 10–16; day 9 is outside it.
    const s = sortEntries([entry(9, 70), entry(13, 71), entry(16, 72)]);
    const d = dailySummaries(s);
    const avg = windowAverage(d, dayNumber(key(16)), 7)!;
    expect(avg.days).toBe(2);
    expect(avg.avg).toBeCloseTo(71.5);
  });
  it('a day with 3 readings counts once in the average', () => {
    const s = sortEntries([entry(0, 60, 6), entry(0, 60, 7), entry(0, 60, 8), entry(1, 80)]);
    expect(windowAverage(dailySummaries(s), dayNumber(key(1)), 7)!.avg).toBeCloseTo(70);
  });
  it('compares consecutive weekly averages', () => {
    const es = [];
    for (let i = 0; i < 7; i++) es.push(entry(i, 70));
    for (let i = 7; i < 14; i++) es.push(entry(i, 71));
    const w = weeklyComparison(dailySummaries(sortEntries(es)), dayNumber(key(13)));
    expect(w.current!.avg).toBeCloseTo(71);
    expect(w.previous!.avg).toBeCloseTo(70);
    expect(w.diff).toBeCloseTo(1);
  });
  it('reports insufficient data as null', () => {
    expect(windowAverage([], 0, 7)).toBeNull();
    const w = weeklyComparison(dailySummaries([entry(0, 70)]), dayNumber(key(0)));
    expect(w.previous).toBeNull();
    expect(w.diff).toBeNull();
  });
  it('rolling average needs 3 days in the window', () => {
    const d = dailySummaries(sortEntries([entry(0, 70), entry(1, 71), entry(2, 72), entry(20, 75)]));
    const r = rollingAverage(d);
    expect(r).toHaveLength(1);
    expect(r[0].value).toBeCloseTo(71);
  });
});

describe('N-day change', () => {
  it('compares with the last reading on or before the comparison date', () => {
    const s = sortEntries([entry(0, 70), entry(5, 70.5), entry(6, 70.8), entry(12, 71.4)]);
    // comparison date = day 5 → reading on day 5
    expect(changeOverDays(s, 7, 3)!.change).toBeCloseTo(0.9);
  });
  it('accepts readings at a different time of day on the comparison date', () => {
    const s = sortEntries([entry(0, 70, 9), entry(7, 71, 7)]);
    expect(changeOverDays(s, 7, 3)!.change).toBeCloseTo(1);
  });
  it('returns null when the only baseline is far too old', () => {
    const s = sortEntries([entry(0, 70), entry(30, 72)]);
    expect(changeOverDays(s, 7, 3)).toBeNull();
    expect(changeOverDays(s, 30, 7)!.change).toBeCloseTo(2);
  });
  it('returns null with no history', () => {
    expect(changeOverDays([entry(0, 70)], 7, 3)).toBeNull();
  });
});

describe('extremes and regression', () => {
  it('finds lowest and highest', () => {
    const e = extremes(sortEntries([entry(0, 70), entry(1, 68), entry(2, 73)]))!;
    expect(e.min.weight_kg).toBe(68);
    expect(e.max.weight_kg).toBe(73);
    expect(extremes([])).toBeNull();
  });
  it('fits a straight line', () => {
    const r = linearRegression([0, 1, 2, 3].map((x) => ({ x, y: 2 * x + 1 })))!;
    expect(r.slope).toBeCloseTo(2);
    expect(r.intercept).toBeCloseTo(1);
    expect(linearRegression([{ x: 1, y: 1 }])).toBeNull();
    expect(linearRegression([{ x: 1, y: 1 }, { x: 1, y: 2 }])).toBeNull();
  });
  it('weekly rate from regression', () => {
    const es = Array.from({ length: 10 }, (_, i) => entry(i, 70 + i * 0.05));
    expect(weeklyRate(dailySummaries(sortEntries(es)))).toBeCloseTo(0.35);
    expect(weeklyRate(dailySummaries([entry(0, 70), entry(1, 71)]))).toBeNull();
  });
});

describe('goal progress', () => {
  it('gain goal: 55.5 → 65', () => {
    const p = goalProgress(goal(55.5, 65), 60.25);
    expect(p.direction).toBe('gain');
    expect(p.fraction).toBeCloseTo(0.5);
    expect(p.remaining).toBeCloseTo(4.75);
    expect(p.reached).toBe(false);
  });
  it('loss goal uses the same formula', () => {
    const p = goalProgress(goal(90, 80), 87.5);
    expect(p.direction).toBe('loss');
    expect(p.fraction).toBeCloseTo(0.25);
  });
  it('keeps raw fraction but clamps the bar when moving away', () => {
    const p = goalProgress(goal(70, 75), 69);
    expect(p.fraction).toBeCloseTo(-0.2);
    expect(p.barFraction).toBe(0);
    const over = goalProgress(goal(70, 75), 76);
    expect(over.fraction).toBeCloseTo(1.2);
    expect(over.barFraction).toBe(1);
    expect(over.reached).toBe(true);
  });
  it('handles a zero-distance (maintenance) goal without dividing by zero', () => {
    const p = goalProgress(goal(70, 70), 70.6);
    expect(p.direction).toBe('maintain');
    expect(p.fraction).toBeNull();
    expect(p.reached).toBe(true);
    expect(goalProgress(goal(70, 70), 72).reached).toBe(false);
  });
  it('handles no current weight', () => {
    const p = goalProgress(goal(70, 75), null);
    expect(p.fraction).toBeNull();
    expect(p.barFraction).toBe(0);
  });
});

describe('BMI', () => {
  it('computes from kg and cm', () => {
    expect(computeBmi(70, 175)).toBeCloseTo(22.857, 3);
    expect(computeBmi(toKg(154, 'lb'), ftInToCm(5, 9))).toBeCloseTo(22.74, 1);
  });
  it('never divides by zero or uses missing data', () => {
    expect(computeBmi(70, 0)).toBeNull();
    expect(computeBmi(null, 175)).toBeNull();
    expect(computeBmi(70, null)).toBeNull();
  });
  it('places the marker consistently with the category bands', () => {
    expect(bmiBarPosition(10)).toBe(0);
    expect(bmiBarPosition(50)).toBe(1);
    expect(bmiBarPosition(18.5)).toBeCloseTo(3 / 8.5);
    expect(bmiBarPosition(25)).toBeCloseTo(5.5 / 8.5);
    expect(bmiBarPosition(21.75)).toBeCloseTo(4.25 / 8.5);
    expect(bmiBandIndex(18.49)).toBe(2);
    expect(bmiBandIndex(18.5)).toBe(3);
    expect(bmiBandIndex(24.99)).toBe(3);
    expect(bmiBandIndex(45)).toBe(6);
  });
  it('uses standard adult thresholds', () => {
    expect(bmiCategory(18.49)).toBe('Underweight');
    expect(bmiCategory(18.5)).toBe('Normal weight');
    expect(bmiCategory(24.99)).toBe('Normal weight');
    expect(bmiCategory(25)).toBe('Overweight');
    expect(bmiCategory(30)).toBe('Obesity');
  });
});

describe('formatting', () => {
  it('rounds only at presentation and drops sign on zero', () => {
    expect(fmtDelta(0.04, 'kg')).toBe('0.0');
    expect(fmtDelta(-0.4, 'kg')).toBe('−0.4');
    expect(fmtDelta(0.45359237, 'lb')).toBe('+1.0');
  });
});

describe('entry validation', () => {
  const now = new Date(2026, 0, 10, 12);
  it('rejects future measurements and implausible weights', () => {
    expect(validateEntry({ weight_kg: 70, measured_at: new Date(2026, 0, 11).toISOString(), notes: '' }, [], null, now)).toMatch(/future/);
    expect(validateEntry({ weight_kg: 5, measured_at: new Date(2026, 0, 9).toISOString(), notes: '' }, [], null, now)).toMatch(/range/);
    expect(validateEntry({ weight_kg: NaN, measured_at: new Date(2026, 0, 9).toISOString(), notes: '' }, [], null, now)).toBeTruthy();
  });
  it('allows historical and multiple same-day readings, blocks exact duplicates', () => {
    const e = entry(5, 70, 8);
    expect(validateEntry({ weight_kg: 70.2, measured_at: entry(5, 0, 20).measured_at, notes: '' }, [e], null, now)).toBeNull();
    expect(validateEntry({ weight_kg: 70, measured_at: e.measured_at, notes: '' }, [e], null, now)).toMatch(/identical/);
    expect(validateEntry({ weight_kg: 70, measured_at: e.measured_at, notes: '' }, [e], e.id, now)).toBeNull();
  });
});
