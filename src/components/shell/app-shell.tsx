"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SyncBootstrap } from "@/components/offline/sync-bootstrap";
import { SyncStatus } from "@/components/offline/sync-status";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { cn } from "@/lib/cn";
import { SidebarNav } from "./sidebar-nav";
import { ThemeSync } from "./theme-sync";

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
  const pathname = usePathname();

  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "A";

  // Only the username is shown — the sign-in email stays private on screen.
  const account = (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2">
      <span
        aria-hidden="true"
        className="from-accent to-accent/55 text-accent-fg flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-sm font-semibold"
      >
        {initials}
      </span>
      <p
        className="text-ink min-w-0 flex-1 truncate text-sm font-medium"
        data-testid="account-name"
      >
        {displayName}
      </p>
    </div>
  );

  return (
    <div className="bg-canvas min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <SyncBootstrap userId={userId} />
      <ThemeSync theme={theme} />
      <ScrollReveal routeKey={pathname} />

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col px-3 py-5 lg:flex">
        <Link href="/overview" className="mb-7 rounded-lg px-3" aria-label="AVEN overview">
          <Logo />
        </Link>
        <p className="type-eyebrow text-ink-subtle mb-2 px-3 text-[0.6875rem]">Workspace</p>
        <SidebarNav />
        <div className="border-line mt-auto flex flex-col gap-1 border-t pt-3">
          {account}
          <SignOutButton className="w-full justify-start" />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="border-line bg-canvas/85 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur-md lg:hidden">
        <Link href="/overview" aria-label="AVEN overview" className="rounded-lg">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <SyncStatus userId={userId} compact />
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="text-ink hover:bg-surface-muted flex size-10 items-center justify-center rounded-xl transition-colors"
          >
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              {menuOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      <div
        id="mobile-menu"
        hidden={!menuOpen}
        className={cn(
          "bg-canvas animate-menu-in fixed inset-x-0 top-14 bottom-0 z-20 overflow-y-auto px-4 py-4 lg:hidden",
        )}
      >
        <SidebarNav onNavigate={() => setMenuOpen(false)} />
        <div className="border-line mt-6 flex flex-col gap-2 border-t pt-4">
          {account}
          <SignOutButton variant="secondary" />
        </div>
      </div>

      {/* Content panel */}
      <div className="min-w-0 lg:py-2.5 lg:pr-2.5">
        <div className="lg:border-line lg:bg-panel ambient min-h-[calc(100dvh-20px)] overflow-x-clip lg:rounded-2xl lg:border">
          <div className="border-line hidden h-14 items-center justify-end border-b px-8 lg:flex">
            <SyncStatus userId={userId} />
          </div>
          <main
            id="main"
            className="animate-page-in mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
