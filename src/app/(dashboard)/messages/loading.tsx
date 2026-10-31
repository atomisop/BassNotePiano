import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors MessagesClient: one glass panel as tall as the real one (the screen minus the app chrome), holding the conversation list on the
 * left (the whole panel on phones, 350px from md) and the open chat beside it (md and up only: on phones the list is what shows first).
 * The list has the Social eyebrow, the Messages title, the search box, then the Support row and the conversations.
 */
export default function MessagesLoading() {
  return (
    <SkeletonScreen label="Loading messages">
      <div className="mx-auto w-full max-w-wide">
        <div className="glass-surface flex h-[calc(100dvh-13.5rem)] overflow-hidden md:h-[calc(100dvh-14.5rem)]">
          <div className="flex w-full flex-col overflow-hidden md:w-[350px] md:shrink-0">
            <div className="px-4 pb-3 pt-4">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="mt-2 h-10 w-44" />
              <Skeleton className="mt-3 h-11 w-full rounded-full" />
            </div>
            <div className="space-y-1 px-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="mt-1.5 h-3.5 w-4/5" />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 pt-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-9 w-9 rounded-full" />
              </div>
            </div>
          </div>

          <div className="hidden min-w-0 flex-1 flex-col p-5 md:flex">
            <div className="flex items-center gap-3 border-b border-slate-50/8 pb-4">
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
      </div>
    </SkeletonScreen>
  );
}
