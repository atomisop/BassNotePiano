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
import { restartPlan, setPlanLength, setPlanPrice, setPlanProgress, waiveNextBill } from "@/lib/adminPlanTools";
import type { PaymentPlanTerm } from "@prisma/client";
import { adminLinkParent, adminUnlinkParent, changeGroupPayer, getGroupView, listLinksFor, separateFromGroup, type AdminLinkRow, type GroupView } from "@/lib/adminGroupTools";
import { getWeeklyTimeChoices, moveWeeklyTime, type WeeklyTimeChoice } from "@/lib/adminWeeklyTime";
import { applyPlanBuilder, getPlanBuilderContext, previewPlanBuilder, type PlanBuilderContext, type PlanBuilderInput, type PlanBuilderPreview, type PlanBuilderResult } from "@/lib/planBuilder";
import { applyPlanSetup, getPlanSetupContext, previewPlanSetup, type PlanSetupContext, type PlanSetupInput, type PlanSetupPreview, type PlanSetupResult } from "@/lib/planSetup";
import type { ScholarshipChoice } from "@/lib/planSetupRules";

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
export async function changeBillDateAction(planId: string, day: string, notify = true): Promise<{ ok: boolean; error: string | null }> {
  return withStudentNotice(notify, async () => {
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
  });
}

/** Owner only: sets how many bills are paid and the next bill date, with none of the usual limits (see setPlanProgress). */
export async function setPlanProgressAction(planId: string, billsPaid: number, nextBillDay: string, notify = true): Promise<{ ok: boolean; error: string | null; warning?: string | null }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can change a plan's progress." };
    try {
      const { warnings } = await setPlanProgress(admin.id, String(planId), { billsPaid: Number(billsPaid), nextBillDay: String(nextBillDay) });
      revalidatePath("/", "layout");
      return { ok: true, error: null, warning: warnings.join(" ") };
    } catch (err) {
      if (err instanceof PaymentPlanError) return { ok: false, error: err.message };
      throw err;
    }
  });
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

/** Owner only: what "Set up plan" starts from (the plan if any, the scholarship, the free weekly times and their dates). */
export async function planSetupContextAction(userId: string): Promise<{ ok: true; context: PlanSetupContext } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can set up a plan." };
  try {
    return { ok: true, context: await getPlanSetupContext(String(userId)) };
  } catch (err) {
    return { ok: false, error: err instanceof PaymentPlanError ? err.message : "Something went wrong. Try again." };
  }
}

/** Owner only: exactly what "Set up plan" would do, without changing anything. */
export async function planSetupPreviewAction(input: PlanSetupInput): Promise<{ ok: true; preview: PlanSetupPreview } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can set up a plan." };
  try {
    return { ok: true, preview: await previewPlanSetup(cleanSetupInput(input)) };
  } catch (err) {
    return { ok: false, error: err instanceof PaymentPlanError ? err.message : "Something went wrong. Try again." };
  }
}

/** Owner only: sets up the plan in one step (weekly time, first class, scholarship). Once per attempt, whatever the taps. */
export async function planSetupApplyAction(input: PlanSetupInput, key?: string, notify = true): Promise<{ ok: boolean; error: string | null; result?: PlanSetupResult }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can set up a plan." };
    const clean = cleanSetupInput(input);
    const result = await runOnce(
      admin.id,
      `plan-setup:${clean.userId}`,
      key,
      async () => {
        try {
          const done = await applyPlanSetup(admin.id, clean);
          return { ok: true, error: null as string | null, result: done as PlanSetupResult | undefined };
        } catch (err) {
          return { ok: false, error: err instanceof PaymentPlanError ? err.message : "Something went wrong. Check the plan before trying again.", result: undefined as PlanSetupResult | undefined };
        }
      },
      { isSuccess: (r) => r.ok, whileRunning: { ok: false, error: "Already working on it." as string | null, result: undefined as PlanSetupResult | undefined } },
    );
    if (result.ok) revalidatePath("/", "layout");
    return result;
  });
}

/** A server action's input is only typed at compile time: rebuild it from plain values before it reaches the plan code. */
function cleanSetupInput(input: PlanSetupInput): PlanSetupInput {
  const s = input?.scholarship as { kind?: unknown; percent?: unknown; replace?: unknown } | undefined;
  const scholarship: ScholarshipChoice =
    s?.kind === "full" ? { kind: "full" } : s?.kind === "percent" ? { kind: "percent", percent: Number(s.percent), replace: s.replace === true } : { kind: "keep" };
  const term = (["MONTHLY", "TERM_3", "TERM_6"] as const).find((t) => t === input?.term) ?? "TERM_6";
  // "Another time…": a typed day and start time, checked again on the server (planSetup.ts).
  const t = input?.newTime as { dayOfWeek?: unknown; startTime?: unknown } | null | undefined;
  const newTime = t ? { dayOfWeek: Number(t.dayOfWeek), startTime: String(t.startTime ?? "") } : null;
  return { userId: String(input?.userId ?? ""), scheduleId: String(input?.scheduleId ?? ""), chunkIndex: Number(input?.chunkIndex), newTime, firstClassDate: String(input?.firstClassDate ?? ""), scholarship, term };
}

