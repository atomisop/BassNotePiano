"use server";

import { passwordRequirementError } from "@/lib/passwordRules";
import { removeDiscordPresence } from "@/lib/discordCleanup";
import { noticeAccountChange } from "@/lib/studentNotices";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { hasParentControl, PARENT_CONTROL_MESSAGE } from "@/lib/parentLinks";
import { leaveSessionProof } from "@/lib/sessionProofCookie";
import { currentDeviceId, deviceKind, DEVICE_ACTIVE_MS, placeLabel } from "@/lib/deviceAlerts";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel, PaymentPlanTerm, PlanCancellationReason } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { notifyAdmins } from "@/lib/adminNotifications";
import { prisma } from "@/lib/prisma";
import { setUsername, SocialError } from "@/lib/social";
import { createPresignedAvatarUpload, deleteObject, keyFromPublicUrl, isObjectStorageConfigured } from "@/lib/storage";
import { createAndSendCode, verifyCode, RateLimitError } from "@/lib/verification";
import { consumeRateLimit, RateLimitError as RateLimitErr } from "@/lib/rateLimit";
import { TwoStepError, beginSetup, confirmSetup, disableTwoStep, regenerateBackupCodes } from "@/lib/adminTwoStep";
import { sendPasswordChangedEmail, sendNotificationEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { looksLikeEmail } from "@/lib/familyMemberCheck";
import { FULL_NAME_MESSAGE, cleanPersonName, hasFirstAndLastName } from "@/lib/studentName";
import { changePaymentPlanTerm, cancelPaymentPlanBySelf, pausePaymentPlan, PaymentPlanError } from "@/lib/paymentPlans";


/** Every action here operates on the signed-in user only, never on an email passed by the client. */
async function requireSession() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new Error("Not signed in.");
  return { id: session.user.id, sid: session.user.sid };
}

// ---------------------------------------------------------------------------
// Display name, applied immediately, no code confirmation. Per the
// 2026-08-07 decision, a code is only required for account creation
// (EMAIL_VERIFY) and password reset (PASSWORD_RESET); everything else you
// can already only reach while signed in as yourself.
// ---------------------------------------------------------------------------

export async function updateNameAction(newName: string) {
  const trimmed = cleanPersonName(newName);
  if (!trimmed) return { ok: false as const, error: "Name can't be empty." };
  if (!hasFirstAndLastName(trimmed)) return { ok: false as const, error: FULL_NAME_MESSAGE };

  const { id } = await requireSession();
  const updated = await prisma.user.update({ where: { id }, data: { name: trimmed }, select: { name: true } });
  // The name shows in the top bar, the greeting and the lists: refresh the whole app shell, not one page.
  revalidatePath("/", "layout");
  return { ok: true as const, name: updated.name };
}

// ---------------------------------------------------------------------------
// Password. Two steps: the current password plus the new one are checked and
// a 6-digit code is emailed to the account's own address, then the change is
// applied only once that code is confirmed. A "password changed" notice goes
// out afterwards so a change you didn't make is noticed.
// ---------------------------------------------------------------------------

async function checkPasswordChange(currentPassword: string, newPassword: string) {
  const passwordError = passwordRequirementError(newPassword);
  if (passwordError) {
    return { ok: false as const, error: passwordError };
  }
  const { id } = await requireSession();
  const user = await prisma.user.findUnique({ where: { id }, select: { email: true, name: true, passwordHash: true } });
  if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { ok: false as const, error: "Current password is incorrect." };
  }
  return { ok: true as const, id, email: user.email, name: user.name };
}

/** Step 1: validates both passwords, then emails a code to the account's own address. */
export async function requestPasswordChangeCodeAction(currentPassword: string, newPassword: string) {
  const check = await checkPasswordChange(currentPassword, newPassword);
  if (!check.ok) return check;

  try {
    const result = await createAndSendCode({ email: check.email, userId: check.id, purpose: "CHANGE_PASSWORD" });
    if (!result.ok) return { ok: false as const, error: "Couldn't send a verification code. Try again in a moment." };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false as const, error: err.message };
    throw err;
  }
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Changing the sign-in email, for every role. The current password is
// re-checked at both steps and the code goes to the NEW address, so only
// someone who can read it can claim it. The owner's address is the one the
// server settings name (OWNER_EMAIL), so it cannot be changed from here.
// ---------------------------------------------------------------------------

