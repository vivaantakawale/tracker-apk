import { useMemo, useState } from 'react';
import { Check, ChevronRight, Flag, Minus, TrendingDown, TrendingUp, Circle } from 'lucide-react';
import type { WeightPhase, WeightUnit } from '../lib/types';
import type { Derived } from '../state/derived';
import type { RangeKey } from '../lib/ranges';
import { rangeBounds } from '../lib/ranges';
import { fmtDate, fmtDateKey, fmtDateTime, fmtDelta, fmtDuration, fmtWeight, fmtApproxDate } from '../lib/format';
import { BMI_BANDS, bmiBandIndex, bmiBarPosition, bmiCategory } from '../lib/bmi';
import { MAINTAIN_TOLERANCE_KG } from '../lib/goal';
import type { Milestone } from '../lib/milestones';
import { phaseStats, phaseTypeLabel } from '../lib/phases';
import type { WeightEntry } from '../lib/types';
import { FORECAST_MIN_DAYS, FORECAST_MIN_SPAN } from '../lib/forecast';
import { ProgressBar, TimeRangeSelector, KV } from './ui';
import { WeightTrendChart } from './WeightTrendChart';
import { entryDateKey } from '../lib/dates';
import { fromKg } from '../lib/units';

// ---------------------------------------------------------- current weight

