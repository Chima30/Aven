import { formatMinor, percentOf } from "@/lib/finance/format";

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
      <div className="flex h-[168px] items-end gap-2 sm:gap-3" aria-hidden="true">
        {data.map((d) => {
          const ih =
            max > 0n ? Math.max(2, (percentOf(BigInt(d.incomeMinor), max) / 100) * height) : 2;
          const eh =
            max > 0n ? Math.max(2, (percentOf(BigInt(d.expenseMinor), max) / 100) * height) : 2;
          return (
            <div key={d.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="flex h-[140px] w-full items-end justify-center gap-1">
                <div className="bg-accent w-1/2 max-w-4 rounded-t-sm" style={{ height: ih }} />
                <div
                  className="bg-ink-subtle/60 w-1/2 max-w-4 rounded-t-sm"
                  style={{ height: eh }}
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
          <span className="bg-ink-subtle/60 size-2.5 rounded-sm" /> Expenses
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
      {shown.map((r) => {
        const pct = percentOf(BigInt(r.minor), total);
        return (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink truncate">{r.name}</span>
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
              <div className="bg-accent/80 h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
