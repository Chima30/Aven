import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A KPI tile: icon, label, big figure, and an optional small note or trend chip. */
export function StatTile({
  label,
  value,
  note,
  chip,
  href,
  icon,
  accent = "neutral",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  chip?: { text: string; tone: "up" | "down" | "neutral" };
  href?: string;
  icon?: ReactNode;
  /** Tints the icon tile. */
  accent?: "neutral" | "accent" | "aurora" | "info" | "warning";
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "icon-tile size-9",
              accent === "neutral" && "text-ink-muted",
              accent === "accent" && "text-accent",
              accent === "aurora" && "text-aurora",
              accent === "info" && "text-info",
              accent === "warning" && "text-warning",
            )}
          >
            {icon}
          </span>
        ) : (
          <p className="text-ink-muted text-sm">{label}</p>
        )}
        {chip ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
              chip.tone === "up" && "bg-success-soft text-success",
              chip.tone === "down" && "bg-danger-soft text-danger",
              chip.tone === "neutral" && "bg-surface-muted text-ink-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                chip.tone === "up"
                  ? "bg-success"
                  : chip.tone === "down"
                    ? "bg-danger"
                    : "bg-ink-subtle",
              )}
            />
            {chip.text}
          </span>
        ) : null}
      </div>
      {icon ? <p className="text-ink-muted mt-4 text-sm">{label}</p> : null}
      <p
        className={cn(
          "type-figure text-ink leading-tight whitespace-nowrap",
          icon ? "mt-1" : "mt-3",
          typeof value === "string" && value.length > 12
            ? "text-lg 2xl:text-xl"
            : "text-[1.625rem] sm:text-[1.75rem]",
        )}
      >
        {value}
      </p>
      {note ? <p className="text-ink-subtle mt-1.5 truncate text-xs">{note}</p> : null}
    </>
  );
  const cls =
    "border-line bg-surface shadow-elev-1 lift block min-w-0 overflow-hidden rounded-2xl border p-4 sm:p-5 focus-visible:outline-2 focus-visible:outline-offset-2";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
