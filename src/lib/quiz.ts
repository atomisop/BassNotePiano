import { CHORD_QUALITIES, ROOT_KEYS, buildChordOnDegree, pitchClassOf, spellDegree, spellScale, type ChordQualityKey, type RootKey } from "@/lib/music-theory";
import { SCALE_CONTENT, formulaForRoot, tokenForRoot, type ScaleVariant } from "@/lib/scale-content";

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

/** What the client actually receives, never the answer key. */
export type PublicQuizQuestion = Omit<QuizQuestion, "correctIndex">;

/** The exam length. Passing needs QUIZ_PASS_THRESHOLD of these (16 of 20 at 80%). */
export const QUESTIONS_PER_QUIZ = 20;

const TRIAD_FAMILY: ChordQualityKey[] = ["major", "minor", "diminished", "augmented"];
const SEVENTH_FAMILY: ChordQualityKey[] = ["dominant7", "major7", "minor7", "halfDiminished7"];
const OTHER_FAMILY: ChordQualityKey[] = ["major", "minor", "sus4", "add9"];
const QUALITY_NAMES: Record<string, string> = {
  major: "Major",
  minor: "Minor",
  diminished: "Diminished",
  augmented: "Augmented",
  dominant7: "Dominant 7th",
  major7: "Major 7th",
  minor7: "Minor 7th",
  halfDiminished7: "Half-diminished 7th",
  sus4: "Suspended 4th",
  add9: "Add 9",
};
const CHROMATIC_TOKENS = ["b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];
const STRIDES = [7, 11, 13, 17, 19, 23, 29, 31, 37];

function formatFormula(formula: string): string {
  return formula.split("-").join(" - ");
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Deterministically rotates `items` so the correct answer isn't always first. */
function rotate<T>(items: T[], seed: number): T[] {
  if (items.length === 0) return items;
  const shift = ((seed % items.length) + items.length) % items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Deterministic spread-out order over `list` (a permutation, so no repeats). */
function scatter<T>(list: T[], seed: number): T[] {
  if (list.length < 2) return list;
  const stride = STRIDES.find((s) => gcd(s, list.length) === 1) ?? 1;
  const offset = ((seed * 5) % list.length + list.length) % list.length;
  return list.map((_, i) => list[(offset + i * stride) % list.length]);
}

/** Four distinct choices, the correct one first-rotated. Null if there are not enough distinct wrong answers. */
function assemble(id: string, prompt: string, correct: string, wrong: string[], seed: number): QuizQuestion | null {
  const distractors = Array.from(new Set(wrong.filter((w) => w !== correct))).slice(0, 3);
  if (distractors.length < 3) return null;
  const choices = rotate([correct, ...distractors], seed + 1);
  return { id, prompt, choices, correctIndex: choices.indexOf(correct) };
}

function keyNotes(variant: ScaleVariant, root: RootKey): string[] {
  return spellScale(root, formulaForRoot(variant, root)).notes;
}

function chordFamily(quality: ChordQualityKey): ChordQualityKey[] {
  if (TRIAD_FAMILY.includes(quality)) return TRIAD_FAMILY;
  if (SEVENTH_FAMILY.includes(quality)) return SEVENTH_FAMILY;
  return OTHER_FAMILY.includes(quality) ? OTHER_FAMILY : [quality, "major", "minor", "sus4"];
}

type Builder = () => QuizQuestion | null;

/** Every question type for one scale, each a list of builders (cheap until called). */
function candidatesFor(variant: ScaleVariant, seed: number): Builder[][] {
  const name = variant.name;
  const sid = slugify(name);
  const tokens = variant.formula.split("-");
  const scalePcsFor = (root: RootKey) => new Set(keyNotes(variant, root).map(pitchClassOf));

  const formulaQ: Builder[] = [
    () => {
      const others = Array.from(new Set(Object.values(SCALE_CONTENT).flat().map((v) => v.formula))).filter((f) => f !== variant.formula);
      return assemble(`formula-${sid}`, `What is the scale-degree formula for ${name}?`, formatFormula(variant.formula), scatter(others, seed).map(formatFormula), seed);
    },
  ];

  const countQ: Builder[] = [
    () => {
      const n = tokens.length;
      return assemble(`count-${sid}`, `How many different notes does ${name} have (not counting the repeated root at the top)?`, String(n), [n - 1, n + 1, n + 2, n - 2, 12].filter((x) => x > 1).map(String), seed);
    },
  ];

  const degreeQ: Builder[] = [];
  const reverseQ: Builder[] = [];
  const outsiderQ: Builder[] = [];
  const wholeScaleQ: Builder[] = [];
  const chordNameQ: Builder[] = [];
  const chordToneQ: Builder[] = [];
  const semitoneQ: Builder[] = [];
  const chordQualityQ: Builder[] = [];

  for (const root of ROOT_KEYS) {
    const spelled = tokens.map((t) => spellDegree(root, tokenForRoot(variant, t, root)));
    tokens.forEach((token, i) => {
      if (token === "1") return;
      const shown = tokenForRoot(variant, token, root);
      degreeQ.push(() =>
        assemble(
          `degree-${sid}-${token}-${root}`,
          `In the key of ${root}, what is the ${shown} of ${name}?`,
          spelled[i],
          scatter(spelled.filter((_, j) => j !== i), seed + i),
          seed + i,
        ),
      );
      reverseQ.push(() =>
        assemble(
          `reverse-${sid}-${token}-${root}`,
          `In the key of ${root}, ${name}: the note ${spelled[i]} is which scale degree?`,
          shown,
          scatter(Array.from(new Set([...tokens.map((t) => tokenForRoot(variant, t, root)), ...CHROMATIC_TOKENS])).filter((t) => t !== shown && t !== "1"), seed + i),
          seed + i,
        ),
      );
    });

    outsiderQ.push(() => {
      const pcs = scalePcsFor(root);
      const outside = CHROMATIC_TOKENS.filter((t) => !pcs.has(pitchClassOf(spellDegree(root, t))));
      if (outside.length === 0) return null;
      const pick = outside[((seed % outside.length) + outside.length) % outside.length];
      const wrong = scatter(spelled.filter((n) => n !== root), seed);
      return assemble(`outsider-${sid}-${root}`, `Which of these notes is NOT in ${name} in the key of ${root}?`, spellDegree(root, pick), wrong, seed);
    });

    wholeScaleQ.push(() => {
      const correct = spelled.join(" - ");
      const wrong: string[] = [];
      for (let i = 1; i < spelled.length && wrong.length < 6; i++) {
        const alt = [...spelled];
        const swap = CHROMATIC_TOKENS.map((t) => spellDegree(root, t)).find((n) => !spelled.includes(n) && Math.abs(pitchClassOf(n) - pitchClassOf(spelled[i])) <= 1);
        if (!swap) continue;
        alt[i] = swap;
        wrong.push(alt.join(" - "));
      }
      return assemble(`scale-${sid}-${root}`, `Which line spells ${name} correctly in the key of ${root}?`, correct, scatter(wrong, seed), seed);
    });

    variant.nativeChords.forEach((spec) => {
      const chord = buildChordOnDegree(root, tokenForRoot(variant, spec.degree, root), spec.quality, variant.chordSpelling === "scale" ? spelled : undefined);
      const family = chordFamily(spec.quality);
      chordNameQ.push(() => {
        const wrong = family.filter((q) => q !== spec.quality).map((q) => `${chord.rootNote}${CHORD_QUALITIES[q].symbol}`);
        return assemble(
          `chordname-${sid}-${spec.degree}-${root}`,
          `In the key of ${root}, ${name}: what is the chord built on the ${tokenForRoot(variant, spec.degree, root)}?`,
          chord.symbol,
          wrong,
          seed,
        );
      });
      chordToneQ.push(() => {
        const wrong = family
          .filter((q) => q !== spec.quality)
          .map((q) => buildChordOnDegree(root, tokenForRoot(variant, spec.degree, root), q, variant.chordSpelling === "scale" ? spelled : undefined).notes.join(" - "));
        return assemble(`chordtones-${sid}-${spec.degree}-${root}`, `Which notes make up ${chord.symbol} in ${name}?`, chord.notes.join(" - "), wrong, seed);
      });
    });
  }

  // Questions that do not depend on the key.
  variant.nativeChords.forEach((spec) => {
    const family = chordFamily(spec.quality);
    chordQualityQ.push(() =>
      assemble(
        `chordquality-${sid}-${spec.degree}`,
        `In ${name}, what kind of chord is built on the ${spec.degree} (${spec.label})?`,
        QUALITY_NAMES[spec.quality] ?? spec.quality,
        family.filter((q) => q !== spec.quality).map((q) => QUALITY_NAMES[q] ?? q),
        seed,
      ),
    );
  });
  tokens.forEach((token) => {
    if (token === "1") return;
    const semis = pitchClassOf(spellDegree("C", token));
    semitoneQ.push(() =>
      assemble(
        `semitones-${sid}-${token}`,
        `In ${name}, how many semitones (half steps) is it from the root up to the ${token}?`,
        String(semis),
        [semis - 1, semis + 1, semis + 2, semis - 2, semis + 3].filter((x) => x > 0 && x < 12).map(String),
        seed,
      ),
    );
  });

  return [degreeQ, chordNameQ, reverseQ, outsiderQ, wholeScaleQ, chordToneQ, chordQualityQ, semitoneQ, formulaQ, countQ];
}

/**
 * The exam: QUESTIONS_PER_QUIZ questions for a scale, mixed across ten kinds
 * (notes in a key, reverse lookups, odd-one-out, whole scales, chord names and
 * chord tones, semitone distances, the formula). Questions are taken from the
 * kinds in turn so no one kind dominates, and `seed` scatters which keys and
 * degrees come up, so every retake is a genuinely different run.
 *
 * Same (scaleSlug, seed) always gives the same questions, which is what lets
 * grading regenerate the exam on the server from only the slug and the seed.
 * `seed` defaults to 0 for callers that only read `.length`.
 */
export function generateScaleQuiz(scaleSlug: string, seed = 0): QuizQuestion[] {
  const variants = SCALE_CONTENT[scaleSlug] ?? [];
  if (variants.length === 0) return [];

  // A malformed seed from a public server action must not turn into NaN.
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;

  const kinds: Builder[][] = [];
  variants.forEach((variant, variantIndex) => {
    candidatesFor(variant, safeSeed + variantIndex * 11).forEach((list, kind) => {
      kinds[kind] = [...(kinds[kind] ?? []), ...scatter(list, safeSeed + kind)];
    });
  });

  const questions: QuizQuestion[] = [];
  const seen = new Set<string>();
  const cursor = kinds.map(() => 0);
  let progressed = true;
  while (questions.length < QUESTIONS_PER_QUIZ && progressed) {
    progressed = false;
    for (let k = 0; k < kinds.length && questions.length < QUESTIONS_PER_QUIZ; k++) {
      while (cursor[k] < kinds[k].length) {
        const q = kinds[k][cursor[k]++]();
        if (q && !seen.has(q.id)) {
          seen.add(q.id);
          questions.push(q);
          progressed = true;
          break;
        }
      }
    }
  }
  // A seed-dependent order, so the position of each kind changes too.
  return scatter(questions, safeSeed);
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