export function CurrentWeightCard({ d, unit }: { d: Derived; unit: WeightUnit }) {
  const { latest, change7, goal } = d;
  let tone = '';
  let Icon = Minus;
  let text = 'Not enough data for a weekly change yet';
  if (change7) {
    const c = change7.change;
    const shown = fmtDelta(c, unit);
    Icon = shown === (0).toFixed(1) ? Minus : c > 0 ? TrendingUp : TrendingDown;
    text = `${shown} ${unit} this week`;
    const dir = d.progress?.direction;
    if (goal && ((dir === 'gain' && c > 0) || (dir === 'loss' && c < 0))) tone = ' delta--good';
  }
  return (
    <section className="card card--surface hero" aria-label="Current weight">
      <div className="row-between">
        <p className="label">Current weight</p>
        {latest && <p className="label faint" style={{ fontSize: 12 }}>{fmtDateTime(latest.measured_at)}</p>}
      </div>
      {latest ? (
        <>
          <div className="hero-value">
            <strong className="num">{fmtWeight(latest.weight_kg, unit)}</strong>
            <span>{unit}</span>
          </div>
          <div className={`delta${tone}`}>
            <Icon size={16} aria-hidden="true" />
            <span className="num">{text}</span>
          </div>
        </>
      ) : (
        <>
          <div className="hero-value">
            <strong className="faint">—</strong>
            <span>{unit}</span>
          </div>
          <p className="delta">Your first measurement will set your starting point.</p>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------- chart block

export function TrendSection({
  d,
  unit,
  title = 'Weight trend',
  variant = 'simple',
  height,
  defaultRange = '30d',
}: {
  d: Derived;
  unit: WeightUnit;
  title?: string;
  variant?: 'simple' | 'detailed';
  height?: number;
  defaultRange?: RangeKey;
}) {
  const [range, setRange] = useState<RangeKey>(defaultRange);
  const { startDay, endDay } = rangeBounds(range, d.todayDay, d.daily[0]?.day ?? null);
  const points = useMemo(() => d.daily.filter((p) => p.day >= startDay && p.day <= endDay), [d.daily, startDay, endDay]);
  const trend = useMemo(
    () => (variant === 'detailed' ? d.rolling.filter((p) => p.day >= startDay && p.day <= endDay) : []),
    [d.rolling, variant, startDay, endDay],
  );
  const latestDay = d.daily.length ? d.daily[d.daily.length - 1].day : null;

  let note: string | null = null;
  if (d.daily.length === 0) note = null;
  else if (d.daily.length === 1) note = 'One measurement so far. Log on more days to see a trend.';
  else if (points.length === 0) note = null;
  else if (variant === 'detailed' && d.rolling.length === 0)
    note = 'The 7-day average line appears once a week has at least 3 logged days.';

  return (
    <section className="section" aria-label={title}>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>
      <WeightTrendChart
        points={points}
        trend={trend}
        startDay={startDay}
        endDay={endDay}
        unit={unit}
        variant={variant}
        height={height}
        latestDay={latestDay}
        emptyText={d.daily.length ? 'No measurements in this period' : 'Your chart will appear after your first log'}
      />
      {variant === 'detailed' && points.length > 0 && (
        <div className="legend" aria-hidden="true">
          <span>
            <i className="dot" /> Daily weight
          </span>
          <span>
            <i /> 7-day average
          </span>
        </div>
      )}
      {note && <p className="chart-note">{note}</p>}
    </section>
  );
}

// ----------------------------------------------------------- goal progress

export function GoalProgressBlock({
  d,
  unit,
  onSetGoal,
}: {
  d: Derived;
  unit: WeightUnit;
  onSetGoal: () => void;
}) {
  const { goal, progress } = d;
  let pctText = '—';
  let caption: React.ReactNode = (
    <>
      No target set.{' '}
      <button type="button" className="link-btn" onClick={onSetGoal}>
        Set a target weight
      </button>
    </>
  );
  let bar = 0;
  if (goal && progress) {
    if (progress.current === null) {
      caption = 'Log a weight to start tracking progress.';
    } else if (progress.direction === 'maintain') {
      bar = progress.barFraction;
      pctText = progress.reached ? 'On target' : 'Off target';
      caption = progress.reached
        ? `Within ±${fmtWeight(MAINTAIN_TOLERANCE_KG, unit)} ${unit} of ${fmtWeight(goal.target_weight_kg, unit)} ${unit}`
        : `${fmtWeight(Math.abs(progress.remaining!), unit)} ${unit} ${progress.remaining! > 0 ? 'below' : 'above'} your maintenance weight`;
    } else {
      bar = progress.barFraction;
      pctText = `${Math.round(progress.fraction! * 100)}%`;
      if (progress.reached) caption = 'Target reached';
      else {
        const verb = progress.direction === 'gain' ? 'to gain' : 'to lose';
        caption = `${fmtWeight(Math.abs(progress.remaining!), unit)} ${unit} ${verb}`;
        if (progress.fraction! < 0) caption += ' · currently moving away from target';
      }
    }
  }
  return (
    <section className="section" aria-label="Goal progress" style={{ gap: 10 }}>
      <div className="progress-head">
        <h2 className="section-title">Goal progress</h2>
        <span className="progress-pct num">{pctText}</span>
      </div>
      <ProgressBar fraction={bar} label="Goal progress" />
      <p className="progress-caption">{caption}</p>
    </section>
  );
}

// --------------------------------------------------------------------- BMI

export function BmiCard({
  bmi,
  hasHeight,
  hasWeight,
  onAddHeight,
  detailed = false,
  onOpen,
}: {
  bmi: number | null;
  hasHeight: boolean;
  hasWeight: boolean;
  onAddHeight: () => void;
  detailed?: boolean;
  onOpen?: () => void;
}) {
  if (!hasHeight || bmi === null) {
    return (
      <section className="card" aria-label="BMI">
        <div className="row-between">
          <div>
            <p className="label">BMI</p>
            <p style={{ margin: '4px 0 0', fontSize: 14 }}>
              {!hasHeight ? 'Add your height to see your BMI.' : !hasWeight ? 'Log a weight to calculate your BMI.' : 'Not available'}
            </p>
          </div>
          {!hasHeight && (
            <button type="button" className="btn btn--secondary btn--sm" onClick={onAddHeight}>
              Add height
            </button>
          )}
        </div>
      </section>
    );
  }
  const cat = bmiCategory(bmi);
  const band = bmiBandIndex(bmi);
  return (
    <section className="card bmi-card" aria-label={`BMI ${bmi.toFixed(1)}, ${cat}`}>
      <div className="bmi-value">
        <strong className="num">{bmi.toFixed(1)}</strong>
        <span>BMI</span>
      </div>
      <div className="bmi-bar" aria-hidden="true">
        {BMI_BANDS.map((b, i) => (
          <span key={b.from} className={`bmi-band bmi-band--${i + 1}`} style={{ flexGrow: b.weight }} />
        ))}
        <span className="bmi-notch" style={{ left: `${bmiBarPosition(bmi) * 100}%` }} />
      </div>
      {detailed && (
        <div className="bmi-ticks" aria-hidden="true">
          {[18.5, 25, 30].map((v) => (
            <span key={v} style={{ left: `${bmiBarPosition(v) * 100}%` }}>
              {v}
            </span>
          ))}
        </div>
      )}
      <p className="bmi-cat">
        <i className={`bmi-dot bmi-band--${band + 1}`} aria-hidden="true" />
        {cat}
      </p>
      {!detailed && onOpen && (
        <button type="button" className="link-btn bmi-more" onClick={onOpen}>
          What BMI does and doesn't tell you <ChevronRight size={14} aria-hidden="true" />
        </button>
      )}
      {detailed && (
        <p className="callout" style={{ marginTop: 14 }}>
          BMI is a screening measure based only on height and weight. It does not measure body fat directly and
          cannot distinguish muscle from fat, so it is not a diagnosis. Adult categories: under 18.5 underweight,
          18.5–24.9 normal, 25–29.9 overweight, 30+ obesity.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- forecast

export function ForecastCard({ d, unit }: { d: Derived; unit: WeightUnit }) {
  const f = d.forecast;
  const rate = (r: number) => `${fmtDelta(r, unit, 2)} ${unit}/week`;
  let body: React.ReactNode;
  switch (f.status) {
    case 'no-goal':
      body = <p className="section-note">Set a target weight to get an estimated arrival date.</p>;
      break;
    case 'maintain':
      body = <p className="section-note">Your goal is to maintain your weight, so there is no arrival date to forecast.</p>;
      break;
    case 'reached':
      body = <p className="section-note">Your latest weight has reached the target.</p>;
      break;
    case 'insufficient':
      body = (
        <>
          <p style={{ margin: 0, fontWeight: 600 }}>Keep logging to unlock your forecast</p>
          <p className="section-note" style={{ marginTop: 4 }}>
            Needs at least {FORECAST_MIN_DAYS} logged days spread over {FORECAST_MIN_SPAN}+ days in the last 6 weeks.
            You have {f.days} logged day{f.days === 1 ? '' : 's'}
            {f.days > 1 ? ` over ${f.spanDays} days` : ''}.
          </p>
          <ProgressBar className="ms-bar" fraction={Math.min(f.days / FORECAST_MIN_DAYS, f.spanDays / FORECAST_MIN_SPAN)} label="Forecast data collected" />
        </>
      );
      break;
    case 'flat':
      body = (
        <p className="section-note">
          Your recent trend is essentially flat ({rate(f.ratePerWeek)}), so no arrival date can be estimated.
        </p>
      );
      break;
    case 'wrong-direction':
      body = (
        <p className="section-note">
          Your recent trend ({rate(f.ratePerWeek)}) is moving away from your target, so no arrival date is shown.
        </p>
      );
      break;
    case 'too-far':
      body = (
        <p className="section-note">
          At the recent rate ({rate(f.ratePerWeek)}) the target is more than two years away, which is too far to
          estimate meaningfully.
        </p>
      );
      break;
    case 'ok':
      body = (
        <>
          <dl className="kv">
            <KV label="Estimated arrival" value={fmtApproxDate(f.date)} />
            <KV label="Recent rate" value={<span className="num">{rate(f.ratePerWeek)}</span>} />
          </dl>
          {f.rangeStart && (
            <p className="section-note" style={{ marginTop: 10 }}>
              Plausible range: {fmtDate(f.rangeStart, 'medium')} – {f.rangeEnd ? fmtDate(f.rangeEnd, 'medium') : 'later, if progress slows'}.
            </p>
          )}
          <p className="callout" style={{ marginTop: 10 }}>
            An estimate from a straight-line trend over your last {f.daysUsed} logged days (6-week window). Weight
            change often slows, plateaus or changes direction, so treat this as a rough guide, not a promise.
          </p>
        </>
      );
      break;
  }
  return (
    <section className="card" aria-label="Weight forecast">
      <p className="label" style={{ marginBottom: 8 }}>
        Forecast
      </p>
      {body}
    </section>
  );
}

// -------------------------------------------------------------- milestones

export function MilestoneList({ milestones, entries }: { milestones: readonly Milestone[]; entries: readonly WeightEntry[] }) {
  if (!entries.length) {
    return <p className="section-note">Milestones appear once you start logging.</p>;
  }
  const done = milestones.filter((m) => m.achievedAt);
  const upcoming = milestones.filter((m) => !m.achievedAt);
  const item = (m: Milestone) => (
    <li key={m.id} className={`ms${m.achievedAt ? ' ms--done' : ''}`}>
      <span className="ms-icon" aria-hidden="true">
        {m.achievedAt ? <Check size={14} /> : m.kind === 'goal' ? <Flag size={13} /> : <Circle size={10} />}
      </span>
      <div className="ms-body">
        <p className="ms-title">
          {m.label}
          {m.kind === 'goal' && <span className="chip" style={{ marginLeft: 6 }}>Goal</span>}
        </p>
        {m.achievedAt ? (
          <p className="ms-sub">Reached {fmtDateKey(entryDateKey(m.achievedAt), 'medium')}</p>
        ) : (
          <>
            <p className="ms-sub">Not yet · {Math.round(m.progress * 100)}% of the way</p>
            <ProgressBar className="ms-bar" fraction={m.progress} label={`${m.label} progress`} />
          </>
        )}
      </div>
    </li>
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      {done.length > 0 && (
        <div>
          <p className="group-head">Reached</p>
          <ul className="ms-list">{done.map(item)}</ul>
        </div>
      )}
      {upcoming.length > 0 && (
        <div>
          <p className="group-head">Upcoming</p>
          <ul className="ms-list">{upcoming.map(item)}</ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ phases

export function PhaseCard({
  phase,
  entries,
  today,
  unit,
  active,
  onEdit,
  onEnd,
  onDelete,
}: {
  phase: WeightPhase;
  entries: readonly WeightEntry[];
  today: string;
  unit: WeightUnit;
  active: boolean;
  onEdit: () => void;
  onEnd?: () => void;
  onDelete: () => void;
}) {
  const s = phaseStats(phase, entries, today);
  const w = (e: WeightEntry | null) => (e ? `${fmtWeight(e.weight_kg, unit)} ${unit}` : null);
  const range = `${fmtDateKey(phase.start_date)} – ${phase.end_date ? fmtDateKey(phase.end_date) : 'ongoing'}`;
  const upcoming = phase.start_date > today;
  return (
    <section className="card" aria-label={`Phase ${phase.name}`}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <p className="list-title" style={{ fontWeight: 600 }}>{phase.name}</p>
          <p className="list-sub">{range}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className="chip">{phaseTypeLabel(phase.type)}</span>
          {active && <span className="chip chip--accent">Active</span>}
          {upcoming && <span className="chip">Upcoming</span>}
        </div>
      </div>
      <hr className="divider" />
      <dl className="kv">
        <KV label="Start weight" value={w(s.startEntry)} na="No readings" />
        <KV label="Latest in phase" value={w(s.latestEntry)} na="No readings" />
        <KV label="Change" value={s.change !== null ? `${fmtDelta(s.change, unit)} ${unit}` : null} />
        <KV label="Duration" value={upcoming ? 'Not started' : fmtDuration(s.elapsedDays)} />
        <KV label="Avg. rate" value={s.ratePerWeek !== null ? `${fmtDelta(s.ratePerWeek, unit, 2)} ${unit}/wk` : null} />
        {phase.target_weight_kg !== null && (
          <KV label="Phase target" value={`${fmtWeight(phase.target_weight_kg, unit)} ${unit}`} />
        )}
      </dl>
      {phase.notes && (
        <p className="callout" style={{ marginTop: 12 }}>
          {phase.notes}
        </p>
      )}
      <div className="btn-row" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onEdit}>
          Edit
        </button>
        {onEnd && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={onEnd}>
            End phase
          </button>
        )}
        <button type="button" className="btn btn--danger btn--sm" onClick={onDelete}>
          Delete
        </button>
      </div>
    </section>
  );
}

/** Formats a weight change with unit; helper used across screens. */
export function deltaText(kg: number | null | undefined, unit: WeightUnit, digits = 1): string | null {
  return kg === null || kg === undefined ? null : `${fmtDelta(kg, unit, digits)} ${unit}`;
}

export function weightText(kg: number | null | undefined, unit: WeightUnit): string | null {
  return kg === null || kg === undefined ? null : `${fromKg(kg, unit).toFixed(1)} ${unit}`;
}
