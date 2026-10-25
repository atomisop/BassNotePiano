import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors Book a class in the order and sizes it shows: the Discord button, the title, the Book / Upcoming / Past tabs, the audience
 * tabs with the credits pill, then the calendar and the day's times (stacked on phones, side by side from lg up, two times to a row).
 */
export default function LessonsLoading() {
  return (
    <SkeletonScreen label="Loading classes">
      <WideLayout>
        <div className="mx-auto w-full max-w-2xl">
        <Skeleton className="mb-4 h-9 w-full sm:w-44" />
        <div className="flex flex-col lg:items-center">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2.5 h-10 w-56 max-w-full" />
        </div>
        <div className="mt-(--space-group) lg:flex lg:justify-center">
          <Skeleton className="h-12 w-60 max-w-full rounded-full" />
        </div>

        <div className="mt-(--space-group)">
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-12 w-64 max-w-full rounded-full" />
            <Skeleton className="h-10 w-16 rounded-full" />
          </div>

          <div className="mt-5">
            <div className="glass-surface p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-9 w-24" />
              </div>
              <div className="mt-3 grid grid-cols-7 gap-y-1">
                {Array.from({ length: 14 }).map((_, i) => (
                  <Skeleton key={i} className="mx-auto h-10 w-10 rounded-full" />
                ))}
              </div>
            </div>

            <div className="mt-6 min-w-0">
              <Skeleton className="mb-3 h-5 w-48" />
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[66px] rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
