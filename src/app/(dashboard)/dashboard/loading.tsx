import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors the real Home layout (greeting, next step, tabs and scale grid in
 * the main column; week, progress, class, and badges in the right panel) so
 * the page doesn't visibly re-flow when the data lands. A skeleton that
 * promises one shape and delivers another reads as the page breaking.
 */
export default function DashboardLoading() {
  return (
    <SkeletonScreen label="Loading your dashboard">
      <WideLayout>
        <div className="grid gap-x-(--space-section) gap-y-(--space-group) lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_auto_1fr] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="pt-10 md:pt-16 lg:col-start-1">
            <Skeleton className="h-12 w-3/4 md:h-16" />
          </div>

          <div className="glass-surface p-6 lg:col-start-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-5 w-64 max-w-full" />
            <Skeleton className="mt-2 h-4 w-full max-w-md" />
            <Skeleton className="mt-5 h-11 w-36 rounded-control" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:grid-cols-1 lg:content-start">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass-surface p-6">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-8 w-full" />
              </div>
            ))}
          </div>

          <div className="lg:col-start-1">
            <Skeleton className="h-11 w-80 max-w-full rounded-full" />
            <div className="mt-(--space-group) grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="glass-surface h-48 p-5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-3 h-5 w-40 max-w-full" />
                  <Skeleton className="mt-6 h-1 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
