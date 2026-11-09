import type { PaymentPlanTerm, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBillingCycles } from "@/lib/billingCycle";
import { calculatePaymentPlanRate, describePaymentPlan, discountedPlanPriceCents, discountPercentForTerm, isPlanTermOffered, PLAN_CADENCE_CREDITS_PER_WEEK, OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { chunksForSchedule, computeScheduledAt, etWallTimeToUtc, getReservableSlots } from "@/lib/classSchedule";
import { addMinutesToHHmm } from "@/lib/classScheduleLabels";
import { PaymentPlanError, bookReservedWindowForPlan, recordPlanPaymentReceived } from "@/lib/paymentPlans";
import { getPricingConfig } from "@/lib/pricing";
import { getDiscountPercent, getPersonalDiscount } from "@/lib/accountDiscounts";
import { drawDownCredits } from "@/lib/creditLedger";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { buildPlanTimeline, parseYmd, type PlanTimeline } from "@/lib/planTimeline";

/**
 * The plan builder: one place to set up (or re-anchor) a student's payment plan from a start date that can be in the past. It holds
 * every piece the owner used to do by hand across several screens: the plan length, the weekly time, the day the first cycle began,
 * how many bills are paid, the classes already taught (they count toward the cycle and are charged), and the new schedule laid out
 * from that start. `previewPlanBuilder` shows the whole timeline first; `applyPlanBuilder` does it in one step.
 */

export interface PlanBuilderInput {
  userId: string;
  /** Ignored for a student who already has a plan (it keeps its length). */
  term: PaymentPlanTerm;
  scheduleId: string;
  chunkIndex: number;
  /** Eastern date the first 28-day cycle began, YYYY-MM-DD. May be in the past. */
  startDate: string;
  /** Ignored for a student who already has a plan (it keeps what is recorded). */
  installmentsPaid: number;
  /** Eastern dates of classes already taught, YYYY-MM-DD. */
  taughtDates: string[];
  /** Spend a class credit for each taught class. */
  chargeTaught: boolean;
  /** An existing plan with an unpaid bill: mark that bill received first (the same as the Payments screen does). */
  recordPayment?: boolean;
}

const todayEt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const etMidnight = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return etWallTimeToUtc(y, m, d, 0, 0);
};

export interface PlanBuilderContext {
  mode: "existing" | "new";
  studentName: string;
  term: PaymentPlanTerm;
  termLabel: string;
  cycles: number;
  installmentsPaid: number;
  amountCents: number;
  currentStart: string | null;
  slot: { scheduleId: string; chunkIndex: number } | null;
  /** The existing plan has a bill that is not marked paid yet. */
  openPayment: boolean;
  choices: { scheduleId: string; chunkIndex: number; dayOfWeek: number; startTime: string; label: string }[];
  terms: { term: PaymentPlanTerm; label: string; cycles: number; amountCents: number }[];
}

// Each person on a group or parent plan has their own plan (weekly time, bills, credits), so it is rebuilt on its own like a solo one. Only a
// group whose combined first payment is still open is left alone: that one payment starts every plan in it at once.
function assertGroupPlanStarted(plan: { familyGroupId: string | null; installmentsPaid: number } | null) {
  if (plan?.familyGroupId && plan.installmentsPaid < 1) throw new PaymentPlanError("This group plan has not started yet. Approve its combined first payment on Billing > Payments first.");
}

async function loadSlot(scheduleId: string, chunkIndex: number) {
  const schedule = await prisma.classSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || !schedule.active) throw new PaymentPlanError("That class time is not offered.");
  const chunk = chunksForSchedule(schedule)[chunkIndex];
  if (!chunk) throw new PaymentPlanError("That time slot does not exist.");
  if (chunk.creditCost < PLAN_CADENCE_CREDITS_PER_WEEK[OFFERED_PLAN_CADENCE]) throw new PaymentPlanError("That time slot is too short for a weekly class.");
  return { schedule, chunk };
}

