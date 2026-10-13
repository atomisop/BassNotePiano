"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { generateScaleQuiz, stripAnswers, type PublicQuizQuestion, type QuizAnswerSubmission } from "@/lib/quiz";
import { CountUpNumber } from "@/components/ui/CountUpNumber";
import { SuccessGlowPulse } from "@/components/ui/SuccessGlowPulse";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { SPRING } from "@/lib/motionTokens";
import { buttonVariants } from "@/components/ui/button";

export interface QuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  scaleTitle: string;
  scaleSlug: string;
  onSubmit: (seed: number, answers: QuizAnswerSubmission[]) => Promise<{ passed: boolean; score: number; total: number }>;
  /**
   * 0-1 fraction, e.g. 0.8 for "80% required", threaded in as a prop
   * rather than imported from src/lib/access.ts (QUIZ_PASS_THRESHOLD lives
   * there), since that module pulls in Prisma/server-only code that can't
   * cross into this client component's bundle. Defaults to the app-wide
   * 0.8 threshold so existing callers that don't pass it keep working.
   */
  passThreshold?: number;
}

/** A fresh random seed, generated client-side. See quiz.ts's own header
    comment for why this doesn't need to be server-issued: there's no
    secret being protected, just variety. */
function rollSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

function rollQuiz(scaleSlug: string): { seed: number; questions: PublicQuizQuestion[] } {
  const seed = rollSeed();
  return { seed, questions: stripAnswers(generateScaleQuiz(scaleSlug, seed)) };
}

type Step = "question" | "submitting" | "result";

// Full screen, by direct instruction, not a centered popup with a backdrop
// scrim behind it. A slide-up rather than a fade/scale-in, same reasoning
// SlideOverPanel's own full-width phone layout uses: this covers the whole
// viewport, so it enters like a screen, not an object floating in front of
// one.
const panelVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: SPRING.snappy },
  exit: { opacity: 0, y: 16, transition: { duration: 0.15, ease: "easeIn" } },
};

const stepVariants = {
  enter: { opacity: 0, x: 16 },
  center: { opacity: 1, x: 0, transition: SPRING.smooth },
  exit: { opacity: 0, x: -16, transition: { duration: 0.15 } },
};

