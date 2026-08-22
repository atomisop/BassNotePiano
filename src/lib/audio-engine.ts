// ============================================================================
// Scale Explorer audio — a synthesized piano-ish voice for auditioning the
// scales and native chords that src/lib/music-theory.ts spells.
//
// Synthesized rather than sampled, for the same reason the notification chime
// is (see src/lib/notification-sound.ts): a real multi-velocity piano library
// is tens of megabytes, and this has to cover every note of every scale in all
// twelve keys. The whole engine is a few hundred bytes of maths and ships with
// no dependency and no network request.
//
// It is not pretending to be a Steinway. It is aiming for "unmistakably a
// pitched, struck, decaying instrument" — enough that a student can hear
// whether Anchihoye really does sound the way the page says it does.
// ============================================================================

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
// The voice
// ---------------------------------------------------------------------------

// Amplitude of each harmonic partial relative to the fundamental. Roughly
// follows a struck string's spectrum: strong fundamental, quickly thinning
// upper partials. More than five adds cost without being audible here.
const PARTIALS: ReadonlyArray<{ ratio: number; gain: number }> = [
  { ratio: 1, gain: 1 },
  { ratio: 2, gain: 0.32 },
  { ratio: 3, gain: 0.14 },
  { ratio: 4, gain: 0.07 },
  { ratio: 5, gain: 0.035 },
];

/**
 * Schedules one struck note. Returns nothing — the caller tracks cancellation
 * through the module-level source list.
 */
function scheduleVoice(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  velocity: number,
) {
  // One filter per note rather than per partial: a real string's brightness
  // decays faster than its loudness, which is most of what separates a struck
  // note from an organ tone.
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(Math.min(frequency * 9, 14000), startTime);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(frequency * 2.2, 300),
    startTime + duration * 0.9,
  );

  const noteGain = ctx.createGain();
  const peak = Math.max(velocity, 0.0001);

  // A 6ms attack — fast enough to read as struck, slow enough to avoid the
  // click that a truly instant ramp produces.
  noteGain.gain.setValueAtTime(0, startTime);
  noteGain.gain.linearRampToValueAtTime(peak, startTime + 0.006);
  // Exponential, never to exactly zero (exponentialRampToValueAtTime cannot
  // reach 0 and will throw), then a short linear tail to silence.
  noteGain.gain.exponentialRampToValueAtTime(peak * 0.28, startTime + duration * 0.45);
  noteGain.gain.exponentialRampToValueAtTime(peak * 0.0001, startTime + duration);

  filter.connect(noteGain).connect(destination);

  for (const partial of PARTIALS) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency * partial.ratio;

    // Real strings are slightly inharmonic — upper partials run sharp. A few
    // cents of stretch stops the stack sounding like a synthetic sawtooth.
    osc.detune.value = (partial.ratio - 1) * 1.6;

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
  const { tempo = 108, onStep, onEnd } = options;
  const ctx = getContext();
  if (!ctx || !masterGain || midis.length === 0) return;

  stopPlayback();

  const secondsPerNote = 60 / tempo;
  // Slight overlap so the run sounds connected rather than clipped-and-gapped.
  const noteDuration = secondsPerNote * 1.6;
  // A small lead-in — scheduling at exactly currentTime can drop the first note.
  const startAt = ctx.currentTime + 0.06;

  midis.forEach((midi, index) => {
    const noteStart = startAt + index * secondsPerNote;
    scheduleVoice(ctx, masterGain!, midiToFrequency(midi), noteStart, noteDuration, 0.5);

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
export function playNote(midi: number, velocity = 0.55): void {
  const ctx = getContext();
  if (!ctx || !masterGain) return;
  scheduleVoice(ctx, masterGain, midiToFrequency(midi), ctx.currentTime + 0.02, 1.5, velocity);
}

/**
 * Plays notes together as a block chord.
 *
 * Per-voice gain is scaled down by the voice count — four notes at the level
 * used for a single note sums past full scale and distorts on the way out.
 */
export function playChord(midis: number[], options: { duration?: number } = {}): void {
  const { duration = 2.2 } = options;
  const ctx = getContext();
  if (!ctx || !masterGain || midis.length === 0) return;

  stopPlayback();

  const startAt = ctx.currentTime + 0.03;
  const velocity = 0.5 / Math.sqrt(midis.length);

  midis.forEach((midi, index) => {
    // A few milliseconds of spread per voice, low to high. A perfectly
    // simultaneous attack is the single most synthetic-sounding thing a
    // sampled-piano imitation can do; a real hand is never that precise.
    scheduleVoice(
      ctx,
      masterGain!,
      midiToFrequency(midi),
      startAt + index * 0.012,
      duration,
      velocity,
    );
  });
}
