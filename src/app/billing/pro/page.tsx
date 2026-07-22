import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getOrCreatePendingProPayment } from "@/lib/payments";
import { PRO_LIFETIME_PRICE_CENTS } from "@/lib/curriculum";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { submitProPaymentAction } from "./actions";

const BENEFITS = [
  "All six scale groups — Diatonic & Modes through Mixolydian Pentatonic",
  "Jump to any scale without finishing the ones before it",
  "One-time payment — no per-scale unlocks, ever",
];

export default async function BillingProPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/pro");
  if (session.user.isProMember) redirect("/dashboard");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  const payment = await getOrCreatePendingProPayment(session.user.id, PRO_LIFETIME_PRICE_CENTS, zelleHandle);

  return (
    <div className="w-full max-w-sm">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Pro — Lifetime</p>
      <h1 className="mt-1.5 font-serif text-2xl text-neutral-50">Unlock the full curriculum</h1>
      <p className="mt-2 text-sm text-neutral-500">
        One-time ${(PRO_LIFETIME_PRICE_CENTS / 100).toFixed(0)} payment via Zelle — saves $50 over paying for each
        scale individually.
      </p>

      <ul className="mt-5 space-y-2">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex gap-2.5 text-sm text-neutral-300">
            <span className="mt-0.5 text-amber-400">✓</span>
            {benefit}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <ZelleUnlockGate
          status={payment.status}
          rejectionReason={payment.rejectionReason}
          scaleCode="Pro"
          scaleTitle="the full curriculum"
          eyebrowLabel="Lifetime Unlock"
          amountCents={PRO_LIFETIME_PRICE_CENTS}
          zelleHandle={zelleHandle}
          onSubmitPayment={submitProPaymentAction.bind(null, payment.id)}
        />
      </div>
    </div>
  );
}
