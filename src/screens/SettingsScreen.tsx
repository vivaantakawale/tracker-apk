import { useRef, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Download, FileJson, Layers, Plus, Ruler, Target, Upload } from 'lucide-react';
import { useStore } from '../state/store';
import { useDerived } from '../state/derived';
import { useUI } from '../state/ui';
import { errMsg, useAppActions } from '../state/actions';
import { AppHeader } from './HomeScreen';
import { Segmented } from '../components/ui';
import type { ThemePreference, WeightGoal, WeightUnit } from '../lib/types';
import { fmtDateKey, fmtWeight } from '../lib/format';
import { cmToFtIn } from '../lib/units';
import { goalDirection } from '../lib/goal';
import { phaseTypeLabel } from '../lib/phases';
import { APP_VERSION, parseBackupText } from '../lib/backup';
import { isNative } from '../lib/platform';

export function SettingsSection({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="section" aria-label={title} style={{ gap: 8 }}>
      <h2 className="group-head" style={{ margin: '0 0 0 4px' }}>{title}</h2>
      <div className="list">{children}</div>
      {footer && <p className="field-hint" style={{ padding: '0 4px' }}>{footer}</p>}
    </section>
  );
}

function SettingsRow({ icon, label, value, onClick, sub }: { icon?: ReactNode; label: string; value?: ReactNode; sub?: string; onClick: () => void }) {
  return (
    <button type="button" className="list-row" onClick={onClick}>
      {icon && <span className="muted" aria-hidden="true" style={{ display: 'grid' }}>{icon}</span>}
      <div className="list-main">
        <p className="list-title">{label}</p>
        {sub && <p className="list-sub">{sub}</p>}
      </div>
      {value !== undefined && <span className="muted" style={{ fontSize: 14, textAlign: 'right' }}>{value}</span>}
      <ChevronRight size={18} className="chevron" />
    </button>
  );
}

function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="list-row" style={{ flexWrap: 'wrap' }}>
      <div className="list-main">
        <p className="list-title">{label}</p>
      </div>
      <div style={{ width: 196, maxWidth: '100%' }}>{children}</div>
    </div>
  );
}

function goalSummary(g: WeightGoal, unit: WeightUnit) {
  const dir = goalDirection(g);
  const verb = dir === 'gain' ? 'Gain to' : dir === 'loss' ? 'Lose to' : 'Maintain';
  return `${verb} ${fmtWeight(g.target_weight_kg, unit)} ${unit}`;
}

