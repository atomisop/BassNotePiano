"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { PublicQuizQuestion, QuizAnswerSubmission } from "@/lib/quiz";
import type { CourseLessonWithProgress } from "@/lib/courseContent";
import { QuizModal } from "@/components/progression/QuizModal";
import { LessonVideoPlayer } from "./LessonVideoPlayer";
import { LessonPdfPlayer } from "./LessonPdfPlayer";
import { SectionRow, sectionRowVariants } from "./SectionRow";
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
    try {
      await onMarkLessonComplete(lessons[index].id);
      router.refresh();
      setView({ mode: "celebration", index });
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
    try {
      await onMarkPracticeCompleted();
      router.refresh();
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
    return (
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => setView({ mode: "list" })}
          className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-100"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to sections
        </button>

        <div className="glass-surface-elevated p-2 sm:p-4">
          <p className="px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80 sm:px-1">{lesson.title}</p>
          {lesson.type === "VIDEO" ? (
            <LessonVideoPlayer
              src={lesson.fileUrl}
              title={lesson.title}
              subtitle={`${scaleGroup.code} — ${scaleGroup.title}`}
              onEnded={() => handleLessonComplete(view.index)}
            />
          ) : (
            <LessonPdfPlayer src={lesson.fileUrl} title={lesson.title} onOpened={() => handleLessonComplete(view.index)} />
          )}
        </div>

        {!lesson.completed && (
          <button
            type="button"
            onClick={() => handleLessonComplete(view.index)}
            disabled={completing}
            className="mt-4 text-xs text-slate-500 transition hover:text-amber-300 disabled:opacity-50"
          >
            {completing ? "Saving…" : "Mark as complete"}
          </button>
        )}
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
      <div className="glass-surface p-6 sm:p-7">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">{scaleGroup.code}</p>
        <h1 className="mt-1.5 font-serif text-3xl text-slate-50">{scaleGroup.title}</h1>
        {scaleGroup.kinitName && <p className="mt-1 text-slate-500">{scaleGroup.kinitName}</p>}
        {scaleGroup.description && <p className="mt-3 text-sm text-slate-400">{scaleGroup.description}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={startCourse} className="cta-sheen rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300">
            {ctaLabel}
          </button>

          <button
            type="button"
            onClick={handleTogglePractice}
            disabled={practiceCompleted || markingPractice}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              practiceCompleted
                ? "cursor-default border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-white/10 text-slate-300 hover:border-amber-400/40 hover:text-amber-300"
            }`}
          >
            {practiceCompleted ? "✓ Practice completed" : markingPractice ? "Saving…" : "Mark practice completed"}
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex gap-1">
            {lessons.map((l) => (
              <span key={l.id} className={`h-1.5 w-6 rounded-full ${l.completed ? "bg-amber-400" : "bg-slate-800"}`} />
            ))}
            <span className={`h-1.5 w-6 rounded-full ${quizPassed ? "bg-amber-400" : "bg-slate-800"}`} />
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
