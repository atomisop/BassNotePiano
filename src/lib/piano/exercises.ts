import type { Exercise } from "@/lib/piano/practiceScoring";

// A plain five-note scale to warm the hands up. It is a teaching exercise, NOT a transcription of any Ethiopian qenet
// (Tizita, Bati, Ambassel, Anchihoye): those come from the teacher, once the content is reviewed (see Rework.md, P1-MUS-01).
export const WARM_UP: Exercise = { id: "pentatonic-warm-up", title: "Five-note warm-up", notes: [60, 62, 64, 67, 69, 72] };

export const EXERCISES: Record<string, Exercise> = { [WARM_UP.id]: WARM_UP };
