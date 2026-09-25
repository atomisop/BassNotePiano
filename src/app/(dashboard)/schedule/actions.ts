"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import {
  getOrCreatePendingExtraSessionPayment,
  submitZellePaymentReference,
  ExtraSessionError,
  type ExtraSessionOccurrence,
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
 * Opens (or reuses an already-open) flat-rate top-up payment for the exact
 * occurrence the student just picked on their weekly class screen (shown at
 * /lessons for a Payment Plan subscriber, see that page's own comment).
 * Idempotent the same way the curriculum page's own pending-payment fetch
 * is: revisiting (or picking a different open time before paying) never
 * spawns a duplicate row, it just updates the one already in flight.
 */
export async function createExtraSessionPaymentAction(occurrence: ExtraSessionOccurrence): Promise<ExtraSessionPaymentResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  try {
    const payment = await getOrCreatePendingExtraSessionPayment(session.user.id, zelleHandle, occurrence);
    revalidatePath("/lessons");
    return { ok: true, id: payment.id, status: payment.status, amountCents: payment.amountCents, error: null };
  } catch (err) {
    if (err instanceof ExtraSessionError) {
      return { ok: false, id: null, status: null, amountCents: null, error: err.message };
    }
    throw err;
  }
}

export async function submitExtraSessionPaymentAction(paymentId: string, payload: ZelleReferenceSubmission) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  // Same gate as createExtraSessionPaymentAction above. Not reachable today
  // (the only way to get a pending CLASS_CREDITS row from this flow is
  // through that gated action), kept here anyway so this action stays
  // correct on its own rather than depending on another function's gate.

  await submitZellePaymentReference(session.user.id, paymentId, payload);
  revalidatePath("/lessons");
}
