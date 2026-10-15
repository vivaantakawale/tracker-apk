import { useId, useState, type FormEvent } from 'react';
import { useStore } from '../state/store';
import { errMsg } from '../state/actions';
import type { WeightUnit } from '../lib/types';
import { Field, Segmented } from '../components/ui';
import { HeightInput, useHeightState } from '../components/sheets/MiscSheets';
import { isValidDateKey, todayKey } from '../lib/dates';
import { parseWeightInput } from '../lib/units';

/** Two short steps; everything is optional and can be skipped. */
export function Onboarding() {
  const { data, actions } = useStore();
  const id = useId();
  const [step, setStep] = useState<1 | 2>(1);
  const [unit, setUnit] = useState<WeightUnit>(data.settings.preferred_weight_unit);
  const h = useHeightState(data.settings.height_cm, data.settings.height_unit);
  const [heightError, setHeightError] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [target, setTarget] = useState('');
  const [startDate, setStartDate] = useState(todayKey());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const heightCm = () => {
    const r = h.read();
    return 'error' in r ? undefined : r.cm;
  };

  const next = (e: FormEvent) => {
    e.preventDefault();
    const r = h.read();
    if ('error' in r) return setHeightError(r.error);
    setHeightError(null);
    setStep(2);
  };

  const skip = async () => {
    setBusy(true);
    try {
      const cm = heightCm();
      await actions.completeOnboarding({ preferred_weight_unit: unit, ...(cm !== undefined ? { height_cm: cm, height_unit: h.unit } : {}) }, null, null);
    } catch (err) {
      setErrors({ form: errMsg(err) });
      setBusy(false);
    }
  };

  const finish = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    let currentKg: number | null = null;
    let targetKg: number | null = null;
    if (current.trim()) {
      const r = parseWeightInput(current, unit);
      if (r.ok) currentKg = r.kg;
      else errs.current = r.error;
    }
    if (target.trim()) {
      const r = parseWeightInput(target, unit);
      if (r.ok) targetKg = r.kg;
      else errs.target = r.error;
      if (r.ok && currentKg === null && !errs.current) errs.current = 'Enter your current weight to use as the starting point for the goal.';
    }
    if (targetKg !== null && !isValidDateKey(startDate)) errs.startDate = 'Choose a valid date.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const cm = heightCm();
      await actions.completeOnboarding(
        { preferred_weight_unit: unit, ...(cm !== undefined ? { height_cm: cm, height_unit: h.unit } : {}) },
        currentKg !== null ? { weight_kg: currentKg, measured_at: new Date().toISOString(), notes: '' } : null,
        currentKg !== null && targetKg !== null
          ? { starting_weight_kg: currentKg, target_weight_kg: targetKg, start_date: startDate, target_date: null, description: '' }
          : null,
      );
    } catch (err) {
      setErrors({ form: errMsg(err) });
      setBusy(false);
    }
  };

  return (
    <main className="onboarding">
      <div className="row-between">
        <p className="eyebrow" style={{ margin: 0 }}>Weight Tracker</p>
        <button type="button" className="btn btn--ghost" onClick={skip} disabled={busy}>
          Skip
        </button>
      </div>
      <div className="steps" aria-hidden="true">
        <span className="on" />
        <span className={step === 2 ? 'on' : ''} />
      </div>

      {step === 1 ? (
        <form className="form" onSubmit={next} noValidate>
          <div>
            <h1 className="title">Welcome</h1>
            <p className="lead">A simple, private place to log your weight. Everything stays on this device.</p>
          </div>
          <div className="field">
            <span className="field-label">Preferred weight unit</span>
            <Segmented
              label="Weight unit"
              options={[
                { value: 'kg', label: 'Kilograms (kg)' },
                { value: 'lb', label: 'Pounds (lb)' },
              ]}
              value={unit}
              onChange={setUnit}
            />
          </div>
          <HeightInput {...h.props} error={heightError} />
          <button type="submit" className="btn btn--primary btn--lg btn--block">
            Continue
          </button>
        </form>
      ) : (
        <form className="form" onSubmit={finish} noValidate>
          <div>
            <h1 className="title">Starting point</h1>
            <p className="lead">Optional. Your first measurement sets your starting point. You can add a target any time.</p>
          </div>
          <Field label={`Current weight (${unit})`} htmlFor={`${id}-c`} error={errors.current}>
            <input id={`${id}-c`} className="input input--big" inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={!!errors.current} />
          </Field>
          <div className="field-row">
            <Field label={`Target weight (${unit})`} htmlFor={`${id}-t`} error={errors.target}>
              <input id={`${id}-t`} className="input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} aria-invalid={!!errors.target} />
            </Field>
            <Field label="Goal start date" htmlFor={`${id}-d`} error={errors.startDate}>
              <input id={`${id}-d`} className="input" type="date" value={startDate} max={todayKey()} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
          </div>
          {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>
            {current.trim() ? 'Save and start' : 'Start without a weight'}
          </button>
          <button type="button" className="btn btn--secondary btn--block" onClick={() => setStep(1)}>
            Back
          </button>
        </form>
      )}
    </main>
  );
}
