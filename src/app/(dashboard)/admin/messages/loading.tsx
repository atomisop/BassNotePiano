import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * No eyebrow/heading here: AdminMessagesClient (like the student-facing
 * messages page) renders its split-pane layout as the entire page, with no
 * page-level header above it, matching that, not inventing one.
 */
export default function AdminMessagesLoading() {
  return (
    <SkeletonScreen label="Loading messages">
      <div className="glass-surface flex h-[70vh] overflow-hidden">
        <div className="flex w-full shrink-0 flex-col gap-1 border-r border-ink/10 p-3 lg:w-72">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
        <div className="hidden flex-1 flex-col p-4 lg:flex">
          <Skeleton className="h-5 w-40" />
          <div className="mt-6 flex-1 space-y-3">
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-10 w-3/5 rounded-2xl" />
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
