// Manual admin corrections to a student's classCredits balance — separate
// from the normal purchase flow (payments.ts's approveZellePayment) and the
// normal spend/refund flow (classSchedule.ts's booking/cancellation). This
// is for one-off grants and corrections: "customer paid outside Zelle",
// "refund for a scheduling mistake", "goodwill credit", etc. Every change
// is written to CreditAdjustment so the balance is always explainable.

import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { recordCreditGrant, drawDownCredits } from "@/lib/creditLedger";

export class CreditAdjustmentError extends Error {}

export interface CreditUserSearchRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  classCredits: number;
}

/** Same name-or-email search as messages.ts's searchUsersForMessaging, plus the current balance the admin needs to see before adjusting it. */
export async function searchUsersForCredits(query: string): Promise<CreditUserSearchRow[]> {
  const trimmed = query.trim();
  const users = await prisma.user.findMany({
    where: trimmed
      ? { OR: [{ email: { contains: trimmed, mode: "insensitive" } }, { name: { contains: trimmed, mode: "insensitive" } }] }
      : undefined,
    select: { id: true, name: true, email: true, image: true, classCredits: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return users;
}

export interface CreditAdjustmentRow {
  id: string;
  amount: number;
  reasonNote: string;
  createdAt: Date;
  user: { id: string; name: string | null; email: string };
  adjustedBy: { id: string; name: string | null; email: string };
}

const historySelect = {
  id: true,
  amount: true,
  reasonNote: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  adjustedBy: { select: { id: true, name: true, email: true } },
} as const;

/** Most-recent-first history for one student. */
export async function getUserCreditHistory(userId: string, limit = 25): Promise<CreditAdjustmentRow[]> {
  return prisma.creditAdjustment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: historySelect,
  });
}

/** Most-recent-first across every student — the global "recent grants" view. */
export async function getRecentCreditAdjustments(limit = 25): Promise<CreditAdjustmentRow[]> {
  return prisma.creditAdjustment.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: historySelect,
  });
}

/**
 * Grants (amount > 0) or deducts (amount < 0) class credits, atomically:
 * balance update + audit row happen in one transaction, and a deduction
 * that would take the balance below 0 is rejected outright rather than
 * silently clamped — clamping would hide a reason-mismatched amount (e.g.
 * meaning to deduct 2 but typing 20) instead of surfacing it to the admin.
 */
export async function adjustUserCredits(
  adminId: string,
  userId: string,
  amount: number,
  reasonNote: string,
): Promise<{ balance: number }> {
  if (!Number.isInteger(amount) || amount === 0) {
    throw new CreditAdjustmentError("Amount must be a non-zero whole number.");
  }
  const note = reasonNote.trim();
  if (!note) {
    throw new CreditAdjustmentError("A reason is required.");
  }

  const { balance } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { classCredits: true } });
    const newBalance = user.classCredits + amount;
    if (newBalance < 0) {
      throw new CreditAdjustmentError(
        `That would take the balance below 0 (currently ${user.classCredits}, change is ${amount > 0 ? "+" : ""}${amount}).`,
      );
    }

    const updated = await tx.user.update({ where: { id: userId }, data: { classCredits: newBalance }, select: { classCredits: true } });
    await tx.creditAdjustment.create({ data: { userId, adjustedById: adminId, amount, reasonNote: note } });

    return { balance: updated.classCredits };
  });

  // Best-effort ledger bookkeeping, outside the transaction on purpose (see
  // creditLedger.ts's file header) — the real, correctness-critical balance
  // change already committed above unchanged. A grant records a
  // non-expiring CreditGrant (an admin adjustment is never the expiring
  // kind); a deduction draws down existing grants the same way a real spend
  // would.
  if (amount > 0) {
    await recordCreditGrant(userId, amount, { source: "ADMIN_ADJUSTMENT", expiresAt: null });
  } else {
    await drawDownCredits(userId, Math.abs(amount));
  }

  const magnitude = Math.abs(amount);
  await createNotification({
    userId,
    type: "CREDIT_ADJUSTED",
    title: amount > 0 ? `${magnitude} class credit${magnitude === 1 ? "" : "s"} added` : `${magnitude} class credit${magnitude === 1 ? "" : "s"} removed`,
    body: `${note}. New balance: ${balance} credit${balance === 1 ? "" : "s"}.`,
    emailCategory: "payments",
  });

  return { balance };
}
