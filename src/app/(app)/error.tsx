"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

export default function SignedInError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="danger" title="Something went wrong loading this page">
        {error.message.includes("migrations")
          ? error.message
          : "Please try again. If it keeps happening, sign out and back in."}
        {error.digest ? (
          <span className="mt-1 block text-xs">Reference: {error.digest}</span>
        ) : null}
      </Alert>
      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
