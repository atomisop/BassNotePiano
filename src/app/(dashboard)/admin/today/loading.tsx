import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Mirrors Today: the day between its two arrows, then classes grouped by start time, each a time heading over one panel of student rows. */
export default function TodayLoading() {
  return (
    <SkeletonScreen label="Loading the day">
      <div className="mt-2 flex items-center gap-2">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 sm:flex-none">
          <Skeleton className="mx-auto h-4 w-40 sm:mx-0" />
          <Skeleton className="mx-auto mt-1.5 h-3 w-28 sm:mx-0" />
        </div>
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      </div>
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
