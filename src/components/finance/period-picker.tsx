import Link from "next/link";
import { PERIODS, type PeriodKey } from "@/lib/finance/periods";
import { cn } from "@/lib/cn";

export function PeriodPicker({ current, basePath }: { current: PeriodKey; basePath: string }) {
  return (
    <nav aria-label="Time period" className="-mx-1 flex flex-wrap gap-1">
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={`${basePath}?period=${p.key}`}
          aria-current={p.key === current ? "true" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm transition-colors",
            p.key === current
              ? "bg-primary text-primary-fg"
              : "text-ink-muted hover:bg-surface-muted hover:text-ink",
          )}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
