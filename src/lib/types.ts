/**
 * Core data model. All weights are stored canonically in kilograms; the
 * preferred unit only affects display and input handling.
 * Dates without a time (goal / phase boundaries) are local calendar dates
 * stored as `YYYY-MM-DD` strings. Timestamps are ISO-8601 strings (UTC).
 */

export type WeightUnit = 'kg' | 'lb';
export type HeightUnit = 'cm' | 'ftin';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface WeightEntry {
  id: string;
  weight_kg: number;
  measured_at: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  height_cm: number | null;
  preferred_weight_unit: WeightUnit;
  height_unit: HeightUnit;
  theme: ThemePreference;
  onboarding_completed: boolean;
}

export type GoalStatus = 'active' | 'completed' | 'archived';

export interface WeightGoal {
  id: string;
  starting_weight_kg: number;
  target_weight_kg: number;
  start_date: string;
  target_date: string | null;
  description: string;
  status: GoalStatus;
  /** When the user explicitly marked the goal completed. */
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PhaseType = 'bulk' | 'cut' | 'maintenance';

export interface WeightPhase {
  id: string;
  type: PhaseType;
  name: string;
  start_date: string;
  /** Inclusive end date; null means the phase is open-ended (ongoing). */
  end_date: string | null;
  target_weight_kg: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface AppData {
  entries: WeightEntry[];
  goals: WeightGoal[];
  phases: WeightPhase[];
  settings: UserSettings;
}

export const DEFAULT_SETTINGS: UserSettings = {
  height_cm: null,
  preferred_weight_unit: 'kg',
  height_unit: 'cm',
  theme: 'system',
  onboarding_completed: false,
};
