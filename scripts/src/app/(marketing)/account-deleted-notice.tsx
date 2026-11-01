"use client";

import { useEffect } from "react";
import { clearLocalAvenData } from "@/lib/offline/client";

/** Shown after account deletion; also clears anything AVEN stored in this browser. */
export function AccountDeletedNotice() {
  useEffect(() => {
    void clearLocalAvenData();
  }, []);
  return (
    <div role="status" className="border-success/30 bg-success-soft border-b">
      <p className="text-ink mx-auto max-w-6xl px-5 py-3 text-sm sm:px-8">
        Your AVEN account and its data have been deleted. Anything AVEN kept in this browser has
        been cleared too.
      </p>
    </div>
  );
}
