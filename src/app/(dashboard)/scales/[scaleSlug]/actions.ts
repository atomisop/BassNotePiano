"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { canAccessScale, markPracticeCompleted, recordQuizAttempt, syncLessonCompletionToModuleRead, AccessDeniedError } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getNumberSetting } from "@/lib/siteSettings";
import { markLessonComplete } from "@/lib/courseContent";
import { gradeQuiz, type QuizAnswerSubmission } from "@/lib/quiz";
import { SCALE_NOTE_MAX_LENGTH } from "@/lib/scaleNotes";

// The quiz itself is regenerated here from scratch (via gradeQuiz ->
// generateScaleQuiz) rather than trusting anything about correctness from
// the client, the client only ever received choices, never an answer key.
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
  revalidatePath("/roadmap");

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
  revalidatePath("/roadmap");
}

/**
 * Marks one course-content Lesson complete for the current student, then
 * syncs the scale's moduleRead checklist item if every lesson is now done.
 * This is what the course player calls on video-ended / PDF-opened /
 * manual "Mark as complete", replaces the old manual "Mark module as
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
  if (access.reason === "trial" && lesson.order >= (await getNumberSetting("trial.lessonCount"))) throw new AccessDeniedError("Not part of the free trial");

  await markLessonComplete(session.user.id, lessonId);
  await syncLessonCompletionToModuleRead(session.user.id, scaleSlug);

  revalidatePath(`/scales/${scaleSlug}`);
  revalidatePath("/dashboard");
  revalidatePath("/roadmap");
}

/**
 * Saves the student's own note for this scale (the lesson page's Notes
 * tool autosaves through here). Scoped by the session's user id, never a
 * client-supplied one, and only for a scale the student can currently open.
 * An empty note deletes the row rather than keeping a blank one around.
 */
export async function saveScaleNoteAction(scaleSlug: string, body: string): Promise<{ ok: true; savedAt: string } | { ok: false; error: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) return { ok: false, error: "Your session ended. Log in again to save notes." };
  if (typeof body !== "string") return { ok: false, error: "That note couldn't be saved." };
  if (body.length > SCALE_NOTE_MAX_LENGTH) {
    return { ok: false, error: `Notes can be up to ${SCALE_NOTE_MAX_LENGTH.toLocaleString("en-US")} characters.` };
  }

  const access = await canAccessScale(session.user.id, scaleSlug);
  if (!access?.canAccess) return { ok: false, error: "You don't have access to this scale right now." };

  const where = { userId_scaleGroupId: { userId: session.user.id, scaleGroupId: access.scaleGroup.id } };
  if (body.trim() === "") {
    await prisma.scaleNote.deleteMany({ where: { userId: session.user.id, scaleGroupId: access.scaleGroup.id } });
    return { ok: true, savedAt: new Date().toISOString() };
  }

  const note = await prisma.scaleNote.upsert({
    where,
    create: { userId: session.user.id, scaleGroupId: access.scaleGroup.id, body },
    update: { body },
    select: { updatedAt: true },
  });
  return { ok: true, savedAt: note.updatedAt.toISOString() };
}
