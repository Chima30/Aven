"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Modal dialog built on the native <dialog> element, which provides focus
 * trapping, Escape-to-close and an inert background for free.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        "border-line bg-surface text-ink m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border p-0 shadow-2xl",
        className,
      )}
    >
      <div className="p-6">
        <h2 id={titleId} className="type-section">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="text-ink-muted mt-1.5 text-sm">
            {description}
          </p>
        ) : null}
        <div className="mt-5">{children}</div>
      </div>
    </dialog>
  );
}
