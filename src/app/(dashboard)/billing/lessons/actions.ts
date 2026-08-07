"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import {
  getOrCreatePendingClassCreditsPayment,
  submitZellePaymentReference,
  type ZelleReferenceSubmission,
} from "@/lib/payments";

export async function createClassCreditsPendingPaymentAction(quantity: number) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  const payment = await getOrCreatePendingClassCreditsPayment(session.user.id, quantity, zelleHandle);

  return {
    id: payment.id,
    status: payment.status,
    rejectionReason: payment.rejectionReason,
    amountCents: payment.amountCents,
  };
}

export async function submitClassCreditsPaymentAction(paymentId: string, payload: ZelleReferenceSubmission) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");

  await submitZellePaymentReference(session.user.id, paymentId, payload);
  revalidatePath("/billing/lessons");
}
