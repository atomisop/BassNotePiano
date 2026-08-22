import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors the real profile page's actual stacked sections: avatar + name +
 * edit button, a streak-days card, a longest-streak card, then the badge
 * grid (`BadgeGrid`/`BadgeSummary`) grouped by category.
 */
export default function ProfileLoading() {
  return (
    <SkeletonScreen label="Loading profile">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <div>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-3.5 w-24" />
            </div>
          </div>
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        </div>

        <div className="glass-surface mt-6 p-5">
          <Skeleton className="h-3 w-24" />
          <div className="mt-4 flex justify-between gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-9 shrink-0 rounded-full" />
            ))}
          </div>
        </div>

        <div className="glass-surface mt-4 p-5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-6 w-20" />
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="mt-2 h-3.5 w-72 max-w-full" />

          {Array.from({ length: 2 }).map((_, section) => (
            <div key={section} className="mt-6">
              <Skeleton className="h-3 w-32" />
              <div className="mt-3 grid grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
