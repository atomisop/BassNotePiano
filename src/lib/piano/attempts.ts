import { prisma } from "@/lib/prisma";
import { EXERCISES } from "@/lib/piano/exercises";

export class PianoAttemptError extends Error {}

export const MAX_SAVES_PER_HOUR = 30;
const MAX_ATTEMPTS = 500;

export interface PianoAttemptInput {
  exerciseId: string;
  mode: string;
  attempts: number;
  correct: number;
  clientKey: string;
}

export interface PianoBest {
  bestAccuracy: number | null;
  runs: number;
}

export const accuracyOf = (a: { attempts: number; correct: number }) => Math.round((a.correct / a.attempts) * 100);

/**
 * Saves one FINISHED run. The browser reports what happened, so the server refuses anything that could not have happened:
 * an unknown exercise, a run that did not reach the last note (correct must equal the exercise length), fewer attempts than notes,
 * or an absurd count. Accuracy is never accepted from the browser; it is worked out here. The same clientKey saves once, so a
 * retry or a double tap cannot add a second run, and a person can save at most MAX_SAVES_PER_HOUR runs an hour.
 */
export async function recordPianoAttempt(userId: string, input: PianoAttemptInput) {
  const exercise = EXERCISES[input.exerciseId];
  if (!exercise) throw new PianoAttemptError("Unknown exercise.");
  if (input.mode !== "guided" && input.mode !== "memory") throw new PianoAttemptError("Unknown mode.");
  const { attempts, correct } = input;
  if (![attempts, correct].every((n) => Number.isInteger(n))) throw new PianoAttemptError("Invalid result.");
  if (correct !== exercise.notes.length) throw new PianoAttemptError("Only a finished run is saved.");
  if (attempts < correct || attempts > MAX_ATTEMPTS) throw new PianoAttemptError("Invalid result.");
  if (typeof input.clientKey !== "string" || input.clientKey.length < 8 || input.clientKey.length > 64) throw new PianoAttemptError("Invalid request.");

  const existing = await prisma.pianoPracticeAttempt.findUnique({ where: { userId_clientKey: { userId, clientKey: input.clientKey } } });
  if (existing) return { saved: false as const, accuracy: accuracyOf(existing) };

  const recent = await prisma.pianoPracticeAttempt.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recent >= MAX_SAVES_PER_HOUR) throw new PianoAttemptError("That is a lot of runs. Take a short break and try again later.");

  try {
    await prisma.pianoPracticeAttempt.create({ data: { userId, exerciseId: input.exerciseId, mode: input.mode, attempts, correct, clientKey: input.clientKey } });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return { saved: false as const, accuracy: accuracyOf({ attempts, correct }) };
    throw err;
  }
  return { saved: true as const, accuracy: accuracyOf({ attempts, correct }) };
}

export async function getPianoBest(userId: string, exerciseId: string): Promise<PianoBest> {
  const rows = await prisma.pianoPracticeAttempt.findMany({ where: { userId, exerciseId }, select: { attempts: true, correct: true } });
  if (rows.length === 0) return { bestAccuracy: null, runs: 0 };
  return { bestAccuracy: Math.max(...rows.map(accuracyOf)), runs: rows.length };
}
