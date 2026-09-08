// Secondary bookkeeping for User.classCredits — see CreditGrant's own schema
// comment for the full picture. User.classCredits stays the fast,
// authoritative balance every existing reader (getEffectiveClassCredits,
// the dashboard, admin views, Atom's prompt) keeps reading, completely
// unchanged. Every function here answers a narrower question this ledger
// exists for — "which batch of credits is this, where did it come from,
// when does it lapse" — and is never allowed to become a blocking
// dependency of the real balance mutation it runs alongside.
//
// The CreditGrant write in grantCredits/drawDownCredits is deliberately run
// on the plain `prisma` client, never on a `db`/`tx` a caller passes in for
// the real classCredits mutation — see each function's own comment for why:
// a caught JS error can't undo an already-aborted Postgres transaction, so
// running the ledger write on its own independent connection is what
// actually guarantees a ledger hiccup can never take the real mutation down
// with it. Worst-case drift from that decoupling is exactly what the design
// already accepts: a credit expiring a little early/late, or an inert
// phantom grant row if an outer transaction later rolls back for an
// unrelated reason — never a double-charge, never a broken booking.

import type { CreditGrantSource, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface GrantCreditsOptions {
  source: CreditGrantSource;
  /** Omit (or null) for non-expiring — only a PAYMENT_PLAN_INSTALLMENT grant should ever pass a real date. */
  expiresAt?: Date | null;
  /** Only meaningful for source === "PAYMENT_PLAN_INSTALLMENT". */
  paymentPlanId?: string;
}

/**
 * Records a CreditGrant row on its own, without touching User.classCredits
 * — for a caller that already mutated the balance itself (adjustUserCredits
 * has its own correctness-critical read-then-set reject-if-negative logic
 * that this function's blind {increment} shouldn't replicate) and just
 * needs the ledger bookkeeping recorded alongside it. Best-effort, same as
 * every other write in this file — see the file header for why this always
 * runs on the plain `prisma` client rather than a caller's `tx`.
 */
export async function recordCreditGrant(userId: string, quantity: number, options: GrantCreditsOptions): Promise<void> {
  try {
    await prisma.creditGrant.create({
      data: {
        userId,
        source: options.source,
        paymentPlanId: options.paymentPlanId,
        creditsGranted: quantity,
        creditsRemaining: quantity,
        expiresAt: options.expiresAt ?? null,
      },
    });
  } catch (err) {
    console.error(`CreditGrant ledger write failed for user ${userId} (non-blocking):`, err);
  }
}

/**
 * Increments User.classCredits exactly like the older addClassCredits (see
 * classSchedule.ts) — via `db`, so it's atomic with whatever else the caller
 * is doing in the same transaction, unchanged from today — plus a
 * best-effort CreditGrant row (via recordCreditGrant) recording where these
 * credits came from and when they lapse. Replaces every addClassCredits
 * call site that grants credits for a reason worth recording (a verified
 * payment); addClassCredits itself is unchanged and still exists, just no
 * longer called directly from those sites.
 *
 * Deliberately doesn't import/call addClassCredits itself (classSchedule.ts
 * calls back into this file for drawDownCredits — importing the other
 * direction too would be a cycle), it just does the exact same one-line
 * increment directly.
 */
export async function grantCredits(
  userId: string,
  quantity: number,
  options: GrantCreditsOptions,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { classCredits: { increment: quantity } } });
  await recordCreditGrant(userId, quantity, options);
}

/**
 * Best-effort draw-down against the ledger, mirroring a real spend
 * (markAttendance's charge, or an admin's manual deduction) — never the
 * source of truth for whether that spend is allowed, purely bookkeeping on
 * top of the real User.classCredits decrement the caller already made.
 * Consumes the soonest-expiring grants first (expiresAt ascending, nulls —
 * non-expiring grants — last, then oldest-granted first), so a student's
 * most time-sensitive credits are the ones actually recorded as spent
 * before their non-expiring ones. If the ledger's own total falls short of
 * `quantity` (drift), it just does as much as it can and returns — never
 * throws, never blocks the caller.
 */
export async function drawDownCredits(userId: string, quantity: number): Promise<void> {
  if (quantity <= 0) return;
  try {
    const grants = await prisma.creditGrant.findMany({
      where: { userId, creditsRemaining: { gt: 0 }, expiredAt: null },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { grantedAt: "asc" }],
    });
    let remaining = quantity;
    for (const grant of grants) {
      if (remaining <= 0) break;
      const take = Math.min(grant.creditsRemaining, remaining);
      await prisma.creditGrant.update({ where: { id: grant.id }, data: { creditsRemaining: { decrement: take } } });
      remaining -= take;
    }
  } catch (err) {
    console.error(`CreditGrant ledger draw-down failed for user ${userId} (non-blocking):`, err);
  }
}

