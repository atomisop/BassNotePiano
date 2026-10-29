import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors Home in the order and widths it shows: the greeting; on phones one swipeable card with its dots, from md the band of cards (the
 * next step and practice, with next class, the week and progress in a right-hand column from xl); then the Your learning tabs with the
 * grid / list switch and the scale cards (one column on phones, up to four from xl) with the Show all button on phones.
 */
export default function RoadmapLoading() {
  return (
    <SkeletonScreen label="Loading your roadmap">
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

          {/* From xl: what to do on the left, next class, the week and progress stacked on the right (same as the real page). */}
          <div className="hidden md:block xl:grid xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start xl:gap-6">
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <div className="glass-surface h-40 p-5 md:col-span-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton delay={0.1} className="mt-3 h-6 w-64" />
                <Skeleton delay={0.2} className="mt-3 h-4 w-full max-w-md" />
                <Skeleton delay={0.3} className="mt-5 h-11 w-44 rounded-full" />
              </div>
              <div className="glass-surface h-44 p-5 md:col-span-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton delay={0.1} className="mt-3 h-6 w-56" />
                <Skeleton delay={0.2} className="mt-4 h-2 w-full rounded-full" />
                <Skeleton delay={0.3} className="mt-5 h-11 w-36 rounded-full" />
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3 xl:mt-0 xl:grid-cols-1">
              <div className="glass-surface h-32 p-5">
                <Skeleton className="h-3 w-20" />
                <Skeleton delay={0.1} className="mt-3 h-6 w-32" />
                <Skeleton delay={0.2} className="mt-4 h-9 w-28 rounded-full" />
              </div>
              <div className="glass-surface h-32 p-5">
                <Skeleton className="h-3 w-20" />
                <div className="mt-3 flex gap-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} delay={i * 0.06} className="h-8 w-8 rounded-full" />
                  ))}
                </div>
                <Skeleton delay={0.3} className="mt-4 h-3 w-24" />
              </div>
              <div className="glass-surface h-44 p-5">
                <Skeleton className="h-3 w-20" />
                <div className="mt-3 flex items-center gap-4">
                  <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
                  <div className="grid flex-1 grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} delay={i * 0.08} className="h-8 w-full" />
                    ))}
                  </div>
                </div>
              </div>
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
