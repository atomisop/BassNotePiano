import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { applyPlanSetup, getPlanSetupContext, previewPlanSetup } from "@/lib/planSetup";
import { adminPausePlan, getOrCreateOpenInstallmentPayment } from "@/lib/paymentPlans";
import { approveZellePayment } from "@/lib/payments";
import { createReservedBookingIfAbsent, etWallTimeToUtc } from "@/lib/classSchedule";
import { revokeScholarshipCode } from "@/lib/scholarships";
import { addBillingCycles } from "@/lib/billingCycle";
import { calculatePaymentPlanRate, OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { getPricingConfig } from "@/lib/pricing";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ps");
const DAY = 86_400_000;
const ids: string[] = [];
const slotIds: string[] = [];
let adminId = "";

const etYmd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
/** The weekday (0 Sunday) a few days from now, Eastern, so the next class of a slot on it is always that day. */
const weekdayIn = (days: number) => new Date(`${etYmd(new Date(Date.now() + days * DAY))}T12:00:00Z`).getUTCDay();
const etMidnight = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return etWallTimeToUtc(y, m, d, 0, 0);
};

async function student(label: string) {
  const u = await makeUser(`${tag}${label}`, `Kal ${label} Student`, { emailVerified: new Date() });
  ids.push(u.id);
  return u;
}

async function slot(daysAhead: number, startTime = "16:00") {
  const s = await prisma.classSchedule.create({ data: { dayOfWeek: weekdayIn(daysAhead), startTime, durationMin: 45, creditCost: 2, label: `${tag} ${slotIds.length}` } });
  slotIds.push(s.id);
  return s;
}

async function datesFor(userId: string, scheduleId: string) {
  const ctx = await getPlanSetupContext(userId);
  const s = ctx.slots.find((x) => x.scheduleId === scheduleId);
  if (!s) throw new Error("slot not offered");
  return s.dates;
}

/** Everything the student was told: the bell and Mail (payment and billing notices go to Mail). */
async function noticesOf(userId: string) {
  const [bell, mail] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { title: true, body: true } }),
    prisma.mailMessage.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { title: true, body: true } }),
  ]);
  return [...bell, ...mail];
}

