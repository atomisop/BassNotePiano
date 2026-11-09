/**
 * Scoring for a guided note exercise. Pure and immutable so the same rules run in the browser and in tests.
 *
 * Rules (decided up front so a score can never be inflated):
 * - every note played counts as ONE attempt; a correct one moves to the next note, a wrong one stays put;
 * - the same note arriving twice within DEBOUNCE_MS (a touch plus a MIDI echo, a bounced key) counts once;
 * - once the exercise is finished, nothing more counts;
 * - accuracy is correct attempts over all attempts, so retrying a note lowers it honestly.
 */
export const DEBOUNCE_MS = 60;

export type PracticeMode = "guided" | "memory";

export interface Exercise {
  id: string;
  title: string;
  notes: readonly number[];
}

export interface PracticeSession {
  exercise: Exercise;
  mode: PracticeMode;
  position: number;
  attempts: number;
  correct: number;
  mistakesByNote: Record<number, number>;
  finished: boolean;
  last: { midi: number; result: "correct" | "wrong"; expected: number } | null;
  lastAtMs: number | null;
  lastMidi: number | null;
}

export function createSession(exercise: Exercise, mode: PracticeMode): PracticeSession {
  if (exercise.notes.length === 0) throw new RangeError("An exercise needs at least one note");
  return { exercise, mode, position: 0, attempts: 0, correct: 0, mistakesByNote: {}, finished: false, last: null, lastAtMs: null, lastMidi: null };
}

export function targetNote(session: PracticeSession): number | null {
  return session.finished ? null : session.exercise.notes[session.position];
}

export function applyNote(session: PracticeSession, midi: number, atMs: number): PracticeSession {
  if (session.finished) return session;
  if (session.lastMidi === midi && session.lastAtMs !== null && atMs - session.lastAtMs >= 0 && atMs - session.lastAtMs < DEBOUNCE_MS) return session;

  const expected = session.exercise.notes[session.position];
  const isCorrect = midi === expected;
  const position = isCorrect ? session.position + 1 : session.position;
  return {
    ...session,
    position,
    attempts: session.attempts + 1,
    correct: session.correct + (isCorrect ? 1 : 0),
    mistakesByNote: isCorrect ? session.mistakesByNote : { ...session.mistakesByNote, [expected]: (session.mistakesByNote[expected] ?? 0) + 1 },
    finished: position >= session.exercise.notes.length,
    last: { midi, result: isCorrect ? "correct" : "wrong", expected },
    lastAtMs: atMs,
    lastMidi: midi,
  };
}

export function accuracyPercent(session: PracticeSession): number {
  return session.attempts === 0 ? 0 : Math.round((session.correct / session.attempts) * 100);
}

/** Progress through the phrase, 0 to 100. Counts notes reached, not attempts. */
export function progressPercent(session: PracticeSession): number {
  return Math.round((session.position / session.exercise.notes.length) * 100);
}

/** The note the player struggled with most, for the summary. Null when there were no mistakes. */
export function hardestNote(session: PracticeSession): number | null {
  const entries = Object.entries(session.mistakesByNote);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]));
  return Number(entries[0][0]);
}
