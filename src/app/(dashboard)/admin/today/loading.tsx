import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Mirrors Today: classes grouped by start time, each a time heading over one panel of student rows. */
export default function TodayLoading() {
  return (
    <SkeletonScreen label="Loading today">
      <Skeleton className="h-3 w-12" />
      <Skeleton className="mt-2.5 h-10 w-40" />
      {[0, 1].map((g) => (
        <div key={g} className="mt-6">
          <Skeleton className="h-5 w-24" />
          <div className="mt-3 divide-y divide-slate-50/8 overflow-hidden rounded-card bg-slate-50/4 ring-1 ring-inset ring-slate-50/8">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-56 max-w-full" />
                </div>
                <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonScreen>
  );
}
