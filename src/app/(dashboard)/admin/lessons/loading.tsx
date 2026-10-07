import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors AdminLessonManager: a row of scale tabs, the upload form, then
 * the existing lesson files for whichever scale is selected.
 */
export default function AdminLessonsLoading() {
  return (
    <SkeletonScreen label="Loading lessons">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />

        <div className="mt-6 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>

        <div className="mt-4 space-y-4">
          <div className="glass-surface space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
