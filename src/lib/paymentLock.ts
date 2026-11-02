import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// The non-payment lock. When an unpaid renewal bill reaches payments.lapseAfterDays past due, the plan is canceled
// (lapsePlanForNonPayment) and the person who pays that bill is locked: every open session ends (sessionVersion), sign-in
// is refused with PAYMENT_LOCKED_CODE (paymentLockCodes.ts), and the sign-in screens send them to /account-locked. Only an admin lifts it. A
// first bill that never arrived does not lock anyone (that is someone who did not start, not someone who stopped paying).

/** Locks the account for non-payment. Never an admin. Returns false when it was already locked or cannot be. */
export async function lockForNonPayment(userId: string, planId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, paymentLockedAt: true } });
  if (!user || user.role === "ADMIN" || user.paymentLockedAt) return false;
  await prisma.user.update({ where: { id: user.id }, data: { paymentLockedAt: new Date(), sessionVersion: { increment: 1 } } });
  await logAudit({ action: "user.payment-lock", targetType: "User", targetId: user.id, detail: `Locked ${user.email} for non-payment (plan ${planId})` });
  return true;
}

/** Lifts the lock, so they can sign in again. The canceled plan stays canceled. */
export async function liftPaymentLock(admin: { id: string; email: string | null }, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, paymentLockedAt: true } });
  if (!user?.paymentLockedAt) return false;
  await prisma.user.update({ where: { id: user.id }, data: { paymentLockedAt: null } });
  await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "user.payment-unlock", targetType: "User", targetId: user.id, detail: `Lifted the payment lock on ${user.email}` });
  return true;
}
