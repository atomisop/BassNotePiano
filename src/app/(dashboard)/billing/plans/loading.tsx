import { Skeleton, SkeletonCard, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors /billing/plans for someone starting a plan: the Back row with the history clock, the title (centered, left from xl), the
 * Just me / family switch, the three plan-length cards and the day chips; then the price bar (pinned above the dock on phones, under
 * the content on a laptop, and from xl a card in a right-hand column with its Review button).
 */
export default function BillingPlansLoading() {
  return (
    <SkeletonScreen label="Loading payment plan">
      <div className="mx-auto w-full max-w-2xl xl:max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
        <div className="flex flex-col items-center xl:items-start">
          <Skeleton className="h-3 w-28" />
          <Skeleton delay={0.1} className="mt-2.5 h-10 w-56" />
        </div>

        <div className="mt-8 space-y-6 xl:grid xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start xl:gap-x-8 xl:gap-y-6 xl:space-y-0">
          <div className="lg:flex lg:justify-center xl:col-start-1">
            <Skeleton className="h-12 w-72 max-w-full rounded-full" />
          </div>

          <div className="space-y-6 xl:col-start-1">
            <div>
              <Skeleton className="mb-2 h-4 w-24" />
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} delay={i * 0.1} className="h-[104px] rounded-control" />
                ))}
              </div>
            </div>

            <div>
              <Skeleton className="mb-2 h-4 w-32" />
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} delay={i * 0.06} className="min-h-14" />
                ))}
              </div>
            </div>
          </div>

          {/* The price bar: above the dock on phones, under the content on a laptop, a right-hand card from xl. */}
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(max(1.25rem,env(safe-area-inset-bottom,0px)-0.25rem)+4.25rem)] z-30 flex justify-center px-4 lg:static lg:mt-0 lg:block lg:px-0 xl:col-start-2 xl:row-start-1 xl:row-span-2">
            <div className="w-full max-w-xl lg:max-w-none">
              <Skeleton className="h-[72px] rounded-2xl xl:hidden" />
              <SkeletonCard className="hidden space-y-3 p-5 xl:block">
                <Skeleton className="h-6 w-40" />
                <Skeleton delay={0.1} className="h-3.5 w-56 rounded-full" />
                <Skeleton delay={0.2} className="h-11 w-full rounded-full" />
              </SkeletonCard>
            </div>
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
