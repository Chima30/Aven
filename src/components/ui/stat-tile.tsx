import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A KPI tile: label, big figure, and an optional small note or trend chip. */
export function StatTile({
  label,
  value,
  note,
  chip,
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  chip?: { text: string; tone: "up" | "down" | "neutral" };
  href?: string;
  icon?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-ink-muted flex items-center gap-2 text-sm">
          {icon ? <span className="text-ink-subtle">{icon}</span> : null}
          {label}
        </p>
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
      <p
        className={cn(
          "type-figure text-ink mt-3 leading-tight break-words",
          typeof value === "string" && value.length > 12 ? "text-xl sm:text-2xl" : "text-[1.75rem]",
        )}
      >
        {value}
      </p>
      {note ? <p className="text-ink-subtle mt-2 truncate text-xs">{note}</p> : null}
    </>
  );
  const cls =
    "border-line bg-surface lift block rounded-2xl border p-5 focus-visible:outline-2 focus-visible:outline-offset-2";
  return href ? (
    <Link href={href} className={cls} data-reveal>
      {body}
    </Link>
  ) : (
    <div className={cls} data-reveal>
      {body}
    </div>
  );
}
