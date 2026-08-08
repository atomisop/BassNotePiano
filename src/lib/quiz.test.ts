import { describe, expect, it } from "vitest";
import { generateScaleQuiz, gradeQuiz, stripAnswers } from "./quiz";
import { SCALE_CONTENT } from "./scale-content";

describe("generateScaleQuiz", () => {
  it("is fully deterministic across repeated calls", () => {
    for (const slug of Object.keys(SCALE_CONTENT)) {
      expect(generateScaleQuiz(slug)).toEqual(generateScaleQuiz(slug));
    }
  });

  it("returns an empty list for an unknown scale slug", () => {
    expect(generateScaleQuiz("not-a-real-scale")).toEqual([]);
  });

  it("caps every quiz at 6 questions and never returns zero for a real scale", () => {
    for (const slug of Object.keys(SCALE_CONTENT)) {
      const quiz = generateScaleQuiz(slug);
      expect(quiz.length).toBeGreaterThan(0);
      expect(quiz.length).toBeLessThanOrEqual(6);
    }
  });

  it("round-robins across variants so a multi-variant scale isn't dominated by one variant's questions", () => {
    // scale-3 (Bati) has 3 variants — round 0 should be one formula question
    // per variant, in variant order, before any degree question appears.
    const quiz = generateScaleQuiz("scale-3");
    expect(quiz.slice(0, 3).map((q) => q.id)).toEqual([
      "formula-bati-major",
      "formula-bati-minor",
      "formula-bati-lydian",
    ]);
  });

  it("gives every question a unique id within a quiz", () => {
    for (const slug of Object.keys(SCALE_CONTENT)) {
      const ids = generateScaleQuiz(slug).map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("gives every question choices that are unique and include the correct answer exactly once", () => {
    for (const slug of Object.keys(SCALE_CONTENT)) {
      for (const q of generateScaleQuiz(slug)) {
        expect(new Set(q.choices).size).toBe(q.choices.length);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(q.choices.length);
      }
    }
  });

  it("matches the known, pinned question set for scale-3 (regression pin)", () => {
    const quiz = generateScaleQuiz("scale-3");
    expect(quiz).toEqual([
      {
        id: "formula-bati-major",
        prompt: "What is the scale-degree formula for Bati Major?",
        choices: ["1 – 2 – 3 – 4 – 5 – 6 – 7", "1 – 2 – 4 – 5 – b6", "1 – 2 – 4 – 5 – 6", "1 – 3 – 4 – 5 – 7"],
        correctIndex: 3,
      },
      {
        id: "formula-bati-minor",
        prompt: "What is the scale-degree formula for Bati Minor?",
        choices: ["1 – b3 – 4 – 5 – b7", "1 – 3 – #4 – 5 – 7", "1 – 3 – 4 – 5 – 7", "1 – 2 – 3 – 5 – 6"],
        correctIndex: 0,
      },
      {
        id: "formula-bati-lydian",
        prompt: "What is the scale-degree formula for Bati Lydian?",
        choices: ["1 – b2 – 4 – b5 – 6", "1 – 3 – #4 – 5 – 7", "1 – 2 – 4 – 5 – 6", "1 – b2 – 4 – 5 – 6"],
        correctIndex: 1,
      },
      {
        id: "degree-bati-major-3-G",
        prompt: "In the key of G, what is the 3 of Bati Major?",
        choices: ["G", "F#", "B", "C"],
        correctIndex: 2,
      },
      {
        id: "degree-bati-minor-b3-F#",
        prompt: "In the key of F#, what is the b3 of Bati Minor?",
        choices: ["F#", "E", "C#", "A"],
        correctIndex: 3,
      },
      {
        id: "degree-bati-lydian-3-G",
        prompt: "In the key of G, what is the 3 of Bati Lydian?",
        choices: ["B", "F#", "D", "C#"],
        correctIndex: 0,
      },
    ]);
  });
});

describe("stripAnswers", () => {
  it("never leaks correctIndex to the client payload", () => {
    const quiz = generateScaleQuiz("scale-2");
    const stripped = stripAnswers(quiz);
    for (const q of stripped) {
      expect(q).not.toHaveProperty("correctIndex");
    }
    expect(stripped).toEqual(quiz.map(({ id, prompt, choices }) => ({ id, prompt, choices })));
  });
});

describe("gradeQuiz", () => {
  it("scores a perfect run as full marks by regenerating the answer key server-side", () => {
    const quiz = generateScaleQuiz("scale-2");
    const submissions = quiz.map((q) => ({ questionId: q.id, selectedIndex: q.correctIndex }));
    const result = gradeQuiz("scale-2", submissions);
    expect(result.total).toBe(quiz.length);
    expect(result.score).toBe(quiz.length);
    expect(result.results.every((r) => r.correct)).toBe(true);
  });

  it("scores every wrong answer as incorrect", () => {
    const quiz = generateScaleQuiz("scale-2");
    const submissions = quiz.map((q) => ({
      questionId: q.id,
      selectedIndex: (q.correctIndex + 1) % q.choices.length,
    }));
    const result = gradeQuiz("scale-2", submissions);
    expect(result.score).toBe(0);
    expect(result.results.every((r) => !r.correct)).toBe(true);
  });

  it("treats a submission for an unknown/stale question id as incorrect rather than throwing", () => {
    const result = gradeQuiz("scale-2", [{ questionId: "not-a-real-question", selectedIndex: 0 }]);
    expect(result.score).toBe(0);
    expect(result.results).toEqual([{ questionId: "not-a-real-question", selectedIndex: 0, correct: false }]);
  });

  it("grades a partial submission against the full regenerated total", () => {
    const quiz = generateScaleQuiz("scale-2");
    const [first] = quiz;
    const result = gradeQuiz("scale-2", [{ questionId: first.id, selectedIndex: first.correctIndex }]);
    expect(result.total).toBe(quiz.length);
    expect(result.score).toBe(1);
  });
});
