import type { ClassSchedule, PaymentPlan, PaymentPlanTerm, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBillingCycles } from "@/lib/billingCycle";
import {
  CLASS_MINUTES,
  calculatePaymentPlanRate,
  describePaymentPlan,
  discountedPlanPriceCents,
  discountPercentForTerm,
  isPlanTermOffered,
  OFFERED_PLAN_CADENCE,
  PLAN_CADENCE_CREDITS_PER_WEEK,
} from "@/lib/classCreditPricing";
import { chunksForSchedule, computeScheduledAt, etWallTimeToUtc, getReservableSlots, nextOccurrenceDates } from "@/lib/classSchedule";
import { addMinutesToHHmm } from "@/lib/classScheduleLabels";
import { PaymentPlanError, assertSlotReservable, bookReservedWindowForPlan, getOrCreateOpenInstallmentPayment } from "@/lib/paymentPlans";
import { isPausedNow } from "@/lib/planPause";
import { getPricingConfig } from "@/lib/pricing";
import { getPersonalDiscount } from "@/lib/accountDiscounts";
import { makeScholarshipCode } from "@/lib/scholarshipRules";
import { settleFreeBill } from "@/lib/freeBills";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { checkFirstClass, planSetupNotice, resolveScholarship, setupTerm, SETUP_MAX_WEEKS_AHEAD, weeksBetweenYmd, type ScholarshipChoice } from "@/lib/planSetupRules";

/**
 * "Set up plan" on the student page (owner only): one step that puts a student on a plan with a weekly time, a first class (today's
 * week or a later one) and, when they have one, a scholarship. It works from no plan, from a plan waiting for its first payment and
 * from a running plan. A full scholarship makes the 6 Month plan free: its $0 bills settle by themselves through the ordinary approval,
 * so the student is a regular subscriber who never pays. Nothing is booked before the first class (`PaymentPlan.startsAt`, read by
 * createReservedBookingIfAbsent), a running plan's next bill and credits move out by the weeks skipped, and the student gets one notice.
 * `previewPlanSetup` shows exactly what will happen first; `applyPlanSetup` does it.
 */

export interface PlanSetupInput {
  userId: string;
  scheduleId: string;
  chunkIndex: number;
  /** Eastern date of the first class, YYYY-MM-DD, on the weekly time's day. */
  firstClassDate: string;
  scholarship: ScholarshipChoice;
  /** The plan length when no scholarship applies (a scholarship always means 6 Months). */
  term: PaymentPlanTerm;
}

export interface PlanSetupSlot {
  key: string;
  scheduleId: string;
  chunkIndex: number;
  dayOfWeek: number;
  /** "Tuesday 4:00 PM to 4:45 PM". */
  label: string;
  /** The dates this time's class can start on: the next one that has not started, then each week up to SETUP_MAX_WEEKS_AHEAD. */
  dates: string[];
}

export interface PlanSetupContext {
  studentName: string;
  /** Why the tool cannot run for this account right now, or null. */
  blocked: string | null;
  plan: { term: PaymentPlanTerm; label: string; priceCents: number; installmentsPaid: number; termMonths: number; slotKey: string | null; firstClass: string | null } | null;
  scholarshipPercent: number;
  slots: PlanSetupSlot[];
  terms: { term: PaymentPlanTerm; label: string }[];
}

export interface PlanSetupPreview {
  mode: "new" | "waiting" | "running";
  planLabel: string;
  priceCents: number;
  scholarshipPercent: number;
  /** "Tuesday, November 17 at 4:00 PM". */
  firstClass: string;
  /** Eastern dates of the classes from the first class up to the next bill. */
  classDates: string[];
  /** Eastern date of the next bill, or null while the first bill is not paid yet. */
  nextBill: string | null;
  /** What will happen, one plain sentence each. */
  steps: string[];
}

