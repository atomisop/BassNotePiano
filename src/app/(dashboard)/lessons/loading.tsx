import { Skeleton, SkeletonCard, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Mirrors Book a class: the Discord button, the title and the Book / Upcoming / Past tabs, the audience tabs with the credits pill, then
 * on phones the calendar and the day's times stacked, and from lg the month agenda (month tabs, a row per day with time pills) on the
 * left with the calendar, its legend and the upcoming-classes card on the right.
 */
export default function LessonsLoading() {
  return (
    <SkeletonScreen label="Loading classes">
      <WideLayout>
        <div className="mx-auto w-full max-w-2xl lg:max-w-6xl">
          <Skeleton className="mb-4 h-9 w-full sm:w-44 rounded-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton delay={0.1} className="mt-2.5 h-10 w-56 max-w-full" />
          <div className="mt-(--space-group)">
            <Skeleton className="h-12 w-60 max-w-full rounded-full" />
          </div>

          <div className="mt-(--space-group)">
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <Skeleton className="h-12 w-64 max-w-full rounded-full" />
              <Skeleton className="h-10 w-16 rounded-full" />
            </div>

            <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
              {/* Right on a computer: calendar, legend, upcoming classes. Above the times on a phone. */}
              <div className="space-y-4 lg:order-2">
                <SkeletonCard className="p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-9 w-24" />
                  </div>
                  <div className="mt-3 grid grid-cols-7 gap-y-1">
                    {Array.from({ length: 14 }).map((_, i) => (
                      <Skeleton key={i} delay={i * 0.04} className="mx-auto h-10 w-10 rounded-full" />
                    ))}
                  </div>
                </SkeletonCard>
                <div className="hidden gap-4 px-1 lg:flex">
                  {[16, 20, 18].map((w, i) => (
                    <Skeleton key={i} className="h-3 rounded-full" style={{ width: w * 4 }} />
                  ))}
                </div>
                <SkeletonCard className="hidden lg:block">
                  <Skeleton className="mb-3 h-4 w-36" />
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} delay={i * 0.1} className="h-14 w-full rounded-xl" />
                    ))}
                  </div>
                </SkeletonCard>
              </div>

              {/* The day's times on a phone; the month agenda on a computer. */}
              <div className="mt-6 min-w-0 lg:order-1 lg:mt-0">
                <Skeleton className="mb-3 h-5 w-48 lg:hidden" />
                <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:hidden">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} delay={i * 0.06} className="h-[66px] rounded-xl" />
                  ))}
                </div>

                <div className="hidden lg:block">
                  <div className="mb-3 flex gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-16 rounded-full" />
                    ))}
                  </div>
                  <ol className="divide-y divide-(--neu-edge) rounded-2xl border border-(--neu-edge)">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <li key={i} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 px-3 py-3">
                        <div className="flex flex-col items-center gap-1">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <Skeleton className="h-2 w-6 rounded-full" />
                        </div>
                        {i % 3 === 1 ? (
                          <Skeleton delay={i * 0.05} className="h-3 w-24 rounded-full" />
                        ) : (
                          <div className="flex gap-2">
                            <Skeleton delay={i * 0.05} className="h-11 w-36 rounded-xl" />
                            {i % 2 === 0 && <Skeleton delay={i * 0.05 + 0.1} className="h-11 w-36 rounded-xl" />}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
