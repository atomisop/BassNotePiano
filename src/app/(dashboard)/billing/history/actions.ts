"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { submitZellePaymentReference, type ZelleReferenceSubmission } from "@/lib/payments";

/**
 * Pay or resubmit a payment straight from Payment history. The same server checks as every other pay sheet
 * (submitZellePaymentReference): only the payer of an open bill may send it, and a group member never pays.
 */
export async function submitHistoryPaymentAction(paymentId: string, payload: ZelleReferenceSubmission) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/history");

  await submitZellePaymentReference(session.user.id, paymentId, payload);
  revalidatePath("/billing/history");
  revalidatePath("/billing/plans");
}
