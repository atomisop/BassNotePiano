import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { MAX_SCHOLARSHIP_PERCENT } from "@/lib/classCreditPricing";
import { settleFreeBillsFor } from "@/lib/freeBills";
import { applyToRunningPlan, type PlanPriceChange } from "@/lib/accountDiscounts";
import { noticePlanUpdated } from "@/lib/studentNotices";
import { consumeRateLimit } from "@/lib/rateLimit";
import { planPriceChangeNotice } from "@/lib/scholarshipWording";
import { makeScholarshipCode, normalizeScholarshipCode, scholarshipStatus } from "@/lib/scholarshipRules";

/** Tells the student their running 6 Month plan changed price, when it did. */
async function tellPriceChange(userId: string, change: PlanPriceChange | null) {
  if (!change || change.fromCents === change.toCents) return;
  await noticePlanUpdated({ userId, ...planPriceChangeNotice(change) });
}

export class ScholarshipError extends Error {}

/** One answer for every reason a code cannot be used, so a wrong guess never reveals which codes exist or whose they are. */
const NOT_VALID = "That code isn't valid for this account. Check the 16 digits and that you're signed in with the email it was made for.";

const sameInbox = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The account a code can be made for: a real student account (not an admin, not banned). Null when there is none. */
export async function findScholarshipAccount(rawEmail: string) {
  const email = rawEmail.trim();
  if (!email) return null;
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, role: { not: "ADMIN" }, bannedAt: null }, select: { id: true, name: true, email: true, emailVerified: true } });
  return user ? { id: user.id, name: user.name, email: user.email, verified: Boolean(user.emailVerified) } : null;
}

function checkPercent(percent: number) {
  if (!Number.isInteger(percent) || percent < 1 || percent > MAX_SCHOLARSHIP_PERCENT) {
    throw new ScholarshipError(`The discount must be a whole number from 1 to ${MAX_SCHOLARSHIP_PERCENT} percent.`);
  }
}

/**
 * Owner: makes a code for one EXISTING account. The code is random unless the owner types their own 16 digits.
 * The email stored is the account's own address, so the claim check always matches it.
 */
export async function createScholarshipCode(input: {
  email: string;
  percent: number;
  code?: string | null;
  note?: string | null;
  expiresAt?: Date | null;
  actor: { id: string; email: string | null };
}) {
  const account = await findScholarshipAccount(input.email);
  if (!account) throw new ScholarshipError("No student account has that email. They need to create an account first.");
  checkPercent(input.percent);
  if (input.expiresAt && input.expiresAt <= new Date()) throw new ScholarshipError("The last claim day must be in the future.");
  const custom = input.code?.trim() ? normalizeScholarshipCode(input.code) : null;
  if (input.code?.trim() && !custom) throw new ScholarshipError("A custom code must be exactly 16 digits.");
  const note = input.note?.trim().slice(0, 200) || null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await prisma.scholarshipCode.create({
        data: { code: custom ?? makeScholarshipCode(), assignedEmail: account.email.toLowerCase(), percent: input.percent, note, expiresAt: input.expiresAt ?? null, createdById: input.actor.id },
      });
      await logAudit({ actorId: input.actor.id, actorEmail: input.actor.email, action: "scholarship.create", detail: `${input.percent}% off the 6 Month plan for ${account.email}` });
      return row;
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      if (custom) throw new ScholarshipError("That code already exists. Pick different digits or leave it blank for a random one.");
    }
  }
  throw new ScholarshipError("Could not make a code. Try again.");
}

/**
 * Owner: changes the percent, note or last claim day of a code nobody has claimed. Only an UNCLAIMED code can be changed, so this
 * never moves a running plan's price or an open bill: a claimed scholarship is raised by giving a new one (Set up plan, or a new
 * code), and claiming is what reprices the plan and settles an open bill that became $0 (claimScholarshipCode below).
 */
export async function updateScholarshipCode(id: string, input: { percent: number; note?: string | null; expiresAt?: Date | null }, actor: { id: string; email: string | null }) {
  checkPercent(input.percent);
  if (input.expiresAt && input.expiresAt <= new Date()) throw new ScholarshipError("The last claim day must be in the future.");
  const res = await prisma.scholarshipCode.updateMany({
    where: { id, claimedAt: null, revokedAt: null },
    data: { percent: input.percent, note: input.note?.trim().slice(0, 200) || null, expiresAt: input.expiresAt ?? null },
  });
  if (res.count === 0) throw new ScholarshipError("Only an unclaimed, active code can be changed.");
  await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "scholarship.update", detail: `${id}: ${input.percent}%` });
}

