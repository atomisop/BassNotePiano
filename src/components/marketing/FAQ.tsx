import Link from "next/link";
import { CLASS_MINUTES, EXTRA_CLASS_PRICE_CENTS } from "@/lib/classCreditPricing";
import { CANCELLATION_CUTOFF_HOURS } from "@/lib/classSchedule";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { WordsPullUp } from "@/components/ui/words-pull-up";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const faqs = (extraClassCents: number) => [
  {
    q: "Do I need to already know music theory?",
    a: "No. The curriculum starts with a real Foundation stage, the diatonic scale, the chromatic scale, and the seven modes, before any scale-specific material.",
  },
  {
    q: "What instruments does this work for?",
    a: "Piano, guitar, and bass. It's the same curriculum for all three, correctly voiced for whichever one you're playing, and you can switch any time.",
  },
  {
    q: "Can I buy the curriculum without live classes?",
    a: "No. The curriculum comes with live classes. Your teacher opens it one scale at a time as you progress, so you always learn each scale with guidance. Approved applicants get a 3-day free trial of the first lessons.",
  },
  {
    q: "How do live lessons work?",
    a: `Every class is ${CLASS_MINUTES} minutes, one-on-one with your teacher, live on Discord. Start a Payment Plan (1 Month, 3 Months, or 6 Months, paid one Zelle or Venmo installment every 28 days) and you pick your weekly day and time on a calendar of open spots. It is yours every week, booked for you automatically. Want more time? Book an extra class for ${formatUsd(extraClassCents)} whenever there is an open spot. Siblings learning together can use a family bundle instead.`,
  },
  {
    q: "How often am I billed?",
    a: "Every 28 days, from one payment to the next. Each bill covers exactly 28 days and exactly 4 classes (your weekly class, four times), whatever the month. The price of each payment is the same every time.",
  },
  {
    q: "Can I cancel a booked lesson?",
    a: `Yes, you can cancel or change a class up to ${CANCELLATION_CUTOFF_HOURS} hours before it starts, and it stays on your account for you to rebook. Inside that window it can't be changed in the app since that time was held for you: please attend, or message us directly for a case-by-case call.`,
  },
  {
    q: "Can I try the community before paying for anything?",
    a: "Yes. The Discord server is open to join for free, ask questions, and see what practicing with other students actually looks like before you commit.",
  },
];

export function FAQ({ extraClassCents = EXTRA_CLASS_PRICE_CENTS }: { extraClassCents?: number }) {
  const FAQS = faqs(extraClassCents);
  return (
    <section className="px-2 sm:px-3">
      <div className="mx-auto max-w-[96rem] rounded-2xl bg-black px-6 py-16 md:rounded-[2rem] md:px-14 md:py-28">
        <ScrollReveal className="grid grid-cols-1 gap-12 md:grid-cols-12">
          <div className="min-w-0 md:col-span-5">
            <WordsPullUp
              text="Before you commit to anything."
              className="max-w-[12ch] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[1] tracking-[-0.035em] text-[#E1E0CC]"
            />
          </div>

          <div className="min-w-0 md:col-span-7">
            <Accordion type="single" collapsible>
              {FAQS.map((item, i) => (
                <AccordionItem key={item.q} value={`item-${i}`} className="border-[#E1E0CC]/15">
                  <AccordionTrigger className="text-left text-body font-medium text-[#E1E0CC] no-underline hover:no-underline">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-small leading-relaxed text-[#E1E0CC]/60">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-1 text-small">
              <Link href="/pricing" className="tap inline-flex items-center text-[#E1E0CC]/70 transition hover:text-[#E1E0CC]">
                Full pricing
              </Link>
              <Link href="/terms" className="tap inline-flex items-center text-[#E1E0CC]/70 transition hover:text-[#E1E0CC]">
                Terms &amp; refund policy
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
