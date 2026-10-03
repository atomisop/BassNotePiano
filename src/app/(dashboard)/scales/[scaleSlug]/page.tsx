import { notFound, redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessScale, QUIZ_PASS_THRESHOLD } from "@/lib/access";
import { getLessonsWithProgress } from "@/lib/courseContent";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { TRIAL_LESSON_COUNT } from "@/lib/entitlementRules";
import { LESSON_VARIANTS, SCALE_CONTENT } from "@/lib/scale-content";
import { generateScaleQuiz, stripAnswers } from "@/lib/quiz";
import { ScaleWorkspace } from "./components/ScaleWorkspace";
import { markLessonCompleteAction, markPracticeCompletedAction, saveScaleNoteAction, submitQuizAction } from "./actions";

export default async function ScalePage({ params }: { params: { scaleSlug: string } }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/scales/${params.scaleSlug}`);

  const access = await canAccessScale(session.user.id, params.scaleSlug);
  if (!access) notFound();

  if (!access.canAccess) {
    // No plan: the way forward is a class plan. A paying student whose
    // teacher hasn't released this scale yet just goes back to the roadmap.
    redirect(access.lockedBecause === "not-yet-approved" ? "/dashboard" : "/billing/plans");
  }

  const { scaleGroup } = access;
  const variants = SCALE_CONTENT[scaleGroup.slug] ?? [];
  const [allLessons, user, note] = await Promise.all([
    getLessonsWithProgress(scaleGroup.slug, session.user.id),
    // Picks which instrument view renders by default (see Fretboard.tsx for
    // why a guitar/bass student can't just get the piano diagram).
    prisma.user.findUnique({ where: { id: session.user.id }, select: { primaryInstrument: true } }),
    prisma.scaleNote.findUnique({
      where: { userId_scaleGroupId: { userId: session.user.id, scaleGroupId: scaleGroup.id } },
      select: { body: true },
    }),
  ]);

  // A trial opens only the first few lessons. The rest are reduced to titles
  // here on the server so their file URLs never reach the browser.
  const isTrial = access.reason === "trial";
  const lessons = isTrial ? allLessons.slice(0, TRIAL_LESSON_COUNT) : allLessons;
  const freeTrial = isTrial
    ? {
        endsAt: ((await getCurriculumEntitlement(session.user.id)).until ?? new Date()).toISOString(),
        lockedLessonTitles: allLessons.slice(TRIAL_LESSON_COUNT).map((l) => l.title),
      }
    : null;

  return (
    <ScaleWorkspace
      scaleSlug={scaleGroup.slug}
      scaleGroup={{
        code: scaleGroup.code,
        title: scaleGroup.title,
        kinitName: scaleGroup.kinitName,
        description: scaleGroup.description,
      }}
      lessons={lessons}
      quizQuestions={stripAnswers(generateScaleQuiz(scaleGroup.slug))}
      quizPassed={access.quizPassed}
      quizScore={access.quizScore}
      quizPassThreshold={QUIZ_PASS_THRESHOLD}
      practiceCompleted={access.practiceCompleted}
      freeTrial={freeTrial}
      variant={variants[0] ?? null}
      lessonVariants={LESSON_VARIANTS[scaleGroup.slug] ?? {}}
      instrument={user?.primaryInstrument ?? null}
      initialNote={note?.body ?? ""}
      onMarkLessonComplete={markLessonCompleteAction.bind(null, scaleGroup.slug)}
      onSubmitQuiz={submitQuizAction.bind(null, scaleGroup.slug)}
      onMarkPracticeCompleted={markPracticeCompletedAction.bind(null, scaleGroup.slug)}
      onSaveNote={saveScaleNoteAction.bind(null, scaleGroup.slug)}
    />
  );
}
