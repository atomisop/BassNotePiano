"use server";

import { withStudentNotice } from "@/lib/notifyScope";
import { isOwnerEmail, notifyAdmins } from "@/lib/adminNotifications";
import { AccountToolError, listLiveCreditGrants, sendPasswordResetFor, setCreditGrantExpiry, setTrialFor, updateAccountDetails, type AccountDetails, type LiveCreditGrant } from "@/lib/adminAccountTools";
import { PaymentEditError, editRecordedPayment } from "@/lib/adminPaymentTools";
import { noticeAccountChange } from "@/lib/studentNotices";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { forgetPayerName } from "@/lib/paymentReceipts";
import { banAccount, describeBan } from "@/lib/accountBan";

// Same pattern as every other admin actions.ts, the admin layout's
// redirect only protects rendering, not these Server Actions, so this
// re-check is the actual authorization boundary.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/users");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

/**
 * The same mechanism the student's own "Sign out of all other devices"
 * button uses (see account/actions.ts's signOutOtherDevicesAction), every
 * JWT carries the sessionVersion it was issued with, and NextAuth's
 * session callback compares it against the DB's current value on every
 * request, rejecting anything older. Bumping it here signs out every
 * device signed into this account, including the one they're on right
 * now, without touching a password. Useful for "I think my account was
 * compromised" or "I'm locked out of a stuck session" support requests.
 */
export async function adminForceSignOutAction(targetUserId: string) {
  const admin = await requireAdmin();
  await prisma.user.update({ where: { id: targetUserId }, data: { sessionVersion: { increment: 1 } } });
  await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "user.sign-out-everywhere", targetType: "User", targetId: targetUserId });
  await noticeAccountChange(targetUserId, { kind: "signed-out-everywhere", by: "admin" });
  revalidatePath("/", "layout");
}

/**
 * Frees a phone number held by this account, for when someone took a number that is not theirs (a number is unique to
 * one account) or a student typed a wrong one. Their payments keep any number already stored on them; only the
 * account's number is cleared, so the real owner can add it to theirs.
 */
export async function adminClearPhoneAction(targetUserId: string, notify = true) {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    const before = await prisma.user.findUnique({ where: { id: targetUserId }, select: { phone: true } });
    if (!before?.phone) return;
    await prisma.user.update({ where: { id: targetUserId }, data: { phone: null, phoneVerifiedAt: null, pendingPhone: null } });
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "user.clear-phone", targetType: "User", targetId: targetUserId, detail: `Cleared the phone number ending ${before.phone.slice(-4)}` });
    await noticeAccountChange(targetUserId, { kind: "phone-cleared" });
    revalidatePath("/", "layout");
  });
}

/** Stops a saved payer name from clearing this student's payments by itself. */
export async function forgetPayerNameAction(targetUserId: string, aliasId: string) {
  const admin = await requireAdmin();
  // Scoped to this student, so an id from another page cannot remove someone else's.
  const alias = await prisma.payerAlias.findFirst({ where: { id: aliasId, userId: targetUserId }, select: { id: true } });
  if (alias) await forgetPayerName({ aliasId: alias.id, admin: { id: admin.id, email: admin.email ?? null } });
  revalidatePath("/", "layout");
}

/**
 * Bans an account for good, which is a termination (see banAccount in accountBan.ts): it can no longer sign in by any
 * route, every open session ends, its plans and booked classes are canceled and it is removed from Discord. Never for an
 * admin, and never for yourself. The reason is a private note for the owner. The ban itself is reversible with
 * unbanUserAction; the cancellations are not undone.
 */
export async function banUserAction(targetUserId: string, reason: string, notify = true): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    if (targetUserId === admin.id) return { ok: false, error: "You cannot ban your own account." };
    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, email: true, role: true } });
    if (!target) return { ok: false, error: "That account no longer exists." };
    if (target.role === "ADMIN") return { ok: false, error: "An admin account cannot be banned. Remove its admin role first." };
    const note = reason.trim().slice(0, 500);
    const outcome = await banAccount({ userId: target.id, adminId: admin.id, reason: note });
    if (outcome.alreadyBanned) return { ok: true, summary: "Already banned." };
    const summary = describeBan(outcome);
    await notifyAdmins("ACCOUNT_BANNED", {
      type: "ADMIN_ALERT",
      title: "An account was banned",
      body: `${target.email} was banned by ${admin.email ?? "an admin"}. ${summary}`,
      cta: { label: "View account", path: `/admin/users/${target.id}` },
    });
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "user.ban", targetType: "User", targetId: target.id, detail: `Banned ${target.email}${note ? ` (${note})` : ""}: ${summary}` });
    revalidatePath("/", "layout");
    return { ok: true, summary };
  });
}

