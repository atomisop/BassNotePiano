"use server";

import { getServerAuthSession } from "@/lib/auth";
import { getPianoBest, PianoAttemptError, recordPianoAttempt, type PianoBest } from "@/lib/piano/attempts";
import { reportError } from "@/lib/reportError";

export type SaveAttemptResult = { ok: true; saved: boolean; accuracy: number; best: PianoBest } | { ok: false; error: string };

export async function savePianoAttemptAction(input: { exerciseId: string; mode: string; attempts: number; correct: number; clientKey: string }): Promise<SaveAttemptResult> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return { ok: false, error: "Sign in to save your results." };
  try {
    const result = await recordPianoAttempt(session.user.id, {
      exerciseId: String(input?.exerciseId),
      mode: String(input?.mode),
      attempts: Number(input?.attempts),
      correct: Number(input?.correct),
      clientKey: String(input?.clientKey),
    });
    return { ok: true, saved: result.saved, accuracy: result.accuracy, best: await getPianoBest(session.user.id, String(input.exerciseId)) };
  } catch (err) {
    if (err instanceof PianoAttemptError) return { ok: false, error: err.message };
    reportError(err, "Piano attempt save");
    return { ok: false, error: "Could not save this run. Your result is still on screen." };
  }
}
