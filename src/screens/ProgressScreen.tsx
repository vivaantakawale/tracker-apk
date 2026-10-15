import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '../state/store';
import { useDerived } from '../state/derived';
import { useUI, type ProgressTab } from '../state/ui';
import { useAppActions } from '../state/actions';
import { AppHeader } from './HomeScreen';
import { BmiCard, deltaText, ForecastCard, MilestoneList, PhaseCard, TrendSection, weightText } from '../components/cards';
import { WeightHistoryList } from '../components/WeightHistoryList';
import { WeightCalendar } from '../components/WeightCalendar';
import { EmptyState, KV, ProgressBar, Segmented } from '../components/ui';
import { fmtDateKey, fmtDateTime, fmtDelta, fmtWeight } from '../lib/format';
import { isPhaseActive, sortPhases } from '../lib/phases';
import { MAINTAIN_TOLERANCE_KG } from '../lib/goal';
import { entryDateKey } from '../lib/dates';

const TABS: { value: ProgressTab; label: string }[] = [
  { value: 'trend', label: 'Trends' },
  { value: 'history', label: 'History' },
  { value: 'goal', label: 'Goal' },
  { value: 'phases', label: 'Phases' },
];

export function ProgressScreen() {
  const ui = useUI();
  return (
    <main className="screen">
      <AppHeader title="Progress" />
      <div className="tabs">
        <div className="segmented" role="tablist" aria-label="Progress sections">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              id={`tab-${t.value}`}
              aria-selected={ui.progressTab === t.value}
              aria-controls={`panel-${t.value}`}
              onClick={() => ui.setProgressTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" id={`panel-${ui.progressTab}`} aria-labelledby={`tab-${ui.progressTab}`} className="stack" style={{ gap: 24 }}>
        {ui.progressTab === 'trend' && <TrendTab />}
        {ui.progressTab === 'history' && <HistoryTab />}
        {ui.progressTab === 'goal' && <GoalTab />}
        {ui.progressTab === 'phases' && <PhasesTab />}
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ trends

function TrendTab() {
  const { data } = useStore();
  const d = useDerived();
  const ui = useUI();
  const unit = data.settings.preferred_weight_unit;
  const w = (kg: number | null | undefined) => weightText(kg, unit);
  const dl = (kg: number | null | undefined, digits = 1) => deltaText(kg, unit, digits);
  const baselineLabel = d.goal ? 'Since goal start' : 'Since first entry';
  const baselineKg = d.goal ? d.goal.starting_weight_kg : d.sorted[0]?.weight_kg;

  return (
    <>
      <TrendSection d={d} unit={unit} title="Weight history" variant="detailed" height={220} />

      {!d.latest ? (
        <EmptyState title="No statistics yet">Log a few measurements to see your trends here.</EmptyState>
      ) : (
        <>
          <section className="card" aria-label="Recent changes">
            <p className="label" style={{ marginBottom: 12 }}>Changes</p>
            <dl className="kv">
              <KV label="Since previous entry" value={dl(d.prevChange?.change)} />
              <KV label="Last 7 days" value={dl(d.change7?.change)} />
              <KV label="Last 30 days" value={dl(d.change30?.change)} />
              <KV label="Rate (28-day trend)" value={d.ratePerWeek !== null ? `${dl(d.ratePerWeek, 2)}/wk` : null} />
              <KV label={baselineLabel} value={baselineKg !== undefined ? dl(d.latest.weight_kg - baselineKg) : null} />
            </dl>
          </section>

          <section className="card" aria-label="Averages">
            <p className="label" style={{ marginBottom: 12 }}>Averages</p>
            <dl className="kv">
              <KV label="This week (7-day avg)" value={w(d.weekly.current?.avg)} />
              <KV label="Previous week" value={w(d.weekly.previous?.avg)} />
              <KV label="Week-over-week" value={dl(d.weekly.diff)} />
              <KV label="Rolling 7-day avg (latest)" value={w(d.rolling[d.rolling.length - 1]?.value)} />
            </dl>
          </section>

          <section className="card" aria-label="Range">
            <p className="label" style={{ marginBottom: 12 }}>All-time range</p>
            <dl className="kv">
              <KV label="Lowest" value={d.extremes && w(d.extremes.min.weight_kg)} />
              <KV label="Highest" value={d.extremes && w(d.extremes.max.weight_kg)} />
              <KV label="Lowest on" value={d.extremes ? fmtDateKey(entryDateKey(d.extremes.min.measured_at)) : null} />
              <KV label="Highest on" value={d.extremes ? fmtDateKey(entryDateKey(d.extremes.max.measured_at)) : null} />
            </dl>
            <p className="field-hint" style={{ marginTop: 12 }}>
              {d.sorted.length} readings on {d.daily.length} days. Days with several readings use their average in charts and averages.
            </p>
          </section>
        </>
      )}

      <BmiCard
        bmi={d.bmi}
        hasHeight={data.settings.height_cm !== null}
        hasWeight={!!d.latest}
        onAddHeight={() => ui.open({ kind: 'height' })}
        detailed
      />
    </>
  );
}

// ----------------------------------------------------------------- history

function HistoryTab() {
  const { data } = useStore();
  const d = useDerived();
  const ui = useUI();
  const { deleteEntry } = useAppActions();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const unit = data.settings.preferred_weight_unit;
  return (
    <>
      <div className="row-between">
        <div style={{ width: 180 }}>
          <Segmented
            label="History view"
            options={[
              { value: 'list', label: 'List' },
              { value: 'calendar', label: 'Calendar' },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => ui.open({ kind: 'entry-form' })}>
          <Plus size={16} /> Add
        </button>
      </div>
      {view === 'list' ? (
        <WeightHistoryList
          entries={data.entries}
          unit={unit}
          onOpen={(e) => ui.open({ kind: 'entry-details', entryId: e.id })}
          onEdit={(e) => ui.open({ kind: 'entry-form', entryId: e.id })}
          onDelete={(e) => void deleteEntry(e)}
          onAdd={() => ui.open({ kind: 'entry-form' })}
        />
      ) : (
        <WeightCalendar
          daily={d.daily}
          unit={unit}
          today={d.today}
          onSelectDay={(key, logged) => ui.open(logged ? { kind: 'day', dateKey: key } : { kind: 'entry-form', dateKey: key })}
        />
      )}
      <button type="button" className="btn btn--ghost" style={{ alignSelf: 'center' }} onClick={() => ui.setTab('home')}>
        Back to overview
      </button>
    </>
  );
}

// -------------------------------------------------------------------- goal

function GoalTab() {
  const { data, actions } = useStore();
  const d = useDerived();
  const ui = useUI();
  const unit = data.settings.preferred_weight_unit;
  const { goal, progress } = d;

  if (!goal || !progress) {
    const completed = data.goals.filter((g) => g.status !== 'active');
    return (
      <>
        <EmptyState
          title="No active goal"
          action={
            <button type="button" className="btn btn--primary" onClick={() => ui.open({ kind: 'goal-form' })}>
              Set a goal
            </button>
          }
        >
          Set a target weight to track progress, milestones and a forecast. Gain, loss and maintenance goals are supported.
        </EmptyState>
        {completed.length > 0 && <p className="section-note" style={{ textAlign: 'center' }}>Past goals can be reactivated in Settings.</p>}
        <section className="section">
          <h2 className="section-title">Milestones</h2>
          <div className="card">
            <MilestoneList milestones={d.milestones} entries={d.sorted} />
          </div>
        </section>
      </>
    );
  }

  const status = progress.reached ? 'Target reached' : progress.current === null ? 'Waiting for a reading' : 'In progress';
  const pct = progress.fraction !== null ? `${Math.round(progress.fraction * 100)}%` : progress.reached ? 'On target' : 'Off target';

  return (
    <>
      <section className="card" aria-label="Goal details">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <p className="label">
              {progress.direction === 'gain' ? 'Gain goal' : progress.direction === 'loss' ? 'Loss goal' : 'Maintenance goal'}
            </p>
            <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{goal.description || `Reach ${fmtWeight(goal.target_weight_kg, unit)} ${unit}`}</p>
          </div>
          <span className={`chip${progress.reached ? ' chip--accent' : ''}`}>{status}</span>
        </div>
        <div className="progress-head" style={{ marginTop: 16, marginBottom: 8 }}>
          <span className="label">Progress</span>
          <span className="progress-pct num">{pct}</span>
        </div>
        <ProgressBar fraction={progress.barFraction} label="Goal progress" />
        <hr className="divider" />
        <dl className="kv">
          <KV label="Starting weight" value={weightText(goal.starting_weight_kg, unit)} />
          <KV label="Latest weight" value={weightText(progress.current, unit)} na="No readings" />
          <KV label="Target weight" value={weightText(goal.target_weight_kg, unit)} />
          <KV label="Change so far" value={deltaText(progress.achieved, unit)} na="—" />
          <KV
            label={progress.direction === 'maintain' ? 'Difference from target' : 'Remaining'}
            value={
              progress.remaining === null
                ? null
                : progress.direction === 'maintain'
                  ? deltaText(progress.remaining, unit)
                  : progress.reached
                    ? 'Reached'
                    : `${fmtWeight(Math.abs(progress.remaining), unit)} ${unit} to ${progress.direction === 'gain' ? 'gain' : 'lose'}`
            }
            na="—"
          />
          <KV label="Started" value={fmtDateKey(goal.start_date)} />
          <KV label="Target date" value={goal.target_date ? fmtDateKey(goal.target_date) : null} na="Not set" />
          {progress.direction === 'maintain' && <KV label="Tolerance" value={`±${fmtWeight(MAINTAIN_TOLERANCE_KG, unit)} ${unit}`} />}
        </dl>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => ui.open({ kind: 'goal-form', goalId: goal.id })}>
            Edit goal
          </button>
          {progress.reached && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={async () => {
                await actions.setGoalStatus(goal.id, 'completed');
                ui.toast('Goal marked as completed');
              }}
            >
              Mark completed
            </button>
          )}
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => ui.open({ kind: 'goal-form' })}>
            New goal
          </button>
        </div>
        {progress.reached && (
          <p className="field-hint" style={{ marginTop: 10 }}>
            Reaching the target doesn't close the goal automatically. Mark it completed when you're done, or keep it active.
          </p>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Milestones</h2>
        <div className="card">
          <MilestoneList milestones={d.milestones} entries={d.sorted} />
        </div>
      </section>

      <ForecastCard d={d} unit={unit} />
      {progress.current !== null && d.latest && (
        <p className="field-hint" style={{ textAlign: 'center' }}>
          Progress uses your latest reading ({fmtDelta(d.latest.weight_kg - goal.starting_weight_kg, unit)} {unit} since start, {fmtDateTime(d.latest.measured_at)}).
        </p>
      )}
    </>
  );
}

// ------------------------------------------------------------------ phases

function PhasesTab() {
  const { data } = useStore();
  const d = useDerived();
  const ui = useUI();
  const { endPhase, deletePhase } = useAppActions();
  const unit = data.settings.preferred_weight_unit;
  const phases = sortPhases(data.phases);
  const active = phases.filter((p) => isPhaseActive(p, d.today));
  const others = phases.filter((p) => !isPhaseActive(p, d.today));

  const card = (p: (typeof phases)[number]) => (
    <PhaseCard
      key={p.id}
      phase={p}
      entries={d.sorted}
      today={d.today}
      unit={unit}
      active={isPhaseActive(p, d.today)}
      onEdit={() => ui.open({ kind: 'phase-form', phaseId: p.id })}
      onEnd={isPhaseActive(p, d.today) && (p.end_date === null || p.end_date > d.today) ? () => void endPhase(p) : undefined}
      onDelete={() => void deletePhase(p)}
    />
  );

  return (
    <>
      <button type="button" className="btn btn--primary btn--block" onClick={() => ui.open({ kind: 'phase-form' })}>
        <Plus size={18} /> {active.length ? 'Switch to a new phase' : 'Start a phase'}
      </button>
      {!phases.length ? (
        <EmptyState title="No phases yet">
          Track periods such as a bulk, cut or maintenance. Each phase shows the change and rate within its own dates.
        </EmptyState>
      ) : (
        <>
          {active.length > 0 && (
            <section className="section">
              <h2 className="section-title">Current phase</h2>
              {active.map(card)}
            </section>
          )}
          {others.length > 0 && (
            <section className="section">
              <h2 className="section-title">Phase history</h2>
              {others.map(card)}
            </section>
          )}
        </>
      )}
    </>
  );
}