async function admin() {
  if (!adminId) {
    const a = await makeUser(`${tag}admin`, "Owner Person", { role: "ADMIN" });
    ids.push(a.id);
    adminId = a.id;
  }
  return adminId;
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.scholarshipCode.deleteMany({ where: { OR: [{ claimedById: { in: ids } }, { createdById: { in: ids } }] } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("Set up plan", () => {
  it("full scholarship, no plan, first class next week: a free 6 Month plan that runs like a paid one, nothing booked before the first class, one notice", async () => {
    const ownerId = await admin();
    const stu = await student("free");
    const s = await slot(2);
    const dates = await datesFor(stu.id, s.id);
    const first = dates[1]; // next week's class

    const preview = await previewPlanSetup({ userId: stu.id, scheduleId: s.id, chunkIndex: 0, firstClassDate: first, scholarship: { kind: "full" }, term: "MONTHLY" });
    expect(preview.mode).toBe("new");
    expect(preview.priceCents).toBe(0);
    expect(preview.planLabel).toMatch(/^6 Months/);
    expect(preview.classDates).toEqual([first, dates[2], dates[3], dates[4]]);
    // Nothing has changed yet.
    expect(await prisma.paymentPlan.count({ where: { userId: stu.id } })).toBe(0);

    const done = await applyPlanSetup(ownerId, { userId: stu.id, scheduleId: s.id, chunkIndex: 0, firstClassDate: first, scholarship: { kind: "full" }, term: "MONTHLY" });
    expect(done).toMatchObject({ mode: "new", priceCents: 0, covered: true });

    const plan = await prisma.paymentPlan.findFirstOrThrow({ where: { userId: stu.id, status: "ACTIVE" } });
    const startsAt = etMidnight(first);
    expect(plan.term).toBe("TERM_6");
    expect(plan.installmentAmountCents).toBe(0);
    expect(plan.installmentsPaid).toBe(1);
    expect(plan.startsAt?.getTime()).toBe(startsAt.getTime());
    // The first 28 days start on the first class, not today.
    expect(plan.nextDueDate.getTime()).toBe(addBillingCycles(startsAt, 1).getTime());
    const grant = await prisma.creditGrant.findFirstOrThrow({ where: { userId: stu.id, paymentPlanId: plan.id } });
    expect(grant.expiresAt?.getTime()).toBe(plan.nextDueDate.getTime());

    // A studio scholarship, already claimed, so Billing > Scholarships shows (and can end) it.
    const code = await prisma.scholarshipCode.findFirstOrThrow({ where: { claimedById: stu.id } });
    expect(code).toMatchObject({ percent: 100, createdById: ownerId, assignedEmail: stu.email.toLowerCase(), revokedAt: null });

    // The first bill is a verified $0 bill, settled like a paid one.
    const bills = await prisma.zellePayment.findMany({ where: { paymentPlanId: plan.id } });
    expect(bills.map((b) => [b.status, b.amountCents, b.installmentNumber])).toEqual([["VERIFIED", 0, 1]]);

    // Four classes, from the first class on, none this week.
    const booked = await prisma.classBooking.findMany({ where: { studentId: stu.id, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" } });
    expect(booked.map((b) => etYmd(b.scheduledAt))).toEqual([first, dates[2], dates[3], dates[4]]);
    expect(booked[0].scheduledAt.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })).toBe("4:00 PM");

    // One notice, and it never asks for a payment.
    const notes = await noticesOf(stu.id);
    expect(notes.map((n) => n.title)).toEqual(["Your classes are set up"]);
    expect(notes[0].body).toMatch(/nothing to pay/);

    // The next 28 days: the bill opens at the usual time and is covered at once, like a paying customer's paid bill.
    const opened = await getOrCreateOpenInstallmentPayment(plan.id, "x", new Date(plan.nextDueDate.getTime() - 2 * DAY));
    expect(opened.payment).toBeNull();
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.installmentsPaid).toBe(2);
    expect(after.nextDueDate.getTime()).toBe(addBillingCycles(plan.nextDueDate, 1).getTime());
    const covered = (await noticesOf(stu.id)).filter((n) => n.title === "Covered by your scholarship");
    expect(covered).toHaveLength(1);
    expect(covered[0].body).not.toMatch(/verified/);

    // Ending the scholarship puts the plan back to the 6 Month price.
    await revokeScholarshipCode(code.id, { id: ownerId, email: null });
    const rate = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, "TERM_6", await getPricingConfig());
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).installmentAmountCents).toBe(rate.installmentAmountCents);
  });

  it("a running paid plan: scholarship, new weekly time and a first class two weeks out move everything together", async () => {
    const ownerId = await admin();
    const stu = await student("run");
    const oldSlot = await slot(3, "11:00");
    const newSlot = await slot(2);
    const due = new Date(Date.now() + 20 * DAY);
    const plan = await prisma.paymentPlan.create({
      data: { userId: stu.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_6", installmentAmountCents: 21999, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: due, reservedScheduleId: oldSlot.id, reservedChunkIndex: 0 },
    });
    const grant = await prisma.creditGrant.create({ data: { userId: stu.id, source: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, creditsGranted: 8, creditsRemaining: 8, expiresAt: due } });
    await prisma.user.update({ where: { id: stu.id }, data: { classCredits: 8 } });
    const oldBooking = await prisma.classBooking.create({
      data: { studentId: stu.id, scheduleId: oldSlot.id, occurrenceDate: new Date(`${etYmd(new Date(Date.now() + 3 * DAY))}T00:00:00Z`), scheduledAt: new Date(Date.now() + 3 * DAY), status: "SCHEDULED", creditsSpent: 2, reservedByPlanId: plan.id },
    });
    const dates = await datesFor(stu.id, newSlot.id);

    await applyPlanSetup(ownerId, { userId: stu.id, scheduleId: newSlot.id, chunkIndex: 0, firstClassDate: dates[2], scholarship: { kind: "full" }, term: "TERM_6" });

    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.installmentAmountCents).toBe(0);
    expect(after.listAmountCents).toBe(21999);
    expect(after.reservedScheduleId).toBe(newSlot.id);
    expect(after.nextDueDate.getTime()).toBe(due.getTime() + 14 * DAY);
    expect((await prisma.creditGrant.findUniqueOrThrow({ where: { id: grant.id } })).expiresAt!.getTime()).toBe(due.getTime() + 14 * DAY);
    expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: oldBooking.id } })).status).toBe("CANCELED");
    const booked = await prisma.classBooking.findMany({ where: { studentId: stu.id, status: "SCHEDULED" } });
    expect(booked.length).toBeGreaterThan(0);
    for (const b of booked) {
      expect(b.scheduleId).toBe(newSlot.id);
      expect(b.scheduledAt.getTime()).toBeGreaterThanOrEqual(etMidnight(dates[2]).getTime());
    }
  });

  it("no scholarship: the first bill is sent, and its approval starts the 28 days on the first class", async () => {
    const ownerId = await admin();
    const stu = await student("paid");
    const s = await slot(2);
    const dates = await datesFor(stu.id, s.id);
    const done = await applyPlanSetup(ownerId, { userId: stu.id, scheduleId: s.id, chunkIndex: 0, firstClassDate: dates[1], scholarship: { kind: "keep" }, term: "TERM_3" });
    expect(done.covered).toBe(false);
    expect(done.priceCents).toBeGreaterThan(0);

    const plan = await prisma.paymentPlan.findFirstOrThrow({ where: { userId: stu.id, status: "ACTIVE" } });
    expect(plan.term).toBe("TERM_3");
    expect(plan.installmentsPaid).toBe(0);
    const bill = await prisma.zellePayment.findFirstOrThrow({ where: { paymentPlanId: plan.id, status: "AWAITING_TRANSFER" } });
    expect(bill.amountCents).toBe(done.priceCents);
    expect(await prisma.classBooking.count({ where: { studentId: stu.id, status: "SCHEDULED" } })).toBe(0);
    const notes = await noticesOf(stu.id);
    expect(notes.map((n) => n.title)).toEqual(["Your classes are set up"]);
    expect(notes[0].body).toMatch(/Send the first payment/);

    await prisma.zellePayment.update({ where: { id: bill.id }, data: { status: "PENDING_REVIEW", submittedAt: new Date() } });
    await approveZellePayment(bill.id, ownerId);
    const paid = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(paid.nextDueDate.getTime()).toBe(addBillingCycles(etMidnight(dates[1]), 1).getTime());
    const booked = await prisma.classBooking.findMany({ where: { studentId: stu.id, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" } });
    expect(booked.map((b) => etYmd(b.scheduledAt))).toEqual([dates[1], dates[2], dates[3], dates[4]]);
  });

  it("running it again on a plan that already starts later: the same first class moves nothing, a later or earlier one moves the dates with it", async () => {
    const ownerId = await admin();
    const stu = await student("again");
    const s = await slot(2);
    const dates = await datesFor(stu.id, s.id);
    const input = { userId: stu.id, scheduleId: s.id, chunkIndex: 0, scholarship: { kind: "full" as const }, term: "TERM_6" as const };
    await applyPlanSetup(ownerId, { ...input, firstClassDate: dates[1] });
    const plan = await prisma.paymentPlan.findFirstOrThrow({ where: { userId: stu.id, status: "ACTIVE" } });
    const firstDue = plan.nextDueDate.getTime();
    const bookedDays = async () => (await prisma.classBooking.findMany({ where: { studentId: stu.id, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" } })).map((b) => etYmd(b.scheduledAt));

    // Same first class again: nothing moves.
    expect((await previewPlanSetup({ ...input, firstClassDate: dates[1] })).nextBill).toBe(etYmd(new Date(firstDue)));
    await applyPlanSetup(ownerId, { ...input, firstClassDate: dates[1] });
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).nextDueDate.getTime()).toBe(firstDue);
    expect(await bookedDays()).toEqual([dates[1], dates[2], dates[3], dates[4]]);

    // A week later: the bill and the classes move one week out.
    await applyPlanSetup(ownerId, { ...input, firstClassDate: dates[2] });
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).nextDueDate.getTime()).toBe(firstDue + 7 * DAY);
    expect((await bookedDays())[0]).toBe(dates[2]);

    // Back to the first date: everything returns.
    await applyPlanSetup(ownerId, { ...input, firstClassDate: dates[1] });
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).nextDueDate.getTime()).toBe(firstDue);
    expect(await bookedDays()).toEqual([dates[1], dates[2], dates[3], dates[4]]);
  });

  it("refuses what it must not do: a paused plan, a lower scholarship than the one claimed, another weekday", async () => {
    const ownerId = await admin();
    const stu = await student("no");
    const s = await slot(2);
    const dates = await datesFor(stu.id, s.id);
    await applyPlanSetup(ownerId, { userId: stu.id, scheduleId: s.id, chunkIndex: 0, firstClassDate: dates[0], scholarship: { kind: "full" }, term: "TERM_6" });

    await expect(previewPlanSetup({ userId: stu.id, scheduleId: s.id, chunkIndex: 0, firstClassDate: dates[0], scholarship: { kind: "percent", percent: 40 }, term: "TERM_6" })).rejects.toThrow(/already has a 100% scholarship/);
    const wrongDay = new Date(Date.parse(`${dates[0]}T12:00:00Z`) + DAY).toISOString().slice(0, 10);
    await expect(previewPlanSetup({ userId: stu.id, scheduleId: s.id, chunkIndex: 0, firstClassDate: wrongDay, scholarship: { kind: "keep" }, term: "TERM_6" })).rejects.toThrow(/weekly time's day/);

    const plan = await prisma.paymentPlan.findFirstOrThrow({ where: { userId: stu.id, status: "ACTIVE" } });
    await adminPausePlan(plan.id, ownerId, new Date(Date.now() + 10 * DAY));
    expect((await getPlanSetupContext(stu.id)).blocked).toMatch(/paused/);
    await expect(applyPlanSetup(ownerId, { userId: stu.id, scheduleId: s.id, chunkIndex: 0, firstClassDate: dates[2], scholarship: { kind: "keep" }, term: "TERM_6" })).rejects.toThrow(/paused/);
  });
});

