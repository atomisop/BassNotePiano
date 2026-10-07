import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors the customer detail page: the "All users" back link, the header,
 * then CustomerProfile's several stacked sections (curriculum, payments,
 * credits, bookings, support history).
 */
export default function AdminCustomerLoading() {
  return (
    <SkeletonScreen label="Loading student profile">
      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />

        <div className="mt-8 space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-surface p-6">
              <Skeleton className="h-4 w-36" />
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
