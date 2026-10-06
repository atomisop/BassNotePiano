import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { addCalendarMonthsClamped } from "@/lib/paymentPlans";
import { resolveEntitlement, TRIAL_DAYS, type CurriculumEntitlement } from "@/lib/entitlementRules";

type Db = Prisma.TransactionClient | typeof prisma;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One derived answer to "can this person see the curriculum right now,"
 * replacing the old stored `hasCurriculumAccess` purchase flag as the source
 * of truth. It's computed from what actually keeps a student paying (a
 * Payment Plan's paid period), so it can't fall out of sync with billing.
 * `User.hasCurriculumAccess` survives only as the admin's complimentary
 * override.
 */
export async function getCurriculumEntitlement(userId: string, db: Db = prisma): Promise<CurriculumEntitlement> {
  const map = await getCurriculumEntitlements([userId], db);
  return map.get(userId) ?? { kind: "NONE", until: null };
}

/** Batch form for the admin matrix: three queries total no matter how many students. */
export async function getCurriculumEntitlements(userIds: string[], db: Db = prisma): Promise<Map<string, CurriculumEntitlement>> {
  const result = new Map<string, CurriculumEntitlement>();
  if (userIds.length === 0) return result;

  const [users, plans] = await Promise.all([
    db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, role: true, hasCurriculumAccess: true, trialEndsAt: true },
    }),
    // installmentsPaid >= 1 is the "money has actually been approved" test.
    // A plan with a payment still awaiting transfer has paid nothing yet.
    db.paymentPlan.findMany({
      where: { userId: { in: userIds }, installmentsPaid: { gte: 1 } },
      select: { userId: true, nextDueDate: true, status: true },
    }),
  ]);

  const paidUntilByUser = new Map<string, Date>();
  for (const plan of plans) {
    // An in-flight plan's nextDueDate has already been advanced to the end of
    // the month just paid. A COMPLETED plan's final installment deliberately
    // doesn't advance it (nothing further is due), so it still points at the
    // START of the last paid month: that month ends one calendar month later.
    // Without this a Monthly plan, which completes on its first approval,
    // would count as already expired the moment it was paid.
    const paidUntil = plan.status === "COMPLETED" ? addCalendarMonthsClamped(plan.nextDueDate, 1) : plan.nextDueDate;
    const current = paidUntilByUser.get(plan.userId);
    if (!current || paidUntil.getTime() > current.getTime()) paidUntilByUser.set(plan.userId, paidUntil);
  }

  const now = new Date();
  for (const user of users) {
    result.set(
      user.id,
      resolveEntitlement(
        {
          isAdmin: user.role === "ADMIN",
          comped: user.hasCurriculumAccess,
          planPaidUntil: paidUntilByUser.get(user.id) ?? null,
          trialEndsAt: user.trialEndsAt,
        },
        now,
      ),
    );
  }
  return result;
}

/**
 * Starts a student's one-time free trial, keyed by email so it works whether
 * the applicant already has an account or registers afterward. A no-op if
 * they've ever had a trial (trialEndsAt is never cleared), which is what
 * makes it one per person rather than one per application.
 */
export async function startTrialForEmail(email: string, db: Db = prisma): Promise<boolean> {
  const user = await db.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" }, trialEndsAt: null, role: "STUDENT" },
    select: { id: true, email: true, emailCanonical: true },
  });
  if (!user) return false;
  // One trial per inbox: a Gmail address with other dots or a plus tag is the same person.
  const canonical = user.emailCanonical ?? canonicalEmail(user.email);
  const alreadyUsed = await db.user.findFirst({
    where: { emailCanonical: canonical, trialEndsAt: { not: null }, id: { not: user.id } },
    select: { id: true },
  });
  if (alreadyUsed) return false;
  await db.user.update({ where: { id: user.id }, data: { trialEndsAt: new Date(Date.now() + TRIAL_DAYS * DAY_MS) } });
  return true;
}

/** Whether an email has an APPROVED class application on file, used at registration to start the trial for people who apply before they sign up. */
export async function hasApprovedRegistration(email: string, db: Db = prisma): Promise<boolean> {
  const row = await db.classRegistration.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" }, status: "APPROVED" },
    select: { id: true },
  });
  return row !== null;
}
