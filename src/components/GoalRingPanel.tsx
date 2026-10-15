import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { WeightUnit } from '../lib/types';
import type { Derived } from '../state/derived';
import { fmtDelta, fmtWeight } from '../lib/format';
import { MAINTAIN_TOLERANCE_KG } from '../lib/goal';

const SIZE = 220;
const STROKE = 14;
const R = SIZE / 2 - STROKE / 2 - 4;
const C = 2 * Math.PI * R;

/**
 * Goal ring: current weight inside a ring showing progress from the goal's
 * starting weight to its target (clamped 0–100%, same rule as the progress
 * bar), with the change since the previous reading and the distance left.
 */
export function GoalRingPanel({ d, unit, onSetGoal }: { d: Derived; unit: WeightUnit; onSetGoal: () => void }) {
  const { latest, goal, progress, prevChange } = d;
  if (!latest) return null;

  const f = progress?.barFraction ?? 0;
  const angle = -Math.PI / 2 + 2 * Math.PI * f;
  const dot = { x: SIZE / 2 + R * Math.cos(angle), y: SIZE / 2 + R * Math.sin(angle) };

  // Change since previous reading, coloured by whether it moves toward the goal.
  let tone = 'ring-change--neutral';
  let Icon = Minus;
  let changeText = 'First reading';
  if (prevChange) {
    const c = prevChange.change;
    const shown = fmtDelta(c, unit);
    changeText = shown;
    if (shown !== (0).toFixed(1)) {
      Icon = c > 0 ? ArrowUpRight : ArrowDownRight;
      const dir = progress?.direction;
      if (dir === 'gain' || dir === 'loss') {
        tone = (dir === 'gain') === c > 0 ? 'ring-change--good' : 'ring-change--away';
      }
    }
  }

  let remainText: React.ReactNode;
  let pctLabel = 'No goal set';
  if (!goal || !progress) {
    remainText = (
      <button type="button" className="link-btn" onClick={onSetGoal}>
        Set a target
      </button>
    );
  } else if (progress.direction === 'maintain') {
    remainText = progress.reached
      ? `Within ±${fmtWeight(MAINTAIN_TOLERANCE_KG, unit)} ${unit} of target`
      : `${fmtWeight(Math.abs(progress.remaining!), unit)} ${unit} ${progress.remaining! > 0 ? 'below' : 'above'} target`;
    pctLabel = progress.reached ? 'On target' : 'Off target';
  } else {
    remainText = progress.reached
      ? 'Target reached'
      : `${fmtWeight(Math.abs(progress.remaining!), unit)} ${unit} left to ${progress.direction === 'gain' ? 'gain' : 'lose'}`;
    pctLabel = `${Math.round(progress.fraction! * 100)}% of goal`;
  }

  return (
    <section className="card ring-panel" aria-label="Goal overview">
      <div className="ring" role="img" aria-label={`${fmtWeight(latest.weight_kg, unit)} ${unit}. ${pctLabel}.`}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--track)" strokeWidth={STROKE} />
          {f > 0.005 && (
            <circle
              className="ring-arc"
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - f)}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          )}
          {f > 0.02 && f < 0.995 && <circle cx={dot.x} cy={dot.y} r={3.5} fill="#fff" fillOpacity={0.9} />}
        </svg>
        <div className="ring-center">
          <div className="ring-weight">
            <strong className="num">{fmtWeight(latest.weight_kg, unit)}</strong>
            <span>{unit}</span>
          </div>
          <p className={`ring-change ${tone}`}>
            <span className="num">{changeText}</span>
            {prevChange && <span className="ring-unit">{unit}</span>}
            <Icon size={16} aria-hidden="true" />
          </p>
          <p className="ring-remain">{remainText}</p>
        </div>
      </div>

      <div className="ring-pills">
        <div className="pill-field">
          <span className="pill-label">Start</span>
          {goal ? (
            <p className="num">
              {fmtWeight(goal.starting_weight_kg, unit)} <span>{unit}</span>
            </p>
          ) : (
            <p className="pill-empty">—</p>
          )}
        </div>
        <div className="pill-field">
          <span className="pill-label">Goal</span>
          {goal ? (
            <p className="num">
              {fmtWeight(goal.target_weight_kg, unit)} <span>{unit}</span>
            </p>
          ) : (
            <p className="pill-empty">—</p>
          )}
        </div>
      </div>
    </section>
  );
}
