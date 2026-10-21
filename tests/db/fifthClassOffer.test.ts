import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { approveZellePayment, createFifthClassPayment } from "@/lib/payments";
import { getFifthClassOffer } from "@/lib/paymentPlans";
import { makeUser, newTag, prisma } from "./helpers";

// A Monthly plan whose cycle (Nov 2 to Dec 2, 2026) holds five Mondays, with "now" pinned to Nov 10, 2026.
const tag = newTag("fo");
let admin: { id: string }, mon: { id: string };
const users: string[] = [];
const planIds: string[] = [];
const paymentIds: string[] = [];

beforeAll(async () => {
  admin = await makeUser(tag, "Teacher", { role: "ADMIN" });
  users.push(admin.id);
  mon = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "17:00", durationMin: 45, creditCost: 2, label: `${tag} Monday` } });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 10, 15)));
});
afterEach(() => vi.setSystemTime(new Date(Date.UTC(2026, 10, 10, 15))));
afterAll(async () => {
  vi.useRealTimers();
  await prisma.classBooking.deleteMany({ where: { studentId: { in: users } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: users } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: users } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.zellePayment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.appSetting.deleteMany({ where: { OR: planIds.map((id) => ({ key: { startsWith: `plan-fifth-class:${id}:` } })) } });
  await prisma.paymentPlan.deleteMany({ where: { id: { in: planIds } } });
  await prisma.classSchedule.delete({ where: { id: mon.id } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

const monday = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 22));

async function subscriber(name: string, term: "MONTHLY" | "TERM_6", bookFour = true) {
  const stu = await makeUser(tag, name, { classCredits: 8 });
  users.push(stu.id);
  const plan = await prisma.paymentPlan.create({
    data: { userId: stu.id, cadence: "MIN_60_WEEKLY", term, installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.UTC(2026, 11, 2)), status: "ACTIVE", reservedScheduleId: mon.id, reservedChunkIndex: 0 },
  });
  planIds.push(plan.id);
  if (bookFour) {
    for (const [m, d] of [[11, 2], [11, 9], [11, 16], [11, 23]] as const) {
      await prisma.classBooking.create({
        data: { studentId: stu.id, scheduleId: mon.id, occurrenceDate: new Date(Date.UTC(2026, m - 1, d)), scheduledAt: monday(m, d), creditsSpent: 2, reservedByPlanId: plan.id, status: m === 11 && d === 2 ? "COMPLETED" : "SCHEDULED" },
      });
    }
  }
  return { stu, plan };
}

describe("the optional fifth class for a Monthly subscriber", () => {
  it("is offered for the last Monday once the plan's four are booked, at the owner's price", async () => {
    const { stu } = await subscriber("Monthly A", "MONTHLY");
    const offer = await getFifthClassOffer(stu.id);
    expect(offer).not.toBeNull();
    expect(offer!.scheduledAt.getTime()).toBe(monday(11, 30).getTime());
    expect(offer!.priceCents).toBe(5500);
  });

  it("is not offered to a 6-month plan (it gets that class free) or before the four are booked", async () => {
    const six = await subscriber("Six A", "TERM_6");
    expect(await getFifthClassOffer(six.stu.id)).toBeNull();
    const early = await subscriber("Monthly B", "MONTHLY", false);
    expect(await getFifthClassOffer(early.stu.id)).toBeNull();
  });

  it("paying books exactly that class, charges the set price, and ends the offer", async () => {
    const { stu } = await subscriber("Monthly C", "MONTHLY");
    const payment = await createFifthClassPayment(stu.id, "pay@example.com");
    paymentIds.push(payment.id);
    expect(payment.amountCents).toBe(5500);
    expect(payment.extraSessionScheduledAt?.getTime()).toBe(monday(11, 30).getTime());
    await prisma.zellePayment.update({ where: { id: payment.id }, data: { status: "PENDING_REVIEW", submittedAt: new Date() } });
    await approveZellePayment(payment.id, admin.id);
    const booked = await prisma.classBooking.findFirst({ where: { studentId: stu.id, scheduledAt: monday(11, 30), status: "SCHEDULED" } });
    expect(booked).not.toBeNull();
    expect(await getFifthClassOffer(stu.id)).toBeNull();
    // Nothing is taken back, and the credit bought was spent on that class: balance back to what it was.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).classCredits).toBe(8 + 2);
  });

  it("refuses to sell it when there is no fifth class to add", async () => {
    const six = await subscriber("Six B", "TERM_6");
    await expect(createFifthClassPayment(six.stu.id, "pay@example.com")).rejects.toThrow(/no fifth class/);
  });
});
