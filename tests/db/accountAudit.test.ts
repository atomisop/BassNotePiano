import { afterAll, describe, expect, it } from "vitest";
import { accountAuditIds, accountAuditTargetIds, accountAuditWhere } from "@/lib/accountAudit";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("aa");
const userIds: string[] = [];
const scheduleIds: string[] = [];
const auditIds: string[] = [];

async function student(name: string) {
  const u = await makeUser(tag, name);
  userIds.push(u.id);
  const plan = await prisma.paymentPlan.create({
    data: { userId: u.id, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: 17000, creditsPerInstallment: 8, termMonths: 6, nextDueDate: new Date(Date.now() + 5 * 86_400_000), status: "ACTIVE" },
  });
  const payment = await prisma.zellePayment.create({
    data: { userId: u.id, paymentPlanId: plan.id, purpose: "PAYMENT_PLAN_INSTALLMENT", installmentNumber: 1, amountCents: 17000, zelleHandle: "x", status: "VERIFIED" },
  });
  const day = new Date(Date.UTC(2031, 0, 6));
  const slot = await prisma.classSchedule.create({ data: { dayOfWeek: day.getUTCDay(), startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} ${name}` } });
  scheduleIds.push(slot.id);
  const booking = await prisma.classBooking.create({ data: { studentId: u.id, scheduleId: slot.id, occurrenceDate: day, scheduledAt: new Date(day.getTime() + 15 * 3_600_000), creditsSpent: 2 } });
  return { user: u, plan, payment, booking };
}

async function log(action: string, targetType: string, targetId: string) {
  const row = await prisma.auditLog.create({ data: { action, targetType, targetId, detail: tag } });
  auditIds.push(row.id);
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { id: { in: auditIds } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: scheduleIds } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("one person's change history", () => {
  it("lists the changes to their plan, payment and class, not only the ones logged against them", async () => {
    const a = await student("Ann History");
    const b = await student("Bo History");
    await log("user.role", "User", a.user.id);
    await log("plan.pause", "PaymentPlan", a.plan.id);
    await log("payment.refund", "ZellePayment", a.payment.id);
    await log("booking.move-custom", "ClassBooking", a.booking.id);
    await log("plan.price", "PaymentPlan", b.plan.id);

    const rows = await prisma.auditLog.findMany({ where: { AND: [await accountAuditWhere(a.user.id), { detail: tag }] }, select: { action: true } });
    expect(rows.map((r) => r.action).sort()).toEqual(["booking.move-custom", "payment.refund", "plan.pause", "user.role"]);

    const ids = await accountAuditTargetIds(a.user.id);
    expect(ids[0]).toBe(a.user.id);
    expect(ids).not.toContain(b.plan.id);
  });

  it("puts the person first and drops blanks and repeats", () => {
    expect(accountAuditIds("u", { plans: ["p", "p"], familyGroups: ["g"], payments: ["", "z"], bookings: ["u"] })).toEqual(["u", "p", "g", "z"]);
  });
});
