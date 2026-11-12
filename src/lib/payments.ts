import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { rewardReferralForFirstPayment } from "@/lib/referrals";
import { noticePaymentReceived } from "@/lib/studentNotices";
import { getAdminRecipients, notifyAdmins } from "@/lib/adminNotifications";
import { settleWithStoredReceipt } from "@/lib/paymentEmail";
import { PaymentPlanCadence, PaymentPlanTerm, type PaymentPurpose, type Prisma, type ZellePaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AccessDeniedError, unlockScaleForUser, grantCurriculumAccess } from "@/lib/access";
import { grantCredits } from "@/lib/creditLedger";
import { bookExtraSessionOccurrence, chunksForSchedule, computeScheduledAt, nextOccurrenceDates, OCCURRENCES_PER_SLOT } from "@/lib/classSchedule";
import {
  calculateClassCreditTotal,
  calculateFamilyBundleTotal,
  isPlanTermOffered,
  isPlanCadenceOffered,
  EXTRA_CLASS_PRICE_CENTS,
  CREDITS_PER_CLASS,
  MIN_FAMILY_BUNDLE_RECIPIENTS,
  describePaymentPlan,
} from "@/lib/classCreditPricing";
import { addBillingCycles } from "@/lib/billingCycle";
import { bookReservedWindowForPlan, describeReservedSlot, fifthClassReceiptNote, getFifthClassOffer } from "@/lib/paymentPlans";
import { createNotification } from "@/lib/notifications";
import { sendPaymentReceipt } from "@/lib/paymentReceipt";
import { groupBillPath, payAgainPath, receiptPath } from "@/lib/inPlaceLinks";
import { reportError } from "@/lib/reportError";
import { logAudit } from "@/lib/audit";
import { adjustUserCredits } from "@/lib/creditAdjustments";
import { assertRateLimit } from "@/lib/rateLimit";
import { getPricingConfig } from "@/lib/pricing";
import { afterScholarshipRenewal, planContinuesOnScholarship } from "@/lib/scholarshipPlans";
import { coveredBillNotice, SCHOLARSHIP_RENEWAL_CYCLES } from "@/lib/scholarshipWording";

/**
 * A student who opens the payment modal but never actually confirms a
 * transfer leaves an AWAITING_TRANSFER row behind forever otherwise,
 * cluttering their own billing page and, at larger scale, the DB. Anything
 * this old with no reference code submitted is safe to consider abandoned.
 * Deliberately does NOT touch PENDING_REVIEW, once a student has submitted
 * a reference code, a slow admin shouldn't cause their payment to vanish.
 */
const PENDING_PAYMENT_EXPIRY_DAYS = 7;

/**
 * Lazily sweeps stale AWAITING_TRANSFER rows to EXPIRED. There's no cron
 * here, this runs inline wherever it matters (before creating/reusing a
 * pending payment, before listing payments for admin) so the expiry is
 * always accurate by the time anything reads it, without needing a
 * scheduled job.
 */
async function expireStalePendingPayments() {
  const cutoff = new Date(Date.now() - PENDING_PAYMENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await prisma.zellePayment.updateMany({
    // Excludes PAYMENT_PLAN_INSTALLMENT on purpose: EXPIRED is a dead end
    // (submitZellePaymentReference only accepts resubmission from
    // AWAITING_TRANSFER/REJECTED), and an installment left unpaid past its
    // due date is exactly the "overdue, keep reminding, let a human decide"
    // case this app's payment-plan reminders are built around, not
    // something that should silently become unpayable the next time anyone
    // loads a billing page.
    where: { status: "AWAITING_TRANSFER", createdAt: { lt: cutoff }, purpose: { notIn: ["PAYMENT_PLAN_INSTALLMENT", "FAMILY_PLAN_START", "FAMILY_PLAN_INSTALLMENT"] } },
    data: { status: "EXPIRED" },
  });
}

interface PendingPaymentParams {
  userId: string;
  purpose: "CURRICULUM" | "CLASS_CREDITS";
  amountCents: number;
  zelleHandle: string;
  /** Only meaningful for CLASS_CREDITS, how many credits this row grants once verified. */
  lessonQuantity?: number;
}

/**
 * Finds the in-flight Zelle payment for this user+purpose if one exists, or
 * creates a fresh AWAITING_TRANSFER row. Idempotent by design, the
 * curriculum billing page calls this on every load, and a page refresh
 * shouldn't spawn a new row every time a student revisits before submitting
 * a reference code.
 *
 * CURRICULUM and CLASS_CREDITS both go through this. FAMILY_BUNDLE and
 * PAYMENT_PLAN_INSTALLMENT have their own, non-idempotent creation paths for
 * reasons specific to each (see createFamilyBundlePayment and
 * getOrCreateOpenInstallmentPayment), so this was never their shared helper
 * to begin with. CLASS_CREDITS's own old *a-la-carte, buy-any-quantity*
 * purchase page was removed once Payment Plans covered every solo case, but
 * the purpose itself lives on for historical rows and Family Bundle credits.
 * (The Schedule screen's flat-rate extra-session purchase was removed too;
 * only the verification of any such payment already in flight remains below.)
 */
async function getOrCreatePendingZellePayment({ userId, purpose, amountCents, zelleHandle, lessonQuantity }: PendingPaymentParams) {
  await expireStalePendingPayments();

  const existing = await prisma.zellePayment.findFirst({
    where: { userId, purpose, status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] } },
    orderBy: { createdAt: "desc" },
  });
  // A reused row can predate a price change for this purpose (e.g. the
  // curriculum price dropping from $99 to $69.99), the billing page always
  // displays the caller's freshly-computed amountCents, so keep the stored
  // row in sync rather than letting it quietly settle at a stale price the
  // admin queue and payment history would then show instead.
  if (existing) {
    if (existing.amountCents !== amountCents) {
      return prisma.zellePayment.update({ where: { id: existing.id }, data: { amountCents } });
    }
    return existing;
  }

  return prisma.zellePayment.create({
    data: { userId, purpose, amountCents, zelleHandle, lessonQuantity, status: "AWAITING_TRANSFER" },
  });
}

export class ExtraCreditsError extends Error {}

/**
 * The optional fifth class for a MONTHLY subscriber (see getFifthClassOffer): one payment at the owner's price for the last
 * class of a five-weekday cycle. The offer is worked out from the plan here, never from what the browser sends. Paying and
 * approving it books the class through the same extra-session path (credit granted and spent in one step). Asking again
 * before paying returns the same open payment.
 */
