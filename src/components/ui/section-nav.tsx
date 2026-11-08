"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface SectionTab {
  href: string;
  label: string;
  /** Active only on this exact path (for a section's index tab). */
  exact?: boolean;
}

/**
 * Tabs for a section (Money, Planning, …): a segmented pill bar that scrolls
 * sideways on small screens. The active tab is marked with aria-current.
 */
export function SectionNav({
  label,
  tabs,
  isActive,
}: {
  label: string;
  tabs: SectionTab[];
  /** Override the default active-tab rule. */
  isActive?: (pathname: string, tab: SectionTab) => boolean;
}) {
  const pathname = usePathname();
  const active = (t: SectionTab) =>
    isActive
      ? isActive(pathname, t)
      : t.exact
        ? pathname === t.href
        : pathname === t.href || pathname.startsWith(`${t.href}/`);
  return (
    <nav
      aria-label={label}
      className="no-scrollbar -mx-4 overflow-x-auto overflow-y-hidden px-4 sm:mx-0 sm:px-0"
    >
      <ul className="border-line bg-surface/60 shadow-elev-1 inline-flex min-w-max gap-0.5 rounded-xl border p-1">
        {tabs.map((t) => {
          const on = active(t);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center rounded-lg px-3.5 text-sm whitespace-nowrap transition-[background-color,color,box-shadow] duration-200",
                  on
                    ? "bg-surface-muted text-ink font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_1px_2px_rgb(0_0_0/0.25)]"
                    : "text-ink-muted hover:text-ink hover:bg-surface-muted/50",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