export interface ExpiredGrantSummary {
  userId: string;
  grantId: string;
  creditsExpired: number;
}

/**
 * Sweeps every CreditGrant whose expiresAt has passed and still has credits
 * left, decrements User.classCredits by the unused amount, and stamps the
 * grant expiredAt. Each grant is processed in its own transaction,
 * re-reading both the grant's creditsRemaining and the user's current
 * classCredits fresh inside it — not from this function's outer query
 * snapshot — so a concurrent markAttendance/drawDownCredits draw-down can't
 * race this and cause a double-decrement. The amount actually taken off
 * classCredits is floored at the user's real current balance (never the raw
 * creditsRemaining), so a ledger that's drifted high can never push
 * classCredits negative — the primary balance is protected even when the
 * secondary bookkeeping isn't perfectly in sync with it.
 *
 * Returns one summary per grant that actually had something expired, for
 * the caller (netlify/functions/credit-expiry.ts) to notify the student
 * from.
 */
export async function expireDueCreditGrants(now: Date = new Date()): Promise<ExpiredGrantSummary[]> {
  const due = await prisma.creditGrant.findMany({
    where: { expiresAt: { lte: now }, expiredAt: null, creditsRemaining: { gt: 0 } },
    select: { id: true },
  });

  const summaries: ExpiredGrantSummary[] = [];
  for (const { id } of due) {
    const summary = await prisma.$transaction(async (tx) => {
      const grant = await tx.creditGrant.findUnique({ where: { id } });
      if (!grant || grant.expiredAt || grant.creditsRemaining <= 0) return null;

      const user = await tx.user.findUniqueOrThrow({ where: { id: grant.userId }, select: { classCredits: true } });
      const toExpire = Math.min(grant.creditsRemaining, user.classCredits);

      if (toExpire > 0) {
        await tx.user.update({ where: { id: grant.userId }, data: { classCredits: { decrement: toExpire } } });
      }
      await tx.creditGrant.update({ where: { id: grant.id }, data: { expiredAt: now } });

      return toExpire > 0 ? { userId: grant.userId, grantId: grant.id, creditsExpired: toExpire } : null;
    });
    if (summary) summaries.push(summary);
  }
  return summaries;
}

// How far ahead of a grant's own expiresAt to send the one-time "these are
// about to lapse" notice — long enough that a student who skipped a week
// still has a real chance to book a makeup class before forfeiture, short
// enough that the warning is still relevant to *this* cycle rather than
// firing against credits that still have weeks of normal use left.
const EXPIRY_WARNING_LEAD_DAYS = 5;

export interface ExpiringSoonGrantSummary {
  userId: string;
  grantId: string;
  creditsRemaining: number;
  expiresAt: Date;
}

/**
 * Finds CreditGrants expiring within the next EXPIRY_WARNING_LEAD_DAYS days
 * that still have unused credits and haven't already been warned about,
 * and marks them warned. Purely a heads-up: unlike expireDueCreditGrants,
 * this never touches classCredits or creditsRemaining — nothing has
 * actually lapsed yet, so there's nothing to charge or reconcile, just a
 * notify-once guard to set. Low enough stakes (a duplicate notice at worst,
 * never a balance error) that this doesn't need expireDueCreditGrants's own
 * per-row transaction — one query to find the grants, one to mark them.
 *
 * Returns one summary per grant just warned, for the caller
 * (netlify/functions/credit-expiry.ts) to notify the student from.
 */
export async function warnExpiringSoonCreditGrants(now: Date = new Date()): Promise<ExpiringSoonGrantSummary[]> {
  const warningWindowEnd = new Date(now.getTime() + EXPIRY_WARNING_LEAD_DAYS * 24 * 60 * 60 * 1000);
  const dueSoon = await prisma.creditGrant.findMany({
    where: {
      expiresAt: { gt: now, lte: warningWindowEnd },
      expiringSoonNotifiedAt: null,
      expiredAt: null,
      creditsRemaining: { gt: 0 },
    },
  });
  if (dueSoon.length === 0) return [];

  await prisma.creditGrant.updateMany({ where: { id: { in: dueSoon.map((g) => g.id) } }, data: { expiringSoonNotifiedAt: now } });

  return dueSoon.map((grant) => ({
    userId: grant.userId,
    grantId: grant.id,
    creditsRemaining: grant.creditsRemaining,
    expiresAt: grant.expiresAt!, // guaranteed by the where clause's expiresAt: { gt: now } above
  }));
}
