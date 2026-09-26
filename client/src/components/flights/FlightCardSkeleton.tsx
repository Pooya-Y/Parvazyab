import { Skeleton } from "@/components/ui/skeleton";

export function FlightCardSkeleton() {
  return (
    <div
      className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-[minmax(0,1fr)_13rem] md:gap-6 md:p-5"
      aria-hidden
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-14" />
          <Skeleton className="h-px flex-1" />
          <Skeleton className="h-10 w-14" />
        </div>
      </div>
      <div className="space-y-3 border-t pt-4 md:border-t-0 md:border-s md:ps-6 md:pt-0">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