export async function createFifthClassPayment(userId: string, zelleHandle: string) {
  await expireStalePendingPayments();
  const offer = await getFifthClassOffer(userId);
  if (!offer) throw new ExtraCreditsError("There is no fifth class to add right now.");
  const existing = await prisma.zellePayment.findFirst({
    where: {
      userId,
      purpose: "CLASS_CREDITS",
      extraSessionScheduleId: offer.scheduleId,
      extraSessionOccurrenceDate: offer.occurrenceDate,
      extraSessionScheduledAt: offer.scheduledAt,
      status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return prisma.zellePayment.create({
    data: {
      userId,
      purpose: "CLASS_CREDITS",
      amountCents: offer.priceCents,
      zelleHandle,
      lessonQuantity: CREDITS_PER_CLASS,
      extraSessionScheduleId: offer.scheduleId,
      extraSessionOccurrenceDate: offer.occurrenceDate,
      extraSessionScheduledAt: offer.scheduledAt,
      status: "AWAITING_TRANSFER",
    },
  });
}

/**
 * One extra class paid for directly: the student picks a specific open time and
 * pays a flat $55 for it by Zelle. The row carries that exact time
 * (extraSession* columns) and the 2 credits it is worth; approving the payment
 * grants those credits and books the time with them in the same step (see
 * approveZellePayment), so credits are only ever the mechanism underneath, never
 * something a student buys on its own. Asking again for the same time before
 * paying returns the same open payment.
 */
export async function createExtraClassPayment(
  userId: string,
  scheduleId: string,
  occurrenceDateMs: number,
  chunkIndex: number,
  zelleHandle: string,
) {
  await expireStalePendingPayments();

  const schedule = await prisma.classSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || !schedule.active) throw new ExtraCreditsError("That class time isn't offered.");
  const chunk = chunksForSchedule(schedule)[chunkIndex];
  if (!chunk) throw new ExtraCreditsError("That time slot doesn't exist.");

  const occurrenceDate = new Date(occurrenceDateMs);
  const isOpenDate = nextOccurrenceDates(schedule.dayOfWeek, OCCURRENCES_PER_SLOT).some((d) => d.getTime() === occurrenceDate.getTime());
  if (!isOpenDate) throw new ExtraCreditsError("That day isn't open for booking.");
  const scheduledAt = computeScheduledAt(schedule, occurrenceDate, chunk);
  if (scheduledAt.getTime() <= Date.now()) throw new ExtraCreditsError("That time has already started.");

  const taken = await prisma.classBooking.findFirst({
    where: { scheduleId, occurrenceDate, scheduledAt, status: "SCHEDULED" },
    select: { id: true },
  });
  if (taken) throw new ExtraCreditsError("That time was just taken.");

  const sameDay = await prisma.classBooking.findFirst({
    where: { studentId: userId, occurrenceDate, status: "SCHEDULED" },
    select: { id: true },
  });
  if (sameDay) throw new ExtraCreditsError("You already have a class that day.");

  const existing = await prisma.zellePayment.findFirst({
    where: {
      userId,
      purpose: "CLASS_CREDITS",
      extraSessionScheduleId: scheduleId,
      extraSessionOccurrenceDate: occurrenceDate,
      extraSessionScheduledAt: scheduledAt,
      status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return prisma.zellePayment.create({
    data: {
      userId,
      purpose: "CLASS_CREDITS",
      amountCents: (await getPricingConfig()).extraClassCents,
      zelleHandle,
      lessonQuantity: CREDITS_PER_CLASS,
      extraSessionScheduleId: scheduleId,
      extraSessionOccurrenceDate: occurrenceDate,
      extraSessionScheduledAt: scheduledAt,
      status: "AWAITING_TRANSFER",
    },
  });
}

// ---------------------------------------------------------------------------
// Family bundle: the same cadence + term ladder Payment Plans use, bought
// at once for 2+ separate, already-existing accounts (a parent buying the
// same term for each of her kids' own accounts, say), an extra 10% off the
// combined total. The entire point of this section is that "2+ real
// accounts" is *verified*,
// not just asserted. Someone could otherwise get the extra discount by
// typing in fabricated-looking or duplicate addresses and never actually
// sharing credits with anyone.
// ---------------------------------------------------------------------------

export class FamilyBundleError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FamilyBundleRecipientCheck {
  email: string;
  found: boolean;
  /** Only set when found. Lets the buyer visually confirm "yes, that's my kid's account" for an email they themselves just typed, not a stranger's private data. */
  name: string | null;
}

/**
 * Live, side-effect-free (beyond its own rate-limit ledger) lookup used
 * while the buyer is still filling in the family bundle form, so a typo in
 * one email can be caught and fixed before submitting, rather than the
 * whole purchase just failing at the end with no indication which address
 * was the problem.
 *
 * Deliberately reveals account existence per email to the caller. See the
 * FamilyBundleCheckAttempt model's own doc comment in schema.prisma for why
 * that trade-off is made instead of hiding it, and what actually bounds it
 * (a real signed-in session, plus this rate limit; not "nobody can ever
 * tell").
 */
export async function checkFamilyBundleRecipients(callerId: string, emails: string[]): Promise<FamilyBundleRecipientCheck[]> {
  await assertRateLimit(
    prisma.familyBundleCheckAttempt.count,
    { userId: callerId },
    { windowMinutes: 10, max: 30, message: "Too many account checks. Please wait a few minutes and try again." },
  );
  await prisma.familyBundleCheckAttempt.create({ data: { userId: callerId } });

  const normalized = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { email: { in: normalized } },
    select: { email: true, name: true },
  });
  const byEmail = new Map(users.map((u) => [u.email, u.name]));

  return normalized.map((email) => ({ email, found: byEmail.has(email), name: byEmail.get(email) ?? null }));
}

export interface FamilyBundlePurchaseInput {
  buyerId: string;
  cadence: PaymentPlanCadence;
  term: PaymentPlanTerm;
  recipientEmails: string[];
  zelleHandle: string;
}

/**
 * Creates the AWAITING_TRANSFER payment for a family bundle, after
 * re-verifying every recipient server-side. Never trusts whatever the
 * client's own live-check UI showed, since that's just UX, not the actual
 * authorization boundary. Not idempotent the way getOrCreatePendingZellePayment
 * is (a repeat visit always creates a fresh row): matching an "identical"
 * prior attempt would mean comparing cadence + term + the exact set of
 * recipient emails, which isn't worth the complexity for what should be a
 * rare, deliberate purchase. An abandoned row still self-expires via
 * expireStalePendingPayments() like every other pending payment does.
 */
export async function createFamilyBundlePayment(input: FamilyBundlePurchaseInput) {
  // A Server Action's params are only compile-time-typed, same reasoning
  // createPaymentPlan validates cadence/term for in paymentPlans.ts.
  if (!Object.values(PaymentPlanCadence).includes(input.cadence)) {
    throw new FamilyBundleError(`"${input.cadence}" isn't a valid cadence.`);
  }
  if (!Object.values(PaymentPlanTerm).includes(input.term)) {
    throw new FamilyBundleError(`"${input.term}" isn't a valid term.`);
  }
  if (!isPlanCadenceOffered(input.cadence)) {
    throw new FamilyBundleError("That weekly length isn't offered anymore. Classes are 45 minutes a week.");
  }
  if (!isPlanTermOffered(input.term)) {
    throw new FamilyBundleError("That plan length is no longer offered. Pick 1 Month, 3 Months, or 6 Months.");
  }

  const normalized = input.recipientEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);

  if (normalized.length < MIN_FAMILY_BUNDLE_RECIPIENTS) {
    throw new FamilyBundleError(`A family bundle needs at least ${MIN_FAMILY_BUNDLE_RECIPIENTS} recipient accounts.`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new FamilyBundleError("Each recipient needs a different email. The same account can't be entered twice.");
  }
  for (const email of normalized) {
    if (!EMAIL_RE.test(email)) throw new FamilyBundleError(`"${email}" isn't a valid email address.`);
  }

  const users = await prisma.user.findMany({ where: { email: { in: normalized } }, select: { id: true, email: true } });
  const byEmail = new Map(users.map((u) => [u.email, u.id]));

  const missing = normalized.filter((email) => !byEmail.has(email));
  if (missing.length > 0) {
    throw new FamilyBundleError(
      `These emails don't have a Bass Note Piano account yet. Everyone needs to register before you can bundle their credits: ${missing.join(", ")}`,
    );
  }

  const recipientUserIds = normalized.map((email) => byEmail.get(email)!);
  // Distinct-looking email strings resolving to the same account shouldn't
  // be possible (email is @unique), but this is the actual check that
  // matters, not just "the strings typed in looked different."
  if (new Set(recipientUserIds).size !== recipientUserIds.length) {
    throw new FamilyBundleError("Each recipient needs to be a different account.");
  }

  const { totalCents, creditsPerRecipient } = calculateFamilyBundleTotal(input.cadence, input.term, normalized.length, await getPricingConfig());

  await expireStalePendingPayments();

  return prisma.zellePayment.create({
    data: {
      userId: input.buyerId,
      purpose: "FAMILY_BUNDLE",
      amountCents: totalCents,
      zelleHandle: input.zelleHandle,
      // The per-recipient credit count, for display parity with how
      // CLASS_CREDITS stores lessonQuantity. The combined credit count
      // across everyone is recipientUserIds.length × this, not this alone.
      lessonQuantity: creditsPerRecipient,
      status: "AWAITING_TRANSFER",
      familyBundleRecipients: {
        create: recipientUserIds.map((userId) => ({ userId, creditsGranted: creditsPerRecipient })),
      },
    },
  });
}

export interface ZelleReferenceSubmission {
  senderName: string;
  note?: string;
  method?: "ZELLE";
}

/**
 * Records the student's "I've sent it" confirmation and moves the payment
 * into PENDING_REVIEW. Allowed from AWAITING_TRANSFER (first submission) or
 * REJECTED (resubmission after a failed match), anything else means the
 * payment is already settled or mid-review, so resubmitting is rejected.
 *
 * No reference/confirmation code is collected here on purpose, by direct
 * instruction: it was a free-text field nothing actually validated against
 * Zelle, so it just as easily could've been a made-up string typed to look
 * like proof of a payment that never happened. Every submission is checked
 * by hand against the real Zelle activity for this account regardless of
 * what (if anything) a student types, so the field added a step without
 * adding real verification.
 */
export async function submitZellePaymentReference(
  userId: string,
  paymentId: string,
  input: ZelleReferenceSubmission,
) {
  const payment = await prisma.zellePayment.findUniqueOrThrow({ where: { id: paymentId } });
  // A bill held inside a group's combined bill is never paid on its own: the payer pays the combined bill.
  if (payment.bundleId) throw new AccessDeniedError(`Payment ${paymentId} is part of a combined group bill`);
  // A member of a group (a child, or anyone the payer pays for) never pays a bill: only the group's payer does.
  if (payment.userId === userId && payment.paymentPlanId) {
    const notPayer = await prisma.paymentPlan.findFirst({ where: { id: payment.paymentPlanId, familyGroupId: { not: null }, familyGroup: { payerId: { not: userId } } }, select: { id: true } });
    if (notPayer) throw new AccessDeniedError(`Payment ${paymentId} is paid by the group's payer`);
  }
  if (payment.userId !== userId) {
    // A family plan member's monthly bill is paid by the family's one payer, so the payer may submit it too.
    const family = payment.paymentPlanId
      ? await prisma.paymentPlan.findFirst({ where: { id: payment.paymentPlanId, familyGroup: { payerId: userId } }, select: { id: true } })
      : null;
    if (!family) throw new AccessDeniedError(`Payment ${paymentId} does not belong to user ${userId}`);
  }
  if (payment.status !== "AWAITING_TRANSFER" && payment.status !== "REJECTED") {
    throw new Error(`Payment ${paymentId} is not open for submission (status: ${payment.status})`);
  }

  // STEP 20: submission (unlike most other rate-limited actions here)
  // updates an existing row rather than inserting a new one, so this counts
  // against `submittedAt`, not `createdAt`, see assertRateLimit's
  // `timestampField` option. 10/hour is well above any real "I mistyped my
  // reference code" resubmission rate.
  await assertRateLimit(
    prisma.zellePayment.count,
    { userId },
    { windowMinutes: 60, max: 10, timestampField: "submittedAt", message: "Too many submissions. Please wait a bit and try again." },
  );

  // Guarded by status: if the forwarded bank email approved this payment a moment ago,
  // submitting must not push it back to PENDING_REVIEW (that would let it be approved twice).
  const claimed = await prisma.zellePayment.updateMany({
    where: { id: paymentId, status: { in: ["AWAITING_TRANSFER", "REJECTED"] } },
    data: {
      senderName: input.senderName.trim().slice(0, 120),
      // Explicit null, not just omitted: a REJECTED payment being
      // resubmitted could otherwise keep whatever referenceCode a legacy
      // submission (from before this field was retired) left behind,
      // which would misleadingly attach an old code to a new submission
      // that never provided one.
      referenceCode: null,
      // A screenshot pre-check line (see receipt-actions.ts) stays on the payment, ahead of whatever the payer types.
      note: [payment.note?.startsWith("Screenshot check:") ? payment.note.split("\n")[0] : null, input.note].filter(Boolean).join("\n").slice(0, 500) || null,
      method: "ZELLE", // Zelle is the only way to pay now
      status: "PENDING_REVIEW",
      submittedAt: new Date(),
      rejectionReason: null,
    },
  });
  const submitted = await prisma.zellePayment.findUniqueOrThrow({ where: { id: paymentId } });
  if (claimed.count !== 1) return submitted; // already settled while this request was running

  // If the money's email already arrived, settle now, otherwise fall back to
  // the returning-student rule.
  // A payment a person already REJECTED and the student sent in again always waits for a person: the returning-student rule must
  // never turn a rejection into an approval just by pressing submit a second time.
  if (!(await settleWithStoredReceipt(submitted.id).catch(() => false)) && payment.status !== "REJECTED") {
    await maybeAutoApprovePayment(submitted);
  }
  await notifyAdminsIfStillPending(submitted.id);
  return submitted;
}

/**
 * Tells every admin a payment is waiting, only when it really is: one the
 * email match or the returning-student rule already approved needs no one.
 */
async function notifyAdminsIfStillPending(paymentId: string) {
  try {
    const payment = await prisma.zellePayment.findUnique({
      where: { id: paymentId },
      select: { status: true, amountCents: true, method: true, paymentPlanId: true, installmentNumber: true, userId: true, user: { select: { name: true, email: true } } },
    });
    if (!payment || payment.status !== "PENDING_REVIEW") return;
    // The student is told it arrived and is being checked.
    await noticePaymentReceived({ userId: payment.userId, amountCents: payment.amountCents });
    const slot = payment.paymentPlanId ? await describeReservedSlot(payment.paymentPlanId) : null;
    const admins = await getAdminRecipients("PAYMENT_REVIEW");
    const amount = (payment.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          type: "PAYMENT_SUBMITTED",
          title: "Payment to review",
          body: `${payment.user.name ?? payment.user.email} says they sent ${amount} by ${payment.method === "VENMO" ? "Venmo" : "Zelle"}.${slot ? ` Weekly time: ${slot}.` : ""}`,
          emailCategory: "payments",
        }),
      ),
    );
  } catch (err) {
    console.error("Admin payment notification failed (non-blocking):", err);
  }
}

