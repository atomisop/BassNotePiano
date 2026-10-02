import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/**
 * Matches ClassBookingClient's real shape (eyebrow + h1 + subtitle, then the
 * credit-balance bar, then grouped occurrence rows) rather than the generic
 * (dashboard)/loading.tsx fallback: this page's booking-mode toggle and
 * credit balance are distinctive enough, and visited often enough, to be
 * worth the dedicated skeleton the shared fallback's own comment reserves
 * for exactly that case.
 */
export default function LessonsLoading() {
  return (
    <SkeletonScreen>
      <WideLayout>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />

        <div className="glass-surface mt-6 flex items-center justify-between gap-3 p-5">
          <div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2 h-7 w-20" />
          </div>
          <Skeleton className="h-9 w-40 rounded-full" />
        </div>

        {Array.from({ length: 2 }).map((_, groupIndex) => (
          <div key={groupIndex} className="mt-8">
            <Skeleton className="mb-2 h-3 w-24" />
            <div className="glass-surface divide-y divide-ink/10 overflow-hidden">
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 max-w-full" />
                    <Skeleton className="mt-2 h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-20 shrink-0 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </WideLayout>
    </SkeletonScreen>
  );
}
