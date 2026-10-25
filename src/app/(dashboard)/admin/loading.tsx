import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * The fallback for the Overview and every admin page that has no loading screen of its own. The hub tabs above it stay on screen (they
 * live in the admin layout), so this holds the page's own part in the order every admin page uses: the Admin eyebrow and title, a row of
 * filter pills, then the cards or rows the page lists.
 */
export default function AdminLoading() {
  return (
    <SkeletonScreen label="Loading admin">
      <Skeleton className="h-3 w-12" />
      <Skeleton className="mt-2.5 h-10 w-48" />

      <div className="mt-5 flex w-fit max-w-full flex-wrap gap-1.5 rounded-full bg-neu-base p-1 shadow-pressed-low">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass-surface flex items-center gap-4 p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-2 h-3.5 w-1/2" />
            </div>
            <Skeleton className="hidden h-8 w-24 shrink-0 sm:block" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}
