import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { applyPlanBuilder, getPlanBuilderContext, previewPlanBuilder, type PlanBuilderInput } from "@/lib/planBuilder";
import { addBillingCycles } from "@/lib/billingCycle";
import { chunksForSchedule, computeScheduledAt } from "@/lib/classSchedule";
import { newTag, prisma } from "./helpers";

const tag = newTag("pb");
const DAY = 86_400_000;
const emails: string[] = [];
const slotIds: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: "Builder Test", passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
}

/** A Wednesday weekly class and the Wednesday (this week or last) the customer was taught. */
async function setup() {
  const admin = await account("admin", "ADMIN");
  const student = await account("student");
  const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "16:00", durationMin: 45, creditCost: 2, label: tag } });
  slotIds.push(slot.id);
  const now = new Date();
  const back = (now.getUTCDay() - 3 + 7) % 7 || 7; // the most recent Wednesday that is before today
  const wed = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back));
  return { admin, student, slot, wed: wed.toISOString().slice(0, 10) };
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("the plan builder", () => {
  it("builds a 6 month plan from a past start: one paid bill, the taught Wednesday counts as class 1, the rest of the cycle is booked", async () => {
    const { admin, student, slot, wed } = await setup();
    expect((await getPlanBuilderContext(student.id)).mode).toBe("new");
    const input: PlanBuilderInput = { userId: student.id, term: "TERM_6", scheduleId: slot.id, chunkIndex: 0, startDate: wed, installmentsPaid: 1, taughtDates: [wed], chargeTaught: true };

    const preview = await previewPlanBuilder(input);
    expect(preview.timeline.cycles).toHaveLength(6);
    expect(preview.timeline.taughtCount).toBe(1);

    const { planId, created } = await applyPlanBuilder(admin.id, input);
    expect(created).toBe(true);
    const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: planId } });
    expect(plan.installmentsPaid).toBe(1);
    expect(plan.status).toBe("ACTIVE");
    expect(plan.reservedScheduleId).toBe(slot.id);
    // The next bill is 28 days after the start day, not after today.
    const startMs = new Date(`${wed}T00:00:00-04:00`).getTime();
    expect(Math.abs(plan.nextDueDate.getTime() - addBillingCycles(new Date(startMs), 1).getTime())).toBeLessThan(2 * 3_600_000);

    const taught = await prisma.classBooking.findFirstOrThrow({ where: { studentId: student.id, status: "COMPLETED" } });
    expect(taught.attendance).toBe("PRESENT");
    expect(taught.reservedByPlanId).toBe(planId);

    // 8 credits for the cycle (4 classes), 2 spent on the taught class.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(user.classCredits).toBe(6);
    const upcoming = await prisma.classBooking.count({ where: { studentId: student.id, reservedByPlanId: planId, status: "SCHEDULED" } });
    expect(upcoming).toBeGreaterThanOrEqual(1);
    expect(upcoming).toBeLessThanOrEqual(3);
    expect(await prisma.zellePayment.count({ where: { paymentPlanId: planId, status: "VERIFIED" } })).toBe(1);
  });

  it("re-anchors an existing plan to a past start and lays the classes again, leaving the payments and length alone", async () => {
    const { admin, student, slot, wed } = await setup();
    const created = await applyPlanBuilder(admin.id, { userId: student.id, term: "TERM_3", scheduleId: slot.id, chunkIndex: 0, startDate: new Date(Date.now() - 1 * DAY).toISOString().slice(0, 10), installmentsPaid: 1, taughtDates: [], chargeTaught: false });
    expect((await getPlanBuilderContext(student.id)).mode).toBe("existing");

    const again = await applyPlanBuilder(admin.id, { userId: student.id, term: "TERM_6", scheduleId: slot.id, chunkIndex: 0, startDate: wed, installmentsPaid: 5, taughtDates: [wed], chargeTaught: true });
    expect(again.created).toBe(false);
    expect(again.planId).toBe(created.planId);
    const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: created.planId } });
    expect(plan.term).toBe("TERM_3");
    expect(plan.installmentsPaid).toBe(1);
    expect(await prisma.zellePayment.count({ where: { paymentPlanId: created.planId } })).toBe(1);
    expect(await prisma.classBooking.count({ where: { studentId: student.id, status: "COMPLETED" } })).toBe(1);
  });

  it("refuses a taught class in the future, a taught class outside the paid cycles, and a taken weekly time", async () => {
    const { admin, student, slot, wed } = await setup();
    const base: PlanBuilderInput = { userId: student.id, term: "TERM_6", scheduleId: slot.id, chunkIndex: 0, startDate: wed, installmentsPaid: 1, taughtDates: [], chargeTaught: false };
    await expect(previewPlanBuilder({ ...base, taughtDates: [new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10)] })).rejects.toThrow(/past/);
    await expect(previewPlanBuilder({ ...base, taughtDates: [new Date(new Date(`${wed}T12:00:00Z`).getTime() - 5 * DAY).toISOString().slice(0, 10)] })).rejects.toThrow(/outside/);
    const other = await account("other");
    await applyPlanBuilder(admin.id, { ...base, userId: other.id });
    await expect(previewPlanBuilder(base)).rejects.toThrow(/taken/);
  });

  it("lines a late payer up with the day she was taught: bill marked received, next bill 28 days after that day, and a week canceled earlier by hand is laid again", async () => {
    const { admin, student, slot, wed } = await setup();
    const plan = await prisma.paymentPlan.create({
      data: { userId: student.id, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: 16499, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 0, nextDueDate: new Date(Date.now() - 3 * DAY), reservedScheduleId: slot.id, reservedChunkIndex: 0 },
    });
    await prisma.zellePayment.create({ data: { userId: student.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 1, amountCents: 16499, lessonQuantity: 8, zelleHandle: "x", status: "AWAITING_TRANSFER" } });
    expect((await getPlanBuilderContext(student.id)).openPayment).toBe(true);

    // The Wednesday after the taught one, canceled by hand earlier (this used to make the booking job skip it).
    const nextWed = new Date(new Date(`${wed}T12:00:00Z`).getTime() + 7 * DAY);
    const occurrenceDate = new Date(Date.UTC(nextWed.getUTCFullYear(), nextWed.getUTCMonth(), nextWed.getUTCDate()));
    const scheduledAt = computeScheduledAt(slot, occurrenceDate, chunksForSchedule(slot)[0]);
    await prisma.classBooking.create({ data: { studentId: student.id, scheduleId: slot.id, occurrenceDate, scheduledAt, status: "CANCELED", canceledReason: "Canceled by studio", creditsSpent: 2, reservedByPlanId: plan.id } });

    await applyPlanBuilder(admin.id, { userId: student.id, term: "TERM_6", scheduleId: slot.id, chunkIndex: 0, startDate: wed, installmentsPaid: 1, taughtDates: [wed], chargeTaught: true, recordPayment: true });

    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.installmentsPaid).toBe(1);
    const startMs = new Date(`${wed}T00:00:00-04:00`).getTime();
    expect(Math.abs(after.nextDueDate.getTime() - addBillingCycles(new Date(startMs), 1).getTime())).toBeLessThan(2 * 3_600_000);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).classCredits).toBe(6);
    const week = await prisma.classBooking.findUniqueOrThrow({ where: { studentId_scheduleId_occurrenceDate: { studentId: student.id, scheduleId: slot.id, occurrenceDate } } });
    if (scheduledAt.getTime() > Date.now() && scheduledAt.getTime() < after.nextDueDate.getTime()) expect(week.status).toBe("SCHEDULED");
  });
});
