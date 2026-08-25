import Link from "next/link";
import { SOLO_MAX_CREDITS, CANCELLATION_CUTOFF_HOURS } from "@/lib/classSchedule";
import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";

/**
 * HOMEPAGE REPLACEMENT — 05 CLASSES.
 *
 * Rewritten for the 1:1-first booking model (group classes reverted to
 * "coming soon" — see the booking page for that). The three facts below are
 * still the app's own real constants (`SOLO_MAX_CREDITS`,
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
            <h2 className="display-2 mt-4 max-w-[22ch] text-balance">One-on-one lessons with your teacher.</h2>
            <p className="lead mt-5 max-w-[46ch] text-slate-300">
              Buy credits, book your own time, show up. Siblings learning together can book a family
              session instead. Credits never expire.
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
              <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">Lesson length</dt>
              <dd className="mt-1 font-serif text-2xl text-slate-50">Up to {(SOLO_MAX_CREDITS * 30) / 60} hr</dd>
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
