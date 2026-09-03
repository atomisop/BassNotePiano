import Link from "next/link";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { CREDIT_BASE_PRICE_CENTS } from "@/lib/classCreditPricing";
import { CANCELLATION_CUTOFF_HOURS, SOLO_MAX_CREDITS, FAMILY_CREDITS_PER_STUDENT } from "@/lib/classSchedule";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";

/**
 * HOMEPAGE REBUILD: 06 FAQ.
 *
 * `src/components/ui/accordion.tsx` already existed in the tree but had
 * zero real usages anywhere before this (checked): a real shadcn/Radix
 * accordion, just never wired into a page.
 *
 * Every answer is a real policy or fact, not invented for this page. The
 * refund/cancellation wording matches TermsContent.tsx's own language in
 * substance (checked against it directly, not guessed), since this page and
 * that one describing the same policy differently would be a real, user-
 * facing inconsistency. Prices/thresholds are imported from the same
 * constants the rest of the app uses, not hardcoded, so this can't quietly
 * drift out of sync if those ever change.
 *
 * REDESIGN: no glass-surface card. An accordion is already its own set of
 * hairline-divided rows (each AccordionItem's own border-b); wrapping that
 * in a second, larger boundary just nested one rule-based structure inside
 * a box, which is exactly what marketing.css's structural rule argues
 * against.
 *
 * SECTION BACKDROP: fifth beat of the homepage's image → blur → blank →
 * blur → image rhythm (see InstrumentPicker's own comment). The
 * sheet-music photo blurs back out after ProblemStatement's full-clarity
 * use of it, the same strong-blur-and-fade treatment SocialProof gives
 * the guitar photo, before FinalCTA closes the page on plain ground.
 */
function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const FAQS = [
  {
    q: "Do I need to already know music theory?",
    a: "No. The curriculum starts with a real Foundation stage, the diatonic scale, the chromatic scale, and the seven modes, before any scale-specific material.",
  },
  {
    q: "What instruments does this work for?",
    a: "Piano, guitar, and bass. It's the same curriculum for all three, correctly voiced for whichever one you're playing, and you can switch any time.",
  },
  {
    q: `Is the ${formatUsd(CURRICULUM_PRICE_CENTS)} curriculum purchase refundable?`,
    a: `No. Access is granted immediately and it's digital content, so the ${formatUsd(CURRICULUM_PRICE_CENTS)} purchase is final once it's bought, for any reason.`,
  },
  {
    q: "How do live lessons work?",
    a: `Book one-on-one time with your teacher (up to ${SOLO_MAX_CREDITS} credits, about an hour), or a family session if siblings are learning together (${FAMILY_CREDITS_PER_STUDENT} credits per student). One credit is ${formatUsd(CREDIT_BASE_PRICE_CENTS)} at full price, and credits never expire.`,
  },
  {
    q: "Can I cancel a booked lesson?",
    a: `Yes, up to ${CANCELLATION_CUTOFF_HOURS} hours before it starts, and the credit goes back to your balance. Inside that window, there's no automatic refund since that time was held for you; message us directly and it's a case-by-case call.`,
  },
  {
    q: "Is there a way to try the community before paying for anything?",
    a: "Yes. The Discord server is open to join for free, ask questions, and see what practicing with other students actually looks like before you buy the curriculum.",
  },
];

export function FAQ() {
  return (
    <section className="relative overflow-hidden py-[var(--space-5)] md:py-[var(--space-8)]">
      {/* Masked to fully transparent at both edges, on top of the blur and
          PhotoBackdrop's own scrim, belt and suspenders so this never
          reads as a hard cut against FinalCTA's blank ground below. Never
          a bare image-to-image transition anywhere on this page: every
          image is either at full clarity with a blank section on both
          sides, or blurred and fading straight to blank, per direct
          instruction. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 overflow-hidden"
        style={{ maskImage: "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)" }}
      >
        <div className="absolute -inset-x-10 -inset-y-10 blur-3xl">
          <PhotoBackdrop src={BACKDROPS.classes} scrim="standard" sizes="100vw" />
        </div>
      </div>
      <ScrollReveal className="mx-auto max-w-2xl px-6">
        <p className="label label-muted">Questions</p>
        <h2 className="display-2 mt-4 max-w-[20ch] text-balance">Before you commit to anything.</h2>

        <Accordion type="single" collapsible className="mt-10">
          {FAQS.map((item, i) => (
            <AccordionItem key={item.q} value={`item-${i}`} className="border-[rgb(var(--c-s-50)/0.1)]">
              <AccordionTrigger className="text-left font-serif text-lg text-slate-50 no-underline hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-slate-400">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <p className="mt-8 text-center text-sm text-slate-500">
          More on pricing and bundles on the{" "}
          <Link href="/pricing" className="text-[rgb(var(--c-a-300))] transition hover:text-[rgb(var(--c-a-200))]">
            full pricing page
          </Link>
          , or read the complete{" "}
          <Link href="/terms" className="text-[rgb(var(--c-a-300))] transition hover:text-[rgb(var(--c-a-200))]">
            terms &amp; refund policy
          </Link>
          .
        </p>
      </ScrollReveal>
    </section>
  );
}
