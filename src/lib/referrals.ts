import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { addCalendarMonthsClamped } from "@/lib/paymentPlans";
import { applyToRunningPlan } from "@/lib/accountDiscounts";
import { noticePlanUpdated } from "@/lib/studentNotices";
import { makeReferralCode, normalizeReferralCode, isQualifyingReferralTerm, rewardWouldHelp, REFERRAL_MONTHS, REFERRAL_PERCENT } from "@/lib/referralRules";

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** The person's own code, made the first time it is asked for. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (existing?.referralCode) return existing.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeReferralCode();
    try {
      const updated = await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } });
      if (updated.count === 0) return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } })).referralCode!;
      return code;
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err; // another account has that code: try a new one
    }
  }
  throw new Error("Could not make a referral code.");
}

/** Called at sign-up when the link carried a code. Never throws; a bad or own code is simply ignored. */
export async function attachReferral(newUserId: string, rawCode: unknown): Promise<boolean> {
  try {
    const code = normalizeReferralCode(rawCode);
    if (!code) return false;
    const referrer = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true, bannedAt: true } });
    if (!referrer || referrer.id === newUserId || referrer.bannedAt) return false;
    await prisma.referral.create({ data: { referrerId: referrer.id, referredId: newUserId } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") console.error("Attaching a referral failed (non-blocking):", err);
    return false;
  }
}

/** Sets a 10% discount that ends by itself. Returns false when the person already has the same or better. */
async function grantTimedDiscount(userId: string, expiresAt: Date, note: string): Promise<boolean> {
  const change = await prisma.$transaction(async (tx) => {
    const existing = await tx.accountDiscount.findUnique({ where: { userId }, select: { percent: true, expiresAt: true } });
    if (!rewardWouldHelp(existing, expiresAt)) return "skip" as const;
    await tx.accountDiscount.upsert({
      where: { userId },
      update: { percent: REFERRAL_PERCENT, note, expiresAt, createdById: null },
      create: { userId, percent: REFERRAL_PERCENT, note, expiresAt },
    });
    return applyToRunningPlan(tx, userId, REFERRAL_PERCENT);
  });
  if (change === "skip") return false;
  const until = expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  await noticePlanUpdated({
    userId,
    title: `${REFERRAL_PERCENT}% off for ${REFERRAL_MONTHS} months`,
    body: `A friend's invitation earned you ${REFERRAL_PERCENT}% off your plan until ${until}.${change && change.fromCents !== change.toCents ? ` Your monthly price is now ${money(change.toCents)}.` : " It applies when you have a plan."}`,
  });
  return true;
}

/**
 * Called after a first plan payment is approved. If the person came in through a friend's link and chose a 3 or 6 month plan, both get
 * 10% off for 3 months. Safe to call more than once: the reward is claimed atomically and only once. Never throws.
 */
export async function rewardReferralForFirstPayment(userId: string, planId: string): Promise<void> {
  try {
    const referral = await prisma.referral.findUnique({ where: { referredId: userId } });
    if (!referral || referral.rewardedAt) return;
    const plan = await prisma.paymentPlan.findUnique({ where: { id: planId }, select: { term: true, userId: true } });
    if (!plan || plan.userId !== userId || !isQualifyingReferralTerm(plan.term)) return;

    const claimed = await prisma.referral.updateMany({ where: { id: referral.id, rewardedAt: null }, data: { rewardedAt: new Date() } });
    if (claimed.count !== 1) return;

    const expiresAt = addCalendarMonthsClamped(new Date(), REFERRAL_MONTHS);
    const [referrer, referred] = await Promise.all([
      prisma.user.findUnique({ where: { id: referral.referrerId }, select: { bannedAt: true, name: true, email: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    ]);
    const givenToReferred = await grantTimedDiscount(userId, expiresAt, "Referral: invited by a friend");
    const givenToReferrer = referrer && !referrer.bannedAt ? await grantTimedDiscount(referral.referrerId, expiresAt, `Referral: invited ${referred?.name ?? "a friend"}`) : false;
    await logAudit({
      action: "referral.reward",
      targetType: "User",
      targetId: referral.referrerId,
      detail: `${referrer?.email ?? "referrer"} invited ${referred?.email ?? userId}: ${REFERRAL_PERCENT}% for ${REFERRAL_MONTHS} months to ${[givenToReferrer && "the referrer", givenToReferred && "the new student"].filter(Boolean).join(" and ") || "nobody (they already had as good)"}`,
    });
  } catch (err) {
    console.error("Referral reward failed (non-blocking):", err);
  }
}

/** Ends every discount whose time is up and puts the running plan back to its list price. Run daily. */
export async function expireTimedDiscounts(now: Date): Promise<number> {
  const due = await prisma.accountDiscount.findMany({ where: { expiresAt: { lte: now } }, select: { userId: true } });
  let ended = 0;
  for (const { userId } of due) {
    try {
      const change = await prisma.$transaction(async (tx) => {
        const gone = await tx.accountDiscount.deleteMany({ where: { userId, expiresAt: { lte: now } } });
        return gone.count === 1 ? applyToRunningPlan(tx, userId, 0) : "skip";
      });
      if (change === "skip") continue;
      ended += 1;
      await logAudit({ action: "pricing.discount.clear", targetType: "User", targetId: userId, detail: "Referral discount ended" });
      await noticePlanUpdated({
        userId,
        title: "Your referral discount ended",
        body: change && change.fromCents !== change.toCents ? `Your monthly price is back to ${money(change.toCents)}.` : "Your referral discount has ended.",
      });
    } catch (err) {
      console.error(`Ending a referral discount failed for ${userId} (non-blocking):`, err);
    }
  }
  return ended;
}

export interface ReferralSummary {
  code: string;
  joined: number;
  rewarded: number;
}

export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const code = await ensureReferralCode(userId);
  const [joined, rewarded] = await Promise.all([
    prisma.referral.count({ where: { referrerId: userId } }),
    prisma.referral.count({ where: { referrerId: userId, rewardedAt: { not: null } } }),
  ]);
  return { code, joined, rewarded };
}
