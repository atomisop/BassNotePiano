import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors the page's own filter pills plus SupportChatPanel: a thread list
 * on the left, the active conversation on the right.
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

        <div className="glass-surface mt-6 flex h-[65vh] overflow-hidden">
          <div className="flex w-full shrink-0 flex-col gap-1 border-r border-ink/10 p-3 lg:w-72">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
          <div className="hidden flex-1 flex-col p-4 lg:flex">
            <Skeleton className="h-5 w-36" />
            <div className="mt-6 flex-1 space-y-3">
              <Skeleton className="h-10 w-2/3 rounded-2xl" />
              <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
