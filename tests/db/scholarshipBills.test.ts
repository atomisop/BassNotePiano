import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { createPaymentPlan, getOrCreateOpenInstallmentPayment, lapsePlanForNonPayment, resendPlanInvoice } from "@/lib/paymentPlans";
import { approveZellePayment } from "@/lib/payments";
import { claimScholarshipCode, createScholarshipCode } from "@/lib/scholarships";
import { planContinuesOnScholarship, renewCompletedScholarshipPlans } from "@/lib/scholarshipPlans";
import { getMeStatus } from "@/lib/meStatus";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { getFollowUpPeople } from "@/lib/adminFollowUps";
import { addBillingCycles } from "@/lib/billingCycle";
import { calculatePaymentPlanRate, discountedPlanPriceCents, OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { getPricingConfig } from "@/lib/pricing";
import { runPaymentPlanInstallments } from "../../netlify/functions/payment-plan-installments";
import { makeUser, newTag, prisma } from "./helpers";

/**
 * The owner's rule for scholarships. FULL (100%): never a bill to pay, never a bill notice, email, bill bar, lapse or lock; each 28
 * days is covered by itself, and the 6 Month plan goes on past its sixth bill. PARTIAL: an ordinary bill that names the scholarship
 * and what is left to pay.
 */

const tag = newTag("schb");
const DAY = 86_400_000;
const ids: string[] = [];
const slotIds: string[] = [];
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const etYmd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const weekdayIn = (days: number) => new Date(`${etYmd(new Date(Date.now() + days * DAY))}T12:00:00Z`).getUTCDay();

async function student(label: string, extra: Record<string, unknown> = {}) {
  const u = await makeUser(`${tag}${label}`, `Sam ${label} Scholar`, { emailVerified: new Date(), ...extra });
  ids.push(u.id);
  return u;
}

let ownerId = "";
async function owner() {
  if (!ownerId) {
    const a = await makeUser(`${tag}owner`, "Owner Person", { role: "ADMIN" });
    ids.push(a.id);
    ownerId = a.id;
  }
  return ownerId;
}

async function slot(daysAhead = 3, startTime = "16:00") {
  const s = await prisma.classSchedule.create({ data: { dayOfWeek: weekdayIn(daysAhead), startTime, durationMin: 45, creditCost: 2, label: `${tag} ${slotIds.length}` } });
  slotIds.push(s.id);
  return s;
}

async function listPrice() {
  return calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, "TERM_6", await getPricingConfig()).installmentAmountCents;
}

/** A scholarship the account already holds (as if claimed). */
async function scholarship(user: { id: string; email: string }, percent: number, extra: Record<string, unknown> = {}) {
  return prisma.scholarshipCode.create({
    data: { code: String(Math.floor(1e15 + Math.random() * 9e15)), assignedEmail: user.email.toLowerCase(), percent, claimedAt: new Date(), claimedById: user.id, ...extra },
  });
}

/** A running 6 Month plan a full scholarship covers ($0), with a weekly time. */
async function coveredPlan(userId: string, input: { paid: number; dueInDays: number; scheduleId?: string | null; status?: "ACTIVE" | "COMPLETED" | "CANCELED" }) {
  return prisma.paymentPlan.create({
    data: {
      userId,
      cadence: OFFERED_PLAN_CADENCE,
      term: "TERM_6",
      installmentAmountCents: 0,
      listAmountCents: await listPrice(),
      creditsPerInstallment: 8,
      termMonths: 6,
      installmentsPaid: input.paid,
      nextDueDate: new Date(Date.now() + input.dueInDays * DAY),
      status: input.status ?? "ACTIVE",
      reservedScheduleId: input.scheduleId ?? null,
      reservedChunkIndex: input.scheduleId ? 0 : null,
    },
  });
}

/** Everything the student was told: the bell and Mail. */
async function noticesOf(userId: string) {
  const [bell, mail] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { title: true, body: true } }),
    prisma.mailMessage.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { title: true, body: true } }),
  ]);
  return [...bell, ...mail];
}

const BILL_WORDS = /installment due|installment overdue|ready to pay|bill ready|overdue|\$0\.00/i;

