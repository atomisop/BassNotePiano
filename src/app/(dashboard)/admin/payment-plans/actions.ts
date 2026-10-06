"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { cancelPaymentPlan, recordPlanPaymentReceived } from "@/lib/paymentPlans";
import { isOwnerEmail } from "@/lib/adminNotifications";

// The admin layout's redirect only protects rendering — Server Actions are
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
  revalidatePath("/admin/payment-plans");
}

// Owner only: this writes revenue and can open someone's access.
export async function recordPlanPaymentAction(planId: string): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can record a payment." };
  try {
    await recordPlanPaymentReceived(planId, admin.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not record the payment." };
  }
  revalidatePath("/admin/payment-plans");
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  return { ok: true, error: null };
}
