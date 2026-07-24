import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getOrCreatePendingCurriculumPayment } from "@/lib/payments";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { submitCurriculumPaymentAction } from "./actions";

const BENEFITS = [
  "All six scale groups — Diatonic & Modes through Mixolydian Pentatonic",
  "Jump to any scale without finishing the ones before it",
  "One-time payment — lifetime access, no recurring fees",
];

export default async function BillingCurriculumPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/curriculum");
  if (session.user.hasCurriculumAccess) redirect("/dashboard");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  const payment = await getOrCreatePendingCurriculumPayment(session.user.id, CURRICULUM_PRICE_CENTS, zelleHandle);

  return (
    <div className="w-full max-w-sm">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Curriculum</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Unlock the full curriculum</h1>
      <p className="mt-2 text-sm text-slate-500">
        One-time ${(CURRICULUM_PRICE_CENTS / 100).toFixed(0)} payment via Zelle — every scale, forever.
      </p>

      <ul className="mt-5 space-y-2">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex gap-2.5 text-sm text-slate-300">
            <span className="mt-0.5 text-amber-400">✓</span>
            {benefit}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <ZelleUnlockGate
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
