"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { approveZellePayment, deleteZellePayment, markPaymentChecked, refundZellePayment, rejectZellePayment } from "@/lib/payments";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { dismissReceipt, matchReceiptToPayment, ReceiptError } from "@/lib/paymentReceipts";

// The admin layout's redirect only protects rendering — Server Actions are
// separate RPC endpoints the layout never runs for, so this is the actual
// authorization check for these mutations, not just a UX nicety.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/payments");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function approvePaymentAction(paymentId: string) {
  const admin = await requireAdmin();
  await approveZellePayment(paymentId, admin.id);
  revalidatePath("/admin/payments");
}

export async function checkPaymentAction(paymentId: string) {
  await requireAdmin();
  await markPaymentChecked(paymentId);
  revalidatePath("/admin/payments");
}

export async function rejectPaymentAction(paymentId: string, reason: string) {
  const admin = await requireAdmin();
  await rejectZellePayment(paymentId, admin.id, reason);
  revalidatePath("/admin/payments");
}

// Owner only, not just admin: deleting a payment record is permanent, and
// employees are admins too.
export async function deletePaymentAction(paymentId: string) {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) redirect("/admin/payments");
  await deleteZellePayment(paymentId, { id: admin.id, email: admin.email ?? null });
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
}

// Owner only: a refund changes revenue and can take back credits and end a plan.
export async function refundPaymentAction(
  paymentId: string,
  note: string,
  removeCredits: boolean,
  cancelPlan: boolean,
): Promise<{ ok: boolean; error: string | null; warning?: string | null }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can refund a payment." };
  try {
    const { warnings } = await refundZellePayment(paymentId, { id: admin.id, email: admin.email ?? null }, { note, removeCredits, cancelPlan });
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    return { ok: true, error: null, warning: warnings.length ? warnings.join(" ") : null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not refund." };
  }
}

/** Attaches a bank or Venmo email that matched nobody to an open payment for the same amount, and approves it. */
export async function matchReceiptAction(receiptId: string, paymentId: string): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  try {
    await matchReceiptToPayment({ receiptId, paymentId, admin: { id: admin.id, email: admin.email ?? null } });
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof ReceiptError ? err.message : "Something went wrong. Nothing was changed." };
  }
}

/** Says a payment email has nothing to do with a payment, so it stops being counted. */
export async function dismissReceiptAction(receiptId: string): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  try {
    await dismissReceipt({ receiptId, admin: { id: admin.id, email: admin.email ?? null } });
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "Something went wrong. Nothing was changed." };
  }
}