describe("booking a plan's weekly class", () => {
  it("never books before the plan's first class or inside a pause, whoever asks (the daily job, a time move, an approval)", async () => {
    const stu = await student("book");
    const s = await slot(2);
    const later = new Date(Date.now() + 30 * DAY);
    const plan = await prisma.paymentPlan.create({
      data: { userId: stu.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_6", installmentAmountCents: 0, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 40 * DAY), reservedScheduleId: s.id, reservedChunkIndex: 0, startsAt: later },
    });
    const occ = (days: number) => ({ occurrenceDate: new Date(`${etYmd(new Date(Date.now() + days * DAY))}T00:00:00Z`), scheduledAt: new Date(Date.now() + days * DAY) });
    const base = { studentId: stu.id, scheduleId: s.id, creditsSpent: 2, planId: plan.id };
    expect(await createReservedBookingIfAbsent({ ...base, ...occ(5) })).toBeNull();
    expect(await createReservedBookingIfAbsent({ ...base, ...occ(31) })).not.toBeNull();

    // A pause from now to day 36: day 33 is inside it, day 38 after it.
    await prisma.paymentPlan.update({ where: { id: plan.id }, data: { pausedAt: new Date(), pauseUntil: new Date(Date.now() + 36 * DAY) } });
    expect(await createReservedBookingIfAbsent({ ...base, ...occ(33) })).toBeNull();
    expect(await createReservedBookingIfAbsent({ ...base, ...occ(38) })).not.toBeNull();
  });
});
