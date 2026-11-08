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
      <ul className="border-line bg-surface/60 shadow-elev-1 inline-flex min-w-max gap-0.5 rounded-xl border p-1 lg:flex lg:w-full lg:min-w-0 lg:flex-col lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        {SETTINGS_SECTIONS.map((s) => {
          const active = pathname === s.href;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center rounded-lg px-3 text-sm whitespace-nowrap transition-[background-color,color] duration-200",
                  active
                    ? "bg-surface-muted text-ink font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_1px_2px_rgb(0_0_0/0.25)]"
                    : "text-ink-muted hover:bg-surface-muted/50 hover:text-ink",
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
