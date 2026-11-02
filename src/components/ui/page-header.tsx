import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="type-page text-ink">{title}</h1>
        {description ? (
          <p className="text-ink-muted mt-1 max-w-2xl text-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