export interface PlanSetupResult {
  planId: string;
  mode: PlanSetupPreview["mode"];
  priceCents: number;
  firstClass: string;
  /** The first bill was $0 and is settled, so the plan is running. */
  covered: boolean;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
/** A UTC-midnight stand-in date (the convention of classSchedule.ts) as YYYY-MM-DD. */
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const etYmd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const longDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const zelleHandle = () => process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
const SETUP_TERMS: PaymentPlanTerm[] = ["MONTHLY", "TERM_3", "TERM_6"];
const PLAN_NAME: Record<PaymentPlanTerm, string> = { MONTHLY: "1 Month plan", TERM_3: "3 Month plan", TERM_6: "6 Month plan", TERM_12: "Yearly plan" };

type Schedule = ClassSchedule;

function slotParts(schedule: Schedule, chunkIndex: number) {
  const chunk = chunksForSchedule(schedule)[chunkIndex];
  if (!chunk) return null;
  const start = addMinutesToHHmm(schedule.startTime, chunk.offsetMin);
  return { chunk, start, label: `${DAYS[schedule.dayOfWeek]} ${clock(start)} to ${clock(addMinutesToHHmm(start, CLASS_MINUTES))}` };
}

/** The next class of this weekly time that has not started yet (its Eastern date), and the weekly dates after it that can be picked. */
function upcomingDates(schedule: Schedule, chunk: NonNullable<ReturnType<typeof slotParts>>["chunk"], now: Date): string[] {
  const first = nextOccurrenceDates(schedule.dayOfWeek, 2).find((d) => computeScheduledAt(schedule, d, chunk).getTime() > now.getTime());
  if (!first) return [];
  return Array.from({ length: SETUP_MAX_WEEKS_AHEAD + 1 }, (_, k) => ymdOf(new Date(first.getTime() + k * WEEK)));
}

/** Why the tool cannot run for this account, or null. Checked again inside `applyPlanSetup`. */
function blockedReason(
  user: { role: string; bannedAt: Date | null; paymentLockedAt: Date | null },
  plan: Pick<PaymentPlan, "familyGroupId" | "pausedAt" | "pauseUntil"> | null,
  inReview: boolean,
): string | null {
  if (user.role === "ADMIN") return "An admin account does not have a plan.";
  if (user.bannedAt) return "This account is banned.";
  if (user.paymentLockedAt) return "This account is locked for non-payment. Lift the lock first (Account card).";
  if (plan?.familyGroupId) return "This person is on a group or parent plan. Move them onto their own plan first (Plan > Group).";
  if (plan && isPausedNow(plan, new Date())) return "This plan is paused. Resume it first, then set it up.";
  if (inReview) return "A payment for this plan is being reviewed. Settle it on Billing > Payments first.";
  return null;
}

async function loadAccount(userId: string) {
  const [user, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, bannedAt: true, paymentLockedAt: true } }),
    prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!user) throw new PaymentPlanError("That account was not found.");
  const inReview = plan ? Boolean(await prisma.zellePayment.findFirst({ where: { paymentPlanId: plan.id, status: "PENDING_REVIEW" }, select: { id: true } })) : false;
  return { user, plan, blocked: blockedReason(user, plan, inReview) };
}

