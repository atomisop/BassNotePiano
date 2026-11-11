import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, getServerSession: async () => null, authOptions: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
import { bookClass, nextOccurrenceDates, rescheduleClassBooking } from "@/lib/classSchedule";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { approveZellePayment, submitZellePaymentReference } from "@/lib/payments";
import { getOrCreateOpenInstallmentPayment } from "@/lib/paymentPlans";
import { makeUser, newTag, prisma } from "./helpers";

// Regression tests for the bugs the booking and money reviews found (2026-11-12).
const tag = newTag("rv");
const users: string[] = [];
let sched: { id: string };
const dates = nextOccurrenceDates(2, 10).slice(2);

async function person(name: string, extra: Record<string, unknown> = {}) {
  const u = await makeUser(tag, name, { classCredits: 20, emailVerified: new Date(), ...extra });
  users.push(u.id);
  return u;
}

beforeAll(async () => {
  sched = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "09:00", durationMin: 120, creditCost: 4, label: `${tag} one` } });
});

afterAll(async () => {
  await prisma.zellePayment.deleteMany({ where: { userId: { in: users } } });
  await prisma.classBooking.deleteMany({ where: { scheduleId: sched.id } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: users } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: users } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.classSchedule.delete({ where: { id: sched.id } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe("booking never overwrites another class of the same student", () => {
  it("a reschedule onto a day that already holds a live class is refused, and that class stays", async () => {
    const s = await person("Ann");
    const [d1, d2] = dates;
    const from = await bookClass(s.id, sched.id, d1.getTime(), 0);
    const target = await bookClass(s.id, sched.id, d2.getTime(), 0);
    await expect(rescheduleClassBooking(s.id, from.id, sched.id, d2.getTime(), 1, undefined, { byAdmin: true })).rejects.toThrow(/already booked/);
    const rows = await prisma.classBooking.findMany({ where: { studentId: s.id, scheduleId: sched.id }, orderBy: { occurrenceDate: "asc" } });
    expect(rows.map((r) => r.status)).toEqual(["SCHEDULED", "SCHEDULED"]);
    expect(rows[1].id).toBe(target.id);
    expect(rows[1].scheduledAt.getTime()).toBe(target.scheduledAt.getTime());
  });

  it("booking another hour of a day whose class was marked keeps the marked class", async () => {
    const s = await person("Bo");
    const d = dates[2];
    const done = await bookClass(s.id, sched.id, d.getTime(), 0);
    await prisma.classBooking.update({ where: { id: done.id }, data: { status: "COMPLETED", attendance: "PRESENT" } });
    await expect(bookClass(s.id, sched.id, d.getTime(), 1)).rejects.toThrow(/already booked/);
    const row = await prisma.classBooking.findUniqueOrThrow({ where: { id: done.id } });
    expect(row.status).toBe("COMPLETED");
    expect(row.attendance).toBe("PRESENT");
  });
});

describe("one bill is never paid twice in credits", () => {
  async function planWithBill(label: string) {
    const s = await person(label);
    const plan = await prisma.paymentPlan.create({
      data: {
        userId: s.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3", installmentAmountCents: 16499, creditsPerInstallment: 8, termMonths: 3,
        installmentsPaid: 1, nextDueDate: new Date(Date.now() + 2 * 86_400_000), reservedScheduleId: sched.id, reservedChunkIndex: 0,
      },
    });
    return { s, plan };
  }

  it("a rejected bill is closed when a fresh one opens, so only the new one can be approved", async () => {
    const { s, plan } = await planWithBill("Cy");
    const first = await getOrCreateOpenInstallmentPayment(plan.id, "pay@example.test");
    expect(first.payment?.installmentNumber).toBe(2);
    await prisma.zellePayment.update({ where: { id: first.payment!.id }, data: { status: "REJECTED" } });
    const second = await getOrCreateOpenInstallmentPayment(plan.id, "pay@example.test");
    expect(second.payment?.id).not.toBe(first.payment!.id);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: first.payment!.id } })).status).toBe("EXPIRED");
    expect(s.id).toBe(plan.userId);
  });

  it("approving a bill whose number the plan already paid is refused and grants nothing", async () => {
    const { s, plan } = await planWithBill("Di");
    const dup = await prisma.zellePayment.create({
      data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 1, amountCents: 16499, lessonQuantity: 8, zelleHandle: "x", status: "PENDING_REVIEW" },
    });
    await expect(approveZellePayment(dup.id, null)).rejects.toThrow(/already paid/);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: dup.id } })).status).toBe("PENDING_REVIEW");
    expect(await prisma.creditGrant.count({ where: { userId: s.id } })).toBe(0);
  });

  it("a rejected payment sent in again waits for a person, even for a trusted returning student", async () => {
    const { s, plan } = await planWithBill("Ed");
    // Two earlier approved payments make this student eligible for the returning-student auto-approval.
    for (const n of [1, 2]) {
      await prisma.zellePayment.create({ data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: n, amountCents: 100, lessonQuantity: 8, zelleHandle: "x", status: "VERIFIED", autoApproved: false } });
    }
    const bill = await prisma.zellePayment.create({
      data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 2, amountCents: 16499, lessonQuantity: 8, zelleHandle: "x", status: "REJECTED", rejectionReason: "wrong amount" },
    });
    await submitZellePaymentReference(s.id, bill.id, { senderName: "Ed Test", method: "ZELLE", note: "" } as never);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("PENDING_REVIEW");
  });
});
