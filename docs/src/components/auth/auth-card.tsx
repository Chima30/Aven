import type { ReactNode } from "react";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div>
      <div className="border-line bg-surface rounded-2xl border p-6 shadow-[0_1px_3px_rgb(var(--shadow)/0.05)] sm:p-8">
        <h1 className="type-page">{title}</h1>
        {description ? <p className="text-ink-muted mt-2 text-sm">{description}</p> : null}
        <div className="mt-7">{children}</div>
      </div>
      {footer ? <div className="text-ink-muted mt-6 text-center text-sm">{footer}</div> : null}
    </div>
  );
}
