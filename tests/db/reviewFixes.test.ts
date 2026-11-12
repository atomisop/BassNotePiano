import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, getServerSession: async () => null, authOptions: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
import { bookClass, nextOccurrenceDates, rescheduleClassBooking } from "@/lib/classSchedule";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { approveZellePayment, rejectZellePayment, submitZellePaymentReference } from "@/lib/payments";
import { adjustUserCredits } from "@/lib/creditAdjustments";
import { undoAttendance } from "@/lib/classScheduleAdmin";
import { runAttendanceAutoCharge } from "@/lib/attendanceAutoCharge";
import { getOrCreateOpenInstallmentPayment, recordPlanPaymentReceived } from "@/lib/paymentPlans";
import { assertParentOf } from "@/lib/parentLinks";
import { cancelPaymentPlanBySelf, adminPausePlan } from "@/lib/paymentPlans";
import { refundZellePayment } from "@/lib/payments";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { getMeStatus } from "@/lib/meStatus";
import { syncGroupBundle } from "@/lib/paymentBundles";
import { applyMoneyFix } from "@/lib/moneyCheck";
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
  await prisma.zellePayment.updateMany({ where: { userId: { in: users } }, data: { bundleId: null } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: users } } });
  await prisma.parentLink.deleteMany({ where: { OR: [{ parentId: { in: users } }, { childId: { in: users } }] } });
  await prisma.paymentPlan.updateMany({ where: { userId: { in: users } }, data: { familyGroupId: null } });
  await prisma.familyPlanGroup.deleteMany({ where: { payerId: { in: users } } });
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

describe("smaller review fixes", () => {
  const planData = (userId: string, extra: Record<string, unknown> = {}) => ({
    userId, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3" as const, installmentAmountCents: 16499, creditsPerInstallment: 8, termMonths: 3,
    installmentsPaid: 1, nextDueDate: new Date(Date.now() + 25 * 86_400_000), reservedScheduleId: sched.id, reservedChunkIndex: 0, ...extra,
  });

  it("a parent can no longer act as a banned child", async () => {
    const parent = await person("Pa");
    const child = await person("Ch");
    await prisma.parentLink.create({ data: { parentId: parent.id, childId: child.id, status: "ACCEPTED" } });
    await expect(assertParentOf(parent.id, child.id)).resolves.toBeUndefined();
    await prisma.user.update({ where: { id: child.id }, data: { bannedAt: new Date() } });
    await expect(assertParentOf(parent.id, child.id)).rejects.toThrow(/not linked/);
  });

  it("recording a payment for a started group member books the next month, not a phantom copy of the first", async () => {
    const payer = await person("Pay");
    const member = await person("Mem");
    const group = await prisma.familyPlanGroup.create({ data: { payerId: payer.id } });
    await prisma.zellePayment.create({ data: { userId: payer.id, purpose: "FAMILY_PLAN_START", familyGroupId: group.id, amountCents: 20000, zelleHandle: "x", status: "VERIFIED" } });
    const plan = await prisma.paymentPlan.create({ data: planData(member.id, { familyGroupId: group.id }) });
    expect(await recordPlanPaymentReceived(plan.id, payer.id)).toBe("approved");
    const rows = await prisma.zellePayment.findMany({ where: { paymentPlanId: plan.id, status: "VERIFIED" } });
    expect(rows.map((r) => r.installmentNumber)).toEqual([2]);
  });

  it("changing a group's payer rebuilds the open combined bill for the new payer", async () => {
    const payer = await person("Old");
    const next = await person("New");
    const group = await prisma.familyPlanGroup.create({ data: { payerId: payer.id } });
    const a = await prisma.paymentPlan.create({ data: planData(payer.id, { familyGroupId: group.id }) });
    const b = await prisma.paymentPlan.create({ data: planData(next.id, { familyGroupId: group.id }) });
    for (const [plan, u] of [[a, payer], [b, next]] as const) {
      await prisma.zellePayment.create({ data: { userId: u.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 2, amountCents: 16499, lessonQuantity: 8, zelleHandle: "x", status: "AWAITING_TRANSFER" } });
    }
    const first = await syncGroupBundle(group.id, "x");
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: first.bundleId! } })).userId).toBe(payer.id);
    await prisma.familyPlanGroup.update({ where: { id: group.id }, data: { payerId: next.id } });
    const second = await syncGroupBundle(group.id, "x");
    expect(second.bundleId).not.toBe(first.bundleId);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: second.bundleId! } })).userId).toBe(next.id);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: first.bundleId! } })).status).toBe("EXPIRED");
  });

  it("the money check will not set a finished plan back (that reopens it overdue)", async () => {
    const s = await person("Fin");
    const plan = await prisma.paymentPlan.create({ data: planData(s.id, { status: "COMPLETED", installmentsPaid: 3 }) });
    await prisma.zellePayment.create({ data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 1, amountCents: 16499, lessonQuantity: 8, zelleHandle: "x", status: "VERIFIED" } });
    await expect(applyMoneyFix({ id: s.id, email: null }, `counter:${plan.id}`, "setPaid")).rejects.toThrow(/finished|no longer applies/);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("COMPLETED");
  });
});

