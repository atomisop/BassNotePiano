"use server";

import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setUsername, isValidUsername, normalizeUsername, SocialError } from "@/lib/social";

export interface OnboardingInput {
  username: string;
  primaryInstrument: PrimaryInstrument;
  /** Everything after the instrument is optional: a student can finish now and fill it in later. */
  skillLevel: SkillLevel | null;
  genres: MusicGenre[];
  learningGoal: LearningGoal | null;
}

export async function checkUsernameAvailableAction(raw: string): Promise<{ available: boolean; reason?: string }> {
  const username = normalizeUsername(raw);
  if (!isValidUsername(username)) {
    return { available: false, reason: "3-20 characters: lowercase letters, numbers, and underscores only." };
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  return existing ? { available: false, reason: "Already taken." } : { available: true };
}

export async function saveOnboardingAction(input: OnboardingInput) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return { ok: false as const, error: "Not signed in." };

  try {
    await setUsername(session.user.id, input.username);
  } catch (err) {
    return { ok: false as const, error: err instanceof SocialError ? err.message : "Something went wrong." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      primaryInstrument: input.primaryInstrument,
      skillLevel: input.skillLevel ?? undefined,
      genres: input.genres,
      learningGoal: input.learningGoal ?? undefined,
      onboardedAt: new Date(),
    },
  });

  return { ok: true as const };
}
