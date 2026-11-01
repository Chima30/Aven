"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export const SETTINGS_SECTIONS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/regional", label: "Regional" },
  { href: "/settings/appearance", label: "Appearance" },
  { href: "/settings/privacy", label: "Privacy & consent" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/data", label: "Your data" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings"
      className="no-scrollbar -mx-4 overflow-x-auto overflow-y-hidden px-4 lg:mx-0 lg:px-0"
    >
      <ul className="flex gap-1 lg:flex-col">
        {SETTINGS_SECTIONS.map((s) => {
          const active = pathname === s.href;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-surface text-ink ring-line font-medium ring-1"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
