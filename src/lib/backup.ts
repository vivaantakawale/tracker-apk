/**
 * CSV export (for spreadsheets) and JSON backup / restore (complete).
 *
 * JSON backup format:
 *   { format: "weight-tracker-backup", version: 1, exported_at, app_version,
 *     data: { entries, goals, phases, settings } }
 * Milestones are fully derived from entries + goals, so they are reproduced
 * exactly from the backup and are not stored separately.
 *
 * Restore modes:
 *  - merge:   adds records whose id is not already present; entries matching an
 *             existing reading (same time ±1 min and weight) are skipped as
 *             duplicates; phases overlapping existing phases are skipped;
 *             current settings are kept. Importing the same file twice is a no-op.
 *  - replace: atomically replaces all data and settings (requires confirmation).
 */
import type { AppData, GoalStatus, PhaseType, UserSettings, WeightEntry, WeightGoal, WeightPhase } from './types';
import { DEFAULT_SETTINGS } from './types';
import { isValidDateKey, isValidIsoTimestamp } from './dates';
import { WEIGHT_LIMITS_KG, HEIGHT_LIMITS_CM } from './units';
import { validatePhase } from './phases';

export const BACKUP_FORMAT = 'weight-tracker-backup';
export const BACKUP_VERSION = 1;
export const CSV_FORMAT_LINE = '# weight-tracker-csv v1; weights in kilograms; timestamps in UTC (ISO 8601)';
export const APP_VERSION = '1.0.0';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  app_version: string;
  data: AppData;
}

export function createBackup(data: AppData, now: Date = new Date()): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: now.toISOString(),
    app_version: APP_VERSION,
    data,
  };
}

/** RFC 4180 escaping, plus neutralising spreadsheet formula injection. */
export function csvEscape(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\r\n]/.test(v) || v !== v.trim()) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function entriesToCsv(sorted: readonly WeightEntry[]): string {
  const header = ['id', 'measured_at', 'weight_kg', 'notes', 'created_at', 'updated_at'];
  const rows = sorted.map((e) =>
    [e.id, e.measured_at, String(Math.round(e.weight_kg * 1000) / 1000), e.notes, e.created_at, e.updated_at]
      .map(csvEscape)
      .join(','),
  );
  return [CSV_FORMAT_LINE, header.join(','), ...rows].join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- validation

export type ValidationResult = { ok: true; backup: BackupFile } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

export function validateBackup(raw: unknown): ValidationResult {
  if (!isObj(raw)) return fail('This file is not a Weight Tracker backup.');
  if (raw.format !== BACKUP_FORMAT) return fail('This file is not a Weight Tracker backup.');
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version)) return fail('The backup version is missing.');
  if (raw.version > BACKUP_VERSION) {
    return fail(`This backup was made by a newer version of the app (format v${raw.version}).`);
  }
  if (raw.version < 1) return fail('Unsupported backup version.');
  if (!isObj(raw.data)) return fail('The backup contains no data section.');
  const d = raw.data;
  if (!Array.isArray(d.entries)) return fail('The backup has no list of entries.');

  const entries: WeightEntry[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < d.entries.length; i++) {
    const e = d.entries[i];
    const where = `Entry ${i + 1}`;
    if (!isObj(e)) return fail(`${where} is malformed.`);
    if (typeof e.id !== 'string' || !e.id) return fail(`${where} has no id.`);
    if (ids.has(e.id)) return fail(`${where} has a duplicate id.`);
    ids.add(e.id);
    if (typeof e.weight_kg !== 'number' || !Number.isFinite(e.weight_kg)) return fail(`${where} has an invalid weight.`);
    if (e.weight_kg < WEIGHT_LIMITS_KG.min || e.weight_kg > WEIGHT_LIMITS_KG.max) return fail(`${where} has an implausible weight.`);
    if (!isValidIsoTimestamp(e.measured_at)) return fail(`${where} has an invalid date.`);
    const measured = new Date(e.measured_at).toISOString();
    entries.push({
      id: e.id,
      weight_kg: e.weight_kg,
      measured_at: measured,
      notes: str(e.notes).slice(0, 2000),
      created_at: isValidIsoTimestamp(e.created_at) ? e.created_at : measured,
      updated_at: isValidIsoTimestamp(e.updated_at) ? e.updated_at : measured,
    });
  }

  const goals: WeightGoal[] = [];
  const goalList = d.goals === undefined ? [] : d.goals;
  if (!Array.isArray(goalList)) return fail('The goals section is malformed.');
  const statuses: GoalStatus[] = ['active', 'completed', 'archived'];
  for (let i = 0; i < goalList.length; i++) {
    const g = goalList[i];
    const where = `Goal ${i + 1}`;
    if (!isObj(g) || typeof g.id !== 'string' || !g.id) return fail(`${where} is malformed.`);
    for (const k of ['starting_weight_kg', 'target_weight_kg'] as const) {
      const v = g[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < WEIGHT_LIMITS_KG.min || v > WEIGHT_LIMITS_KG.max) {
        return fail(`${where} has an invalid weight.`);
      }
    }
    if (!isValidDateKey(g.start_date)) return fail(`${where} has an invalid start date.`);
    if (g.target_date != null && !isValidDateKey(g.target_date)) return fail(`${where} has an invalid target date.`);
    if (!statuses.includes(g.status as GoalStatus)) return fail(`${where} has an invalid status.`);
    const now = new Date().toISOString();
    goals.push({
      id: g.id,
      starting_weight_kg: g.starting_weight_kg as number,
      target_weight_kg: g.target_weight_kg as number,
      start_date: g.start_date,
      target_date: (g.target_date as string | null | undefined) ?? null,
      description: str(g.description),
      status: g.status as GoalStatus,
      completed_at: isValidIsoTimestamp(g.completed_at) ? g.completed_at : null,
      created_at: isValidIsoTimestamp(g.created_at) ? g.created_at : now,
      updated_at: isValidIsoTimestamp(g.updated_at) ? g.updated_at : now,
    });
  }
  if (goals.filter((g) => g.status === 'active').length > 1) return fail('The backup has more than one active goal.');

  const phases: WeightPhase[] = [];
  const phaseList = d.phases === undefined ? [] : d.phases;
  if (!Array.isArray(phaseList)) return fail('The phases section is malformed.');
  const types: PhaseType[] = ['bulk', 'cut', 'maintenance'];
  for (let i = 0; i < phaseList.length; i++) {
    const p = phaseList[i];
    const where = `Phase ${i + 1}`;
    if (!isObj(p) || typeof p.id !== 'string' || !p.id) return fail(`${where} is malformed.`);
    if (!types.includes(p.type as PhaseType)) return fail(`${where} has an invalid type.`);
    const tw = p.target_weight_kg;
    if (tw != null && (typeof tw !== 'number' || !Number.isFinite(tw))) return fail(`${where} has an invalid target weight.`);
    const now = new Date().toISOString();
    const phase: WeightPhase = {
      id: p.id,
      type: p.type as PhaseType,
      name: str(p.name),
      start_date: str(p.start_date),
      end_date: (p.end_date as string | null | undefined) ?? null,
      target_weight_kg: (tw as number | null | undefined) ?? null,
      notes: str(p.notes),
      created_at: isValidIsoTimestamp(p.created_at) ? p.created_at : now,
      updated_at: isValidIsoTimestamp(p.updated_at) ? p.updated_at : now,
    };
    const err = validatePhase(phase, phases);
    if (err) return fail(`${where}: ${err}`);
    phases.push(phase);
  }

  const settings: UserSettings = { ...DEFAULT_SETTINGS, onboarding_completed: true };
  if (d.settings !== undefined) {
    if (!isObj(d.settings)) return fail('The settings section is malformed.');
    const s = d.settings;
    if (typeof s.height_cm === 'number' && s.height_cm >= HEIGHT_LIMITS_CM.min && s.height_cm <= HEIGHT_LIMITS_CM.max) {
      settings.height_cm = s.height_cm;
    }
    if (s.preferred_weight_unit === 'kg' || s.preferred_weight_unit === 'lb') settings.preferred_weight_unit = s.preferred_weight_unit;
    if (s.height_unit === 'cm' || s.height_unit === 'ftin') settings.height_unit = s.height_unit;
    if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system') settings.theme = s.theme;
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: raw.version,
      exported_at: isValidIsoTimestamp(raw.exported_at) ? raw.exported_at : '',
      app_version: str(raw.app_version),
      data: { entries, goals, phases, settings },
    },
  };
}

