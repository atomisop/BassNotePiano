import { notFound, redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { canAccessScale, QUIZ_PASS_THRESHOLD } from "@/lib/access";
import { ctaLabel } from "@/lib/ctaLabel";
import { getLessonsWithProgress } from "@/lib/courseContent";
import { SCALE_CONTENT } from "@/lib/scale-content";
import { generateScaleQuiz, stripAnswers } from "@/lib/quiz";
import { ScaleExplorer } from "@/components/scales/ScaleExplorer";
import { CoursePlayer } from "./components/CoursePlayer";
import { markLessonCompleteAction, markPracticeCompletedAction, submitQuizAction } from "./actions";

export default async function ScalePage({ params }: { params: { scaleSlug: string } }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/scales/${params.scaleSlug}`);

  const access = await canAccessScale(session.user.id, params.scaleSlug);
  if (!access) notFound();

  if (!access.canAccess) {
    redirect("/billing/curriculum");
  }

  const { scaleGroup } = access;
  const variants = SCALE_CONTENT[scaleGroup.slug] ?? [];
  const lessons = await getLessonsWithProgress(scaleGroup.slug, session.user.id);

  return (
    <div className="space-y-10">
      <CoursePlayer
        scaleGroup={{
          code: scaleGroup.code,
          title: scaleGroup.title,
          kinitName: scaleGroup.kinitName,
          description: scaleGroup.description,
        }}
        ctaLabel={ctaLabel(access)}
        lessons={lessons}
        quizQuestions={stripAnswers(generateScaleQuiz(scaleGroup.slug))}
        quizPassed={access.quizPassed}
        quizScore={access.quizScore}
        quizPassThreshold={QUIZ_PASS_THRESHOLD}
        practiceCompleted={access.practiceCompleted}
        onMarkLessonComplete={markLessonCompleteAction.bind(null, scaleGroup.slug)}
        onSubmitQuiz={submitQuizAction.bind(null, scaleGroup.slug)}
        onMarkPracticeCompleted={markPracticeCompletedAction.bind(null, scaleGroup.slug)}
      />

      <div className="mx-auto max-w-5xl">
        {variants.length > 0 ? (
          <ScaleExplorer variants={variants} />
        ) : (
          <p className="text-sm text-slate-500">Interactive content for this scale is coming soon.</p>
        )}
      </div>
    </div>
  );
}
