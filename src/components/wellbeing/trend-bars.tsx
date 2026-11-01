import { cn } from "@/lib/cn";

/**
 * A small accessible bar chart: one bar per day, an optional target line,
 * and the same numbers in a visually hidden table for screen readers.
 * Days without a record show as an empty slot — never as zero-filled data.
 */
export function TrendBars({
  caption,
  days,
  values,
  format,
  target,
  dayLabel,
  max: maxOverride,
}: {
  caption: string;
  days: string[];
  values: Map<string, number>;
  format: (n: number) => string;
  target?: number | null;
  dayLabel: (d: string) => string;
  max?: number;
}) {
  const nums = days.map((d) => values.get(d)).filter((n): n is number => n !== undefined);
  const max = Math.max(maxOverride ?? 0, target ?? 0, ...nums, 1);
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative flex h-28 items-end gap-1" aria-hidden="true">
        {target ? (
          <div
            className="border-accent/60 absolute inset-x-0 border-t border-dashed"
            style={{ bottom: `${(target / max) * 100}%` }}
          />
        ) : null}
        {days.map((d, i) => {
          const v = values.get(d);
          return (
            <div
              key={d}
              className="flex h-full flex-1 flex-col justify-end"
              title={`${dayLabel(d)}: ${v === undefined ? "no record" : format(v)}`}
            >
              {v === undefined ? (
                <div className="bg-surface-muted h-0.5 rounded" />
              ) : (
                <div
                  className={cn(
                    "grow-bar rounded-t",
                    target && v >= target ? "bg-accent" : "bg-accent/50",
                  )}
                  style={
                    {
                      height: `${Math.max(2, (v / max) * 100)}%`,
                      "--i": i,
                    } as React.CSSProperties
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="text-ink-subtle flex justify-between text-[11px]" aria-hidden="true">
        <span>{dayLabel(days[0]!)}</span>
        <span>{dayLabel(days[days.length - 1]!)}</span>
      </div>
      <figcaption className="text-ink-muted text-xs">
        {caption}
        {target ? " Dashed line: your target." : ""}
      </figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <th scope="row">{dayLabel(d)}</th>
              <td>{values.has(d) ? format(values.get(d)!) : "No record"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface-muted/60 rounded-xl px-3 py-2.5">
      <p className="text-ink-subtle text-xs">{label}</p>
      <p className="text-ink mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-ink-muted text-xs">{sub}</p> : null}
    </div>
  );
}
