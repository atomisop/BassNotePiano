import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Mirrors Plans: the title, filter pills, then one card per plan (name, status badge, a label and value grid). */
export default function AdminPaymentPlansLoading() {
  return (
    <SkeletonScreen label="Loading plans">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        <div className="mt-6 flex w-fit max-w-full flex-wrap gap-1.5 rounded-full bg-neu-base p-1 shadow-pressed-low">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-2 h-5 w-48 max-w-full" />
                  <Skeleton className="mt-2 h-3.5 w-40 max-w-full" />
                </div>
                <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j}>
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="mt-1.5 h-4 w-24" />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
