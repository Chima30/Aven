import type { ReactNode } from "react";
import { Alert } from "@/components/ui/feedback";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
      <h1 className="type-page text-[2rem]">{title}</h1>
      <p className="text-ink-muted mt-2 text-sm">Draft · last updated {updated}</p>
      <Alert tone="warning" className="mt-6" title="Draft for review">
        This is a working draft written for AVEN&apos;s early-access stage. It has not yet been
        reviewed by a lawyer and will be finalised before public launch.
      </Alert>
      <div className="text-ink-muted [&_h2]:type-section [&_h2]:text-ink [&_strong]:text-ink mt-10 space-y-8 text-[0.9375rem] leading-relaxed [&_h2]:mb-2 [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}
