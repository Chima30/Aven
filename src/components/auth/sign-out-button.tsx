"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { clearLocalAvenData, readOutboxSummary } from "@/lib/offline/client";
import { currentOfflineUser, requestSync } from "@/lib/offline/controller";

/**
 * Signs out with a POST (protected by an Origin check on the server).
 * Before submitting it clears AVEN's offline data from this browser so the
 * next person using this device cannot see it — but first it WARNS if there
 * are changes that haven't reached the server, and offers to sync them.
 */
export function SignOutButton({
  scope = "local",
  variant = "ghost",
  className,
  children,
}: {
  scope?: "local" | "global";
  variant?: "ghost" | "secondary" | "danger";
  className?: string;
  children?: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [unsynced, setUnsynced] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function countUnsynced(): Promise<number> {
    const userId = await currentOfflineUser().catch(() => undefined);
    if (!userId) return 0;
    const summary = await readOutboxSummary(userId).catch(() => null);
    return summary ? summary.pending + summary.syncing + summary.failed : 0;
  }

  async function signOutNow() {
    setBusy(true);
    await clearLocalAvenData().catch(() => undefined);
    formRef.current?.submit();
  }

  async function syncThenCheck() {
    setSyncing(true);
    const userId = await currentOfflineUser().catch(() => undefined);
    if (userId) await requestSync(userId).catch(() => null);
    const remaining = await countUnsynced();
    setSyncing(false);
    if (remaining === 0) {
      setUnsynced(0);
      await signOutNow();
    } else {
      setUnsynced(remaining);
    }
  }

  return (
    <>
      <form
        ref={formRef}
        action="/auth/sign-out"
        method="post"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const n = await countUnsynced();
          if (n > 0) {
            setUnsynced(n);
            return;
          }
          await signOutNow();
        }}
      >
        <input type="hidden" name="scope" value={scope} />
        <button type="submit" disabled={busy} className={buttonClasses(variant, "md", className)}>
          {busy ? "Signing out…" : (children ?? "Sign out")}
        </button>
      </form>
      <Dialog
        open={unsynced > 0}
        onClose={() => setUnsynced(0)}
        title="You have changes that haven't synced"
        description={`${unsynced} change${unsynced === 1 ? " is" : "s are"} saved only on this device. Signing out removes ${unsynced === 1 ? "it" : "them"} from this device permanently.`}
      >
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="danger" onClick={signOutNow} loading={busy}>
            Sign out and discard
          </Button>
          <Button onClick={syncThenCheck} loading={syncing}>
            Sync now
          </Button>
        </div>
      </Dialog>
    </>
  );
}
