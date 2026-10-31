"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SyncStatus } from "@/components/offline/sync-status";
import { cn } from "@/lib/cn";
import { SidebarNav } from "./sidebar-nav";

export function AppShell({
  userId,
  displayName,
  email,
  children,
}: {
  userId: string;
  displayName: string;
  email: string;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // The mobile menu closes itself when a link is chosen (see SidebarNav onNavigate).

  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "A";

  const account = (
    <div className="border-line bg-surface flex items-center gap-3 rounded-xl border p-3">
      <span
        aria-hidden="true"
        className="bg-primary text-primary-fg flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-sm font-medium">{displayName}</p>
        <p className="text-ink-muted truncate text-xs">{email}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      {/* Desktop sidebar */}
      <aside className="border-line bg-canvas sticky top-0 hidden h-dvh flex-col border-r px-4 py-5 lg:flex">
        <Link href="/overview" className="mb-8 rounded-lg px-2" aria-label="AVEN overview">
          <Logo />
        </Link>
        <SidebarNav />
        <div className="mt-auto flex flex-col gap-3">
          {account}
          <SignOutButton className="w-full justify-start" />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="border-line bg-canvas/90 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur lg:hidden">
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
            className="text-ink hover:bg-surface-muted flex size-10 items-center justify-center rounded-xl"
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
          "bg-canvas fixed inset-x-0 top-14 bottom-0 z-20 overflow-y-auto px-4 py-4 lg:hidden",
        )}
      >
        <SidebarNav onNavigate={() => setMenuOpen(false)} />
        <div className="mt-6 flex flex-col gap-3">
          {account}
          <SignOutButton variant="secondary" />
        </div>
      </div>

      <div className="min-w-0">
        <div className="border-line hidden h-14 items-center justify-end border-b px-8 lg:flex">
          <SyncStatus userId={userId} />
        </div>
        <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
