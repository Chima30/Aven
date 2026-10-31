"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/** A button that opens a dialog containing a form. Optionally starts open (e.g. ?new=1). */
export function FormDialog({
  label,
  title,
  description,
  defaultOpen = false,
  variant = "primary",
  size = "md",
  children,
}: {
  label: ReactNode;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        className="max-w-xl"
      >
        {open ? children(() => setOpen(false)) : null}
      </Dialog>
    </>
  );
}
