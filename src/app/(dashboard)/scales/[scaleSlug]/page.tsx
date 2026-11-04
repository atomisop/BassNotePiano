import { notFound, redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessScale, QUIZ_PASS_THRESHOLD } from "@/lib/access";
import { getLessonsWithProgress } from "@/lib/courseContent";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { getNumberSetting } from "@/lib/siteSettings";
import { LESSON_VARIANTS, SCALE_CONTENT } from "@/lib/scale-content";
import { generateScaleQuiz, stripAnswers } from "@/lib/quiz";
import { ScaleWorkspace } from "./components/ScaleWorkspace";
import { FingerPracticeGate } from "./components/FingerPracticeGate";
import { ReplaceOnMount } from "./components/ReplaceOnMount";
import { LockedScale } from "./components/LockedScale";
import { describeLockedScale } from "@/lib/lockedScale";
import { getNextApproval } from "@/lib/scaleApproval";
import { DAILY_GOAL_SECONDS, getFingerPracticeStatus, hasCompletedFingerPracticeToday } from "@/lib/fingerPractice";
import { markLessonCompleteAction, markPracticeCompletedAction, saveScaleNoteAction, submitQuizAction } from "./actions";

export const metadata = { title: "Scale" };

export default async function ScalePage(props: { params: Promise<{ scaleSlug: string }> }) {
  const params = await props.params;
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/scales/${params.scaleSlug}`);

  const access = await canAccessScale(session.user.id, params.scaleSlug);
  if (!access) notFound();

  if (!access.canAccess) {
    // No plan at all: the only useful place is the plans page, so go straight there (the card below shows for an instant, and is the fallback).
    const noPlan = (access.lockedBecause ?? "no-plan") === "no-plan";
    // Say why it is locked and what to do, instead of bouncing the student somewhere without a word.
    const next = await getNextApproval(session.user.id);
    const previousSlug = next.state === "NEEDS_CHECKLIST" ? next.previousSlug : null;
    const previous = previousSlug ? await prisma.scaleGroup.findUnique({ where: { slug: previousSlug }, select: { code: true, title: true } }) : null;
    const message = describeLockedScale({
      lockedBecause: access.lockedBecause ?? "no-plan",
      next,
      slug: params.scaleSlug,
      previousTitle: previous ? `${previous.code}: ${previous.title}` : null,
    });
    return (
      <>
        {noPlan && <ReplaceOnMount href="/billing/plans" />}
        <LockedScale scaleLabel={`${access.scaleGroup.code}: ${access.scaleGroup.title}`} scaleSlug={params.scaleSlug} message={message} />
      </>
    );
  }

  // Lessons open only after today's 10 minutes of finger exercises. Admins are exempt.
  if (session.user.role !== "ADMIN" && !(await hasCompletedFingerPracticeToday(session.user.id))) {
    const status = await getFingerPracticeStatus(session.user.id);
    return <FingerPracticeGate todaySeconds={status.todaySeconds} goalSeconds={DAILY_GOAL_SECONDS} streak={status.streak} returnTo={`/scales/${params.scaleSlug}`} />;
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
  const TRIAL_LESSON_COUNT = await getNumberSetting("trial.lessonCount");
  // Files are never linked by their storage address: the app serves each one after checking access.
  const visibleLessons = isTrial ? allLessons.slice(0, TRIAL_LESSON_COUNT) : allLessons;
  const lessons = visibleLessons.map((lesson) => ({ ...lesson, fileUrl: `/api/lessons/${lesson.id}/file` }));
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