/** Verified payments a student needs before their installments are approved on submit. */
const AUTO_APPROVE_MIN_VERIFIED = 2;

/**
 * Returning students get their monthly installment approved the moment they
 * say they sent it, so access never waits on the admin. The admin still
 * matches every one against the real transfer ("unchecked" until checkedAt).
 *
 * Exposure is capped on purpose: only plan installments, at least
 * AUTO_APPROVE_MIN_VERIFIED payments the admin approved or checked, no
 * rejection in the last 90 days, and never a second auto-approval while one
 * is still unchecked. A fake payment therefore costs at most one month.
 * Any failure here just leaves the payment in the normal pending queue.
 */
async function maybeAutoApprovePayment(payment: { id: string; userId: string; purpose: PaymentPurpose }) {
  if (payment.purpose !== "PAYMENT_PLAN_INSTALLMENT") return;
  try {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [trusted, recentReject, unchecked] = await Promise.all([
      prisma.zellePayment.count({
        where: {
          userId: payment.userId,
          status: "VERIFIED",
          // A $0 bill (a scholarship covering the plan) moved no money: it is no proof the student pays what they owe.
          amountCents: { gt: 0 },
          OR: [{ autoApproved: false }, { checkedAt: { not: null } }],
        },
      }),
      prisma.zellePayment.count({ where: { userId: payment.userId, status: "REJECTED", reviewedAt: { gte: since } } }),
      prisma.zellePayment.count({
        where: { userId: payment.userId, status: "VERIFIED", autoApproved: true, checkedAt: null },
      }),
    ]);
    if (trusted < AUTO_APPROVE_MIN_VERIFIED || recentReject > 0 || unchecked > 0) return;
    await approveZellePayment(payment.id, null, { auto: true, requireNoUncheckedAuto: true });
    await notifyAutoApproved(payment.id);
  } catch (err) {
    console.error("Auto-approval skipped", err);
  }
}

/** Optional heads-up (owner decides who gets it) that a payment was approved without a person. */
export async function notifyAutoApproved(paymentId: string) {
  const payment = await prisma.zellePayment.findUnique({
    where: { id: paymentId },
    select: { amountCents: true, method: true, user: { select: { name: true, email: true } } },
  });
  if (!payment) return;
  const amount = (payment.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  await notifyAdmins("PAYMENT_AUTO_APPROVED", {
    type: "ADMIN_ALERT",
    title: "Payment approved automatically",
    body: `${payment.user.name ?? payment.user.email} paid ${amount} by ${payment.method === "VENMO" ? "Venmo" : "Zelle"}.`,
    emailCategory: "payments",
    cta: { label: "Check the payment", path: `/admin/payments?id=${paymentId}` },
  });
}

/** Admin confirms an auto-approved payment really arrived. */
/** Marks every auto-approved payment that nobody has looked at as checked. Returns how many. */
export async function markAllPaymentsChecked(): Promise<number> {
  const result = await prisma.zellePayment.updateMany({
    where: { autoApproved: true, checkedAt: null },
    data: { checkedAt: new Date() },
  });
  return result.count;
}

export async function markPaymentChecked(paymentId: string) {
  await prisma.zellePayment.updateMany({
    where: { id: paymentId, autoApproved: true, checkedAt: null },
    data: { checkedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Student-facing payment history
// ---------------------------------------------------------------------------

const paymentWithScaleInclude = {
  scaleGroup: { select: { slug: true, code: true, title: true } },
  // installmentAmountCents: a plan a full scholarship covers (price 0) shows no amount, bill count or Pay in the history.
  paymentPlan: { select: { cadence: true, term: true, termMonths: true, installmentAmountCents: true } },
} satisfies Prisma.ZellePaymentInclude;

export type UserPaymentRecord = Prisma.ZellePaymentGetPayload<{ include: typeof paymentWithScaleInclude }>;

/** Every payment a student has ever submitted, newest first, their receipts/history view. */
export async function getUserPaymentHistory(userId: string): Promise<UserPaymentRecord[]> {
  await expireStalePendingPayments();
  return prisma.zellePayment.findMany({
    // A bill held inside a group's combined bill is shown as that one bill (the payer's), never as a separate row.
    where: { userId, bundleId: null },
    orderBy: { createdAt: "desc" },
    include: paymentWithScaleInclude,
  });
}

// ---------------------------------------------------------------------------
// Admin verification queue
// ---------------------------------------------------------------------------

const pendingPaymentInclude = {
  user: { select: { id: true, name: true, email: true } },
  scaleGroup: { select: { slug: true, code: true, title: true } },
  // So the admin queue can list who a FAMILY_BUNDLE payment actually
  // credits, not just who paid. Empty array for every other purpose.
  familyBundleRecipients: { include: { user: { select: { name: true, email: true } } } },
  // So the admin queue can label a PAYMENT_PLAN_INSTALLMENT row with its
  // plan's cadence/term instead of just a bare credit count. Null for every
  // other purpose.
  paymentPlan: { select: { cadence: true, term: true, termMonths: true } },
} satisfies Prisma.ZellePaymentInclude;

export type PendingZellePayment = Prisma.ZellePaymentGetPayload<{ include: typeof pendingPaymentInclude }>;

/**
 * Full admin payment listing, optionally filtered to one status, powers
 * the richer "all payments" view (verified/rejected/expired history), not
 * just the live pending queue.
 */
export const ADMIN_PAYMENTS_PAGE_SIZE = 25;

/** Narrows the payments list: to one person (their own payments and the group bills that hold theirs), or to a search typed on the page. */
export interface AdminPaymentsFilter {
  userId?: string;
  query?: string;
}

/** The payments that are about one person: theirs, a group's combined bill that holds one of theirs, and a group start that covers them. */
function personPaymentsWhere(userId: string): Prisma.ZellePaymentWhereInput {
  return { OR: [{ userId }, { bundled: { some: { userId } } }, { familyGroup: { plans: { some: { userId } } } }] };
}

/** A search over every page, not just the one loaded: name, email, the sender's name, a note, or the BNP code. */
function paymentSearchWhere(query: string): Prisma.ZellePaymentWhereInput | null {
  const q = query.trim().slice(0, 80);
  if (!q) return null;
  const code = /^bnp-?([a-z0-9]{5})$/i.exec(q.replace(/\s+/g, ""));
  const or: Prisma.ZellePaymentWhereInput[] = [
    { user: { name: { contains: q, mode: "insensitive" } } },
    { user: { email: { contains: q, mode: "insensitive" } } },
    { senderName: { contains: q, mode: "insensitive" } },
    { note: { contains: q, mode: "insensitive" } },
    { referenceCode: { contains: q, mode: "insensitive" } },
  ];
  // The BNP code is the last five characters of the payment's id (ids are lower case).
  if (code) or.push({ id: { endsWith: code[1].toLowerCase() } });
  return { OR: or };
}

function adminPaymentsWhere(status: ZellePaymentStatus | "UNCHECKED" | undefined, filter: AdminPaymentsFilter): Prisma.ZellePaymentWhereInput {
  // A member's bill held inside a group's combined bill is listed once, as the combined bill.
  const base: Prisma.ZellePaymentWhereInput = status === "UNCHECKED" ? { autoApproved: true, checkedAt: null, bundleId: null } : status ? { status, bundleId: null } : { bundleId: null };
  const and: Prisma.ZellePaymentWhereInput[] = [base];
  if (filter.userId) and.push(personPaymentsWhere(filter.userId));
  const search = filter.query ? paymentSearchWhere(filter.query) : null;
  if (search) and.push(search);
  return and.length === 1 ? base : { AND: and };
}

/** One page of the payments list (newest first) with the total, so a long list is not one endless page. */
export async function getAdminPayments(
  status?: ZellePaymentStatus | "UNCHECKED",
  page = 1,
  filter: AdminPaymentsFilter = {},
): Promise<{ payments: PendingZellePayment[]; total: number; page: number; pageCount: number }> {
  await expireStalePendingPayments();
  const where = adminPaymentsWhere(status, filter);
  const total = await prisma.zellePayment.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAYMENTS_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const payments = await prisma.zellePayment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: pendingPaymentInclude,
    skip: (safePage - 1) * ADMIN_PAYMENTS_PAGE_SIZE,
    take: ADMIN_PAYMENTS_PAGE_SIZE,
  });
  return { payments, total, page: safePage, pageCount };
}

/**
 * Where one payment sits in the payments list, so a link to it opens the right status tab and page: a member's bill held in a group's
 * combined bill is shown as the combined bill. Null when it does not exist.
 */
export async function locateAdminPayment(
  paymentId: string,
  filter: AdminPaymentsFilter = {},
  /** The tab the page is on; left out, the payment's own status tab. */
  inView?: ZellePaymentStatus | "UNCHECKED" | "ALL",
): Promise<{ id: string; status: ZellePaymentStatus; page: number } | null> {
  const row = await prisma.zellePayment.findUnique({ where: { id: paymentId }, select: { id: true, bundleId: true } });
  if (!row) return null;
  const shown = await prisma.zellePayment.findUnique({ where: { id: row.bundleId ?? row.id }, select: { id: true, status: true, createdAt: true } });
  if (!shown) return null;
  const tab = inView === undefined ? shown.status : inView === "ALL" ? undefined : inView;
  const newer = await prisma.zellePayment.count({ where: { AND: [adminPaymentsWhere(tab, filter), { createdAt: { gt: shown.createdAt } }] } });
  return { id: shown.id, status: shown.status, page: Math.floor(newer / ADMIN_PAYMENTS_PAGE_SIZE) + 1 };
}

/** Every payment about one person, newest first, with what the admin list shows: their page's Money section acts on these. */
export async function getPersonPayments(userId: string, take = 60): Promise<PendingZellePayment[]> {
  await expireStalePendingPayments();
  return prisma.zellePayment.findMany({ where: adminPaymentsWhere(undefined, { userId }), orderBy: { createdAt: "desc" }, include: pendingPaymentInclude, take });
}

/** How many classes each person has booked from now on, for the refund panel's "also cancel their classes". */
export async function countUpcomingClasses(userIds: string[]): Promise<Record<string, number>> {
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return {};
  const rows = await prisma.classBooking.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, status: "SCHEDULED", scheduledAt: { gt: new Date() } }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.studentId, r._count._all]));
}

