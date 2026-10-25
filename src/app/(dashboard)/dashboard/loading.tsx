import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors Home in the order and widths it shows: the greeting; on phones one swipeable card with its dots, from md the band of cards (the
 * next step across, practice and next class two columns each, then the week and progress cards); then the Your learning tabs with the
 * grid / list switch and the scale cards (one column on phones, up to four from xl) with the Show all button on phones.
 */
export default function DashboardLoading() {
  return (
    <SkeletonScreen label="Loading your dashboard">
      <WideLayout>
        <div className="grid grid-cols-1 gap-y-(--space-group)">
          <div className="pt-4 md:pt-6">
            <Skeleton className="h-12 w-3/4 md:h-16 md:w-1/2" />
          </div>

          <div className="md:hidden">
            <div className="glass-surface h-52 p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-6 w-3/4" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-6 h-11 w-40" />
            </div>
            <div className="mt-2 flex justify-center gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-2 w-2 rounded-full" />
              ))}
            </div>
          </div>

          <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
            <div className="glass-surface h-40 p-5 md:col-span-2 lg:col-span-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-6 w-64" />
              <Skeleton className="mt-3 h-4 w-full max-w-md" />
              <Skeleton className="mt-5 h-11 w-44" />
            </div>
            <div className="glass-surface h-44 p-5 lg:col-span-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-6 w-56" />
              <Skeleton className="mt-4 h-2 w-full" />
              <Skeleton className="mt-5 h-11 w-36" />
            </div>
            <div className="glass-surface h-44 p-5 lg:col-span-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-6 w-40" />
              <Skeleton className="mt-5 h-11 w-36" />
            </div>
            <div className="glass-surface h-32 p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-7 w-24" />
            </div>
            <div className="glass-surface h-32 p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-7 w-24" />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Skeleton className="h-12 w-80 max-w-full rounded-full" />
              <Skeleton className="h-11 w-24 rounded-full" />
            </div>
            <div className="mt-(--space-group) grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className={`glass-surface h-44 p-5 ${i >= 4 ? "max-md:hidden" : ""}`}>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-3 h-5 w-40 max-w-full" />
                  <Skeleton className="mt-6 h-4 w-24" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-3 h-11 w-full rounded-full md:hidden" />
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
