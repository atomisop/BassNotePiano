"use server";

import { withStudentNotice } from "@/lib/notifyScope";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { approveZellePayment, cancelOpenBill, deleteZellePayment, getPaymentSummary, markAllPaymentsChecked, markBillPaid, markPaymentChecked, refundZellePayment, rejectZellePayment, undoRefundZellePayment, type PaymentSummary } from "@/lib/payments";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { attachReceiptToStudent, dismissReceipt, ignoreSenderFromReceipt, matchReceiptToPayment, previewReceiptForStudent, ReceiptError, type ReceiptStudentTarget } from "@/lib/paymentReceipts";
import { runOnce } from "@/lib/idempotency";

// The admin layout's redirect only protects rendering, Server Actions are
// separate RPC endpoints the layout never runs for, so this is the actual
// authorization check for these mutations, not just a UX nicety.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/payments");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

// Owner only: approving marks a bill paid and grants its plan or credits. Staff accounts must not be able to give value away.
async function requireOwnerAdmin() {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) redirect("/admin/payments");
  return admin;
}

export async function approvePaymentAction(paymentId: string, notify = true) {
  return withStudentNotice(notify, async () => {
    const admin = await requireOwnerAdmin();
    await approveZellePayment(paymentId, admin.id);
    revalidatePath("/", "layout");
  });
}

export async function checkPaymentAction(paymentId: string) {
  await requireAdmin();
  await markPaymentChecked(paymentId);
  revalidatePath("/", "layout");
}

/** "Mark all as checked" on the Unchecked tab, after the admin has looked through them. */
export async function checkAllPaymentsAction(): Promise<{ message: string }> {
  await requireAdmin();
  const count = await markAllPaymentsChecked();
  revalidatePath("/", "layout");
  return { message: count === 1 ? "1 payment marked as checked." : `${count} payments marked as checked.` };
}

export async function rejectPaymentAction(paymentId: string, reason: string, notify = true) {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    await rejectZellePayment(paymentId, admin.id, reason);
    revalidatePath("/", "layout");
  });
}

// Owner only, not just admin: deleting a payment record is permanent, and
// employees are admins too.
export async function deletePaymentAction(paymentId: string) {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) redirect("/admin/payments");
  await deleteZellePayment(paymentId, { id: admin.id, email: admin.email ?? null });
  revalidatePath("/", "layout");
}

// Owner only: a refund changes revenue and can take back credits and end a plan.
export async function refundPaymentAction(
  paymentId: string,
  note: string,
  removeCredits: boolean,
  cancelPlan: boolean,
  notify = true,
  cancelClasses = false,
): Promise<{ ok: boolean; error: string | null; warning?: string | null }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can refund a payment." };
    try {
      const { warnings } = await refundZellePayment(paymentId, { id: admin.id, email: admin.email ?? null }, { note, removeCredits, cancelPlan, cancelClasses: cancelClasses === true });
      revalidatePath("/", "layout");
      return { ok: true, error: null, warning: warnings.length ? warnings.join(" ") : null };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not refund." };
    }
  });
}

// Owner only: puts a refunded payment back as paid (credits and plan optionally restored).
export async function undoRefundPaymentAction(paymentId: string, restoreCredits: boolean, reactivatePlan: boolean, notify = true): Promise<{ ok: boolean; error: string | null; warning?: string | null }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can undo a refund." };
    try {
      const { warnings } = await undoRefundZellePayment(String(paymentId), { id: admin.id, email: admin.email ?? null }, { restoreCredits: Boolean(restoreCredits), reactivatePlan: Boolean(reactivatePlan) });
      revalidatePath("/", "layout");
      return { ok: true, error: null, warning: warnings.length ? warnings.join(" ") : null };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not undo the refund." };
    }
  });
}

// Owner only: closes a bill nobody paid, keeping its record as expired.
export async function cancelBillAction(paymentId: string): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can cancel a bill." };
  try {
    await cancelOpenBill(String(paymentId), { id: admin.id, email: admin.email ?? null });
    revalidatePath("/", "layout");
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not cancel the bill." };
  }
}

