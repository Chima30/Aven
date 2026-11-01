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
                "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-surface-muted text-ink"
                  : "text-ink-muted hover:bg-surface-muted/60 hover:text-ink",
              )}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="bg-accent absolute top-2.5 -left-3 h-5 w-1 rounded-r-full"
                />
              ) : null}
              <NavIcon
                name={item.icon}
                className={cn(
                  "size-[18px] transition-transform duration-200 group-hover:scale-110",
                  active && "text-accent",
                )}
              />
              {item.label}
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
            <span className="border-line rounded-md border px-1.5 py-px text-[0.625rem] font-semibold tracking-wide">
              LATER
            </span>
            <span className="sr-only">(not available yet)</span>
          </div>
        );
      })}
    </nav>
  );
}
