// ============================================================================
// Scale Explorer audio — synthesized voices for auditioning the scales and
// native chords that src/lib/music-theory.ts spells.
//
// Synthesized rather than sampled, for the same reason the notification chime
// is (see src/lib/notification-sound.ts): a real multi-velocity sample library
// is tens of megabytes per instrument, and this has to cover every note of
// every scale in all twelve keys, times three instruments. The whole engine
// is a few hundred bytes of maths and ships with no dependency and no network
// request.
//
// None of the three voices below is pretending to be a real recording. Each
// is aiming for "unmistakably a pitched, struck or plucked, decaying
// instrument, and clearly not the other two" — enough that a guitar or bass
// student hears their own instrument, not the piano voice with a different
// picture next to it.
// ============================================================================

import type { PrimaryInstrument } from "@prisma/client";
import { pitchClassOf } from "@/lib/music-theory";

// ---------------------------------------------------------------------------
// Context lifecycle
// ---------------------------------------------------------------------------

let sharedContext: AudioContext | null = null;
let masterGain: GainNode | null = null;

/** Every currently-scheduled source, so a new playback can cut off the last. */
let activeSources: AudioScheduledSourceNode[] = [];
/** Timers driving the per-note UI callback, cancelled alongside the audio. */
let activeTimers: ReturnType<typeof setTimeout>[] = [];

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  if (!sharedContext) {
    sharedContext = new Ctor();
    masterGain = sharedContext.createGain();
    // Headroom: a six-note chord stacking at unity would clip hard. Voices are
    // additionally scaled by count in playChord().
    masterGain.gain.value = 0.5;
    masterGain.connect(sharedContext.destination);
  }
  return sharedContext;
}

export function isAudioSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
  );
}

/**
 * Must be called from inside a real user gesture the first time.
 *
 * Every browser starts an AudioContext in the "suspended" state and only
 * allows resume() from a user-initiated event. Calling this from a click
 * handler is what makes all later programmatic playback (a scale stepping
 * through its notes on a timer) legal.
 */
export async function ensureAudioReady(): Promise<boolean> {
  const ctx = getContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === "running";
}

// ---------------------------------------------------------------------------
// Pitch
// ---------------------------------------------------------------------------

/** MIDI note number → frequency in Hz. A4 = MIDI 69 = 440Hz. */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Default octave for the scale's root. C4 = MIDI 60, so 4 puts it mid-keyboard. */
export const DEFAULT_OCTAVE = 4;

/**
 * Turns a list of spelled note names into ascending MIDI numbers.
 *
 * music-theory.ts returns pitch classes only ("C", "Db", "F", "Gb", "A") — it
 * has no concept of register. Played literally that would descend whenever the
 * spelling wraps past B, so Anchihoye's 6th would sound *below* its root. This
 * walks the list and lifts the octave every time a pitch class fails to
 * increase, which is what makes any formula ascend regardless of how it is
 * spelled.
 */
export function notesToAscendingMidi(notes: string[], octave = DEFAULT_OCTAVE): number[] {
  let currentOctave = octave;
  let previousPitchClass = -1;

  return notes.map((note) => {
    const pitchClass = pitchClassOf(note);
    if (previousPitchClass >= 0 && pitchClass <= previousPitchClass) currentOctave += 1;
    previousPitchClass = pitchClass;
    // MIDI octave convention: C4 = 60, so C(n) = 12 * (n + 1).
    return pitchClass + 12 * (currentOctave + 1);
  });
}

// ---------------------------------------------------------------------------
// The voices
// ---------------------------------------------------------------------------

export type InstrumentVoice = "PIANO" | "GUITAR" | "BASS";

/** `TranspositionDashboard` uses the same GUITAR/BASS/else split for which diagram to show — keeping the mapping here means the sound and the picture can never drift apart. */
export function voiceForInstrument(instrument: PrimaryInstrument | null): InstrumentVoice {
  if (instrument === "GUITAR") return "GUITAR";
  if (instrument === "BASS") return "BASS";
  return "PIANO";
}

