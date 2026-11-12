import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { addBillingCycles } from "@/lib/billingCycle";
import { resolveEntitlement, type CurriculumEntitlement } from "@/lib/entitlementRules";
import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";

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
      select: { userId: true, nextDueDate: true, status: true, cancellationNote: true },
    }),
  ]);

  const paidUntilByUser = new Map<string, Date>();
  for (const plan of plans) {
    // A plan the owner ended with a refund gives no access: the money went back, so the paid period is not paid any more.
    // (Undoing the refund restores the plan, and with it the access.)
    if (plan.status === "CANCELED" && plan.cancellationNote?.startsWith("Refund:")) continue;
    // An in-flight plan's nextDueDate has already been advanced to the end of
    // the cycle just paid. A COMPLETED plan's final installment deliberately
    // doesn't advance it (nothing further is due), so it still points at the
    // START of the last paid cycle: that cycle ends 28 days later.
    // Without this a Monthly plan, which completes on its first approval,
    // would count as already expired the moment it was paid.
    const paidUntil = plan.status === "COMPLETED" ? addBillingCycles(plan.nextDueDate, 1) : plan.nextDueDate;
    const current = paidUntilByUser.get(plan.userId);
    if (!current || paidUntil.getTime() > current.getTime()) paidUntilByUser.set(plan.userId, paidUntil);
  }

  const now = new Date();
  const graceDays = await getNumberSetting("access.planGraceDays");
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
        graceDays,
      ),
    );
  }
  return result;
}

/**
 * Starts a student's one-time free trial (every new account, at sign-up). A
 * no-op if they've ever had a trial (trialEndsAt is never cleared), and the
 * trial-used marker keeps it one per inbox even after an account is deleted.
 */
export async function startTrialForEmail(email: string, db: Db = prisma): Promise<boolean> {
  if (!(await getBoolSetting("trial.enabled"))) return false;
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
  // Remembered for good, even if the account is deleted: without this, deleting an account and registering the same inbox
  // again was a second free trial. Claimed atomically (the key is unique), so two quick sign-ups cannot both win it.
  const marker = `trial-used:${canonical}`;
  try {
    await db.appSetting.create({ data: { key: marker, value: String(Date.now()) } });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return false;
    throw err;
  }
  try {
    await db.user.update({ where: { id: user.id }, data: { trialEndsAt: new Date(Date.now() + (await getNumberSetting("trial.days")) * DAY_MS) } });
  } catch (err) {
    await db.appSetting.deleteMany({ where: { key: marker } }).catch(() => undefined);
    throw err;
  }
  return true;
}
