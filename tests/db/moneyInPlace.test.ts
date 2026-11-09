import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { getAdminPayments, getPersonPayments, locateAdminPayment, markBillPaid, refundZellePayment } from "@/lib/payments";
import { attachReceiptToStudent, previewReceiptForStudent } from "@/lib/paymentReceipts";
import { restartPlan, setPlanPrice, waiveNextBill } from "@/lib/adminPlanTools";
import { separateFromGroup } from "@/lib/adminGroupTools";
import { getLateSettlementPreview } from "@/lib/lateSettlement";
import { PlanFixError, refuseIfPaidThroughGroup, resolvePlanFix } from "@/lib/planFixes";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { newTag, prisma } from "./helpers";

// Finishing a money job where the owner already is: marking a bill paid, finding one person's payments, refunding with their classes,
// attaching an early bank email to the right person, and refusals that carry their own fix.
const tag = newTag("mip");
const DAY = 86_400_000;
const emails: string[] = [];
const groupIds: string[] = [];
const receiptIds: string[] = [];
const slotIds: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: `${label} Tester`, passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
}

/** A running 3 Month plan with one bill paid; `dueInDays` sets the next bill. */
async function runningPlan(userId: string, dueInDays: number, extra: Record<string, unknown> = {}) {
  return prisma.paymentPlan.create({
    data: { userId, cadence: "MIN_60_WEEKLY", term: "TERM_3", installmentAmountCents: 16499, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: new Date(Date.now() + dueInDays * DAY), ...extra },
  });
}

function bill(userId: string, planId: string, status: "AWAITING_TRANSFER" | "PENDING_REVIEW" | "VERIFIED", extra: Record<string, unknown> = {}) {
  return prisma.zellePayment.create({
    data: { userId, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: planId, installmentNumber: 2, amountCents: 16499, lessonQuantity: 8, zelleHandle: "x", status, ...(status === "PENDING_REVIEW" ? { submittedAt: new Date() } : {}), ...extra },
  });
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.processedPaymentEmail.deleteMany({ where: { id: { in: receiptIds } } });
  await prisma.payerAlias.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.creditAdjustment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.updateMany({ where: { userId: { in: ids } }, data: { bundleId: null } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.familyPlanGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("Mark paid: money that arrived another way", () => {
  it("records an unpaid renewal bill as paid: the plan moves on and the credits arrive", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student");
    const plan = await runningPlan(student.id, 2);
    const open = await bill(student.id, plan.id, "AWAITING_TRANSFER");

    await markBillPaid(open.id, { id: admin.id, email: admin.email });

    const paid = await prisma.zellePayment.findUniqueOrThrow({ where: { id: open.id } });
    expect(paid.status).toBe("VERIFIED");
    expect(paid.checkedAt).not.toBeNull();
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).installmentsPaid).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).classCredits).toBe(8);
    expect(await prisma.auditLog.findFirst({ where: { action: "payment.mark-paid", targetId: open.id } })).toBeTruthy();
    // A second tap finds nothing left to mark and changes nothing.
    await expect(markBillPaid(open.id, { id: admin.id, email: admin.email })).rejects.toThrow(/Only an unpaid bill/);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).installmentsPaid).toBe(2);
  });

  it("sends a payment already sent in to Approve, and a member's bill to the group's combined bill", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student");
    const plan = await runningPlan(student.id, 2);
    const sent = await bill(student.id, plan.id, "PENDING_REVIEW");
    await expect(markBillPaid(sent.id, { id: admin.id, email: admin.email })).rejects.toThrow(/Approve it instead/);

    const other = await runningPlan(student.id, 2);
    const combined = await prisma.zellePayment.create({ data: { userId: student.id, purpose: "FAMILY_PLAN_INSTALLMENT", amountCents: 16499, zelleHandle: "x", status: "AWAITING_TRANSFER" } });
    const member = await bill(student.id, other.id, "AWAITING_TRANSFER", { bundleId: combined.id });
    await expect(markBillPaid(member.id, { id: admin.id, email: admin.email })).rejects.toThrow(/combined/);
    // Recording a payment on that member's plan points at the combined bill instead of paying one person.
    const err = await refuseIfPaidThroughGroup(other.id).catch((e) => e);
    expect(err).toBeInstanceOf(PlanFixError);
    expect(await resolvePlanFix(err)).toEqual({ kind: "payment", paymentId: combined.id });
  });
});

