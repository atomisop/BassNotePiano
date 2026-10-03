import { getModuleHealth } from "@/lib/admin";
import { Skeleton } from "@/components/ui/Skeleton";

/** Fetches and renders the module-health list. Meant to sit inside a Suspense. */
export async function ModuleHealthSection() {
  const moduleHealth = await getModuleHealth();

  return (
    <>
      <h2 className="mb-1 text-body text-slate-100 font-semibold">Module health</h2>
      <p className="mb-4 text-small text-slate-500">Unlocks and completions across the whole user base.</p>
      <div className="overflow-hidden glass-surface">
        {moduleHealth.map((row, i) => {
          const rate = row.unlockedCount === 0 ? 0 : Math.round((row.completedCount / row.unlockedCount) * 100);
          return (
            <div
              key={row.slug}
              className={`flex flex-wrap items-center justify-between gap-4 px-6 py-4 ${
                i > 0 ? "border-t border-ink/5" : ""
              }`}
            >
              <div>
                <p className="text-small uppercase tracking-wide text-[rgb(var(--c-s-50)/0.8)]">{row.code}</p>
                <p className="text-slate-200">{row.title}</p>
              </div>
              <div className="flex shrink-0 items-center gap-6 text-small">
                <div className="text-right">
                  <p className="text-slate-300">{row.unlockedCount}</p>
                  <p className="text-small text-slate-600">unlocked</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-300">{row.completedCount}</p>
                  <p className="text-small text-slate-600">completed</p>
                </div>
                <div className="w-14 text-right">
                  <p className="text-[rgb(var(--c-s-50))]">{rate}%</p>
                  <p className="text-small text-slate-600">completion</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Same footprint as the real list (heading, blurb, ~5 rows) so nothing shifts when it fills in. */
export function ModuleHealthSkeleton() {
  return (
    <div aria-hidden>
      <h2 className="mb-1 text-body font-semibold text-slate-100">Module health</h2>
      <p className="mb-4 text-small text-slate-500">Unlocks and completions across the whole user base.</p>
      <div className="overflow-hidden glass-surface">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`flex items-center justify-between gap-4 px-6 py-4 ${i > 0 ? "border-t border-ink/5" : ""}`}>
            <div className="space-y-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-9 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
