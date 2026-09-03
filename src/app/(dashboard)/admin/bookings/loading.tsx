import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors AdminAttendanceRoster: occurrences grouped into their own
 * glass-surface card per date, each with a few booking rows inside.
 */
export default function AdminBookingsLoading() {
  return (
    <SkeletonScreen label="Loading class attendance">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
        <Skeleton className="mt-1 h-4 w-2/3 max-w-xl" />

        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-surface p-5">
              <Skeleton className="h-4 w-40" />
              <div className="mt-4 space-y-2">
                {Array.from({ length: 2 }).map((_, j) => (
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
