"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import {
  submitZellePaymentReference,
  checkFamilyBundleRecipients,
  createFamilyBundlePayment,
  FamilyBundleError,
  type ZelleReferenceSubmission,
  type FamilyBundleRecipientCheck,
} from "@/lib/payments";
import { RateLimitError } from "@/lib/rateLimit";

// Individual a-la-carte credit purchasing (createClassCreditsPendingPaymentAction)
// was removed once Payment Plans (/billing/plans) covered every solo case —
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
  tierQuantity: number,
  recipientEmails: string[],
): Promise<FamilyBundlePaymentResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=credits");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  try {
    const payment = await createFamilyBundlePayment({
      buyerId: session.user.id,
      tierQuantity,
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
