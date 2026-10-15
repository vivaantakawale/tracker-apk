import { useId, useState, type FormEvent } from 'react';
import { useStore } from '../../state/store';
import { useUI } from '../../state/ui';
import { errMsg, useAppActions } from '../../state/actions';
import type { HeightUnit } from '../../lib/types';
import { Segmented, Sheet } from '../ui';
import { cmToFtIn, ftInToCm, HEIGHT_LIMITS_CM, parseDecimal } from '../../lib/units';
import type { BackupFile } from '../../lib/backup';
import { fmtDateTime } from '../../lib/format';

// ------------------------------------------------------------------ height

export function HeightInput({
  unit,
  onUnit,
  cm,
  ft,
  inches,
  onCm,
  onFt,
  onIn,
  error,
}: {
  unit: HeightUnit;
  onUnit: (u: HeightUnit) => void;
  cm: string;
  ft: string;
  inches: string;
  onCm: (v: string) => void;
  onFt: (v: string) => void;
  onIn: (v: string) => void;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div className="field">
      <div className="row-between">
        <label className="field-label" htmlFor={unit === 'cm' ? `${id}-cm` : `${id}-ft`}>
          Height
        </label>
        <div style={{ width: 120 }}>
          <Segmented
            label="Height unit"
            options={[
              { value: 'cm', label: 'cm' },
              { value: 'ftin', label: 'ft / in' },
            ]}
            value={unit}
            onChange={onUnit}
          />
        </div>
      </div>
      {unit === 'cm' ? (
        <input id={`${id}-cm`} className="input num" inputMode="decimal" placeholder="e.g. 175" value={cm} onChange={(e) => onCm(e.target.value)} aria-invalid={!!error} />
      ) : (
        <div className="field-row">
          <input id={`${id}-ft`} className="input num" inputMode="numeric" placeholder="ft" aria-label="Feet" value={ft} onChange={(e) => onFt(e.target.value)} aria-invalid={!!error} />
          <input className="input num" inputMode="decimal" placeholder="in" aria-label="Inches" value={inches} onChange={(e) => onIn(e.target.value)} aria-invalid={!!error} />
        </div>
      )}
      {error ? <p className="field-error" role="alert">{error}</p> : <p className="field-hint">Used only to calculate BMI.</p>}
    </div>
  );
}

/** Height state + validation shared by Settings and onboarding. */
export function useHeightState(initialCm: number | null, initialUnit: HeightUnit) {
  const fi = initialCm ? cmToFtIn(initialCm) : null;
  const [unit, setUnit] = useState<HeightUnit>(initialUnit);
  const [cm, setCm] = useState(initialCm ? String(Math.round(initialCm * 10) / 10) : '');
  const [ft, setFt] = useState(fi ? String(fi.ft) : '');
  const [inches, setIn] = useState(fi ? String(fi.inches) : '');

  /** Returns { cm } (null = empty), or { error }. */
  const read = (): { cm: number | null } | { error: string } => {
    let value: number | null;
    if (unit === 'cm') {
      if (!cm.trim()) return { cm: null };
      value = parseDecimal(cm);
    } else {
      if (!ft.trim() && !inches.trim()) return { cm: null };
      const f = ft.trim() ? parseDecimal(ft) : 0;
      const i = inches.trim() ? parseDecimal(inches) : 0;
      value = f === null || i === null || i >= 12 ? null : ftInToCm(f, i);
    }
    if (value === null) return { error: 'Enter a valid height.' };
    if (value < HEIGHT_LIMITS_CM.min || value > HEIGHT_LIMITS_CM.max) return { error: 'That height is outside the plausible range.' };
    return { cm: value };
  };

  const props = { unit, onUnit: setUnit, cm, ft, inches, onCm: setCm, onFt: setFt, onIn: setIn };
  return { props, read, unit };
}

