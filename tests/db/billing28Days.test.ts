import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { approveZellePayment } from "@/lib/payments";
import { classesInPaidMonth, classesLeftInPaidMonth, getFifthClassOffer, fifthClassReceiptNote } from "@/lib/paymentPlans";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { BILLING_CYCLE_MS } from "@/lib/billingCycle";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("b28");
let admin: { id: string }, mon: { id: string };
const users: string[] = [];
const paymentIds: string[] = [];
const planIds: string[] = [];
const DAY = 86_400_000;

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
  await prisma.paymentPlan.deleteMany({ where: { id: { in: planIds } } });
  await prisma.classSchedule.delete({ where: { id: mon.id } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

async function subscriber(name: string, opts: { term?: "MONTHLY" | "TERM_3" | "TERM_6"; installmentsPaid: number; nextDueDate: Date; status?: "ACTIVE" | "COMPLETED"; termMonths?: number }) {
  const stu = await makeUser(tag, name, { classCredits: 0 });
  users.push(stu.id);
  const plan = await prisma.paymentPlan.create({
    data: {
      userId: stu.id, cadence: "MIN_60_WEEKLY", term: opts.term ?? "TERM_3", installmentAmountCents: 24000, creditsPerInstallment: 8,
      termMonths: opts.termMonths ?? 12, installmentsPaid: opts.installmentsPaid, nextDueDate: opts.nextDueDate, status: opts.status ?? "ACTIVE",
      reservedScheduleId: mon.id, reservedChunkIndex: 0,
    },
  });
  planIds.push(plan.id);
  return { stu, plan };
}

async function approve(userId: string, planId: string, installmentNumber: number) {
  const p = await prisma.zellePayment.create({
    data: { userId, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: planId, installmentNumber, lessonQuantity: 8, amountCents: 24000, zelleHandle: "pay@example.com", status: "PENDING_REVIEW", submittedAt: new Date() },
  });
  paymentIds.push(p.id);
  await approveZellePayment(p.id, admin.id);
}

describe("billing cycles are 28 days", () => {
  it("the next payment is due exactly 28 days after the last due date (anchored, not from the approval time), and its credits last until then", async () => {
    const start = new Date(Date.UTC(2026, 10, 2, 15)); // a cycle that used to hold five Mondays on the calendar-month plan
    const { stu, plan } = await subscriber("Second Payment", { installmentsPaid: 1, nextDueDate: start });
    await approve(stu.id, plan.id, 2);
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.installmentsPaid).toBe(2);
    expect(after.nextDueDate.getTime() - start.getTime()).toBe(BILLING_CYCLE_MS);
    const grant = await prisma.creditGrant.findFirstOrThrow({ where: { userId: stu.id, paymentPlanId: plan.id } });
    expect(grant.expiresAt?.getTime()).toBe(after.nextDueDate.getTime());
    // Four classes' credit, and no free fifth class (the receipt used to add one in a five-Monday cycle).
    expect((await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).classCredits).toBe(8);
    const receipt = await prisma.mailMessage.findFirst({ where: { userId: stu.id, title: "Payment approved" } });
    expect(receipt?.body ?? "").not.toContain("A free class");
    expect(receipt?.body ?? "").not.toMatch(/5 Mondays|fifth/i);
  });

  it("a first payment starts its 28 days when it is approved, even if the plan was opened days earlier", async () => {
    const opened = new Date(Date.now() - 4 * DAY);
    const { stu, plan } = await subscriber("First Payment", { installmentsPaid: 0, nextDueDate: opened });
    const before = Date.now();
    await approve(stu.id, plan.id, 1);
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.nextDueDate.getTime()).toBeGreaterThanOrEqual(before + BILLING_CYCLE_MS);
    expect(after.nextDueDate.getTime()).toBeLessThan(Date.now() + BILLING_CYCLE_MS + 1000);
  });

  it("every plan type covers exactly four classes in a cycle, wherever the cycle starts", async () => {
    for (const term of ["MONTHLY", "TERM_3", "TERM_6"] as const) {
      for (const dueDay of [new Date(Date.UTC(2026, 11, 2)), new Date(Date.UTC(2027, 0, 2)), new Date(Date.UTC(2027, 1, 28))]) {
        const { plan } = await subscriber(`Four ${term} ${dueDay.toISOString().slice(0, 10)}`, { term, installmentsPaid: 1, nextDueDate: dueDay });
        expect(await classesInPaidMonth(plan)).toEqual({ allowed: 4, base: 4 });
        expect(await classesLeftInPaidMonth(plan)).toBe(4);
      }
    }
  });

  it("no fifth class is offered or announced any more", async () => {
    const { stu, plan } = await subscriber("No Fifth", { term: "MONTHLY", installmentsPaid: 1, nextDueDate: new Date(Date.UTC(2026, 11, 2)) });
    expect(await getFifthClassOffer(stu.id)).toBeNull();
    expect(await fifthClassReceiptNote(plan.id)).toBeNull();
  });

  it("curriculum access lasts the 28 days paid for plus the grace days, then ends", async () => {
    const lastPaid = Date.now() - 20 * DAY; // a plan that completed on its only payment 20 days ago: paid through day 28
    const { stu } = await subscriber("Access", { term: "MONTHLY", installmentsPaid: 1, termMonths: 1, status: "COMPLETED", nextDueDate: new Date(lastPaid) });
    expect((await getCurriculumEntitlement(stu.id)).kind).toBe("PAID");
    const { stu: lapsed } = await subscriber("Lapsed", { term: "MONTHLY", installmentsPaid: 1, termMonths: 1, status: "COMPLETED", nextDueDate: new Date(Date.now() - 40 * DAY) });
    expect((await getCurriculumEntitlement(lapsed.id)).kind).toBe("NONE");
  });
});
