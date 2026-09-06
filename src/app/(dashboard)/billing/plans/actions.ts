"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentPlanCadence, PaymentPlanTerm } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { createPaymentPlan, PaymentPlanError } from "@/lib/paymentPlans";
import { submitZellePaymentReference, type ZelleReferenceSubmission } from "@/lib/payments";

export interface EnrollPaymentPlanResult {
  ok: boolean;
  planId: string | null;
  installmentPaymentId: string | null;
  amountCents: number | null;
  error: string | null;
}

export async function enrollInPaymentPlanAction(
  cadence: PaymentPlanCadence,
  term: PaymentPlanTerm,
): Promise<EnrollPaymentPlanResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  // Mirrors the page-level redirect — re-checked here since this Server
  // Action is its own RPC endpoint, not something the page redirect covers.
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=plans");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  try {
    const plan = await createPaymentPlan(session.user.id, cadence, term, zelleHandle);
    const installment = plan.installmentPayments[0];
    revalidatePath("/billing/plans");
    return { ok: true, planId: plan.id, installmentPaymentId: installment.id, amountCents: installment.amountCents, error: null };
  } catch (error) {
    if (error instanceof PaymentPlanError) {
      return { ok: false, planId: null, installmentPaymentId: null, amountCents: null, error: error.message };
    }
    throw error;
  }
}

export async function submitPlanInstallmentPaymentAction(paymentId: string, payload: ZelleReferenceSubmission) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");

  await submitZellePaymentReference(session.user.id, paymentId, payload);
  revalidatePath("/billing/plans");
}
