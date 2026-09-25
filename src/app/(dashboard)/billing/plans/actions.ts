"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PaymentPlanCadence, type PaymentPlanTerm } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { createPaymentPlan, PaymentPlanError } from "@/lib/paymentPlans";
import { submitZellePaymentReference, type ZelleReferenceSubmission } from "@/lib/payments";
import { getReservableSlots, type ReservableSlot } from "@/lib/classSchedule";
import { PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";

export interface EnrollPaymentPlanResult {
  ok: boolean;
  planId: string | null;
  installmentPaymentId: string | null;
  amountCents: number | null;
  error: string | null;
}

/** Every reservable slot for a cadence's weekly credit cost — feeds the enrollment picker, re-fetched whenever the student changes cadence. */
export async function getReservableSlotsAction(cadence: PaymentPlanCadence): Promise<ReservableSlot[]> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  if (!Object.values(PaymentPlanCadence).includes(cadence)) return [];
  return getReservableSlots(PLAN_CADENCE_CREDITS_PER_WEEK[cadence]);
}

export async function enrollInPaymentPlanAction(
  cadence: PaymentPlanCadence,
  term: PaymentPlanTerm,
  reservedScheduleId: string,
  reservedChunkIndex: number,
): Promise<EnrollPaymentPlanResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  try {
    const plan = await createPaymentPlan(session.user.id, cadence, term, zelleHandle, reservedScheduleId, reservedChunkIndex);
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
