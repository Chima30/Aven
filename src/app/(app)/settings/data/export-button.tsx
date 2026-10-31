"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";

/** Plain form POST, so the browser handles the file download natively. */
export function ExportButton() {
  const [clicked, setClicked] = useState(false);
  return (
    <form action="/settings/data/export" method="post" onSubmit={() => setClicked(true)}>
      <button type="submit" className={buttonClasses("secondary")}>
        Download my data (JSON)
      </button>
      {clicked ? (
        <p role="status" className="text-ink-muted mt-2 text-xs">
          Your download should start in a moment.
        </p>
      ) : null}
    </form>
  );
}
