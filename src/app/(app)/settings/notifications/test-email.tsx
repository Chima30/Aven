"use client";

import { InlineAction } from "@/components/ui/inline-action";
import { sendTestEmailAction } from "../actions";

export function TestEmailButton() {
  return (
    <div className="flex items-center justify-between gap-4 px-1 text-sm">
      <p className="text-ink-muted">Check that email reaches your inbox (and not spam).</p>
      <InlineAction
        action={sendTestEmailAction}
        fields={{}}
        label="Send a test email"
        pendingLabel="Sending…"
        variant="secondary"
      />
    </div>
  );
}
