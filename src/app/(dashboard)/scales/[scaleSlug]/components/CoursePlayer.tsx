"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { PublicQuizQuestion, QuizAnswerSubmission } from "@/lib/quiz";
import type { CourseLessonWithProgress } from "@/lib/courseContent";
import { QuizModal } from "@/components/progression/QuizModal";
import { CheckIcon, ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/Toaster";
import { LessonVideoPlayer } from "./LessonVideoPlayer";
import { LessonPdfPlayer } from "./LessonPdfPlayer";
import { SectionRow } from "./SectionRow";
import { SectionCompleteCelebration } from "./SectionCompleteCelebration";

const listContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

interface ScaleGroupInfo {
  code: string;
  title: string;
  kinitName: string | null;
  description: string | null;
}

type View = { mode: "list" } | { mode: "lesson"; index: number } | { mode: "celebration"; index: number };

export interface CoursePlayerProps {
  scaleGroup: ScaleGroupInfo;
  ctaLabel: string;
  lessons: CourseLessonWithProgress[];
  quizQuestions: PublicQuizQuestion[];
  quizPassed: boolean;
  quizScore: number | null;
  quizPassThreshold: number;
  practiceCompleted: boolean;
  onMarkLessonComplete: (lessonId: string) => Promise<void>;
  onSubmitQuiz: (answers: QuizAnswerSubmission[]) => Promise<{ passed: boolean; score: number; total: number }>;
  onMarkPracticeCompleted: () => Promise<void>;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "";
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} min`;
}

export function CoursePlayer({
  scaleGroup,
  ctaLabel,
  lessons,
  quizQuestions,
  quizPassed,
  quizScore,
  quizPassThreshold,
  practiceCompleted,
  onMarkLessonComplete,
  onSubmitQuiz,
  onMarkPracticeCompleted,
}: CoursePlayerProps) {
  const router = useRouter();
  const [view, setView] = useState<View>({ mode: "list" });
  const [quizOpen, setQuizOpen] = useState(false);
  const [markingPractice, setMarkingPractice] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Server actions here write real progress. A failed write used to reset the
  // spinner and otherwise say nothing, so the student saw the button settle
  // back and assumed it had saved — the worst outcome for a mutation whose
  // whole purpose is recording that they finished something.
  const [actionError, setActionError] = useState<string | null>(null);

  const hasLessons = lessons.length > 0;
  const allLessonsComplete = hasLessons && lessons.every((l) => l.completed);
  const completedCount = lessons.filter((l) => l.completed).length;
  const assessmentUnlocked = !hasLessons || allLessonsComplete;

  function isLessonUnlocked(index: number): boolean {
    if (index === 0) return true;
    return lessons[index - 1].completed;
  }

  async function handleLessonComplete(index: number) {
    if (completing) return;
    setCompleting(true);
    setActionError(null);
    try {
      await onMarkLessonComplete(lessons[index].id);
      router.refresh();
      setView({ mode: "celebration", index });
    } catch {
      // Deliberately not advancing to the celebration view — congratulating
      // someone for finishing a lesson the server didn't record would be a lie
      // the next page load then contradicts.
      setActionError("That didn't save. Check your connection and try again.");
      // Toast as well as the inline message: the inline copy anchors the error
      // to the control that failed, the toast makes sure it's noticed even if
      // the student has already scrolled past it.
      toast.error("Couldn't save your progress", {
        description: "That lesson wasn't marked complete. Check your connection and try again.",
        action: { label: "Retry", onClick: () => handleLessonComplete(index) },
      });
    } finally {
      setCompleting(false);
    }
  }

  async function handleQuizSubmit(answers: QuizAnswerSubmission[]) {
    const outcome = await onSubmitQuiz(answers);
    if (outcome.passed) router.refresh();
    return outcome;
  }

  async function handleTogglePractice() {
    setMarkingPractice(true);
    setActionError(null);
    try {
      await onMarkPracticeCompleted();
      router.refresh();
      toast.success("Practice logged", {
        description: `${scaleGroup.code} — ${scaleGroup.title}`,
      });
    } catch {
      setActionError("Couldn't record that practice. Try again in a moment.");
      toast.error("Couldn't log that practice", {
        description: "Nothing was saved. Try again in a moment.",
      });
    } finally {
      setMarkingPractice(false);
    }
  }

  function startCourse() {
    if (hasLessons) {
      const nextIndex = lessons.findIndex((l) => !l.completed);
      setView({ mode: "lesson", index: nextIndex === -1 ? 0 : nextIndex });
    } else if (assessmentUnlocked) {
      setQuizOpen(true);
    }
  }

  // ============ Lesson view ============
  if (view.mode === "lesson") {
    const lesson = lessons[view.index];
    const previousIndex = view.index - 1;
    const nextIndex = view.index + 1;
    // Next is reachable only if this lesson is already done — the same
    // sequential rule the list view enforces (isLessonUnlocked). Completing
    // via the button below routes through the celebration view instead, so
    // this is specifically for moving around lessons already finished.
    const canGoNext = nextIndex < lessons.length && lesson.completed;
    const canGoPrevious = previousIndex >= 0;

    return (
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => setView({ mode: "list" })}
          className="mb-4 flex cursor-pointer items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-100"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to sections
        </button>

        {/* Position first, title second. "Lesson 3 of 7" is the thing that
            tells someone how much is left — without it every lesson feels
            like an unbounded list. */}
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">
              Lesson {view.index + 1} of {lessons.length}
            </p>
            <h1 className="mt-1 font-serif text-xl text-slate-50">{lesson.title}</h1>
          </div>
          {lesson.completed && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              <CheckIcon size={12} />
              Completed
            </span>
          )}
        </div>

        <div className="glass-surface-elevated p-2 sm:p-4">
          {lesson.type === "VIDEO" ? (
            <LessonVideoPlayer
              src={lesson.fileUrl}
              title={lesson.title}
              subtitle={`${scaleGroup.code} — ${scaleGroup.title}`}
              onEnded={() => handleLessonComplete(view.index)}
            />
          ) : (
            <LessonPdfPlayer
              src={lesson.fileUrl}
              title={lesson.title}
              onOpened={() => handleLessonComplete(view.index)}
            />
          )}
        </div>

        {actionError && (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {actionError}
          </p>
        )}

        {/* The completion action is the point of this screen, so it reads as a
            control rather than the 11px grey text link it used to be. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => canGoPrevious && setView({ mode: "lesson", index: previousIndex })}
              disabled={!canGoPrevious}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-sm text-slate-300 transition hover:border-[rgb(var(--c-a-400)/0.4)] hover:text-[rgb(var(--c-a-300))] disabled:cursor-default disabled:opacity-40 disabled:hover:border-ink/10 disabled:hover:text-slate-300"
            >
              <ArrowLeftIcon />
              Previous
            </button>
            <button
              type="button"
              onClick={() => canGoNext && setView({ mode: "lesson", index: nextIndex })}
              disabled={!canGoNext}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-sm text-slate-300 transition hover:border-[rgb(var(--c-a-400)/0.4)] hover:text-[rgb(var(--c-a-300))] disabled:cursor-default disabled:opacity-40 disabled:hover:border-ink/10 disabled:hover:text-slate-300"
            >
              Next
              <ArrowRightIcon />
            </button>
          </div>

          {!lesson.completed && (
            <button
              type="button"
              onClick={() => handleLessonComplete(view.index)}
              disabled={completing}
              className="cta-sheen cta-fill inline-flex cursor-pointer items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {completing ? "Saving…" : "Mark as complete"}
              {!completing && <CheckIcon size={15} />}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ============ Celebration view ============
  if (view.mode === "celebration") {
    const nextIndex = view.index + 1;
    const hasNextLesson = nextIndex < lessons.length;
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <SectionCompleteCelebration
          hasNextSection={hasNextLesson}
          onNextSection={() => setView({ mode: "lesson", index: nextIndex })}
          onCourseDetails={() => setView({ mode: "list" })}
        />
      </div>
    );
  }

  // ============ List view (default) ============
  return (
    <div className="mx-auto max-w-3xl">
      {/* The lesson view below has its own "Back to sections" link, but
          that only ever returns here: this top-level list had no way back
          to the roadmap it was opened from at all. */}
      <Link href="/dashboard" className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-100">
        <ArrowLeftIcon size={16} />
        Back to roadmap
      </Link>
      <div className="glass-surface p-6 sm:p-7">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">{scaleGroup.code}</p>
        <h1 className="mt-1.5 font-serif text-3xl text-slate-50">{scaleGroup.title}</h1>
        {scaleGroup.kinitName && <p className="mt-1 text-slate-500">{scaleGroup.kinitName}</p>}
        {scaleGroup.description && <p className="mt-3 text-sm text-slate-400">{scaleGroup.description}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={startCourse} className="cta-sheen cta-fill rounded-xl px-5 py-2.5 text-sm font-semibold">
            {ctaLabel}
          </button>

          <button
            type="button"
            onClick={handleTogglePractice}
            disabled={practiceCompleted || markingPractice}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
              practiceCompleted
                ? "cursor-default border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "cursor-pointer border-ink/10 text-slate-300 hover:border-[rgb(var(--c-a-400)/0.4)] hover:text-[rgb(var(--c-a-300))]"
            }`}
          >
            {practiceCompleted && <CheckIcon size={13} />}
            {practiceCompleted
              ? "Practice completed"
              : markingPractice
                ? "Saving…"
                : "Mark practice completed"}
          </button>
        </div>

        {actionError && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {actionError}
          </p>
        )}

        {/* `flex-wrap` matters: a scale with a dozen lessons pushed a fixed-
            width pip per lesson past 375px and forced the card to scroll
            sideways. The count beside it is the accessible reading — the pips
            are decorative and hidden from assistive tech. */}
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div
            className="flex flex-wrap gap-1"
            role="progressbar"
            aria-valuenow={completedCount + (quizPassed ? 1 : 0)}
            aria-valuemin={0}
            aria-valuemax={lessons.length + 1}
            aria-label="Sections completed in this scale"
          >
            {lessons.map((l) => (
              <span
                key={l.id}
                aria-hidden
                className={`h-1.5 w-6 rounded-full ${l.completed ? "bg-[rgb(var(--c-a-400))]" : "bg-slate-800"}`}
              />
            ))}
            <span
              aria-hidden
              className={`h-1.5 w-6 rounded-full ${quizPassed ? "bg-[rgb(var(--c-a-400))]" : "bg-slate-800"}`}
            />
          </div>
          <p className="text-xs text-slate-500">
            {completedCount + (quizPassed ? 1 : 0)} / {lessons.length + 1} complete
          </p>
        </div>
      </div>

      <motion.div variants={listContainerVariants} initial="hidden" animate="visible" className="mt-6 space-y-2.5">
        {hasLessons ? (
          lessons.map((lesson, index) => {
            const unlocked = isLessonUnlocked(index);
            return (
              <SectionRow
                key={lesson.id}
                icon={lesson.type}
                title={lesson.title}
                duration={formatDuration(lesson.durationSeconds)}
                required
                status={lesson.completed ? "completed" : unlocked ? "ready" : "locked"}
                lockedReason={!unlocked ? `Complete "${lessons[index - 1].title}" to unlock.` : undefined}
                onClick={unlocked ? () => setView({ mode: "lesson", index }) : undefined}
              />
            );
          })
        ) : (
          <SectionRow icon="VIDEO" title="Lesson coming soon" required={false} status="coming-soon" />
        )}

        <SectionRow
          key="final-assessment"
          icon="QUIZ"
          title="Final Assessment"
          required
          status={quizPassed ? "completed" : assessmentUnlocked ? "ready" : "locked"}
          lockedReason={!assessmentUnlocked ? "Finish every lesson above to unlock." : undefined}
          scoreLabel={quizPassed && quizScore != null ? `${quizScore}/${quizQuestions.length}` : undefined}
          onClick={assessmentUnlocked ? () => setQuizOpen(true) : undefined}
        />
      </motion.div>

      <QuizModal
        isOpen={quizOpen}
        onClose={() => setQuizOpen(false)}
        scaleTitle={scaleGroup.title}
        questions={quizQuestions}
        onSubmit={handleQuizSubmit}
        passThreshold={quizPassThreshold}
      />
    </div>
  );
}
