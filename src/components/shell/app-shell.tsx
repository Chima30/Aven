"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SyncBootstrap } from "@/components/offline/sync-bootstrap";
import { SyncStatus } from "@/components/offline/sync-status";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./nav-config";
import { NavIcon } from "./nav-icon";
import { MobileTabBar } from "./mobile-tab-bar";
import { SidebarNav } from "./sidebar-nav";
import { ThemeSync } from "./theme-sync";
import { badgeText, useNudgeBadge } from "./use-nudge-badge";

export function AppShell({
  userId,
  displayName,
  theme,
  children,
}: {
  userId: string;
  displayName: string;
  theme: "system" | "light" | "dark";
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const nudgeCount = useNudgeBadge();
  const pathname = usePathname();
  const section = NAV_ITEMS.find(
    (i) => i.href && (pathname === i.href || pathname.startsWith(`${i.href}/`)),
  );

  // Close the mobile menu after navigating, and with Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "A";

  const avatar = (size: string) => (
    <span
      aria-hidden="true"
      className={cn(
        "text-ink flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(140deg,color-mix(in_srgb,var(--accent)_45%,var(--surface-muted)),color-mix(in_srgb,var(--aurora)_45%,var(--surface-muted)))] text-xs font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]",
        size,
      )}
    >
      {initials}
    </span>
  );

  // Only the username is shown — the sign-in email stays private on screen.
  const account = (
    <div className="flex items-center gap-3 px-2 py-2">
      {avatar("size-8")}
      <p
        className="text-ink min-w-0 flex-1 truncate text-sm font-medium"
        data-testid="account-name"
      >
        {displayName}
      </p>
    </div>
  );

  const bell = (
    <Link
      href="/nudges"
      aria-label={nudgeCount > 0 ? `Notifications, ${nudgeCount} new` : "Notifications"}
      className="text-ink-muted hover:text-ink hover:bg-surface-muted relative flex size-10 items-center justify-center rounded-xl transition-colors"
    >
      <NavIcon name="nudges" className="size-[18px]" />
      {nudgeCount > 0 ? (
        <span
          aria-hidden="true"
          className="bg-accent ring-canvas absolute top-2 right-2 size-2 rounded-full ring-2"
        />
      ) : null}
    </Link>
  );

  return (
    <div className="bg-canvas ambient min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <SyncBootstrap userId={userId} />
      <ThemeSync theme={theme} />

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col px-3 py-4 lg:flex">
        <Link
          href="/overview"
          className="mb-5 flex h-11 items-center rounded-xl px-3"
          aria-label="AVEN overview"
        >
          <Logo />
        </Link>
        <p className="type-eyebrow text-ink-subtle mb-2 px-3">Menu</p>
        <SidebarNav nudgeCount={nudgeCount} />
        <div className="mt-auto flex flex-col gap-1">
          <div className="border-line bg-surface/50 shadow-elev-1 rounded-2xl border p-1.5">
            {account}
            <SignOutButton className="w-full justify-start" />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="border-line bg-canvas/75 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
        <Link href="/overview" aria-label="AVEN overview" className="rounded-lg">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <SyncStatus userId={userId} compact />
          {bell}
          {avatar("size-8 ml-1")}
        </div>
      </div>

      {/* Mobile menu: every section, opened from the tab bar's "More". */}
      <div
        id="mobile-menu"
        hidden={!menuOpen}
        className="bg-canvas/95 animate-menu-in fixed inset-x-0 top-14 bottom-0 z-20 overflow-y-auto px-4 pt-5 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        <p className="type-eyebrow text-ink-subtle mb-3 px-1">All sections</p>
        <SidebarNav variant="sheet" onNavigate={() => setMenuOpen(false)} nudgeCount={nudgeCount} />
        <div className="border-line bg-surface/60 mt-6 flex flex-col gap-2 rounded-2xl border p-2">
          {account}
          <SignOutButton variant="secondary" />
        </div>
      </div>

      {/* Content panel */}
      <div className="min-w-0 lg:py-2.5 lg:pr-2.5">
        <div className="lg:border-line lg:bg-panel/80 lg:shadow-elev-2 min-h-[calc(100dvh-20px)] overflow-x-clip lg:rounded-[1.25rem] lg:border lg:backdrop-blur-sm">
          <div className="border-line hidden h-16 items-center justify-between gap-4 border-b px-8 lg:flex">
            <p className="text-ink-muted flex items-center gap-2.5 text-sm">
              {section ? (
                <>
                  <span className="icon-tile text-ink-muted size-7" aria-hidden="true">
                    <NavIcon name={section.icon} className="size-3.5" />
                  </span>
                  <span className="text-ink font-medium">{section.label}</span>
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <SyncStatus userId={userId} />
              {bell}
              {avatar("size-8")}
            </div>
          </div>
          <main id="main" className="pb-tabbar mx-auto w-full max-w-6xl px-4 pt-5 sm:px-8 lg:pt-8">
            {children}
          </main>
        </div>
      </div>

      <MobileTabBar
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((o) => !o)}
        onNavigate={() => setMenuOpen(false)}
        nudgeBadge={nudgeCount > 0 ? badgeText(nudgeCount) : null}
      />
    </div>
  );
}
