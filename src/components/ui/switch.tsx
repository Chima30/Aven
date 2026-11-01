import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Accessible on/off switch built on a real checkbox, so it works inside
 * plain HTML forms and with keyboard and screen readers.
 */
export function Switch({
  id,
  name,
  label,
  description,
  defaultChecked,
  disabled,
  badge,
}: {
  id: string;
  name?: string;
  label: ReactNode;
  description?: ReactNode;
  defaultChecked?: boolean;
  disabled?: boolean;
  badge?: ReactNode;
}) {
  const descId = description ? `${id}-desc` : undefined;
  return (
    <div className={cn("flex items-start justify-between gap-6", disabled && "opacity-70")}>
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="text-ink flex flex-wrap items-center gap-2 text-sm font-medium"
        >
          {label}
          {badge}
        </label>
        {description ? (
          <p id={descId} className="text-ink-muted mt-1 text-sm">
            {description}
          </p>
        ) : null}
      </div>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          name={name ?? id}
          type="checkbox"
          role="switch"
          defaultChecked={defaultChecked}
          disabled={disabled}
          aria-describedby={descId}
          className="peer border-line-strong bg-surface-muted checked:border-accent checked:bg-accent focus-visible:outline-ring h-6 w-11 cursor-pointer appearance-none rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className="bg-ink-subtle peer-checked:bg-accent-fg pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full shadow-sm transition-[transform,background-color] duration-200 peer-checked:translate-x-5"
        />
      </span>
    </div>
  );
}