/** Attaches a bank or Venmo email that matched nobody to an open payment for the same amount, and approves it. */
export async function matchReceiptAction(receiptId: string, paymentId: string, notify = true): Promise<{ ok: boolean; error: string | null }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireOwnerAdmin();
    try {
      await matchReceiptToPayment({ receiptId, paymentId, admin: { id: admin.id, email: admin.email ?? null } });
      revalidatePath("/", "layout");
      return { ok: true, error: null };
    } catch (err) {
      return { ok: false, error: err instanceof ReceiptError ? err.message : "Something went wrong. Nothing was changed." };
    }
  });
}

/** Says a payment email has nothing to do with a payment, so it stops being counted. */
export async function dismissReceiptAction(receiptId: string): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  try {
    await dismissReceipt({ receiptId, admin: { id: admin.id, email: admin.email ?? null } });
    revalidatePath("/", "layout");
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "Something went wrong. Nothing was changed." };
  }
}

/** Owner only: from now on, bank emails from this exact full name are skipped (the owner's own transfers). */
export async function ignoreSenderAction(receiptId: string): Promise<{ ok: boolean; error: string | null }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can change which senders are ignored." };
  try {
    await ignoreSenderFromReceipt({ receiptId, admin: { id: admin.id, email: admin.email ?? null } });
    revalidatePath("/", "layout");
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof ReceiptError ? err.message : "Something went wrong. Nothing was changed." };
  }
}

// ---------------------------------------------------------------------------
// Finishing a payment where the owner already is (the person's page, a plan dialog, an unmatched email)
// ---------------------------------------------------------------------------

type Done = { ok: boolean; error: string | null };

/** Owner only: money for an unpaid bill arrived another way (cash, an email that never came). Records it and approves it. */
export async function markBillPaidAction(paymentId: string, notify = true, key?: string): Promise<Done> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can mark a bill paid." };
    const result = await runOnce<Done>(
      admin.id,
      `mark-paid:${String(paymentId)}`,
      key,
      async () => {
        try {
          await markBillPaid(String(paymentId), { id: admin.id, email: admin.email ?? null });
          return { ok: true, error: null };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : "Could not mark the bill paid." };
        }
      },
      { isSuccess: (r) => r.ok, whileRunning: { ok: false, error: "Already working on it." } },
    );
    if (result.ok) revalidatePath("/", "layout");
    return result;
  });
}

/** One payment in a line (who, what, how much, its status), for a dialog that is waiting on it. */
export async function paymentSummaryAction(paymentId: string): Promise<PaymentSummary | null> {
  await requireAdmin();
  return getPaymentSummary(String(paymentId));
}

/** Owner only: what attaching an unmatched email to this person would pay. Changes nothing. */
export async function previewReceiptForStudentAction(receiptId: string, userId: string): Promise<{ ok: true; target: ReceiptStudentTarget } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can attach a payment email." };
  try {
    return { ok: true, target: await previewReceiptForStudent(String(receiptId), String(userId)) };
  } catch (err) {
    return { ok: false, error: err instanceof ReceiptError ? err.message : "Something went wrong. Nothing was changed." };
  }
}

/** Owner only: attaches the email to this person's bill (opening it when they paid early) and approves it. */
export async function attachReceiptToStudentAction(receiptId: string, userId: string, notify = true, key?: string): Promise<Done> {
  return withStudentNotice(notify, async () => {
    const admin = await requireOwnerAdmin();
    const result = await runOnce<Done>(
      admin.id,
      `attach-email:${String(receiptId)}`,
      key,
      async () => {
        try {
          await attachReceiptToStudent({ receiptId: String(receiptId), userId: String(userId), admin: { id: admin.id, email: admin.email ?? null } });
          return { ok: true, error: null };
        } catch (err) {
          return { ok: false, error: err instanceof ReceiptError ? err.message : "Something went wrong. Nothing was changed." };
        }
      },
      { isSuccess: (r) => r.ok, whileRunning: { ok: false, error: "Already working on it." } },
    );
    if (result.ok) revalidatePath("/", "layout");
    return result;
  });
}
