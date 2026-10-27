import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Mirrors Today: the title, then classes grouped by start time, each a time heading over rows of student facts. */
export default function TodayLoading() {
  return (
    <SkeletonScreen label="Loading today">
      <Skeleton className="h-3 w-12" />
      <Skeleton className="mt-2.5 h-10 w-40" />
      {[0, 1].map((g) => (
        <div key={g} className="mt-6">
          <Skeleton className="h-5 w-24" />
          <div className="mt-3 space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="glass-surface p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="ml-auto h-6 w-20 rounded-full" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Array.from({ length: 4 }).map((__, k) => (
                    <Skeleton key={k} className="h-6 w-24 rounded-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonScreen>
  );
}
