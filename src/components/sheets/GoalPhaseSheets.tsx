import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../../state/store';
import { useUI } from '../../state/ui';
import { errMsg } from '../../state/actions';
import type { PhaseType, WeightEntry } from '../../lib/types';
import { Field, Segmented, Sheet } from '../ui';
import { addDays, entryDateKey, isValidDateKey, todayKey } from '../../lib/dates';
import { fmtDateKey, fmtDelta, fmtWeight } from '../../lib/format';
import { parseWeightInput } from '../../lib/units';
import { goalDirection, MAINTAIN_TOLERANCE_KG } from '../../lib/goal';
import { activePhase, PHASE_TYPES } from '../../lib/phases';

/** Weight at a date: last reading on/before it, else first reading after. */
function weightAt(entries: readonly WeightEntry[], dateKey: string): WeightEntry | null {
  let best: WeightEntry | null = null;
  for (const e of entries) {
    if (entryDateKey(e.measured_at) <= dateKey) best = e;
    else return best ?? e;
  }
  return best;
}

// -------------------------------------------------------------------- goal

export function GoalFormSheet({ goalId, onClose }: { goalId?: string; onClose: () => void }) {
  const { data, actions } = useStore();
  const ui = useUI();
  const id = useId();
  const unit = data.settings.preferred_weight_unit;
  const goal = goalId ? data.goals.find((g) => g.id === goalId) : undefined;
  const otherActive = data.goals.find((g) => g.status === 'active' && g.id !== goalId);

  const [startDate, setStartDate] = useState(goal?.start_date ?? todayKey());
  const autoStart = (key: string) => {
    const e = weightAt(data.entries, key);
    return e ? fmtWeight(e.weight_kg, unit) : '';
  };
  const [startW, setStartW] = useState(() => (goal ? fmtWeight(goal.starting_weight_kg, unit) : autoStart(startDate)));
  const [startTouched, setStartTouched] = useState(false);
  const [targetW, setTargetW] = useState(goal ? fmtWeight(goal.target_weight_kg, unit) : '');
  const [targetTouched, setTargetTouched] = useState(false);
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? '');
  const [desc, setDesc] = useState(goal?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);

  const startKg = goal && !startTouched ? goal.starting_weight_kg : (() => { const r = parseWeightInput(startW, unit); return r.ok ? r.kg : null; })();
  const targetKg = goal && !targetTouched ? goal.target_weight_kg : (() => { const r = parseWeightInput(targetW, unit); return r.ok ? r.kg : null; })();
  const preview = useMemo(() => {
    if (startKg === null || targetKg === null) return null;
    const dir = goalDirection({ starting_weight_kg: startKg, target_weight_kg: targetKg });
    if (dir === 'maintain') return `Maintenance goal · stay within ±${fmtWeight(MAINTAIN_TOLERANCE_KG, unit)} ${unit}`;
    return `${dir === 'gain' ? 'Gain' : 'Loss'} goal · ${fmtDelta(targetKg - startKg, unit)} ${unit} in total`;
  }, [startKg, targetKg, unit]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    const errs: Record<string, string> = {};
    const errorOf = (raw: string) => {
      const r = parseWeightInput(raw, unit);
      return r.ok ? '' : r.error;
    };
    if (startKg === null) errs.start = errorOf(startW);
    if (targetKg === null) errs.target = errorOf(targetW);
    if (!isValidDateKey(startDate)) errs.startDate = 'Choose a valid start date.';
    if (targetDate && (!isValidDateKey(targetDate) || targetDate <= startDate)) errs.targetDate = 'The target date must be after the start date.';
    setErrors(errs);
    if (Object.values(errs).some(Boolean) || startKg === null || targetKg === null) return;
    lock.current = true;
    setSaving(true);
    try {
      await actions.saveGoal(
        { starting_weight_kg: startKg, target_weight_kg: targetKg, start_date: startDate, target_date: targetDate || null, description: desc.trim() },
        goal?.id,
      );
      ui.toast(goal ? 'Goal updated' : 'Goal saved');
      onClose();
    } catch (err) {
      setErrors({ form: errMsg(err) });
      lock.current = false;
      setSaving(false);
    }
  };

  return (
    <Sheet title={goal ? 'Edit goal' : 'New goal'} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <div className="field-row">
          <Field label={`Starting weight (${unit})`} htmlFor={`${id}-s`} error={errors.start}>
            <input
              id={`${id}-s`}
              className="input num"
              inputMode="decimal"
              value={startW}
              onChange={(e) => {
                setStartW(e.target.value);
                setStartTouched(true);
              }}
              aria-invalid={!!errors.start}
            />
          </Field>
          <Field label={`Target weight (${unit})`} htmlFor={`${id}-t`} error={errors.target}>
            <input
              id={`${id}-t`}
              className="input num"
              inputMode="decimal"
              value={targetW}
              onChange={(e) => {
                setTargetW(e.target.value);
                setTargetTouched(true);
              }}
              aria-invalid={!!errors.target}
              data-autofocus
            />
          </Field>
        </div>
        {preview && <p className="field-hint" style={{ marginTop: -6 }}>{preview}</p>}
        <div className="field-row">
          <Field label="Start date" htmlFor={`${id}-sd`} error={errors.startDate}>
            <input
              id={`${id}-sd`}
              className="input"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (!goal && !startTouched && isValidDateKey(e.target.value)) setStartW(autoStart(e.target.value));
              }}
            />
          </Field>
          <Field label="Target date (optional)" htmlFor={`${id}-td`} error={errors.targetDate}>
            <input id={`${id}-td`} className="input" type="date" value={targetDate} min={startDate} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Description (optional)" htmlFor={`${id}-desc`}>
          <input id={`${id}-desc`} className="input" maxLength={120} value={desc} placeholder="e.g. Lean bulk before summer" onChange={(e) => setDesc(e.target.value)} />
        </Field>
        {!goal && otherActive && (
          <p className="callout">Your current goal will be archived. You can reactivate it later from Settings.</p>
        )}
        {!goal && !otherActive && !startTouched && startW && (
          <p className="field-hint">Starting weight was filled from your reading closest to the start date.</p>
        )}
        {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={saving}>
          {saving ? 'Saving…' : 'Save goal'}
        </button>
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------- phase

export function PhaseFormSheet({ phaseId, onClose }: { phaseId?: string; onClose: () => void }) {
  const { data, actions } = useStore();
  const ui = useUI();
  const id = useId();
  const unit = data.settings.preferred_weight_unit;
  const phase = phaseId ? data.phases.find((p) => p.id === phaseId) : undefined;
  const today = todayKey();

  const [type, setType] = useState<PhaseType>(phase?.type ?? 'bulk');
  const [name, setName] = useState(phase?.name ?? '');
  const [start, setStart] = useState(phase?.start_date ?? today);
  const [end, setEnd] = useState(phase?.end_date ?? '');
  const [target, setTarget] = useState(phase?.target_weight_kg != null ? fmtWeight(phase.target_weight_kg, unit) : '');
  const [targetTouched, setTargetTouched] = useState(false);
  const [notes, setNotes] = useState(phase?.notes ?? '');
  const current = activePhase(data.phases, today);
  const switchable = !phase && current && current.end_date === null ? current : null;
  const [endCurrent, setEndCurrent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);

  const typeLabel = PHASE_TYPES.find((t) => t.value === type)!.short;
  const defaultName = `${typeLabel} · ${isValidDateKey(start) ? fmtDateKey(start, 'monthShortYear') : ''}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    let targetKg: number | null = null;
    if (phase && !targetTouched) targetKg = phase.target_weight_kg;
    else if (target.trim()) {
      const r = parseWeightInput(target, unit);
      if (!r.ok) return setError(`Target weight: ${r.error}`);
      targetKg = r.kg;
    }
    if (!isValidDateKey(start)) return setError('Choose a valid start date.');
    lock.current = true;
    setSaving(true);
    try {
      await actions.savePhase(
        { type, name: name.trim() || defaultName, start_date: start, end_date: end || null, target_weight_kg: targetKg, notes },
        phase?.id,
        switchable && endCurrent ? { id: switchable.id, end_date: addDays(start, -1) } : undefined,
      );
      ui.toast(phase ? 'Phase updated' : 'Phase started');
      onClose();
    } catch (err) {
      setError(errMsg(err));
      lock.current = false;
      setSaving(false);
    }
  };

  return (
    <Sheet title={phase ? 'Edit phase' : 'New phase'} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <div className="field">
          <span className="field-label">Type</span>
          <Segmented
            label="Phase type"
            options={PHASE_TYPES.map((t) => ({ value: t.value, label: t.short }))}
            value={type}
            onChange={setType}
          />
        </div>
        <Field label="Name" htmlFor={`${id}-n`}>
          <input id={`${id}-n`} className="input" maxLength={60} value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="field-row">
          <Field label="Start date" htmlFor={`${id}-s`}>
            <input id={`${id}-s`} className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End date (optional)" htmlFor={`${id}-e`}>
            <input id={`${id}-e`} className="input" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label={`Phase target weight (${unit}, optional)`} htmlFor={`${id}-t`}>
          <input
            id={`${id}-t`}
            className="input num"
            inputMode="decimal"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setTargetTouched(true);
            }}
          />
        </Field>
        <Field label="Notes (optional)" htmlFor={`${id}-no`}>
          <textarea id={`${id}-no`} className="input" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {switchable && (
          <label className="check">
            <input type="checkbox" checked={endCurrent} onChange={(e) => setEndCurrent(e.target.checked)} />
            <span>
              End “{switchable.name}” on {isValidDateKey(start) ? fmtDateKey(addDays(start, -1)) : 'the day before'} so the new phase can start.
              It stays in your phase history.
            </span>
          </label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={saving}>
          {saving ? 'Saving…' : phase ? 'Save phase' : 'Start phase'}
        </button>
      </form>
    </Sheet>
  );
}
