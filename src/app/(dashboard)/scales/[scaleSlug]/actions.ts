"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { markModuleRead, markPracticeCompleted, recordQuizAttempt, AccessDeniedError } from "@/lib/access";
import { gradeQuiz, type QuizAnswerSubmission } from "@/lib/quiz";

export async function markModuleReadAction(scaleSlug: string) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/scales/${scaleSlug}`);

  try {
    await markModuleRead(session.user.id, scaleSlug);
  } catch (err) {
    if (err instanceof AccessDeniedError) return; // page wouldn't have rendered this control without access
    throw err;
  }

  revalidatePath(`/scales/${scaleSlug}`);
  revalidatePath("/dashboard");
}

// The quiz itself is regenerated here from scratch (via gradeQuiz ->
// generateScaleQuiz) rather than trusting anything about correctness from
// the client — the client only ever received choices, never an answer key.
export async function submitQuizAction(scaleSlug: string, answers: QuizAnswerSubmission[]) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/scales/${scaleSlug}`);

  const { score, total, results } = gradeQuiz(scaleSlug, answers);
  const { passed } = await recordQuizAttempt(session.user.id, scaleSlug, {
    score,
    totalQuestions: total,
    answers: results,
  });

  revalidatePath(`/scales/${scaleSlug}`);
  revalidatePath("/dashboard");

  return { passed, score, total };
}

export async function markPracticeCompletedAction(scaleSlug: string) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/scales/${scaleSlug}`);

  try {
    await markPracticeCompleted(session.user.id, scaleSlug);
  } catch (err) {
    if (err instanceof AccessDeniedError) return;
    throw err;
  }

  revalidatePath(`/scales/${scaleSlug}`);
  revalidatePath("/dashboard");
}
