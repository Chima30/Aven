"use client";

import { useRef, useState, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { clearLocalAvenData } from "@/lib/offline/client";

/**
 * Signs out with a POST (protected by an Origin check on the server).
 * Before submitting, it clears AVEN's offline data from this browser so the
 * next person using this device cannot see it.
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

  return (
    <form
      ref={formRef}
      action="/auth/sign-out"
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        await clearLocalAvenData().catch(() => undefined);
        formRef.current?.submit();
      }}
    >
      <input type="hidden" name="scope" value={scope} />
      <button type="submit" disabled={busy} className={buttonClasses(variant, "md", className)}>
        {busy ? "Signing out…" : (children ?? "Sign out")}
      </button>
    </form>
  );
}
