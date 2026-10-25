import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors Profile: the Back link; the avatar with the Profile eyebrow, your name and @username, and the edit button; the Streak card (a
 * title over the seven days); the Longest streak card; then Badges (a title and the count) with each group in its own card of tiles.
 */
export default function ProfileLoading() {
  return (
    <SkeletonScreen label="Loading profile">
      <WideLayout>
        <Skeleton className="mb-4 h-5 w-16" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <div>
              <Skeleton className="h-3 w-14" />
              <Skeleton className="mt-2 h-8 w-44" />
              <Skeleton className="mt-2 h-3.5 w-24" />
            </div>
          </div>
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
        </div>

        <div className="glass-surface mt-6 p-5">
          <Skeleton className="h-4 w-16" />
          <div className="mt-4 flex justify-between gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-9 shrink-0 rounded-full" />
            ))}
          </div>
        </div>

        <div className="glass-surface mt-4 p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-6 w-20" />
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>

          {[7, 4].map((tiles, section) => (
            <div key={section} className="glass-surface mt-4 p-5">
              <Skeleton className="h-3.5 w-40" />
              <div className="mt-3 grid grid-cols-4 gap-3">
                {Array.from({ length: tiles }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
