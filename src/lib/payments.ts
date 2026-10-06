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
import { addCalendarMonthsClamped, bookReservedWindowForPlan, describeReservedSlot } from "@/lib/paymentPlans";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { adjustUserCredits } from "@/lib/creditAdjustments";
import { assertRateLimit } from "@/lib/rateLimit";

/**
 * A student who opens the payment modal but never actually confirms a
 * transfer leaves an AWAITING_TRANSFER row behind forever otherwise —
 * cluttering their own billing page and, at larger scale, the DB. Anything
 * this old with no reference code submitted is safe to consider abandoned.
 * Deliberately does NOT touch PENDING_REVIEW — once a student has submitted
 * a reference code, a slow admin shouldn't cause their payment to vanish.
 */
const PENDING_PAYMENT_EXPIRY_DAYS = 7;

/**
 * Lazily sweeps stale AWAITING_TRANSFER rows to EXPIRED. There's no cron
 * here — this runs inline wherever it matters (before creating/reusing a
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
    // case this app's payment-plan reminders are built around — not
    // something that should silently become unpayable the next time anyone
    // loads a billing page.
    where: { status: "AWAITING_TRANSFER", createdAt: { lt: cutoff }, purpose: { not: "PAYMENT_PLAN_INSTALLMENT" } },
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
 * creates a fresh AWAITING_TRANSFER row. Idempotent by design — the
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
  // curriculum price dropping from $99 to $69.99) — the billing page always
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
 * One extra class paid for directly: the student picks a specific open time and
 * pays a flat $55 for it by Zelle or Venmo. The row carries that exact time
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
      amountCents: EXTRA_CLASS_PRICE_CENTS,
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
    throw new FamilyBundleError("That plan length is no longer offered. Pick Monthly, 3-Month, or 6-Month.");
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

  const { totalCents, creditsPerRecipient } = calculateFamilyBundleTotal(input.cadence, input.term, normalized.length);

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
  method?: "ZELLE" | "VENMO";
}

/**
 * Records the student's "I've sent it" confirmation and moves the payment
 * into PENDING_REVIEW. Allowed from AWAITING_TRANSFER (first submission) or
 * REJECTED (resubmission after a failed match) — anything else means the
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
  if (payment.userId !== userId) {
    throw new AccessDeniedError(`Payment ${paymentId} does not belong to user ${userId}`);
  }
  if (payment.status !== "AWAITING_TRANSFER" && payment.status !== "REJECTED") {
    throw new Error(`Payment ${paymentId} is not open for submission (status: ${payment.status})`);
  }

  // STEP 20: submission (unlike most other rate-limited actions here)
  // updates an existing row rather than inserting a new one, so this counts
  // against `submittedAt`, not `createdAt` — see assertRateLimit's
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
      senderName: input.senderName,
      // Explicit null, not just omitted: a REJECTED payment being
      // resubmitted could otherwise keep whatever referenceCode a legacy
      // submission (from before this field was retired) left behind,
      // which would misleadingly attach an old code to a new submission
      // that never provided one.
      referenceCode: null,
      note: input.note,
      method: input.method === "VENMO" ? "VENMO" : "ZELLE",
      status: "PENDING_REVIEW",
      submittedAt: new Date(),
      rejectionReason: null,
    },
  });
  const submitted = await prisma.zellePayment.findUniqueOrThrow({ where: { id: paymentId } });
  if (claimed.count !== 1) return submitted; // already settled while this request was running

  // If the money's email already arrived, settle now, otherwise fall back to
  // the returning-student rule.
  if (!(await settleWithStoredReceipt(submitted.id).catch(() => false))) {
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
      select: { status: true, amountCents: true, method: true, paymentPlanId: true, installmentNumber: true, user: { select: { name: true, email: true } } },
    });
    if (!payment || payment.status !== "PENDING_REVIEW") return;
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
          OR: [{ autoApproved: false }, { checkedAt: { not: null } }],
        },
      }),
      prisma.zellePayment.count({ where: { userId: payment.userId, status: "REJECTED", reviewedAt: { gte: since } } }),
      prisma.zellePayment.count({
        where: { userId: payment.userId, status: "VERIFIED", autoApproved: true, checkedAt: null },
      }),
    ]);
    if (trusted < AUTO_APPROVE_MIN_VERIFIED || recentReject > 0 || unchecked > 0) return;
    await approveZellePayment(payment.id, null, { auto: true });
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
    cta: { label: "Check the payment", path: "/admin/payments?status=VERIFIED" },
  });
}

/** Admin confirms an auto-approved payment really arrived. */
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
  paymentPlan: { select: { cadence: true, term: true, termMonths: true } },
} satisfies Prisma.ZellePaymentInclude;