export async function getPlanSetupContext(userId: string): Promise<PlanSetupContext> {
  const now = new Date();
  const { user, plan, blocked } = await loadAccount(userId);
  const perWeek = PLAN_CADENCE_CREDITS_PER_WEEK[OFFERED_PLAN_CADENCE];
  const [discount, free] = await Promise.all([getPersonalDiscount(userId), getReservableSlots(perWeek)]);
  const keys = free.map((s) => ({ scheduleId: s.scheduleId, chunkIndex: s.chunkIndex }));
  const current = plan?.reservedScheduleId && plan.reservedChunkIndex !== null ? { scheduleId: plan.reservedScheduleId, chunkIndex: plan.reservedChunkIndex } : null;
  if (current && !keys.some((k) => k.scheduleId === current.scheduleId && k.chunkIndex === current.chunkIndex)) keys.unshift(current);
  const schedules = new Map((await prisma.classSchedule.findMany({ where: { id: { in: [...new Set(keys.map((k) => k.scheduleId))] } } })).map((s) => [s.id, s]));
  const slots: PlanSetupSlot[] = [];
  for (const k of keys) {
    const schedule = schedules.get(k.scheduleId);
    const parts = schedule ? slotParts(schedule, k.chunkIndex) : null;
    if (!schedule || !parts || !schedule.active) continue;
    const dates = upcomingDates(schedule, parts.chunk, now);
    if (dates.length === 0) continue;
    slots.push({ key: `${k.scheduleId}:${k.chunkIndex}`, scheduleId: k.scheduleId, chunkIndex: k.chunkIndex, dayOfWeek: schedule.dayOfWeek, label: parts.label, dates });
  }
  slots.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.label.localeCompare(b.label));
  return {
    studentName: user.name ?? user.email,
    blocked,
    plan: plan
      ? {
          term: plan.term,
          label: describePaymentPlan(plan.cadence, plan.term),
          priceCents: plan.installmentAmountCents,
          installmentsPaid: plan.installmentsPaid,
          termMonths: plan.termMonths,
          slotKey: current ? `${current.scheduleId}:${current.chunkIndex}` : null,
          firstClass: plan.startsAt && plan.startsAt > now ? etYmd(plan.startsAt) : null,
        }
      : null,
    scholarshipPercent: discount.scholarshipPercent,
    slots,
    terms: SETUP_TERMS.filter(isPlanTermOffered).map((term) => ({ term, label: describePaymentPlan(OFFERED_PLAN_CADENCE, term) })),
  };
}

interface Resolved {
  user: { id: string; name: string | null; email: string };
  plan: PaymentPlan | null;
  mode: PlanSetupPreview["mode"];
  ownPlanIds: string[];
  schedule: Schedule;
  slotLabel: string;
  slotStart: string;
  firstClassAt: Date;
  startsAt: Date;
  /** Whole weeks a running plan's first class moves: later (positive) or earlier (negative) than it is now. */
  weeksMoved: number;
  scholarship: { percent: number; grant: number | null };
  term: PaymentPlanTerm;
  termMonths: number;
  creditsPerInstallment: number;
  priceCents: number;
  listAmountCents: number | null;
  priceChanged: boolean;
  termChanged: boolean;
  slotChanged: boolean;
  /** How far a running plan's next bill and credits move (0 for any other plan; negative when the first class moves earlier). */
  shiftMs: number;
}