/** A short line about one payment, for a dialog that shows the payment it is waiting on. */
export interface PaymentSummary {
  id: string;
  status: ZellePaymentStatus;
  amountCents: number;
  who: string;
  what: string;
}

export async function getPaymentSummary(paymentId: string): Promise<PaymentSummary | null> {
  const p = await prisma.zellePayment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, amountCents: true, purpose: true, installmentNumber: true, user: { select: { name: true, email: true } }, paymentPlan: { select: { cadence: true, term: true, termMonths: true } } },
  });
  if (!p) return null;
  const what =
    p.purpose === "FAMILY_PLAN_START"
      ? "Combined first payment for the group"
      : p.purpose === "FAMILY_PLAN_INSTALLMENT"
        ? "Combined 28-day group bill"
        : p.purpose === "PAYMENT_PLAN_INSTALLMENT" && p.paymentPlan
          ? `${describePaymentPlan(p.paymentPlan.cadence, p.paymentPlan.term)}, bill ${p.installmentNumber ?? "?"} of ${p.paymentPlan.termMonths}`
          : p.purpose === "CLASS_CREDITS"
            ? "Extra classes"
            : p.purpose.replace(/_/g, " ").toLowerCase();
  return { id: p.id, status: p.status, amountCents: p.amountCents, who: p.user.name ?? p.user.email, what };
}

/** The kinds of bill "Mark paid" can record: plan bills and extra classes (the approval does the rest, as for a sent-in payment). */
const MARKABLE_PURPOSES: PaymentPurpose[] = ["PAYMENT_PLAN_INSTALLMENT", "FAMILY_PLAN_START", "FAMILY_PLAN_INSTALLMENT", "CLASS_CREDITS"];

/**
 * Owner: money for an unpaid bill arrived another way (cash, a bank email that never came). Records it as sent now and approves it,
 * exactly as if the student had sent it in and it was approved: the plan moves on, credits and classes arrive, a receipt goes out.
 * Only a bill still waiting for the transfer; one already sent in is approved as usual. A member's bill inside a group's combined
 * bill is paid through the combined bill.
 */
export async function markBillPaid(paymentId: string, admin: { id: string; email: string | null }): Promise<void> {
  const payment = await prisma.zellePayment.findUnique({ where: { id: paymentId }, select: { id: true, status: true, purpose: true, bundleId: true, amountCents: true, user: { select: { email: true } } } });
  if (!payment) throw new Error("That bill no longer exists.");
  if (payment.bundleId) throw new Error("This bill is part of a combined group bill. Mark the combined bill paid instead.");
  if (payment.status === "PENDING_REVIEW") throw new Error("This payment was already sent in. Approve it instead.");
  if (payment.status !== "AWAITING_TRANSFER") throw new Error("Only an unpaid bill can be marked paid.");
  if (!MARKABLE_PURPOSES.includes(payment.purpose)) throw new Error("This kind of payment cannot be marked paid.");
  const now = new Date();
  const flipped = await prisma.zellePayment.updateMany({ where: { id: paymentId, status: "AWAITING_TRANSFER", bundleId: null }, data: { status: "PENDING_REVIEW", submittedAt: now } });
  if (flipped.count !== 1) throw new Error("This bill just changed. Refresh and try again.");
  try {
    await approveZellePayment(paymentId, admin.id);
  } catch (err) {
    // Not approved: put the bill back as it was, so it can be paid or marked again.
    await prisma.zellePayment.updateMany({ where: { id: paymentId, status: "PENDING_REVIEW", submittedAt: now }, data: { status: "AWAITING_TRANSFER", submittedAt: null } });
    throw err;
  }
  // The owner says the money is here, so there is nothing left to check.
  await prisma.zellePayment.updateMany({ where: { id: paymentId, status: "VERIFIED" }, data: { checkedAt: new Date() } });
  await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "payment.mark-paid", targetType: "ZellePayment", targetId: paymentId, detail: `${formatUsdCents(payment.amountCents)} bill for ${payment.user.email} marked paid (money arrived another way)` });
}

/**
 * Approves a pending payment and applies its real-world effect, granting
 * curriculum access, adding lesson credits, or (for a legacy grandfathered
 * row) unlocking the one scale it was for. Both the status flip and the
 * entitlement grant happen here so the two can never drift apart (a
 * VERIFIED payment that never actually unlocked anything).
 */
