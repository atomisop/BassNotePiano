import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors the real dashboard's block structure — greeting, the elevated
 * next-step card, the stats row, then the roadmap — so the page doesn't
 * visibly re-flow when the data lands.
 *
 * A skeleton that doesn't match the layout it's standing in for is worse than
 * no skeleton: it promises one shape and delivers another, which reads as the
 * page breaking rather than loading.
 */
export default function DashboardLoading() {
  return (
    <SkeletonScreen label="Loading your dashboard">
      <WideLayout>
        <Skeleton className="h-9 w-64 sm:h-10" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />

        {/* Next step — the elevated card */}
        <div className="glass-surface-elevated mt-7 p-6 sm:p-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-72 max-w-full" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl" />
          <Skeleton className="mt-6 h-10 w-44 rounded-full" />
        </div>

        {/* Stats */}
        <div className="glass-surface mt-6 p-6">
          <div className="grid grid-cols-2 gap-y-6 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-7 w-14" />
                <Skeleton className="mt-2 h-3 w-20" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-8 h-1.5 w-full rounded-full" />
        </div>

        {/* Roadmap rows */}
        <div className="mt-10">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-72 max-w-full" />
          <div className="mx-auto mt-6 max-w-2xl space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <Skeleton className="h-32 flex-1 rounded-2xl" />
              </div>
            ))}
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
