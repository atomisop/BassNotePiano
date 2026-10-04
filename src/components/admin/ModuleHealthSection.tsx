import { getModuleHealth } from "@/lib/admin";
import { Skeleton } from "@/components/ui/Skeleton";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";

/**
 * One raised card per scale: a pressed-in well holding a completion gauge
 * (21st.dev animated circular progress), the scale name, and two small inset
 * chips for unlocked and completed counts. Meant to sit inside a Suspense.
 */
export async function ModuleHealthSection() {
  const moduleHealth = await getModuleHealth();

  return (
    <>
      <h2 className="mb-1 text-body text-slate-100 font-semibold">Module health</h2>
      <p className="mb-4 text-small text-slate-500">Unlocks and completions across the whole user base.</p>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {moduleHealth.map((row) => {
          const rate = row.unlockedCount === 0 ? 0 : Math.round((row.completedCount / row.unlockedCount) * 100);
          return (
            <li key={row.slug} className="flex flex-col items-center rounded-2xl bg-neu-base p-4 text-center shadow-raised-mid">
              <div className="rounded-full bg-neu-base p-2.5 shadow-pressed-mid">
                <AnimatedCircularProgressBar
                  min={0}
                  max={100}
                  value={rate}
                  gaugePrimaryColor="rgb(var(--signal))"
                  gaugeSecondaryColor="rgb(var(--border))"
                  ariaLabel={`${row.code} completion`}
                  label={<span className="text-body font-semibold text-slate-50">{rate}%</span>}
                  className="size-24 text-body"
                />
              </div>
              <p className="mt-3 text-small font-medium uppercase tracking-wide text-[rgb(var(--c-s-50)/0.8)]">{row.code}</p>
              <p className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-small text-slate-300">{row.title}</p>
              <div className="mt-3 grid w-full grid-cols-2 gap-2">
                <div className="rounded-xl bg-neu-base px-2 py-1.5 shadow-pressed-low">
                  <p className="text-body font-semibold text-slate-100">{row.unlockedCount}</p>
                  <p className="text-small text-slate-500">unlocked</p>
                </div>
                <div className="rounded-xl bg-neu-base px-2 py-1.5 shadow-pressed-low">
                  <p className="text-body font-semibold text-slate-100">{row.completedCount}</p>
                  <p className="text-small text-slate-500">completed</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Same footprint as the real grid (heading, blurb, a few cards) so nothing shifts when it fills in. */
export function ModuleHealthSkeleton() {
  return (
    <div aria-hidden>
      <h2 className="mb-1 text-body font-semibold text-slate-100">Module health</h2>
      <p className="mb-4 text-small text-slate-500">Unlocks and completions across the whole user base.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center rounded-2xl bg-neu-base p-4 shadow-raised-mid">
            <Skeleton className="size-[7.5rem] rounded-full" />
            <Skeleton className="mt-3 h-3 w-12" />
            <Skeleton className="mt-2 h-4 w-28" />
            <Skeleton className="mt-3 h-12 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
