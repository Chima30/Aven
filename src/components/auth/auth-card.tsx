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
      <div className="glass edge-light rounded-[1.375rem] p-6 sm:p-8">
        <h1 className="type-page">{title}</h1>
        {description ? <p className="text-ink-muted mt-2 text-sm">{description}</p> : null}
        <div className="mt-7">{children}</div>
      </div>
      {footer ? <div className="text-ink-muted mt-6 text-center text-sm">{footer}</div> : null}
    </div>
  );
}
