"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { approveZellePayment, deleteZellePayment, markPaymentChecked, rejectZellePayment } from "@/lib/payments";
import { isOwnerEmail } from "@/lib/adminNotifications";

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
  await deleteZellePayment(paymentId);
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
}
