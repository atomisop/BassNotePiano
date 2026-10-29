"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { adminPausePlan, adminResumePlan, cancelPaymentPlan, changeReservedSlot, PaymentPlanError, recordPlanPaymentReceived, resendPlanInvoice } from "@/lib/paymentPlans";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getReservableSlots } from "@/lib/classSchedule";
import { getHoldChoices } from "@/lib/contacts";
import { PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import { getLateSettlementPreview, settleLatePayment, type LateSettlementInput, type LateSettlementPreview } from "@/lib/lateSettlement";
import { runOnce } from "@/lib/idempotency";

// The admin layout's redirect only protects rendering, Server Actions are
// separate RPC endpoints the layout never runs for, so this is the actual
// authorization check for this mutation, not just a UX nicety. Duplicated
// locally rather than shared, matching every other admin actions.ts file in
// this codebase.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/payment-plans");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function cancelPaymentPlanAction(planId: string, note: string) {
  const admin = await requireAdmin();
  await cancelPaymentPlan(planId, admin.id, note);
  await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "plan.cancel", targetType: "PaymentPlan", targetId: planId, detail: note });
  revalidatePath("/", "layout");
}

// Owner only: this writes revenue and can open someone's access.
export async function recordPlanPaymentAction(planId: string): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can record a payment." };
  try {
    const outcome = await recordPlanPaymentReceived(planId, admin.id);
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "plan.record-payment", targetType: "PaymentPlan", targetId: planId, detail: outcome });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not record the payment." };
  }
  revalidatePath("/", "layout");
  return { ok: true, error: null };
}

export async function resendBillAction(planId: string): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  try {
    const result = await resendPlanInvoice(planId);
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "plan.resend-bill", targetType: "PaymentPlan", targetId: planId, detail: result });
    return { ok: true, message: result === "sent" ? "Bill sent again." : "They turned off payment emails, so nothing was sent." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not send." };
  }
}

/** Pause a running plan to a date (`until`, end of that day, Eastern) or indefinitely. */
export async function pausePlanAdminAction(planId: string, when: { kind: "until"; date: string } | { kind: "indefinite" }): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  try {
    let until: Date | null = null;
    if (when.kind === "until") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(when.date))) return { ok: false, error: "Pick a date." };
      // Noon UTC of the chosen day: the pause ends on that calendar day wherever the studio is.
      until = new Date(`${when.date}T12:00:00Z`);
    }
    await adminPausePlan(String(planId), admin.id, until);
  } catch (err) {
    if (err instanceof PaymentPlanError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/", "layout");
  return { ok: true, error: null };
}

export async function resumePlanAdminAction(planId: string): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  try {
    await adminResumePlan(String(planId), admin.id);
  } catch (err) {
    if (err instanceof PaymentPlanError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/", "layout");
  return { ok: true, error: null };
}

export interface WeeklyTimeChoice {
  scheduleId: string;
  chunkIndex: number;
  label: string;
}

/** The weekly times a plan could move to (free ones only), and the one it has now. */
export async function weeklyTimeChoicesAdminAction(planId: string): Promise<{ ok: true; current: string | null; choices: WeeklyTimeChoice[] } | { ok: false; error: string }> {
  await requireAdmin();
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId }, select: { cadence: true, reservedScheduleId: true, reservedChunkIndex: true } });
  if (!plan) return { ok: false, error: "That plan was not found." };
  const [free, all] = await Promise.all([getReservableSlots(PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence]), getHoldChoices()]);
  const labelOf = (scheduleId: string, chunkIndex: number) => all.find((c) => c.scheduleId === scheduleId && c.chunkIndex === chunkIndex)?.label ?? null;
  const choices = free.flatMap((slot) => {
    const label = labelOf(slot.scheduleId, slot.chunkIndex);
    return label ? [{ scheduleId: slot.scheduleId, chunkIndex: slot.chunkIndex, label }] : [];
  });
  const current = plan.reservedScheduleId && plan.reservedChunkIndex !== null ? labelOf(plan.reservedScheduleId, plan.reservedChunkIndex) : null;
  return { ok: true, current, choices };
}

/** Moves the whole plan: the standing weekly time and every upcoming class on it, in one step. */
export async function moveWeeklyTimeAdminAction(planId: string, scheduleId: string, chunkIndex: number): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  try {
    const plan = await prisma.paymentPlan.findUnique({ where: { id: planId }, select: { userId: true } });
    if (!plan) return { ok: false, error: "That plan was not found." };
    await changeReservedSlot(plan.userId, scheduleId, chunkIndex, { byAdmin: true });
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "plan.move-time", targetType: "PaymentPlan", targetId: planId, detail: `${scheduleId}:${chunkIndex}` });
  } catch (err) {
    return { ok: false, error: err instanceof PaymentPlanError ? err.message : "Something went wrong. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, error: null };
}

/** Owner only: what settling a late payer would do (the bill, the classes taught on credit, the new due date). Changes nothing. */
export async function lateSettlementPreviewAction(planId: string): Promise<{ ok: true; preview: LateSettlementPreview } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can settle a late payment." };
  try {
    return { ok: true, preview: await getLateSettlementPreview(planId) };
  } catch (err) {
    return { ok: false, error: err instanceof PaymentPlanError ? err.message : "Something went wrong. Try again." };
  }
}

/** Owner only: records the payment, charges the class taught on credit, and puts the next bill 28 days from today, in one step. */
export async function settleLatePaymentAction(planId: string, input: LateSettlementInput, key?: string): Promise<{ ok: boolean; error: string | null; newDueDate?: string }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can settle a late payment." };
  const result = await runOnce(
    admin.id,
    `settle-late:${planId}`,
    key,
    async () => {
      try {
        const done = await settleLatePayment(planId, admin.id, input);
        return { ok: true, error: null, newDueDate: done.newDueDate.toISOString() };
      } catch (err) {
        return { ok: false, error: err instanceof PaymentPlanError ? err.message : "Something went wrong. Check the plan before trying again." };
      }
    },
    { isSuccess: (r) => r.ok, whileRunning: { ok: false, error: "Already working on it." } as { ok: boolean; error: string | null; newDueDate?: string } },
  );
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
