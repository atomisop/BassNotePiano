import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors About: the Back link, the eyebrow and title, then the four sections (About, Update notes, Terms & refunds, Privacy) as one card
 * of rows on phones, and from lg the same menu beside the open section's text.
 */
export default function AboutLoading() {
  return (
    <SkeletonScreen label="Loading">
      <WideLayout>
        <Skeleton className="mb-4 h-5 w-16" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="mt-2.5 h-10 w-36" />

        <div className="mt-6 lg:flex lg:gap-8">
          <div className="glass-surface divide-y divide-[rgb(var(--c-s-50)/0.08)] lg:h-fit lg:w-56 lg:shrink-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex h-[53px] items-center gap-3 px-4">
                <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
          <div className="mt-6 hidden min-w-0 flex-1 lg:mt-0 lg:block">
            <div className="glass-surface p-6">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-2 h-6 w-32" />
              <div className="mt-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
