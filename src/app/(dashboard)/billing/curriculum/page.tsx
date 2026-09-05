import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { getOrCreatePendingCurriculumPayment } from "@/lib/payments";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { CurriculumConsentGate } from "@/components/billing/CurriculumConsentGate";
import { CheckIcon, ArrowLeftIcon } from "@/components/ui/icons";
import { submitCurriculumPaymentAction } from "./actions";

const BENEFITS = [
  "All six scale groups: Diatonic & Modes through Mixolydian Pentatonic",
  "Jump to any scale without finishing the ones before it",
  "One-time payment, lifetime access, no recurring fees",
];

const NEXT_STEP_REASON: Record<string, string> = {
  credits: "Class credits are an add-on to the curriculum. Grab the curriculum first, then credits.",
  lessons: "Booking a live class requires curriculum access first.",
};

export default async function BillingCurriculumPage({ searchParams }: { searchParams: { next?: string } }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/curriculum");
  if (session.user.hasCurriculumAccess) redirect("/dashboard");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  const payment = await getOrCreatePendingCurriculumPayment(session.user.id, CURRICULUM_PRICE_CENTS, zelleHandle);
  const redirectReason = searchParams.next ? NEXT_STEP_REASON[searchParams.next] : undefined;

  return (
    // Same two-column widening as /billing/lessons: the benefits list gets
    // real room to breathe on the left, the actual payment card sits on
    // its own on the right instead of everything stacked in one narrow
    // max-w-sm column.
    <div className="w-full max-w-4xl lg:grid lg:grid-cols-12 lg:gap-12">
      {/* Reached from the dashboard roadmap's "Unlock the curriculum" step
          (see ScaleRoadmap.tsx) and from /billing/lessons's own redirect
          above; dashboard covers both without needing to track a referrer. */}
      <Link
        href="/dashboard"
        className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-100 lg:col-span-12"
      >
        <ArrowLeftIcon size={16} />
        Back to roadmap
      </Link>
      <div className="lg:col-span-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Curriculum</p>
        <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Unlock the full curriculum</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          One-time ${(CURRICULUM_PRICE_CENTS / 100).toFixed(2)} payment via Zelle. Every scale, forever.
        </p>

        {redirectReason && (
          <p className="mt-4 rounded-xl border border-[rgb(var(--c-s-50)/0.2)] bg-[rgb(var(--c-s-50)/0.05)] px-3.5 py-2.5 text-xs text-[rgb(var(--c-s-50))]">
            {redirectReason}
          </p>
        )}

        <ul className="mt-6 space-y-3">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex gap-2.5 text-sm text-slate-300">
              <CheckIcon className="mt-1 shrink-0 text-[rgb(var(--c-s-50))]" />
              {benefit}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 lg:col-span-6 lg:mt-0">
        <CurriculumConsentGate
          status={payment.status}
          rejectionReason={payment.rejectionReason}
          scaleCode="Curriculum"
          scaleTitle="the full curriculum"
          eyebrowLabel="Lifetime Unlock"
          amountCents={CURRICULUM_PRICE_CENTS}
          zelleHandle={zelleHandle}
          onSubmitPayment={submitCurriculumPaymentAction.bind(null, payment.id)}
        />
      </div>
    </div>
  );
}