export async function approveZellePayment(paymentId: string, reviewerId: string | null, opts?: { auto?: boolean; skipReceipt?: boolean; requireNoUncheckedAuto?: boolean; skipStudentNotice?: boolean }) {
  // STEP 19: the status flip and the entitlement grant used to be two (or
  // three, counting the legacy-scale read) separate, un-transacted writes.
  // The docstring above already says the point is that they "can never
  // drift apart", a crash or a thrown error between the update and the
  // grant used to be able to produce exactly that: a VERIFIED payment that
  // never actually unlocked anything. Wrapping the read-check through the
  // entitlement grant in one `$transaction` makes that state unreachable,
  // either the whole thing commits, or none of it does. The notification
  // stays outside: it's a best-effort side effect, not part of what has to
  // be atomic, and a notification failure shouldn't roll back a real grant.
  // Only meaningful for a CLASS_CREDITS row carrying extraSessionScheduleId
  // (the Schedule screen's guided flow), set inside the transaction below,
  // read afterward to pick the right notification copy. Undefined for every
  // other purpose, and for a legacy CLASS_CREDITS row with no occurrence to
  // book at all.
  let extraSessionBooked: boolean | undefined;

  // A group's combined 28-day bill: approving it approves every member bill it holds and sends one receipt (paymentBundles.ts).
  {
    const head = await prisma.zellePayment.findUnique({ where: { id: paymentId }, select: { purpose: true } });
    if (head?.purpose === "FAMILY_PLAN_INSTALLMENT") {
      const { approveBundlePayment } = await import("@/lib/paymentBundles");
      return approveBundlePayment(paymentId, reviewerId, opts);
    }
  }

  // Serializable, matching bookClass/bookFamilyClass/createPaymentPlan's own
  // isolation level for the exact same reason: bookExtraSessionOccurrence
  // below does its own find-then-create for the CLASS_CREDITS branch, and
  // Read Committed wouldn't stop two concurrent approvals for two different
  // students' extra sessions on the same occurrence from both passing that
  // check before either commits. Caught below the same way those callers
  // already catch it, a friendly retry message instead of a raw P2034.
  let payment;
  const approvalStartedAt = new Date();
  let newPlanId: string | null = null;
  // A fully covered plan whose last bill this was went on for another six cycles (scholarshipPlans.ts): one notice says so below.
  let scholarshipRenewed = false;
  try {
    payment = await prisma.$transaction(
      async (tx) => {
        newPlanId = null;
        scholarshipRenewed = false;
        const payment = await tx.zellePayment.findUniqueOrThrow({ where: { id: paymentId } });
        if (payment.status !== "PENDING_REVIEW") {
          throw new Error(`Payment ${paymentId} is not pending review (status: ${payment.status})`);
        }
        // The "only one unchecked auto-approval at a time" cap is checked HERE, inside the serializable transaction, so two bills
        // submitted at the same moment cannot both pass a count each read before the other committed.
        if (opts?.requireNoUncheckedAuto) {
          const open = await tx.zellePayment.count({ where: { userId: payment.userId, status: "VERIFIED", autoApproved: true, checkedAt: null } });
          if (open > 0) throw new Error("An earlier automatic approval has not been checked yet.");
        }

        await tx.zellePayment.update({
          where: { id: paymentId },
          data: { status: "VERIFIED", reviewedAt: new Date(), reviewedById: reviewerId, autoApproved: opts?.auto === true },
        });

        if (payment.purpose === "CURRICULUM") {
          await grantCurriculumAccess(payment.userId, tx);
        } else if (payment.purpose === "CLASS_CREDITS" && payment.lessonQuantity) {
          // Non-expiring, same as any CLASS_CREDITS grant always was. Two shapes
          // share this branch: a legacy bare credit purchase (from before this
          // purpose's a-la-carte page was removed, extraSessionScheduleId null,
          // nothing more to do), and the Schedule screen's guided extra-session
          // flow, which also has a specific occurrence to book directly, so the
          // student never has to go spend the credit themselves at /lessons.
          await grantCredits(payment.userId, payment.lessonQuantity, { source: "CLASS_CREDITS", expiresAt: null }, tx);
          if (payment.extraSessionScheduleId && payment.extraSessionOccurrenceDate && payment.extraSessionScheduledAt) {
            extraSessionBooked = await bookExtraSessionOccurrence(
              {
                studentId: payment.userId,
                scheduleId: payment.extraSessionScheduleId,
                occurrenceDate: payment.extraSessionOccurrenceDate,
                scheduledAt: payment.extraSessionScheduledAt,
                creditsSpent: payment.lessonQuantity,
              },
              tx,
            );
          }
        } else if (payment.purpose === "FAMILY_BUNDLE") {
          // Credits go to every recipient row, not payment.userId: the payer
          // isn't necessarily a recipient themselves (see createFamilyBundlePayment).
          // Non-expiring, only a Payment Plan installment's credits expire.
          const recipients = await tx.familyBundleRecipient.findMany({ where: { paymentId: payment.id } });
          for (const recipient of recipients) {
            await grantCredits(recipient.userId, recipient.creditsGranted, { source: "FAMILY_BUNDLE", expiresAt: null }, tx);
          }
        } else if (payment.purpose === "CURRICULUM_FAMILY_BUNDLE") {
          // Same recipient list shape as FAMILY_BUNDLE above, curriculum
          // access instead of credits. creditsGranted on these rows is
          // always 0 and unused, see createCurriculumFamilyBundlePayment.
          const recipients = await tx.familyBundleRecipient.findMany({ where: { paymentId: payment.id } });
          for (const recipient of recipients) {
            await grantCurriculumAccess(recipient.userId, tx);
          }
        } else if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlanId && payment.lessonQuantity) {
          scholarshipRenewed = (await applyPlanInstallment(tx, { userId: payment.userId, paymentPlanId: payment.paymentPlanId, lessonQuantity: payment.lessonQuantity, installmentNumber: payment.installmentNumber })).renewed;
        } else if (payment.purpose === "FAMILY_PLAN_START" && payment.familyGroupId) {
          // One payment starts every member's plan, in this same transaction, or none of them: if any member's plan is no
          // longer waiting to start (canceled, lapsed), the whole approval fails and the payment stays for a person to refund.
          const plans = await tx.paymentPlan.findMany({ where: { familyGroupId: payment.familyGroupId } });
          const group = await tx.familyPlanGroup.findUniqueOrThrow({ where: { id: payment.familyGroupId } });
          const waiting = plans.filter((plan) => plan.status === "ACTIVE" && plan.installmentsPaid === 0);
          if (plans.length === 0 || waiting.length !== plans.length) {
            throw new Error("This family can no longer start together: a member's plan is not waiting to start. Refund the payment and set the family up again.");
          }
          // A payer who switched in from a plan of their own: that plan is replaced here, in the same transaction, so there is
          // no gap and no moment with two plans. Their unused credits stay until they expire; classes already on the calendar
          // at the family's weekly time move to the new plan.
          if (group.replacesPlanId) {
            const old = await tx.paymentPlan.findUnique({ where: { id: group.replacesPlanId } });
            const template = waiting[0];
            if (old && old.status === "ACTIVE") {
              await tx.paymentPlan.update({
                where: { id: old.id },
                data: { status: "CANCELED", canceledAt: new Date(), cancellationReason: "OTHER", cancellationReasonNote: "Switched to a family plan" },
              });
              await tx.zellePayment.updateMany({ where: { paymentPlanId: old.id, status: "AWAITING_TRANSFER" }, data: { status: "EXPIRED" } });
            }
            const mine = await tx.paymentPlan.create({
              data: {
                userId: group.payerId,
                cadence: template.cadence,
                term: template.term,
                installmentAmountCents: template.installmentAmountCents,
                creditsPerInstallment: template.creditsPerInstallment,
                termMonths: template.termMonths,
                nextDueDate: new Date(),
                // The payer keeps the weekly time their old plan held; the other members have none (they book with credits).
                reservedScheduleId: old?.reservedScheduleId ?? null,
                reservedChunkIndex: old?.reservedChunkIndex ?? null,
                familyGroupId: group.id,
              },
            });
            if (old) {
              const sameTime = true;
              await tx.classBooking.updateMany({
                where: { reservedByPlanId: old.id, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
                data: sameTime ? { reservedByPlanId: mine.id, familyBookingGroupId: group.id } : { status: "CANCELED", refunded: true },
              });
            }
            waiting.unshift(mine);
            newPlanId = mine.id;
          }
          for (const plan of waiting) {
            await applyPlanInstallment(tx, { userId: plan.userId, paymentPlanId: plan.id, lessonQuantity: plan.creditsPerInstallment, planIsNew: plan.id === newPlanId });
          }
        } else if (payment.scaleGroupId) {
          // Legacy Pay-As-You-Go row from before per-scale purchase was retired.
          const scaleGroup = await tx.scaleGroup.findUniqueOrThrow({ where: { id: payment.scaleGroupId } });
          await unlockScaleForUser(payment.userId, scaleGroup.slug, tx);
        }

        return payment;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2034") {
      throw new Error("That payment was just processed elsewhere, please try approving it again.");
    }
    throw err;
  }

  // An old curriculum purchase that resolves late still switches on complimentary access: leave a trace in the activity log.
  if (payment.purpose === "CURRICULUM" || payment.purpose === "CURRICULUM_FAMILY_BUNDLE") {
    const recipients =
      payment.purpose === "CURRICULUM"
        ? [payment.userId]
        : (await prisma.familyBundleRecipient.findMany({ where: { paymentId: payment.id }, select: { userId: true } })).map((r) => r.userId);
    for (const userId of recipients) {
      await logAudit({ actorId: reviewerId, action: "access.grant", targetType: "User", targetId: userId, detail: "Complimentary access from an old curriculum payment that was approved" });
    }
  }

  // A payer's family plan created inside the approval: its credit ledger row was written before the plan existed for good, so
  // it is linked to the plan now.
  if (newPlanId) {
    const created = await prisma.paymentPlan.findUnique({ where: { id: newPlanId }, select: { id: true, userId: true } });
    if (created) {
      await prisma.creditGrant.updateMany({
        where: { userId: created.userId, source: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: null, createdAt: { gte: approvalStartedAt } },
        data: { paymentPlanId: created.id },
      });
    }
  }

  // The plan's weekly classes for the period just paid for go on the calendar
  // (and into the admin's Attendance list) right now, not at tomorrow's job.
  if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlanId) {
    await bookReservedWindowForPlan(payment.paymentPlanId);
    // A friend's invitation pays off once the invited person's first payment on a 3 or 6 month plan is in.
    // Never for a $0 first bill (a full scholarship): nothing was paid, so there is nothing for a friend's invitation to reward.
    if (payment.installmentNumber === 1 && payment.amountCents > 0) await rewardReferralForFirstPayment(payment.userId, payment.paymentPlanId);

    // A first payment going through is the moment someone becomes a subscriber: tell the admins who and when.
    if (payment.installmentNumber === 1) {
      try {
        const [plan, student, slot] = await Promise.all([
          prisma.paymentPlan.findUnique({ where: { id: payment.paymentPlanId }, select: { cadence: true, term: true } }),
          prisma.user.findUnique({ where: { id: payment.userId }, select: { name: true, email: true } }),
          describeReservedSlot(payment.paymentPlanId),
        ]);
        await notifyAdmins("NEW_SUBSCRIPTION", {
          type: "ADMIN_ALERT",
          title: "New subscriber",
          body: `${student?.name ?? student?.email ?? "A student"} is on the ${plan ? describePaymentPlan(plan.cadence, plan.term) : "plan"}${slot ? `, ${slot}` : ""}.`,
          emailCategory: "social",
          cta: { label: "See the subscriber", path: `/admin/users/${payment.userId}` },
        });
      } catch (err) {
        console.error("New subscriber notification failed (non-blocking):", err);
      }
    }
  }

  // A family plan's combined first payment just started every member at once: put each member's weekly classes on the
  // calendar, tell each member, and tell the admins once.
  let familyStartBody: string | null = null;
  if (payment.purpose === "FAMILY_PLAN_START" && payment.familyGroupId) {
    const plans = await prisma.paymentPlan.findMany({
      where: { familyGroupId: payment.familyGroupId },
      select: { id: true, userId: true, cadence: true, term: true, creditsPerInstallment: true, nextDueDate: true, user: { select: { name: true, email: true } } },
    });
    for (const plan of plans) await bookReservedWindowForPlan(plan.id);
    const groupKind = (await prisma.familyPlanGroup.findUnique({ where: { id: payment.familyGroupId }, select: { kind: true } }))?.kind ?? "FAMILY";
    const parentPaid = groupKind === "PARENT";
    familyStartBody = parentPaid
      ? `The plan started for ${plans.length === 1 ? "your child" : `${plans.length} accounts`}. Their credits are on their accounts and the weekly class is booked. You can see their progress and change their class times from Parent mode in Settings. Credits expire at the end of each 28-day cycle.`
      : `Your group plan started for ${plans.length} accounts. Your weekly class is booked. Everyone else has their credits and picks their own class times. Credits expire at the end of each 28-day cycle.`;
    await Promise.all(
      plans
        .filter((plan) => plan.userId !== payment.userId)
        .map((plan) =>
          createNotification({
            userId: plan.userId,
            type: "PAYMENT_APPROVED",
            title: parentPaid ? "Your plan started" : "Your group plan started",
            body: `${creditsLabelFromStored(plan.creditsPerInstallment)} ${plan.creditsPerInstallment === CREDITS_PER_CLASS ? "is" : "are"} on your account. Pick your own class times in Lessons. These credits expire on ${plan.nextDueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" })} (the end of this 28-day cycle), so book your classes before then.`,
            emailCategory: "payments",
            cta: { label: "Pick your class time", path: "/lessons" },
          }).catch((err) => console.error(`Failed to notify family member ${plan.userId} (non-blocking):`, err)),
        ),
    );
    try {
      const slot = plans[0] ? await describeReservedSlot(plans[0].id) : null;
      await notifyAdmins("NEW_SUBSCRIPTION", {
        type: "ADMIN_ALERT",
        title: parentPaid ? "New parent-paid plan" : "New group plan",
        body: `${plans.map((plan) => plan.user.name ?? plan.user.email).join(", ")} started a ${parentPaid ? "parent-paid" : "group"} plan${plans[0] ? ` (${describePaymentPlan(plans[0].cadence, plans[0].term)})` : ""}${slot ? `, ${slot}` : ""}.`,
        emailCategory: "social",
        cta: { label: "See the plans", path: "/admin/payment-plans" },
      });
    } catch (err) {
      console.error("New family plan notification failed (non-blocking):", err);
    }
  }

  let notificationBody = familyStartBody ?? "Your payment was verified.";
  let fifthClass: Awaited<ReturnType<typeof fifthClassReceiptNote>> = null;
  if (payment.purpose === "CURRICULUM") {
    notificationBody = "Your curriculum payment was verified. Every scale is unlocked, for good.";
  } else if (payment.purpose === "CLASS_CREDITS" && payment.extraSessionScheduleId) {
    notificationBody = extraSessionBooked
      ? "Your extra session payment was verified and the class is booked. See it on your Schedule."
      : "Your extra session payment was verified, but that time was taken in the meantime. Pick another open time from Lessons, your credit is already on your account.";
  } else if (payment.purpose === "CLASS_CREDITS" && payment.lessonQuantity) {
    const classes = Math.max(1, Math.round(payment.lessonQuantity / CREDITS_PER_CLASS));
    notificationBody = `Your ${classes} extra class${classes === 1 ? "" : "es"} payment was verified. They are on your account, ready to book.`;
  } else if (payment.purpose === "FAMILY_BUNDLE" && payment.lessonQuantity) {
    notificationBody = `Your family bundle payment was verified. ${creditsLabelFromStored(payment.lessonQuantity)} each went out to everyone in the bundle.`;
  } else if (payment.purpose === "CURRICULUM_FAMILY_BUNDLE") {
    notificationBody = "Your curriculum family bundle payment was verified. Every scale is unlocked, for good, for everyone in the bundle.";
  } else if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlanId && payment.lessonQuantity) {
    const plan = await prisma.paymentPlan.findUnique({ where: { id: payment.paymentPlanId } });
    const ordinal = payment.installmentNumber ?? plan?.installmentsPaid ?? 1;
    const creditsNote = `${creditsLabelFromStored(payment.lessonQuantity)} ${payment.lessonQuantity === CREDITS_PER_CLASS ? "is" : "are"} on your account`;
    notificationBody =
      payment.amountCents === 0
        ? // A $0 bill (a 100% scholarship) was never paid, so it is never called a payment that was verified, and never counted "of 6".
          coveredBillNotice(creditsNote).body
        : plan
          ? `Bill ${ordinal} of ${plan.termMonths} was verified. ${creditsNote}.`
          : `Your plan bill was verified. ${creditsNote}.`;
    // A cycle that holds five of the student's weekday includes the fifth class free: say so on the receipt.
    fifthClass = await fifthClassReceiptNote(payment.paymentPlanId);
    if (fifthClass) notificationBody += ` ${fifthClass.text}`;
  } else if (payment.scaleGroupId) {
    const scaleGroup = await prisma.scaleGroup.findUniqueOrThrow({ where: { id: payment.scaleGroupId } });
    notificationBody = `Your payment for ${scaleGroup.code}: ${scaleGroup.title} was verified. It's unlocked now.`;
  }

  // The bell notice only: the email that goes with an approval is the receipt below (the old plain "Payment approved" email,
  // which had no amount, date or receipt number, would have been a second email about the same payment).
  // Skipped only when the caller tells the student itself in one notice (the owner's "Set up plan", planSetup.ts).
  // A covered plan that just went on for another six cycles gets ONE notice, "Your scholarship plan continues", in place of this one.
  if (scholarshipRenewed && payment.paymentPlanId) {
    await afterScholarshipRenewal(payment.paymentPlanId, { notify: !opts?.skipStudentNotice, via: "last bill" });
  } else if (!opts?.skipStudentNotice) {
    await createNotification({
      userId: payment.userId,
      type: "PAYMENT_APPROVED",
      title: payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.amountCents === 0 ? coveredBillNotice("").title : "Payment approved",
      body: notificationBody,
      // The button opens this payment's own receipt, not the whole history list.
      // A covered bill has nothing to show a receipt for: the button goes to their classes.
      cta: fifthClass?.offerPath
        ? { label: "Add the fifth class", path: fifthClass.offerPath }
        : payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.amountCents === 0
          ? { label: "See your classes", path: "/lessons" }
          : { label: "View your receipt", path: receiptPath(payment.id) },
    });
  }
  if (!opts?.skipReceipt) await sendPaymentReceipt(payment.id, notificationBody).catch((err) => reportError(err, `sendPaymentReceipt ${payment.id}`));

  // A completed plan is a distinct milestone worth its own bell entry, on
  // top of the ordinary "payment approved" above, same "more than one
  // notification can come out of one approval" shape FAMILY_BUNDLE already
  // uses below for its per-recipient notices.
  if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlanId) {
    const plan = await prisma.paymentPlan.findUnique({ where: { id: payment.paymentPlanId } });
    if (plan?.status === "COMPLETED") {
      await createNotification({
        userId: payment.userId,
        type: "PAYMENT_PLAN_COMPLETED",
        title: plan.installmentAmountCents === 0 ? "Your plan is complete" : "Payment plan complete",
        // A plan that cost nothing was never paid off, so it is not congratulated for paying.
        body: plan.installmentAmountCents === 0 ? `Your ${plan.termMonths * 28}-day plan is complete. Nice work.` : `You've paid off your ${plan.termMonths * 28}-day plan in full. Nice work.`,
        emailCategory: "payments",
      });
    }
  }

  // Every recipient who isn't the payer themselves gets their own "credits
  // just appeared" notice. Approving the payment above already granted
  // them, this is purely the heads-up, so a failure here is non-blocking
  // same as everywhere else a notification follows a real grant.
  if (payment.purpose === "FAMILY_BUNDLE" && payment.lessonQuantity) {
    const recipients = await prisma.familyBundleRecipient.findMany({
      where: { paymentId: payment.id, userId: { not: payment.userId } },
      select: { userId: true },
    });
    await Promise.all(
      recipients.map((r) =>
        createNotification({
          userId: r.userId,
          type: "CREDIT_ADJUSTED",
          title: `${creditsLabelFromStored(payment.lessonQuantity)} added`,
          body: "Someone bundled a family purchase that included your account. The credits are on your balance now.",
          emailCategory: "payments",
        }).catch((err) => console.error(`Failed to notify family bundle recipient ${r.userId} (non-blocking):`, err)),
      ),
    );
  }

  // Same reasoning as FAMILY_BUNDLE's own per-recipient notice above, for
  // curriculum access instead of credits.
  if (payment.purpose === "CURRICULUM_FAMILY_BUNDLE") {
    const recipients = await prisma.familyBundleRecipient.findMany({
      where: { paymentId: payment.id, userId: { not: payment.userId } },
      select: { userId: true },
    });
    await Promise.all(
      recipients.map((r) =>
        createNotification({
          userId: r.userId,
          type: "CURRICULUM_ACCESS_GRANTED",
          title: "Curriculum unlocked",
          body: "Someone bundled a family purchase that included your account. Every scale is unlocked now, for good.",
          emailCategory: "payments",
        }).catch((err) => console.error(`Failed to notify curriculum bundle recipient ${r.userId} (non-blocking):`, err)),
      ),
    );
  }
}

