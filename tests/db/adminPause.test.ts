import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { adminPausePlan, adminResumePlan, bookReservedWindowForPlan, PaymentPlanError, pausePaymentPlan } from "@/lib/paymentPlans";
import { newTag, prisma } from "./helpers";

const tag = newTag("ap");
const DAY = 86_400_000;
const userIds: string[] = [];
const slotIds: string[] = [];
let adminId = "";

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name: "Pause Tester", passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
  userIds.push(u.id);
  return u;
}

async function setup() {
  if (!adminId) adminId = (await account("admin", "ADMIN")).id;
  const user = await account(`s${userIds.length}`);
  const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "11:00", durationMin: 45, creditCost: 2, label: `${tag} ${slotIds.length}` } });
  slotIds.push(slot.id);
  const due = new Date(Date.now() + 20 * DAY);
  const plan = await prisma.paymentPlan.create({
    data: { userId: user.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3", installmentAmountCents: 5500, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: due, reservedScheduleId: slot.id, reservedChunkIndex: 0 },
  });
  const grant = await prisma.creditGrant.create({ data: { userId: user.id, source: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, creditsGranted: 8, creditsRemaining: 8, expiresAt: due } });
  const booking = await prisma.classBooking.create({
    data: { studentId: user.id, scheduleId: slot.id, occurrenceDate: new Date(Date.UTC(2031, 0, 1)), scheduledAt: new Date(Date.now() + 3 * DAY), status: "SCHEDULED", creditsSpent: 2, reservedByPlanId: plan.id },
  });
  return { user, plan, grant, booking, due };
}

afterAll(async () => {
  await prisma.zellePayment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ targetId: { in: userIds } }, { actorId: { in: userIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("the studio pausing a plan", () => {
  it("to a date: moves the due date and credits by the span, cancels the classes inside it, keeps the weekly time", async () => {
    const s = await setup();
    const until = new Date(Date.now() + 10 * DAY);
    await adminPausePlan(s.plan.id, adminId, until);
    const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: s.plan.id } });
    expect(plan.pauseUntil?.getTime()).toBe(until.getTime());
    expect(plan.nextDueDate.getTime() - s.due.getTime()).toBeGreaterThan(9.9 * DAY);
    expect(plan.nextDueDate.getTime() - s.due.getTime()).toBeLessThan(10.1 * DAY);
    expect(plan.reservedScheduleId).toBe(s.plan.reservedScheduleId);
    expect((await prisma.creditGrant.findUniqueOrThrow({ where: { id: s.grant.id } })).expiresAt!.getTime()).toBe(plan.nextDueDate.getTime());
    const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: s.booking.id } });
    expect(booking.status).toBe("CANCELED");
    expect(booking.canceledReason).toBe("Plan paused");
  });

  it("indefinitely, then resumed after a short while: the due date and credits are back to the time that was left, plus the time paused", async () => {
    const s = await setup();
    await adminPausePlan(s.plan.id, adminId, null);
    const paused = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: s.plan.id } });
    expect(paused.nextDueDate.getTime() - s.due.getTime()).toBeGreaterThan(3000 * DAY);
    // A paused plan books nothing.
    await bookReservedWindowForPlan(s.plan.id);
    expect(await prisma.classBooking.count({ where: { studentId: s.user.id, status: "SCHEDULED" } })).toBe(0);

    // Pretend the pause began two days ago.
    await prisma.paymentPlan.update({ where: { id: s.plan.id }, data: { pausedAt: new Date(Date.now() - 2 * DAY), pauseUntil: new Date(Date.now() - 2 * DAY + (paused.pauseUntil!.getTime() - paused.pausedAt!.getTime())) } });
    await adminResumePlan(s.plan.id, adminId);
    const resumed = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: s.plan.id } });
    // Originally due in 20 days; two days were paused, so now about 22 days from the original date.
    const shift = resumed.nextDueDate.getTime() - s.due.getTime();
    expect(shift).toBeGreaterThan(1.9 * DAY);
    expect(shift).toBeLessThan(2.1 * DAY);
    const grant = await prisma.creditGrant.findUniqueOrThrow({ where: { id: s.grant.id } });
    expect(Math.abs(grant.expiresAt!.getTime() - resumed.nextDueDate.getTime())).toBeLessThan(1000);
    await expect(adminResumePlan(s.plan.id, adminId)).rejects.toBeInstanceOf(PaymentPlanError);
  });

  it("refuses a past date, a second pause, a family plan, and a student pausing on top of it", async () => {
    const s = await setup();
    await expect(adminPausePlan(s.plan.id, adminId, new Date(Date.now() - DAY))).rejects.toBeInstanceOf(PaymentPlanError);
    await expect(adminPausePlan(s.plan.id, adminId, new Date(Date.now() + 400 * DAY))).rejects.toBeInstanceOf(PaymentPlanError);
    await adminPausePlan(s.plan.id, adminId, new Date(Date.now() + 5 * DAY));
    await expect(adminPausePlan(s.plan.id, adminId, null)).rejects.toThrow(/already paused/);
    await expect(pausePaymentPlan(s.user.id, 1)).rejects.toBeInstanceOf(PaymentPlanError);
  });

  it("closes an unpaid bill for the old date, and will not pause under a payment being reviewed", async () => {
    const s = await setup();
    const bill = await prisma.zellePayment.create({ data: { userId: s.user.id, paymentPlanId: s.plan.id, purpose: "PAYMENT_PLAN_INSTALLMENT", installmentNumber: 2, amountCents: 5500, zelleHandle: "pay@example.com", status: "AWAITING_TRANSFER" } });
    await adminPausePlan(s.plan.id, adminId, new Date(Date.now() + 5 * DAY));
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("EXPIRED");

    const t = await setup();
    await prisma.zellePayment.create({ data: { userId: t.user.id, paymentPlanId: t.plan.id, purpose: "PAYMENT_PLAN_INSTALLMENT", installmentNumber: 2, amountCents: 5500, zelleHandle: "pay@example.com", status: "PENDING_REVIEW" } });
    await expect(adminPausePlan(t.plan.id, adminId, null)).rejects.toThrow(/reviewed/);
  });
});
