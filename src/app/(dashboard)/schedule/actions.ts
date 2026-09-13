"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import {
  getOrCreatePendingExtraSessionPayment,
  submitZellePaymentReference,
  type ZelleReferenceSubmission,
} from "@/lib/payments";

export interface ExtraSessionPaymentResult {
  ok: boolean;
  id: string | null;
  status: string | null;
  amountCents: number | null;
  error: string | null;
}

/**
 * Opens (or reuses an already-open) flat-rate single-credit top-up payment
 * for the signed-in student. Idempotent the same way the curriculum page's
 * own pending-payment fetch is (see getOrCreatePendingZellePayment in
 * payments.ts): revisiting the Schedule screen never spawns a duplicate row.
 */
export async function createExtraSessionPaymentAction(): Promise<ExtraSessionPaymentResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/schedule");
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=schedule");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  const payment = await getOrCreatePendingExtraSessionPayment(session.user.id, zelleHandle);
  revalidatePath("/schedule");
  return { ok: true, id: payment.id, status: payment.status, amountCents: payment.amountCents, error: null };
}

export async function submitExtraSessionPaymentAction(paymentId: string, payload: ZelleReferenceSubmission) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/schedule");

  await submitZellePaymentReference(session.user.id, paymentId, payload);
  revalidatePath("/schedule");
}
