import { notFound, redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { canAccessScale } from "@/lib/access";
import { getOrCreatePendingScaleUnlockPayment } from "@/lib/payments";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { submitZellePaymentAction } from "./actions";

export default async function BillingUnlockPage({ params }: { params: { scaleSlug: string } }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/billing/unlock/${params.scaleSlug}`);

  const access = await canAccessScale(session.user.id, params.scaleSlug);
  if (!access) notFound();

  // Already unlocked (paid, completed, or Pro) — nothing to gate, send them to the content.
  if (access.canAccess) redirect(`/scales/${params.scaleSlug}`);
  // Further ahead than the next-in-line scale — they shouldn't be able to pay for this yet.
  if (access.reason !== "requires-payment") redirect("/dashboard");

  const { scaleGroup } = access;
  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  const payment = await getOrCreatePendingScaleUnlockPayment(
    session.user.id,
    scaleGroup.id,
    scaleGroup.priceCents,
    zelleHandle,
  );

  return (
    <div className="w-full max-w-sm">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">{scaleGroup.code}</p>
      <h1 className="mt-1.5 font-serif text-2xl text-neutral-50">Unlock {scaleGroup.title}</h1>
      <p className="mt-2 text-sm text-neutral-500">
        This scale is part of the Pay-As-You-Go plan — a one-time ${(scaleGroup.priceCents / 100).toFixed(0)} unlock
        via Zelle.
      </p>

      <div className="mt-6">
        <ZelleUnlockGate
          status={payment.status}
          rejectionReason={payment.rejectionReason}
          scaleCode={scaleGroup.code}
          scaleTitle={scaleGroup.title}
          eyebrowLabel="Session Unlock"
          amountCents={scaleGroup.priceCents}
          zelleHandle={zelleHandle}
          onSubmitPayment={submitZellePaymentAction.bind(null, scaleGroup.slug, payment.id)}
        />
      </div>
    </div>
  );
}
