import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors AnnouncementManager: the composer form up top, then the list of
 * already-sent announcements below it.
 */
export default function AdminAnnouncementsLoading() {
  return (
    <SkeletonScreen label="Loading announcements">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />

        <div className="mt-8 space-y-6">
          <div className="glass-surface p-6">
            <Skeleton className="h-4 w-32" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-28 rounded-full" />
            </div>
          </div>

          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
