"use server";

import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface OnboardingInput {
  primaryInstrument: PrimaryInstrument;
  skillLevel: SkillLevel;
  genres: MusicGenre[];
  learningGoal: LearningGoal;
}

export async function saveOnboardingAction(input: OnboardingInput) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return { ok: false as const, error: "Not signed in." };

  if (input.genres.length === 0) {
    return { ok: false as const, error: "Pick at least one genre." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      primaryInstrument: input.primaryInstrument,
      skillLevel: input.skillLevel,
      genres: input.genres,
      learningGoal: input.learningGoal,
      onboardedAt: new Date(),
    },
  });

  return { ok: true as const };
}
