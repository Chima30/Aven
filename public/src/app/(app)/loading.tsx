import { Skeleton } from "@/components/ui/feedback";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-72" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}
