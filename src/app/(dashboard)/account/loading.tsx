import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

const GROUPS = [1, 2, 1, 3];

/**
 * Mirrors Settings: the eyebrow and title, then on phones the grouped list (a small label over a card of rows, one group each for
 * Account, Preferences, Billing and Help), and from lg the sticky menu card beside the open section (a row of section chips, a label and
 * the section's cards).
 */
export default function AccountLoading() {
  return (
    <SkeletonScreen label="Loading settings">
      <div className="mx-auto w-full max-w-settings">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2.5 h-10 w-44" />

        <div className="mt-6 space-y-5 lg:hidden">
          {GROUPS.map((rows, g) => (
            <div key={g}>
              <Skeleton className="mb-2 h-3 w-20" />
              <div className="glass-surface divide-y divide-slate-50/8">
                {Array.from({ length: rows }).map((_, i) => (
                  <div key={i} className="flex h-14 items-center gap-3 px-4">
                    <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 hidden gap-8 lg:flex">
          <div className="glass-surface h-[512px] w-56 shrink-0 space-y-3 p-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className={i % 3 === 0 ? "h-3 w-20" : "h-9 w-full rounded-xl"} />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-24 rounded-full" />
              ))}
            </div>
            <Skeleton className="mt-8 h-4 w-16" />
            <div className="glass-surface mt-3 p-6">
              <Skeleton className="h-5 w-36" />
              <div className="mt-5 space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
              <Skeleton className="mt-5 h-10 w-52" />
            </div>
            <Skeleton className="mt-8 h-4 w-20" />
            <div className="glass-surface mt-3 h-36 p-6">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-4 h-4 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