interface VoiceProfile {
  /** Amplitude of each harmonic partial relative to the fundamental. */
  partials: ReadonlyArray<{ ratio: number; gain: number }>;
  /** Cents of detune per (ratio - 1) — real strings run sharp on upper partials; how sharp depends on the string's own stiffness. */
  detuneCents: number;
  /** Linear attack, in seconds. */
  attack: number;
  /** The envelope has decayed to `sustainLevel` of peak by this fraction of the note's total duration. */
  sustainAt: number;
  sustainLevel: number;
  /** Lowpass: opens to `min(freq * openMult, openCap)` at the attack, closes to `max(freq * closeMult, closeFloor)` by `closeAt` of the duration. */
  filterOpenMult: number;
  filterOpenCap: number;
  filterCloseMult: number;
  filterCloseFloor: number;
  filterCloseAt: number;
  filterQ: number;
  /** Multiplies every caller's base note duration — a struck piano note is short, a plucked string rings longer. */
  durationScale: number;
}

const VOICE_PROFILES: Record<InstrumentVoice, VoiceProfile> = {
  // The original voice, unchanged: strong fundamental, thinning upper
  // partials, brightness decaying faster than loudness — a struck hammer,
  // not an organ tone.
  PIANO: {
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.32 },
      { ratio: 3, gain: 0.14 },
      { ratio: 4, gain: 0.07 },
      { ratio: 5, gain: 0.035 },
    ],
    detuneCents: 1.6,
    attack: 0.006,
    sustainAt: 0.45,
    sustainLevel: 0.28,
    filterOpenMult: 9,
    filterOpenCap: 14000,
    filterCloseMult: 2.2,
    filterCloseFloor: 300,
    filterCloseAt: 0.9,
    filterQ: 0.7,
    durationScale: 1,
  },
  // A plucked steel string: brighter and richer in upper harmonics than a
  // piano hammer (more of the pick's attack survives into the tone), an
  // almost-instant attack, and a longer, ringing tail instead of a struck
  // note's clean cutoff.
  GUITAR: {
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.55 },
      { ratio: 3, gain: 0.32 },
      { ratio: 4, gain: 0.2 },
      { ratio: 5, gain: 0.11 },
      { ratio: 6, gain: 0.06 },
    ],
    detuneCents: 2.4,
    attack: 0.002,
    sustainAt: 0.22,
    sustainLevel: 0.4,
    filterOpenMult: 12,
    filterOpenCap: 15000,
    filterCloseMult: 3.4,
    filterCloseFloor: 600,
    filterCloseAt: 0.75,
    filterQ: 1.1,
    durationScale: 1.5,
  },
  // A fingered/plucked electric bass: dominated by the fundamental with
  // little upper-harmonic content (the "round", not "zingy", low end), a
  // slightly rounder attack than a guitar pick, and a dark filter that never
  // opens far above the note itself.
  BASS: {
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.2 },
      { ratio: 3, gain: 0.08 },
      { ratio: 4, gain: 0.025 },
    ],
    detuneCents: 1.2,
    attack: 0.009,
    sustainAt: 0.55,
    sustainLevel: 0.42,
    filterOpenMult: 4,
    filterOpenCap: 3200,
    filterCloseMult: 1.5,
    filterCloseFloor: 130,
    filterCloseAt: 0.92,
    filterQ: 0.6,
    durationScale: 1.8,
  },
};

/**
 * Schedules one struck or plucked note, per `voice`. Returns nothing — the
 * caller tracks cancellation through the module-level source list.
 */
function scheduleVoice(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  velocity: number,
  voice: InstrumentVoice = "PIANO",
) {
  const profile = VOICE_PROFILES[voice];

  // One filter per note rather than per partial: a real string's brightness
  // decays faster than its loudness, which is most of what separates a
  // struck/plucked note from an organ tone.
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = profile.filterQ;
  filter.frequency.setValueAtTime(Math.min(frequency * profile.filterOpenMult, profile.filterOpenCap), startTime);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(frequency * profile.filterCloseMult, profile.filterCloseFloor),
    startTime + duration * profile.filterCloseAt,
  );

  const noteGain = ctx.createGain();
  const peak = Math.max(velocity, 0.0001);

  noteGain.gain.setValueAtTime(0, startTime);
  noteGain.gain.linearRampToValueAtTime(peak, startTime + profile.attack);
  // Exponential, never to exactly zero (exponentialRampToValueAtTime cannot
  // reach 0 and will throw), then a short linear tail to silence.
  noteGain.gain.exponentialRampToValueAtTime(peak * profile.sustainLevel, startTime + duration * profile.sustainAt);
  noteGain.gain.exponentialRampToValueAtTime(peak * 0.0001, startTime + duration);

  filter.connect(noteGain).connect(destination);

  for (const partial of profile.partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency * partial.ratio;

    // Real strings are slightly inharmonic — upper partials run sharp. A few
    // cents of stretch stops the stack sounding like a synthetic sawtooth.
    osc.detune.value = (partial.ratio - 1) * profile.detuneCents;

    const partialGain = ctx.createGain();
    partialGain.gain.value = partial.gain;

    osc.connect(partialGain).connect(filter);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    activeSources.push(osc);
  }
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

