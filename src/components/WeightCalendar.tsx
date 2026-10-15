import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { WeightUnit } from '../lib/types';
import type { DailyPoint } from '../lib/stats';
import { fmtDateKey, fmtWeight } from '../lib/format';
import { toDateKey } from '../lib/dates';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Month grid (weeks start on Monday). Logged days show their daily weight. */
export function WeightCalendar({
  daily,
  unit,
  today,
  onSelectDay,
}: {
  daily: readonly DailyPoint[];
  unit: WeightUnit;
  today: string;
  onSelectDay: (dateKey: string, logged: boolean) => void;
}) {
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const byDate = useMemo(() => new Map(daily.map((p) => [p.date, p])), [daily]);

  const first = new Date(ym.y, ym.m, 1);
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const isCurrentMonth = today.slice(0, 7) === toDateKey(first).slice(0, 7);
  const monthLogged = [...byDate.keys()].filter((k) => k.startsWith(toDateKey(first).slice(0, 7))).length;

  const shift = (n: number) =>
    setYm(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateKey(new Date(ym.y, ym.m, i + 1))),
  ];

  return (
    <section className="card" aria-label="Calendar">
      <div className="cal-head">
        <h3 aria-live="polite">{fmtDateKey(toDateKey(first), 'monthYear')}</h3>
        {!isCurrentMonth && (
          <button type="button" className="btn btn--ghost" onClick={() => setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })}>
            Today
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)} disabled={isCurrentMonth}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="cal-grid" style={{ marginTop: 12 }}>
        {DOW.map((d) => (
          <div key={d} className="cal-dow" aria-hidden="true">
            {d.slice(0, 1)}
          </div>
        ))}
        {cells.map((key, i) => {
          if (!key) return <div key={`b${i}`} aria-hidden="true" />;
          const p = byDate.get(key);
          const future = key > today;
          const cls = ['cal-day', p ? 'cal-day--logged' : '', key === today ? 'cal-day--today' : ''].join(' ');
          const label = p
            ? `${fmtDateKey(key, 'long')}: ${p.count} reading${p.count > 1 ? 's' : ''}, ${fmtWeight(p.weight_kg, unit)} ${unit}${p.count > 1 ? ' average' : ''}`
            : `${fmtDateKey(key, 'long')}: no reading${future ? '' : '. Add one'}`;
          return (
            <button key={key} type="button" className={cls} disabled={future} aria-label={label} onClick={() => onSelectDay(key, !!p)}>
              <span className="cal-num">{Number(key.slice(8))}</span>
              {p && <span className="cal-w">{fmtWeight(p.weight_kg, unit)}</span>}
              {p && p.count > 1 && <span className="cal-count">×{p.count}</span>}
            </button>
          );
        })}
      </div>
      <p className="section-note" style={{ marginTop: 12, fontSize: 12 }}>
        {monthLogged
          ? `${monthLogged} day${monthLogged > 1 ? 's' : ''} logged this month. Tap a day to view or add readings.`
          : 'No readings this month. Tap a past day to add one.'}
      </p>
    </section>
  );
}
