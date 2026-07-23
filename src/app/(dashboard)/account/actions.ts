"use server";

import bcrypt from "bcryptjs";
import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyCode, createAndSendCode, type VerifyCodeResult } from "@/lib/verification";
import { setUsername, SocialError } from "@/lib/social";

const MIN_PASSWORD_LENGTH = 8;
const MAX_AVATAR_DATA_URI_LENGTH = 2_500_000; // ~1.8MB image, base64-inflated

const REASON_MESSAGES: Record<string, string> = {
  not_found: "We couldn't find an active code. Request a new one.",
  expired: "That code has expired. Request a new one.",
  too_many_attempts: "Too many incorrect attempts. Request a new code.",
  incorrect: "That code isn't right. Double-check and try again.",
};

/** Every action here operates on the signed-in user only — never on an email passed by the client. */
async function requireSession() {
  const session = await getServerAuthSession();
  if (!session?.user?.id || !session.user.email) throw new Error("Not signed in.");
  return { id: session.user.id, email: session.user.email };
}

function reasonToMessage(result: Extract<VerifyCodeResult, { ok: false }>) {
  return REASON_MESSAGES[result.reason];
}

// ---------------------------------------------------------------------------
// Display name
// ---------------------------------------------------------------------------

export async function requestNameChangeAction(newName: string) {
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false as const, error: "Name can't be empty." };

  const { id, email } = await requireSession();
  const sendResult = await createAndSendCode({ email, userId: id, purpose: "CHANGE_NAME", payload: { name: trimmed } });
  if (!sendResult.ok) return { ok: false as const, error: "Couldn't send the confirmation email. Try again in a moment." };
  return { ok: true as const };
}

export async function confirmNameChangeAction(code: string) {
  const { id, email } = await requireSession();

  const result = await verifyCode(email, "CHANGE_NAME", code);
  if (!result.ok) return { ok: false as const, error: reasonToMessage(result) };

  const payload = result.payload as { name?: string } | null;
  if (result.userId !== id || !payload?.name) return { ok: false as const, error: "Something went wrong. Request a new code." };

  const updated = await prisma.user.update({ where: { id }, data: { name: payload.name }, select: { name: true } });
  return { ok: true as const, name: updated.name };
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

export async function requestPasswordChangeAction(currentPassword: string, newPassword: string) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false as const, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const { id, email } = await requireSession();
  const user = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { ok: false as const, error: "Current password is incorrect." };
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  const sendResult = await createAndSendCode({ email, userId: id, purpose: "CHANGE_PASSWORD", payload: { passwordHash: newPasswordHash } });
  if (!sendResult.ok) return { ok: false as const, error: "Couldn't send the confirmation email. Try again in a moment." };
  return { ok: true as const };
}

export async function confirmPasswordChangeAction(code: string) {
  const { id, email } = await requireSession();

  const result = await verifyCode(email, "CHANGE_PASSWORD", code);
  if (!result.ok) return { ok: false as const, error: reasonToMessage(result) };

  const payload = result.payload as { passwordHash?: string } | null;
  if (result.userId !== id || !payload?.passwordHash) {
    return { ok: false as const, error: "Something went wrong. Request a new code." };
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash: payload.passwordHash } }),
    // A changed password should invalidate any standing "remember me" trust.
    prisma.trustedDevice.deleteMany({ where: { userId: id } }),
  ]);

  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

export async function requestAvatarChangeAction(dataUri: string) {
  if (!dataUri.startsWith("data:image/") || dataUri.length > MAX_AVATAR_DATA_URI_LENGTH) {
    return { ok: false as const, error: "Choose an image under ~1.8MB." };
  }

  const { id, email } = await requireSession();
  const sendResult = await createAndSendCode({ email, userId: id, purpose: "CHANGE_AVATAR", payload: { image: dataUri } });
  if (!sendResult.ok) return { ok: false as const, error: "Couldn't send the confirmation email. Try again in a moment." };
  return { ok: true as const };
}

export async function confirmAvatarChangeAction(code: string) {
  const { id, email } = await requireSession();

  const result = await verifyCode(email, "CHANGE_AVATAR", code);
  if (!result.ok) return { ok: false as const, error: reasonToMessage(result) };

  const payload = result.payload as { image?: string } | null;
  if (result.userId !== id || !payload?.image) return { ok: false as const, error: "Something went wrong. Request a new code." };

  const updated = await prisma.user.update({ where: { id }, data: { image: payload.image }, select: { image: true } });
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
