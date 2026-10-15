import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData, GoalStatus, UserSettings, WeightEntry, WeightGoal, WeightPhase } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';
import * as db from '../lib/db';
import type { WriteOp } from '../lib/db';
import { sortEntries } from '../lib/stats';
import { validateEntry, type EntryInput } from '../lib/entries';
import { validatePhase } from '../lib/phases';
import { planMerge, type BackupFile } from '../lib/backup';
import { uuid } from '../lib/ids';
import { isValidDateKey } from '../lib/dates';

export type GoalDraft = Pick<
  WeightGoal,
  'starting_weight_kg' | 'target_weight_kg' | 'start_date' | 'target_date' | 'description'
>;
export type PhaseDraft = Pick<WeightPhase, 'type' | 'name' | 'start_date' | 'end_date' | 'target_weight_kg' | 'notes'>;

export interface RestoreSummary {
  mode: 'merge' | 'replace';
  entries: number;
  goals: number;
  phases: number;
  skippedEntries: number;
  skippedGoals: number;
  skippedPhases: number;
}

export interface StoreActions {
  addEntry(input: EntryInput): Promise<WeightEntry>;
  updateEntry(id: string, input: EntryInput): Promise<void>;
  deleteEntry(id: string): Promise<WeightEntry>;
  /** Re-insert a deleted entry exactly (used for undo). */
  restoreEntry(entry: WeightEntry): Promise<void>;
  saveGoal(draft: GoalDraft, id?: string): Promise<void>;
  setGoalStatus(id: string, status: GoalStatus): Promise<void>;
  deleteGoal(id: string): Promise<void>;
  savePhase(draft: PhaseDraft, id?: string, endOther?: { id: string; end_date: string }): Promise<void>;
  deletePhase(id: string): Promise<void>;
  updateSettings(patch: Partial<UserSettings>): Promise<void>;
  completeOnboarding(settings: Partial<UserSettings>, entry: EntryInput | null, goal: GoalDraft | null): Promise<void>;
  restoreBackup(backup: BackupFile, mode: 'merge' | 'replace'): Promise<RestoreSummary>;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: AppData };

interface StoreValue {
  state: State;
  actions: StoreActions;
  retry(): void;
}

const StoreContext = createContext<StoreValue | null>(null);

