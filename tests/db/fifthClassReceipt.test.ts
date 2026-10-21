import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { approveZellePayment } from "@/lib/payments";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("fr");
let admin: { id: string }, mon: { id: string };
const users: string[] = [];
const paymentIds: string[] = [];
const planIds: string[] = [];

beforeAll(async () => {
  admin = await makeUser(tag, "Teacher", { role: "ADMIN" });
  users.push(admin.id);
  mon = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "17:00", durationMin: 45, creditCost: 2, label: `${tag} Monday` } });
});
afterAll(async () => {
  await prisma.creditGrant.deleteMany({ where: { userId: { in: users } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: users } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: users } } });
  await prisma.zellePayment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.appSetting.deleteMany({ where: { OR: planIds.map((id) => ({ key: { startsWith: `plan-fifth-class:${id}:` } })) } });
  await prisma.paymentPlan.deleteMany({ where: { id: { in: planIds } } });
  await prisma.classSchedule.delete({ where: { id: mon.id } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

/** A Monday subscriber paying the installment that covers the cycle starting on `cycleStart`; returns the credits and the receipt. */
async function pay(name: string, cycleStart: Date, term: "MONTHLY" | "TERM_3" | "TERM_6" = "TERM_3") {
  const stu = await makeUser(tag, name, { classCredits: 0 });
  users.push(stu.id);
  const plan = await prisma.paymentPlan.create({
    data: { userId: stu.id, cadence: "MIN_60_WEEKLY", term, installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 12, installmentsPaid: 1, nextDueDate: cycleStart, status: "ACTIVE", reservedScheduleId: mon.id, reservedChunkIndex: 0 },
  });
  planIds.push(plan.id);
  const p = await prisma.zellePayment.create({
    data: { userId: stu.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 2, lessonQuantity: 8, amountCents: 24000, zelleHandle: "pay@example.com", status: "PENDING_REVIEW", submittedAt: new Date() },
  });
  paymentIds.push(p.id);
  await approveZellePayment(p.id, admin.id);
  const credits = (await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).classCredits;
  const receipt = await prisma.mailMessage.findFirst({ where: { userId: stu.id, title: "Payment approved" } });
  return { credits, body: receipt?.body ?? "" };
}

describe("the receipt for a cycle that holds five of the student's weekday", () => {
  it("a 3-month plan: adds the free fifth class's credit and says so, with the dates", async () => {
    const { credits, body } = await pay("Five Mondays", new Date(Date.UTC(2026, 10, 2))); // Nov 2 to Dec 2, 2026
    expect(credits).toBe(10); // four classes' credit (8) plus one class (2)
    expect(body).toContain("A free class");
    expect(body).toContain("5 Mondays instead of 4");
    expect(body).toMatch(/Nov 2, Nov 9, Nov 16, Nov 23, Nov 30/);
    expect(body).toContain("no charge");
  });

  it("a 6-month plan gets it free too", async () => {
    const { credits, body } = await pay("Six Month", new Date(Date.UTC(2026, 10, 2)), "TERM_6");
    expect(credits).toBe(10);
    expect(body).toContain("6-month plan");
  });

  it("a Monthly plan gets no free credit: the receipt offers the fifth class as an optional add-on", async () => {
    const { credits, body } = await pay("Monthly Five", new Date(Date.UTC(2026, 10, 2)), "MONTHLY");
    expect(credits).toBe(8);
    expect(body).toContain("5 Mondays instead of 4");
    expect(body).toMatch(/add the last one for \$\d+/);
    expect(body).toContain("optional");
    expect(body).not.toContain("A free class");
  });

  it("says nothing extra and adds no credit for an ordinary four-class cycle", async () => {
    const { credits, body } = await pay("Four Mondays", new Date(Date.UTC(2026, 11, 2))); // Dec 2 to Jan 2
    expect(credits).toBe(8);
    expect(body).toContain("was verified");
    expect(body).not.toContain("free class");
  });
});
