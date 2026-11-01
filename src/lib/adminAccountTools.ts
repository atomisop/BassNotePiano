import { prisma } from "@/lib/prisma";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { hasFirstAndLastName } from "@/lib/studentName";
import { assessPhone } from "@/lib/phoneValidity";
import { isPhoneTaken } from "@/lib/phoneVerification";
import { createAndSendCode, RateLimitError } from "@/lib/verification";
import { noticeAccountChange } from "@/lib/studentNotices";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { sendEmailChangedEmail } from "@/lib/email";
import { withStudentNotice } from "@/lib/notifyScope";
import { etWallTimeToUtc } from "@/lib/classSchedule";
import { formatCredits, storedToCredits } from "@/lib/classCreditPricing";

/**
 * Account fixes the studio makes for a student from their page: correct the name, email or phone they typed, send them a password
 * reset code, and give, extend or end their free trial. Each one is audited and the student is told (unless the Notify switch is off).
 */

export class AccountToolError extends Error {}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "jane@gmail.com" to "j***@gmail.com", for the notice that goes to the old address. */
const maskEmail = (email: string) => email.replace(/^(.)[^@]*/, "$1***");
const DAY = 86_400_000;

export interface AccountDetails {
  name: string;
  email: string;
  /** Empty clears the number. */
  phone: string;
}

/** Saves the details that changed; returns the plain names of what changed ("name and email"), or null when nothing did. */
export async function updateAccountDetails(adminId: string, userId: string, input: AccountDetails): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true, role: true } });
  if (!user) throw new AccountToolError("That account was not found.");

  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  const data: { name?: string; email?: string; emailCanonical?: string; emailVerified?: null; phone?: string | null; phoneVerifiedAt?: null; pendingPhone?: null } = {};
  const changed: string[] = [];

  if (name !== (user.name ?? "")) {
    if (name.length > 80) throw new AccountToolError("That name is too long.");
    if (!hasFirstAndLastName(name)) throw new AccountToolError("Enter a first and last name, the way it appears on their bank or Venmo account.");
    data.name = name;
    changed.push("name");
  }
  if (email !== user.email) {
    if (!EMAIL.test(email) || email.length > 200) throw new AccountToolError("That is not a real email address.");
    const taken = await prisma.user.findFirst({ where: { id: { not: userId }, OR: [{ email }, { emailCanonical: canonicalEmail(email) }] }, select: { id: true } });
    if (taken) throw new AccountToolError("Another account already uses that email.");
    // A new address has not been confirmed by its owner yet.
    Object.assign(data, { email, emailCanonical: canonicalEmail(email), emailVerified: null });
    changed.push("email");
  }
  const rawPhone = input.phone.trim();
  if (!rawPhone && user.phone) {
    Object.assign(data, { phone: null, phoneVerifiedAt: null, pendingPhone: null });
    changed.push("phone number");
  } else if (rawPhone) {
    const assessed = assessPhone(rawPhone);
    if (!assessed.ok) throw new AccountToolError(assessed.error);
    if (assessed.phone !== user.phone) {
      if (await isPhoneTaken(assessed.phone, userId)) throw new AccountToolError("Another account already uses that phone number.");
      Object.assign(data, { phone: assessed.phone, phoneVerifiedAt: null, pendingPhone: null });
      changed.push("phone number");
    }
  }
  if (changed.length === 0) return null;

  // A new email signs the account out everywhere (open sessions still carry the old address), and the OLD address is told even when the
  // Notify switch is off, so a student whose email was changed on someone else's request can object before a reset code reaches the new one.
  await prisma.user.update({ where: { id: userId }, data: { ...data, ...(data.email !== undefined ? { sessionVersion: { increment: 1 } } : {}) } });
  if (data.email !== undefined) await withStudentNotice(true, () => sendEmailChangedEmail(user.email, user.name, maskEmail(email))).catch(() => undefined);
  const what = changed.length === 1 ? changed[0] : `${changed.slice(0, -1).join(", ")} and ${changed[changed.length - 1]}`;
  const detail = [data.name !== undefined && `name "${user.name ?? ""}" to "${name}"`, data.email !== undefined && `email ${user.email} to ${email}`, "phone" in data && `phone ${user.phone ? `ending ${user.phone.slice(-4)}` : "none"} to ${data.phone ? `ending ${data.phone.slice(-4)}` : "none"}`].filter(Boolean).join("; ");
  await logAudit({ actorId: adminId, action: "user.details", targetType: "User", targetId: userId, detail: `Changed ${detail}` }).catch(() => undefined);
  await noticeAccountChange(userId, { kind: "details-changed", what });
  return what;
}

