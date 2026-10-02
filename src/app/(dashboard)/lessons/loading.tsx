import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/** Mirrors Book a class: booking on the left, credits and bookings panel on the right. */
export default function LessonsLoading() {
  return (
    <SkeletonScreen label="Loading classes">
      <WideLayout>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-12 w-72 max-w-full" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <div className="mt-(--space-group) grid gap-(--space-group) lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
            <Skeleton className="h-11 w-72 max-w-full rounded-full" />
            <div className="glass-surface h-72 p-5" />
          </div>
          <div className="space-y-4 lg:col-start-2 lg:row-start-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-surface p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-5 w-32" />
              </div>
            ))}
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