describe("one person's payments and one payment's place in the list", () => {
  it("lists only that person's payments, every status, and finds a payment's tab and page", async () => {
    const a = await account("alpha");
    const b = await account("beta");
    const planA = await runningPlan(a.id, 2);
    const planB = await runningPlan(b.id, 2);
    const aOpen = await bill(a.id, planA.id, "AWAITING_TRANSFER");
    const aPaid = await bill(a.id, planA.id, "VERIFIED", { installmentNumber: 1 });
    await bill(b.id, planB.id, "PENDING_REVIEW");

    const mine = await getAdminPayments(undefined, 1, { userId: a.id });
    expect(mine.payments.map((p) => p.id).sort()).toEqual([aOpen.id, aPaid.id].sort());
    expect((await getPersonPayments(a.id)).map((p) => p.id).sort()).toEqual([aOpen.id, aPaid.id].sort());

    const found = await locateAdminPayment(aPaid.id, { userId: a.id });
    expect(found).toEqual({ id: aPaid.id, status: "VERIFIED", page: 1 });

    // The search reaches every page: by the BNP code on the note.
    const byCode = await getAdminPayments(undefined, 1, { query: paymentReferenceCode(aOpen.id) });
    expect(byCode.payments.map((p) => p.id)).toContain(aOpen.id);
    expect(byCode.payments.every((p) => p.id.endsWith(aOpen.id.slice(-5)))).toBe(true);
  });
});

describe("refund that also cancels the upcoming classes", () => {
  it("cancels the booked classes first, so the whole credit amount comes back", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student", "STUDENT");
    await prisma.user.update({ where: { id: student.id }, data: { classCredits: 8 } });
    const plan = await runningPlan(student.id, 20);
    const paid = await bill(student.id, plan.id, "VERIFIED", { installmentNumber: 1 });
    const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "10:00", durationMin: 45, creditCost: 2, label: tag } });
    slotIds.push(slot.id);
    const booked = await prisma.classBooking.create({
      data: { studentId: student.id, scheduleId: slot.id, occurrenceDate: new Date(Date.UTC(2032, 0, 7)), scheduledAt: new Date(Date.now() + 3 * DAY), status: "SCHEDULED", creditsSpent: 2 },
    });

    const { warnings } = await refundZellePayment(paid.id, { id: admin.id, email: admin.email }, { note: "Changed their mind", removeCredits: true, cancelPlan: true, cancelClasses: true });

    expect(warnings.filter((w) => w.includes("held by"))).toEqual([]);
    expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: booked.id } })).status).toBe("CANCELED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).classCredits).toBe(0);
    const audit = await prisma.auditLog.findFirst({ where: { action: "payment.refund", targetId: paid.id } });
    expect(audit?.detail).toContain("1 upcoming class canceled");
  });
});

