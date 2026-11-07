import { Skeleton, SkeletonAvatar, SkeletonScreen, SkeletonText } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/** A heading block (eyebrow, title, one line) shared by the generic screens below. */
function Heading({ title = true }: { title?: boolean }) {
  return (
    <div>
      <Skeleton className="h-3 w-14" />
      {title && <Skeleton className="mt-2.5 h-9 w-48" />}
      <Skeleton className="mt-3 h-4 w-full max-w-md" />
    </div>
  );
}

/** A page of stacked cards, each a title line and a few rows: the shape of most admin screens. */
export function CardListSkeleton({ label, cards = 3, rows = 3, heading = true }: { label: string; cards?: number; rows?: number; heading?: boolean }) {
  return (
    <SkeletonScreen label={label}>
      <div>
        {heading && <Heading />}
        <div className={heading ? "mt-6 space-y-4" : "space-y-4"}>
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="glass-surface p-5">
              <Skeleton className="h-5 w-40" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: rows }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <SkeletonAvatar size={32} />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="mt-1.5 h-3.5 w-1/2" />
                    </div>
                    <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
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

/** One page about one thing (a message, a receipt, a contact): a header and a body of text. */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <SkeletonScreen label={label}>
      <div className="mx-auto max-w-xl">
        <Skeleton className="h-8 w-20 rounded-full" />
        <div className="glass-surface mt-4 p-6">
          <div className="flex items-center gap-3">
            <SkeletonAvatar size={40} />
            <div className="flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-1.5 h-3.5 w-1/4" />
            </div>
          </div>
          <Skeleton className="mt-6 h-7 w-2/3" />
          <SkeletonText lines={5} className="mt-5" />
        </div>
      </div>
    </SkeletonScreen>
  );
}

/** A ranked list under a heading (Leaderboard) or a streak card with its rows (Streak). */
export function RankedSkeleton({ label }: { label: string }) {
  return (
    <SkeletonScreen label={label}>
      <WideLayout>
        <Heading />
        <div className="glass-surface mt-6 p-6">
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 shrink-0" />
                <SkeletonAvatar size={36} />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="ml-auto h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
