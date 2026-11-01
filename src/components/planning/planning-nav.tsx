"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/planning", label: "Today", exact: true },
  { href: "/planning/calendar", label: "Calendar" },
  { href: "/planning/tasks", label: "Tasks" },
  { href: "/planning/habits", label: "Habits" },
  { href: "/planning/reviews", label: "Reviews" },
];

export function PlanningNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Planning"
      className="border-line no-scrollbar -mx-4 overflow-x-auto overflow-y-hidden border-b px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex gap-1">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px block border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-accent text-ink font-medium"
                    : "text-ink-muted hover:text-ink border-transparent",
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