describe("a bank email from someone whose bill is not open yet", () => {
  it("opens their next bill and pays it with the email, and refuses a different amount by naming the bill", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("early");
    // Due in 20 days: far outside the window a bill opens in, so no bill exists yet.
    const plan = await runningPlan(student.id, 20);
    const wrong = await prisma.processedPaymentEmail.create({ data: { messageId: `<${tag}-wrong@x>`, method: "ZELLE", senderName: "Early Payer", amountCents: 10000 } });
    receiptIds.push(wrong.id);
    await expect(previewReceiptForStudent(wrong.id, student.id)).rejects.toThrow(/Their bill is \$164\.99 and this email is \$100\.00/);
    await expect(attachReceiptToStudent({ receiptId: wrong.id, userId: student.id, admin: { id: admin.id, email: admin.email } })).rejects.toThrow(/Their bill is/);
    expect(await prisma.zellePayment.count({ where: { paymentPlanId: plan.id } })).toBe(0);

    const right = await prisma.processedPaymentEmail.create({ data: { messageId: `<${tag}-right@x>`, method: "ZELLE", senderName: "Early Payer", amountCents: 16499 } });
    receiptIds.push(right.id);
    const preview = await previewReceiptForStudent(right.id, student.id);
    expect(preview).toMatchObject({ amountCents: 16499, opensEarly: true });

    const { paymentId, openedEarly } = await attachReceiptToStudent({ receiptId: right.id, userId: student.id, admin: { id: admin.id, email: admin.email } });
    expect(openedEarly).toBe(true);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe("VERIFIED");
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).installmentsPaid).toBe(2);
    expect((await prisma.processedPaymentEmail.findUniqueOrThrow({ where: { id: right.id } })).paymentId).toBe(paymentId);
    // Spent: the same email cannot pay twice.
    await expect(attachReceiptToStudent({ receiptId: right.id, userId: student.id, admin: { id: admin.id, email: admin.email } })).rejects.toThrow(/already been handled/);
  });

  it("refuses someone with no running plan", async () => {
    const nobody = await account("noplan");
    const r = await prisma.processedPaymentEmail.create({ data: { messageId: `<${tag}-none@x>`, method: "ZELLE", senderName: "No Plan", amountCents: 16499 } });
    receiptIds.push(r.id);
    await expect(previewReceiptForStudent(r.id, nobody.id)).rejects.toThrow(/no running plan/);
  });
});

describe("refusals that carry their own fix", () => {
  it("points at the payment waiting for review", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student");
    const plan = await runningPlan(student.id, 2);
    const sent = await bill(student.id, plan.id, "PENDING_REVIEW");
    const err = await setPlanPrice(admin.id, plan.id, 15000).catch((e) => e);
    expect(err).toBeInstanceOf(PlanFixError);
    expect(err.message).not.toContain("Billing >");
    expect(await resolvePlanFix(err)).toEqual({ kind: "payment", paymentId: sent.id });
  });

  it("offers to record the first payment, and to cancel the plan in the way of a restart", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student");
    const unpaid = await runningPlan(student.id, 2, { installmentsPaid: 0 });
    expect(await resolvePlanFix(await waiveNextBill(admin.id, unpaid.id).catch((e) => e))).toEqual({ kind: "record-payment", planId: unpaid.id });

    const old = await runningPlan(student.id, 2, { status: "CANCELED", canceledAt: new Date(), cancellationNote: "test" });
    expect(await resolvePlanFix(await restartPlan(admin.id, old.id).catch((e) => e))).toEqual({ kind: "cancel-plan", planId: unpaid.id });
  });

  it("turns a group that has not started into its combined first payment", async () => {
    const admin = await account("admin", "ADMIN");
    const parent = await account("parent");
    const child = await account("child");
    const group = await prisma.familyPlanGroup.create({ data: { payerId: parent.id, kind: "PARENT" } });
    groupIds.push(group.id);
    const plan = await runningPlan(child.id, 2, { installmentsPaid: 0, familyGroupId: group.id });
    const start = await prisma.zellePayment.create({ data: { userId: parent.id, purpose: "FAMILY_PLAN_START", familyGroupId: group.id, amountCents: 16499, zelleHandle: "x", status: "AWAITING_TRANSFER" } });

    const fromSplit = await separateFromGroup(admin.id, plan.id).catch((e) => e);
    expect(fromSplit.message).toMatch(/has not started yet/);
    expect(await resolvePlanFix(fromSplit)).toEqual({ kind: "payment", paymentId: start.id });
    expect(await resolvePlanFix(await getLateSettlementPreview(plan.id).catch((e) => e))).toEqual({ kind: "payment", paymentId: start.id });
    // Record payment on the child's own plan would start one person only: it points at the combined first payment too.
    expect(await resolvePlanFix(await refuseIfPaidThroughGroup(plan.id).catch((e) => e))).toEqual({ kind: "payment", paymentId: start.id });

    // Marking the combined first payment paid starts the plan: the fix works where it is shown.
    await markBillPaid(start.id, { id: admin.id, email: admin.email });
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: start.id } })).status).toBe("VERIFIED");
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).installmentsPaid).toBe(1);
  });
});