/**
 * Credits one installment to a plan inside the approval transaction: grants the cycle's credits (good until the next one is
 * due) and moves the plan forward (installments paid, next due date, completed). Used by an ordinary installment and,
 * once per member, by a family plan's combined first payment.
 */
export async function applyPlanInstallment(
  tx: Prisma.TransactionClient,
  args: { userId: string; paymentPlanId: string; lessonQuantity: number; /** The bill's own number: a bill whose number the plan has already paid is a duplicate and is refused, so one bill is never paid twice in credits. */ installmentNumber?: number | null; /** True for a plan created inside this same transaction: the ledger row is written outside it, so the link is added after commit. */ planIsNew?: boolean },
): Promise<{ /** The plan's last bill settled and, being fully covered by a 100% scholarship, it went on for another six cycles. */ renewed: boolean }> {
  // Fetched before granting (unlike the other branches) because the
  // grant's own expiresAt needs it: this installment's credits are good
  // through the end of the cycle it's paying for, exactly when the
  // *next* installment becomes due. cycleEnd is computed once and
  // reused for both, below.
  const plan = await tx.paymentPlan.findUnique({ where: { id: args.paymentPlanId } });
  if (plan && args.installmentNumber != null && plan.status === "ACTIVE" && args.installmentNumber <= plan.installmentsPaid) {
    throw new Error(`Installment ${args.installmentNumber} of this plan is already paid. Refund this payment instead of approving it.`);
  }
  // The first month starts when the first payment is approved, not when the plan was
  // created, so a student who pays a few days after signing up still gets a full month.
  let cycleStart = plan && plan.installmentsPaid === 0 && plan.nextDueDate < new Date() ? new Date() : plan?.nextDueDate;
  // A plan the studio set up to start on a later day (planSetup.ts): its first cycle begins on that first class, so all four of the
  // cycle's classes fall inside it and the credits last until 28 days after it.
  if (plan && plan.installmentsPaid === 0 && plan.startsAt && cycleStart && plan.startsAt > cycleStart) cycleStart = plan.startsAt;
  const cycleEnd = plan && cycleStart ? addBillingCycles(cycleStart, 1) : null;

  // Quantity is snapshotted onto the payment row at installment-creation
  // time (see createPaymentPlan/getOrCreateOpenInstallmentPayment in
  // paymentPlans.ts).
  await grantCredits(
    args.userId,
    args.lessonQuantity,
    { source: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: args.planIsNew ? undefined : args.paymentPlanId, expiresAt: cycleEnd },
    tx,
  );

  // The plan may have been canceled after this installment was created
  // but before review cleared (an admin cancellation racing a student's
  // in-flight Zelle transfer). Credits are still granted above, real
  // money changed hands, and refusing them would just generate a
  // support conversation, but a canceled plan's own progress is left
  // alone rather than resurrected by a late approval.
  if (plan && plan.status === "ACTIVE" && cycleEnd) {
    const installmentsPaid = plan.installmentsPaid + 1;
    const lastBill = installmentsPaid >= plan.termMonths;
    // A plan a 100% scholarship covers never ends at its sixth bill: the same plan goes on for six more cycles, in this same
    // transaction, so there is never a moment without a running plan (no gap in access, the weekly time, classes or credits).
    const renewed = lastBill && (await planContinuesOnScholarship(tx, plan));
    const isComplete = lastBill && !renewed;
    await tx.paymentPlan.update({
      where: { id: plan.id },
      data: {
        installmentsPaid,
        status: isComplete ? "COMPLETED" : "ACTIVE",
        // A finished plan keeps the START of its last paid cycle (paid access runs 28 days from it). A 1 Month plan's first bill is also its
        // last, so its stored date is still the day the plan was made: the cycle really started at cycleStart (approval, or the first class).
        nextDueDate: isComplete ? (plan.installmentsPaid === 0 && cycleStart ? cycleStart : plan.nextDueDate) : cycleEnd,
        ...(renewed ? { termMonths: plan.termMonths + SCHOLARSHIP_RENEWAL_CYCLES } : {}),
      },
    });
    return { renewed };
  }
  return { renewed: false };
}

