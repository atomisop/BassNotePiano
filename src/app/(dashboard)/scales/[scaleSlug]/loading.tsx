import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors the three-zone lesson page: outline, lesson + instrument, and the
 * tool rail (the outline and rail only from lg up, like the real page).
 */
export default function ScaleLoading() {
  return (
    <SkeletonScreen label="Loading lesson">
      <WideLayout>
        <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)_4rem]">
          <div className="glass-surface hidden space-y-3 p-5 lg:block">
            <Skeleton className="h-3 w-20" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
          <div className="min-w-0">
            <Skeleton className="mt-12 h-3 w-40" />
            <Skeleton className="mt-3 h-12 w-2/3" />
            <Skeleton className="mt-6 aspect-video w-full rounded-card" />
            <Skeleton className="mt-6 h-44 w-full rounded-card" />
          </div>
          <div className="glass-surface hidden h-96 lg:block" />
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
