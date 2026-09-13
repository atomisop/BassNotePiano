"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setUsername, SocialError } from "@/lib/social";
import { createPresignedAvatarUpload, deleteObject, keyFromPublicUrl, isObjectStorageConfigured } from "@/lib/storage";
import { createAndSendCode, verifyCode, RateLimitError } from "@/lib/verification";

const MIN_PASSWORD_LENGTH = 8;

/** Every action here operates on the signed-in user only — never on an email passed by the client. */
async function requireSession() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new Error("Not signed in.");
  return { id: session.user.id };
}

// ---------------------------------------------------------------------------
// Display name — applied immediately, no code confirmation. Per the
// 2026-08-07 decision, a code is only required for account creation
// (EMAIL_VERIFY) and password reset (PASSWORD_RESET); everything else you
// can already only reach while signed in as yourself.
// ---------------------------------------------------------------------------

export async function updateNameAction(newName: string) {
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false as const, error: "Name can't be empty." };

  const { id } = await requireSession();
  const updated = await prisma.user.update({ where: { id }, data: { name: trimmed }, select: { name: true } });
  return { ok: true as const, name: updated.name };
}

// ---------------------------------------------------------------------------
// Password — still requires the current password, just no longer a mailed
// code on top of it.
// ---------------------------------------------------------------------------

export async function updatePasswordAction(currentPassword: string, newPassword: string) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false as const, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const { id } = await requireSession();
  const user = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { ok: false as const, error: "Current password is incorrect." };
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  // sessionVersion increment is what actually makes "signs out any other
  // devices" (below) true — see the jwt callback in src/lib/auth.ts. The
  // client re-syncs its OWN session to the new version right after this
  // call succeeds, via next-auth's update(), so only other devices drop.
  await prisma.user.update({
    where: { id },
    data: { passwordHash: newPasswordHash, sessionVersion: { increment: 1 } },
  });

  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Sign out other devices — the explicit, on-demand version of what a
// password change now also does as a side effect. Same mechanism (bump
// User.sessionVersion; every other open session's JWT was issued against
// the old value and fails the check on its next touch), exposed as its own
// action for someone who just wants to do this without also changing their
// password — e.g. after using a shared or public computer.
// ---------------------------------------------------------------------------

export async function signOutOtherDevicesAction() {
  const { id } = await requireSession();
  await prisma.user.update({ where: { id }, data: { sessionVersion: { increment: 1 } } });
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Avatar — stored on R2 (like lesson content), not inline in Postgres.
// The browser resizes the image client-side and uploads it directly to R2
// via a short-lived presigned URL; the app server only ever handles the
// resulting small URL, never the image bytes themselves.
// ---------------------------------------------------------------------------

export async function checkAvatarStorageAction() {
  return isObjectStorageConfigured();
}

export async function requestAvatarUploadUrlAction(fileName: string, contentType: string, fileSize: number) {
  const { id } = await requireSession();
  // The real allowlist/size enforcement now lives in createPresignedAvatarUpload
  // (see storage.ts) — this early check just keeps the existing fast, specific
  // error message for the common case rather than storage.ts's generic one.
  if (!contentType.startsWith("image/")) throw new Error("Only image files are supported.");
  return createPresignedAvatarUpload(id, fileName, contentType, fileSize);
}

export async function updateAvatarAction(publicUrl: string) {
  const { id } = await requireSession();

  // The key is namespaced avatars/<userId>/... — checking that prefix means
  // a user can only ever point their own image at something they actually
  // just uploaded themselves, not at another user's file.
  const key = keyFromPublicUrl(publicUrl);
  if (!key || !key.startsWith(`avatars/${id}/`)) {
    return { ok: false as const, error: "Invalid image upload." };
  }

  const previous = await prisma.user.findUnique({ where: { id }, select: { image: true } });
  const updated = await prisma.user.update({ where: { id }, data: { image: publicUrl }, select: { image: true } });

  // Best-effort cleanup of the previous avatar so the bucket doesn't
  // accumulate orphaned files — never blocks the update itself.
  const previousKey = previous?.image ? keyFromPublicUrl(previous.image) : null;
  if (previousKey) await deleteObject(previousKey);

  return { ok: true as const, image: updated.image };
}

// ---------------------------------------------------------------------------
// Music profile (from onboarding — editable anytime, no code confirmation
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

  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Notification settings — also not security-sensitive, no code confirmation
// ---------------------------------------------------------------------------

export interface NotificationPreferencesInput {
  notifyEmailPayments: boolean;
  notifyEmailRoleUpdates: boolean;
  notifyEmailSocial: boolean;
  notifyEmailReminders: boolean;
}

export async function updateNotificationPreferencesAction(input: NotificationPreferencesInput) {
  const { id } = await requireSession();
  await prisma.user.update({ where: { id }, data: input });
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Username — used for friend search; not code-gated, same reasoning as the
// music profile and notification settings above (not a security-sensitive
// change, unlike name/password/avatar which prove identity elsewhere).
// ---------------------------------------------------------------------------

export async function updateUsernameAction(newUsername: string) {
  const { id } = await requireSession();
  try {
    const updated = await setUsername(id, newUsername);
    return { ok: true as const, username: updated.username };
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError ? err.message : "Something went wrong." };
  }
}

// ---------------------------------------------------------------------------
// Delete account — the one destructive, irreversible action in this file, so
// unlike password/name/avatar it deliberately keeps the emailed-code step
// the 2026-08-07 decision (see PasswordSection above) dropped everywhere
// else. Both steps require the account's own current password, checked
// server-side each time — never trust a password the client claims it
// already validated in an earlier call.
// ---------------------------------------------------------------------------

const DELETE_ACCOUNT_CODE_PURPOSE = "DELETE_ACCOUNT" as const;

async function verifyCurrentPassword(userId: string, currentPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, passwordHash: true } });
  if (!user) return { ok: false as const, error: "Something went wrong — try signing in again." };
  if (!user.passwordHash) {
    // An account with no password (nothing in this app issues one today,
    // but the column is nullable) has no credential to check against —
    // fail closed rather than silently skipping the check.
    return { ok: false as const, error: "This account has no password set — message the studio to have your account removed." };
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

  try {
    const result = await createAndSendCode({ email: check.email, userId: id, purpose: DELETE_ACCOUNT_CODE_PURPOSE });
    if (!result.ok) return { ok: false as const, error: "Couldn't send a verification code — try again in a moment." };
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
      expired: "That code expired — request a new one.",
      too_many_attempts: "Too many incorrect attempts — request a new code.",
      incorrect: "Incorrect code.",
    };
    return { ok: false as const, error: REASON_MESSAGE[verified.reason] };
  }

  try {
    // Read the avatar URL before the row disappears. Deleting the User
    // row was, until this fix, the entire "delete my account" story: it
    // took the DB pointer to the avatar with it but left the actual file
    // sitting in R2 forever, unreferenced but still live at its public URL.
    // The privacy policy promises deletion "of your account and its data,"
    // and an orphaned photo a stranger could still load by URL doesn't
    // meet that bar just because nothing in the app links to it anymore.
    const target = await prisma.user.findUnique({ where: { id }, select: { image: true } });

    // Almost everything cascades from here (schema.prisma — messages,
    // bookings, progress, payments, notifications, ...). The one relation
    // that doesn't (Lesson.uploadedById, required + no onDelete override)
    // blocks deletion with a foreign-key error for an admin who has
    // uploaded course content — caught below rather than left as a raw 500,
    // since there's no other admin here to reassign that content to.
    await prisma.user.delete({ where: { id } });

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
