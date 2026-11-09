import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// One person's whole change history. Many changes are logged against the thing they changed, not the person: a plan's pause, price,
// bill date or weekly time against the PaymentPlan, a refund or a fix against the ZellePayment, a class move against the ClassBooking,
// a payer change against the FamilyPlanGroup. A history that matched only the person's own id left all of those out, so it gathers the
// ids of their plans, groups, payments and classes and matches any of them. No schema change: AuditLog.targetId is matched with IN.

/** The newest this many payments and classes count; older ones fall off a list that would only grow (a weekly student books 52 a year). */
export const ACCOUNT_AUDIT_MAX_PAYMENTS = 300;
export const ACCOUNT_AUDIT_MAX_BOOKINGS = 300;
export const ACCOUNT_AUDIT_MAX_PLANS = 50;

/** Pure: the person's id first, then the rest, with no blanks and no repeats. */
export function accountAuditIds(userId: string, groups: { plans: string[]; familyGroups: string[]; payments: string[]; bookings: string[] }): string[] {
  return [...new Set([userId, ...groups.plans, ...groups.familyGroups, ...groups.payments, ...groups.bookings].filter(Boolean))];
}

/** Every id a change to this person can be logged against. */
export async function accountAuditTargetIds(userId: string): Promise<string[]> {
  const [plans, payments, bookings] = await Promise.all([
    prisma.paymentPlan.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: ACCOUNT_AUDIT_MAX_PLANS, select: { id: true, familyGroupId: true } }),
    prisma.zellePayment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: ACCOUNT_AUDIT_MAX_PAYMENTS, select: { id: true } }),
    prisma.classBooking.findMany({ where: { studentId: userId }, orderBy: { scheduledAt: "desc" }, take: ACCOUNT_AUDIT_MAX_BOOKINGS, select: { id: true } }),
  ]);
  return accountAuditIds(userId, {
    plans: plans.map((p) => p.id),
    familyGroups: plans.map((p) => p.familyGroupId).filter((id): id is string => !!id),
    payments: payments.map((p) => p.id),
    bookings: bookings.map((b) => b.id),
  });
}

/** The AuditLog filter for one person's history (add it to any other filter). */
export async function accountAuditWhere(userId: string): Promise<Prisma.AuditLogWhereInput> {
  return { targetId: { in: await accountAuditTargetIds(userId) } };
}
