import Link from "next/link";
import { CLASS_CAPACITY, CANCELLATION_CUTOFF_HOURS } from "@/lib/classSchedule";
import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";

/**
 * HOMEPAGE REPLACEMENT — 05 CLASSES.
 *
 * Copy started as the old homepage's real "Live on Zoom" bento-cell copy,
 * updated to Discord once classes actually moved there; the three facts
 * below it are the app's own real constants (`CLASS_CAPACITY`,
 * `CANCELLATION_CUTOFF_HOURS`) plus the credit-to-minutes rule already
 * stated in `/classes`' own registration copy — nothing invented.
 */
export function ClassesOverview() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-12 md:py-28">
      <ScrollGlassCard className="p-6 md:p-12" direction="left">
        <div className="grid gap-12 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-16">
          <div>
            <p className="label label-muted">Live on Discord</p>
            <h2 className="display-2 mt-4 max-w-[22ch] text-balance">Weekly group classes.</h2>
            <p className="lead mt-5 max-w-[46ch] text-slate-300">
              Buy credits, book a seat, show up. Bundle discounts reach 30% and credits never
              expire.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/classes" className="btn btn-secondary">
                See class times
              </Link>
              <Link href="/pricing" className="btn btn-secondary">
                Credit bundles
              </Link>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-6 sm:grid-cols-1 sm:gap-8">
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">Class size</dt>
              <dd className="mt-1 font-serif text-2xl text-slate-50">Up to {CLASS_CAPACITY}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">1 credit</dt>
              <dd className="mt-1 font-serif text-2xl text-slate-50">30 minutes</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">Cancel by</dt>
              <dd className="mt-1 font-serif text-2xl text-slate-50">{CANCELLATION_CUTOFF_HOURS}hrs</dd>
            </div>
          </dl>
        </div>
      </ScrollGlassCard>
    </section>
  );
}
