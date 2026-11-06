import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { creditsToStored, creditsLabelFromStored } from "@/lib/classCreditPricing";
import { recordCreditGrant } from "@/lib/creditLedger";
import { createNotification } from "@/lib/notifications";
import { consumeRateLimit } from "@/lib/rateLimit";
import { MAX_SCHOLARSHIP_CLASSES, makeScholarshipCode, normalizeScholarshipCode, scholarshipStatus } from "@/lib/scholarshipRules";

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

function checkClasses(classes: number) {
  if (!Number.isInteger(classes) || classes < 1 || classes > MAX_SCHOLARSHIP_CLASSES) {
    throw new ScholarshipError(`Classes must be a whole number from 1 to ${MAX_SCHOLARSHIP_CLASSES}.`);
  }
}

/**
 * Owner: makes a code for one EXISTING account. The code is random unless the owner types their own 16 digits.
 * The email stored is the account's own address, so the claim check always matches it.
 */
export async function createScholarshipCode(input: {
  email: string;
  classes: number;
  code?: string | null;
  note?: string | null;
  expiresAt?: Date | null;
  actor: { id: string; email: string | null };
}) {
  const account = await findScholarshipAccount(input.email);
  if (!account) throw new ScholarshipError("No student account has that email. They need to create an account first.");
  checkClasses(input.classes);
  if (input.expiresAt && input.expiresAt <= new Date()) throw new ScholarshipError("The last claim day must be in the future.");
  const custom = input.code?.trim() ? normalizeScholarshipCode(input.code) : null;
  if (input.code?.trim() && !custom) throw new ScholarshipError("A custom code must be exactly 16 digits.");
  const note = input.note?.trim().slice(0, 200) || null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await prisma.scholarshipCode.create({
        data: { code: custom ?? makeScholarshipCode(), assignedEmail: account.email.toLowerCase(), credits: creditsToStored(input.classes), note, expiresAt: input.expiresAt ?? null, createdById: input.actor.id },
      });
      await logAudit({ actorId: input.actor.id, actorEmail: input.actor.email, action: "scholarship.create", detail: `${input.classes} classes for ${account.email}` });
      return row;
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      if (custom) throw new ScholarshipError("That code already exists. Pick different digits or leave it blank for a random one.");
    }
  }
  throw new ScholarshipError("Could not make a code. Try again.");
}

/** Owner: changes the amount, note or last claim day of a code nobody has claimed. */
export async function updateScholarshipCode(id: string, input: { classes: number; note?: string | null; expiresAt?: Date | null }, actor: { id: string; email: string | null }) {
  checkClasses(input.classes);
  if (input.expiresAt && input.expiresAt <= new Date()) throw new ScholarshipError("The last claim day must be in the future.");
  const res = await prisma.scholarshipCode.updateMany({
    where: { id, claimedAt: null, revokedAt: null },
    data: { credits: creditsToStored(input.classes), note: input.note?.trim().slice(0, 200) || null, expiresAt: input.expiresAt ?? null },
  });
  if (res.count === 0) throw new ScholarshipError("Only an unclaimed, active code can be changed.");
  await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "scholarship.update", detail: `${id}: ${input.classes} classes` });
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

/** Owner: stops an unclaimed code from working. A claimed code is history and cannot be revoked. */
export async function revokeScholarshipCode(id: string, actor: { id: string; email: string | null }): Promise<void> {
  const res = await prisma.scholarshipCode.updateMany({ where: { id, claimedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) throw new ScholarshipError("Only a code nobody has claimed can be revoked.");
  await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "scholarship.revoke", detail: id });
}

export async function listScholarshipCodes(limit = 200) {
  return prisma.scholarshipCode.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { claimedBy: { select: { name: true, email: true } } } });
}

/** What the signed-in person sees: scholarships they claimed. Never the unclaimed codes of anyone. */
export async function listClaimedScholarships(userId: string) {
  return prisma.scholarshipCode.findMany({ where: { claimedById: userId }, orderBy: { claimedAt: "desc" }, select: { id: true, credits: true, claimedAt: true } });
}

/**
 * Claims a code for the signed-in account. The account's email must be the one the code was made for. The claim is one atomic
 * conditional update (unclaimed, not revoked, not lapsed, right email), so two taps or two devices can never both succeed.
 */
export async function claimScholarshipCode(userId: string, rawCode: unknown): Promise<{ credits: number; balance: number }> {
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
  if (status === "claimed") throw new ScholarshipError("That code has already been claimed.");
  if (status !== "available") throw new ScholarshipError(NOT_VALID);

  const now = new Date();
  const balance = await prisma.$transaction(async (tx) => {
    const won = await tx.scholarshipCode.updateMany({
      where: { id: row.id, claimedAt: null, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      data: { claimedAt: now, claimedById: user.id },
    });
    if (won.count === 0) throw new ScholarshipError("That code has already been claimed.");
    const updated = await tx.user.update({ where: { id: user.id }, data: { classCredits: { increment: row.credits } }, select: { classCredits: true } });
    return updated.classCredits;
  });
  await recordCreditGrant(user.id, row.credits, { source: "SCHOLARSHIP", expiresAt: null });
  await logAudit({ actorId: user.id, actorEmail: user.email, action: "scholarship.claim", detail: `${row.id}: ${creditsLabelFromStored(row.credits)}` });
  await createNotification({
    userId: user.id,
    type: "CREDIT_ADJUSTED",
    title: `Scholarship claimed: ${creditsLabelFromStored(row.credits)} added`,
    body: `Your scholarship is yours. New balance: ${creditsLabelFromStored(balance)}.`,
    emailCategory: "payments",
  }).catch(() => undefined);
  return { credits: row.credits, balance };
}
