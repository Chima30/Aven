import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { OfflineQuickAdd } from "./offline-quick-add";
import { ReloadButton } from "./reload-button";

export const metadata: Metadata = { title: "You're offline" };
// Static so the service worker can cache it; contains no personal data.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 py-12 text-center"
    >
      <Logo />
      <h1 className="type-page mt-10">You&apos;re offline</h1>
      <p className="text-ink-muted mt-3 text-sm">
        AVEN can&apos;t reach the internet right now. Pages that show your account need a
        connection. Anything you&apos;ve already saved is safe.
      </p>
      <ReloadButton />
      <OfflineQuickAdd />
    </main>
  );
}
