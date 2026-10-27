import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/** Mirrors a child's page: back link, name, the four tabs, then the first tab's rows. */
export default function ChildLoading() {
  return (
    <SkeletonScreen label="Loading">
      <WideLayout>
        <Skeleton className="h-4 w-14" />
        <Skeleton className="mt-4 h-3 w-24" />
        <Skeleton className="mt-2.5 h-10 w-56" />
        <Skeleton className="mt-6 h-11 w-full max-w-md rounded-full" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-surface flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-3.5 w-3/4" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
