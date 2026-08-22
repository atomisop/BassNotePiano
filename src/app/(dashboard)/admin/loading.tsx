import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Covers `/admin` itself and, by Next's own loading.tsx cascade rules,
 * every sub-route under it that doesn't ship a more specific one
 * (announcements, bookings, credits, lessons, messages, payments, roster,
 * students, users) — none of them currently do. `AdminLayout` renders this
 * inside its own `<div className="mx-auto max-w-5xl"><AdminNav />…</div>`,
 * so the nav itself never disappears mid-navigation — only the content
 * below it swaps to this skeleton, matching how the real nav behaves today.
 *
 * Shape is a hybrid on purpose: the overview page is two metric cards over
 * a stats panel, every other admin route is a `DataTable` (search/filter
 * bar + rows). Rather than two separate skeletons for the one segment,
 * this shows both — close enough to either real shape that neither reads
 * as "wrong", which matters more here than being pixel-exact to whichever
 * specific sub-route happens to be loading.
 */
export default function AdminLoading() {
  return (
    <SkeletonScreen label="Loading admin">
      <Skeleton className="h-3 w-12" />
      <Skeleton className="mt-1.5 h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />

      {/* Metric cards — present on the overview only, harmless elsewhere. */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="glass-surface p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-4 h-10 w-full" />
          </div>
        ))}
      </div>

      {/* Table shape — the common case for every sub-route. */}
      <div className="glass-surface mt-6 p-5">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-9 w-52 max-w-[50%] rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <div className="mt-5 space-y-2.5">
          <div className="flex gap-4 border-b border-[rgb(var(--c-s-50)/0.08)] pb-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-20" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-1">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
