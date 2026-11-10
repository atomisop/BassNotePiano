import type { Prisma } from "@prisma/client";

/**
 * Matches a PaymentPlan whose weekly reservation (reservedScheduleId/
 * reservedChunkIndex) is still "live": ACTIVE, or COMPLETED with a
 * not-yet-expired CreditGrant against it. The COMPLETED-with-a-live-grant
 * case matters because a plan finishing its final paid installment
 * shouldn't instantly lose its slot and auto-booking the moment that
 * last payment clears: the credits from that last cycle are still good and
 * the student is still using the slot. Shared by every reservation check
 * (classSchedule.ts, paymentPlans.ts, seatLoad.ts), so "what counts as a
 * live reservation" can't drift between them. Re-exported from classSchedule.ts.
 */
export function livePaymentPlanConditions(): Prisma.PaymentPlanWhereInput[] {
  return [{ status: "ACTIVE" }, { status: "COMPLETED", creditGrants: { some: { expiresAt: { gt: new Date() }, expiredAt: null } } }];
}