async function resolve(input: PlanSetupInput): Promise<Resolved> {
  const now = new Date();
  const { user, plan, blocked } = await loadAccount(input.userId);
  if (blocked) throw new PaymentPlanError(blocked);

  // The weekly time: offered, long enough, and free (or already held by this person's own plan).
  const schedule = await prisma.classSchedule.findUnique({ where: { id: input.scheduleId } });
  if (!schedule || !schedule.active) throw new PaymentPlanError("That class time is not offered.");
  const parts = slotParts(schedule, input.chunkIndex);
  if (!parts) throw new PaymentPlanError("That time slot does not exist.");
  const perWeek = PLAN_CADENCE_CREDITS_PER_WEEK[OFFERED_PLAN_CADENCE];
  if (parts.chunk.creditCost < perWeek) throw new PaymentPlanError("That time slot is too short for a weekly class.");
  const ownPlans = await prisma.paymentPlan.findMany({ where: { userId: user.id, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true, reservedScheduleId: true, reservedChunkIndex: true } });
  const own = ownPlans.some((p) => p.reservedScheduleId === input.scheduleId && p.reservedChunkIndex === input.chunkIndex);
  if (!own) {
    const free = await getReservableSlots(perWeek);
    if (!free.some((s) => s.scheduleId === input.scheduleId && s.chunkIndex === input.chunkIndex)) throw new PaymentPlanError("That weekly time is taken or has someone booked on it. Pick another.");
  }

  // The first class: that weekday, not already started, within the weeks the tool allows.
  const next = upcomingDates(schedule, parts.chunk, now)[0];
  if (!next) throw new PaymentPlanError("That weekly time has no class coming up.");
  const checked = checkFirstClass({ firstClassYmd: input.firstClassDate, dayOfWeek: schedule.dayOfWeek, nextClassYmd: next });
  if ("error" in checked) throw new PaymentPlanError(checked.error);
  // A running plan moves by the weeks between its first class as it stands (the next class, or a later first class an earlier setup
  // chose) and the new one, so setting up the same first class again moves nothing, and an earlier one moves the dates back.
  let currentFirst = next;
  if (plan && plan.installmentsPaid > 0 && plan.startsAt && plan.startsAt > now) {
    let t = Date.parse(`${next}T00:00:00Z`);
    for (let i = 0; i < 60 && computeScheduledAt(schedule, new Date(t), parts.chunk) < plan.startsAt; i++) t += WEEK;
    currentFirst = ymdOf(new Date(t));
  }
  const weeksMoved = weeksBetweenYmd(currentFirst, input.firstClassDate);
  const [y, m, d] = input.firstClassDate.split("-").map(Number);
  const firstClassAt = computeScheduledAt(schedule, new Date(Date.UTC(y, m - 1, d)), parts.chunk);
  const startsAt = etWallTimeToUtc(y, m, d, 0, 0);

  // The scholarship and the plan length it needs.
  const discount = await getPersonalDiscount(user.id);
  const scholarship = resolveScholarship(discount.scholarshipPercent, input.scholarship);
  if ("error" in scholarship) throw new PaymentPlanError(scholarship.error);
  const term = setupTerm(scholarship.percent, input.term) as PaymentPlanTerm;
  if (!isPlanTermOffered(term)) throw new PaymentPlanError("Pick 1 Month, 3 Months or 6 Months.");
  const rate = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, term, await getPricingConfig());
  const termChanged = Boolean(plan && plan.term !== term);
  if (plan && termChanged && plan.installmentsPaid >= rate.termMonths) {
    throw new PaymentPlanError(`${plan.installmentsPaid} bills are already paid, so a ${describePaymentPlan(OFFERED_PLAN_CADENCE, term)} would be over. Pick a longer length.`);
  }

  // The price. A plan keeps the price it signed up at unless its length or scholarship changes here; then it is priced like a plan
  // change (the length's own price for a new length, the plan's own price before discounts otherwise), with the best discount applied.
  const percent = discountPercentForTerm({ percent: discount.percent, scholarshipPercent: scholarship.percent }, term);
  let priceCents: number;
  let listAmountCents: number | null;
  if (plan && !termChanged && scholarship.grant === null) {
    priceCents = plan.installmentAmountCents;
    listAmountCents = plan.listAmountCents;
  } else {
    const base = plan && !termChanged ? (plan.listAmountCents ?? plan.installmentAmountCents) : rate.installmentAmountCents;
    priceCents = discountedPlanPriceCents(base, percent);
    listAmountCents = percent > 0 ? base : null;
  }

  const mode: PlanSetupPreview["mode"] = !plan ? "new" : plan.installmentsPaid === 0 ? "waiting" : "running";
  return {
    user: { id: user.id, name: user.name, email: user.email },
    plan,
    mode,
    ownPlanIds: ownPlans.map((p) => p.id),
    schedule,
    slotLabel: parts.label,
    slotStart: parts.start,
    firstClassAt,
    startsAt,
    weeksMoved,
    scholarship,
    term,
    termMonths: plan && !termChanged ? plan.termMonths : rate.termMonths,
    creditsPerInstallment: plan?.creditsPerInstallment ?? rate.creditsPerInstallment,
    priceCents,
    listAmountCents,
    priceChanged: Boolean(plan && priceCents !== plan.installmentAmountCents),
    termChanged,
    slotChanged: Boolean(plan && (plan.reservedScheduleId !== input.scheduleId || plan.reservedChunkIndex !== input.chunkIndex)),
    shiftMs: mode === "running" ? weeksMoved * WEEK : 0,
  };
}

