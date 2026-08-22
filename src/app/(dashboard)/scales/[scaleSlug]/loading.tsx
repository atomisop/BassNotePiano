import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * The course player is the heaviest authenticated route — it resolves the
 * scale's access state, its uploaded lessons and their per-user progress
 * before it can render anything, so it is the page most likely to be caught
 * mid-load. The skeleton mirrors its three stacked regions: the scale header,
 * the lesson list, then the explorer panels.
 */
export default function ScaleLoading() {
  return (
    <SkeletonScreen label="Loading this scale">
      <div className="mx-auto max-w-4xl">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-9 w-96 max-w-full" />
        <Skeleton className="mt-3 h-4 w-64" />

        <div className="glass-surface mt-8 p-6">
          <Skeleton className="h-4 w-32" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        </div>

        <div className="glass-surface mt-6 p-6">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-6 w-52" />
          <div className="mt-6 flex flex-wrap gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[74px] w-16 rounded-xl" />
            ))}
          </div>
          <Skeleton className="mt-8 h-64 w-full rounded-xl" />
        </div>
      </div>
    </SkeletonScreen>
  );
}
