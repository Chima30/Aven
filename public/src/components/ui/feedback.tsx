import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-muted border-line",
  info: "bg-info-soft text-info border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const alertTones: Record<Exclude<Tone, "neutral" | "accent">, string> = {
  info: "border-info/25 bg-info-soft text-ink",
  success: "border-success/25 bg-success-soft text-ink",
  warning: "border-warning/30 bg-warning-soft text-ink",
  danger: "border-danger/30 bg-danger-soft text-ink",
};

const alertIcon: Record<keyof typeof alertTones, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof alertTones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", alertTones[tone], className)}
    >
      <svg
        viewBox="0 0 20 20"
        className={cn("mt-0.5 size-4 shrink-0", alertIcon[tone])}
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M10 6v5M10 13.5v.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(Boolean(title) && "mt-0.5", "text-ink-muted")}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-line-strong flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="bg-surface-muted text-ink-muted mb-4 flex size-11 items-center justify-center rounded-xl">
          {icon}
        </div>
      ) : null}
      <h3 className="type-section text-ink">{title}</h3>
      <p className="text-ink-muted mt-1.5 max-w-md text-sm">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-surface-muted animate-pulse rounded-lg", className)}
    />
  );
}

export function FormMessage({ state }: { state: { status: string; message?: string } }) {
  if (!state.message || state.status === "idle") return null;
  return <Alert tone={state.status === "success" ? "success" : "danger"}>{state.message}</Alert>;
}
