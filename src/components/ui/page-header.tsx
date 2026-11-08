import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Small context line above the title. */
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="type-eyebrow text-ink-subtle mb-1.5">{eyebrow}</p> : null}
        <h1 className="type-page text-ink">{title}</h1>
        {description ? (
          <p className="text-ink-muted mt-1.5 max-w-2xl text-sm leading-relaxed">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
