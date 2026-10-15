import { useCallback } from 'react';
import { useStore } from './store';
import { useUI } from './ui';
import type { WeightEntry, WeightPhase } from '../lib/types';
import { fmtDateTime, fmtWeight } from '../lib/format';
import { createBackup, entriesToCsv } from '../lib/backup';
import { todayKey } from '../lib/dates';

import { saveTextFile } from '../lib/platform';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/** Common user flows that combine store writes with confirmation and feedback. */
export function useAppActions() {
  const { data, actions } = useStore();
  const ui = useUI();
  const unit = data.settings.preferred_weight_unit;

  const deleteEntry = useCallback(
    async (entry: WeightEntry): Promise<boolean> => {
      const ok = await ui.confirm({
        title: 'Delete this entry?',
        message: `${fmtWeight(entry.weight_kg, unit)} ${unit} on ${fmtDateTime(entry.measured_at)} will be removed and all statistics updated.`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return false;
      try {
        const removed = await actions.deleteEntry(entry.id);
        ui.toast('Entry deleted', {
          action: {
            label: 'Undo',
            run: () => {
              actions.restoreEntry(removed).catch((e) => ui.toast(errMsg(e), { tone: 'error' }));
            },
          },
        });
        return true;
      } catch (e) {
        ui.toast(errMsg(e), { tone: 'error' });
        return false;
      }
    },
    [actions, ui, unit],
  );

  const endPhase = useCallback(
    async (p: WeightPhase) => {
      const today = todayKey();
      const end = p.start_date > today ? p.start_date : today;
      try {
        await actions.savePhase({ ...p, end_date: end }, p.id);
        ui.toast(`"${p.name}" ended`);
      } catch (e) {
        ui.toast(errMsg(e), { tone: 'error' });
      }
    },
    [actions, ui],
  );

  const deletePhase = useCallback(
    async (p: WeightPhase) => {
      const ok = await ui.confirm({
        title: 'Delete this phase?',
        message: `"${p.name}" will be removed. Your weight entries are not affected.`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      try {
        await actions.deletePhase(p.id);
        ui.toast('Phase deleted');
      } catch (e) {
        ui.toast(errMsg(e), { tone: 'error' });
      }
    },
    [actions, ui],
  );

  const exportCsv = useCallback(async () => {
    if (!data.entries.length) {
      ui.toast('There are no entries to export yet.');
      return;
    }
    try {
      const r = await saveTextFile(`weight-tracker-entries-${todayKey()}.csv`, entriesToCsv(data.entries), 'text/csv;charset=utf-8');
      if (r === 'saved') ui.toast(`Exported ${data.entries.length} entries as CSV`);
    } catch (e) {
      ui.toast(`Export failed. ${errMsg(e)}`, { tone: 'error' });
    }
  }, [data, ui]);

  const exportJson = useCallback(async () => {
    try {
      const backup = createBackup(data);
      const r = await saveTextFile(`weight-tracker-backup-${todayKey()}.json`, JSON.stringify(backup, null, 2), 'application/json');
      if (r === 'saved') ui.toast('Backup saved');
    } catch (e) {
      ui.toast(`Backup failed. ${errMsg(e)}`, { tone: 'error' });
    }
  }, [data, ui]);

  return { deleteEntry, endPhase, deletePhase, exportCsv, exportJson, errMsg };
}

export { errMsg };
