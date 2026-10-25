import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors Friends: the eyebrow, title and your @username line, the Find people card (a title and the search box with its button), then the
 * Friends card with its rows (a picture, a name and username, and an action).
 */
export default function FriendsLoading() {
  return (
    <SkeletonScreen label="Loading friends">
      <WideLayout>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-2.5 h-10 w-40" />
        <Skeleton className="mt-3 h-4 w-36" />

        <div className="glass-surface mt-6 p-6">
          <Skeleton className="h-5 w-28" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-11 flex-1 rounded-full" />
            <Skeleton className="h-11 w-24 rounded-full" />
          </div>
        </div>

        <div className="glass-surface mt-6 p-6">
          <Skeleton className="h-5 w-24" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-1.5 h-3.5 w-1/4" />
                </div>
                <Skeleton className="h-9 w-20 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
