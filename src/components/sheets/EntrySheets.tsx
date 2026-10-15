import { useId, useRef, useState, type FormEvent } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { useStore } from '../../state/store';
import { useUI } from '../../state/ui';
import { useAppActions, errMsg } from '../../state/actions';
import type { WeightUnit } from '../../lib/types';
import { Field, KV, Segmented, Sheet, EmptyState } from '../ui';
import { combineDateTime, entryDateKey, toDateKey, toTimeValue, todayKey } from '../../lib/dates';
import { fmtDateKey, fmtDateTime, fmtDelta, fmtTime, fmtWeight } from '../../lib/format';
import { fromKg, parseWeightInput } from '../../lib/units';
import { NOTES_MAX } from '../../lib/entries';

const UNIT_OPTIONS = [
  { value: 'kg' as const, label: 'kg' },
  { value: 'lb' as const, label: 'lb' },
];

// ------------------------------------------------------------- add / edit

export function EntryFormSheet({ entryId, dateKey, onClose }: { entryId?: string; dateKey?: string; onClose: () => void }) {
  const { data, actions } = useStore();
  const ui = useUI();
  const id = useId();
  const entry = entryId ? data.entries.find((e) => e.id === entryId) : undefined;
  const pref = data.settings.preferred_weight_unit;

  const [init] = useState(() => {
    const now = new Date();
    if (entry) {
      const d = new Date(entry.measured_at);
      return { weight: fmtWeight(entry.weight_kg, pref, 2).replace(/0$/, ''), date: toDateKey(d), time: toTimeValue(d), notes: entry.notes };
    }
    return { weight: '', date: dateKey ?? todayKey(now), time: toTimeValue(now), notes: '' };
  });
  const [weight, setWeight] = useState(init.weight);
  const [touched, setTouched] = useState(false);
  const [unit, setUnit] = useState<WeightUnit>(pref);
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [notes, setNotes] = useState(init.notes);
  const [errors, setErrors] = useState<{ weight?: string; date?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);

  if (entryId && !entry) {
    return (
      <Sheet title="Edit weight" onClose={onClose}>
        <EmptyState title="This entry no longer exists" />
      </Sheet>
    );
  }

  const last = data.entries[data.entries.length - 1];

  const changeUnit = (u: WeightUnit) => {
    // An untouched prefilled value is converted; a typed value is reinterpreted.
    if (!touched && entry && weight) setWeight(fromKg(entry.weight_kg, u).toFixed(1));
    setUnit(u);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    const next: typeof errors = {};
    let kg: number | null = null;
    if (entry && !touched) kg = entry.weight_kg; // keep exact stored value; no re-conversion drift
    else {
      const r = parseWeightInput(weight, unit);
      if (r.ok) kg = r.kg;
      else next.weight = r.error;
    }
    // Untouched default date/time on a new entry means "now": use the exact
    // moment (with seconds) so it orders after anything logged this minute.
    const isDefaultNow = !entry && date === init.date && time === init.time && init.date === todayKey();
    const when = isDefaultNow ? new Date() : combineDateTime(date, time);
    if (!when) next.date = 'Choose a valid date and time.';
    else if (when.getTime() > Date.now() + 5 * 60_000) next.date = 'Measurements cannot be in the future.';
    setErrors(next);
    if (next.weight || next.date || kg === null || !when) return;

    lock.current = true;
    setSaving(true);
    try {
      const input = { weight_kg: kg, measured_at: when.toISOString(), notes };
      if (entry) {
        await actions.updateEntry(entry.id, input);
        ui.toast('Entry updated');
      } else {
        await actions.addEntry(input);
        ui.toast(`Logged ${fmtWeight(kg, unit)} ${unit}`);
      }
      onClose();
    } catch (err) {
      setErrors({ form: errMsg(err) });
      lock.current = false;
      setSaving(false);
    }
  };

  return (
    <Sheet title={entry ? 'Edit weight' : 'Log weight'} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <Field label="Weight" htmlFor={`${id}-w`} error={errors.weight}>
          <div className="input-with-unit">
            <input
              id={`${id}-w`}
              className="input input--big"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder={last ? fmtWeight(last.weight_kg, unit) : unit === 'kg' ? '70.0' : '155.0'}
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value);
                setTouched(true);
                if (errors.weight || errors.form) setErrors((x) => ({ ...x, weight: undefined, form: undefined }));
              }}
              aria-invalid={!!errors.weight}
              aria-describedby={errors.weight ? `${id}-w-err` : undefined}
              data-autofocus
            />
            <Segmented label="Unit" options={UNIT_OPTIONS} value={unit} onChange={changeUnit} />
          </div>
        </Field>
        <div className="field-row">
          <Field label="Date" htmlFor={`${id}-d`} error={errors.date}>
            <input
              id={`${id}-d`}
              className="input"
              type="date"
              value={date}
              max={todayKey()}
              onChange={(e) => {
                setDate(e.target.value);
                if (errors.date) setErrors((x) => ({ ...x, date: undefined }));
              }}
              aria-invalid={!!errors.date}
              required
            />
          </Field>
          <Field label="Time" htmlFor={`${id}-t`}>
            <input id={`${id}-t`} className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
        <Field label="Notes (optional)" htmlFor={`${id}-n`} hint={notes.length > NOTES_MAX - 50 ? `${notes.length}/${NOTES_MAX}` : undefined}>
          <textarea
            id={`${id}-n`}
            className="input"
            rows={2}
            maxLength={NOTES_MAX}
            value={notes}
            placeholder="e.g. after workout, new scale"
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {errors.form && (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={saving}>
          {saving ? 'Saving…' : entry ? 'Save changes' : 'Save'}
        </button>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------- details

export function EntryDetailsSheet({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const { data } = useStore();
  const ui = useUI();
  const { deleteEntry } = useAppActions();
  const unit = data.settings.preferred_weight_unit;
  const idx = data.entries.findIndex((e) => e.id === entryId);
  const entry = idx >= 0 ? data.entries[idx] : null;
  if (!entry) {
    return (
      <Sheet title="Entry" onClose={onClose}>
        <EmptyState title="This entry no longer exists" />
      </Sheet>
    );
  }
  const prev = idx > 0 ? data.entries[idx - 1] : null;
  const edited = entry.updated_at !== entry.created_at;
  return (
    <Sheet title="Entry details" onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <div>
          <p className="label">{fmtDateKey(entryDateKey(entry.measured_at), 'long')} · {fmtTime(entry.measured_at)}</p>
          <div className="hero-value">
            <strong className="num">{fmtWeight(entry.weight_kg, unit)}</strong>
            <span>{unit}</span>
          </div>
        </div>
        <dl className="kv">
          <KV
            label="Change from previous"
            value={prev ? `${fmtDelta(entry.weight_kg - prev.weight_kg, unit)} ${unit}` : null}
            na="First entry"
          />
          <KV label="Previous reading" value={prev ? fmtDateTime(prev.measured_at) : null} na="—" />
        </dl>
        {entry.notes && <p className="callout" style={{ whiteSpace: 'pre-wrap' }}>{entry.notes}</p>}
        <p className="field-hint">
          Added {fmtDateTime(entry.created_at)}
          {edited && ` · Edited ${fmtDateTime(entry.updated_at)}`}
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={() => ui.open({ kind: 'entry-form', entryId: entry.id })}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={async () => {
              if (await deleteEntry(entry)) onClose();
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// --------------------------------------------------------------- day view

export function DaySheet({ dateKey, onClose }: { dateKey: string; onClose: () => void }) {
  const { data } = useStore();
  const ui = useUI();
  const unit = data.settings.preferred_weight_unit;
  const items = data.entries.filter((e) => entryDateKey(e.measured_at) === dateKey);
  const avg = items.length ? items.reduce((s, e) => s + e.weight_kg, 0) / items.length : null;
  return (
    <Sheet title={fmtDateKey(dateKey, 'long')} onClose={onClose}>
      <div className="stack">
        {items.length ? (
          <>
            {items.length > 1 && avg !== null && (
              <p className="section-note">
                {items.length} readings · daily average <strong className="num">{fmtWeight(avg, unit)} {unit}</strong>
              </p>
            )}
            <div className="list">
              {items.map((e) => (
                <button key={e.id} type="button" className="list-row" onClick={() => ui.open({ kind: 'entry-details', entryId: e.id })}>
                  <div className="list-main">
                    <p className="list-title num">
                      {fmtWeight(e.weight_kg, unit)} {unit}
                    </p>
                    <p className="list-sub">
                      {fmtTime(e.measured_at)}
                      {e.notes ? ` · ${e.notes}` : ''}
                    </p>
                  </div>
                  <ChevronRight size={18} className="chevron" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <EmptyState title="No readings on this day" />
        )}
        {dateKey <= todayKey() && (
          <button type="button" className="btn btn--primary btn--block" onClick={() => ui.open({ kind: 'entry-form', dateKey })}>
            <Plus size={18} /> {items.length ? 'Add another reading' : 'Add a reading for this day'}
          </button>
        )}
      </div>
    </Sheet>
  );
}
