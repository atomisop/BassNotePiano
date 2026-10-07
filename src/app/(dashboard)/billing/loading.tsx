import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Covers `/billing/plans`, `/billing/history`, and `/billing/lessons`
 * (none of them defines its own loading.tsx). `BillingLayout` already
 * centers its children (`flex min-h-[70vh] items-center justify-center`),
 * so this only needs to be a single centered card, not a full-page shape —
 * matching the benefit-list-plus-price composition `billing/curriculum`
 * itself uses, close enough for the other two as well.
 */
export default function BillingLoading() {
  return (
    <SkeletonScreen label="Loading billing">
      <div className="glass-surface-elevated w-full p-8">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-7 w-full" />
        <Skeleton className="mt-1.5 h-7 w-2/3" />

        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
            </div>
          ))}
        </div>

        <Skeleton className="mt-8 h-9 w-28" />
        <Skeleton className="mt-6 h-11 w-full rounded-full" />
      </div>
    </SkeletonScreen>
  );
}
