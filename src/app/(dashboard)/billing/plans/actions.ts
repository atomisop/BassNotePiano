"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PaymentPlanCadence, type PaymentPlanTerm } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { createFamilyPlans, createPaymentPlan, PaymentPlanError } from "@/lib/paymentPlans";
import { submitZellePaymentReference, type ZelleReferenceSubmission } from "@/lib/payments";
import { getReservableSlots, type ReservableSlot } from "@/lib/classSchedule";
import { RateLimitError, consumeRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { OFFERED_PLAN_CADENCE, PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";

export interface EnrollPaymentPlanResult {
  ok: boolean;
  planId: string | null;
  installmentPaymentId: string | null;
  amountCents: number | null;
  error: string | null;
}

/** Every reservable slot for a cadence's weekly credit cost, feeds the enrollment picker, re-fetched whenever the student changes cadence. */
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

export interface EnrollFamilyPlanResult {
  ok: boolean;
  planId: string | null;
  startPaymentId: string | null;
  amountCents: number | null;
  memberCount: number;
  error: string | null;
}

/** Starts a family plan: you (the payer) and 1 to 3 other existing accounts, all or nobody. */
export async function enrollFamilyPlanAction(
  term: PaymentPlanTerm,
  reservedScheduleId: string,
  reservedChunkIndex: number,
  memberEmails: string[],
): Promise<EnrollFamilyPlanResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  if (!Array.isArray(memberEmails) || memberEmails.length > 10 || memberEmails.some((e) => typeof e !== "string")) {
    return { ok: false, planId: null, startPaymentId: null, amountCents: null, memberCount: 0, error: "Check the email addresses and try again." };
  }

  // Each try tells the person whether an email has an account, so it is limited.
  try {
    await consumeRateLimit(prisma, `family-plan:${session.user.id}`, { windowMinutes: 60, max: 8, message: "Too many tries. Please wait a while and try again." });
  } catch (error) {
    if (error instanceof RateLimitError) return { ok: false, planId: null, startPaymentId: null, amountCents: null, memberCount: 0, error: error.message };
    throw error;
  }

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  try {
    const { plans, startPayment } = await createFamilyPlans({
      payerId: session.user.id,
      cadence: OFFERED_PLAN_CADENCE,
      term,
      zelleHandle,
      reservedScheduleId,
      reservedChunkIndex,
      memberEmails,
    });
    const mine = plans.find((plan) => plan.userId === session.user.id);
    revalidatePath("/", "layout");
    return { ok: true, planId: mine?.id ?? null, startPaymentId: startPayment.id, amountCents: startPayment.amountCents, memberCount: plans.length, error: null };
  } catch (error) {
    if (error instanceof PaymentPlanError) {
      return { ok: false, planId: null, startPaymentId: null, amountCents: null, memberCount: 0, error: error.message };
    }
    throw error;
  }
}
