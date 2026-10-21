"use server";

import { passwordRequirementError } from "@/lib/passwordRules";
import { removeDiscordPresence } from "@/lib/discordCleanup";
import { noticeAccountChange } from "@/lib/studentNotices";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
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
import { sendPasswordChangedEmail } from "@/lib/email";
import { FULL_NAME_MESSAGE, hasFirstAndLastName } from "@/lib/studentName";
import { changePaymentPlanTerm, cancelPaymentPlanBySelf, PaymentPlanError } from "@/lib/paymentPlans";


/** Every action here operates on the signed-in user only, never on an email passed by the client. */
async function requireSession() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new Error("Not signed in.");
  return { id: session.user.id };
}

// ---------------------------------------------------------------------------
// Display name, applied immediately, no code confirmation. Per the
// 2026-08-07 decision, a code is only required for account creation
// (EMAIL_VERIFY) and password reset (PASSWORD_RESET); everything else you
// can already only reach while signed in as yourself.
// ---------------------------------------------------------------------------

export async function updateNameAction(newName: string) {
  const trimmed = newName.trim();
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

/** Deleting the account also deletes its payment and booking records, so a student who is still paying (or whose payment is being checked) has to sort that out first. */
async function accountDeletionBlocker(userId: string): Promise<string | null> {
  const [livePlan, pendingPayment] = await Promise.all([
    prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } }),
    prisma.zellePayment.findFirst({ where: { userId, status: "PENDING_REVIEW" }, select: { id: true } }),
  ]);
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
  await prisma.user.update({
    where: { id: check.id },
    data: { passwordHash: newPasswordHash, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } },
  });

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
  await prisma.user.update({ where: { id }, data: { sessionVersion: { increment: 1 } } });
  // The devices that were just signed out no longer belong in the list; this one stays. If one signs in again it is a new device.
  const mine = await currentDeviceId(id, (await headers()).get("user-agent"));
  await prisma.knownDevice.deleteMany({ where: { userId: id, ...(mine ? { id: { not: mine } } : {}) } });
  await noticeAccountChange(id, { kind: "signed-out-everywhere", by: "you" });
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
}

/** Where this account is signed in: device, rough place (never the IP), when it signed in, and whether it is open right now. */
export async function listSignedInDevicesAction(): Promise<SignedInDevice[]> {
  const { id } = await requireSession();
  const [rows, mine] = await Promise.all([
    prisma.knownDevice.findMany({ where: { userId: id }, orderBy: { lastSeenAt: "desc" }, take: 20 }),
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
  await prisma.user.update({ where: { id }, data: input });
  // Practice reminders also decide the practice banner, and the shell is where the banners are decided.
  revalidatePath("/", "layout");
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
  try {
    await changePaymentPlanTerm(id, newTerm);
    revalidatePath("/", "layout"); // the plan shows on billing, lessons, the dashboard and the top bar too
    return { ok: true as const, error: null };
  } catch (err) {
    if (err instanceof PaymentPlanError) return { ok: false as const, error: err.message };
    throw err;
  }
}

export async function cancelPaymentPlanBySelfAction(reason: PlanCancellationReason, reasonNote: string | null) {
  const { id } = await requireSession();
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