export async function getPlanBuilderContext(userId: string): Promise<PlanBuilderContext> {
  const [user, plan, pricing, discount, free] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } }),
    getPricingConfig(),
    getPersonalDiscount(userId),
    getReservableSlots(PLAN_CADENCE_CREDITS_PER_WEEK[OFFERED_PLAN_CADENCE]),
  ]);
  assertGroupPlanStarted(plan);
  const terms = (["MONTHLY", "TERM_3", "TERM_6"] as PaymentPlanTerm[]).filter(isPlanTermOffered).map((term) => {
    const rate = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, term, pricing);
    return { term, label: describePaymentPlan(OFFERED_PLAN_CADENCE, term), cycles: rate.termMonths, amountCents: discountedPlanPriceCents(rate.installmentAmountCents, discountPercentForTerm(discount, term)) };
  });
  const current = plan?.reservedScheduleId && plan.reservedChunkIndex !== null ? { scheduleId: plan.reservedScheduleId, chunkIndex: plan.reservedChunkIndex } : null;
  const choices = free.map((s) => ({ scheduleId: s.scheduleId, chunkIndex: s.chunkIndex, dayOfWeek: s.dayOfWeek, startTime: s.startTime, label: s.label ?? "Class" }));
  if (current && !choices.some((c) => c.scheduleId === current.scheduleId && c.chunkIndex === current.chunkIndex)) {
    const schedule = await prisma.classSchedule.findUnique({ where: { id: current.scheduleId } });
    if (schedule) choices.unshift({ ...current, dayOfWeek: schedule.dayOfWeek, startTime: addMinutesToHHmm(schedule.startTime, chunksForSchedule(schedule)[current.chunkIndex]?.offsetMin ?? 0), label: schedule.label ?? "Class" });
  }
  const term = plan?.term ?? "TERM_6";
  const t = terms.find((x) => x.term === term) ?? terms[terms.length - 1];
  return {
    mode: plan ? "existing" : "new",
    studentName: user.name ?? user.email,
    term,
    termLabel: describePaymentPlan(OFFERED_PLAN_CADENCE, term),
    cycles: plan?.termMonths ?? t.cycles,
    installmentsPaid: plan?.installmentsPaid ?? 1,
    amountCents: plan?.installmentAmountCents ?? t.amountCents,
    currentStart: plan ? new Date(addBillingCycles(plan.nextDueDate, -plan.installmentsPaid).getTime()).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : null,
    slot: current,
    openPayment: plan ? (await prisma.zellePayment.count({ where: { paymentPlanId: plan.id, status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] } } })) > 0 : false,
    choices,
    terms,
  };
}

interface Resolved {
  plan: Awaited<ReturnType<typeof prisma.paymentPlan.findFirst>>;
  term: PaymentPlanTerm;
  cycles: number;
  installmentsPaid: number;
  schedule: Awaited<ReturnType<typeof loadSlot>>["schedule"];
  chunk: Awaited<ReturnType<typeof loadSlot>>["chunk"];
}