async function expectNeverBilled(user: { id: string; email: string }) {
  const notes = await noticesOf(user.id);
  for (const n of notes) expect(`${n.title} ${n.body}`).not.toMatch(BILL_WORDS);
  const emails = await prisma.emailLog.findMany({ where: { to: user.email }, select: { subject: true } });
  for (const e of emails) expect(e.subject).not.toMatch(/bill|overdue|installment|\$0\.00/i);
  expect(await prisma.zellePayment.count({ where: { userId: user.id, status: "AWAITING_TRANSFER" } })).toBe(0);
  expect((await getMeStatus(user.id)).billDue).toBeNull();
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(fresh.paymentLockedAt).toBeNull();
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.emailLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  const plans = await prisma.paymentPlan.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: [...ids, ...plans.map((p) => p.id)] } }] } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.scholarshipCode.deleteMany({ where: { OR: [{ claimedById: { in: ids } }, { createdById: { in: ids } }] } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("a full scholarship is never a bill", () => {
  it("opening the next bill settles it: no bill to pay, no due notice, no bill email, no bill bar", async () => {
    const stu = await student("open");
    await scholarship(stu, 100);
    const plan = await coveredPlan(stu.id, { paid: 2, dueInDays: 3 });

    const opened = await getOrCreateOpenInstallmentPayment(plan.id, "x");
    expect(opened.payment).toBeNull();
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.installmentsPaid).toBe(3);
    expect(after.nextDueDate.getTime()).toBe(addBillingCycles(plan.nextDueDate, 1).getTime());
    const bills = await prisma.zellePayment.findMany({ where: { paymentPlanId: plan.id } });
    expect(bills.map((b) => [b.status, b.amountCents])).toEqual([["VERIFIED", 0]]);

    const notes = await noticesOf(stu.id);
    expect(notes.map((n) => n.title)).toEqual(["Covered by your scholarship"]);
    expect(notes[0].body).toMatch(/^Your scholarship covers your next 28 days\. .* Nothing to pay\.$/);
    expect(notes[0].body).not.toMatch(/payment \d+ of|verified/);
    await expectNeverBilled(stu);
  });

  it("the daily job leaves no open $0 bill, sends no due or overdue notice, and never cancels or locks", async () => {
    // One left with a stale open $0 bill and a date far past the lapse cutoff; one with no bill at all and just as late.
    const stale = await student("stale");
    await scholarship(stale, 100);
    const stalePlan = await coveredPlan(stale.id, { paid: 2, dueInDays: -10 });
    await prisma.zellePayment.create({ data: { userId: stale.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: stalePlan.id, amountCents: 0, zelleHandle: "x", lessonQuantity: 8, installmentNumber: 3, status: "AWAITING_TRANSFER" } });
    const bare = await student("bare");
    await scholarship(bare, 100);
    const barePlan = await coveredPlan(bare.id, { paid: 3, dueInDays: -9 });

    // Neither is on any "overdue" list the studio sees, and Resend bill refuses instead of sending a $0 bill.
    const overdue = await getFollowUpPeople("overdue");
    expect(overdue.some((p) => p.id === stale.id || p.id === bare.id)).toBe(false);
    await expect(resendPlanInvoice(barePlan.id)).rejects.toThrow(/covered by a full scholarship/);
    // Asked directly, the lapse refuses and settles instead.
    expect(await lapsePlanForNonPayment(barePlan.id)).toBe(false);

    await runPaymentPlanInstallments();
    await runPaymentPlanInstallments();

    for (const [user, plan, paidBefore] of [[stale, stalePlan, 2], [bare, barePlan, 3]] as const) {
      const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
      expect(after.status).toBe("ACTIVE");
      expect(after.installmentsPaid).toBe(paidBefore + 1);
      expect(after.nextDueDate.getTime()).toBeGreaterThan(Date.now());
      await expectNeverBilled(user);
    }
  });

  it("a scholarship raised to 100% settles an open unpaid bill, and leaves a bill already sent for review alone", async () => {
    const actor = { id: await owner(), email: null };
    const price = await listPrice();

    const unpaid = await student("unpaid");
    const unpaidPlan = await prisma.paymentPlan.create({ data: { userId: unpaid.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_6", installmentAmountCents: price, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 2 * DAY) } });
    const open = await prisma.zellePayment.create({ data: { userId: unpaid.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: unpaidPlan.id, amountCents: price, zelleHandle: "x", lessonQuantity: 8, installmentNumber: 2, status: "AWAITING_TRANSFER" } });
    const code = await createScholarshipCode({ email: unpaid.email, percent: 100, actor });
    await claimScholarshipCode(unpaid.id, code.code);
    expect(await prisma.zellePayment.findUniqueOrThrow({ where: { id: open.id } })).toMatchObject({ status: "VERIFIED", amountCents: 0 });
    expect(await prisma.paymentPlan.findUniqueOrThrow({ where: { id: unpaidPlan.id } })).toMatchObject({ installmentAmountCents: 0, listAmountCents: price, installmentsPaid: 2, status: "ACTIVE" });
    // One calm notice, with no price in it.
    const notes = await noticesOf(unpaid.id);
    expect(notes.map((n) => n.title)).toEqual(["Your scholarship covers your plan"]);
    expect(notes[0].body).toMatch(/Nothing to pay/);
    await expectNeverBilled(unpaid);

    const sent = await student("sent");
    const sentPlan = await prisma.paymentPlan.create({ data: { userId: sent.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_6", installmentAmountCents: price, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 2 * DAY) } });
    const inReview = await prisma.zellePayment.create({ data: { userId: sent.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: sentPlan.id, amountCents: price, zelleHandle: "x", lessonQuantity: 8, installmentNumber: 2, status: "PENDING_REVIEW", submittedAt: new Date() } });
    const code2 = await createScholarshipCode({ email: sent.email, percent: 100, actor });
    await claimScholarshipCode(sent.id, code2.code);
    await runPaymentPlanInstallments();
    // The money they already sent is still the owner's to review, at its real amount.
    expect(await prisma.zellePayment.findUniqueOrThrow({ where: { id: inReview.id } })).toMatchObject({ status: "PENDING_REVIEW", amountCents: price });
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: sentPlan.id } })).installmentsPaid).toBe(1);
  });
});

describe("a full scholarship plan goes on past its sixth bill", () => {
  it("renews once when the sixth bill settles: access, weekly classes and credits continue, one notice", async () => {
    const stu = await student("renew");
    await scholarship(stu, 100);
    const s = await slot(3);
    const plan = await coveredPlan(stu.id, { paid: 5, dueInDays: 2, scheduleId: s.id });

    expect((await getOrCreateOpenInstallmentPayment(plan.id, "x")).payment).toBeNull();
    // Asking again (a second tab, the daily job) changes nothing: the next bill is not due yet.
    expect((await getOrCreateOpenInstallmentPayment(plan.id, "x")).payment).toBeNull();
    await runPaymentPlanInstallments();

    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after).toMatchObject({ status: "ACTIVE", installmentsPaid: 6, termMonths: 12, installmentAmountCents: 0, reservedScheduleId: s.id });
    expect(after.nextDueDate.getTime()).toBe(addBillingCycles(plan.nextDueDate, 1).getTime());
    expect(await prisma.paymentPlan.count({ where: { userId: stu.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "plan.scholarship-renew", targetId: plan.id } })).toBe(1);

    // Access stays paid, the new cycle's credits are there, and the weekly class is on the calendar inside it.
    expect((await getCurriculumEntitlement(stu.id)).kind).toBe("PAID");
    const grant = await prisma.creditGrant.findFirstOrThrow({ where: { userId: stu.id, paymentPlanId: plan.id }, orderBy: { createdAt: "desc" } });
    expect(grant.expiresAt?.getTime()).toBe(after.nextDueDate.getTime());
    const booked = await prisma.classBooking.findMany({ where: { reservedByPlanId: plan.id, status: "SCHEDULED", scheduledAt: { gte: plan.nextDueDate, lt: after.nextDueDate } } });
    expect(booked.length).toBeGreaterThanOrEqual(3);

    // One calm notice; never "complete", never a bill.
    const notes = await noticesOf(stu.id);
    expect(notes.map((n) => n.title)).toEqual(["Your scholarship plan continues"]);
    expect(notes[0].body).toMatch(/^Your scholarship plan continues\. Nothing to pay\./);
    await expectNeverBilled(stu);

    // The seventh cycle is covered like any other, and the plan keeps running.
    await getOrCreateOpenInstallmentPayment(plan.id, "x", new Date(after.nextDueDate.getTime() - 2 * DAY));
    const seventh = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(seventh).toMatchObject({ status: "ACTIVE", installmentsPaid: 7, termMonths: 12 });
    expect(await prisma.auditLog.count({ where: { action: "plan.scholarship-renew", targetId: plan.id } })).toBe(1);
    await expectNeverBilled(stu);
  });

  it("does not renew when the scholarship was ended or lowered, or the account is banned or locked", async () => {
    const cases: { label: string; percent: number; code?: Record<string, unknown>; user?: Record<string, unknown> }[] = [
      { label: "ended", percent: 100, code: { revokedAt: new Date() } },
      { label: "lowered", percent: 50 },
      { label: "banned", percent: 100, user: { bannedAt: new Date() } },
      { label: "locked", percent: 100, user: { paymentLockedAt: new Date() } },
    ];
    for (const c of cases) {
      const stu = await student(c.label, c.user ?? {});
      await scholarship(stu, c.percent, c.code ?? {});
      const plan = await coveredPlan(stu.id, { paid: 5, dueInDays: 2 });
      await getOrCreateOpenInstallmentPayment(plan.id, "x");
      const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
      expect([c.label, after.status, after.installmentsPaid, after.termMonths]).toEqual([c.label, "COMPLETED", 6, 6]);
      expect(await prisma.auditLog.count({ where: { action: "plan.scholarship-renew", targetId: plan.id } })).toBe(0);
      // The daily check does not bring it back either.
      await prisma.paymentPlan.update({ where: { id: plan.id }, data: { nextDueDate: new Date(Date.now() - 25 * DAY) } });
      expect(await renewCompletedScholarshipPlans("x")).toBe(0);
      expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("COMPLETED");
    }
  });

  it("does not renew a canceled plan, a plan in a group, or a plan with a price", async () => {
    const stu = await student("canceled");
    await scholarship(stu, 100);
    const plan = await coveredPlan(stu.id, { paid: 5, dueInDays: 2, status: "CANCELED" });
    const late = await prisma.zellePayment.create({ data: { userId: stu.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, amountCents: 0, zelleHandle: "x", lessonQuantity: 8, installmentNumber: 6, status: "PENDING_REVIEW", submittedAt: new Date() } });
    await approveZellePayment(late.id, null, { auto: true, skipReceipt: true });
    expect(await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).toMatchObject({ status: "CANCELED", installmentsPaid: 5, termMonths: 6 });
    expect(await prisma.auditLog.count({ where: { action: "plan.scholarship-renew", targetId: plan.id } })).toBe(0);

    const facts = { userId: stu.id, term: "TERM_6", installmentAmountCents: 0, familyGroupId: null };
    expect(await planContinuesOnScholarship(prisma, facts)).toBe(true);
    expect(await planContinuesOnScholarship(prisma, { ...facts, familyGroupId: "some-group" })).toBe(false);
    expect(await planContinuesOnScholarship(prisma, { ...facts, installmentAmountCents: 100 })).toBe(false);
    expect(await planContinuesOnScholarship(prisma, { ...facts, term: "TERM_3" })).toBe(false);
  });

  it("the daily check renews a finished plan once when its holder has a full scholarship, with one notice", async () => {
    const price = await listPrice();
    const stu = await student("net");
    await scholarship(stu, 100);
    const s = await slot(4, "17:00");
    // Finished at full price before the scholarship; its last paid 28 days end in 3 days.
    const lastCycleStart = new Date(Date.now() - 25 * DAY);
    const plan = await prisma.paymentPlan.create({
      data: { userId: stu.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_6", installmentAmountCents: price, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 6, status: "COMPLETED", nextDueDate: lastCycleStart, reservedScheduleId: s.id, reservedChunkIndex: 0 },
    });
    // Someone with no scholarship, finished the same way, is left finished.
    const other = await student("nonet");
    const otherPlan = await prisma.paymentPlan.create({ data: { userId: other.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_6", installmentAmountCents: price, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 6, status: "COMPLETED", nextDueDate: lastCycleStart } });

    await runPaymentPlanInstallments();
    await runPaymentPlanInstallments();

    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after).toMatchObject({ status: "ACTIVE", installmentsPaid: 7, termMonths: 12, installmentAmountCents: 0, listAmountCents: price });
    // No gap: the new cycle starts exactly where the paid one ended.
    expect(after.nextDueDate.getTime()).toBe(addBillingCycles(lastCycleStart, 2).getTime());
    expect(await prisma.auditLog.count({ where: { action: "plan.scholarship-renew", targetId: plan.id } })).toBe(1);
    expect((await getCurriculumEntitlement(stu.id)).kind).toBe("PAID");
    const notes = await noticesOf(stu.id);
    expect(notes.map((n) => n.title)).toEqual(["Your scholarship plan continues"]);
    await expectNeverBilled(stu);
    const booked = await prisma.classBooking.count({ where: { reservedByPlanId: plan.id, status: "SCHEDULED", scheduledAt: { gte: addBillingCycles(lastCycleStart, 1) } } });
    expect(booked).toBeGreaterThanOrEqual(3);

    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: otherPlan.id } })).status).toBe("COMPLETED");
  });
});

