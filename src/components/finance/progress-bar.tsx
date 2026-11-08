import { cn } from "@/lib/cn";

/** Accessible progress bar. Turns warning at the threshold and danger when over 100%. */
export function ProgressBar({
  percent,
  label,
  warnAt = 80,
  tone = "budget",
  className,
}: {
  percent: number;
  label: string;
  warnAt?: number;
  tone?: "budget" | "goal";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color =
    tone === "goal"
      ? "bg-[linear-gradient(90deg,var(--aurora),var(--accent))]"
      : percent > 100
        ? "bg-danger"
        : percent >= warnAt
          ? "bg-warning"
          : "bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_70%,transparent),var(--accent))]";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-valuetext={`${Math.round(percent)}%`}
      className={cn(
        "bg-surface-muted h-2 w-full overflow-hidden rounded-full shadow-[inset_0_1px_1px_rgb(0_0_0/0.2)]",
        className,
      )}
    >
      <div className={cn("bar-grow h-full rounded-full", color)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
