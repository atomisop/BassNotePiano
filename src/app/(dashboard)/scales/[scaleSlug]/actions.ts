"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { markPracticeCompleted, recordQuizAttempt, syncLessonCompletionToModuleRead, AccessDeniedError } from "@/lib/access";
import { markLessonComplete } from "@/lib/courseContent";
import { gradeQuiz, type QuizAnswerSubmission } from "@/lib/quiz";

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

/**
 * Marks one course-content Lesson complete for the current student, then
 * syncs the scale's moduleRead checklist item if every lesson is now done.
 * This is what the course player calls on video-ended / PDF-opened /
 * manual "Mark as complete" — replaces the old manual "Mark module as
 * read" button entirely, since real content now drives that flag.
 */
export async function markLessonCompleteAction(scaleSlug: string, lessonId: string) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/scales/${scaleSlug}`);

  await markLessonComplete(session.user.id, lessonId);
  await syncLessonCompletionToModuleRead(session.user.id, scaleSlug);

  revalidatePath(`/scales/${scaleSlug}`);
  revalidatePath("/dashboard");
}