/** Cancels everything currently sounding or scheduled. */
export function stopPlayback() {
  for (const source of activeSources) {
    try {
      source.stop();
    } catch {
      // Already stopped, or never started — nothing to do.
    }
  }
  activeSources = [];
  for (const timer of activeTimers) clearTimeout(timer);
  activeTimers = [];
}

export interface SequenceOptions {
  /** Beats per minute — one note per beat. */
  tempo?: number;
  /** Fired as each note sounds, for UI highlighting. Index into `midis`. */
  onStep?: (index: number) => void;
  /** Fired once the final note has been released. */
  onEnd?: () => void;
  voice?: InstrumentVoice;
}

/**
 * Plays a run of notes one after another.
 *
 * Timing is deliberately split across two clocks. The *audio* is scheduled
 * ahead of time against the AudioContext's own sample clock, which is accurate
 * and immune to main-thread jank. The *UI* callbacks run on setTimeout, which
 * is not accurate but only has to be close enough for a highlight to look
 * right. Driving the audio off setTimeout instead would make the scale audibly
 * stumble whenever React re-rendered.
 */
export function playSequence(midis: number[], options: SequenceOptions = {}): void {
  const { tempo = 108, onStep, onEnd, voice = "PIANO" } = options;
  const ctx = getContext();
  if (!ctx || !masterGain || midis.length === 0) return;

  stopPlayback();

  const secondsPerNote = 60 / tempo;
  // Slight overlap so the run sounds connected rather than clipped-and-gapped
  // — scaled per voice, since a plucked string should ring into the next
  // note more than a struck piano key does.
  const noteDuration = secondsPerNote * 1.6 * VOICE_PROFILES[voice].durationScale;
  // A small lead-in — scheduling at exactly currentTime can drop the first note.
  const startAt = ctx.currentTime + 0.06;

  midis.forEach((midi, index) => {
    const noteStart = startAt + index * secondsPerNote;
    scheduleVoice(ctx, masterGain!, midiToFrequency(midi), noteStart, noteDuration, 0.5, voice);

    if (onStep) {
      activeTimers.push(setTimeout(() => onStep(index), (noteStart - ctx.currentTime) * 1000));
    }
  });

  if (onEnd) {
    const totalMs = (startAt - ctx.currentTime + midis.length * secondsPerNote) * 1000;
    activeTimers.push(setTimeout(onEnd, totalMs));
  }
}

/** Plays a single note — used for auditioning one scale degree. */
export function playNote(midi: number, velocity = 0.55, voice: InstrumentVoice = "PIANO"): void {
  const ctx = getContext();
  if (!ctx || !masterGain) return;
  scheduleVoice(ctx, masterGain, midiToFrequency(midi), ctx.currentTime + 0.02, 1.5 * VOICE_PROFILES[voice].durationScale, velocity, voice);
}

/**
 * Plays notes together as a block chord.
 *
 * Per-voice gain is scaled down by the voice count — four notes at the level
 * used for a single note sums past full scale and distorts on the way out.
 */
export function playChord(midis: number[], options: { duration?: number; voice?: InstrumentVoice } = {}): void {
  const { voice = "PIANO" } = options;
  const duration = options.duration ?? 2.2 * VOICE_PROFILES[voice].durationScale;
  const ctx = getContext();
  if (!ctx || !masterGain || midis.length === 0) return;

  stopPlayback();

  const startAt = ctx.currentTime + 0.03;
  const velocity = 0.5 / Math.sqrt(midis.length);

  midis.forEach((midi, index) => {
    // A few milliseconds of spread per voice, low to high. A perfectly
    // simultaneous attack is the single most synthetic-sounding thing a
    // sampled imitation can do; a real hand is never that precise.
    scheduleVoice(
      ctx,
      masterGain!,
      midiToFrequency(midi),
      startAt + index * 0.012,
      duration,
      velocity,
      voice,
    );
  });
}
