"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuizModal } from "@/components/progression/QuizModal";
import type { PublicQuizQuestion, QuizAnswerSubmission } from "@/lib/quiz";

export interface QuizLauncherProps {
  scaleTitle: string;
  questions: PublicQuizQuestion[];
  buttonClassName: string;
  onSubmitQuiz: (answers: QuizAnswerSubmission[]) => Promise<{ passed: boolean; score: number; total: number }>;
}

export function QuizLauncher({ scaleTitle, questions, buttonClassName, onSubmitQuiz }: QuizLauncherProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  async function handleSubmit(answers: QuizAnswerSubmission[]) {
    const outcome = await onSubmitQuiz(answers);
    if (outcome.passed) router.refresh();
    return outcome;
  }

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        Take the quiz →
      </button>
      <QuizModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        scaleTitle={scaleTitle}
        questions={questions}
        onSubmit={handleSubmit}
      />
    </>
  );
}
