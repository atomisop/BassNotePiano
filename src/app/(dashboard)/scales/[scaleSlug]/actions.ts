"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { canAccessScale, markPracticeCompleted, recordQuizAttempt, syncLessonCompletionToModuleRead, AccessDeniedError } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { TRIAL_LESSON_COUNT } from "@/lib/entitlementRules";
import { markLessonComplete } from "@/lib/courseContent";
import { gradeQuiz, type QuizAnswerSubmission } from "@/lib/quiz";

// The quiz itself is regenerated here from scratch (via gradeQuiz ->
// generateScaleQuiz) rather than trusting anything about correctness from
// the client — the client only ever received choices, never an answer key.
// `seed` is whatever QuizModal rolled for this attempt, echoed back here so
// grading reconstructs the exact same questions/choices the student actually
// saw. See quiz.ts's own header comment for why trusting a client-supplied
// seed verbatim is fine: there's no secret being protected, a mismatched
// seed only ever grades against content the student wasn't shown.
export async function submitQuizAction(scaleSlug: string, seed: number, answers: QuizAnswerSubmission[]) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/scales/${scaleSlug}`);

  const { score, total, results } = gradeQuiz(scaleSlug, seed, answers);
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

  // Completion is only recorded for a lesson the student can actually open:
  // in a scale they have access to, and inside the trial slice on a trial.
  const access = await canAccessScale(session.user.id, scaleSlug);
  if (!access?.canAccess) throw new AccessDeniedError(`No access to "${scaleSlug}"`);
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { order: true, scaleGroupId: true } });
  if (!lesson || lesson.scaleGroupId !== access.scaleGroup.id) throw new AccessDeniedError("Lesson is not part of this scale");
  if (access.reason === "trial" && lesson.order >= TRIAL_LESSON_COUNT) throw new AccessDeniedError("Not part of the free trial");

  await markLessonComplete(session.user.id, lessonId);
  await syncLessonCompletionToModuleRead(session.user.id, scaleSlug);

  revalidatePath(`/scales/${scaleSlug}`);
  revalidatePath("/dashboard");
}
