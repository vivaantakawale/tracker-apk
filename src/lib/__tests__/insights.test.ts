import { describe, expect, it } from 'vitest';
import { entry, goal, key, phase } from './helpers';
import { computeMilestones } from '../milestones';
import { computeForecast } from '../forecast';
import { dailySummaries, sortEntries } from '../stats';
import { activePhase, phaseStats, validatePhase } from '../phases';

describe('milestones', () => {
  it('detects the first measurement and change milestones from real data', () => {
    const s = sortEntries([entry(0, 55.5), entry(3, 56.0), entry(6, 56.6), entry(9, 58.1)]);
    const ms = computeMilestones(s, goal(55.5, 65), 'kg');
    const byId = Object.fromEntries(ms.map((m) => [m.id, m]));
    expect(byId.start.achievedAt).toBe(s[0].measured_at);
    expect(byId['change-kg-1'].achievedAt).toBe(s[2].measured_at); // +1.1 on day 6
    expect(byId['change-kg-2.5'].achievedAt).toBe(s[3].measured_at); // +2.6 on day 9
    expect(byId['change-kg-5'].achievedAt).toBeNull();
    expect(byId['goal-25'].achievedAt).toBe(s[3].measured_at); // 2.6/9.5 = 27%
    expect(byId['goal-50'].achievedAt).toBeNull();
  });
  it('never duplicates milestones', () => {
    const s = sortEntries([entry(0, 70), entry(1, 71.2), entry(2, 71.5), entry(3, 71.1), entry(4, 71.9)]);
    const ms = computeMilestones(s, goal(70, 80), 'kg');
    const ids = ms.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ms.filter((m) => m.id === 'change-kg-1')).toHaveLength(1);
  });
  it('recalculates when the triggering entry is edited or deleted', () => {
    const a = entry(0, 70);
    const b = entry(2, 71.3);
    const before = computeMilestones(sortEntries([a, b]), goal(70, 80), 'kg');
    expect(before.find((m) => m.id === 'change-kg-1')!.achievedAt).toBe(b.measured_at);
    const edited = computeMilestones(sortEntries([a, { ...b, weight_kg: 70.6 }]), goal(70, 80), 'kg');
    expect(edited.find((m) => m.id === 'change-kg-1')!.achievedAt).toBeNull();
    const deleted = computeMilestones(sortEntries([a]), goal(70, 80), 'kg');
    expect(deleted.find((m) => m.id === 'change-kg-1')!.achievedAt).toBeNull();
  });
  it('supports loss goals in the opposite direction', () => {
    const s = sortEntries([entry(0, 90), entry(5, 88.9)]);
    const ms = computeMilestones(s, goal(90, 80), 'kg');
    expect(ms.find((m) => m.id === 'change-kg-1')!.label).toBe('First 1 kg lost');
    expect(ms.find((m) => m.id === 'change-kg-1')!.achievedAt).toBe(s[1].measured_at);
  });
  it('ignores readings before the goal start date', () => {
    const s = sortEntries([entry(0, 72), entry(10, 70), entry(12, 70.4)]);
    const ms = computeMilestones(s, goal(70, 75, 10), 'kg');
    expect(ms.find((m) => m.id === 'change-kg-1')!.achievedAt).toBeNull();
  });
  it('does not mark future milestones complete and uses lb steps for lb users', () => {
    const ms = computeMilestones(sortEntries([entry(0, 70)]), goal(70, 80), 'lb');
    expect(ms.filter((m) => m.kind !== 'start').every((m) => m.achievedAt === null)).toBe(true);
    expect(ms.some((m) => m.label === 'First 5 lb gained')).toBe(true);
  });
  it('without a goal only the first-measurement milestone exists', () => {
    expect(computeMilestones([], null, 'kg')).toHaveLength(1);
    expect(computeMilestones([], null, 'kg')[0].achievedAt).toBeNull();
  });
});

function series(days: number, start: number, perDay: number, noise = 0) {
  return sortEntries(
    Array.from({ length: days }, (_, i) => entry(i, start + perDay * i + (i % 2 ? noise : -noise))),
  );
}

