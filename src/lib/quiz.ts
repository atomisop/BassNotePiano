import { spellDegree, type RootKey } from "@/lib/music-theory";
import { SCALE_CONTENT, type ScaleVariant } from "@/lib/scale-content";

// ============================================================================
// Deterministic quiz generation. No randomness (no Math.random/Date.now) is
// used anywhere in here — every "pick" is arithmetic on a fixed index. That
// means generateScaleQuiz(slug) always returns the exact same question set,
// in the exact same choice order, every time it's called. That determinism
// is what lets grading regenerate the quiz server-side (with correct
// answers) from nothing but the scaleSlug, instead of having to persist the
// generated quiz somewhere between "show it" and "grade it".
// ============================================================================

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
}

/** What the client actually receives — never the answer key. */
export type PublicQuizQuestion = Omit<QuizQuestion, "correctIndex">;

const QUESTIONS_PER_QUIZ = 6;
const QUIZ_ROOTS_CYCLE: RootKey[] = ["G", "D", "Bb", "F#", "Eb", "A"];

function formatFormula(formula: string): string {
  return formula.split("-").join(" – ");
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Deterministically rotates `items` so the correct answer isn't always first. */
function rotate<T>(items: T[], seed: number): T[] {
  const shift = ((seed % items.length) + items.length) % items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
}

/** Deterministically samples up to `count` items from `pool`, spread out rather than consecutive. */
function sample<T>(pool: T[], count: number, offset: number): T[] {
  const result: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < pool.length && result.length < count; i++) {
    const idx = (offset + i * 7) % pool.length;
    if (seen.has(idx)) continue;
    seen.add(idx);
    result.push(pool[idx]);
  }
  return result;
}

const ALL_FORMULAS = Array.from(new Set(Object.values(SCALE_CONTENT).flat().map((v) => v.formula)));

function buildFormulaQuestion(variant: ScaleVariant, seed: number): QuizQuestion {
  const correct = formatFormula(variant.formula);
  const distractorPool = ALL_FORMULAS.filter((f) => f !== variant.formula);
  const distractors = sample(distractorPool, 3, seed).map(formatFormula);
  const choices = rotate([correct, ...distractors], seed + 1);
  return {
    id: `formula-${slugify(variant.name)}`,
    prompt: `What is the scale-degree formula for ${variant.name}?`,
    choices,
    correctIndex: choices.indexOf(correct),
  };
}

function buildDegreeQuestion(variant: ScaleVariant, degreeToken: string, root: RootKey, seed: number): QuizQuestion {
  const correct = spellDegree(root, degreeToken);
  const otherTokens = variant.formula.split("-").filter((t) => t !== degreeToken);
  const distractorNotes = otherTokens.map((t) => spellDegree(root, t)).filter((n) => n !== correct);
  const distractors = sample(distractorNotes, 3, seed);
  const choices = rotate([correct, ...distractors], seed + 1);
  return {
    id: `degree-${slugify(variant.name)}-${degreeToken}-${root}`,
    prompt: `In the key of ${root}, what is the ${degreeToken} of ${variant.name}?`,
    choices,
    correctIndex: choices.indexOf(correct),
  };
}

/**
 * Builds each variant's full candidate question list (1 formula-recall
 * question, then one degree-spelling question per non-tonic scale degree),
 * then round-robins across variants up to QUESTIONS_PER_QUIZ — so a
 * 3-variant chapter like Bati still gets a short, balanced quiz instead of
 * one variant dominating (or the quiz ballooning to 15 questions).
 */
export function generateScaleQuiz(scaleSlug: string): QuizQuestion[] {
  const variants = SCALE_CONTENT[scaleSlug] ?? [];
  if (variants.length === 0) return [];

  const pools: QuizQuestion[][] = variants.map((variant, variantIndex) => {
    const degreeTokens = variant.formula.split("-").filter((t) => t !== "1");
    const pool = [buildFormulaQuestion(variant, variantIndex * 11)];
    degreeTokens.forEach((token, degreeIndex) => {
      const root = QUIZ_ROOTS_CYCLE[(variantIndex * 3 + degreeIndex) % QUIZ_ROOTS_CYCLE.length];
      pool.push(buildDegreeQuestion(variant, token, root, variantIndex * 11 + degreeIndex + 1));
    });
    return pool;
  });

  const questions: QuizQuestion[] = [];
  for (let round = 0; questions.length < QUESTIONS_PER_QUIZ && pools.some((p) => round < p.length); round++) {
    for (const pool of pools) {
      if (round < pool.length && questions.length < QUESTIONS_PER_QUIZ) {
        questions.push(pool[round]);
      }
    }
  }
  return questions;
}

export function stripAnswers(questions: QuizQuestion[]): PublicQuizQuestion[] {
  return questions.map(({ id, prompt, choices }) => ({ id, prompt, choices }));
}

export interface QuizAnswerSubmission {
  questionId: string;
  selectedIndex: number;
}

export interface QuizGradeResult {
  score: number;
  total: number;
  results: Array<{ questionId: string; selectedIndex: number; correct: boolean }>;
}

/** Regenerates the same deterministic quiz and grades submitted answers against it. */
export function gradeQuiz(scaleSlug: string, submissions: QuizAnswerSubmission[]): QuizGradeResult {
  const questions = generateScaleQuiz(scaleSlug);
  const byId = new Map(questions.map((q) => [q.id, q]));

  let score = 0;
  const results = submissions.map(({ questionId, selectedIndex }) => {
    const question = byId.get(questionId);
    const correct = question ? question.correctIndex === selectedIndex : false;
    if (correct) score++;
    return { questionId, selectedIndex, correct };
  });

  return { score, total: questions.length, results };
}
