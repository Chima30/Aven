import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardVariant = "default" | "glass" | "hero" | "inset";

const cardVariants: Record<CardVariant, string> = {
  default: "border-line bg-surface shadow-elev-1 border",
  /** Frosted, floating: use for one or two contextual panels per page. */
  glass: "glass edge-light",
  /** The page's lead panel: layered gradient with a soft accent glow. */
  hero: "hero-surface border-line-strong edge-light border",
  /** A recessed well inside another surface. */
  inset: "border-line bg-canvas/40 border",
};

export function Card({
  className,
  variant = "default",
  ...props
}: ComponentProps<"section"> & { variant?: CardVariant }) {
  return (
    <section className={cn("min-w-0 rounded-2xl", cardVariants[variant], className)} {...props} />
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Optional small icon shown in a tile before the title. */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6", className)}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="icon-tile text-ink-muted size-8 shrink-0" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="type-section text-ink">{title}</h2>
          {description ? <p className="text-ink-muted mt-0.5 text-sm">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-5 sm:px-6 sm:py-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-line bg-surface-muted/40 flex flex-wrap items-center justify-end gap-3 rounded-b-2xl border-t px-5 py-4 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}
