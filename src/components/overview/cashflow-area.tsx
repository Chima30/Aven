"use client";

import { useId, useState } from "react";

export interface CashflowPoint {
  label: string;
  income: number;
  expense: number;
  incomeText: string;
  expenseText: string;
}

const W = 720;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 12 };

/** Smooth path through points (monotone-ish cubic). */
function smooth(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

/**
 * Income vs spending area chart with a hover/focus crosshair and tooltip.
 * The same numbers are in a visually hidden table for screen readers.
 */
export function CashflowArea({ data, caption }: { data: CashflowPoint[]; caption: string }) {
  const gid = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense])) * 1.15;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const income = data.map((d, i) => [x(i), y(d.income)] as [number, number]);
  const expense = data.map((d, i) => [x(i), y(d.expense)] as [number, number]);
  const incomePath = smooth(income);
  const expensePath = smooth(expense);
  const base = PAD.top + innerH;
  const area = (path: string) =>
    data.length ? `${path} L${x(data.length - 1)},${base} L${x(0)},${base} Z` : "";
  const a = active !== null ? data[active] : null;

  return (
    <figure className="relative">
      <div className="relative" onMouseLeave={() => setActive(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[220px] w-full overflow-visible"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`inc-${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`exp-${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--ink-muted)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--ink-muted)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + innerH * (1 - t)}
              y2={PAD.top + innerH * (1 - t)}
              stroke="var(--line)"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area(expensePath)} fill={`url(#exp-${gid})`} className="fade-area" />
          <path d={area(incomePath)} fill={`url(#inc-${gid})`} className="fade-area" />
          <path
            d={expensePath}
            fill="none"
            stroke="var(--ink-muted)"
            strokeWidth="1.75"
            vectorEffect="non-scaling-stroke"
            pathLength={2000}
            className="draw-line"
          />
          <path
            d={incomePath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.25"
            vectorEffect="non-scaling-stroke"
            pathLength={2000}
            className="draw-line"
          />
          {a !== null && active !== null ? (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={base}
              stroke="var(--ink-subtle)"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {/* Hit areas: one column per month (mouse and keyboard). */}
        <div className="absolute inset-0 flex" style={{ paddingLeft: 0, paddingRight: 0 }}>
          {data.map((d, i) => (
            <button
              key={d.label}
              type="button"
              tabIndex={0}
              aria-label={`${d.label}: income ${d.incomeText}, spending ${d.expenseText}`}
              className="h-full flex-1 cursor-crosshair rounded-md focus-visible:outline-2"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
          ))}
        </div>
        {a && active !== null ? (
          <div
            className="border-line bg-surface/95 pointer-events-none absolute top-2 z-10 min-w-44 -translate-x-1/2 rounded-xl border px-3 py-2 text-xs shadow-xl backdrop-blur"
            style={{ left: `${(x(active) / W) * 100}%` }}
            role="status"
          >
            <p className="text-ink-muted">{a.label}</p>
            <p className="text-ink mt-1 flex items-center gap-2">
              <span className="bg-accent size-2 rounded-full" /> Income
              <span className="ml-auto font-medium tabular-nums">{a.incomeText}</span>
            </p>
            <p className="text-ink mt-0.5 flex items-center gap-2">
              <span className="bg-ink-muted size-2 rounded-full" /> Spending
              <span className="ml-auto font-medium tabular-nums">{a.expenseText}</span>
            </p>
          </div>
        ) : null}
      </div>
      <div className="text-ink-subtle mt-2 flex justify-between text-xs" aria-hidden="true">
        {data.map((d, i) => (
          <span
            key={d.label}
            className={active === i ? "bg-primary text-primary-fg rounded-full px-2" : "px-2"}
          >
            {d.label}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Income</th>
            <th>Spending</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>{d.incomeText}</td>
              <td>{d.expenseText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
