import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { getWeeklyTimeChoices, moveWeeklyTime } from "@/lib/adminWeeklyTime";
import { getPlanBuilderContext } from "@/lib/planBuilder";
import { adminPausePlan } from "@/lib/paymentPlans";
import { newTag, prisma } from "./helpers";

// A parent learning with their daughter: one parent group, two plans, each with its own weekly time. The studio manages each on its own.
const tag = newTag("gpt");
const DAY = 86_400_000;
const emails: string[] = [];
const slotIds: string[] = [];
const groupIds: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: `${label} Test`, passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
}

async function slot(dayOfWeek: number, startTime: string) {
  const s = await prisma.classSchedule.create({ data: { dayOfWeek, startTime, durationMin: 45, creditCost: 2, label: tag } });
  slotIds.push(s.id);
  return s;
}

async function setup(installmentsPaid = 1) {
  const admin = await account("admin", "ADMIN");
  const parent = await account("parent");
  const child = await account("child");
  const [seven, sevenB, six] = [await slot(1, "19:00"), await slot(2, "19:00"), await slot(1, "18:00")];
  const group = await prisma.familyPlanGroup.create({ data: { payerId: parent.id, kind: "PARENT" } });
  groupIds.push(group.id);
  const plan = (userId: string, scheduleId: string) =>
    prisma.paymentPlan.create({
      data: { userId, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: 17000, creditsPerInstallment: 8, termMonths: 6, installmentsPaid, nextDueDate: new Date(Date.now() + 22 * DAY), reservedScheduleId: scheduleId, reservedChunkIndex: 0, familyGroupId: group.id },
    });
  return { admin, parent, child, seven, sevenB, six, parentPlan: await plan(parent.id, seven.id), childPlan: await plan(child.id, sevenB.id) };
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
  await prisma.familyPlanGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("managing each person on a parent plan", () => {
  it("moves the parent's weekly time and every upcoming class, leaving the daughter's alone", async () => {
    const s = await setup();
    const { current, choices } = await getWeeklyTimeChoices(s.parentPlan.id);
    expect(current?.label).toBe("Monday 7:00 PM to 7:45 PM");
    expect(choices.some((c) => c.scheduleId === s.six.id)).toBe(true);
    // The daughter's time is hers, so it is not offered to the parent.
    expect(choices.some((c) => c.scheduleId === s.sevenB.id)).toBe(false);

    expect(await moveWeeklyTime(s.parentPlan.id, s.admin.id, s.six.id, 0)).toBe("Monday 6:00 PM to 6:45 PM");
    const moved = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: s.parentPlan.id } });
    expect(moved.reservedScheduleId).toBe(s.six.id);
    const upcoming = await prisma.classBooking.findMany({ where: { studentId: s.parent.id, status: "SCHEDULED", scheduledAt: { gt: new Date() } } });
    expect(upcoming.length).toBeGreaterThanOrEqual(1);
    expect(upcoming.every((b) => b.scheduleId === s.six.id)).toBe(true);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: s.childPlan.id } })).reservedScheduleId).toBe(s.sevenB.id);
    expect(await prisma.auditLog.count({ where: { action: "plan.move-time", targetId: s.parentPlan.id } })).toBe(1);
  });

  it("opens the plan builder and the studio pause for one person, and leaves the other running", async () => {
    const s = await setup();
    expect((await getPlanBuilderContext(s.parent.id)).mode).toBe("existing");
    await adminPausePlan(s.childPlan.id, s.admin.id, new Date(Date.now() + 10 * DAY));
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: s.childPlan.id } })).pausedAt).not.toBeNull();
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: s.parentPlan.id } })).pausedAt).toBeNull();
  });

  it("leaves a group alone until its combined first payment is approved", async () => {
    const s = await setup(0);
    await expect(getPlanBuilderContext(s.parent.id)).rejects.toThrow(/has not started yet/);
    await expect(adminPausePlan(s.childPlan.id, s.admin.id, null)).rejects.toThrow(/first payment/);
  });
});
