"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import {
  submitZellePaymentReference,
  checkFamilyBundleRecipients,
  createCurriculumFamilyBundlePayment,
  FamilyBundleError,
  type ZelleReferenceSubmission,
  type FamilyBundleRecipientCheck,
} from "@/lib/payments";
import { RateLimitError } from "@/lib/rateLimit";

export async function submitCurriculumFamilyBundlePaymentAction(paymentId: string, payload: ZelleReferenceSubmission) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/curriculum/family");

  await submitZellePaymentReference(session.user.id, paymentId, payload);
  revalidatePath("/billing/curriculum/family");
}

export interface FamilyBundleCheckResult {
  ok: boolean;
  results: FamilyBundleRecipientCheck[];
  error: string | null;
}

/**
 * Same live per-email existence check the credits bundle uses
 * (checkFamilyBundleRecipients doesn't care what's being bundled, just
 * whether an account exists at that email), reused as-is rather than
 * duplicated.
 */
export async function checkCurriculumBundleRecipientsAction(emails: string[]): Promise<FamilyBundleCheckResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/curriculum/family");

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

export interface CurriculumFamilyBundlePaymentResult {
  ok: boolean;
  id: string | null;
  status: string | null;
  amountCents: number | null;
  error: string | null;
}

/**
 * The actual purchase. Every recipient (existence, and not already having
 * curriculum access) is re-verified server-side inside
 * createCurriculumFamilyBundlePayment regardless of what the live-check UI
 * already showed. That check is just UX, this is the real gate. No
 * hasCurriculumAccess requirement on the buyer themselves, unlike the
 * credits bundle: someone can buy this for their kids without ever wanting
 * lessons for themselves, curriculum is the base purchase, nothing gates it.
 */
export async function createCurriculumFamilyBundlePaymentAction(
  recipientEmails: string[],
): Promise<CurriculumFamilyBundlePaymentResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/curriculum/family");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  try {
    const payment = await createCurriculumFamilyBundlePayment({
      buyerId: session.user.id,
      recipientEmails,
      zelleHandle,
    });
    revalidatePath("/billing/curriculum/family");
    return { ok: true, id: payment.id, status: payment.status, amountCents: payment.amountCents, error: null };
  } catch (error) {
    if (error instanceof FamilyBundleError || error instanceof RateLimitError) {
      return { ok: false, id: null, status: null, amountCents: null, error: error.message };
    }
    throw error;
  }
}