/** When the next bill falls once this is applied: null while the first bill is still to be paid. */
function nextBillOf(r: Resolved): Date | null {
  if (r.mode === "running") return new Date(r.plan!.nextDueDate.getTime() + r.shiftMs);
  return r.priceCents === 0 ? addBillingCycles(r.startsAt, 1) : null;
}

export async function previewPlanSetup(input: PlanSetupInput): Promise<PlanSetupPreview> {
  const r = await resolve(input);
  const now = new Date();
  const nextBill = nextBillOf(r);
  // The classes from the first one up to the next bill (a new plan's first cycle when it is not paid yet).
  const until = nextBill ?? addBillingCycles(r.startsAt, 1);
  const classDates: string[] = [];
  for (let k = 0; k < 6; k++) {
    const at = new Date(r.firstClassAt.getTime() + k * WEEK);
    if (at >= until) break;
    classDates.push(etYmd(at));
  }
  const canceled = r.plan
    ? await prisma.classBooking.count({ where: { reservedByPlanId: r.plan.id, status: "SCHEDULED", scheduledAt: { gt: now, lt: r.startsAt } } })
    : 0;

  const planLabel = describePaymentPlan(OFFERED_PLAN_CADENCE, r.term);
  const price = r.priceCents === 0 ? "$0.00 (covered)" : `${usd(r.priceCents)} every 28 days`;
  const steps: string[] = [];
  if (r.scholarship.grant !== null) steps.push(`Gives a ${r.scholarship.grant}% scholarship. No code to claim.`);
  else if (r.scholarship.percent > 0) steps.push(`Keeps the ${r.scholarship.percent}% scholarship already claimed.`);
  const name = PLAN_NAME[r.term];
  if (r.mode === "new") steps.push(`Starts the ${name}: ${price}.`);
  else if (r.termChanged) steps.push(`Changes the plan to the ${name}: ${price}. ${r.plan!.installmentsPaid} of ${r.termMonths} bills stay paid.`);
  else if (r.priceChanged) steps.push(`Changes the price to ${price}.`);
  else steps.push(`Keeps the ${name} at ${price}.`);
  steps.push(r.slotChanged || r.mode === "new" ? `Weekly class: ${r.slotLabel}.` : `Weekly class stays ${r.slotLabel}.`);
  steps.push(`First class ${longDate(input.firstClassDate)} at ${clock(r.slotStart)}. Nothing is booked before it.`);
  if (canceled > 0) steps.push(`Cancels ${canceled} class${canceled === 1 ? "" : "es"} booked before then. No credit is used.`);
  const weeks = (n: number) => `${n} week${n === 1 ? "" : "s"}`;
  if (r.shiftMs > 0) steps.push(`Moves the next bill and the credits' expiry out by ${weeks(r.weeksMoved)}, so no paid class is lost.`);
  if (r.shiftMs < 0) steps.push(`Moves the next bill and the credits' expiry ${weeks(-r.weeksMoved)} earlier, with the classes.`);
  if (r.priceCents === 0) steps.push("Nothing to pay: each 28-day bill is covered and settles by itself, like a paid one.");
  else if (r.mode !== "running") steps.push(`Sends the first bill (${usd(r.priceCents)}). The 28 days start on the first class once it is paid.`);

  return {
    mode: r.mode,
    planLabel,
    priceCents: r.priceCents,
    scholarshipPercent: r.scholarship.percent,
    firstClass: `${longDate(input.firstClassDate)} at ${clock(r.slotStart)}`,
    classDates,
    nextBill: nextBill ? etYmd(nextBill) : null,
    steps,
  };
}

