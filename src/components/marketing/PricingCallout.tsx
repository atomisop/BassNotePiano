import Link from "next/link";
import { CURRICULUM_PRICE_CENTS, CURRICULUM_ORIGINAL_PRICE_CENTS, CURRICULUM_DISCOUNT_PERCENT } from "@/lib/curriculum";
import { PRESET_BUNDLES, calculateClassCreditTotal } from "@/lib/classCreditPricing";
import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";
import { StaggerCard } from "@/components/marketing/StaggerCard";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/**
 * HOMEPAGE REPLACEMENT — 06 PRICING.
 *
 * Same real numbers the old pricing callout used ($69.99 curriculum,
 * `PRESET_BUNDLES`' three real credit tiers) — plain static values now, not
 * `NumberFlow`'s count-up-on-mount animation and not `TiltGlow`'s hover-tilt
 * (both still exist and are still used on the real /pricing page, which
 * this rebuild doesn't touch — just not reused here, since a number
 * animating on scroll-into-view is "animated typography" the doc asks to
 * remove). "Keep it simple, no unnecessary tier complexity" — three bundles
 * shown, same as before, nothing added.
 */
export function PricingCallout() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12 text-center md:py-28">
      <ScrollGlassCard className="relative p-6 md:p-12" direction="right">
        {/* Poking over the card's own top edge, not sitting inline above
            "Everything, once" — right next to it, the two read as one
            phrase that could be misread as the lifetime access itself
            being time-limited, which it isn't. The card border between
            them makes it unambiguous that this is a separate promo tag. */}
        <div className="absolute -top-3.5 right-5 flex items-center gap-1.5 sm:-top-4 sm:right-7">
          <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--c-a-300))] ring-1 ring-inset ring-[rgb(var(--c-a-400)/0.4)]">
            Limited time offer
          </span>
          <span className="rounded-full bg-[rgb(var(--c-a-400))] px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-950">
            -{CURRICULUM_DISCOUNT_PERCENT}%
          </span>
        </div>
        <p className="label label-muted">Everything, once</p>
        <div className="mt-4 flex flex-col items-center gap-1">
          <span className="text-xl tabular-nums text-slate-500 line-through sm:text-2xl">
            {formatUsd(CURRICULUM_ORIGINAL_PRICE_CENTS)}
          </span>
          <span className="font-serif text-6xl tabular-nums text-slate-50 sm:text-7xl">
            {formatUsd(CURRICULUM_PRICE_CENTS)}
          </span>
        </div>
        <p className="mt-3 text-base text-slate-400">
          One-time payment · every scale, forever · no subscriptions
        </p>
        <Link
          href="/pricing"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--c-a-300))] transition hover:text-[rgb(var(--c-a-200))]"
        >
          See full pricing
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <div className="mx-auto mt-12 grid max-w-lg grid-cols-3 gap-3">
          {PRESET_BUNDLES.map((bundle, i) => {
            const total = calculateClassCreditTotal(bundle.quantity);
            return (
              <StaggerCard key={bundle.id} index={i} className="h-full">
                <Link
                  href="/pricing"
                  className="block h-full rounded-lg border border-[rgb(var(--c-s-50)/0.1)] p-4 text-left transition hover:border-[rgb(var(--c-a-400)/0.4)]"
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                    {bundle.label}
                  </p>
                  <p className="mt-1 font-serif text-xl text-slate-50">{formatUsd(total.totalCents)}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {Math.round(total.discountRate * 100)}% off · {bundle.quantity} credits
                  </p>
                </Link>
              </StaggerCard>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-md text-sm text-slate-500">
          Live group classes on Zoom: see the full breakdown on the pricing page.
        </p>
      </ScrollGlassCard>
    </section>
  );
}
