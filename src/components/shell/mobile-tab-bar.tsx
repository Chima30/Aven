"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { NavIcon as NavIconName } from "./nav-config";
import { NavIcon } from "./nav-icon";

const TABS: Array<{ href: string; label: string; icon: NavIconName }> = [
  { href: "/overview", label: "Home", icon: "overview" },
  { href: "/money", label: "Money", icon: "money" },
  { href: "/planning", label: "Plan", icon: "planning" },
  { href: "/nudges", label: "Nudges", icon: "nudges" },
];

/**
 * Bottom navigation for phones: the four most-used sections within thumb
 * reach, plus "More", which opens the full menu.
 */
export function MobileTabBar({
  menuOpen,
  onToggleMenu,
  onNavigate,
  nudgeBadge,
}: {
  menuOpen: boolean;
  onToggleMenu: () => void;
  onNavigate: () => void;
  nudgeBadge: string | null;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Quick"
      className="fixed inset-x-0 bottom-0 z-40 px-3 lg:hidden"
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      <ul className="glass mx-auto grid max-w-md grid-cols-5 rounded-[1.375rem] p-1.5">
        {TABS.map((t) => {
          const active = !menuOpen && (pathname === t.href || pathname.startsWith(`${t.href}/`));
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[0.6875rem] font-medium transition-colors duration-200",
                  active ? "bg-surface-muted/80 text-ink" : "text-ink-subtle active:text-ink",
                )}
              >
                <NavIcon name={t.icon} className={cn("size-5", active && "text-accent")} />
                {t.label}
                {t.icon === "nudges" && nudgeBadge ? (
                  <span
                    aria-hidden="true"
                    className="bg-accent text-accent-fg absolute top-1.5 left-1/2 ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] leading-none font-semibold tabular-nums"
                  >
                    {nudgeBadge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onToggleMenu}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className={cn(
              "flex h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl text-[0.6875rem] font-medium transition-colors duration-200",
              menuOpen ? "bg-surface-muted/80 text-ink" : "text-ink-subtle active:text-ink",
            )}
          >
            <svg
              viewBox="0 0 24 24"
              className={cn("size-5", menuOpen && "text-accent")}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {menuOpen ? (
                <path d="M6 6l12 12M18 6 6 18" />
              ) : (
                <path d="M5 6.5h14M5 12h14M5 17.5h9" />
              )}
            </svg>
            <span aria-hidden="true">{menuOpen ? "Close" : "More"}</span>
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
