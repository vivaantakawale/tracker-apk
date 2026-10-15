import { useMemo } from 'react';
import { useStore } from './store';
import {
  changeOverDays,
  dailySummaries,
  extremes,
  latestEntry,
  previousChange,
  rollingAverage,
  weeklyComparison,
  weeklyRate,
  windowAverage,
} from '../lib/stats';
import { activeGoal, goalProgress } from '../lib/goal';
import { computeMilestones } from '../lib/milestones';
import { computeForecast } from '../lib/forecast';
import { computeBmi } from '../lib/bmi';
import { activePhase } from '../lib/phases';
import { dayNumber, todayKey } from '../lib/dates';

/** Every statistic shown in the UI, derived from the stored records. */
export function useDerived() {
  const { data } = useStore();
  const today = todayKey();
  return useMemo(() => {
    const sorted = data.entries;
    const daily = dailySummaries(sorted);
    const latest = latestEntry(sorted);
    const todayDay = dayNumber(today);
    const goal = activeGoal(data.goals);
    const latestKg = latest?.weight_kg ?? null;
    return {
      today,
      todayDay,
      sorted,
      daily,
      latest,
      rolling: rollingAverage(daily),
      prevChange: previousChange(sorted),
      change7: changeOverDays(sorted, 7, 3),
      change30: changeOverDays(sorted, 30, 7),
      avg7: windowAverage(daily, todayDay, 7),
      weekly: weeklyComparison(daily, todayDay),
      extremes: extremes(sorted),
      ratePerWeek: weeklyRate(daily),
      goal,
      progress: goal ? goalProgress(goal, latestKg) : null,
      milestones: computeMilestones(sorted, goal, data.settings.preferred_weight_unit),
      forecast: computeForecast(daily, goal, latestKg),
      bmi: computeBmi(latestKg, data.settings.height_cm),
      phase: activePhase(data.phases, today),
    };
  }, [data, today]);
}

export type Derived = ReturnType<typeof useDerived>;
