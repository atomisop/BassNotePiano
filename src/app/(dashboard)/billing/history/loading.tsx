import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Mirrors /billing/history: the Back link, the Billing eyebrow and title, the band with its sheet, two tiles, then the payment rows (the amount, what it was for and when on the left, its status on the right). */
export default function BillingHistoryLoading() {
  return (
    <SkeletonScreen label="Loading payment history">
      <div className="mx-auto w-full max-w-wide">
        <Skeleton className="mb-4 h-5 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2.5 h-10 w-64 max-w-full" />
        <Skeleton className="mt-6 h-52 w-full rounded-sheet" />
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
        </div>
        <div className="lgx-card mt-6 divide-y divide-slate-50/8 rounded-card px-4 sm:px-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start justify-between gap-3 py-3.5">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3.5 w-44" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
