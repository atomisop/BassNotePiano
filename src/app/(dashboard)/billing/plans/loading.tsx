import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors /billing/plans for someone starting a plan: the Back row with the history clock, the title (centered on phones), the
 * Just me / others switch, the three plan-length cards, the day chips, and the price card with its Review button at the end.
 */
export default function BillingPlansLoading() {
  return (
    <SkeletonScreen label="Loading payment plan">
      <div className="mx-auto w-full max-w-2xl md:max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
        <div className="flex flex-col items-center md:items-start">
          <Skeleton className="h-3 w-28" />
          <Skeleton delay={0.1} className="mt-2.5 h-10 w-56" />
        </div>

        <div className="mt-8 space-y-6 md:space-y-8">
          <div className="flex justify-center md:justify-start">
            <Skeleton className="h-12 w-72 max-w-full rounded-full" />
          </div>
          <div>
            <Skeleton className="mb-3 h-3 w-24" />
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} delay={i * 0.1} className="h-[104px] rounded-control" />
              ))}
            </div>
          </div>
          <div>
            <Skeleton className="mb-3 h-3 w-32" />
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} delay={i * 0.06} className="min-h-14" />
              ))}
            </div>
          </div>
          <Skeleton className="h-[88px] rounded-card" />
        </div>
      </div>
    </SkeletonScreen>
  );
}