async function checkEmailChange(currentPassword: string, newEmailInput: string) {
  const { id } = await requireSession();
  const newEmail = newEmailInput.trim().toLowerCase();
  if (!looksLikeEmail(newEmail)) return { ok: false as const, error: "Enter a valid email address." };
  const user = await prisma.user.findUnique({ where: { id }, select: { email: true, name: true, passwordHash: true } });
  if (!user) return { ok: false as const, error: "Not signed in." };
  if (isOwnerEmail(user.email)) {
    return { ok: false as const, error: "This is the studio owner address, which is set on the server, so it can't be changed here." };
  }
  if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { ok: false as const, error: "Current password is incorrect." };
  }
  if (newEmail === user.email.toLowerCase()) return { ok: false as const, error: "That is already your email." };
  const taken = await prisma.user.findFirst({ where: { email: { equals: newEmail, mode: "insensitive" } }, select: { id: true } });
  if (taken || isOwnerEmail(newEmail)) return { ok: false as const, error: "That email can't be used. Try another one." };
  return { ok: true as const, id, newEmail, oldEmail: user.email, name: user.name };
}

/** Step 1: checks the password and the new address, then emails a code to the NEW address. */
export async function requestEmailChangeCodeAction(currentPassword: string, newEmail: string) {
  const { id } = await requireSession();
  try {
    await consumeRateLimit(prisma, `email-change:${id}`, { windowMinutes: 60, max: 6, message: "Too many tries. Wait a while and try again." });
  } catch (err) {
    if (err instanceof RateLimitErr) return { ok: false as const, error: err.message };
    throw err;
  }
  const check = await checkEmailChange(currentPassword, newEmail);
  if (!check.ok) return check;
  try {
    const result = await createAndSendCode({ email: check.newEmail, userId: check.id, purpose: "CHANGE_EMAIL" });
    if (!result.ok) return { ok: false as const, error: "Couldn't send a verification code. Try again in a moment." };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false as const, error: err.message };
    throw err;
  }
  return { ok: true as const };
}

/** Step 2: re-checks everything and the code, then switches the account to the new address. */
export async function updateEmailAction(currentPassword: string, newEmail: string, code: string) {
  const check = await checkEmailChange(currentPassword, newEmail);
  if (!check.ok) return check;
  const verified = await verifyCode(check.newEmail, "CHANGE_EMAIL", code.trim());
  if (!verified.ok) {
    const REASON_MESSAGE: Record<typeof verified.reason, string> = {
      not_found: "Request a verification code first.",
      expired: "That code expired. Request a new one.",
      too_many_attempts: "Too many incorrect attempts. Request a new code.",
      incorrect: "Incorrect code.",
    };
    return { ok: false as const, error: REASON_MESSAGE[verified.reason] };
  }
  if (verified.userId !== check.id) return { ok: false as const, error: "Request a verification code first." };
  try {
    await prisma.user.update({
      where: { id: check.id },
      data: { email: check.newEmail, emailCanonical: canonicalEmail(check.newEmail), emailVerified: new Date(), sessionVersion: { increment: 1 } },
    }).then((u) => leaveSessionProof(u.id, u.sessionVersion));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false as const, error: "That email can't be used. Try another one." };
    }
    throw err;
  }
  await logAudit({ actorId: check.id, actorEmail: check.newEmail, action: "account.email-change", targetType: "User", targetId: check.id, detail: `Sign-in email changed from ${check.oldEmail} to ${check.newEmail}` });
  // The old address is told, so a takeover cannot go unnoticed.
  try {
    await sendNotificationEmail(check.oldEmail, "Your sign-in email was changed", `The email you sign in to Bass Note Piano with was changed to ${check.newEmail}. If this was not you, contact us right away at music@bassnotepiano.com.`, "notice");
  } catch (err) {
    console.error("Failed to send email-changed notice:", err);
  }
  // No revalidatePath here: it would re-render the page with this device's old session stamp, which the bump above has just
  // made out of date. The screen calls update() next, which re-stamps the session, and shows the new address itself.
  return { ok: true as const, email: check.newEmail };
}