describe("a partial scholarship gets a normal bill that says what is left", () => {
  it("bills the discounted price, and the due and overdue notices name the scholarship and the amount left", async () => {
    const actor = { id: await owner(), email: null };
    const price = await listPrice();
    const left = discountedPlanPriceCents(price, 50);
    const stu = await student("half");
    const code = await createScholarshipCode({ email: stu.email, percent: 50, actor });
    await claimScholarshipCode(stu.id, code.code);
    const s = await slot(5, "18:00");
    const plan = await createPaymentPlan(stu.id, OFFERED_PLAN_CADENCE, "TERM_6", "x", s.id, 0);
    expect(plan).toMatchObject({ installmentAmountCents: left, listAmountCents: price });
    const first = await prisma.zellePayment.findFirstOrThrow({ where: { paymentPlanId: plan.id } });
    expect(first).toMatchObject({ status: "AWAITING_TRANSFER", amountCents: left });
    await prisma.zellePayment.update({ where: { id: first.id }, data: { status: "PENDING_REVIEW", submittedAt: new Date() } });
    await approveZellePayment(first.id, actor.id, { skipReceipt: true });

    // The next bill opens: an ordinary bill for what is left.
    await prisma.paymentPlan.update({ where: { id: plan.id }, data: { nextDueDate: new Date(Date.now() + 3 * DAY) } });
    await runPaymentPlanInstallments();
    const bill = await prisma.zellePayment.findFirstOrThrow({ where: { paymentPlanId: plan.id, status: "AWAITING_TRANSFER" } });
    expect(bill.amountCents).toBe(left);
    const due = (await noticesOf(stu.id)).filter((n) => n.title === "Installment due");
    expect(due).toHaveLength(1);
    expect(due[0].body).toContain(`Your 50% scholarship covers ${usd(price - left)} of this bill. ${usd(left)} is left to pay.`);
    expect((await getMeStatus(stu.id)).billDue?.amountCents).toBe(left);
    const invoice = await prisma.emailLog.findMany({ where: { to: stu.email, subject: { startsWith: "Bill:" } } });
    expect(invoice).toHaveLength(1);
    expect(invoice[0].subject).toContain(usd(left));

    // Two days late: the overdue notice names what is left too.
    await prisma.paymentPlan.update({ where: { id: plan.id }, data: { nextDueDate: new Date(Date.now() - 2 * DAY) } });
    await runPaymentPlanInstallments();
    const overdue = (await noticesOf(stu.id)).filter((n) => n.title === "Installment overdue");
    expect(overdue).toHaveLength(1);
    expect(overdue[0].body).toContain(`With your 50% scholarship, ${usd(left)} is left to pay.`);
    expect(overdue[0].body).toMatch(/2 days overdue/);
  });
});
