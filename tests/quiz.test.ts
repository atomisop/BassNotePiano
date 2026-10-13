import { describe, expect, it } from "vitest";
import { QUESTIONS_PER_QUIZ, generateScaleQuiz, gradeQuiz } from "@/lib/quiz";
import { SCALE_CONTENT } from "@/lib/scale-content";

describe("exam", () => {
  const slugs = Object.keys(SCALE_CONTENT);

  it("has 20 well formed questions for every scale", () => {
    for (const slug of slugs) {
      for (const seed of [0, 1, 7, 12345]) {
        const qs = generateScaleQuiz(slug, seed);
        expect(qs.length, `${slug} seed ${seed}`).toBe(QUESTIONS_PER_QUIZ);
        expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
        for (const q of qs) {
          expect(q.choices.length).toBe(4);
          expect(new Set(q.choices).size).toBe(4);
          expect(q.choices[q.correctIndex]).toBeTruthy();
        }
      }
    }
  });

  it("is repeatable for the same seed and different for another", () => {
    const a = generateScaleQuiz("major-scale", 3);
    expect(generateScaleQuiz("major-scale", 3)).toEqual(a);
    expect(generateScaleQuiz("major-scale", 4).map((q) => q.id)).not.toEqual(a.map((q) => q.id));
  });

  it("grades a perfect run as 20 of 20 and cannot be inflated", () => {
    const qs = generateScaleQuiz("natural-minor", 9);
    const perfect = qs.map((q) => ({ questionId: q.id, selectedIndex: q.correctIndex }));
    expect(gradeQuiz("natural-minor", 9, perfect)).toMatchObject({ score: 20, total: 20 });
    const spam = qs.flatMap((q) => [0, 1, 2, 3].map((selectedIndex) => ({ questionId: q.id, selectedIndex })));
    expect(gradeQuiz("natural-minor", 9, spam).score).toBeLessThanOrEqual(20);
  });
});
