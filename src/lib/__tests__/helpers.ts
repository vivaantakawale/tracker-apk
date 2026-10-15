import type { WeightEntry, WeightGoal, WeightPhase } from '../types';

let n = 0;

/** Entry at a local date/time. `day` is days offset from 2026-01-01. */
export function entry(day: number, kg: number, hour = 8, minute = 0): WeightEntry {
  const d = new Date(2026, 0, 1 + day, hour, minute);
  const iso = d.toISOString();
  n++;
  return { id: `e${n}-${day}-${hour}`, weight_kg: kg, measured_at: iso, notes: '', created_at: iso, updated_at: iso };
}

export function key(day: number): string {
  const d = new Date(2026, 0, 1 + day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function goal(start: number, target: number, startDay = 0): WeightGoal {
  return {
    id: 'g1',
    starting_weight_kg: start,
    target_weight_kg: target,
    start_date: key(startDay),
    target_date: null,
    description: '',
    status: 'active',
    completed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

export function phase(id: string, start: string, end: string | null, extra: Partial<WeightPhase> = {}): WeightPhase {
  return {
    id,
    type: 'bulk',
    name: id,
    start_date: start,
    end_date: end,
    target_weight_kg: null,
    notes: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}