export type UserPaymentRecord = Prisma.ZellePaymentGetPayload<{ include: typeof paymentWithScaleInclude }>;

/** Every payment a student has ever submitted, newest first — their receipts/history view. */
export async function getUserPaymentHistory(userId: string): Promise<UserPaymentRecord[]> {
  await expireStalePendingPayments();
  return prisma.zellePayment.findMany({
    where: { userId },
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
 * Full admin payment listing, optionally filtered to one status — powers
 * the richer "all payments" view (verified/rejected/expired history), not
 * just the live pending queue.
 */
export async function getAdminPayments(status?: ZellePaymentStatus | "UNCHECKED"): Promise<PendingZellePayment[]> {
  await expireStalePendingPayments();
  return prisma.zellePayment.findMany({
    where: status === "UNCHECKED" ? { autoApproved: true, checkedAt: null } : status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: pendingPaymentInclude,
  });
}

/**
 * Approves a pending payment and applies its real-world effect — granting
 * curriculum access, adding lesson credits, or (for a legacy grandfathered
 * row) unlocking the one scale it was for. Both the status flip and the
 * entitlement grant happen here so the two can never drift apart (a
 * VERIFIED payment that never actually unlocked anything).
 */
export async function approveZellePayment(paymentId: string, reviewerId: string | null, opts?: { auto?: boolean }) {
  // STEP 19: the status flip and the entitlement grant used to be two (or
  // three, counting the legacy-scale read) separate, un-transacted writes.
  // The docstring above already says the point is that they "can never
  // drift apart" — a crash or a thrown error between the update and the
  // grant used to be able to produce exactly that: a VERIFIED payment that
  // never actually unlocked anything. Wrapping the read-check through the
  // entitlement grant in one `$transaction` makes that state unreachable —
  // either the whole thing commits, or none of it does. The notification
  // stays outside: it's a best-effort side effect, not part of what has to
  // be atomic, and a notification failure shouldn't roll back a real grant.
  // Only meaningful for a CLASS_CREDITS row carrying extraSessionScheduleId
  // (the Schedule screen's guided flow), set inside the transaction below,
  // read afterward to pick the right notification copy. Undefined for every
  // other purpose, and for a legacy CLASS_CREDITS row with no occurrence to
  // book at all.
  let extraSessionBooked: boolean | undefined;

  // Serializable, matching bookClass/bookFamilyClass/createPaymentPlan's own
  // isolation level for the exact same reason: bookExtraSessionOccurrence
  // below does its own find-then-create for the CLASS_CREDITS branch, and
  // Read Committed wouldn't stop two concurrent approvals for two different
  // students' extra sessions on the same occurrence from both passing that
  // check before either commits. Caught below the same way those callers
  // already catch it, a friendly retry message instead of a raw P2034.
  let payment;
  try {
    payment = await prisma.$transaction(
      async (tx) => {
        const payment = await tx.zellePayment.findUniqueOrThrow({ where: { id: paymentId } });
        if (payment.status !== "PENDING_REVIEW") {
          throw new Error(`Payment ${paymentId} is not pending review (status: ${payment.status})`);
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
          // Fetched before granting (unlike the other branches) because the
          // grant's own expiresAt needs it: this installment's credits are good
          // through the end of the cycle it's paying for, exactly when the
          // *next* installment becomes due. cycleEnd is computed once and
          // reused for both, below.
          const plan = await tx.paymentPlan.findUnique({ where: { id: payment.paymentPlanId } });
          // The first month starts when the first payment is approved, not when the plan was
          // created, so a student who pays a few days after signing up still gets a full month.
          const cycleStart = plan && plan.installmentsPaid === 0 && plan.nextDueDate < new Date() ? new Date() : plan?.nextDueDate;
          const cycleEnd = plan && cycleStart ? addCalendarMonthsClamped(cycleStart, 1) : null;

          // Quantity is snapshotted onto the payment row at installment-creation
          // time (see createPaymentPlan/getOrCreateOpenInstallmentPayment in
          // paymentPlans.ts).
          await grantCredits(
            payment.userId,
            payment.lessonQuantity,
            { source: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: payment.paymentPlanId, expiresAt: cycleEnd },
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
            const isComplete = installmentsPaid >= plan.termMonths;
            await tx.paymentPlan.update({
              where: { id: plan.id },
              data: {
                installmentsPaid,
                status: isComplete ? "COMPLETED" : "ACTIVE",
                nextDueDate: isComplete ? plan.nextDueDate : cycleEnd,
              },
            });
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

  // The plan's weekly classes for the period just paid for go on the calendar
  // (and into the admin's Attendance list) right now, not at tomorrow's job.
  if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlanId) {
    await bookReservedWindowForPlan(payment.paymentPlanId);

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
          cta: { label: "See the subscriber", path: "/admin/payment-plans" },
        });
      } catch (err) {
        console.error("New subscriber notification failed (non-blocking):", err);
      }
    }
  }

  let notificationBody = "Your payment was verified.";
  if (payment.purpose === "CURRICULUM") {
    notificationBody = "Your $69.99 curriculum payment was verified. Every scale is unlocked, for good.";
  } else if (payment.purpose === "CLASS_CREDITS" && payment.extraSessionScheduleId) {
    notificationBody = extraSessionBooked
      ? "Your extra session payment was verified and the class is booked. See it on your Schedule."
      : "Your extra session payment was verified, but that time was taken in the meantime. Pick another open time from Lessons, your credit is already on your account.";
  } else if (payment.purpose === "CLASS_CREDITS" && payment.lessonQuantity) {
    const classes = Math.max(1, Math.round(payment.lessonQuantity / CREDITS_PER_CLASS));
    notificationBody = `Your ${classes} extra class${classes === 1 ? "" : "es"} payment was verified. They are on your account, ready to book.`;
  } else if (payment.purpose === "FAMILY_BUNDLE" && payment.lessonQuantity) {
    notificationBody = `Your family bundle payment was verified. ${payment.lessonQuantity} class credit${payment.lessonQuantity === 1 ? "" : "s"} each went out to everyone in the bundle.`;
  } else if (payment.purpose === "CURRICULUM_FAMILY_BUNDLE") {
    notificationBody = "Your curriculum family bundle payment was verified. Every scale is unlocked, for good, for everyone in the bundle.";
  } else if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlanId && payment.lessonQuantity) {
    const plan = await prisma.paymentPlan.findUnique({ where: { id: payment.paymentPlanId } });
    const ordinal = payment.installmentNumber ?? plan?.installmentsPaid ?? 1;
    const creditsNote = `${payment.lessonQuantity} class credit${payment.lessonQuantity === 1 ? "" : "s"} ${payment.lessonQuantity === 1 ? "is" : "are"} on your account`;
    notificationBody = plan
      ? `Installment ${ordinal} of ${plan.termMonths} was verified. ${creditsNote}.`
      : `Your payment plan installment was verified. ${creditsNote}.`;
  } else if (payment.scaleGroupId) {
    const scaleGroup = await prisma.scaleGroup.findUniqueOrThrow({ where: { id: payment.scaleGroupId } });
    notificationBody = `Your payment for ${scaleGroup.code}: ${scaleGroup.title} was verified. It's unlocked now.`;
  }

  await createNotification({
    userId: payment.userId,
    type: "PAYMENT_APPROVED",
    title: "Payment approved",
    body: notificationBody,
    emailCategory: "payments",
  });

  // A completed plan is a distinct milestone worth its own bell entry, on
  // top of the ordinary "payment approved" above — same "more than one
  // notification can come out of one approval" shape FAMILY_BUNDLE already
  // uses below for its per-recipient notices.
  if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlanId) {
    const plan = await prisma.paymentPlan.findUnique({ where: { id: payment.paymentPlanId } });
    if (plan?.status === "COMPLETED") {
      await createNotification({
        userId: payment.userId,
        type: "PAYMENT_PLAN_COMPLETED",
        title: "Payment plan complete",
        body: `You've paid off your ${plan.termMonths}-month plan in full. Nice work.`,
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
          title: `${payment.lessonQuantity} class credit${payment.lessonQuantity === 1 ? "" : "s"} added`,
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
 * app (Zelle or Venmo); this keeps the books and the student's account in step:
 * it leaves revenue, and can also take back the credits it gave and end the
 * plan it paid for.
 */
export async function refundZellePayment(
  paymentId: string,
  admin: { id: string; email: string | null },
  opts: { note: string; removeCredits: boolean; cancelPlan: boolean },
): Promise<void> {
  const note = opts.note.trim();
  if (!note) throw new Error("A reason is required.");
  const payment = await prisma.zellePayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { user: { select: { id: true, email: true, classCredits: true } } },
  });
  if (payment.status !== "VERIFIED") throw new Error("Only a verified payment can be refunded.");

  await prisma.zellePayment.update({ where: { id: paymentId }, data: { status: "REFUNDED", refundedAt: new Date(), refundNote: note } });

  if (opts.removeCredits && payment.lessonQuantity) {
    const take = Math.min(payment.user.classCredits, payment.lessonQuantity);
    if (take > 0) await adjustUserCredits(admin.id, payment.userId, -take, `Refund: ${note}`);
  }
  if (opts.cancelPlan && payment.paymentPlanId) {
    const { cancelPaymentPlan } = await import("@/lib/paymentPlans");
    await cancelPaymentPlan(payment.paymentPlanId, admin.id, `Refund: ${note}`).catch(() => undefined);
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
    detail: `${formatUsdCents(payment.amountCents)} to ${payment.user.email}${opts.removeCredits ? ", credits removed" : ""}${opts.cancelPlan ? ", plan canceled" : ""}. ${note}`,
  });
}

/** Rejects a pending payment with a reason the student sees on the resubmit screen. */
export async function rejectZellePayment(paymentId: string, reviewerId: string, reason: string) {
  const payment = await prisma.zellePayment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status !== "PENDING_REVIEW") {
    throw new Error(`Payment ${paymentId} is not pending review (status: ${payment.status})`);
  }

  await prisma.zellePayment.update({
    where: { id: paymentId },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: reviewerId, rejectionReason: reason },
  });

  await createNotification({
    userId: payment.userId,
    type: "PAYMENT_REJECTED",
    title: "Payment rejected",
    body: `Your payment couldn't be verified: ${reason}. You can resubmit it from your billing page.`,
    emailCategory: "payments",
  });
}

/** The status of one of the caller's own payments, for the pay screen that waits for it to clear. */
export async function getOwnPaymentStatus(userId: string, paymentId: string): Promise<ZellePaymentStatus | null> {
  const payment = await prisma.zellePayment.findFirst({ where: { id: paymentId, userId }, select: { status: true } });
  return payment?.status ?? null;
}