export function SettingsScreen() {
  const { data, actions } = useStore();
  const d = useDerived();
  const ui = useUI();
  const { exportCsv, exportJson } = useAppActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const s = data.settings;
  const unit = s.preferred_weight_unit;

  const heightText =
    s.height_cm === null
      ? 'Not set'
      : s.height_unit === 'cm'
        ? `${Math.round(s.height_cm)} cm`
        : (() => {
            const f = cmToFtIn(s.height_cm);
            return `${f.ft} ft ${f.inches} in`;
          })();

  const update = (patch: Parameters<typeof actions.updateSettings>[0]) =>
    actions.updateSettings(patch).catch((e) => ui.toast(errMsg(e), { tone: 'error' }));

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      ui.toast('That file is too large to be a backup.', { tone: 'error' });
      return;
    }
    try {
      const result = parseBackupText(await file.text());
      if (!result.ok) {
        ui.toast(`Can't restore: ${result.error}`, { tone: 'error' });
        return;
      }
      ui.open({ kind: 'restore', backup: result.backup, fileName: file.name });
    } catch (e) {
      ui.toast(`Couldn't read the file. ${errMsg(e)}`, { tone: 'error' });
    }
  };

  const pastGoals = data.goals
    .filter((g) => g.status !== 'active')
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));

  return (
    <main className="screen">
      <AppHeader title="Settings" />

      <SettingsSection title="Profile">
        <SettingsRow icon={<Ruler size={18} />} label="Height" value={heightText} onClick={() => ui.open({ kind: 'height' })} />
        <ControlRow label="Weight unit">
          <Segmented<WeightUnit>
            label="Weight unit"
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
            value={unit}
            onChange={(v) => update({ preferred_weight_unit: v })}
          />
        </ControlRow>
        <ControlRow label="Theme">
          <Segmented<ThemePreference>
            label="Theme"
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
            value={s.theme}
            onChange={(v) => update({ theme: v })}
          />
        </ControlRow>
      </SettingsSection>

      <SettingsSection title="Goal">
        {d.goal ? (
          <SettingsRow
            icon={<Target size={18} />}
            label={goalSummary(d.goal, unit)}
            sub={`Active · from ${fmtWeight(d.goal.starting_weight_kg, unit)} ${unit} on ${fmtDateKey(d.goal.start_date)}`}
            onClick={() => ui.open({ kind: 'goal-form', goalId: d.goal!.id })}
          />
        ) : (
          <SettingsRow icon={<Target size={18} />} label="No active goal" sub="Set a starting and target weight" onClick={() => ui.open({ kind: 'goal-form' })} />
        )}
        {d.goal && <SettingsRow icon={<Plus size={18} />} label="Start a new goal" onClick={() => ui.open({ kind: 'goal-form' })} />}
        {pastGoals.map((g) => (
          <div className="list-item" key={g.id}>
            <div className="list-row">
              <div className="list-main">
                <p className="list-title">{goalSummary(g, unit)}</p>
                <p className="list-sub">
                  {g.status === 'completed' ? 'Completed' : 'Archived'} · started {fmtDateKey(g.start_date)}
                </p>
              </div>
            </div>
            <div className="list-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={async () => {
                  await actions.setGoalStatus(g.id, 'active');
                  ui.toast('Goal reactivated');
                }}
              >
                Reactivate
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ color: 'var(--danger)' }}
                onClick={async () => {
                  const ok = await ui.confirm({
                    title: 'Delete this goal?',
                    message: 'The goal is removed from your history. Weight entries are not affected.',
                    confirmLabel: 'Delete',
                    destructive: true,
                  });
                  if (ok) await actions.deleteGoal(g.id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </SettingsSection>

      <SettingsSection title="Phases">
        {d.phase ? (
          <SettingsRow
            icon={<Layers size={18} />}
            label={d.phase.name}
            sub={`${phaseTypeLabel(d.phase.type)} · since ${fmtDateKey(d.phase.start_date)}`}
            onClick={() => ui.open({ kind: 'phase-form', phaseId: d.phase!.id })}
          />
        ) : (
          <SettingsRow icon={<Layers size={18} />} label="No active phase" onClick={() => ui.open({ kind: 'phase-form' })} />
        )}
        <SettingsRow icon={<Plus size={18} />} label={d.phase ? 'Switch to a new phase' : 'Start a phase'} onClick={() => ui.open({ kind: 'phase-form' })} />
        <SettingsRow
          label="Phase history"
          value={String(data.phases.length)}
          onClick={() => {
            ui.setProgressTab('phases');
            ui.setTab('progress');
          }}
        />
      </SettingsSection>

      <SettingsSection
        title="Data"
        footer="CSV is for spreadsheets (weights in kg). The JSON backup contains everything — entries, goals, phases and settings — and is the format used for restoring."
      >
        <SettingsRow icon={<Download size={18} />} label="Export CSV" value={`${data.entries.length} entries`} onClick={exportCsv} />
        <SettingsRow icon={<FileJson size={18} />} label={isNative ? 'Save JSON backup' : 'Download JSON backup'} onClick={exportJson} />
        <SettingsRow icon={<Upload size={18} />} label="Restore from backup" sub="You'll choose merge or replace" onClick={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          accept={isNative ? undefined : 'application/json,.json'}
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </SettingsSection>

      <SettingsSection title="About">
        <div className="list-row">
          <div className="list-main">
            <p className="list-title">Weight Tracker</p>
            <p className="list-sub">Version {APP_VERSION}</p>
          </div>
        </div>
        <div className="list-row" style={{ alignItems: 'flex-start' }}>
          <p className="section-note" style={{ whiteSpace: 'normal' }}>
            {isNative
              ? "Your data is stored only on this phone, in the app's private storage. There is no account and no cloud sync. It survives restarts and app updates but is deleted if you uninstall the app, so save a backup regularly."
              : "Your data is stored only on this device, in this browser's local database (IndexedDB). There is no account and no cloud sync, so download a backup regularly. Clearing site data removes it."}
          </p>
        </div>
        <details className="explain">
          <summary>
            How numbers are calculated <ChevronDown size={16} className="muted" />
          </summary>
          <div className="explain-body">
            <ul>
              <li>Weights are stored in kilograms; pounds are converted only for display (1 lb = 0.45359237 kg).</li>
              <li>Current weight is your most recent reading by measurement time.</li>
              <li>When a day has several readings, charts and averages use that day's average.</li>
              <li>7-day change compares your latest reading with the last reading on or before the date 7 days earlier (30-day change works the same way).</li>
              <li>7-day average is the average of logged days in the last 7 calendar days. Missing days are skipped, never counted as zero.</li>
              <li>The rolling average line shows the 7-day average at each logged day, once at least 3 days in that week have data.</li>
              <li>Goal progress = (current − start) ÷ (target − start). The bar is capped at 0–100%.</li>
              <li>Milestones are recalculated from your readings, so editing or deleting an entry updates them.</li>
              <li>The forecast fits a straight-line trend to the last 6 weeks (at least 10 logged days over 14+ days). It is hidden when the trend is flat or moving away from the target.</li>
              <li>BMI = weight (kg) ÷ height (m)², using your latest reading.</li>
            </ul>
          </div>
        </details>
      </SettingsSection>
    </main>
  );
}
