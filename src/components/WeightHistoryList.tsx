import { useMemo, useState } from 'react';
import { Pencil, StickyNote, Trash2 } from 'lucide-react';
import type { WeightEntry, WeightUnit } from '../lib/types';
import { fmtDateKey, fmtDelta, fmtTime, fmtWeight } from '../lib/format';
import { entryDateKey } from '../lib/dates';
import { EmptyState } from './ui';

const PAGE = 60;

/**
 * All readings, newest first, grouped by month. "Change" is relative to the
 * chronologically previous reading.
 */
export function WeightHistoryList({
  entries,
  unit,
  onOpen,
  onEdit,
  onDelete,
  onAdd,
}: {
  entries: readonly WeightEntry[];
  unit: WeightUnit;
  onOpen: (e: WeightEntry) => void;
  onEdit: (e: WeightEntry) => void;
  onDelete: (e: WeightEntry) => void;
  onAdd: () => void;
}) {
  const [limit, setLimit] = useState(PAGE);

  const groups = useMemo(() => {
    const rows = entries
      .map((e, i) => ({ e, prev: i > 0 ? entries[i - 1] : null, key: entryDateKey(e.measured_at) }))
      .reverse()
      .slice(0, limit);
    const out: { month: string; rows: typeof rows }[] = [];
    for (const r of rows) {
      const month = r.key.slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.month === month) last.rows.push(r);
      else out.push({ month, rows: [r] });
    }
    return out;
  }, [entries, limit]);

  if (!entries.length) {
    return (
      <EmptyState
        title="No measurements yet"
        action={
          <button type="button" className="btn btn--primary" onClick={onAdd}>
            + Log weight
          </button>
        }
      >
        Your history will be listed here, newest first.
      </EmptyState>
    );
  }

  return (
    <div className="stack" style={{ gap: 4 }}>
      {groups.map((g) => (
        <div key={g.month}>
          <p className="group-head">{fmtDateKey(`${g.month}-01`, 'monthYear')}</p>
          <div className="list">
            {g.rows.map(({ e, prev, key }) => {
              const delta = prev ? fmtDelta(e.weight_kg - prev.weight_kg, unit) : null;
              return (
                <div className="list-item" key={e.id}>
                  <button type="button" className="list-row" onClick={() => onOpen(e)}>
                    <div className="list-main">
                      <p className="list-title">{fmtDateKey(key, 'weekday')}</p>
                      <p className="list-sub">
                        {fmtTime(e.measured_at)}
                        {e.notes && (
                          <>
                            {' · '}
                            <StickyNote size={11} aria-label="Has note" style={{ verticalAlign: '-1px' }} />{' '}
                            {e.notes}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="list-value">
                      <strong className="num">
                        {fmtWeight(e.weight_kg, unit)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{unit}</span>
                      </strong>
                      <p className="list-sub num">{delta === null ? 'First entry' : `${delta} ${unit}`}</p>
                    </div>
                  </button>
                  <div className="list-actions">
                    <button type="button" className="icon-btn icon-btn--plain" aria-label={`Edit entry from ${fmtDateKey(key)}`} onClick={() => onEdit(e)}>
                      <Pencil size={16} />
                    </button>
                    <button type="button" className="icon-btn icon-btn--plain" aria-label={`Delete entry from ${fmtDateKey(key)}`} onClick={() => onDelete(e)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {entries.length > limit && (
        <button type="button" className="btn btn--secondary btn--block" style={{ marginTop: 12 }} onClick={() => setLimit((l) => l + PAGE)}>
          Show older entries ({entries.length - limit} more)
        </button>
      )}
    </div>
  );
}
