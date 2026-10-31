import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Mirrors /billing/history: the Back link, the Billing eyebrow and title, then the payment cards (a title and date left, an amount and status right). */
export default function BillingHistoryLoading() {
  return (
    <SkeletonScreen label="Loading payment history">
      <div>
        <Skeleton className="mb-4 h-5 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2.5 h-10 w-64 max-w-full" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
