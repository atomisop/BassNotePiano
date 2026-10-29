import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Mirrors Activity: the title, the search form (search box, two selects), then the log rows (action and time, then a detail line). */
export default function AdminActivityLoading() {
  return (
    <SkeletonScreen label="Loading activity">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-10 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-11 sm:col-span-2" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
        <Skeleton className="mt-5 h-4 w-32" />
        <div className="glass-surface mt-2 divide-y divide-slate-50/10 px-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="py-3">
              <div className="flex items-baseline justify-between gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-24" />
              </div>
              <Skeleton className="mt-2 h-3.5 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
