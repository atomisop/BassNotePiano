import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors Friends: the title, the band (what is waiting, with the search box on its sheet), the four tiles, then the Friends card with
 * its rows (a picture, a name and username, and an action).
 */
export default function FriendsLoading() {
  return (
    <SkeletonScreen label="Loading friends">
      <WideLayout>
        <Skeleton className="h-10 w-40" />
        {/* The band and its sheet. */}
        <Skeleton className="mt-6 h-44 w-full rounded-sheet" />
        {/* The tiles. */}
        <Skeleton className="mt-6 h-3 w-40" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>

        <div className="lgx-card rounded-card mt-6 p-5 sm:p-6">
          <Skeleton className="h-4 w-24" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-1.5 h-3.5 w-1/4" />
                </div>
                <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
