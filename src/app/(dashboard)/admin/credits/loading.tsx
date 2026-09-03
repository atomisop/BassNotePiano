import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors AdminCreditGrantPanel: a student search + recent-adjustments list
 * on the left, the grant/deduct form on the right.
 */
export default function AdminCreditsLoading() {
  return (
    <SkeletonScreen label="Loading class credits">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Skeleton className="h-10 w-full" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
          <div className="glass-surface p-5">
            <Skeleton className="h-4 w-28" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-36 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
