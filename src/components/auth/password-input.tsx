"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/field";

/** Password field with a show/hide toggle. */
export function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-16" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="text-ink-muted hover:bg-surface-muted hover:text-ink absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-xs font-medium"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
