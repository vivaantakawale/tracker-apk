/**
 * Goal progress.
 *
 *   fraction = (current − start) / (target − start)
 *
 * Works for gain and loss goals alike (both terms are negative when losing in
 * the intended direction). The raw fraction is kept for display (it can be
 * negative or exceed 1); only the progress bar is clamped to [0, 1].
 *
 * A goal whose target is within MAINTAIN_EPS_KG of its start is a
 * *maintenance* goal: there is no distance to divide by, so progress is
 * expressed as "within ±MAINTAIN_TOLERANCE_KG of target" instead.
 *
 * "Target reached" is derived from the latest reading and can become false
 * again. Marking a goal *completed* is an explicit user action, and a
 * completed goal can be reactivated.
 */
import type { WeightGoal } from './types';

export const MAINTAIN_EPS_KG = 0.05;
export const MAINTAIN_TOLERANCE_KG = 1;

export type GoalDirection = 'gain' | 'loss' | 'maintain';

export function goalDirection(goal: Pick<WeightGoal, 'starting_weight_kg' | 'target_weight_kg'>): GoalDirection {
  const d = goal.target_weight_kg - goal.starting_weight_kg;
  if (Math.abs(d) < MAINTAIN_EPS_KG) return 'maintain';
  return d > 0 ? 'gain' : 'loss';
}

export interface GoalProgress {
  direction: GoalDirection;
  /** target − start */
  required: number;
  /** current − start */
  achieved: number | null;
  /** target − current */
  remaining: number | null;
  /** Raw, unclamped fraction; null for maintenance goals or without a reading. */
  fraction: number | null;
  /** Clamped to [0, 1] for the progress bar. */
  barFraction: number;
  reached: boolean;
  current: number | null;
}

export function goalProgress(goal: WeightGoal, currentKg: number | null): GoalProgress {
  const direction = goalDirection(goal);
  const required = goal.target_weight_kg - goal.starting_weight_kg;
  if (currentKg === null) {
    return { direction, required, achieved: null, remaining: null, fraction: null, barFraction: 0, reached: false, current: null };
  }
  const achieved = currentKg - goal.starting_weight_kg;
  const remaining = goal.target_weight_kg - currentKg;
  if (direction === 'maintain') {
    const reached = Math.abs(remaining) <= MAINTAIN_TOLERANCE_KG;
    return { direction, required, achieved, remaining, fraction: null, barFraction: reached ? 1 : 0, reached, current: currentKg };
  }
  const fraction = achieved / required;
  const reached = direction === 'gain' ? currentKg >= goal.target_weight_kg : currentKg <= goal.target_weight_kg;
  return {
    direction,
    required,
    achieved,
    remaining,
    fraction,
    barFraction: Math.min(1, Math.max(0, fraction)),
    reached,
    current: currentKg,
  };
}

export function activeGoal(goals: readonly WeightGoal[]): WeightGoal | null {
  return goals.find((g) => g.status === 'active') ?? null;
}
