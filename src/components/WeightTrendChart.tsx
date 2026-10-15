import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { WeightUnit } from '../lib/types';
import type { DailyPoint, TrendPoint } from '../lib/stats';
import { fromKg } from '../lib/units';
import { fmtDateKey } from '../lib/format';
import { keyFromDayNumber } from '../lib/dates';

/**
 * Lightweight SVG weight chart.
 * - x is true calendar time, so gaps in logging are visible as gaps.
 * - The line is broken where consecutive logged days are more than
 *   GAP_BREAK_DAYS apart, so no reading is implied where none exists.
 * - Curves use monotone cubic interpolation, which never overshoots the data
 *   (no invented highs/lows between readings).
 * - The area fill is decorative only.
 */

const GAP_BREAK_DAYS = 7;
const PAD = { l: 36, r: 10, t: 12, b: 24 };

interface Props {
  points: readonly DailyPoint[];
  trend?: readonly TrendPoint[];
  startDay: number;
  endDay: number;
  unit: WeightUnit;
  height?: number;
  /** 'simple' = single line (dashboard); 'detailed' = daily dots + rolling average line. */
  variant?: 'simple' | 'detailed';
  latestDay: number | null;
  emptyText?: string;
}

interface Pt {
  x: number;
  y: number;
}

function monotonePath(p: Pt[]): string {
  const n = p.length;
  if (n === 0) return '';
  if (n === 1) return `M${p[0].x},${p[0].y}`;
  if (n === 2) return `M${p[0].x},${p[0].y}L${p[1].x},${p[1].y}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1].x - p[i].x;
    m[i] = (p[i + 1].y - p[i].y) / dx[i];
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }
  let d = `M${p[0].x},${p[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${p[i].x + h},${p[i].y + t[i] * h} ${p[i + 1].x - h},${p[i + 1].y - t[i + 1] * h} ${p[i + 1].x},${p[i + 1].y}`;
  }
  return d;
}

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];

function niceScale(lo: number, hi: number, target = 3) {
  if (hi - lo < 1) {
    const c = (hi + lo) / 2;
    lo = c - 0.5;
    hi = c + 0.5;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const raw = (hi - lo) / target;
  const step = STEPS.find((s) => s >= raw) ?? 100;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { min, max, ticks, step };
}

function splitSegments<T extends { day: number }>(pts: readonly T[]): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  for (const p of pts) {
    if (cur.length && p.day - cur[cur.length - 1].day > GAP_BREAK_DAYS) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

export function WeightTrendChart({
  points,
  trend = [],
  startDay,
  endDay,
  unit,
  height = 180,
  variant = 'simple',
  latestDay,
  emptyText = 'No measurements in this period',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const gradId = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Selection refers to an index into `points`; reset when data changes.
  useLayoutEffect(() => setSel(null), [points, startDay, endDay]);

  const geo = useMemo(() => {
    const innerW = Math.max(0, width - PAD.l - PAD.r);
    const innerH = height - PAD.t - PAD.b;
    const vals = [...points.map((p) => fromKg(p.weight_kg, unit)), ...trend.map((p) => fromKg(p.value, unit))];
    const scale = vals.length ? niceScale(Math.min(...vals), Math.max(...vals)) : null;
    const span = endDay - startDay;
    const x = (day: number) => PAD.l + (span <= 0 ? innerW / 2 : ((day - startDay) / span) * innerW);
    const y = (v: number) => (scale ? PAD.t + (1 - (v - scale.min) / (scale.max - scale.min)) * innerH : 0);
    return { innerW, innerH, scale, x, y, span };
  }, [width, height, points, trend, unit, startDay, endDay]);

  const xTicks = useMemo(() => {
    if (geo.span <= 0) return [startDay];
    const count = width < 360 ? 3 : 4;
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(Math.round(startDay + (geo.span * i) / (count - 1)));
    return [...new Set(out)];
  }, [geo.span, startDay, width]);

  const dateFmt = (day: number) => {
    const key = keyFromDayNumber(day);
    return geo.span > 200 ? fmtDateKey(key, 'monthShortYear') : fmtDateKey(key, 'short');
  };

  const { x, y, scale } = geo;
  const lineSegs = splitSegments(points);
  const trendSegs = splitSegments(trend);
  const bottom = height - PAD.b;

  const toPts = (seg: readonly DailyPoint[]) => seg.map((p) => ({ x: x(p.day), y: y(fromKg(p.weight_kg, unit)) }));
  const toTrendPts = (seg: readonly TrendPoint[]) => seg.map((p) => ({ x: x(p.day), y: y(fromKg(p.value, unit)) }));
  const area = (pts: Pt[]) =>
    pts.length > 1 ? `${monotonePath(pts)}L${pts[pts.length - 1].x},${bottom}L${pts[0].x},${bottom}Z` : '';

  const pick = (clientX: number, rect: DOMRect) => {
    if (!points.length) return;
    const px = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.day) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setSel(best);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => pick(e.clientX, e.currentTarget.getBoundingClientRect());
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' || e.buttons) pick(e.clientX, e.currentTarget.getBoundingClientRect());
  };
  const onPointerLeave = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse') setSel(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!points.length) return;
    const last = points.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = sel === null ? last : Math.max(0, sel - 1);
    else if (e.key === 'ArrowRight') next = sel === null ? last : Math.min(last, sel + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Escape') {
      setSel(null);
      return;
    } else return;
    e.preventDefault();
    setSel(next);
  };

  const selected = sel !== null ? points[sel] : null;
  const selTrend = selected ? trend.find((t) => t.day === selected.day) : undefined;
  const latestPoint = latestDay !== null ? points.find((p) => p.day === latestDay) : undefined;
  const isDetailed = variant === 'detailed';

  const summary = points.length
    ? `Weight chart with ${points.length} logged day${points.length === 1 ? '' : 's'}. Use left and right arrow keys to inspect values.`
    : emptyText;

  return (
    <div
      className="chart"
      ref={ref}
      style={{ height }}
      tabIndex={points.length ? 0 : -1}
      role="group"
      aria-label={summary}
      onKeyDown={onKeyDown}
      onBlur={() => setSel(null)}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* horizontal grid + y labels */}
          {(scale?.ticks ?? []).map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
              <text className="chart-axis" x={PAD.l - 8} y={y(v)} dy="0.35em" textAnchor="end">
                {scale && scale.step < 1 ? v.toFixed(1) : v.toFixed(0)}
              </text>
            </g>
          ))}
          {!scale && (
            <line x1={PAD.l} x2={width - PAD.r} y1={bottom} y2={bottom} stroke="var(--grid)" strokeWidth={1} />
          )}

          {/* x labels */}
          {xTicks.map((d, i) => (
            <text
              key={d}
              className="chart-axis"
              x={x(d)}
              y={height - 6}
              textAnchor={xTicks.length === 1 ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            >
              {dateFmt(d)}
            </text>
          ))}

          {/* decorative area */}
          {(isDetailed ? trendSegs.map(toTrendPts) : lineSegs.map(toPts)).map((pts, i) => (
            <path key={`a${i}`} d={area(pts)} fill={`url(#${gradId})`} />
          ))}

          {/* daily line */}
          {lineSegs.map((seg, i) => {
            const pts = toPts(seg);
            return pts.length > 1 ? (
              <path
                key={`l${i}`}
                d={monotonePath(pts)}
                fill="none"
                stroke="var(--accent)"
                strokeOpacity={isDetailed ? 0.35 : 1}
                strokeWidth={isDetailed ? 1.25 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null;
          })}

          {/* dots: every day in detailed view, isolated days in simple view */}
          {points.map((p, i) => {
            const isolated = lineSegs.some((s) => s.length === 1 && s[0].day === p.day);
            if (!isDetailed && !isolated) return null;
            return (
              <circle
                key={`d${i}`}
                cx={x(p.day)}
                cy={y(fromKg(p.weight_kg, unit))}
                r={isDetailed ? 2.5 : 3}
                fill="var(--accent)"
                fillOpacity={isDetailed ? 0.55 : 1}
              />
            );
          })}

          {/* rolling average */}
          {isDetailed &&
            trendSegs.map((seg, i) => {
              const pts = toTrendPts(seg);
              return pts.length > 1 ? (
                <path
                  key={`t${i}`}
                  d={monotonePath(pts)}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null;
            })}

          {/* latest measurement */}
          {latestPoint && (
            <circle
              cx={x(latestPoint.day)}
              cy={y(fromKg(latestPoint.weight_kg, unit))}
              r={4.5}
              fill="var(--accent)"
              stroke="var(--bg)"
              strokeWidth={2}
            />
          )}

          {/* selection */}
          {selected && (
            <g>
              <line
                x1={x(selected.day)}
                x2={x(selected.day)}
                y1={PAD.t}
                y2={bottom}
                stroke="var(--text-3)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={x(selected.day)}
                cy={y(fromKg(selected.weight_kg, unit))}
                r={5}
                fill="var(--bg)"
                stroke="var(--accent)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
      )}

      {selected && (
        <div
          className="chart-tip"
          style={{ left: Math.min(Math.max(x(selected.day), 70), width - 70), top: y(fromKg(selected.weight_kg, unit)) - 10 }}
          role="status"
        >
          <div className="muted" style={{ color: 'inherit', opacity: 0.75 }}>
            {fmtDateKey(selected.date, 'weekday')}
          </div>
          <strong className="num">
            {fromKg(selected.weight_kg, unit).toFixed(1)} {unit}
          </strong>
          {selected.count > 1 && <span style={{ opacity: 0.75 }}> · avg of {selected.count}</span>}
          {isDetailed && selTrend && (
            <div style={{ opacity: 0.75 }}>
              7-day avg {fromKg(selTrend.value, unit).toFixed(1)} {unit}
            </div>
          )}
        </div>
      )}
      {!points.length && <div className="chart-empty">{emptyText}</div>}
    </div>
  );
}