/** The plan's weekly time and the free times it could move to. Changes nothing. */
export async function weeklyTimeChoicesAction(planId: string): Promise<{ ok: true; current: WeeklyTimeChoice | null; choices: WeeklyTimeChoice[] } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    return { ok: true, ...(await getWeeklyTimeChoices(String(planId))) };
  } catch (err) {
    if (err instanceof PaymentPlanError) return { ok: false, error: err.message };
    throw err;
  }
}

/** Moves one person's weekly time and every upcoming class on it, group and parent plans included. */
export async function moveWeeklyTimeAction(planId: string, scheduleId: string, chunkIndex: number, notify = true): Promise<{ ok: boolean; error: string | null; label?: string }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    try {
      const label = await moveWeeklyTime(String(planId), admin.id, String(scheduleId), Number(chunkIndex));
      revalidatePath("/", "layout");
      return { ok: true, error: null, label };
    } catch (err) {
      if (err instanceof PaymentPlanError) return { ok: false, error: err.message };
      throw err;
    }
  });
}

type PlanToolResult = { ok: true; message: string } | { ok: false; error: string };

// The owner only, like the bill date and the plan builder: these change what a student pays.
async function ownerPlanTool(notify: boolean, work: (adminId: string) => Promise<string>): Promise<PlanToolResult> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can do this." };
    try {
      const message = await work(admin.id);
      revalidatePath("/", "layout");
      return { ok: true, message };
    } catch (err) {
      if (err instanceof PaymentPlanError) return { ok: false, error: err.message };
      throw err;
    }
  });
}

export async function setPlanLengthAction(planId: string, term: PaymentPlanTerm, newPrice: boolean, notify = true): Promise<PlanToolResult> {
  return ownerPlanTool(notify, async (adminId) => `Now ${await setPlanLength(adminId, String(planId), term, Boolean(newPrice))}`);
}

export async function setPlanPriceAction(planId: string, dollars: number, notify = true): Promise<PlanToolResult> {
  return ownerPlanTool(notify, async (adminId) => `Each bill is now ${await setPlanPrice(adminId, String(planId), Math.round(Number(dollars) * 100))}`);
}

export async function waiveNextBillAction(planId: string, notify = true): Promise<PlanToolResult> {
  return ownerPlanTool(notify, async (adminId) => {
    const next = await waiveNextBill(adminId, String(planId));
    return next ? `Next 28 days are free. Next bill ${next.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}` : "Last bill waived, the plan is complete";
  });
}

export async function restartPlanAction(planId: string, notify = true): Promise<PlanToolResult> {
  return ownerPlanTool(notify, async (adminId) => {
    const { keptTime } = await restartPlan(adminId, String(planId));
    return keptTime ? "Plan restarted with its weekly time" : "Plan restarted. Its weekly time was taken, so pick a new one with Weekly time";
  });
}

/** Who is on this group or parent plan, who pays, and who could pay instead. Owner only. */
export async function groupViewAction(groupId: string): Promise<{ ok: true; view: GroupView } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can do this." };
  try {
    return { ok: true, view: await getGroupView(String(groupId)) };
  } catch (err) {
    if (err instanceof PaymentPlanError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function separateFromGroupAction(planId: string, notify = true): Promise<PlanToolResult> {
  return ownerPlanTool(notify, async (adminId) => `Moved onto their own plan, ${await separateFromGroup(adminId, String(planId))} a bill`);
}

export async function changeGroupPayerAction(groupId: string, newPayerId: string, notify = true): Promise<PlanToolResult> {
  return ownerPlanTool(notify, async (adminId) => `${await changeGroupPayer(adminId, String(groupId), String(newPayerId))} pays for the group now`);
}

export async function listParentLinksAction(userId: string): Promise<AdminLinkRow[]> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return [];
  return listLinksFor(String(userId));
}

export async function linkParentAction(userId: string, otherEmail: string, userIs: "parent" | "child", notify = true): Promise<PlanToolResult> {
  if (userIs !== "parent" && userIs !== "child") return { ok: false, error: "Pick parent or child." };
  return ownerPlanTool(notify, async (adminId) => `Linked to ${await adminLinkParent(adminId, String(userId), String(otherEmail), userIs)}`);
}

export async function unlinkParentAction(userId: string, linkId: string, notify = true): Promise<PlanToolResult> {
  return ownerPlanTool(notify, async (adminId) => `Link with ${await adminUnlinkParent(adminId, String(userId), String(linkId))} ended`);
}
