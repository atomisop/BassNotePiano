"use server";

import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setUsername, SocialError } from "@/lib/social";
import { normalizeUsername, numberedVariants, usernameCandidates, usernameProblem } from "@/lib/usernameRules";
import { recordInstrumentInterest } from "@/lib/instrumentInterest";
import { reportError } from "@/lib/reportError";

export interface OnboardingInput {
  username: string;
  /** Null only when the student ticked "tell me when it opens" for an instrument we do not teach yet and chose none; saved as Other. */
  primaryInstrument: PrimaryInstrument | null;
  /** Everything after the instrument is optional: a student can finish now and fill it in later. */
  skillLevel: SkillLevel | null;
  genres: MusicGenre[];
  learningGoal: LearningGoal | null;
  /** Instruments not taught yet that the student wants to hear about (see instrumentInterest.ts). */
  waitlist?: PrimaryInstrument[];
}

/** Up to three usernames built from the signed-in student's name that nobody holds yet; `typed` adds numbered versions of what they tried. */
async function freeUsernameSuggestions(typed?: string): Promise<string[]> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return [];
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } });
  if (!me) return [];
  const base = typed ? normalizeUsername(typed).replace(/[^a-z0-9_]/g, "").replace(/\d+$/, "") : "";
  const candidates = [...(base.length >= 3 ? numberedVariants(base) : []), ...usernameCandidates(me.name, me.email)];
  const unique = [...new Set(candidates)];
  if (unique.length === 0) return [];
  const taken = await prisma.user.findMany({ where: { username: { in: unique } }, select: { username: true } });
  const takenSet = new Set(taken.map((t) => t.username));
  return unique.filter((u) => !takenSet.has(u)).slice(0, 3);
}

/** Free usernames to offer before the student has typed anything. */
export async function suggestUsernamesAction(): Promise<string[]> {
  return freeUsernameSuggestions();
}

export async function checkUsernameAvailableAction(raw: string): Promise<{ available: boolean; reason?: string; suggestions?: string[] }> {
  const username = normalizeUsername(raw);
  // The same rules saving applies (format AND the reserved names), so a name that passes here cannot be refused on the last step.
  const problem = usernameProblem(username);
  if (problem) return { available: false, reason: problem, suggestions: await freeUsernameSuggestions(username) };
  const existing = await prisma.user.findUnique({ where: { username } });
  return existing ? { available: false, reason: "Already taken.", suggestions: await freeUsernameSuggestions(username) } : { available: true };
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
      primaryInstrument: input.primaryInstrument ?? "OTHER",
      skillLevel: input.skillLevel ?? undefined,
      genres: input.genres,
      learningGoal: input.learningGoal ?? undefined,
      onboardedAt: new Date(),
    },
  });

  // After the profile is saved and never blocking it: the list is a convenience for the owner, not part of finishing setup.
  await recordInstrumentInterest(session.user.id, input.waitlist).catch((err) => reportError(err, "Saving the instrument waitlist failed"));

  return { ok: true as const };
}
