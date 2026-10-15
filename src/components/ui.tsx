import { useEffect, useId, useRef, type ReactNode, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import type { RangeKey } from '../lib/ranges';
import { RANGES } from '../lib/ranges';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Bottom sheet on phones, centred dialog on wide screens. */
export function Sheet({
  title,
  onClose,
  children,
  small = false,
  role = 'dialog',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  small?: boolean;
  role?: 'dialog' | 'alertdialog';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el;
    first?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`sheet${small ? ' sheet--small' : ''}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="sheet-head">
          <h2 className="sheet-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="icon-btn icon-btn--plain" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TimeRangeSelector({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return (
    <label className="select-wrap">
      <span className="sr-only">Time range</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value as RangeKey)}>
        {RANGES.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}

export function StatCard({
  label,
  value,
  unit,
  sub,
  empty,
}: {
  label: string;
  value: string | null;
  unit?: string;
  sub?: ReactNode;
  empty?: string;
}) {
  return (
    <div className="card stat">
      <p className="label">{label}</p>
      {value !== null ? (
        <div className="stat-value">
          <strong className="num">{value}</strong>
          {unit && <span>{unit}</span>}
        </div>
      ) : (
        <div className="stat-value">
          <span className="stat-empty">{empty ?? 'Not enough data'}</span>
        </div>
      )}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function ProgressBar({ fraction, label, className }: { fraction: number; label: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div
      className={`track${className ? ` ${className}` : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field-error" id={`${htmlFor}-err`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

/** Key/value item for detail grids; renders "Not enough data" for null. */
export function KV({ label, value, na = 'Not enough data' }: { label: string; value: ReactNode | null; na?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      {value === null ? <dd className="na">{na}</dd> : <dd>{value}</dd>}
    </div>
  );
}
