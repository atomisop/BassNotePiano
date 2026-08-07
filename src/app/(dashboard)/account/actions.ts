"use server";

import bcrypt from "bcryptjs";
import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setUsername, SocialError } from "@/lib/social";

const MIN_PASSWORD_LENGTH = 8;
const MAX_AVATAR_DATA_URI_LENGTH = 2_500_000; // ~1.8MB image, base64-inflated

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
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash: newPasswordHash } }),
    // Harmless no-op today (nothing populates TrustedDevice anymore since
    // login no longer has a "remember me" step), kept in case that ever
    // comes back — a changed password should always invalidate it.
    prisma.trustedDevice.deleteMany({ where: { userId: id } }),
  ]);

  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

export async function updateAvatarAction(dataUri: string) {
  if (!dataUri.startsWith("data:image/") || dataUri.length > MAX_AVATAR_DATA_URI_LENGTH) {
    return { ok: false as const, error: "Choose an image under ~1.8MB." };
  }

  const { id } = await requireSession();
  const updated = await prisma.user.update({ where: { id }, data: { image: dataUri }, select: { image: true } });
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
