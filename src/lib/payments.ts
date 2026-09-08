import type { Prisma, ZellePaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AccessDeniedError, unlockScaleForUser, grantCurriculumAccess } from "@/lib/access";
import { grantCredits } from "@/lib/creditLedger";
import {
  calculateClassCreditTotal,
  calculateFamilyBundleTotal,
  MIN_FAMILY_BUNDLE_RECIPIENTS,
} from "@/lib/classCreditPricing";
import { addCalendarMonthsClamped } from "@/lib/paymentPlans";
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
  purpose: "CURRICULUM";
  amountCents: number;
  zelleHandle: string;
}

/**
 * Finds the in-flight Zelle payment for this user+purpose if one exists, or
 * creates a fresh AWAITING_TRANSFER row. Idempotent by design — the
 * curriculum billing page calls this on every load, and a page refresh
 * shouldn't spawn a new row every time a student revisits before submitting
 * a reference code.
 *
 * Only CURRICULUM goes through this now. CLASS_CREDITS's own individual
 * a-la-carte purchase path was removed once Payment Plans covered every
 * solo case (see paymentPlans.ts) — FAMILY_BUNDLE and
 * PAYMENT_PLAN_INSTALLMENT both already had their own, non-idempotent
 * creation paths for reasons specific to each (see createFamilyBundlePayment
 * and getOrCreateOpenInstallmentPayment), so this was never their shared
 * helper to begin with.
 */
async function getOrCreatePendingZellePayment({ userId, purpose, amountCents, zelleHandle }: PendingPaymentParams) {
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
    data: { userId, purpose, amountCents, zelleHandle, status: "AWAITING_TRANSFER" },
  });
}

export function getOrCreatePendingCurriculumPayment(userId: string, amountCents: number, zelleHandle: string) {
  return getOrCreatePendingZellePayment({ userId, purpose: "CURRICULUM", amountCents, zelleHandle });
}

// ---------------------------------------------------------------------------
// Family bundle: one credit tier bought at once for 2+ separate,
// already-existing accounts (a parent buying the same bundle for each of
// her kids' own accounts, say), an extra 25% off the combined total. The
// entire point of this section is that "2+ real accounts" is *verified*,
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
  tierQuantity: number;
  recipientEmails: string[];
  zelleHandle: string;
}

/**
 * Creates the AWAITING_TRANSFER payment for a family bundle, after
 * re-verifying every recipient server-side. Never trusts whatever the
 * client's own live-check UI showed, since that's just UX, not the actual
 * authorization boundary. Not idempotent the way getOrCreatePendingZellePayment
 * is (a repeat visit always creates a fresh row): matching an "identical"
 * prior attempt would mean comparing tier + the exact set of recipient
 * emails, which isn't worth the complexity for what should be a rare,
 * deliberate purchase. An abandoned row still self-expires via
 * expireStalePendingPayments() like every other pending payment does.
 */
export async function createFamilyBundlePayment(input: FamilyBundlePurchaseInput) {
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

  const creditsPerRecipient = calculateClassCreditTotal(input.tierQuantity).quantity;
  const { totalCents } = calculateFamilyBundleTotal(input.tierQuantity, normalized.length);

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
      // Legacy rows only (the a-la-carte purchase path itself was removed) —
      // non-expiring, same as it always was for anyone who bought this way.
      await grantCredits(payment.userId, payment.lessonQuantity, { source: "CLASS_CREDITS", expiresAt: null }, tx);
    } else if (payment.purpose === "FAMILY_BUNDLE") {
      // Credits go to every recipient row, not payment.userId: the payer
      // isn't necessarily a recipient themselves (see createFamilyBundlePayment).
      // Non-expiring — only a Payment Plan installment's credits expire.
      const recipients = await tx.familyBundleRecipient.findMany({ where: { paymentId: payment.id } });
      for (const recipient of recipients) {
        await grantCredits(recipient.userId, recipient.creditsGranted, { source: "FAMILY_BUNDLE", expiresAt: null }, tx);
      }
    } else if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlanId && payment.lessonQuantity) {
      // Fetched before granting (unlike the other branches) because the
      // grant's own expiresAt needs it: this installment's credits are good
      // through the end of the cycle it's paying for — exactly when the
      // *next* installment becomes due. cycleEnd is computed once and
      // reused for both, below.
      const plan = await tx.paymentPlan.findUnique({ where: { id: payment.paymentPlanId } });
      const cycleEnd = plan ? addCalendarMonthsClamped(plan.nextDueDate, 1) : null;

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
      // in-flight Zelle transfer). Credits are still granted above — real
      // money changed hands, and refusing them would just generate a
      // support conversation — but a canceled plan's own progress is left
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
  });

  let notificationBody = "Your payment was verified.";
  if (payment.purpose === "CURRICULUM") {
    notificationBody = "Your $69.99 curriculum payment was verified — every scale is unlocked, for good.";
  } else if (payment.purpose === "CLASS_CREDITS" && payment.lessonQuantity) {
    const { discountCents } = calculateClassCreditTotal(payment.lessonQuantity);
    const discountNote = discountCents > 0 ? " — bundle discount applied" : "";
    notificationBody = `Your ${payment.lessonQuantity} class credit${payment.lessonQuantity === 1 ? "" : "s"} payment was verified${discountNote}. Credits are on your account.`;
  } else if (payment.purpose === "FAMILY_BUNDLE" && payment.lessonQuantity) {
    notificationBody = `Your family bundle payment was verified. ${payment.lessonQuantity} class credit${payment.lessonQuantity === 1 ? "" : "s"} each went out to everyone in the bundle.`;
  } else if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlanId && payment.lessonQuantity) {
    const plan = await prisma.paymentPlan.findUnique({ where: { id: payment.paymentPlanId } });
    const ordinal = payment.installmentNumber ?? plan?.installmentsPaid ?? 1;
    const creditsNote = `${payment.lessonQuantity} class credit${payment.lessonQuantity === 1 ? "" : "s"} ${payment.lessonQuantity === 1 ? "is" : "are"} on your account`;
    notificationBody = plan
      ? `Installment ${ordinal} of ${plan.termMonths} was verified. ${creditsNote}.`
      : `Your payment plan installment was verified. ${creditsNote}.`;
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
