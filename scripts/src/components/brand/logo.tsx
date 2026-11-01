import { cn } from "@/lib/cn";

/** AVEN mark: a calm arch over a horizon line. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M9 22.5 15.1 9.6a1 1 0 0 1 1.8 0L23 22.5"
        fill="none"
        className="stroke-primary-fg"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.2 18h7.6" className="stroke-accent" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-ink text-[1.0625rem] font-semibold tracking-[0.14em]">AVEN</span>
    </span>
  );
}