export function HeightSheet({ onClose }: { onClose: () => void }) {
  const { data, actions } = useStore();
  const ui = useUI();
  const h = useHeightState(data.settings.height_cm, data.settings.height_unit);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = h.read();
    if ('error' in r) return setError(r.error);
    if (r.cm === null) return setError('Enter your height, or use "Remove height".');
    try {
      await actions.updateSettings({ height_cm: r.cm, height_unit: h.unit });
      ui.toast('Height saved');
      onClose();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <Sheet title="Height" onClose={onClose} small>
      <form className="form" onSubmit={save} noValidate>
        <HeightInput {...h.props} error={error} />
        <button type="submit" className="btn btn--primary btn--block">
          Save
        </button>
        {data.settings.height_cm !== null && (
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={async () => {
              await actions.updateSettings({ height_cm: null });
              ui.toast('Height removed');
              onClose();
            }}
          >
            Remove height
          </button>
        )}
      </form>
    </Sheet>
  );
}

// ----------------------------------------------------------------- restore

export function RestoreSheet({ backup, fileName, onClose }: { backup: BackupFile; fileName: string; onClose: () => void }) {
  const { data, actions } = useStore();
  const ui = useUI();
  const { exportJson } = useAppActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const b = backup.data;

  const run = async (mode: 'merge' | 'replace') => {
    if (mode === 'replace') {
      const ok = await ui.confirm({
        title: 'Replace all data?',
        message: `This permanently deletes your current ${data.entries.length} entries, ${data.goals.length} goals, ${data.phases.length} phases and settings, and replaces them with the backup.`,
        confirmLabel: 'Replace all data',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const s = await actions.restoreBackup(backup, mode);
      if (mode === 'replace') ui.toast(`Restored ${s.entries} entries from backup`);
      else {
        const skipped = s.skippedEntries + s.skippedGoals + s.skippedPhases;
        ui.toast(
          `Added ${s.entries} entries, ${s.goals} goals, ${s.phases} phases` + (skipped ? ` · ${skipped} duplicates skipped` : ''),
        );
      }
      onClose();
    } catch (err) {
      setError(`Restore failed, and no changes were made. ${errMsg(err)}`);
      setBusy(false);
    }
  };

  return (
    <Sheet title="Restore backup" onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="callout">
          <strong style={{ color: 'var(--text)' }}>{fileName}</strong>
          <br />
          {backup.exported_at ? `Created ${fmtDateTime(backup.exported_at)} · ` : ''}
          {b.entries.length} entries, {b.goals.length} goals, {b.phases.length} phases
        </div>

        <div className="card">
          <p style={{ margin: 0, fontWeight: 600 }}>Merge (recommended)</p>
          <p className="section-note" style={{ margin: '4px 0 12px' }}>
            Adds entries, goals and phases from the backup that aren't already here. Duplicates are skipped, overlapping
            phases are skipped, and your current settings are kept. Nothing is deleted.
          </p>
          <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={() => run('merge')}>
            Merge into my data
          </button>
        </div>

        <div className="card">
          <p style={{ margin: 0, fontWeight: 600 }}>Replace</p>
          <p className="section-note" style={{ margin: '4px 0 12px' }}>
            Deletes everything currently stored ({data.entries.length} entries) and restores the backup exactly,
            including its settings. You'll be asked to confirm.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={exportJson}>
              Back up current data
            </button>
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => run('replace')}>
              Replace all data
            </button>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </Sheet>
  );
}

// ----------------------------------------------------------------- confirm

export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  destructive,
  onResolve,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
  onResolve: (ok: boolean) => void;
}) {
  return (
    <Sheet title={title} onClose={() => onResolve(false)} small role="alertdialog">
      <p style={{ margin: '0 0 20px', color: 'var(--text-2)' }}>{message}</p>
      <div className="btn-row">
        <button type="button" className="btn btn--secondary" onClick={() => onResolve(false)} data-autofocus>
          Cancel
        </button>
        <button type="button" className={`btn ${destructive ? 'btn--danger' : 'btn--primary'}`} onClick={() => onResolve(true)}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