describe("second round of review fixes", () => {
  it("a 1 Month plan's paid period starts when it is approved, not when the plan was made", async () => {
    const s = await person("One");
    const madeAt = new Date(Date.now() - 5 * 86_400_000);
    const plan = await prisma.paymentPlan.create({
      data: {
        userId: s.id, cadence: OFFERED_PLAN_CADENCE, term: "MONTHLY", installmentAmountCents: 21999, creditsPerInstallment: 8, termMonths: 1,
        installmentsPaid: 0, nextDueDate: madeAt, reservedScheduleId: sched.id, reservedChunkIndex: 0,
      },
    });
    const bill = await prisma.zellePayment.create({
      data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 1, amountCents: 21999, lessonQuantity: 8, zelleHandle: "x", status: "PENDING_REVIEW" },
    });
    await approveZellePayment(bill.id, null);
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.status).toBe("COMPLETED");
    // The stored date is the start of the paid cycle: about now, never the earlier day the plan was made.
    expect(after.nextDueDate.getTime()).toBeGreaterThan(madeAt.getTime() + 4 * 86_400_000);
  });

  it("a payment that was approved in the meantime cannot be rejected", async () => {
    const s = await person("Rj");
    const admin = await person("Adm");
    const pay = await prisma.zellePayment.create({ data: { userId: s.id, purpose: "CLASS_CREDITS", amountCents: 5500, lessonQuantity: 2, zelleHandle: "x", status: "VERIFIED" } });
    await expect(rejectZellePayment(pay.id, admin.id, "late")).rejects.toThrow(/pending review|no longer/);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe("VERIFIED");
  });

  it("a class whose mark was undone is not charged again by the hourly auto-charge", async () => {
    const s = await person("Und");
    const long = new Date(Date.now() - 30 * 3_600_000);
    const b = await prisma.classBooking.create({
      data: { studentId: s.id, scheduleId: sched.id, occurrenceDate: new Date(Date.UTC(2031, 5, 2)), scheduledAt: long, status: "COMPLETED", attendance: "NO_SHOW", creditsSpent: 2 },
    });
    await undoAttendance(b.id);
    await runAttendanceAutoCharge();
    const row = await prisma.classBooking.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.status).toBe("SCHEDULED");
  });

  it("an admin's hand-made deduction cannot eat credits that booked classes hold", async () => {
    const s = await person("Held", { classCredits: 4 });
    const admin = await person("Adm2");
    await prisma.classBooking.create({
      data: { studentId: s.id, scheduleId: sched.id, occurrenceDate: new Date(Date.UTC(2031, 6, 2)), scheduledAt: new Date(Date.now() + 5 * 86_400_000), status: "SCHEDULED", creditsSpent: 4 },
    });
    await expect(adjustUserCredits(admin.id, s.id, -2, "oops", { respectHeld: true })).rejects.toThrow(/holding/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.id } })).classCredits).toBe(4);
  });
});

describe("third round of review fixes", () => {
  const planData = (userId: string, extra: Record<string, unknown> = {}) => ({
    userId, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3" as const, installmentAmountCents: 16499, creditsPerInstallment: 8, termMonths: 3,
    installmentsPaid: 1, nextDueDate: new Date(Date.now() + 25 * 86_400_000), reservedScheduleId: sched.id, reservedChunkIndex: 0, ...extra,
  });

  it("a parent can end only a plan they pay for, never their child's own plan", async () => {
    const parent = await person("Par2");
    const child = await person("Kid2");
    const plan = await prisma.paymentPlan.create({ data: planData(child.id) });
    await expect(cancelPaymentPlanBySelf(child.id, "OTHER", "ended by parent", { byParentId: parent.id })).rejects.toThrow(/not one you pay for/);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("ACTIVE");
  });

  it("a group member who pays nothing never sees the bill bar; the payer does", async () => {
    const payer = await person("Gp");
    const member = await person("Gm");
    const group = await prisma.familyPlanGroup.create({ data: { payerId: payer.id } });
    const plan = await prisma.paymentPlan.create({ data: planData(member.id, { familyGroupId: group.id, nextDueDate: new Date(Date.now() + 86_400_000) }) });
    await prisma.zellePayment.create({ data: { userId: member.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 2, amountCents: 16499, lessonQuantity: 8, zelleHandle: "x", status: "AWAITING_TRANSFER" } });
    expect((await getMeStatus(member.id)).billDue).toBeNull();
    expect((await getMeStatus(payer.id)).billDue?.href).toBe("/billing/plans");
  });
});

describe("owner decisions, decided", () => {
  const planData = (userId: string, extra: Record<string, unknown> = {}) => ({
    userId, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3" as const, installmentAmountCents: 16499, creditsPerInstallment: 8, termMonths: 3,
    installmentsPaid: 1, nextDueDate: new Date(Date.now() + 25 * 86_400_000), reservedScheduleId: sched.id, reservedChunkIndex: 0, ...extra,
  });

  it("canceling a plan that is paused indefinitely ends access with the paid time, not ten years later", async () => {
    const s = await person("Pz");
    const admin = await person("PzA");
    const plan = await prisma.paymentPlan.create({ data: planData(s.id) });
    await adminPausePlan(plan.id, admin.id, null);
    const paused = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(paused.nextDueDate.getTime()).toBeGreaterThan(Date.now() + 9 * 365 * 86_400_000);
    const { cancelPaymentPlan } = await import("@/lib/paymentPlans");
    await cancelPaymentPlan(plan.id, admin.id, "student asked");
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.status).toBe("CANCELED");
    expect(after.nextDueDate.getTime()).toBeLessThan(Date.now() + 40 * 86_400_000);
  });

  it("a refund that ends the plan ends the access too, and undoing it brings both back", async () => {
    const s = await person("Rf");
    const admin = await person("RfA");
    const plan = await prisma.paymentPlan.create({ data: planData(s.id) });
    const pay = await prisma.zellePayment.create({ data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 1, amountCents: 16499, lessonQuantity: 8, zelleHandle: "x", status: "VERIFIED" } });
    expect((await getCurriculumEntitlement(s.id)).kind).toBe("PAID");
    await refundZellePayment(pay.id, { id: admin.id, email: null }, { note: "asked for it", removeCredits: false, cancelPlan: true });
    expect((await getCurriculumEntitlement(s.id)).kind).not.toBe("PAID");
  });
});
