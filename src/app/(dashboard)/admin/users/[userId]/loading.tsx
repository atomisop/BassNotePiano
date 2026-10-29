import { Skeleton, SkeletonAvatar, SkeletonCard, SkeletonPill, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors the student page: Back, the Admin eyebrow and name, the strip of seven facts (plan, next bill, credits, next class, Discord,
 * streak, last active), the row of section tabs, then the open section's rows.
 */
export default function AdminCustomerLoading() {
  return (
    <SkeletonScreen label="Loading student">
      <div>
        <Skeleton className="h-3.5 w-12" />
        <Skeleton className="mt-3 h-3 w-12" />
        <Skeleton className="mt-2 h-10 w-64" />

        <SkeletonCard className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i}>
              <Skeleton delay={i * 0.06} className="h-3 w-12 rounded-full" />
              <Skeleton delay={i * 0.06} className="mt-2 h-4 w-20 rounded-full" />
            </div>
          ))}
        </SkeletonCard>

        <div className="mt-6 flex w-fit max-w-full gap-1 rounded-full bg-neu-base p-1 shadow-pressed-low">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonPill key={i} className="h-8 w-16 sm:w-20" />
          ))}
        </div>

        <div className="mt-5 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} className="flex items-center gap-3 p-3">
              <SkeletonAvatar size={32} />
              <div className="min-w-0 flex-1">
                <Skeleton delay={i * 0.08} className="h-4 w-40 rounded-full" />
                <Skeleton delay={i * 0.08} className="mt-1.5 h-3 w-24 rounded-full" />
              </div>
              <Skeleton className="hidden h-8 w-20 sm:block" />
              <Skeleton className="hidden h-8 w-20 sm:block" />
            </SkeletonCard>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
