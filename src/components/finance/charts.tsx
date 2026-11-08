import { formatMinor, percentOf } from "@/lib/finance/format";

/** Categorical chart colours in fixed order (validated for both themes in globals.css). */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];
export const OTHER_COLOR = "var(--ink-subtle)";

/**
 * Lightweight, dependency-free charts. Every bar also has a text equivalent
 * (a visually hidden table) for screen readers.
 */

export function CashflowChart({
  data,
  currency,
  locale,
}: {
  data: Array<{ month: string; incomeMinor: string; expenseMinor: string }>;
  currency: string;
  locale: string;
}) {
  const max = data.reduce((m, d) => {
    const i = BigInt(d.incomeMinor);
    const e = BigInt(d.expenseMinor);
    return i > m ? i : e > m ? e : m;
  }, 0n);
  const monthLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const height = 140;

  return (
    <figure>
      <div
        className="border-line flex h-[168px] items-end gap-2 border-b sm:gap-3"
        aria-hidden="true"
      >
        {data.map((d, idx) => {
          const ih =
            max > 0n ? Math.max(2, (percentOf(BigInt(d.incomeMinor), max) / 100) * height) : 2;
          const eh =
            max > 0n ? Math.max(2, (percentOf(BigInt(d.expenseMinor), max) / 100) * height) : 2;
          return (
            <div key={d.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="flex h-[140px] w-full items-end justify-center gap-[2px]">
                <div
                  className="bar-grow-y w-1/2 max-w-4 rounded-t-[4px] bg-[linear-gradient(180deg,var(--accent),color-mix(in_srgb,var(--accent)_55%,transparent))]"
                  style={{ height: ih, "--i": idx } as React.CSSProperties}
                />
                <div
                  className="bar-grow-y bg-ink-subtle/55 w-1/2 max-w-4 rounded-t-[4px]"
                  style={{ height: eh, "--i": idx } as React.CSSProperties}
                />
              </div>
              <span className="text-ink-subtle text-[0.6875rem]">{monthLabel(d.month)}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="text-ink-muted mt-3 flex gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-accent size-2.5 rounded-sm" /> Income
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-ink-subtle/55 size-2.5 rounded-sm" /> Expenses
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>Monthly income and expenses in {currency}</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Income</th>
            <th>Expenses</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <td>{monthLabel(d.month)}</td>
              <td>{formatMinor(d.incomeMinor, currency, locale)}</td>
              <td>{formatMinor(d.expenseMinor, currency, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function CategoryBreakdown({
  rows,
  currency,
  locale,
}: {
  rows: Array<{ name: string; minor: string }>;
  currency: string;
  locale: string;
}) {
  const total = rows.reduce((t, r) => t + BigInt(r.minor), 0n);
  const top = rows.slice(0, 6);
  const rest = rows.slice(6).reduce((t, r) => t + BigInt(r.minor), 0n);
  const shown = rest > 0n ? [...top, { name: "Everything else", minor: rest.toString() }] : top;
  return (
    <ul className="flex flex-col gap-3">
      {shown.map((r, i) => {
        const pct = percentOf(BigInt(r.minor), total);
        const color = i < 6 ? CHART_COLORS[i]! : OTHER_COLOR;
        return (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <span className="truncate">{r.name}</span>
              </span>
              <span className="text-ink-muted shrink-0">
                <span className="type-figure text-ink">
                  {formatMinor(r.minor, currency, locale)}
                </span>{" "}
                · {Math.round(pct)}%
              </span>
            </div>
            <div
              className="bg-surface-muted mt-1.5 h-1.5 overflow-hidden rounded-full"
              aria-hidden="true"
            >
              <div
                className="bar-grow h-full rounded-full"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Spending share by category as a ring, with the total in the centre and a
 * labelled legend (so identity never relies on colour alone).
 */
export function SpendingDonut({
  rows,
  currency,
  locale,
  centerLabel = "Spent",
  maxSlices = 5,
}: {
  rows: Array<{ name: string; minor: string }>;
  currency: string;
  locale: string;
  centerLabel?: string;
  maxSlices?: number;
}) {
  const total = rows.reduce((t, r) => t + BigInt(r.minor), 0n);
  const top = rows.slice(0, maxSlices);
  const rest = rows.slice(maxSlices).reduce((t, r) => t + BigInt(r.minor), 0n);
  const shown = rest > 0n ? [...top, { name: "Everything else", minor: rest.toString() }] : top;
  const R = 52;
  const C = 2 * Math.PI * R;
  const gap = shown.length > 1 ? 2.5 : 0;
  const lengths = shown.map((r) => (percentOf(BigInt(r.minor), total) / 100) * C);
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((t, l) => t + l, 0));
  const slices = shown.map((r, i) => {
    const len = lengths[i]!;
    const visible = Math.max(0, len - gap);
    return {
      ...r,
      pct: percentOf(BigInt(r.minor), total),
      color: i < maxSlices && i < CHART_COLORS.length ? CHART_COLORS[i]! : OTHER_COLOR,
      dash: `${visible} ${C - visible}`,
      offset: -starts[i]!,
    };
  });
  return (
    <figure className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative size-44 shrink-0">
        <svg viewBox="0 0 128 128" className="size-full -rotate-90" aria-hidden="true">
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke="var(--surface-muted)"
            strokeWidth="12"
          />
          {total > 0n
            ? slices.map((s) => (
                <circle
                  key={s.name}
                  cx="64"
                  cy="64"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="12"
                  strokeDasharray={s.dash}
                  strokeDashoffset={s.offset}
                  className="transition-[stroke-width] duration-200 hover:[stroke-width:14]"
                >
                  <title>{`${s.name}: ${formatMinor(s.minor, currency, locale)} (${Math.round(s.pct)}%)`}</title>
                </circle>
              ))
            : null}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-ink-subtle text-xs">{centerLabel}</span>
          <span className="type-figure text-ink mt-0.5 max-w-32 text-[0.8125rem] leading-tight break-all">
            {formatMinor(total.toString(), currency, locale)}
          </span>
        </div>
      </div>
      <figcaption className="w-full min-w-0">
        <ul className="flex flex-col gap-2">
          {slices.map((s) => (
            <li key={s.name} className="flex items-center gap-2.5 text-sm">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: s.color }}
              />
              <span className="text-ink min-w-0 flex-1 truncate">{s.name}</span>
              <span className="type-figure text-ink-muted shrink-0 text-xs tabular-nums">
                {Math.round(s.pct)}%
              </span>
              <span className="sr-only">{formatMinor(s.minor, currency, locale)}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/** Small circular progress (savings goals). Decorative; pair it with text. */
export function ProgressRing({
  percent,
  size = 44,
  stroke = 4,
}: {
  percent: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent));
  const gid = `ring-${Math.round(pct)}-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--aurora)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--surface-muted)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        className="ring-draw"
        style={{ "--ring-len": (pct / 100) * c } as React.CSSProperties}
      />
    </svg>
  );
}
