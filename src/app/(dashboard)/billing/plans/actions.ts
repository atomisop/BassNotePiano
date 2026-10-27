"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PaymentPlanCadence, type PaymentPlanTerm } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { createFamilyPlans,
  createParentPlans, createPaymentPlan, PaymentPlanError } from "@/lib/paymentPlans";
import { submitZellePaymentReference, type ZelleReferenceSubmission } from "@/lib/payments";
import { getReservableSlots, type ReservableSlot } from "@/lib/classSchedule";
import { getMyWaitlist, getTakenSlots, joinWaitlist, leaveWaitlist, WaitlistError } from "@/lib/slotWaitlist";
import { RateLimitError, consumeRateLimit } from "@/lib/rateLimit";
import { createAndSendCode, verifyCode, RateLimitError as CodeRateLimitError } from "@/lib/verification";
import { prisma } from "@/lib/prisma";
import { cancelFamilyInvite, FamilyInviteError, listInvitesFromPayer, respondToFamilyInvite, sendFamilyInvite, type InviteState } from "@/lib/familyInvites";
import { checkFamilyMember, type MemberCheck } from "@/lib/familyMemberCheck";
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

/** Does this email belong to an account that could join a group plan? Limited, because each answer says whether an email has an account. */
export async function checkFamilyMemberAction(email: string): Promise<MemberCheck | "limited"> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  try {
    await consumeRateLimit(prisma, `family-member-check:${session.user.id}`, { windowMinutes: 60, max: 40, message: "Too many checks." });
  } catch (error) {
    if (error instanceof RateLimitError) return "limited";
    throw error;
  }
  return checkFamilyMember(session.user.id, String(email).slice(0, 254));
}

export type FamilyInviteRow = { email: string; status: InviteState };

/** The invitations this person has out (waiting, accepted, declined), so the form can show who still has to say yes. */
export async function listMyFamilyInvitesAction(): Promise<FamilyInviteRow[]> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  return listInvitesFromPayer(session.user.id);
}

/** Asks one existing account to join the family. Limited: each answer says whether an email has an account. */
export async function sendFamilyInviteAction(email: string): Promise<{ ok: boolean; status: InviteState | null; error: string | null }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  try {
    await consumeRateLimit(prisma, `family-invite:${session.user.id}`, { windowMinutes: 60, max: 20, message: "Too many invitations. Please wait a while and try again." });
    const status = await sendFamilyInvite(session.user.id, String(email).slice(0, 254));
    return { ok: true, status, error: null };
  } catch (error) {
    if (error instanceof FamilyInviteError || error instanceof RateLimitError) return { ok: false, status: null, error: error.message };
    throw error;
  }
}

export async function cancelFamilyInviteAction(email: string): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  await cancelFamilyInvite(session.user.id, String(email).slice(0, 254));
}

/** The invited person's answer, from their own Billing > Plans screen. */
export async function respondFamilyInviteAction(inviteId: string, accept: boolean): Promise<{ ok: boolean; error: string | null }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  try {
    await respondToFamilyInvite(session.user.id, String(inviteId), Boolean(accept));
    revalidatePath("/billing/plans");
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof FamilyInviteError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Weekly times other plans hold, and which of them this person is waiting for. */
export async function getWaitlistAction(): Promise<{ taken: ReservableSlot[]; mine: string[] }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  const [taken, mine] = await Promise.all([getTakenSlots(), getMyWaitlist(session.user.id)]);
  return { taken, mine };
}

