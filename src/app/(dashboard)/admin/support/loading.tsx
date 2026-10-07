import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors the page's own tabs and filter pills plus the list of conversations.
 */
export default function AdminSupportLoading() {
  return (
    <SkeletonScreen label="Loading support">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />

        <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full p-1 bg-neu-base shadow-pressed-low">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>

        <div className="glass-surface mt-6 divide-y divide-ink/10 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
