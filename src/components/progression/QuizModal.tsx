"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { PublicQuizQuestion, QuizAnswerSubmission } from "@/lib/quiz";
import { CountUpNumber } from "@/components/ui/CountUpNumber";
import { SuccessGlowPulse } from "@/components/ui/SuccessGlowPulse";
import { MorphingSquare } from "@/components/ui/morphing-square";

export interface QuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  scaleTitle: string;
  questions: PublicQuizQuestion[];
  onSubmit: (answers: QuizAnswerSubmission[]) => Promise<{ passed: boolean; score: number; total: number }>;
  /**
   * 0-1 fraction, e.g. 0.8 for "80% required" — threaded in as a prop
   * rather than imported from src/lib/access.ts (QUIZ_PASS_THRESHOLD lives
   * there), since that module pulls in Prisma/server-only code that can't
   * cross into this client component's bundle. Defaults to the app-wide
   * 0.8 threshold so existing callers that don't pass it keep working.
   */
  passThreshold?: number;
}

type Step = "question" | "submitting" | "result";

const panelVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: "easeIn" } },
};

const stepVariants = {
  enter: { opacity: 0, x: 16 },
  center: { opacity: 1, x: 0, transition: { type: "spring", bounce: 0, duration: 0.36 } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.15 } },
};

export function QuizModal({ isOpen, onClose, scaleTitle, questions, onSubmit, passThreshold = 0.8 }: QuizModalProps) {
  const [step, setStep] = useState<Step>("question");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ passed: boolean; score: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rendered via a portal onto document.body (below) rather than in place —
  // the dashboard's page-enter animation puts a `transform` on an ancestor,
  // which turns `position: fixed` into "fixed to that ancestor" instead of
  // the viewport, the same containing-block gotcha this app's own
  // page-enter CSS comment documents for the marketing header. Without the
  // portal the app header bleeds through above a "fullscreen" quiz.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const hasSelected = current ? selections[current.id] !== undefined : false;

  function reset() {
    setStep("question");
    setCurrentIndex(0);
    setSelections({});
    setResult(null);
    setError(null);
  }

  function handleClose() {
    if (step === "submitting") return;
    onClose();
    window.setTimeout(reset, 200);
  }

  function selectChoice(choiceIndex: number) {
    if (!current) return;
    setSelections((prev) => ({ ...prev, [current.id]: choiceIndex }));
  }

  async function handleSubmit() {
    setError(null);
    setStep("submitting");
    try {
      const answers: QuizAnswerSubmission[] = questions.map((q) => ({
        questionId: q.id,
        selectedIndex: selections[q.id],
      }));
      const outcome = await onSubmit(answers);
      setResult(outcome);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong grading the quiz.");
      setStep("question");
    }
  }

  function handleRetake() {
    setCurrentIndex(0);
    setSelections({});
    setResult(null);
    setError(null);
    setStep("question");
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quiz-modal-title"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-50 overflow-y-auto bg-[rgb(var(--c-surface-solid))]"
        >
          {step === "result" && result?.passed && <SuccessGlowPulse />}
          <div className="h-1 w-full bg-gradient-to-r from-[rgb(var(--c-s-300)/0.4)] via-[rgb(var(--c-s-50))] to-[rgb(var(--c-s-300)/0.4)]" />

          <div className="mx-auto w-full max-w-xl px-6 pb-16 pt-8 sm:pt-12">
            <div className="mb-8 flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">
                  Scale-Spelling Quiz
                </p>
                <h2 id="quiz-modal-title" className="mt-1 font-serif text-2xl text-slate-50">
                  {scaleTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={step === "submitting"}
                aria-label="Close"
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

              <AnimatePresence mode="wait">
                {(step === "question" || step === "submitting") && current && (
                  <motion.div key={current.id} variants={stepVariants} initial="enter" animate="center" exit="exit">
                    <div className="mb-4 flex items-center gap-1.5">
                      {questions.map((q, i) => (
                        <span
                          key={q.id}
                          className={`h-1 flex-1 rounded-full ${
                            i < currentIndex || (i === currentIndex && selections[q.id] !== undefined)
                              ? "bg-[rgb(var(--c-s-50))]"
                              : i === currentIndex
                                ? "bg-[rgb(var(--c-s-50)/0.4)]"
                                : "bg-slate-800"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">
                      Question {currentIndex + 1} of {questions.length}
                    </p>
                    <p className="mt-2 text-base text-slate-100">{current.prompt}</p>

                    <div className="mt-4 space-y-2">
                      {current.choices.map((choice, i) => {
                        const selected = selections[current.id] === i;
                        return (
                          <button
                            key={choice}
                            type="button"
                            onClick={() => selectChoice(i)}
                            className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm font-medium transition ${
                              selected
                                ? "border-[rgb(var(--c-s-50))] bg-[rgb(var(--c-s-50)/0.1)] text-[rgb(var(--c-s-50))]"
                                : "border-ink/10 text-slate-300 hover:border-ink/15 hover:bg-slate-800/60"
                            }`}
                          >
                            {choice}
                          </button>
                        );
                      })}
                    </div>

                    {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

                    <div className="mt-6 flex gap-2">
                      {currentIndex > 0 && (
                        <button
                          type="button"
                          onClick={() => setCurrentIndex((i) => i - 1)}
                          disabled={step === "submitting"}
                          className="flex-1 rounded-xl border border-ink/10 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                        >
                          Back
                        </button>
                      )}
                      {isLastQuestion ? (
                        <button
                          type="button"
                          onClick={handleSubmit}
                          disabled={!hasSelected || step === "submitting"}
                          className="cta-sheen cta-fill flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {step === "submitting" && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                          {step === "submitting" ? "Grading…" : "Submit quiz"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCurrentIndex((i) => i + 1)}
                          disabled={!hasSelected}
                          className="cta-sheen cta-fill flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Next
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}

                {step === "result" && result && (
                  <motion.div key="result" variants={stepVariants} initial="enter" animate="center" exit="exit" className="py-2 text-center">
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", bounce: 0.35, duration: 0.5, delay: 0.05 }}
                      className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
                        result.passed ? "bg-emerald-400/10" : "bg-slate-800"
                      }`}
                    >
                      {result.passed ? (
                        <motion.svg
                          width="26"
                          height="26"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-emerald-400"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.5, delay: 0.2 }}
                        >
                          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </motion.svg>
                      ) : (
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
                          <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                      )}
                    </motion.div>
                    <h3 className="font-serif text-base text-slate-50">
                      {result.passed ? "Quiz passed" : "Not quite yet"}
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate-400">
                      <CountUpNumber value={result.score} /> of {result.total} correct
                      {result.passed ? " — this scale is complete once your other checklist items are done." : ". Review the formula and try again."}
                    </p>
                    <div
                      className={`mx-auto mt-3 w-fit rounded-full px-3 py-1 text-xs font-medium ${
                        result.passed ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      Your score: {result.score}/{result.total} · {Math.round(passThreshold * 100)}% required
                    </div>
                    <div className="mt-6 flex gap-2">
                      {!result.passed && (
                        <button
                          type="button"
                          onClick={handleRetake}
                          className="cta-sheen cta-fill flex-1 rounded-xl py-2.5 text-sm font-semibold"
                        >
                          Retake quiz
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleClose}
                        className="flex-1 rounded-xl border border-ink/10 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
                      >
                        Done
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
