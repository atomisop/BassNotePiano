import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors the page's own filter pills plus PaymentQueue: a stack of payment
 * cards, each with a label/value grid for the transfer details.
 */
export default function AdminPaymentsLoading() {
  return (
    <SkeletonScreen label="Loading payments">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />

        <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full border border-ink/10 p-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-surface p-5">
              <Skeleton className="h-4 w-48" />
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j}>
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="mt-1.5 h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
