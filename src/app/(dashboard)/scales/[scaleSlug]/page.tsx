import { notFound, redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { canAccessScale } from "@/lib/access";
import { SCALE_CONTENT } from "@/lib/scale-content";
import { generateScaleQuiz, stripAnswers } from "@/lib/quiz";
import { ScaleExplorer } from "@/components/scales/ScaleExplorer";
import { QuizLauncher } from "@/components/progression/QuizLauncher";
import { markModuleReadAction, markPracticeCompletedAction, submitQuizAction } from "./actions";

function pillClass(done: boolean) {
  return `rounded-full border px-4 py-2 text-sm font-medium transition ${
    done
      ? "cursor-default border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : "border-white/10 text-slate-300 hover:border-amber-400/40 hover:text-amber-300"
  }`;
}

export default async function ScalePage({ params }: { params: { scaleSlug: string } }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/scales/${params.scaleSlug}`);

  const access = await canAccessScale(session.user.id, params.scaleSlug);
  if (!access) notFound();

  if (!access.canAccess) {
    redirect(access.reason === "requires-payment" ? `/billing/unlock/${params.scaleSlug}` : "/dashboard");
  }

  const { scaleGroup } = access;
  const variants = SCALE_CONTENT[scaleGroup.slug] ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">{scaleGroup.code}</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">{scaleGroup.title}</h1>
      {scaleGroup.kinitName && <p className="mt-1 text-slate-500">{scaleGroup.kinitName}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <form action={markModuleReadAction.bind(null, scaleGroup.slug)}>
          <button type="submit" disabled={access.moduleRead} className={pillClass(access.moduleRead)}>
            {access.moduleRead ? "✓ Module read" : "Mark module as read"}
          </button>
        </form>

        <form action={markPracticeCompletedAction.bind(null, scaleGroup.slug)}>
          <button type="submit" disabled={access.practiceCompleted} className={pillClass(access.practiceCompleted)}>
            {access.practiceCompleted ? "✓ Practice completed" : "Mark practice completed"}
          </button>
        </form>

        {access.quizPassed ? (
          <span className={pillClass(true)}>
            ✓ Quiz passed{access.quizScore != null ? ` (${access.quizScore})` : ""}
          </span>
        ) : (
          <QuizLauncher
            scaleTitle={scaleGroup.title}
            questions={stripAnswers(generateScaleQuiz(scaleGroup.slug))}
            buttonClassName={pillClass(false)}
            onSubmitQuiz={submitQuizAction.bind(null, scaleGroup.slug)}
          />
        )}
      </div>

      <div className="mt-10">
        {variants.length > 0 ? (
          <ScaleExplorer variants={variants} />
        ) : (
          <p className="text-sm text-slate-500">Interactive content for this scale is coming soon.</p>
        )}
      </div>
    </div>
  );
}