/** Emails the student a password reset code, the same one "Forgot password" sends. */
export async function sendPasswordResetFor(adminId: string, userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, bannedAt: true } });
  if (!user) throw new AccountToolError("That account was not found.");
  if (user.bannedAt) throw new AccountToolError("This account is banned, so it cannot sign in.");
  try {
    const sent = await createAndSendCode({ email: user.email, userId, purpose: "PASSWORD_RESET" });
    if (!sent.ok) throw new AccountToolError("The email could not be sent. Try again in a minute.");
  } catch (err) {
    if (err instanceof RateLimitError) throw new AccountToolError("A reset code was sent a moment ago. Wait a few minutes before sending another.");
    throw err;
  }
  await logAudit({ actorId: adminId, action: "user.password-reset-sent", targetType: "User", targetId: userId, detail: `Sent a password reset code to ${user.email}` }).catch(() => undefined);
  return user.email;
}

/** Sets the free trial to end `days` from now (1 to 60), or ends it now when days is 0. The once-per-person rule does not apply to the studio. */
export async function setTrialFor(adminId: string, userId: string, days: number): Promise<Date | null> {
  if (!Number.isInteger(days) || days < 0 || days > 60) throw new AccountToolError("Pick from 0 to 60 days.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, trialEndsAt: true } });
  if (!user) throw new AccountToolError("That account was not found.");
  if (user.role === "ADMIN") throw new AccountToolError("An admin already sees everything.");
  if (days === 0 && !(user.trialEndsAt && user.trialEndsAt > new Date())) throw new AccountToolError("There is no running trial to end.");
  const until = days === 0 ? new Date() : new Date(Date.now() + days * DAY);
  await prisma.user.update({ where: { id: userId }, data: { trialEndsAt: until } });
  await logAudit({ actorId: adminId, action: "user.trial", targetType: "User", targetId: userId, detail: days === 0 ? "Ended the free trial" : `Free trial set to end in ${days} days` }).catch(() => undefined);
  await noticeAccountChange(userId, { kind: "trial-set", until: days === 0 ? null : until });
  return days === 0 ? null : until;
}

export interface LiveCreditGrant {
  id: string;
  /** Stored half-classes left. */
  remaining: number;
  source: string;
  /** ISO, or null for credits that never expire. */
  expiresAt: string | null;
}

/** The student's credits that are still usable, soonest to expire first. */
export async function listLiveCreditGrants(userId: string): Promise<LiveCreditGrant[]> {
  const rows = await prisma.creditGrant.findMany({
    where: { userId, expiredAt: null, creditsRemaining: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }],
    select: { id: true, creditsRemaining: true, source: true, expiresAt: true },
  });
  return rows.map((r) => ({ id: r.id, remaining: r.creditsRemaining, source: r.source, expiresAt: r.expiresAt?.toISOString() ?? null }));
}

/** Moves when one batch of credits expires ("YYYY-MM-DD", end of that Eastern day), or makes it never expire (null). */
export async function setCreditGrantExpiry(adminId: string, userId: string, grantId: string, date: string | null): Promise<string> {
  const grant = await prisma.creditGrant.findFirst({ where: { id: grantId, userId, expiredAt: null } });
  if (!grant || grant.creditsRemaining <= 0) throw new AccountToolError("Those credits are already used or expired.");
  let expiresAt: Date | null = null;
  if (date !== null) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) throw new AccountToolError("Pick a date.");
    expiresAt = etWallTimeToUtc(Number(m[1]), Number(m[2]), Number(m[3]), 23, 59);
    if (expiresAt.getTime() <= Date.now()) throw new AccountToolError("Pick a day after today.");
    if (expiresAt.getTime() > Date.now() + 3 * 365 * DAY) throw new AccountToolError("Pick a day within three years.");
  }
  // The "expiring soon" warning is reset, so the student is warned again before the new date.
  await prisma.creditGrant.update({ where: { id: grant.id }, data: { expiresAt, expiringSoonNotifiedAt: null } });
  const label = expiresAt ? expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : "never";
  await logAudit({ actorId: adminId, action: "credits.expiry", targetType: "User", targetId: userId, detail: `Credits (${formatCredits(storedToCredits(grant.creditsRemaining))} classes) now expire ${label}` }).catch(() => undefined);
  await createNotification({
    userId,
    type: "ACCOUNT_UPDATE",
    title: "Your credits' expiry changed",
    body: expiresAt ? `The studio moved when ${storedToCredits(grant.creditsRemaining) === 1 ? "1 class credit expires" : `${formatCredits(storedToCredits(grant.creditsRemaining))} class credits expire`}: now ${label}.` : "The studio made some of your class credits never expire.",
    emailCategory: "roleUpdates",
  }).catch(() => undefined);
  return label;
}