export async function setWaitlistAction(scheduleId: string, chunkIndex: number, join: boolean): Promise<{ ok: boolean; error: string | null }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  try {
    if (join) await joinWaitlist(session.user.id, String(scheduleId), Number(chunkIndex));
    else await leaveWaitlist(session.user.id, String(scheduleId), Number(chunkIndex));
    return { ok: true, error: null };
  } catch (err) {
    if (err instanceof WaitlistError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function enrollInPaymentPlanAction(
  cadence: PaymentPlanCadence,
  term: PaymentPlanTerm,
  reservedScheduleId: string,
  reservedChunkIndex: number,
  expectedFirstPaymentCents?: number,
): Promise<EnrollPaymentPlanResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  try {
    const plan = await createPaymentPlan(session.user.id, cadence, term, zelleHandle, reservedScheduleId, reservedChunkIndex, typeof expectedFirstPaymentCents === "number" ? expectedFirstPaymentCents : undefined);
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

/** Starts a group plan: you (the payer) and 1 to 3 other existing accounts, all or nobody. */
export async function enrollFamilyPlanAction(
  term: PaymentPlanTerm,
  reservedScheduleId: string,
  reservedChunkIndex: number,
  memberEmails: string[],
  expectedFirstPaymentCents?: number,
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
      expectedFirstPaymentCents: typeof expectedFirstPaymentCents === "number" ? expectedFirstPaymentCents : undefined,
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

export interface EnrollParentPlanResult {
  ok: boolean;
  startPaymentId: string | null;
  amountCents: number | null;
  error: string | null;
}

/** Parent mode: a parent starts plans for the children they are linked to (and, if they choose, themselves), paying one combined first payment. */
export async function enrollParentPlanAction(
  term: PaymentPlanTerm,
  reservedScheduleId: string,
  reservedChunkIndex: number,
  childEmails: string[],
  includeSelf: boolean,
  expectedFirstPaymentCents?: number,
): Promise<EnrollParentPlanResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  if (!Array.isArray(childEmails) || childEmails.length > 10 || childEmails.some((e) => typeof e !== "string")) {
    return { ok: false, startPaymentId: null, amountCents: null, error: "Check the email addresses and try again." };
  }
  try {
    await consumeRateLimit(prisma, `parent-plan:${session.user.id}`, { windowMinutes: 60, max: 10, message: "Too many tries. Please wait a while and try again." });
  } catch (error) {
    if (error instanceof RateLimitError) return { ok: false, startPaymentId: null, amountCents: null, error: error.message };
    throw error;
  }
  try {
    const { startPayment } = await createParentPlans({
      payerId: session.user.id,
      cadence: OFFERED_PLAN_CADENCE,
      term,
      zelleHandle: process.env.ZELLE_HANDLE ?? "payments@yourplatform.com",
      reservedScheduleId,
      reservedChunkIndex,
      childEmails,
      includeSelf: Boolean(includeSelf),
      expectedFirstPaymentCents: typeof expectedFirstPaymentCents === "number" ? expectedFirstPaymentCents : undefined,
    });
    revalidatePath("/", "layout");
    return { ok: true, startPaymentId: startPayment.id, amountCents: startPayment.amountCents, error: null };
  } catch (error) {
    if (error instanceof PaymentPlanError) return { ok: false, startPaymentId: null, amountCents: null, error: error.message };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Switching a paid plan into a group plan. It ends the person's current plan once the group's first payment is approved, so it
// takes their password and a code emailed to them, checked again here on the server each time.
// ---------------------------------------------------------------------------

async function checkPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, passwordHash: true } });
  if (!user?.passwordHash) return { ok: false as const, error: "This account has no password set. Message the studio." };
  if (!(await bcrypt.compare(password, user.passwordHash))) return { ok: false as const, error: "Password is incorrect." };
  return { ok: true as const, email: user.email };
}

/** Step 1: checks the password and emails a code to the account's own address. */
export async function requestSwitchToFamilyCodeAction(password: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  const check = await checkPassword(session.user.id, password);
  if (!check.ok) return check;
  try {
    const sent = await createAndSendCode({ email: check.email, userId: session.user.id, purpose: "SWITCH_TO_FAMILY" });
    if (!sent.ok) return { ok: false, error: "Could not send a code. Try again in a moment." };
  } catch (error) {
    if (error instanceof CodeRateLimitError) return { ok: false, error: error.message };
    throw error;
  }
  return { ok: true };
}

/** Step 2: password and code again, then the group is set up. The current plan keeps running until the group's first payment is approved. */
export async function confirmSwitchToFamilyAction(
  password: string,
  code: string,
  term: PaymentPlanTerm,
  reservedScheduleId: string | null,
  reservedChunkIndex: number | null,
  memberEmails: string[],
  expectedFirstPaymentCents?: number,
): Promise<EnrollFamilyPlanResult> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/plans");
  const fail = (error: string): EnrollFamilyPlanResult => ({ ok: false, planId: null, startPaymentId: null, amountCents: null, memberCount: 0, error });
  if (!Array.isArray(memberEmails) || memberEmails.length > 10 || memberEmails.some((e) => typeof e !== "string")) return fail("Check the email addresses and try again.");

  const check = await checkPassword(session.user.id, password);
  if (!check.ok) return fail(check.error);
  const verified = await verifyCode(check.email, "SWITCH_TO_FAMILY", String(code).trim());
  if (!verified.ok) {
    const message = { not_found: "Request a code first.", expired: "That code expired. Request a new one.", too_many_attempts: "Too many wrong tries. Request a new code.", incorrect: "Incorrect code." }[verified.reason];
    return fail(message);
  }

  try {
    await consumeRateLimit(prisma, `family-plan:${session.user.id}`, { windowMinutes: 60, max: 8, message: "Too many tries. Please wait a while and try again." });
    const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
    const { plans, startPayment } = await createFamilyPlans({
      payerId: session.user.id,
      cadence: OFFERED_PLAN_CADENCE,
      term,
      zelleHandle,
      reservedScheduleId: reservedScheduleId ?? undefined,
      reservedChunkIndex: reservedChunkIndex ?? undefined,
      memberEmails,
      expectedFirstPaymentCents: typeof expectedFirstPaymentCents === "number" ? expectedFirstPaymentCents : undefined,
      verifiedSwitch: true,
    });
    revalidatePath("/", "layout");
    return { ok: true, planId: null, startPaymentId: startPayment.id, amountCents: startPayment.amountCents, memberCount: plans.length + 1, error: null };
  } catch (error) {
    if (error instanceof PaymentPlanError || error instanceof RateLimitError) return fail(error.message);
    throw error;
  }
}
