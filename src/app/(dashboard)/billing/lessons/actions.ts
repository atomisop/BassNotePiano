"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentPlanCadence, PaymentPlanTerm } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import {
  submitZellePaymentReference,
  checkFamilyBundleRecipients,
  createFamilyBundlePayment,
  createExtraClassPayment,
  getOwnPaymentStatus,
  ExtraCreditsError,
  FamilyBundleError,
  type ZelleReferenceSubmission,
  type FamilyBundleRecipientCheck,
} from "@/lib/payments";
import { RateLimitError } from "@/lib/rateLimit";

// Individual a-la-carte credit purchasing (createClassCreditsPendingPaymentAction)
// was removed once Payment Plans (/billing/plans) covered every solo case,
// this file is Family bundle only now. submitClassCreditsPaymentAction stays
// exported: FamilyBundleFlow still submits its Zelle reference through it,
// the name predating the split between the two purchase paths.
export async function submitClassCreditsPaymentAction(paymentId: string, payload: ZelleReferenceSubmission) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");

  await submitZellePaymentReference(session.user.id, paymentId, payload);
  revalidatePath("/billing/lessons");
}

// ---------------------------------------------------------------------------
// Family bundle
// ---------------------------------------------------------------------------

export interface FamilyBundleCheckResult {
  ok: boolean;
  results: FamilyBundleRecipientCheck[];
  error: string | null;
}

/**
 * Live per-email existence check while the buyer is still typing recipient
 * addresses in. Never throws to the client on the expected failure modes
 * (rate limit): returns a message instead, since this fires repeatedly as
 * a normal part of filling out the form, not as a one-shot submission.
 */
export async function checkFamilyBundleRecipientsAction(emails: string[]): Promise<FamilyBundleCheckResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");

  try {
    const results = await checkFamilyBundleRecipients(session.user.id, emails);
    return { ok: true, results, error: null };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false, results: [], error: error.message };
    }
    throw error;
  }
}

export interface FamilyBundlePaymentResult {
  ok: boolean;
  id: string | null;
  status: string | null;
  amountCents: number | null;
  error: string | null;
}

/**
 * The actual purchase. Every recipient is re-verified server-side inside
 * createFamilyBundlePayment regardless of what the live-check UI already
 * showed. That check is just UX, this is the real gate.
 */
export async function createFamilyBundlePaymentAction(
  cadence: PaymentPlanCadence,
  term: PaymentPlanTerm,
  recipientEmails: string[],
): Promise<FamilyBundlePaymentResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  try {
    const payment = await createFamilyBundlePayment({
      buyerId: session.user.id,
      cadence,
      term,
      recipientEmails,
      zelleHandle,
    });
    revalidatePath("/billing/lessons");
    return { ok: true, id: payment.id, status: payment.status, amountCents: payment.amountCents, error: null };
  } catch (error) {
    if (error instanceof FamilyBundleError || error instanceof RateLimitError) {
      return { ok: false, id: null, status: null, amountCents: null, error: error.message };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// One extra class, paid for directly ($55 each)
// ---------------------------------------------------------------------------

export interface ExtraClassPaymentResult {
  ok: boolean;
  id: string | null;
  status: string | null;
  amountCents: number | null;
  error: string | null;
}

export async function createExtraClassPaymentAction(
  scheduleId: string,
  occurrenceDateMs: number,
  chunkIndex: number,
): Promise<ExtraClassPaymentResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  try {
    const payment = await createExtraClassPayment(session.user.id, scheduleId, occurrenceDateMs, chunkIndex, zelleHandle);
    revalidatePath("/lessons");
    return { ok: true, id: payment.id, status: payment.status, amountCents: payment.amountCents, error: null };
  } catch (err) {
    if (err instanceof ExtraCreditsError) return { ok: false, id: null, status: null, amountCents: null, error: err.message };
    throw err;
  }
}

/** Polled by the pay screen: has this payment been verified yet (by the bank email or by an admin)? */
export async function getPaymentStatusAction(paymentId: string): Promise<string | null> {
  const session = await getServerAuthSession();
  if (!session?.user) return null;
  return getOwnPaymentStatus(session.user.id, paymentId);
}