const nowIso = () => new Date().toISOString();

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const dataRef = useRef<AppData>({ entries: [], goals: [], phases: [], settings: DEFAULT_SETTINGS });

  const reload = useCallback(async () => {
    const d = await db.loadAll();
    const data: AppData = { ...d, entries: sortEntries(d.entries) };
    dataRef.current = data;
    setState({ status: 'ready', data });
  }, []);

  const init = useCallback(() => {
    setState({ status: 'loading' });
    reload().catch((e: unknown) => setState({ status: 'error', error: e instanceof Error ? e.message : String(e) }));
    void db.requestPersistence();
  }, [reload]);

  useEffect(init, [init]);

  /** Write atomically, then reload everything so every view refreshes. */
  const commit = useCallback(
    async (ops: WriteOp[]) => {
      await db.writeBatch(ops);
      await reload();
    },
    [reload],
  );

  const actions = useMemo<StoreActions>(() => {
    const goalOps = (goal: WeightGoal): WriteOp[] => {
      const ops: WriteOp[] = [{ type: 'put', store: 'goals', value: goal }];
      if (goal.status === 'active') {
        for (const g of dataRef.current.goals) {
          if (g.id !== goal.id && g.status === 'active') {
            ops.push({ type: 'put', store: 'goals', value: { ...g, status: 'archived', updated_at: nowIso() } });
          }
        }
      }
      return ops;
    };

    const checkGoal = (d: GoalDraft) => {
      if (!isValidDateKey(d.start_date)) throw new Error('Choose a valid start date.');
      if (d.target_date && !isValidDateKey(d.target_date)) throw new Error('Choose a valid target date.');
      if (d.target_date && d.target_date < d.start_date) throw new Error('The target date must be after the start date.');
    };

    return {
      async addEntry(input) {
        const err = validateEntry(input, dataRef.current.entries, null);
        if (err) throw new Error(err);
        const t = nowIso();
        const entry: WeightEntry = { id: uuid(), ...input, notes: input.notes.trim(), created_at: t, updated_at: t };
        await commit([{ type: 'put', store: 'entries', value: entry }]);
        return entry;
      },
      async updateEntry(id, input) {
        const prev = dataRef.current.entries.find((e) => e.id === id);
        if (!prev) throw new Error('This entry no longer exists.');
        const err = validateEntry(input, dataRef.current.entries, id);
        if (err) throw new Error(err);
        await commit([
          { type: 'put', store: 'entries', value: { ...prev, ...input, notes: input.notes.trim(), updated_at: nowIso() } },
        ]);
      },
      async deleteEntry(id) {
        const prev = dataRef.current.entries.find((e) => e.id === id);
        if (!prev) throw new Error('This entry no longer exists.');
        await commit([{ type: 'delete', store: 'entries', key: id }]);
        return prev;
      },
      async restoreEntry(entry) {
        await commit([{ type: 'put', store: 'entries', value: entry }]);
      },
      async saveGoal(draft, id) {
        checkGoal(draft);
        const t = nowIso();
        const prev = id ? dataRef.current.goals.find((g) => g.id === id) : undefined;
        const goal: WeightGoal = prev
          ? { ...prev, ...draft, updated_at: t }
          : { id: uuid(), ...draft, status: 'active', completed_at: null, created_at: t, updated_at: t };
        await commit(goalOps(goal));
      },
      async setGoalStatus(id, status) {
        const prev = dataRef.current.goals.find((g) => g.id === id);
        if (!prev) throw new Error('This goal no longer exists.');
        const t = nowIso();
        await commit(
          goalOps({ ...prev, status, completed_at: status === 'completed' ? t : prev.completed_at, updated_at: t }),
        );
      },
      async deleteGoal(id) {
        await commit([{ type: 'delete', store: 'goals', key: id }]);
      },
      async savePhase(draft, id, endOther) {
        const t = nowIso();
        const prev = id ? dataRef.current.phases.find((p) => p.id === id) : undefined;
        const phase: WeightPhase = prev
          ? { ...prev, ...draft, name: draft.name.trim(), notes: draft.notes.trim(), updated_at: t }
          : { id: uuid(), ...draft, name: draft.name.trim(), notes: draft.notes.trim(), created_at: t, updated_at: t };
        let others = dataRef.current.phases.filter((p) => p.id !== phase.id);
        const ops: WriteOp[] = [];
        if (endOther) {
          const o = others.find((p) => p.id === endOther.id);
          if (!o) throw new Error('The phase to end no longer exists.');
          if (endOther.end_date < o.start_date) {
            throw new Error(`"${o.name}" starts after that date, so it can't be ended there.`);
          }
          const ended = { ...o, end_date: endOther.end_date, updated_at: t };
          others = others.map((p) => (p.id === o.id ? ended : p));
          ops.push({ type: 'put', store: 'phases', value: ended });
        }
        const err = validatePhase(phase, others);
        if (err) throw new Error(err);
        ops.push({ type: 'put', store: 'phases', value: phase });
        await commit(ops);
      },
      async deletePhase(id) {
        await commit([{ type: 'delete', store: 'phases', key: id }]);
      },
      async updateSettings(patch) {
        await commit([{ type: 'put', store: 'settings', value: { ...dataRef.current.settings, ...patch } }]);
      },
      async completeOnboarding(settings, entryInput, goalDraft) {
        const t = nowIso();
        const ops: WriteOp[] = [
          { type: 'put', store: 'settings', value: { ...dataRef.current.settings, ...settings, onboarding_completed: true } },
        ];
        if (entryInput) {
          const err = validateEntry(entryInput, dataRef.current.entries, null);
          if (err) throw new Error(err);
          ops.push({ type: 'put', store: 'entries', value: { id: uuid(), ...entryInput, created_at: t, updated_at: t } });
        }
        if (goalDraft) {
          checkGoal(goalDraft);
          ops.push(
            ...goalOps({ id: uuid(), ...goalDraft, status: 'active', completed_at: null, created_at: t, updated_at: t }),
          );
        }
        await commit(ops);
      },
      async restoreBackup(backup, mode) {
        const incoming = backup.data;
        if (mode === 'replace') {
          await commit(db.replaceAllOps({ ...incoming, settings: { ...incoming.settings, onboarding_completed: true } }));
          return {
            mode,
            entries: incoming.entries.length,
            goals: incoming.goals.length,
            phases: incoming.phases.length,
            skippedEntries: 0,
            skippedGoals: 0,
            skippedPhases: 0,
          };
        }
        const plan = planMerge(dataRef.current, incoming);
        const ops: WriteOp[] = [
          ...plan.entries.map((value): WriteOp => ({ type: 'put', store: 'entries', value })),
          ...plan.goals.map((value): WriteOp => ({ type: 'put', store: 'goals', value })),
          ...plan.phases.map((value): WriteOp => ({ type: 'put', store: 'phases', value })),
        ];
        const s = dataRef.current.settings;
        if (s.height_cm === null && incoming.settings.height_cm !== null) {
          ops.push({ type: 'put', store: 'settings', value: { ...s, height_cm: incoming.settings.height_cm } });
        }
        await commit(ops);
        return {
          mode,
          entries: plan.entries.length,
          goals: plan.goals.length,
          phases: plan.phases.length,
          skippedEntries: plan.skippedEntries,
          skippedGoals: plan.skippedGoals,
          skippedPhases: plan.skippedPhases,
        };
      },
    };
  }, [commit]);

  const value = useMemo(() => ({ state, actions, retry: init }), [state, actions, init]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useStoreValue(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

export function useStoreState() {
  return useStoreValue();
}

/** Data and actions; only call below the "ready" gate in App. */
export function useStore(): { data: AppData; actions: StoreActions } {
  const { state, actions } = useStoreValue();
  if (state.status !== 'ready') throw new Error('Store not ready');
  return { data: state.data, actions };
}
