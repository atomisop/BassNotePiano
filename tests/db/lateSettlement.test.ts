import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { getLateSettlementPreview, settleLatePayment } from "@/lib/lateSettlement";
import { newTag, prisma } from "./helpers";

const tag = newTag("ls");
const DAY = 86_400_000;
const userIds: string[] = [];
const slotIds: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}-${userIds.length}@example.test`;
  const u = await prisma.user.create({ data: { email, name: "Late Payer", passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
  userIds.push(u.id);
  return u;
}

async function setup() {
  const admin = await account("admin", "ADMIN");
  const user = await account("student");
  const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "11:00", durationMin: 45, creditCost: 2, label: `${tag}` } });
  slotIds.push(slot.id);
  // Due nine days ago, never paid since: the late payer.
  const plan = await prisma.paymentPlan.create({
    data: { userId: user.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3", installmentAmountCents: 16499, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: new Date(Date.now() - 9 * DAY), reservedScheduleId: slot.id, reservedChunkIndex: 0 },
  });
  await prisma.zellePayment.create({
    data: { userId: user.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 2, amountCents: 16499, lessonQuantity: 8, zelleHandle: "x", status: "AWAITING_TRANSFER" },
  });
  // The class taught while they owed: past, unmarked.
  const taught = await prisma.classBooking.create({
    data: { studentId: user.id, scheduleId: slot.id, occurrenceDate: new Date(Date.UTC(2031, 0, 2)), scheduledAt: new Date(Date.now() - 2 * DAY), status: "SCHEDULED", creditsSpent: 2, reservedByPlanId: plan.id },
  });
  return { admin, user, plan, taught };
}

afterAll(async () => {
  await prisma.zellePayment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("settling a late payer in one step", () => {
  it("shows what it will do: the open bill, the taught class and the date 28 days from today", async () => {
    const { plan, taught } = await setup();
    const preview = await getLateSettlementPreview(plan.id);
    expect(preview.payment).toBe("open");
    expect(preview.taught.map((t) => t.id)).toEqual([taught.id]);
    const days = (new Date(preview.newDueDate).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(27.9);
    expect(days).toBeLessThan(28.1);
  });

  it("records the payment, charges the taught class, and moves the next bill and the credits to 28 days from today", async () => {
    const { admin, user, plan, taught } = await setup();
    const result = await settleLatePayment(plan.id, admin.id, { recordPayment: true, bookingIds: [taught.id], chargeUnbookedClass: false });

    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.installmentsPaid).toBe(2);
    expect(Math.abs(after.nextDueDate.getTime() - result.newDueDate.getTime())).toBeLessThan(1000);
    expect((after.nextDueDate.getTime() - Date.now()) / DAY).toBeGreaterThan(27.9);

    // 8 credits arrived, the taught class spent 2.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).classCredits).toBe(6);
    const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: taught.id } });
    expect(booking.status).toBe("COMPLETED");
    expect(booking.attendance).toBe("PRESENT");

    const grant = await prisma.creditGrant.findFirstOrThrow({ where: { userId: user.id, paymentPlanId: plan.id, source: "PAYMENT_PLAN_INSTALLMENT" } });
    expect(Math.abs(grant.expiresAt!.getTime() - after.nextDueDate.getTime())).toBeLessThan(1000);
    expect(await prisma.auditLog.findFirst({ where: { action: "plan.settle-late", targetId: plan.id } })).toBeTruthy();
  });

  it("charges one class with no booking, and refuses a class that has not happened", async () => {
    const { admin, user, plan } = await setup();
    const future = await prisma.classBooking.create({
      data: { studentId: user.id, scheduleId: plan.reservedScheduleId!, occurrenceDate: new Date(Date.UTC(2031, 0, 9)), scheduledAt: new Date(Date.now() + 3 * DAY), status: "SCHEDULED", creditsSpent: 2 },
    });
    await expect(settleLatePayment(plan.id, admin.id, { recordPayment: true, bookingIds: [future.id], chargeUnbookedClass: false })).rejects.toThrow(/already happened/);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).installmentsPaid).toBe(1);

    await settleLatePayment(plan.id, admin.id, { recordPayment: true, bookingIds: [], chargeUnbookedClass: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).classCredits).toBe(6);
  });
});
