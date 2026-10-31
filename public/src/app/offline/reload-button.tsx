"use client";

import { Button } from "@/components/ui/button";

export function ReloadButton() {
  return (
    <Button className="mt-8" onClick={() => window.location.reload()}>
      Try again
    </Button>
  );
}