async function resolve(input: PlanBuilderInput): Promise<Resolved> {
  const plan = await prisma.paymentPlan.findFirst({ where: { userId: input.userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  assertGroupPlanStarted(plan);
  const { schedule, chunk } = await loadSlot(input.scheduleId, input.chunkIndex);
  const start = parseYmd(input.startDate);
  if (!start) throw new PaymentPlanError("Pick a real start date.");

  let term = input.term;
  let cycles: number;
  let installmentsPaid: number;
  if (plan) {
    term = plan.term;
    cycles = plan.termMonths;
    installmentsPaid = plan.installmentsPaid;
  } else {
    if (!isPlanTermOffered(term)) throw new PaymentPlanError("That plan length is not offered. Pick 1 Month, 3 Months or 6 Months.");
    cycles = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, term, await getPricingConfig()).termMonths;
    installmentsPaid = input.installmentsPaid;
    if (!Number.isInteger(installmentsPaid) || installmentsPaid < 1 || installmentsPaid > cycles) throw new PaymentPlanError(`Bills paid has to be from 1 to ${cycles}.`);
  }

  // The slot must be free, or already this plan's own.
  const own = plan && plan.reservedScheduleId === input.scheduleId && plan.reservedChunkIndex === input.chunkIndex;
  if (!own) {
    const free = await getReservableSlots(PLAN_CADENCE_CREDITS_PER_WEEK[OFFERED_PLAN_CADENCE]);
    if (!free.some((s) => s.scheduleId === input.scheduleId && s.chunkIndex === input.chunkIndex)) throw new PaymentPlanError("That weekly time is taken or has someone booked on it. Pick another.");
  }

  const today = todayEt();
  const end = new Date(start.getTime() + 28 * Math.max(1, installmentsPaid) * 86_400_000);
  if (input.taughtDates.length > 12) throw new PaymentPlanError("That is a lot of taught classes. Add them in smaller steps.");
  for (const d of input.taughtDates) {
    const date = parseYmd(d);
    if (!date) throw new PaymentPlanError(`"${d}" is not a real date.`);
    if (d > today) throw new PaymentPlanError("A taught class has to be in the past.");
    if (date < start || date >= end) throw new PaymentPlanError(`${d} is outside the paid cycles that start on ${input.startDate}.`);
  }
  if (new Set(input.taughtDates).size !== input.taughtDates.length) throw new PaymentPlanError("The same day is listed twice.");
  return { plan, term, cycles, installmentsPaid, schedule, chunk };
}

export interface PlanBuilderPreview {
  mode: "existing" | "new";
  timeline: PlanTimeline;
  nextBill: string | null;
  creditsGiven: number;
  /** Stored credits that will be spent now (taught days not already marked present). */
  creditsCharged: number;
  /** Taught days that are already marked present on file: nothing more is charged for them. */
  alreadyMarked: string[];
}

export async function previewPlanBuilder(input: PlanBuilderInput): Promise<PlanBuilderPreview> {
  const r = await resolve(input);
  const slotAt = (date: string) => computeScheduledAt(r.schedule, parseYmd(date)!, r.chunk);
  const timeline = buildPlanTimeline({ startDate: input.startDate, cycles: r.cycles, installmentsPaid: r.installmentsPaid, dayOfWeek: r.schedule.dayOfWeek, slotAt, taughtDates: input.taughtDates, now: new Date() });
  const perClass = PLAN_CADENCE_CREDITS_PER_WEEK[OFFERED_PLAN_CADENCE];
  const startInstant = etMidnight(input.startDate);
  const liveCycles = Array.from({ length: r.installmentsPaid }, (_, k) => addBillingCycles(startInstant, k + 1)).filter((end) => end.getTime() > Date.now()).length;
  const marked = input.taughtDates.length
    ? await prisma.classBooking.findMany({ where: { studentId: input.userId, status: "COMPLETED", occurrenceDate: { in: input.taughtDates.map((d) => parseYmd(d)!) } }, select: { occurrenceDate: true } })
    : [];
  const alreadyMarked = marked.map((b) => b.occurrenceDate.toISOString().slice(0, 10));
  const toCharge = input.taughtDates.filter((d) => !alreadyMarked.includes(d)).length;
  return { mode: r.plan ? "existing" : "new", timeline, nextBill: timeline.nextBill, creditsGiven: r.plan ? 0 : liveCycles * (perClass * 4), creditsCharged: input.chargeTaught ? toCharge * perClass : 0, alreadyMarked };
}

export interface PlanBuilderResult {
  planId: string;
  created: boolean;
  /** Stored credits spent by this run. */
  charged: number;
  /** Taught days that were already marked present, so nothing more was charged for them. */
  alreadyMarked: string[];
  balanceBefore: number;
  balanceAfter: number;
}

export async function applyPlanBuilder(adminId: string, input: PlanBuilderInput): Promise<PlanBuilderResult> {
  if (input.recordPayment) {
    const open = await prisma.paymentPlan.findFirst({ where: { userId: input.userId, status: "ACTIVE" }, select: { id: true } });
    if (open) await recordPlanPaymentReceived(open.id, adminId);
  }
  const r = await resolve(input);
  const balanceBefore = (await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { classCredits: true } })).classCredits;
  const alreadyMarked: string[] = [];
  const perClass = PLAN_CADENCE_CREDITS_PER_WEEK[OFFERED_PLAN_CADENCE];
  const startInstant = etMidnight(input.startDate);
  const nextDue = addBillingCycles(startInstant, r.installmentsPaid);
  const now = new Date();
  const charged: number[] = [];

  const planId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let id: string;
    if (r.plan) {
      id = r.plan.id;
      // Rebuilt from a day that has passed: classes run from now, so a later first class set by "Set up plan" no longer holds.
      await tx.paymentPlan.update({ where: { id }, data: { reservedScheduleId: input.scheduleId, reservedChunkIndex: input.chunkIndex, nextDueDate: nextDue, startsAt: null } });
      const grant = await tx.creditGrant.findFirst({ where: { userId: input.userId, paymentPlanId: id, source: "PAYMENT_PLAN_INSTALLMENT", expiredAt: null }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (grant) await tx.creditGrant.update({ where: { id: grant.id }, data: { expiresAt: nextDue } });
    } else {
      const pricing = await getPricingConfig();
      const rate = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, r.term, pricing);
      const amount = discountedPlanPriceCents(rate.installmentAmountCents, await getDiscountPercent(input.userId, r.term));
      const created = await tx.paymentPlan.create({
        data: {
          userId: input.userId,
          cadence: OFFERED_PLAN_CADENCE,
          term: r.term,
          installmentAmountCents: amount,
          creditsPerInstallment: rate.creditsPerInstallment,
          termMonths: rate.termMonths,
          installmentsPaid: r.installmentsPaid,
          nextDueDate: r.installmentsPaid >= rate.termMonths ? addBillingCycles(startInstant, rate.termMonths - 1) : nextDue,
          status: r.installmentsPaid >= rate.termMonths ? "COMPLETED" : "ACTIVE",
          reservedScheduleId: input.scheduleId,
          reservedChunkIndex: input.chunkIndex,
        },
      });
      id = created.id;
      for (let k = 1; k <= r.installmentsPaid; k++) {
        const cycleStart = addBillingCycles(startInstant, k - 1);
        const cycleEnd = addBillingCycles(startInstant, k);
        await tx.zellePayment.create({
          data: { userId: input.userId, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: id, installmentNumber: k, amountCents: amount, lessonQuantity: rate.creditsPerInstallment, zelleHandle: "Recorded by owner", status: "VERIFIED", submittedAt: cycleStart, reviewedAt: cycleStart, reviewedById: adminId, checkedAt: now },
        });
        // Only a cycle that is still running gives credits; one already over is history.
        if (cycleEnd.getTime() > now.getTime()) {
          await tx.creditGrant.create({ data: { userId: input.userId, source: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: id, creditsGranted: rate.creditsPerInstallment, creditsRemaining: rate.creditsPerInstallment, expiresAt: cycleEnd } });
          await tx.user.update({ where: { id: input.userId }, data: { classCredits: { increment: rate.creditsPerInstallment } } });
        }
      }
    }

    // Classes already taught: counted in the cycle, marked present, and charged.
    for (const d of input.taughtDates) {
      const occurrenceDate = parseYmd(d)!;
      const scheduledAt = computeScheduledAt(r.schedule, occurrenceDate, r.chunk);
      const existing = await tx.classBooking.findUnique({ where: { studentId_scheduleId_occurrenceDate: { studentId: input.userId, scheduleId: input.scheduleId, occurrenceDate } } });
      if (existing?.status === "COMPLETED") {
        alreadyMarked.push(d);
        continue;
      }
      const data = { status: "COMPLETED" as const, attendance: "PRESENT" as const, scheduledAt, creditsSpent: perClass, reservedByPlanId: id, refunded: false, canceledReason: null };
      if (existing) await tx.classBooking.update({ where: { id: existing.id }, data });
      else await tx.classBooking.create({ data: { studentId: input.userId, scheduleId: input.scheduleId, occurrenceDate, ...data } });
      if (input.chargeTaught) {
        await tx.user.update({ where: { id: input.userId }, data: { classCredits: { decrement: perClass } } });
        charged.push(perClass);
      }
    }

    // Re-lay the schedule from scratch. Future classes that were canceled earlier (by hand, while trying to fix this) would be
    // skipped by the booking job as "canceled on purpose", which is how whole weeks went missing: clear that, so every week of the
    // paid cycle is laid again. The old future weekly classes go next (no reason, so they are laid again too).
    await tx.classBooking.updateMany({ where: { studentId: input.userId, scheduleId: input.scheduleId, status: "CANCELED", scheduledAt: { gt: now }, canceledReason: { not: null } }, data: { canceledReason: null } });
    await tx.classBooking.updateMany({ where: { studentId: input.userId, reservedByPlanId: id, status: "SCHEDULED", scheduledAt: { gt: now } }, data: { status: "CANCELED", refunded: true, canceledReason: null } });
    return id;
  });

  for (const q of charged) await drawDownCredits(input.userId, q).catch(() => undefined);
  await bookReservedWindowForPlan(planId);
  await createNotification({
    userId: input.userId,
    type: "RESERVED_SLOT_CHANGED",
    title: "Your class schedule was set up",
    body: `The studio set up your weekly classes starting ${input.startDate}. Check Lessons for your schedule.`,
    emailCategory: "classes",
  }).catch(() => undefined);
  await logAudit({ actorId: adminId, action: "plan.build", targetType: "PaymentPlan", targetId: planId, detail: `${r.plan ? "re-anchored" : "created"} start ${input.startDate}, ${r.installmentsPaid} paid, ${input.taughtDates.length} taught` });
  const balanceAfter = (await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { classCredits: true } })).classCredits;
  return { planId, created: !r.plan, charged: charged.reduce((n, q) => n + q, 0), alreadyMarked, balanceBefore, balanceAfter };
}
