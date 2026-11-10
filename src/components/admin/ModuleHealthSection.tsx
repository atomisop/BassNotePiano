import { getModuleHealth } from "@/lib/admin";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Progress by scale, as rows (DESIGN.md, Hierarchy rule 8: similar things are rows, not a pile of equal boxes): the scale's name on the
 * left, its completion as the one figure on the right with a thin bar under the row, and the two counts behind it as a quiet line.
 * Meant to sit inside a Suspense, inside the Overview's "Progress by scale" disclosure.
 */
export async function ModuleHealthSection() {
  const moduleHealth = await getModuleHealth();

  return (
    <>
      <h2 className="sr-only">Module health</h2>
      <ul className="divide-y divide-slate-50/6">
        {moduleHealth.map((row) => {
          const rate = row.unlockedCount === 0 ? 0 : Math.round((row.completedCount / row.unlockedCount) * 100);
          return (
            <li key={row.slug} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-small font-medium text-slate-100">
                  <span className="text-slate-500">{row.code}</span> {row.title}
                </p>
                <p className="shrink-0 text-body font-semibold tabular-nums text-slate-50">{rate}%</p>
              </div>
              <div
                role="img"
                aria-label={`${row.code} completion ${rate}%`}
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-50/10"
              >
                <div className="h-full origin-left rounded-full bg-signal" style={{ transform: `scaleX(${rate / 100})` }} />
              </div>
              <p className="mt-1 text-caption tabular-nums text-slate-500">
                {row.unlockedCount} unlocked · {row.completedCount} completed
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Same footprint as the real rows so nothing shifts when they fill in. */
export function ModuleHealthSkeleton() {
  return (
    <div aria-hidden>
      <div className="divide-y divide-slate-50/6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="mt-2 h-1 w-full" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