/** Deleting the account also deletes its payment and booking records, so a student who is still paying (or whose payment is being checked) has to sort that out first. */
async function accountDeletionBlocker(userId: string): Promise<string | null> {
  const [livePlan, pendingPayment] = await Promise.all([
    prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } }),
    prisma.zellePayment.findFirst({ where: { userId, status: "PENDING_REVIEW" }, select: { id: true } }),
  ]);
  // Someone who pays for other people's plans (a parent, or a family's payer) must hand those over first, or the plans would be left running at the group rate with no payer.
  const payingForOthers = await prisma.familyPlanGroup.findFirst({ where: { payerId: userId, plans: { some: { status: "ACTIVE", userId: { not: userId } } } }, select: { id: true } });
  if (payingForOthers) return "You pay for other people's plans. End or hand over those plans first, then delete your account.";
  if (livePlan) return "You still have an active payment plan. Cancel it under Manage Subscriptions first, then delete your account.";
  if (pendingPayment) return "A payment of yours is still being confirmed. Wait until it clears, then delete your account.";
  return null;
}

/** Step 2: re-checks the passwords and the emailed code, then applies the change. */
export async function updatePasswordAction(currentPassword: string, newPassword: string, code: string) {
  const check = await checkPasswordChange(currentPassword, newPassword);
  if (!check.ok) return check;

  const verified = await verifyCode(check.email, "CHANGE_PASSWORD", code.trim());
  if (!verified.ok) {
    const REASON_MESSAGE: Record<typeof verified.reason, string> = {
      not_found: "Request a verification code first.",
      expired: "That code expired. Request a new one.",
      too_many_attempts: "Too many incorrect attempts. Request a new code.",
      incorrect: "Incorrect code.",
    };
    return { ok: false as const, error: REASON_MESSAGE[verified.reason] };
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  // sessionVersion increment is what actually makes "signs out any other
  // devices" (below) true, see the jwt callback in src/lib/auth.ts. The
  // client re-syncs its OWN session to the new version right after this
  // call succeeds, via next-auth's update(), so only other devices drop.
  const bumped = await prisma.user.update({
    where: { id: check.id },
    data: { passwordHash: newPasswordHash, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  await leaveSessionProof(check.id, bumped.sessionVersion);

  try {
    await sendPasswordChangedEmail(check.email, check.name);
  } catch (err) {
    console.error("Failed to send password-changed notice:", err);
  }

  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Sign out other devices, the explicit, on-demand version of what a
// password change now also does as a side effect. Same mechanism (bump
// User.sessionVersion; every other open session's JWT was issued against
// the old value and fails the check on its next touch), exposed as its own
// action for someone who just wants to do this without also changing their
// password, e.g. after using a shared or public computer.
// ---------------------------------------------------------------------------

export async function signOutOtherDevicesAction() {
  const { id } = await requireSession();
  const bumped = await prisma.user.update({ where: { id }, data: { sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });
  await leaveSessionProof(id, bumped.sessionVersion);
  // The devices that were just signed out no longer belong in the list; this one stays. If one signs in again it is a new device.
  const mine = await currentDeviceId(id, (await headers()).get("user-agent"));
  await prisma.knownDevice.deleteMany({ where: { userId: id, ...(mine ? { id: { not: mine } } : {}) } });
  await noticeAccountChange(id, { kind: "signed-out-everywhere", by: "you" });
  return { ok: true as const };
}

/** Signs out one device from the list (never this one: that is the normal sign out). Its session stops working on its next request. */
export async function signOutDeviceAction(deviceId: string) {
  const { id, sid } = await requireSession();
  const mine = await currentDeviceId(id, (await headers()).get("user-agent"));
  const device = await prisma.knownDevice.findFirst({ where: { id: deviceId, userId: id }, select: { id: true, sessionIds: true } });
  if (!device) return { ok: false as const, error: "That device is no longer in the list." };
  const isThisBrowserKind = deviceId === mine;
  // Every session recorded on that device except the one making this request.
  const toRevoke = device.sessionIds.filter((x) => x !== sid);
  if (toRevoke.length > 0) {
    // Each session is refused by its own id, so another browser of the same kind (or this one, signing in again) is untouched.
    const row = await prisma.user.findUniqueOrThrow({ where: { id }, select: { revokedSessionIds: true } });
    await prisma.user.update({ where: { id }, data: { revokedSessionIds: [...row.revokedSessionIds, ...toRevoke].slice(-200) } });
    await prisma.knownDevice.update({ where: { id: device.id }, data: { sessionIds: sid && device.sessionIds.includes(sid) ? [sid] : [], ...(isThisBrowserKind ? {} : { signedOutAt: new Date() }) } });
    return { ok: true as const };
  }
  if (isThisBrowserKind) return { ok: false as const, error: "That is the device you are on. Use Sign out to leave it." };
  // An older session with no id of its own: only the browser label can tell it apart.
  await prisma.knownDevice.update({ where: { id: device.id }, data: { signedOutAt: new Date() } });
  return { ok: true as const };
}

export interface SignedInDevice {
  id: string;
  label: string;
  kind: "Phone" | "Tablet" | "Computer";
  place: string | null;
  signedInAt: string;
  lastSeenAt: string;
  active: boolean;
  isThisDevice: boolean;
  /** Other sessions on this same kind of device (besides the one asking), so a thief's copy next to your own can still be signed out. */
  otherSessions: number;
}

/** Where this account is signed in: device, rough place (never the IP), when it signed in, and whether it is open right now. */
export async function listSignedInDevicesAction(): Promise<SignedInDevice[]> {
  const { id, sid } = await requireSession();
  const [rows, mine] = await Promise.all([
    prisma.knownDevice.findMany({ where: { userId: id, signedOutAt: null }, orderBy: { lastSeenAt: "desc" }, take: 20 }),
    currentDeviceId(id, (await headers()).get("user-agent")),
  ]);
  const now = Date.now();
  return rows.map((d) => ({
    id: d.id,
    label: d.label,
    kind: deviceKind(d.label),
    place: placeLabel(d),
    signedInAt: d.signedInAt.toISOString(),
    lastSeenAt: d.lastSeenAt.toISOString(),
    active: now - d.lastSeenAt.getTime() < DEVICE_ACTIVE_MS || d.id === mine,
    isThisDevice: d.id === mine,
    otherSessions: d.sessionIds.filter((x) => x !== sid).length,
  }));
}

// ---------------------------------------------------------------------------
// Avatar, stored on R2 (like lesson content), not inline in Postgres.
// The browser resizes the image client-side and uploads it directly to R2
// via a short-lived presigned URL; the app server only ever handles the
// resulting small URL, never the image bytes themselves.
// ---------------------------------------------------------------------------

export async function requestAvatarUploadUrlAction(fileName: string, contentType: string, fileSize: number) {
  const { id } = await requireSession();
  // The real allowlist/size enforcement now lives in createPresignedAvatarUpload
  // (see storage.ts), this early check just keeps the existing fast, specific
  // error message for the common case rather than storage.ts's generic one.
  if (!contentType.startsWith("image/")) throw new Error("Only image files are supported.");
  return createPresignedAvatarUpload(id, fileName, contentType, fileSize);
}

export async function updateAvatarAction(publicUrl: string) {
  const { id } = await requireSession();

  // The key is namespaced avatars/<userId>/..., checking that prefix means
  // a user can only ever point their own image at something they actually
  // just uploaded themselves, not at another user's file.
  const key = keyFromPublicUrl(publicUrl);
  if (!key || !key.startsWith(`avatars/${id}/`)) {
    return { ok: false as const, error: "Invalid image upload." };
  }

  const previous = await prisma.user.findUnique({ where: { id }, select: { image: true } });
  const updated = await prisma.user.update({ where: { id }, data: { image: publicUrl }, select: { image: true } });

  // Best-effort cleanup of the previous avatar so the bucket doesn't
  // accumulate orphaned files, never blocks the update itself.
  const previousKey = previous?.image ? keyFromPublicUrl(previous.image) : null;
  if (previousKey) await deleteObject(previousKey);

  revalidatePath("/", "layout"); // the photo is in the top bar menu
  return { ok: true as const, image: updated.image };
}

// ---------------------------------------------------------------------------
// Music profile (from onboarding, editable anytime, no code confirmation
// needed since none of this is security-sensitive)
// ---------------------------------------------------------------------------

export interface MusicProfileInput {
  primaryInstrument: PrimaryInstrument;
  skillLevel: SkillLevel;
  genres: MusicGenre[];
  learningGoal: LearningGoal;
}

export async function updateMusicProfileAction(input: MusicProfileInput) {
  if (input.genres.length === 0) return { ok: false as const, error: "Pick at least one genre." };

  const { id } = await requireSession();
  await prisma.user.update({
    where: { id },
    data: {
      primaryInstrument: input.primaryInstrument,
      skillLevel: input.skillLevel,
      genres: input.genres,
      learningGoal: input.learningGoal,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Notification settings, also not security-sensitive, no code confirmation
// ---------------------------------------------------------------------------

export interface NotificationPreferencesInput {
  notifyEmailPayments: boolean;
  notifyEmailRoleUpdates: boolean;
  notifyEmailSocial: boolean;
  notifyEmailReminders: boolean;
  notifyEmailClasses: boolean;
}

export async function updateNotificationPreferencesAction(input: NotificationPreferencesInput) {
  const { id } = await requireSession();
  // Named fields only, each forced to a boolean. A server action receives whatever object the browser posts (the
  // interface above is not checked at runtime), so `data: input` once let a signed-in student also write `role`,
  // `email`, `emailVerified` or any other column of their own row.
  await prisma.user.update({
    where: { id },
    data: {
      notifyEmailPayments: input?.notifyEmailPayments === true,
      notifyEmailRoleUpdates: input?.notifyEmailRoleUpdates === true,
      notifyEmailSocial: input?.notifyEmailSocial === true,
      notifyEmailReminders: input?.notifyEmailReminders === true,
      notifyEmailClasses: input?.notifyEmailClasses === true,
    },
  });
  // Practice reminders also decide the practice banner, and the shell is where the banners are decided.
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/** Settings > Privacy and the leaderboard screen: take yourself off (or put yourself back on) the studio leaderboard. */
export async function setLeaderboardHiddenAction(hidden: boolean) {
  const { id } = await requireSession();
  await prisma.user.update({ where: { id }, data: { hideFromLeaderboard: hidden === true } });
  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Username, used for friend search; not code-gated, same reasoning as the
// music profile and notification settings above (not a security-sensitive
// change, unlike name/password/avatar which prove identity elsewhere).
// ---------------------------------------------------------------------------

export async function updateUsernameAction(newUsername: string) {
  const { id } = await requireSession();
  try {
    const updated = await setUsername(id, newUsername);
    revalidatePath("/", "layout");
    return { ok: true as const, username: updated.username };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError ? err.message : "Something went wrong." };
  }
}

// ---------------------------------------------------------------------------
// Delete account, the one destructive, irreversible action in this file, so
// unlike password/name/avatar it deliberately keeps the emailed-code step
// the 2026-08-07 decision (see PasswordSection above) dropped everywhere
// else. Both steps require the account's own current password, checked
// server-side each time, never trust a password the client claims it
// already validated in an earlier call.
// ---------------------------------------------------------------------------

const DELETE_ACCOUNT_CODE_PURPOSE = "DELETE_ACCOUNT" as const;

async function verifyCurrentPassword(userId: string, currentPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, passwordHash: true } });
  if (!user) return { ok: false as const, error: "Something went wrong. Try signing in again." };
  if (!user.passwordHash) {
    // An account with no password (nothing in this app issues one today,
    // but the column is nullable) has no credential to check against,
    // fail closed rather than silently skipping the check.
    return { ok: false as const, error: "This account has no password set. Message the studio to have your account removed." };
  }
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { ok: false as const, error: "Current password is incorrect." };
  }
  return { ok: true as const, email: user.email };
}

/** Step 1: password-gated, emails a fresh 6-digit code to the account's own address (never anything the client supplies). */
export async function requestAccountDeletionCodeAction(currentPassword: string) {
  const { id } = await requireSession();
  const check = await verifyCurrentPassword(id, currentPassword);
  if (!check.ok) return check;

  const blocker1 = await accountDeletionBlocker(id);
  if (blocker1) return { ok: false as const, error: blocker1 };

  try {
    const result = await createAndSendCode({ email: check.email, userId: id, purpose: DELETE_ACCOUNT_CODE_PURPOSE });
    if (!result.ok) return { ok: false as const, error: "Couldn't send a verification code. Try again in a moment." };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false as const, error: err.message };
    throw err;
  }

  return { ok: true as const };
}

/** Step 2: re-checks the password (defense in depth against the two steps being called out of order) and the emailed code, then permanently deletes the account. */
export async function confirmAccountDeletionAction(currentPassword: string, code: string) {
  const { id } = await requireSession();
  const check = await verifyCurrentPassword(id, currentPassword);
  if (!check.ok) return check;

  const verified = await verifyCode(check.email, DELETE_ACCOUNT_CODE_PURPOSE, code.trim());
  if (!verified.ok) {
    const REASON_MESSAGE: Record<typeof verified.reason, string> = {
      not_found: "Request a verification code first.",
      expired: "That code expired. Request a new one.",
      too_many_attempts: "Too many incorrect attempts. Request a new code.",
      incorrect: "Incorrect code.",
    };
    return { ok: false as const, error: REASON_MESSAGE[verified.reason] };
  }

  const blocker = await accountDeletionBlocker(id);
  if (blocker) return { ok: false as const, error: blocker };

  try {
    // Read the avatar URL before the row disappears. Deleting the User
    // row was, until this fix, the entire "delete my account" story: it
    // took the DB pointer to the avatar with it but left the actual file
    // sitting in R2 forever, unreferenced but still live at its public URL.
    // The privacy policy promises deletion "of your account and its data,"
    // and an orphaned photo a stranger could still load by URL doesn't
    // meet that bar just because nothing in the app links to it anymore.
    const target = await prisma.user.findUnique({ where: { id }, select: { image: true, name: true, email: true } });
    const upcomingClasses = await prisma.classBooking.count({ where: { studentId: id, status: "SCHEDULED", scheduledAt: { gt: new Date() } } });

    // Almost everything cascades from here (schema.prisma, messages,
    // bookings, progress, payments, notifications, ...). The one relation
    // that doesn't (Lesson.uploadedById, required + no onDelete override)
    // blocks deletion with a foreign-key error for an admin who has
    // uploaded course content, caught below rather than left as a raw 500,
    // since there's no other admin here to reassign that content to.
    await removeDiscordPresence(id);
    await prisma.user.delete({ where: { id } });

    if (upcomingClasses > 0) {
      await notifyAdmins("ACCOUNT_DELETED", {
        type: "ADMIN_ALERT",
        title: "A student deleted their account",
        body: `${target?.name ?? target?.email ?? "A student"} deleted their account, so ${upcomingClasses} upcoming class${upcomingClasses === 1 ? " was" : "es were"} removed from the schedule.`,
        emailCategory: "social",
        href: "/admin/users",
      }).catch((err) => console.error("Account deletion alert failed (non-blocking):", err));
    }

    const avatarKey = target?.image ? keyFromPublicUrl(target.image) : null;
    if (avatarKey) await deleteObject(avatarKey);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2014")) {
      return {
        ok: false as const,
        error: "Your account can't be deleted while it owns content other students depend on (uploaded lessons). Message the studio for help with this.",
      };
    }
    throw err;
  }

  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Manage Subscriptions: self-service term change and cancellation for the
// signed-in student's own Payment Plan. See paymentPlans.ts for the real
// logic; these just add the session check and translate PaymentPlanError
// into the same {ok, error} shape every other action in this file uses.
// ---------------------------------------------------------------------------

export async function changePaymentPlanTermAction(newTerm: PaymentPlanTerm) {
  const { id } = await requireSession();
  if (await hasParentControl(id)) return { ok: false as const, error: PARENT_CONTROL_MESSAGE };
  try {
    await changePaymentPlanTerm(id, newTerm);
    revalidatePath("/", "layout"); // the plan shows on billing, lessons, the dashboard and the top bar too
    return { ok: true as const, error: null };
  } catch (err) {
    if (err instanceof PaymentPlanError) return { ok: false as const, error: err.message };
    throw err;
  }
}

export async function pausePaymentPlanAction(weeks: number) {
  const { id } = await requireSession();
  if (await hasParentControl(id)) return { ok: false as const, error: PARENT_CONTROL_MESSAGE, resumesOn: null };
  try {
    const { resumesOn } = await pausePaymentPlan(id, Number(weeks));
    revalidatePath("/", "layout");
    return { ok: true as const, error: null, resumesOn: resumesOn.toISOString() };
  } catch (err) {
    if (err instanceof PaymentPlanError) return { ok: false as const, error: err.message, resumesOn: null };
    throw err;
  }
}

export async function cancelPaymentPlanBySelfAction(reason: PlanCancellationReason, reasonNote: string | null) {
  const { id } = await requireSession();
  if (await hasParentControl(id)) return { ok: false as const, error: PARENT_CONTROL_MESSAGE };
  try {
    await cancelPaymentPlanBySelf(id, reason, reasonNote);
    revalidatePath("/", "layout"); // the plan shows on billing, lessons, the dashboard and the top bar too
    return { ok: true as const, error: null };
  } catch (err) {
    if (err instanceof PaymentPlanError) return { ok: false as const, error: err.message };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Admin two-step sign-in (authenticator app). Admin only; the library refuses anyone else.
// ---------------------------------------------------------------------------

export type TwoStepResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function twoStepCall<T extends object>(work: (userId: string) => Promise<T>): Promise<TwoStepResult<T>> {
  try {
    const { id } = await requireSession();
    await consumeRateLimit(prisma, `admin-2fa:${id}`, { windowMinutes: 15, max: 12, message: "Too many tries. Wait a few minutes." });
    return { ok: true, ...(await work(id)) };
  } catch (err) {
    if (err instanceof TwoStepError || err instanceof RateLimitError || err instanceof RateLimitErr) return { ok: false, error: err.message };
    const message = err instanceof Error ? err.message : "";
    if (message.includes("ADMIN_TOTP_ENCRYPTION_KEY")) return { ok: false, error: "Two-step sign-in is not set up on the server yet (the encryption key is missing)." };
    console.error("Admin two-step action failed:", err);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export async function twoStepBeginAction() {
  return twoStepCall((id) => beginSetup(id));
}

export async function twoStepConfirmAction(code: string) {
  const result = await twoStepCall(async (id) => ({ backupCodes: await confirmSetup(id, code) }));
  if (result.ok) revalidatePath("/account");
  return result;
}

export async function twoStepDisableAction(password: string, code: string) {
  const result = await twoStepCall(async (id) => {
    await disableTwoStep(id, password, code);
    return {};
  });
  if (result.ok) revalidatePath("/account");
  return result;
}

export async function twoStepRegenerateAction(code: string) {
  return twoStepCall(async (id) => ({ backupCodes: await regenerateBackupCodes(id, code) }));
}
