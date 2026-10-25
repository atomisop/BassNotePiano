import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors /billing/plans for someone starting a plan, in the same order and sizes: the Back row with the history clock, the centered
 * title, the Just me / family switch, the three plan-length cards, the day chips, and the price bar (fixed above the dock on
 * phones, in the flow on computers) with its Review button.
 */
export default function BillingPlansLoading() {
  return (
    <SkeletonScreen label="Loading payment plan">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
        <div className="flex flex-col items-center">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-2.5 h-10 w-56" />
        </div>

        <div className="mt-8 space-y-6">
          <div className="lg:flex lg:justify-center">
            <Skeleton className="h-12 w-72 max-w-full rounded-full" />
          </div>

          <div>
            <Skeleton className="mb-2 h-4 w-24" />
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[104px] rounded-control" />
              ))}
            </div>
          </div>

          <div>
            <Skeleton className="mb-2 h-4 w-32" />
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="min-h-14" />
              ))}
            </div>
          </div>
        </div>

        {/* The price bar: pinned above the dock on phones, resting under the content from lg up. */}
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(max(1.25rem,env(safe-area-inset-bottom,0px)-0.25rem)+4.25rem)] z-30 flex justify-center px-4 lg:static lg:mt-6 lg:block lg:px-0">
          <div className="w-full max-w-xl lg:max-w-none">
            <Skeleton className="h-[72px] rounded-2xl" />
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
