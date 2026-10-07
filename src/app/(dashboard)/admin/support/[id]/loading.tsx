import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Mirrors the conversation page: a Back link, then the header, messages and reply box. */
export default function SupportThreadLoading() {
  return (
    <SkeletonScreen label="Loading conversation">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <div className="glass-surface flex h-[calc(100dvh-21rem)] min-h-[360px] lg:h-[calc(100dvh-19rem)] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
          <div className="flex-1 space-y-3 p-4">
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-10 w-3/5 rounded-2xl" />
          </div>
          <div className="border-t border-ink/10 p-3">
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