/** Lifts a ban, so the person can sign in again. */
export async function unbanUserAction(targetUserId: string, notify = true): Promise<{ ok: true } | { ok: false; error: string }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, email: true, bannedAt: true } });
    if (!target) return { ok: false, error: "That account no longer exists." };
    if (!target.bannedAt) return { ok: true };
    await prisma.user.update({ where: { id: target.id }, data: { bannedAt: null, bannedReason: null } });
    await notifyAdmins("ACCOUNT_BANNED", {
      type: "ADMIN_ALERT",
      title: "A ban was lifted",
      body: `${admin.email ?? "An admin"} lifted the ban on ${target.email}.`,
      cta: { label: "View account", path: `/admin/users/${target.id}` },
    });
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "user.unban", targetType: "User", targetId: target.id, detail: `Lifted the ban on ${target.email}` });
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

type ToolResult = { ok: true; message: string } | { ok: false; error: string };

// The owner only: a changed email is where sign-in codes go, so a staff account must not be able to move it.
async function ownerTool(work: (adminId: string) => Promise<string>): Promise<ToolResult> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can do this." };
  try {
    const message = await work(admin.id);
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (err) {
    if (err instanceof AccountToolError || err instanceof PaymentEditError) return { ok: false, error: err.message };
    throw err;
  }
}

/** Corrects a student's name, email or phone. */
export async function updateAccountDetailsAction(targetUserId: string, input: AccountDetails, notify = true): Promise<ToolResult> {
  return withStudentNotice(notify, () =>
    ownerTool(async (adminId) => {
      const what = await updateAccountDetails(adminId, String(targetUserId), { name: String(input.name ?? ""), email: String(input.email ?? ""), phone: String(input.phone ?? "") });
      return what ? `Saved the new ${what}` : "Nothing changed";
    }),
  );
}

/** Emails the student a password reset code. Always sent: it is what they asked for, so the Notify switch does not apply. */
export async function sendPasswordResetAction(targetUserId: string): Promise<ToolResult> {
  return ownerTool(async (adminId) => `Reset code sent to ${await sendPasswordResetFor(adminId, String(targetUserId))}`);
}

/** Gives or extends a free trial to `days` from now, or ends it (0). */
export async function setTrialAction(targetUserId: string, days: number, notify = true): Promise<ToolResult> {
  return withStudentNotice(notify, () =>
    ownerTool(async (adminId) => {
      const until = await setTrialFor(adminId, String(targetUserId), Number(days));
      return until ? `Trial runs until ${until.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" })}` : "Trial ended";
    }),
  );
}

/** The student's usable credits, soonest to expire first. */
export async function listCreditGrantsAction(targetUserId: string): Promise<LiveCreditGrant[]> {
  await requireAdmin();
  return listLiveCreditGrants(String(targetUserId));
}

/** Moves when one batch of credits expires, or makes it never expire (date null). */
export async function setCreditExpiryAction(targetUserId: string, grantId: string, date: string | null, notify = true): Promise<ToolResult> {
  return withStudentNotice(notify, () =>
    ownerTool(async (adminId) => {
      const label = await setCreditGrantExpiry(adminId, String(targetUserId), String(grantId), date === null ? null : String(date));
      return label === "never" ? "Those credits never expire now" : `Those credits now expire ${label}`;
    }),
  );
}

/** Corrects an approved payment's amount or the day it arrived. Only the record changes; the student is not told. */
export async function editPaymentAction(paymentId: string, amountCents: number, paidOn: string): Promise<ToolResult> {
  return ownerTool(async (adminId) => {
    const { amount, paidOn: day } = await editRecordedPayment(adminId, String(paymentId), { amountCents: Number(amountCents), paidOn: String(paidOn) });
    return `Payment saved: ${amount} on ${new Date(`${day}T17:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" })}`;
  });
}
