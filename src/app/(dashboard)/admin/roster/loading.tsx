import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * The one admin page that's a real <table> (StudentRosterTable, via the
 * shared DataTable): a search bar, a header row, then data rows, not the
 * card-stack shape most other admin pages use.
 */
export default function AdminRosterLoading() {
  return (
    <SkeletonScreen label="Loading student roster">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-full max-w-md" />

        <div className="mt-6">
          <Skeleton className="h-10 w-full max-w-xs" />
          <div className="mt-4 space-y-px overflow-hidden rounded-lg border border-ink/10">
            <Skeleton className="h-10 w-full rounded-none" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-none" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
