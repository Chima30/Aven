"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./nav-config";
import { NavIcon } from "./nav-icon";
import { badgeText } from "./use-nudge-badge";

export function SidebarNav({
  onNavigate,
  nudgeCount = 0,
  variant = "list",
}: {
  onNavigate?: () => void;
  /** New unread notifications since the Nudge Center was last opened. */
  nudgeCount?: number;
  /** "list" for the desktop sidebar, "sheet" for the mobile menu (two-column tiles). */
  variant?: "list" | "sheet";
}) {
  const pathname = usePathname();
  const sheet = variant === "sheet";
  return (
    <nav
      aria-label="Main"
      className={cn(sheet ? "grid grid-cols-2 gap-2" : "flex flex-col gap-0.5")}
    >
      {NAV_ITEMS.map((item) => {
        if (item.href) {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const badge =
            item.icon === "nudges" && nudgeCount > 0 ? (
              <span
                data-testid="nudge-badge"
                className="bg-accent text-accent-fg ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] leading-none font-semibold tabular-nums"
              >
                {badgeText(nudgeCount)}
                <span className="sr-only"> new notifications</span>
              </span>
            ) : null;
          if (sheet) {
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[5.5rem] flex-col justify-between gap-3 rounded-2xl border p-3.5 text-sm font-medium transition-colors",
                  active
                    ? "border-line-strong bg-surface-muted text-ink shadow-elev-2"
                    : "border-line bg-surface text-ink-muted active:bg-surface-muted",
                )}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={cn("icon-tile size-9", active ? "text-accent" : "text-ink-muted")}
                  >
                    <NavIcon name={item.icon} className="size-[18px]" />
                  </span>
                  {badge}
                </span>
                <span className="text-ink">{item.label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-[background-color,color] duration-200",
                active
                  ? "bg-surface-muted text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_1px_2px_rgb(0_0_0/0.3)]"
                  : "text-ink-muted hover:bg-surface-muted/50 hover:text-ink",
              )}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="bg-accent absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-full shadow-[0_0_10px_var(--accent)]"
                />
              ) : null}
              <NavIcon
                name={item.icon}
                className={cn(
                  "size-[18px] transition-colors",
                  active ? "text-accent" : "text-ink-subtle group-hover:text-ink-muted",
                )}
              />
              <span className="flex-1">{item.label}</span>
              {badge}
            </Link>
          );
        }
        return (
          <div
            key={item.label}
            aria-disabled="true"
            title={`${item.label} is planned for a later release${item.children ? `: ${item.children.join(", ")}` : ""}`}
            className="text-ink-subtle flex h-10 cursor-default items-center gap-3 rounded-xl px-3 text-sm"
          >
            <NavIcon name={item.icon} className="size-[18px] opacity-70" />
            <span className="flex-1">{item.label}</span>
            <span className="border-line rounded-md border px-1.5 py-px text-[0.625rem] font-medium tracking-wide">
              LATER
            </span>
            <span className="sr-only">(not available yet)</span>
          </div>
        );
      })}
    </nav>
  );
}