/**
 * Deletes one payment record and nothing else. Anything the payment already
 * gave (a plan's paid installments, credits, booked classes) stays as it is,
 * so this is for clearing test or mistaken rows, not for undoing a sale.
 */
export async function deleteZellePayment(paymentId: string, actor?: { id: string; email: string | null }): Promise<void> {
  const payment = await prisma.zellePayment.findUnique({ where: { id: paymentId }, select: { amountCents: true, status: true, user: { select: { email: true } } } });
  await prisma.zellePayment.delete({ where: { id: paymentId } });
  await logAudit({
    actorId: actor?.id,
    actorEmail: actor?.email,
    action: "payment.delete",
    targetType: "ZellePayment",
    targetId: paymentId,
    detail: payment ? `${formatUsdCents(payment.amountCents)} from ${payment.user.email}, was ${payment.status}` : "payment removed",
  });
}

function formatUsdCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Marks a verified payment as refunded. The money itself goes back outside the
 * app (Zelle); this keeps the books and the student's account in step:
 * it leaves revenue, and can also take back the credits it gave and end the
 * plan it paid for.
 */
export async function refundZellePayment(
  paymentId: string,
  admin: { id: string; email: string | null },
  opts: { note: string; removeCredits: boolean; cancelPlan: boolean; cancelClasses?: boolean },
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];
  const note = opts.note.trim();
  if (!note) throw new Error("A reason is required.");
  const payment = await prisma.zellePayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { user: { select: { id: true, email: true, classCredits: true } } },
  });
  if (payment.status !== "VERIFIED") throw new Error("Only a verified payment can be refunded.");

  // A group's combined 28-day bill: refund every member bill it holds (credits back, plan ended if asked), then the combined bill.
  if (payment.purpose === "FAMILY_PLAN_INSTALLMENT") {
    const members = await prisma.zellePayment.findMany({ where: { bundleId: payment.id, status: "VERIFIED" }, select: { id: true } });
    await prisma.zellePayment.updateMany({ where: { id: payment.id, status: "VERIFIED" }, data: { status: "REFUNDED", refundedAt: new Date(), refundNote: note } });
    for (const m of members) {
      const r = await refundZellePayment(m.id, admin, opts);
      warnings.push(...r.warnings);
    }
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "payment.refund", targetType: "ZellePayment", targetId: paymentId, detail: `${formatUsdCents(payment.amountCents)} combined group bill refunded for ${members.length} member bill(s). ${note}` });
    return { warnings };
  }

  // Guarded on the status, so a double tap or two windows cannot refund (and take credits back) twice.
  const flipped = await prisma.zellePayment.updateMany({
    where: { id: paymentId, status: "VERIFIED" },
    data: { status: "REFUNDED", refundedAt: new Date(), refundNote: note },
  });
  if (flipped.count === 0) throw new Error("Only a verified payment can be refunded.");

  // Cancel the classes first: a booked class holds its credits, so canceling it lets the take-back below reach the whole amount.
  let canceledClasses = 0;
  if (opts.cancelClasses) {
    const students =
      payment.purpose === "FAMILY_PLAN_START" && payment.familyGroupId
        ? (await prisma.paymentPlan.findMany({ where: { familyGroupId: payment.familyGroupId }, select: { userId: true } })).map((p) => p.userId)
        : [payment.userId];
    const { cancelUpcomingClasses } = await import("@/lib/adminClassTools");
    for (const studentId of Array.from(new Set(students))) {
      // None booked is not a problem here.
      canceledClasses += await cancelUpcomingClasses(admin.id, studentId, `Refund: ${note}`).catch(() => 0);
    }
  }

  if (opts.removeCredits && payment.lessonQuantity) {
    // Credits promised to classes the student has already booked are not
    // taken back, so a booked class is never left without credits to cover it.
    const held = await prisma.classBooking.aggregate({
      where: { studentId: payment.userId, status: "SCHEDULED" },
      _sum: { creditsSpent: true },
    });
    const free = Math.max(0, payment.user.classCredits - (held._sum.creditsSpent ?? 0));
    const take = Math.min(free, payment.lessonQuantity);
    if (take > 0) await adjustUserCredits(admin.id, payment.userId, -take, `Refund: ${note}`);
    if (take < payment.lessonQuantity) {
      warnings.push(
        `Only ${creditsLabelFromStored(take)} of ${creditsLabelFromStored(payment.lessonQuantity)} were taken back; the rest are held by this student's upcoming classes. Adjust them under Credits once those classes are done or canceled.`,
      );
    }
  }
  // A family's combined first payment covers every member: take back each member's first-month credits and end every plan.
  if (payment.purpose === "FAMILY_PLAN_START" && payment.familyGroupId) {
    const plans = await prisma.paymentPlan.findMany({
      where: { familyGroupId: payment.familyGroupId },
      select: { id: true, userId: true, status: true, creditsPerInstallment: true, user: { select: { classCredits: true } } },
    });
    for (const plan of plans) {
      if (opts.removeCredits) {
        const held = await prisma.classBooking.aggregate({ where: { studentId: plan.userId, status: "SCHEDULED" }, _sum: { creditsSpent: true } });
        const free = Math.max(0, plan.user.classCredits - (held._sum.creditsSpent ?? 0));
        const take = Math.min(free, plan.creditsPerInstallment);
        if (take > 0) await adjustUserCredits(admin.id, plan.userId, -take, `Refund: ${note}`);
        if (take < plan.creditsPerInstallment) warnings.push("Some of a family member's credits are held by their upcoming classes and were not taken back.");
      }
      if (opts.cancelPlan && plan.status === "ACTIVE") {
        const { cancelPaymentPlan } = await import("@/lib/paymentPlans");
        await cancelPaymentPlan(plan.id, admin.id, `Refund: ${note}`).catch((err) => {
          warnings.push(`A family plan was not canceled: ${err instanceof Error ? err.message : "unknown error"}`);
        });
      }
    }
  }
  // Refunding a bill without ending the plan leaves the plan counting that bill as paid, with the next bill date as it was. That is
  // right for a duplicate payment but wrong for a month that did not happen, so say so instead of leaving it to be noticed later.
  if (!opts.cancelPlan && payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlanId) {
    const plan = await prisma.paymentPlan.findUnique({ where: { id: payment.paymentPlanId }, select: { status: true, installmentsPaid: true, nextDueDate: true } });
    if (plan && plan.status === "ACTIVE" && plan.installmentsPaid >= (payment.installmentNumber ?? 1)) {
      warnings.push(
        `The plan still counts ${plan.installmentsPaid} bill${plan.installmentsPaid === 1 ? "" : "s"} as paid and the next bill stays on ${plan.nextDueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}. If this refund undoes a month, adjust the plan.`,
      );
    }
  }
  if (opts.cancelPlan && payment.paymentPlanId) {
    const { cancelPaymentPlan } = await import("@/lib/paymentPlans");
    const finished = await prisma.paymentPlan.findUnique({ where: { id: payment.paymentPlanId }, select: { status: true } });
    if (finished?.status === "COMPLETED") {
      // A finished plan (a 1 Month plan after its one bill) cannot be "canceled" the usual way, but a refund still ends it, and with it the access.
      await prisma.$transaction([
        prisma.paymentPlan.update({ where: { id: payment.paymentPlanId }, data: { status: "CANCELED", canceledAt: new Date(), canceledById: admin.id, cancellationNote: `Refund: ${note}` } }),
        prisma.classBooking.updateMany({ where: { reservedByPlanId: payment.paymentPlanId, status: "SCHEDULED", scheduledAt: { gt: new Date() } }, data: { status: "CANCELED", refunded: true, canceledReason: "Payment refunded" } }),
      ]);
    } else {
      await cancelPaymentPlan(payment.paymentPlanId, admin.id, `Refund: ${note}`).catch((err) => {
        warnings.push(`The plan was not canceled: ${err instanceof Error ? err.message : "unknown error"}`);
      });
    }
  }

  await createNotification({
    userId: payment.userId,
    type: "CREDIT_ADJUSTED",
    title: "Payment refunded",
    body: `${formatUsdCents(payment.amountCents)} was refunded. ${note}`,
    emailCategory: "payments",
  }).catch((err) => console.error("Refund notification failed (non-blocking):", err));

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "payment.refund",
    targetType: "ZellePayment",
    targetId: paymentId,
    detail: `${formatUsdCents(payment.amountCents)} to ${payment.user.email}${opts.removeCredits ? ", credits removed" : ""}${opts.cancelPlan ? ", plan canceled" : ""}${canceledClasses ? `, ${canceledClasses} upcoming class${canceledClasses === 1 ? "" : "es"} canceled` : ""}. ${note}${warnings.length ? ` (${warnings.join(" ")})` : ""}`,
  });
  return { warnings };
}