export function QuizModal({ isOpen, onClose, scaleTitle, scaleSlug, onSubmit, passThreshold = 0.8 }: QuizModalProps) {
  const [step, setStep] = useState<Step>("question");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ passed: boolean; score: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rendered via a portal onto document.body (below) rather than in place,
  // the dashboard's page-enter animation puts a `transform` on an ancestor,
  // which turns `position: fixed` into "fixed to that ancestor" instead of
  // the viewport, the same containing-block gotcha this app's own
  // page-enter CSS comment documents for the marketing header. Without the
  // portal the app header bleeds through above a "fullscreen" quiz.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Lazy initializer: only actually matters for the very first render, since
  // this component stays mounted across isOpen toggles (see the effect
  // below); real re-rolls on every subsequent open happen there instead.
  const [{ seed, questions }, setQuiz] = useState(() => rollQuiz(scaleSlug));

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

  // A full-screen panel must not leave the page scrollable behind it, same
  // reasoning (and same pattern) MarketingNav's own full-screen mobile menu
  // uses. Also where a genuine (re)start rolls a new seed and regenerates
  // the question set, so opening the quiz again after closing it (not just
  // an explicit Retake after failing) is itself a fresh run, not a resumed
  // one. This component never unmounts between opens, so without this
  // effect the lazy useState initializer above would only ever fire once,
  // on the very first open.
  useEffect(() => {
    if (!isOpen) return;
    setQuiz(rollQuiz(scaleSlug));
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen, scaleSlug]);

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
      const outcome = await onSubmit(seed, answers);
      setResult(outcome);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong grading the quiz.");
      setStep("question");
    }
  }

  function handleRetake() {
    setQuiz(rollQuiz(scaleSlug));
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
          // h-[100svh], not inset-0's own implicit bottom:0 sizing: verified
          // in Chromium's mobile emulation that inset-0 alone renders this
          // genuinely full screen there, but reported live as "not full
          // screen at least on mobile" on a real phone, and this exact app
          // shell already hit the same class of bug once before (see
          // (dashboard)/layout.tsx's own h-[100svh] comment): a
          // position:fixed element sized off the *large* viewport (the one
          // Safari reports as if its own toolbar were always hidden) gets
          // clipped or leaves a gap once the toolbar is actually showing,
          // which inset-0's bottom:0 constraint is exactly the shape of that
          // bug. h-[100svh] pins this to the smallest the viewport is ever
          // going to be instead, the same fix already proven here.
          className="fixed inset-x-0 top-0 z-50 flex h-[100svh] w-full flex-col overflow-hidden bg-slate-950"
        >
          {step === "result" && result?.passed && <SuccessGlowPulse />}
          <div className="h-1 w-full shrink-0 bg-gradient-to-r from-[rgb(var(--c-s-300)/0.4)] via-[rgb(var(--c-s-50))] to-[rgb(var(--c-s-300)/0.4)]" />

          {/* Same Back-button header shape as SlideOverPanel's own, one
              consistent "this is a full screen, here's how you leave it"
              pattern across the app, instead of the small corner X a
              floating popup used. */}
          <div className="flex shrink-0 items-center gap-4 border-b border-ink/10 px-6 py-5">
            <button
              type="button"
              onClick={handleClose}
              disabled={step === "submitting"}
              aria-label="Back"
              className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition disabled:cursor-not-allowed disabled:opacity-40 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div>
              <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">
                Scale-Spelling Quiz
              </p>
              <h2 id="quiz-modal-title" className="mt-1 text-body text-slate-50 font-semibold">
                {scaleTitle}
              </h2>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto overscroll-contain px-6 py-6">
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
                                : "bg-neu-base shadow-pressed-low"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-small text-slate-500">
                      Question {currentIndex + 1} of {questions.length}
                    </p>
                    <p className="mt-2 text-body text-slate-100">{current.prompt}</p>

                    <div className="mt-4 space-y-2">
                      {current.choices.map((choice, i) => {
                        const selected = selections[current.id] === i;
                        return (
                          <button
                            key={choice}
                            type="button"
                            onClick={() => selectChoice(i)}
                            className={`w-full rounded-xl border px-4 py-2.5 text-left text-small font-medium transition ${
                              selected
                                ? "border-[rgb(var(--c-s-50))] bg-[rgb(var(--c-s-50)/0.1)] text-[rgb(var(--c-s-50))]"
                                : "border-transparent text-slate-300 bg-neu-base shadow-raised-low"
                            }`}
                          >
                            {choice}
                          </button>
                        );
                      })}
                    </div>

                    {error && <p className="mt-3 text-small text-red-400">{error}</p>}

                    <div className="mt-6 flex gap-2">
                      {currentIndex > 0 && (
                        <button
                          type="button"
                          onClick={() => setCurrentIndex((i) => i - 1)}
                          disabled={step === "submitting"}
                          className="flex-1 rounded-xl py-2.5 text-small font-medium text-slate-300 transition disabled:opacity-40 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                        >
                          {/* "Previous", not "Back": the header above now has
                              its own Back button that exits the quiz
                              entirely, this one only steps back a question,
                              same screen either way was ambiguous. */}
                          Previous
                        </button>
                      )}
                      {isLastQuestion ? (
                        <button
                          type="button"
                          onClick={handleSubmit}
                          disabled={!hasSelected || step === "submitting"}
                          className={buttonVariants({ variant: "primary", size: "sm", className: "flex flex-1" })}
                        >
                          {step === "submitting" && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                          {step === "submitting" ? "Grading…" : "Submit quiz"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCurrentIndex((i) => i + 1)}
                          disabled={!hasSelected}
                          className={buttonVariants({ variant: "primary", className: "flex-1" })}
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
                      transition={{ ...SPRING.lively, delay: 0.05 }}
                      className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
                        result.passed ? "bg-slate-50/10" : "bg-neu-base shadow-pressed-low"
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
                          className="text-slate-50"
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
                    <h3 className="text-body text-slate-50">
                      {result.passed ? "Quiz passed" : "Not quite yet"}
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-xs text-small text-slate-400">
                      <CountUpNumber value={result.score} /> of {result.total} correct
                    </p>
                    <div
                      className={`mx-auto mt-3 w-fit rounded-full px-3 py-1 text-small font-medium ${
                        result.passed ? "bg-slate-50/10 text-slate-100" : "bg-neu-base shadow-pressed-low text-slate-400"
                      }`}
                    >
                      Your score: {result.score}/{result.total} · {Math.round(passThreshold * 100)}% required
                    </div>
                    <div className="mt-6 flex gap-2">
                      {!result.passed && (
                        <button
                          type="button"
                          onClick={handleRetake}
                          className={buttonVariants({ variant: "primary", size: "sm", className: "flex-1" })}
                        >
                          Retake quiz
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleClose}
                        className="flex-1 rounded-xl py-2.5 text-small font-medium text-slate-300 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
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
