import { Activity, ChevronRight, Flag, Layers } from 'lucide-react';
import { useStore } from '../state/store';
import { useDerived } from '../state/derived';
import { useUI } from '../state/ui';
import { StatCard } from '../components/ui';
import { BmiCard, CurrentWeightCard, GoalProgressBlock, TrendSection } from '../components/cards';
import { GoalRingPanel } from '../components/GoalRingPanel';
import { fmtWeight } from '../lib/format';
import { nextMilestone } from '../lib/milestones';
import { phaseTypeLabel } from '../lib/phases';
import { diffDays } from '../lib/dates';

export function AppHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="header">
      <div>
        <p className="eyebrow">Weight Tracker</p>
        <h1 className="title">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function HomeScreen() {
  const { data } = useStore();
  const d = useDerived();
  const ui = useUI();
  const unit = data.settings.preferred_weight_unit;
  const next = nextMilestone(d.milestones);

  const goTo = (tab: 'trend' | 'goal' | 'phases') => {
    ui.setProgressTab(tab);
    ui.setTab('progress');
  };

  return (
    <main className="screen">
      <AppHeader
        title="Overview"
        action={
          <button type="button" className="icon-btn" aria-label="View progress and trends" onClick={() => goTo('trend')}>
            <Activity size={18} />
          </button>
        }
      />

      <CurrentWeightCard d={d} unit={unit} />

      <TrendSection d={d} unit={unit} height={168} />

      <div className="stat-grid">
        <StatCard
          label="7-day average"
          value={d.avg7 ? fmtWeight(d.avg7.avg, unit) : null}
          unit={unit}
          sub={d.avg7 ? `${d.avg7.days} of 7 days logged` : 'No readings in the last 7 days'}
          empty="Not enough data"
        />
        <StatCard
          label="Target weight"
          value={d.goal ? fmtWeight(d.goal.target_weight_kg, unit) : null}
          unit={unit}
          empty="Not set"
          sub={
            d.goal ? (
              d.progress?.direction === 'gain' ? 'Gain goal' : d.progress?.direction === 'loss' ? 'Loss goal' : 'Maintenance'
            ) : (
              <button type="button" className="link-btn" style={{ fontSize: 12 }} onClick={() => ui.open({ kind: 'goal-form' })}>
                Set a target
              </button>
            )
          }
        />
      </div>

      <GoalProgressBlock d={d} unit={unit} onSetGoal={() => ui.open({ kind: 'goal-form' })} />

      <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => ui.open({ kind: 'entry-form' })}>
        + Log weight
      </button>

      {/* Secondary insights — below the primary hierarchy */}
      <GoalRingPanel d={d} unit={unit} onSetGoal={() => ui.open({ kind: 'goal-form' })} />

      {(data.settings.height_cm !== null || d.latest) && (
        <BmiCard
          bmi={d.bmi}
          hasHeight={data.settings.height_cm !== null}
          hasWeight={!!d.latest}
          onAddHeight={() => ui.open({ kind: 'height' })}
          onOpen={() => goTo('trend')}
        />
      )}

      {(next && d.latest && d.goal) || d.phase ? (
        <div className="list">
          {next && d.latest && d.goal && (
            <button type="button" className="list-row" onClick={() => goTo('goal')}>
              <Flag size={18} className="muted" aria-hidden="true" />
              <div className="list-main">
                <p className="list-sub">Next milestone</p>
                <p className="list-title">{next.label}</p>
              </div>
              <span className="muted num" style={{ fontSize: 13 }}>{Math.round(next.progress * 100)}%</span>
              <ChevronRight size={18} className="chevron" />
            </button>
          )}
          {d.phase && (
            <button type="button" className="list-row" onClick={() => goTo('phases')}>
              <Layers size={18} className="muted" aria-hidden="true" />
              <div className="list-main">
                <p className="list-sub">{phaseTypeLabel(d.phase.type)} phase</p>
                <p className="list-title">{d.phase.name}</p>
              </div>
              <span className="muted" style={{ fontSize: 13 }}>Day {diffDays(d.phase.start_date, d.today) + 1}</span>
              <ChevronRight size={18} className="chevron" />
            </button>
          )}
        </div>
      ) : null}
    </main>
  );
}
