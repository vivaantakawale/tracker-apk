/**
 * Milestones are *derived* deterministically from stored readings and the
 * goal, never stored separately. This means:
 *  - they cannot fire twice (each milestone is a fixed id with one date),
 *  - editing or deleting a reading recalculates them automatically,
 *  - goal history is preserved because goals are archived rather than deleted.
 *
 * A milestone's achievement date is the first reading (chronologically, on or
 * after the goal's start date) at which the threshold was met. Later dips back
 * below a threshold do not "un-achieve" it, since it was genuinely reached then.
 *
 * Kinds:
 *  - 'start'  first recorded measurement ever
 *  - 'change' absolute weight change from the goal's starting weight in the
 *             goal direction (unit-friendly steps: kg or lb)
 *  - 'goal'   25 / 50 / 75 / 100 % of the goal distance
 */
import type { WeightEntry, WeightGoal, WeightUnit } from './types';
import { goalDirection } from './goal';
import { entryDateKey } from './dates';
import { KG_PER_LB } from './units';

export type MilestoneKind = 'start' | 'change' | 'goal';

export interface Milestone {
  id: string;
  kind: MilestoneKind;
  label: string;
  achievedAt: string | null;
  achievedEntryId: string | null;
  /** 0..1 progress toward this milestone (1 when achieved). */
  progress: number;
}

const KG_STEPS = [1, 2.5, 5, 7.5, 10, 15, 20, 25, 30, 40, 50];
const LB_STEPS = [2, 5, 10, 15, 20, 30, 40, 50, 60, 80, 100];
const GOAL_FRACTIONS = [0.25, 0.5, 0.75, 1];

function stepLabel(step: number, unit: WeightUnit, dir: 'gain' | 'loss'): string {
  const verb = dir === 'gain' ? 'gained' : 'lost';
  return `First ${step} ${unit} ${verb}`;
}

export function computeMilestones(
  sorted: readonly WeightEntry[],
  goal: WeightGoal | null,
  unit: WeightUnit,
): Milestone[] {
  const out: Milestone[] = [];
  const first = sorted[0] ?? null;
  out.push({
    id: 'start',
    kind: 'start',
    label: 'First recorded measurement',
    achievedAt: first?.measured_at ?? null,
    achievedEntryId: first?.id ?? null,
    progress: first ? 1 : 0,
  });
  if (!goal) return out;

  const direction = goalDirection(goal);
  if (direction === 'maintain') return out;
  const sign = direction === 'gain' ? 1 : -1;
  const distance = Math.abs(goal.target_weight_kg - goal.starting_weight_kg);
  const inGoal = sorted.filter((e) => entryDateKey(e.measured_at) >= goal.start_date);
  const latest = inGoal[inGoal.length - 1];
  const currentProgress = latest ? sign * (latest.weight_kg - goal.starting_weight_kg) : 0;

  const firstReaching = (kg: number) =>
    inGoal.find((e) => sign * (e.weight_kg - goal.starting_weight_kg) >= kg - 1e-9) ?? null;

  const steps = unit === 'kg' ? KG_STEPS : LB_STEPS;
  const factor = unit === 'kg' ? 1 : KG_PER_LB;
  for (const step of steps) {
    const kg = step * factor;
    if (kg >= distance - 1e-9) break;
    const hit = firstReaching(kg);
    out.push({
      id: `change-${unit}-${step}`,
      kind: 'change',
      label: stepLabel(step, unit, direction),
      achievedAt: hit?.measured_at ?? null,
      achievedEntryId: hit?.id ?? null,
      progress: hit ? 1 : Math.max(0, Math.min(1, currentProgress / kg)),
    });
  }

  for (const f of GOAL_FRACTIONS) {
    const kg = f * distance;
    const hit = firstReaching(kg);
    out.push({
      id: `goal-${f * 100}`,
      kind: 'goal',
      label: f === 1 ? 'Goal reached (100%)' : `${f * 100}% of goal`,
      achievedAt: hit?.measured_at ?? null,
      achievedEntryId: hit?.id ?? null,
      progress: hit ? 1 : Math.max(0, Math.min(1, currentProgress / kg)),
    });
  }
  return out;
}

/** The nearest not-yet-achieved milestone, if any. */
export function nextMilestone(ms: readonly Milestone[]): Milestone | null {
  return ms.filter((m) => !m.achievedAt).sort((a, b) => b.progress - a.progress)[0] ?? null;
}
