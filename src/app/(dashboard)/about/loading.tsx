import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors AboutClient: a sticky left-hand tab nav (About / Update notes /
 * Terms & refunds / Privacy) beside the active tab's content panel.
 */
export default function AboutLoading() {
  return (
    <SkeletonScreen label="Loading">
      <WideLayout className="flex gap-8">
        <div className="hidden w-56 shrink-0 flex-col gap-1 lg:flex">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="glass-surface p-6">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-1 h-6 w-32" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
