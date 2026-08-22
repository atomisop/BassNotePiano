import type { Prisma, ZellePaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AccessDeniedError, unlockScaleForUser, grantCurriculumAccess } from "@/lib/access";
import { addClassCredits } from "@/lib/classSchedule";
import { calculateClassCreditTotal } from "@/lib/classCreditPricing";
import { createNotification } from "@/lib/notifications";
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
    where: { status: "AWAITING_TRANSFER", createdAt: { lt: cutoff } },
    data: { status: "EXPIRED" },
  });
}

interface PendingPaymentParams {
  userId: string;
  purpose: "CURRICULUM" | "CLASS_CREDITS";
  amountCents: number;
  zelleHandle: string;
  // Field name kept as lessonQuantity in the DB (pre-dates the class-credit
  // system, and the underlying meaning never changed — it's always been
  // "count of 30-minute units") rather than adding another rename migration
  // on top of the purpose rename this same change already makes.
  lessonQuantity?: number;
}

/**
 * Finds the in-flight Zelle payment for this user+purpose if one exists, or
 * creates a fresh AWAITING_TRANSFER row. Idempotent by design — the billing
 * pages call this on every load, and a page refresh shouldn't spawn a new
 * row every time a student revisits before submitting a reference code.
 *
 * For CLASS_CREDITS, quantity is part of the identity key rather than just
 * being stored — a student who changes their quantity selector between
 * visits should get a fresh pending row for the new total, not have their
 * earlier in-flight row silently mutated. Any row left behind by an
 * abandoned quantity choice self-expires via expireStalePendingPayments().
 */
async function getOrCreatePendingZellePayment({
  userId,
  purpose,
  amountCents,
  zelleHandle,
  lessonQuantity,
}: PendingPaymentParams) {
  await expireStalePendingPayments();

  const existing = await prisma.zellePayment.findFirst({
    where: {
      userId,
      purpose,
      lessonQuantity: lessonQuantity ?? null,
      status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] },
    },
    orderBy: { createdAt: "desc" },
  });
  // A reused row can predate a price change for this purpose (e.g. the
  // curriculum price dropping from $200 to $99) — the billing page always
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

export function getOrCreatePendingCurriculumPayment(userId: string, amountCents: number, zelleHandle: string) {
  return getOrCreatePendingZellePayment({ userId, purpose: "CURRICULUM", amountCents, zelleHandle });
}

export function getOrCreatePendingClassCreditsPayment(userId: string, quantity: number, zelleHandle: string) {
  const { totalCents } = calculateClassCreditTotal(quantity);
  return getOrCreatePendingZellePayment({
    userId,
    purpose: "CLASS_CREDITS",
    amountCents: totalCents,
    zelleHandle,
    lessonQuantity: quantity,
  });
}

export interface ZelleReferenceSubmission {
  senderName: string;
  referenceCode: string;
  note?: string;
}

/**
 * Records the student's "I've sent it" confirmation and moves the payment
 * into PENDING_REVIEW. Allowed from AWAITING_TRANSFER (first submission) or
 * REJECTED (resubmission after a failed match) — anything else means the
 * payment is already settled or mid-review, so resubmitting is rejected.
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
    { windowMinutes: 60, max: 10, timestampField: "submittedAt", message: "Too many submissions — please wait a bit and try again." },
  );

  return prisma.zellePayment.update({
    where: { id: paymentId },
    data: {
      senderName: input.senderName,
      referenceCode: input.referenceCode,
      note: input.note,
      status: "PENDING_REVIEW",
      submittedAt: new Date(),
      rejectionReason: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Student-facing payment history
// ---------------------------------------------------------------------------

const paymentWithScaleInclude = {
  scaleGroup: { select: { slug: true, code: true, title: true } },
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
} satisfies Prisma.ZellePaymentInclude;

export type PendingZellePayment = Prisma.ZellePaymentGetPayload<{ include: typeof pendingPaymentInclude }>;

/** Everything awaiting manual review, oldest submission first — the admin queue's default view. */
export async function getPendingZellePayments(): Promise<PendingZellePayment[]> {
  return getAdminPayments("PENDING_REVIEW");
}

/**
 * Full admin payment listing, optionally filtered to one status — powers
 * the richer "all payments" view (verified/rejected/expired history), not
 * just the live pending queue.
 */
export async function getAdminPayments(status?: ZellePaymentStatus): Promise<PendingZellePayment[]> {
  await expireStalePendingPayments();
  return prisma.zellePayment.findMany({
    where: status ? { status } : undefined,
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
export async function approveZellePayment(paymentId: string, reviewerId: string) {
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
  const payment = await prisma.$transaction(async (tx) => {
    const payment = await tx.zellePayment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status !== "PENDING_REVIEW") {
      throw new Error(`Payment ${paymentId} is not pending review (status: ${payment.status})`);
    }

    await tx.zellePayment.update({
      where: { id: paymentId },
      data: { status: "VERIFIED", reviewedAt: new Date(), reviewedById: reviewerId },
    });

    if (payment.purpose === "CURRICULUM") {
      await grantCurriculumAccess(payment.userId, tx);
    } else if (payment.purpose === "CLASS_CREDITS" && payment.lessonQuantity) {
      await addClassCredits(payment.userId, payment.lessonQuantity, tx);
    } else if (payment.scaleGroupId) {
      // Legacy Pay-As-You-Go row from before per-scale purchase was retired.
      const scaleGroup = await tx.scaleGroup.findUniqueOrThrow({ where: { id: payment.scaleGroupId } });
      await unlockScaleForUser(payment.userId, scaleGroup.slug, tx);
    }

    return payment;
  });

  let notificationBody = "Your payment was verified.";
  if (payment.purpose === "CURRICULUM") {
    notificationBody = "Your $99 curriculum payment was verified — every scale is unlocked, for good.";
  } else if (payment.purpose === "CLASS_CREDITS" && payment.lessonQuantity) {
    const { discountCents } = calculateClassCreditTotal(payment.lessonQuantity);
    const discountNote = discountCents > 0 ? " — bundle discount applied" : "";
    notificationBody = `Your ${payment.lessonQuantity} class credit${payment.lessonQuantity === 1 ? "" : "s"} payment was verified${discountNote}. Credits are on your account.`;
  } else if (payment.scaleGroupId) {
    const scaleGroup = await prisma.scaleGroup.findUniqueOrThrow({ where: { id: payment.scaleGroupId } });
    notificationBody = `Your payment for ${scaleGroup.code} — ${scaleGroup.title} was verified. It's unlocked now.`;
  }

  await createNotification({
    userId: payment.userId,
    type: "PAYMENT_APPROVED",
    title: "Payment approved",
    body: notificationBody,
    emailCategory: "payments",
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
