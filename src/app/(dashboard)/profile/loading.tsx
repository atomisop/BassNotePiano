import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors Profile: the Back link, the band (your picture and name, with this week's practice days and Edit profile on its sheet), the
 * four tiles, then the Badges card (a title and the count over the groups of tiles).
 */
export default function ProfileLoading() {
  return (
    <SkeletonScreen label="Loading profile">
      <WideLayout>
        <Skeleton className="h-5 w-16" />
        <Skeleton className="mt-6 h-56 w-full rounded-sheet" />
        {/* The tiles. */}
        <Skeleton className="mt-6 h-3 w-40" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>

        <div className="lgx-card rounded-card mt-6 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
          {[7, 4].map((count, section) => (
            <div key={section} className="mt-5">
              <Skeleton className="h-3.5 w-40" />
              <div className="mt-3 flex flex-wrap gap-3">
                {Array.from({ length: count }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-16 rounded-card" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
