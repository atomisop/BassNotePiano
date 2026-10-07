import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * `MessagesClient` is a two-pane layout — a conversation/group list on the
 * left, the active chat on the right — so the skeleton mirrors that split
 * rather than the generic single-column fallback. On narrow screens the
 * real client shows one pane at a time; the skeleton keeps both stacked
 * side-by-side-collapsing-to-stacked the same way the real layout does via
 * `hidden md:block` on the list pane.
 */
export default function MessagesLoading() {
  return (
    <SkeletonScreen label="Loading messages">
      <div className="glass-surface flex h-[calc(100vh-8rem)] max-h-[720px] overflow-hidden">
        {/* Conversation list */}
        <div className="hidden w-72 shrink-0 border-r border-[rgb(var(--c-s-50)/0.08)] p-4 md:block">
          <Skeleton className="h-8 w-full rounded-lg" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="mt-1.5 h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active chat */}
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-center gap-3 border-b border-[rgb(var(--c-s-50)/0.08)] pb-4">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="mt-5 flex flex-1 flex-col justify-end gap-3">
            <Skeleton className="h-9 w-2/5 max-w-xs rounded-2xl" />
            <Skeleton className="ml-auto h-9 w-1/2 max-w-xs rounded-2xl" />
            <Skeleton className="h-9 w-1/3 max-w-xs rounded-2xl" />
          </div>
          <Skeleton className="mt-5 h-11 w-full rounded-full" />
        </div>
      </div>
    </SkeletonScreen>
  );
}