/**
 * Reverses a refund (owner): the payment counts as paid again. The credits it took back are returned and the plan it ended is running
 * again only when asked; classes that were canceled with it are not brought back (book them again or use Plan builder).
 */
export async function undoRefundZellePayment(
  paymentId: string,
  admin: { id: string; email: string | null },
  opts: { restoreCredits: boolean; reactivatePlan: boolean },
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];
  const payment = await prisma.zellePayment.findUniqueOrThrow({ where: { id: paymentId }, include: { user: { select: { email: true } } } });
  if (payment.status !== "REFUNDED") throw new Error("Only a refunded payment can be undone.");
  const flipped = await prisma.zellePayment.updateMany({ where: { id: paymentId, status: "REFUNDED" }, data: { status: "VERIFIED", refundedAt: null, refundNote: null } });
  if (flipped.count === 0) throw new Error("Only a refunded payment can be undone.");

  if (payment.purpose === "FAMILY_PLAN_INSTALLMENT") {
    const members = await prisma.zellePayment.findMany({ where: { bundleId: payment.id, status: "REFUNDED" }, select: { id: true } });
    for (const m of members) warnings.push(...(await undoRefundZellePayment(m.id, admin, opts)).warnings);
  } else {
    if (opts.restoreCredits && payment.lessonQuantity && payment.lessonQuantity > 0) {
      await adjustUserCredits(admin.id, payment.userId, payment.lessonQuantity, "Refund undone");
    }
    const planIds: string[] = [];
    if (payment.paymentPlanId) planIds.push(payment.paymentPlanId);
    if (payment.purpose === "FAMILY_PLAN_START" && payment.familyGroupId) {
      const group = await prisma.paymentPlan.findMany({ where: { familyGroupId: payment.familyGroupId }, select: { id: true, userId: true, creditsPerInstallment: true } });
      planIds.push(...group.map((g) => g.id));
      if (opts.restoreCredits) for (const g of group) if (g.creditsPerInstallment > 0) await adjustUserCredits(admin.id, g.userId, g.creditsPerInstallment, "Refund undone");
    }
    if (opts.reactivatePlan) {
      for (const planId of planIds) {
        const plan = await prisma.paymentPlan.findUnique({ where: { id: planId }, select: { status: true, cancellationNote: true, userId: true } });
        if (plan?.status === "CANCELED" && plan.cancellationNote?.startsWith("Refund:")) {
          // Never a second running plan for one person, and never for a banned account: leave it ended and say so.
          const [other, holder] = await Promise.all([
            prisma.paymentPlan.findFirst({ where: { userId: plan.userId, status: "ACTIVE", id: { not: planId } }, select: { id: true } }),
            prisma.user.findUnique({ where: { id: plan.userId }, select: { bannedAt: true } }),
          ]);
          if (other || holder?.bannedAt) {
            warnings.push(other ? "The plan was not restored: this person already has another running plan. Use Restart canceled plan on their page if you still want it back." : "The plan was not restored: the account is banned.");
            continue;
          }
          const counts = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: planId }, select: { installmentsPaid: true, termMonths: true } });
          const restoredStatus = counts.installmentsPaid >= counts.termMonths ? "COMPLETED" : "ACTIVE"; // a finished plan comes back finished
          await prisma.paymentPlan.update({ where: { id: planId }, data: { status: restoredStatus, canceledAt: null, canceledById: null, cancellationNote: null, cancellationReason: null, cancellationReasonNote: null } });
          warnings.push("A plan ended by the refund is running again. Classes canceled with it were not brought back.");
        }
      }
    }
  }
  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "payment.refund-undone",
    targetType: "ZellePayment",
    targetId: paymentId,
    detail: `${formatUsdCents(payment.amountCents)} from ${payment.user.email}${opts.restoreCredits ? ", credits returned" : ""}${opts.reactivatePlan ? ", plan restored" : ""}`,
  });
  return { warnings };
}

/** Closes a bill nobody paid (or one that was rejected) without deleting its record: it shows as expired. A group's combined bill closes with every bill it holds. */
export async function cancelOpenBill(paymentId: string, admin: { id: string; email: string | null }): Promise<void> {
  const payment = await prisma.zellePayment.findUniqueOrThrow({ where: { id: paymentId }, include: { user: { select: { email: true } } } });
  if (payment.status !== "AWAITING_TRANSFER" && payment.status !== "REJECTED") throw new Error("Only an unpaid or rejected bill can be canceled. Use Reject for one waiting for review.");
  await prisma.$transaction(async (tx) => {
    await tx.zellePayment.updateMany({ where: { id: paymentId, status: { in: ["AWAITING_TRANSFER", "REJECTED"] } }, data: { status: "EXPIRED" } });
    if (payment.purpose === "FAMILY_PLAN_INSTALLMENT") {
      await tx.zellePayment.updateMany({ where: { bundleId: paymentId, status: { in: ["AWAITING_TRANSFER", "REJECTED"] } }, data: { status: "EXPIRED" } });
    }
  });
  await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "payment.cancel-bill", targetType: "ZellePayment", targetId: paymentId, detail: `${formatUsdCents(payment.amountCents)} bill for ${payment.user.email} was ${payment.status}` });
}

/** Rejects a pending payment with a reason the student sees on the resubmit screen. */
export async function rejectZellePayment(paymentId: string, reviewerId: string, reason: string) {
  const payment = await prisma.zellePayment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status !== "PENDING_REVIEW") {
    throw new Error(`Payment ${paymentId} is not pending review (status: ${payment.status})`);
  }

  // Guarded by status: a bank email or an auto-approval may have verified this payment since it was read, and that must not be
  // flipped to REJECTED after its credits were granted.
  const rejected = await prisma.zellePayment.updateMany({
    where: { id: paymentId, status: "PENDING_REVIEW" },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: reviewerId, rejectionReason: reason },
  });
  if (rejected.count !== 1) throw new Error(`Payment ${paymentId} is no longer pending review.`);

  // A group or parent plan's bill is sent in by whoever pays it (a member, a child, cannot), so the payer is the one told, and sent to
  // where they pay it: the Parent page or Billing > Plans. Everyone else's bill goes back to them, with its pay sheet open.
  if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlanId) {
    const { planBillTarget } = await import("@/lib/planBillPayer");
    const target = await planBillTarget(payment.paymentPlanId).catch(() => null);
    if (target?.paysForSomeoneElse) {
      await createNotification({
        userId: target.payer.id,
        type: "PAYMENT_REJECTED",
        title: "Payment rejected",
        body: `The payment for ${target.member.name}'s plan couldn't be verified: ${reason}. Tap Resubmit to send it again.`,
        emailCategory: "payments",
        alwaysEmail: true,
        cta: { label: "Resubmit", path: groupBillPath(target.groupKind) },
      });
      return;
    }
  }

  await createNotification({
    userId: payment.userId,
    type: "PAYMENT_REJECTED",
    title: "Payment rejected",
    body: `Your payment couldn't be verified: ${reason}. Tap Resubmit to send it again.`,
    emailCategory: "payments",
    alwaysEmail: true,
    // Opens Payment history with this payment's pay sheet already open.
    cta: { label: "Resubmit", path: payAgainPath(paymentId) },
  });
}

/** The status of one of the caller's own payments, for the pay screen that waits for it to clear. */
/** A payment is the caller's own, or one the caller pays as a family's payer (a member's monthly bill). */
function ownOrFamilyPaid(userId: string): Prisma.ZellePaymentWhereInput {
  return { OR: [{ userId }, { paymentPlan: { familyGroup: { payerId: userId } } }] };
}

export async function getOwnPaymentStatus(userId: string, paymentId: string): Promise<ZellePaymentStatus | null> {
  const payment = await prisma.zellePayment.findFirst({ where: { id: paymentId, ...ownOrFamilyPaid(userId) }, select: { status: true } });
  return payment?.status ?? null;
}


/** When one of the caller's own payments was submitted, for the "how long has it been waiting" notice. */
export async function getOwnPaymentWaitInfo(userId: string, paymentId: string): Promise<{ status: ZellePaymentStatus; submittedAt: Date | null; amountCents: number } | null> {
  return prisma.zellePayment.findFirst({ where: { id: paymentId, ...ownOrFamilyPaid(userId) }, select: { status: true, submittedAt: true, amountCents: true } });
}
