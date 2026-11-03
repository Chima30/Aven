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
}: {
  onNavigate?: () => void;
  /** New unread notifications since the Nudge Center was last opened. */
  nudgeCount?: number;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        if (item.href) {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors duration-150",
                active
                  ? "bg-surface-muted text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
                  : "text-ink-muted hover:bg-surface-muted/60 hover:text-ink",
              )}
            >
              <NavIcon
                name={item.icon}
                className={cn("size-4", active ? "text-ink" : "text-ink-subtle")}
              />
              <span className="flex-1">{item.label}</span>
              {item.icon === "nudges" && nudgeCount > 0 ? (
                <span
                  data-testid="nudge-badge"
                  className="bg-accent text-accent-fg ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] leading-none font-semibold tabular-nums"
                >
                  {badgeText(nudgeCount)}
                  <span className="sr-only"> new notifications</span>
                </span>
              ) : null}
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
