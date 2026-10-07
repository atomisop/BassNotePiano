import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * `FriendsClient` groups its lists into `glass-surface` sections (friends,
 * requests received/sent, blocked) — each row is an avatar + name/username
 * pair, same shape `Avatar.tsx`/messaging's own list rows use. Two sections
 * shown; a real page may render more or fewer depending on pending
 * requests, but the skeleton only needs to read as "a list is loading",
 * not match the exact section count.
 */
export default function FriendsLoading() {
  return (
    <SkeletonScreen label="Loading friends">
      <WideLayout>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-3 h-8 w-48" />

        {Array.from({ length: 2 }).map((_, section) => (
          <div key={section} className="glass-surface mt-6 p-6">
            <Skeleton className="h-4 w-32" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="mt-1.5 h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </WideLayout>
    </SkeletonScreen>
  );
}
