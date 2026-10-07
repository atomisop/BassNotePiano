import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors AdminScheduleManager: the "add a slot" form, then the existing
 * weekly slots listed below it.
 */
export default function AdminScheduleLoading() {
  return (
    <SkeletonScreen label="Loading weekly schedule">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-52" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />

        <div className="mt-6 space-y-4">
          <div className="glass-surface space-y-3 p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
