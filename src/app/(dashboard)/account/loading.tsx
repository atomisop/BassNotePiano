import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors AccountSettings: the same sticky-nav shell as /about, with the
 * main panel's settings sections stacked instead of one text block.
 */
export default function AccountLoading() {
  return (
    <SkeletonScreen label="Loading account">
      <div className="mx-auto flex max-w-4xl gap-8">
        <div className="hidden w-56 shrink-0 flex-col gap-1 lg:flex">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-6">
          <Skeleton className="h-8 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-surface p-6">
              <Skeleton className="h-5 w-40" />
              <div className="mt-4 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
