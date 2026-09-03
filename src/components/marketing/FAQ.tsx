import Link from "next/link";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { CREDIT_BASE_PRICE_CENTS } from "@/lib/classCreditPricing";
import { CANCELLATION_CUTOFF_HOURS, SOLO_MAX_CREDITS, FAMILY_CREDITS_PER_STUDENT } from "@/lib/classSchedule";
import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

/**
 * HOMEPAGE REBUILD: 06 FAQ.
 *
 * New section. `src/components/ui/accordion.tsx` already existed in the
 * tree but had zero real usages anywhere before this (checked): a real
 * shadcn/Radix accordion, just never wired into a page.
 *
 * Every answer is a real policy or fact, not invented for this page. The
 * refund/cancellation wording matches TermsContent.tsx's own language in
 * substance (checked against it directly, not guessed), since this page and
 * that one describing the same policy differently would be a real, user-
 * facing inconsistency. Prices/thresholds are imported from the same
 * constants the rest of the app uses, not hardcoded, so this can't quietly
 * drift out of sync if those ever change.
 */
function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const FAQS = [
  {
    q: "Do I need to already know music theory?",
    a: "No. The curriculum starts with a real Foundation stage, the diatonic scale, the chromatic scale, and the seven modes, before any kiñit-specific material.",
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
    <section className="mx-auto max-w-2xl px-6 py-12 md:py-28">
      <ScrollGlassCard className="p-6 md:p-12" direction="right">
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
      </ScrollGlassCard>
    </section>
  );
}