export function parseBackupText(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('The file is not valid JSON.');
  }
  return validateBackup(raw);
}

// --------------------------------------------------------------------- merge

export interface MergePlan {
  entries: WeightEntry[];
  goals: WeightGoal[];
  phases: WeightPhase[];
  skippedEntries: number;
  skippedGoals: number;
  skippedPhases: number;
}

export function planMerge(existing: AppData, incoming: AppData): MergePlan {
  const entryIds = new Set(existing.entries.map((e) => e.id));
  const entries: WeightEntry[] = [];
  let skippedEntries = 0;
  const all = [...existing.entries];
  for (const e of incoming.entries) {
    const t = Date.parse(e.measured_at);
    const dup =
      entryIds.has(e.id) ||
      all.some((x) => Math.abs(Date.parse(x.measured_at) - t) < 60_000 && Math.abs(x.weight_kg - e.weight_kg) < 0.005);
    if (dup) {
      skippedEntries++;
      continue;
    }
    entries.push(e);
    all.push(e);
  }

  const goalIds = new Set(existing.goals.map((g) => g.id));
  const hasActive = existing.goals.some((g) => g.status === 'active');
  const goals: WeightGoal[] = [];
  let skippedGoals = 0;
  for (const g of incoming.goals) {
    if (goalIds.has(g.id)) {
      skippedGoals++;
      continue;
    }
    // Never create a second active goal: imported active goals become archived.
    goals.push(hasActive && g.status === 'active' ? { ...g, status: 'archived' } : g);
  }

  const phases: WeightPhase[] = [];
  let skippedPhases = 0;
  const allPhases = [...existing.phases];
  for (const p of incoming.phases) {
    if (allPhases.some((x) => x.id === p.id) || validatePhase(p, allPhases) !== null) {
      skippedPhases++;
      continue;
    }
    phases.push(p);
    allPhases.push(p);
  }

  return { entries, goals, phases, skippedEntries, skippedGoals, skippedPhases };
}
