"use server";

import { withStudentNotice } from "@/lib/notifyScope";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { adminPausePlan, adminResumePlan, cancelPaymentPlan, changePlanBillDate, PaymentPlanError, recordPlanPaymentReceived, resendPlanInvoice } from "@/lib/paymentPlans";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getLateSettlementPreview, settleLatePayment, type LateSettlementInput, type LateSettlementPreview } from "@/lib/lateSettlement";
import { runOnce } from "@/lib/idempotency";
import { applyPlanBuilder, getPlanBuilderContext, previewPlanBuilder, type PlanBuilderContext, type PlanBuilderInput, type PlanBuilderPreview, type PlanBuilderResult } from "@/lib/planBuilder";

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

export async function cancelPaymentPlanAction(planId: string, note: string, notify = true) {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    await cancelPaymentPlan(planId, admin.id, note);
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "plan.cancel", targetType: "PaymentPlan", targetId: planId, detail: note });
    revalidatePath("/", "layout");
  });
}

// Owner only: this writes revenue and can open someone's access.
export async function recordPlanPaymentAction(planId: string, notify = true): Promise<{ ok: boolean; error: string | null }> {
  return withStudentNotice(notify, async () => {
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
  });
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
export async function pausePlanAdminAction(planId: string, when: { kind: "until"; date: string } | { kind: "indefinite" }, notify = true): Promise<{ ok: boolean; error: string | null }> {
  return withStudentNotice(notify, async () => {
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
  });
}

export async function resumePlanAdminAction(planId: string, notify = true): Promise<{ ok: boolean; error: string | null }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    try {
      await adminResumePlan(String(planId), admin.id);
    } catch (err) {
      if (err instanceof PaymentPlanError) return { ok: false, error: err.message };
      throw err;
    }
    revalidatePath("/", "layout");
    return { ok: true, error: null };
  });
}

/** Owner only: move a running plan's next bill to another day (YYYY-MM-DD, Eastern). */
export async function changeBillDateAction(planId: string, day: string): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can change a bill date." };
  try {
    await changePlanBillDate(String(planId), admin.id, String(day));
  } catch (err) {
    if (err instanceof PaymentPlanError) return { ok: false, error: err.message };
    throw err;
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
export async function settleLatePaymentAction(planId: string, input: LateSettlementInput, key?: string, notify = true): Promise<{ ok: boolean; error: string | null; newDueDate?: string }> {
  return withStudentNotice(notify, async () => {
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
  });
}

/** Owner only: what the plan builder starts from for this student (their plan if any, the free weekly times, the lengths on offer). */
export async function planBuilderContextAction(userId: string): Promise<{ ok: true; context: PlanBuilderContext } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can use the plan builder." };
  try {
    return { ok: true, context: await getPlanBuilderContext(userId) };
  } catch (err) {
    return { ok: false, error: err instanceof PaymentPlanError ? err.message : "Something went wrong. Try again." };
  }
}

/** Owner only: the whole timeline the plan builder would make, without changing anything. */
export async function planBuilderPreviewAction(input: PlanBuilderInput): Promise<{ ok: true; preview: PlanBuilderPreview } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can use the plan builder." };
  try {
    return { ok: true, preview: await previewPlanBuilder(input) };
  } catch (err) {
    return { ok: false, error: err instanceof PaymentPlanError ? err.message : "Something went wrong. Try again." };
  }
}

/** Owner only: sets up or re-anchors the plan from the chosen start date, in one step. Says what it charged. */
export async function planBuilderApplyAction(input: PlanBuilderInput, key?: string, notify = true): Promise<{ ok: boolean; error: string | null; result?: PlanBuilderResult }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can use the plan builder." };
    const result = await runOnce(
      admin.id,
      `plan-builder:${input.userId}`,
      key,
      async () => {
        try {
          const done = await applyPlanBuilder(admin.id, input);
          return { ok: true, error: null as string | null, result: done as PlanBuilderResult | undefined };
        } catch (err) {
          return { ok: false, error: err instanceof PaymentPlanError ? err.message : "Something went wrong. Check the plan before trying again.", result: undefined as PlanBuilderResult | undefined };
        }
      },
      { isSuccess: (r) => r.ok, whileRunning: { ok: false, error: "Already working on it." as string | null, result: undefined as PlanBuilderResult | undefined } },
    );
    if (result.ok) revalidatePath("/", "layout");
    return result;
  });
}
