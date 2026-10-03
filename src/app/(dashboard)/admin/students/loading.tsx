import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors the page's own filter pills plus StudentQueue: registration
 * cards, each with a label/value grid for the applicant's details.
 */
export default function AdminStudentsLoading() {
  return (
    <SkeletonScreen label="Loading students">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-64" />

        <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full p-1 bg-neu-base shadow-pressed-low">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-surface p-5">
              <Skeleton className="h-4 w-40" />
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j}>
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="mt-1.5 h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
