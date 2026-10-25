"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { adminPausePlan, adminResumePlan, cancelPaymentPlan, PaymentPlanError, recordPlanPaymentReceived, resendPlanInvoice } from "@/lib/paymentPlans";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { logAudit } from "@/lib/audit";

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