describe('forecast', () => {
  it('needs enough data', () => {
    const s = series(5, 60, 0.05);
    const f = computeForecast(dailySummaries(s), goal(60, 65), s[s.length - 1].weight_kg);
    expect(f.status).toBe('insufficient');
  });
  it('requires readings spread over at least 14 days', () => {
    const s = series(12, 60, 0.05); // 12 days but span = 11
    expect(computeForecast(dailySummaries(s), goal(60, 65), 60.55).status).toBe('insufficient');
  });
  it('produces an estimate for a steady gain', () => {
    const s = series(28, 60, 0.05, 0.2); // +0.35 kg/week with noise
    const latest = s[s.length - 1].weight_kg;
    const f = computeForecast(dailySummaries(s), goal(60, 65), latest);
    expect(f.status).toBe('ok');
    if (f.status === 'ok') {
      expect(f.ratePerWeek).toBeCloseTo(0.35, 1);
      // fitted end ≈ 61.35 → (65-61.35)/0.05 ≈ 73 days
      expect(f.daysRemaining).toBeGreaterThan(60);
      expect(f.daysRemaining).toBeLessThan(85);
    }
  });
  it('suppresses a forecast when the trend is flat', () => {
    const s = series(28, 70, 0, 0.3);
    expect(computeForecast(dailySummaries(s), goal(70, 75), 70).status).toBe('flat');
  });
  it('suppresses a forecast when moving away from the target', () => {
    const s = series(28, 70, -0.05);
    expect(computeForecast(dailySummaries(s), goal(70, 75), 68.65).status).toBe('wrong-direction');
  });
  it('reports reached / maintain / no goal', () => {
    const s = series(28, 70, 0.05);
    expect(computeForecast(dailySummaries(s), goal(60, 65), 71.35).status).toBe('reached');
    expect(computeForecast(dailySummaries(s), goal(70, 70), 71).status).toBe('maintain');
    expect(computeForecast(dailySummaries(s), null, 71).status).toBe('no-goal');
  });
  it('refuses to extrapolate beyond two years', () => {
    const s = series(28, 70, 0.01); // 0.07 kg/week
    expect(computeForecast(dailySummaries(s), goal(70, 120), 70.27).status).toBe('too-far');
  });
});

describe('phases', () => {
  it('rejects overlapping phases and invalid ranges', () => {
    const a = phase('a', '2026-01-01', '2026-01-31');
    expect(validatePhase(phase('b', '2026-01-31', null), [a])).toMatch(/overlap/);
    expect(validatePhase(phase('b', '2026-02-01', null), [a])).toBeNull();
    expect(validatePhase(phase('b', '2026-02-10', '2026-02-01'), [a])).toMatch(/before/);
    const open = phase('o', '2026-03-01', null);
    expect(validatePhase(phase('c', '2026-04-01', null), [open])).toMatch(/overlap/);
  });
  it('finds the active phase', () => {
    const ps = [phase('a', '2026-01-01', '2026-01-31'), phase('b', '2026-02-01', null)];
    expect(activePhase(ps, '2026-01-15')!.id).toBe('a');
    expect(activePhase(ps, '2026-03-15')!.id).toBe('b');
  });
  it('phase statistics respect the phase date boundaries', () => {
    const s = sortEntries([entry(0, 70), entry(10, 71), entry(15, 72), entry(20, 73), entry(31, 80)]);
    const p = phase('p', key(10), key(20));
    const st = phaseStats(p, s, key(40));
    expect(st.count).toBe(3);
    expect(st.startEntry!.weight_kg).toBe(71);
    expect(st.latestEntry!.weight_kg).toBe(73);
    expect(st.change).toBeCloseTo(2);
    expect(st.elapsedDays).toBe(11);
  });
  it('computes average rate when enough data exists', () => {
    const s = sortEntries(Array.from({ length: 10 }, (_, i) => entry(i, 70 + i * 0.1)));
    const st = phaseStats(phase('p', key(0), null), s, key(9));
    expect(st.ratePerWeek).toBeCloseTo(0.7);
    const few = phaseStats(phase('p', key(0), null), s.slice(0, 2), key(9));
    expect(few.ratePerWeek).toBeNull();
  });
});
