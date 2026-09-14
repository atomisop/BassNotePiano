import { spellDegree, type RootKey } from "@/lib/music-theory";
import { SCALE_CONTENT, type ScaleVariant } from "@/lib/scale-content";

// ============================================================================
// Deterministic quiz generation, seeded. No randomness inside this file
// itself (no Math.random/Date.now), every "pick" is still arithmetic on a
// fixed index, `seed` is just one more number that arithmetic runs on. That
// means generateScaleQuiz(slug, seed) always returns the exact same question
// set for the same (slug, seed) pair, in the exact same choice order, every
// time it's called. That determinism is what lets grading regenerate the
// quiz server-side (with correct answers) from nothing but the scaleSlug and
// the seed the student was actually shown, instead of having to persist the
// generated quiz somewhere between "show it" and "grade it".
//
// The randomness itself lives one layer up, in QuizModal: it rolls a fresh
// random seed every time the quiz is (re)started, by direct instruction
// ("creates new quiz questions upon redoing the quiz so it won't [be] easy
// to memorize and pass"). A different seed rotates which degree questions
// make the cut (a scale with more possible degree-spelling questions than
// fit in one quiz can now surface a different subset, not just the same
// leading ones every time), which root key each one uses, and the order/
// wrong-answer choices for every question, so retaking genuinely shows a
// different run, not the same six questions with a coat of paint. There's
// no security property being protected here (the correct answers aren't
// secret, this is spaced-repetition hygiene, not access control), so a
// client-supplied seed on submission needs no server-side issuance or
// signing: grading just regenerates from whatever seed the submission
// claims and checks the submitted answers against that, so a mismatched or
// made-up seed only ever grades against content the student wasn't
// actually shown, never in their favor.
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
 *
 * `seed` defaults to 0 (the original, always-the-same quiz) for any caller
 * that just wants a stable question count or doesn't care about variety,
 * see e.g. the scale page's own server-rendered "X/Y" score label, which
 * only ever reads `.length`. QuizModal is the one caller that rolls a real
 * random seed on every (re)start.
 */
export function generateScaleQuiz(scaleSlug: string, seed = 0): QuizQuestion[] {
  const variants = SCALE_CONTENT[scaleSlug] ?? [];
  if (variants.length === 0) return [];

  // Guards against a malformed/adversarial seed from a public server action
  // (submitQuizAction) turning into NaN part-way through the modulo
  // arithmetic below, which would otherwise surface as array[NaN] ->
  // undefined -> a spellDegree() crash rather than a clean, safe fallback.
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;

  const pools: QuizQuestion[][] = variants.map((variant, variantIndex) => {
    const allDegreeTokens = variant.formula.split("-").filter((t) => t !== "1");
    // Seed rotates which degree tokens lead this variant's own pool, so a
    // wider formula (more possible degree questions than fit in one quiz)
    // can surface a different subset each attempt instead of always the
    // same leading ones.
    const degreeTokens = rotate(allDegreeTokens, safeSeed + variantIndex);
    const pool = [buildFormulaQuestion(variant, safeSeed + variantIndex * 11)];
    degreeTokens.forEach((token, degreeIndex) => {
      const root = QUIZ_ROOTS_CYCLE[((safeSeed + variantIndex * 3 + degreeIndex) % QUIZ_ROOTS_CYCLE.length + QUIZ_ROOTS_CYCLE.length) % QUIZ_ROOTS_CYCLE.length];
      pool.push(buildDegreeQuestion(variant, token, root, safeSeed + variantIndex * 11 + degreeIndex + 1));
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

/**
 * Regenerates the same deterministic (scaleSlug, seed) quiz and grades
 * submitted answers against it. Iterates the real, regenerated `questions`
 * list, not the raw `submissions` array, and reads at most one submitted
 * answer per real question id: submissions was client-supplied, and a
 * client that already knows a question's real id (stripAnswers always
 * sends it) could otherwise submit that same id many times with every
 * possible selectedIndex, guaranteeing a match each time and inflating
 * score arbitrarily past total. Grading by the true question set makes
 * score <= total structurally, regardless of what submissions contains.
 */
export function gradeQuiz(scaleSlug: string, seed: number, submissions: QuizAnswerSubmission[]): QuizGradeResult {
  const questions = generateScaleQuiz(scaleSlug, seed);
  // Map, not the raw array: only the *last* submitted answer for a given
  // question id is ever read, so repeating an id can't count twice.
  const submittedByQuestion = new Map(submissions.map((s) => [s.questionId, s.selectedIndex]));

  let score = 0;
  const results = questions.map((question) => {
    const selectedIndex = submittedByQuestion.get(question.id);
    const correct = selectedIndex !== undefined && question.correctIndex === selectedIndex;
    if (correct) score++;
    // -1: no real choice has this index, so an omitted answer never reads
    // as accidentally correct.
    return { questionId: question.id, selectedIndex: selectedIndex ?? -1, correct };
  });

  return { score, total: questions.length, results };
}
