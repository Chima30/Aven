"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/wellbeing", label: "Overview", exact: true },
  { href: "/wellbeing/sleep", label: "Sleep" },
  { href: "/wellbeing/water", label: "Water" },
  { href: "/wellbeing/meals", label: "Meals" },
  { href: "/wellbeing/activity", label: "Activity" },
  { href: "/wellbeing/mood", label: "Mood" },
  { href: "/wellbeing/settings", label: "Settings" },
];

export function WellbeingNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Wellbeing"
      className="border-line -mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0"
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
