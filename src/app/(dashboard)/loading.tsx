import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * The fallback for every authenticated route that doesn't ship its own
 * loading.tsx.
 *
 * Deliberately generic — a heading, a lead line, and a couple of panels. Every
 * dashboard route is server-rendered on demand against Postgres, so without
 * something here a navigation renders nothing at all until the query returns.
 * Routes whose shape is distinctive enough to be worth matching (the
 * dashboard, a scale's course player) override this with their own.
 */
export default function DashboardSectionLoading() {
  return (
    <SkeletonScreen>
      <WideLayout>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-8 w-72 max-w-full" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />

        <div className="glass-surface mt-8 p-6">
          <Skeleton className="h-4 w-40" />
          <div className="mt-5 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>

        <div className="glass-surface mt-6 p-6">
          <Skeleton className="h-4 w-32" />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
