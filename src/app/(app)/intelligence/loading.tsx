import { Skeleton } from "@/components/ui/feedback";

/**
 * Shown under the Intelligence tabs while a tab loads. Insights recall memories
 * from Walrus before rendering, which can take a few seconds; without this the
 * tab click looked like it did nothing until the whole page was ready.
 */
export default function IntelligenceLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-16" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