/** Owner: swaps an unclaimed code for a fresh random one (the old digits stop working). Returns the new digits. */
export async function regenerateScholarshipCode(id: string, actor: { id: string; email: string | null }): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const code = makeScholarshipCode();
      const res = await prisma.scholarshipCode.updateMany({ where: { id, claimedAt: null, revokedAt: null }, data: { code } });
      if (res.count === 0) throw new ScholarshipError("Only an unclaimed, active code can get new digits.");
      await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "scholarship.regenerate", detail: id });
      return code;
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  throw new ScholarshipError("Could not make a code. Try again.");
}

/**
 * Owner: stops a code from working. An unclaimed code can no longer be claimed. A claimed one ENDS its discount: the student's running
 * 6 Month plan goes back to the price without it, and they are told.
 */
export async function revokeScholarshipCode(id: string, actor: { id: string; email: string | null }): Promise<void> {
  let change: PlanPriceChange | null = null;
  // Revoke and read in one step: a claim that lands between a separate read and this write would otherwise leave the running plan at its discounted price.
  const row = await prisma.$transaction(async (tx) => {
    const res = await tx.scholarshipCode.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (res.count === 0) throw new ScholarshipError("That code is already revoked.");
    const fresh = await tx.scholarshipCode.findUniqueOrThrow({ where: { id }, select: { claimedAt: true, claimedById: true } });
    if (fresh.claimedAt && fresh.claimedById) change = await applyToRunningPlan(tx, fresh.claimedById);
    return fresh;
  });
  await logAudit({ actorId: actor.id, actorEmail: actor.email, action: row.claimedAt ? "scholarship.end" : "scholarship.revoke", detail: id });
  if (row.claimedById) await tellPriceChange(row.claimedById, change);
}

export async function listScholarshipCodes(limit = 200) {
  return prisma.scholarshipCode.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { claimedBy: { select: { name: true, email: true } } } });
}

/** What the signed-in person sees: scholarships they claimed. Never the unclaimed codes of anyone. */
export async function listClaimedScholarships(userId: string) {
  return prisma.scholarshipCode.findMany({ where: { claimedById: userId }, orderBy: { claimedAt: "desc" }, select: { id: true, percent: true, claimedAt: true } });
}

/**
 * Claims a code for the signed-in account. The account's email must be the one the code was made for. The claim is one atomic
 * conditional update (unclaimed, not revoked, not lapsed, right email), so two taps or two devices can never both succeed.
 */
export async function claimScholarshipCode(userId: string, rawCode: unknown): Promise<{ percent: number; planChange: PlanPriceChange | null }> {
  // Guessing a 16 digit number is hopeless, but every try is still counted so nobody can hammer it.
  await consumeRateLimit(prisma, `scholarship-claim:${userId}`, { windowMinutes: 60, max: 10, message: "Too many tries. Please wait an hour and try again." });
  const code = normalizeScholarshipCode(rawCode);
  if (!code) throw new ScholarshipError("Enter all 16 digits of your scholarship code.");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerified: true, bannedAt: true, role: true } });
  if (!user || user.bannedAt) throw new ScholarshipError(NOT_VALID);
  if (user.role === "ADMIN") throw new ScholarshipError("An admin account doesn't need a scholarship.");
  if (!user.emailVerified) throw new ScholarshipError("Verify your email first, then claim your scholarship.");

  const row = await prisma.scholarshipCode.findUnique({ where: { code } });
  if (!row || !sameInbox(row.assignedEmail, user.email)) throw new ScholarshipError(NOT_VALID);
  const status = scholarshipStatus(row);
  if (status === "claimed" || status === "ended") throw new ScholarshipError("That code has already been claimed.");
  if (status !== "available" || row.percent < 1) throw new ScholarshipError(NOT_VALID);

  const now = new Date();
  const planChange = await prisma.$transaction(async (tx) => {
    const won = await tx.scholarshipCode.updateMany({
      where: { id: row.id, claimedAt: null, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      data: { claimedAt: now, claimedById: user.id },
    });
    if (won.count === 0) throw new ScholarshipError("That code has already been claimed.");
    // A running 6 Month plan is repriced now; any other length is untouched (the discount only prices the 6 Month plan).
    return applyToRunningPlan(tx, user.id);
  });
  await logAudit({ actorId: user.id, actorEmail: user.email, action: "scholarship.claim", detail: `${row.id}: ${row.percent}% off the 6 Month plan` });
  await tellPriceChange(user.id, planChange);
  // A 100% scholarship on a running 6 Month plan leaves its open, unsent bill at $0: settle it now rather than wait for a job. Quiet
  // when the "Your scholarship covers your plan" notice above already told them, so there is one notice. A bill already sent in for
  // review with real money is not touched (applyToRunningPlan leaves it, and only a $0 bill can settle itself).
  if (row.percent >= MAX_SCHOLARSHIP_PERCENT) await settleFreeBillsFor(user.id, { quiet: Boolean(planChange && planChange.toCents === 0 && planChange.fromCents !== 0) });
  return { percent: row.percent, planChange };
}
