"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./nav-config";
import { NavIcon } from "./nav-icon";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
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
                "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-surface text-ink ring-line shadow-[0_1px_2px_rgb(var(--shadow)/0.06)] ring-1"
                  : "text-ink-muted hover:bg-surface-muted hover:text-ink",
              )}
            >
              <NavIcon name={item.icon} className={cn("size-[18px]", active && "text-accent")} />
              {item.label}
            </Link>
          );
        }
        return (
          <div
            key={item.label}
            aria-disabled="true"
            title={`${item.label} arrives in Stage ${item.comingInStage}${item.children ? `: ${item.children.join(", ")}` : ""}`}
            className="text-ink-subtle flex h-10 cursor-default items-center gap-3 rounded-xl px-3 text-sm"
          >
            <NavIcon name={item.icon} className="size-[18px] opacity-70" />
            <span className="flex-1">{item.label}</span>
            <span className="border-line rounded-md border px-1.5 py-px text-[0.625rem] font-semibold tracking-wide">
              STAGE {item.comingInStage}
            </span>
            <span className="sr-only">(not available yet)</span>
          </div>
        );
      })}
    </nav>
  );
}