async function freshScholarshipCode(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeScholarshipCode();
    if (!(await tx.scholarshipCode.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new PaymentPlanError("Could not make a scholarship. Try again.");
}

export async function applyPlanSetup(adminId: string, input: PlanSetupInput): Promise<PlanSetupResult> {
  const r = await resolve(input);
  const now = new Date();
  const userId = r.user.id;
  const perWeek = PLAN_CADENCE_CREDITS_PER_WEEK[OFFERED_PLAN_CADENCE];
  let firstBillId: string | null = null;

  let planId: string;
  try {
    planId = await prisma.$transaction(
      async (tx) => {
        await assertSlotReservable(tx, input.scheduleId, input.chunkIndex, perWeek, [userId], r.ownPlanIds);

        // A scholarship the studio gives: recorded like a claimed code (the account's own email, claimed now), so every place that
        // reads scholarships, and ending it on Billing > Scholarships, works the same.
        if (r.scholarship.grant !== null) {
          await tx.scholarshipCode.create({
            data: { code: await freshScholarshipCode(tx), assignedEmail: r.user.email.toLowerCase(), percent: r.scholarship.grant, note: "Given by the studio (Set up plan)", createdById: adminId, claimedAt: now, claimedById: userId },
          });
        }

        if (!r.plan) {
          if (await tx.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } })) throw new PaymentPlanError("This account just got a plan. Refresh and try again.");
          const created = await tx.paymentPlan.create({
            data: {
              userId,
              cadence: OFFERED_PLAN_CADENCE,
              term: r.term,
              installmentAmountCents: r.priceCents,
              listAmountCents: r.listAmountCents,
              creditsPerInstallment: r.creditsPerInstallment,
              termMonths: r.termMonths,
              nextDueDate: now,
              startsAt: r.startsAt,
              reservedScheduleId: input.scheduleId,
              reservedChunkIndex: input.chunkIndex,
              installmentPayments: {
                create: [{ userId, purpose: "PAYMENT_PLAN_INSTALLMENT", amountCents: r.priceCents, zelleHandle: zelleHandle(), lessonQuantity: r.creditsPerInstallment, installmentNumber: 1, status: "AWAITING_TRANSFER" }],
              },
            },
            include: { installmentPayments: { select: { id: true } } },
          });
          firstBillId = created.installmentPayments[0].id;
          // Practice and class reminders are on for everyone who subscribes (the owner's rule), the same as createPaymentPlan.
          await tx.user.update({ where: { id: userId }, data: { notifyEmailReminders: true } });
          return created.id;
        }

        const plan = r.plan;
        // Only the plan as it was when the preview was made: a payment approved in between moves the date or the count.
        const done = await tx.paymentPlan.updateMany({
          where: { id: plan.id, status: "ACTIVE", nextDueDate: plan.nextDueDate, installmentsPaid: plan.installmentsPaid, familyGroupId: null },
          data: {
            term: r.term,
            termMonths: r.termMonths,
            installmentAmountCents: r.priceCents,
            listAmountCents: r.listAmountCents,
            reservedScheduleId: input.scheduleId,
            reservedChunkIndex: input.chunkIndex,
            startsAt: r.startsAt,
            ...(r.shiftMs !== 0 ? { nextDueDate: new Date(plan.nextDueDate.getTime() + r.shiftMs) } : {}),
          },
        });
        if (done.count !== 1) throw new PaymentPlanError("This plan just changed. Refresh and try again.");
        if (await tx.zellePayment.findFirst({ where: { paymentPlanId: plan.id, status: "PENDING_REVIEW" }, select: { id: true } })) {
          throw new PaymentPlanError("A payment for this plan is being reviewed. Settle it on Billing > Payments first.");
        }

        // A bill nobody has sent yet is closed when its amount or its date moved; a fresh one is made at the new price and time.
        if (r.priceChanged || r.shiftMs !== 0) await tx.zellePayment.updateMany({ where: { paymentPlanId: plan.id, status: "AWAITING_TRANSFER" }, data: { status: "EXPIRED" } });

        if (r.mode === "waiting") {
          const open = await tx.zellePayment.findFirst({ where: { paymentPlanId: plan.id, status: "AWAITING_TRANSFER" }, orderBy: { createdAt: "desc" }, select: { id: true } });
          firstBillId =
            open?.id ??
            (
              await tx.zellePayment.create({
                data: { userId, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, amountCents: r.priceCents, zelleHandle: zelleHandle(), lessonQuantity: plan.creditsPerInstallment, installmentNumber: 1, status: "AWAITING_TRANSFER" },
                select: { id: true },
              })
            ).id;
        } else {
          // Running: the credits' expiry moves with the bill (the only other place this happens is a pause), and every upcoming class
          // of the plan is cleared to be laid again from the first class at the weekly time. No reason is written, so they can be
          // booked again; the plan's first class is what keeps the weeks before it empty.
          if (r.shiftMs !== 0) {
            const grants = await tx.creditGrant.findMany({ where: { paymentPlanId: plan.id, expiredAt: null, creditsRemaining: { gt: 0 }, expiresAt: { gt: now } }, select: { id: true, expiresAt: true } });
            for (const g of grants) await tx.creditGrant.update({ where: { id: g.id }, data: { expiresAt: new Date(g.expiresAt!.getTime() + r.shiftMs), expiringSoonNotifiedAt: null } });
          }
          await tx.classBooking.updateMany({ where: { reservedByPlanId: plan.id, status: "SCHEDULED", scheduledAt: { gt: now } }, data: { status: "CANCELED", refunded: true, canceledReason: null } });
        }
        return plan.id;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2034") throw new PaymentPlanError("Something changed at the same moment. Try again.");
    throw err;
  }

  if (r.scholarship.grant !== null) {
    await logAudit({ actorId: adminId, action: "scholarship.grant", targetType: "User", targetId: userId, detail: `${r.scholarship.grant}% off the 6 Month plan for ${r.user.email}, given with Set up plan` }).catch(() => undefined);
  }
  await logAudit({
    actorId: adminId,
    action: "plan.setup",
    targetType: "PaymentPlan",
    targetId: planId,
    detail: `${r.mode === "new" ? "Started" : "Set up"} ${describePaymentPlan(OFFERED_PLAN_CADENCE, r.term)} at ${usd(r.priceCents)}, ${r.slotLabel}, first class ${input.firstClassDate}${r.shiftMs !== 0 ? `, dates moved ${r.weeksMoved} week(s)` : ""}`,
  }).catch(() => undefined);

  // A $0 first bill settles now through the ordinary approval (credits, the plan's progress, its first cycle from the first class,
  // the weekly classes). Quiet: the one notice below says it all. A running plan's covered bill that is due settles the usual way.
  let covered = false;
  if (firstBillId && r.priceCents === 0) covered = await settleFreeBill(firstBillId, { quiet: true });
  else if (r.mode === "running" && r.priceCents === 0) await getOrCreateOpenInstallmentPayment(planId, zelleHandle()).catch(() => undefined);
  await bookReservedWindowForPlan(planId);

  const started = r.mode === "running" || covered;
  const firstClassLabel = longDate(input.firstClassDate);
  const notice = planSetupNotice({ weekday: DAYS[r.schedule.dayOfWeek], time: clock(r.slotStart), firstClassLabel, priceCents: r.priceCents, started, scholarshipPercent: r.scholarship.percent });
  await createNotification(
    started
      ? { userId, type: "RESERVED_SLOT_CHANGED", title: notice.title, body: notice.body, emailCategory: "classes", cta: { label: "See your classes", path: "/lessons" } }
      : { userId, type: "PAYMENT_PLAN_UPDATED", title: notice.title, body: notice.body, emailCategory: "payments", cta: { label: "Pay the first bill", path: "/billing/plans" } },
  ).catch((err) => console.error("Plan setup notice failed (non-blocking):", err));

  return { planId, mode: r.mode, priceCents: r.priceCents, firstClass: `${firstClassLabel} at ${clock(r.slotStart)}`, covered };
}
