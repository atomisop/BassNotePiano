"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PrimaryInstrument } from "@prisma/client";
import {
  DEFAULT_OCTAVE,
  ensureAudioReady,
  isAudioSupported,
  notesToAscendingMidi,
  playChord,
  playNote,
  playSequence,
  stopPlayback,
  voiceForInstrument,
} from "@/lib/audio-engine";

/**
 * Owns playback state for the Scale Explorer.
 *
 * The engine itself is deliberately stateless-ish and global (one AudioContext
 * per tab), so this hook exists to hold the two things React actually needs to
 * render: whether a run is in progress, and which note of it is sounding right
 * now.
 *
 * `instrument` picks the synthesized voice (piano/guitar/bass) every play
 * call below uses — passed in rather than read once, so a live instrument
 * switcher (see TranspositionDashboard) changes the sound immediately on the
 * same player, not just on the next page load.
 */
export function useScalePlayer(instrument: PrimaryInstrument | null = null) {
  const voice = voiceForInstrument(instrument);
  const [supported, setSupported] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  /** Index into the note list currently sounding, or null. Drives highlighting. */
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  /** The exact pitch (MIDI) sounding now. Instruments light only the key or fret of this one note, never every octave of the same letter. */
  const [activeMidi, setActiveMidi] = useState<number | null>(null);

  // Feature detection has to happen after mount: `window` doesn't exist during
  // the server render, and branching on it directly would desync hydration.
  useEffect(() => {
    setSupported(isAudioSupported());
  }, []);

  // A run scheduled against the audio clock keeps going after unmount unless
  // it's explicitly cancelled — navigating away mid-scale would otherwise
  // leave notes sounding over the next page.
  useEffect(() => {
    return () => stopPlayback();
  }, []);

  const stop = useCallback(() => {
    stopPlayback();
    setIsPlaying(false);
    setActiveIndex(null);
    setActiveMidi(null);
  }, []);

  /**
   * Plays the scale as a run, ending on the root an octave up.
   *
   * The extra root is not cosmetic — a pentatonic that stops on its 6th
   * doesn't resolve, and students consistently read that as "the scale sounds
   * wrong" rather than "the run ended early".
   */
  // A real bass sits an octave below where a guitar or piano would play the
  // same note names — without this, switching to Bass would keep the piano's
  // register and just sound like a piano-range synth with a bass tone
  // applied. Only affects the abstract note-name paths below: a fretboard
  // press already carries its own real physical pitch (BASS_STANDARD_TUNING
  // is tuned a genuine octave under GUITAR_STANDARD_TUNING), so playKey needs
  // no adjustment.
  const baseOctave = voice === "BASS" ? DEFAULT_OCTAVE - 1 : DEFAULT_OCTAVE;

  const playScale = useCallback(
    async (notes: string[]) => {
      if (notes.length === 0) return;
      const ready = await ensureAudioReady();
      if (!ready) return;

      const withOctave = [...notes, notes[0]];
      setIsPlaying(true);
      const runMidis = notesToAscendingMidi(withOctave, baseOctave);
      playSequence(runMidis, {
        tempo: 116,
        voice,
        onStep: (index) => {
          setActiveIndex(index);
          setActiveMidi(runMidis[index] ?? null);
        },
        onEnd: () => {
          setIsPlaying(false);
          setActiveIndex(null);
          setActiveMidi(null);
        },
      });
    },
    [voice, baseOctave],
  );

  /** Auditions one scale degree in the register it occupies within the run. */
  const playDegree = useCallback(async (notes: string[], index: number) => {
    const ready = await ensureAudioReady();
    if (!ready) return;

    const midis = notesToAscendingMidi(notes, baseOctave);
    const midi = midis[index];
    if (midi === undefined) return;

    stopPlayback();
    setIsPlaying(false);
    playNote(midi, 0.55, voice);

    // Purely a visual pulse on the tapped chip — short, and independent of the
    // note's own (longer) decay.
    setActiveIndex(index);
    setActiveMidi(midi);
    setTimeout(() => {
      setActiveIndex((current) => (current === index ? null : current));
      setActiveMidi((current) => (current === midi ? null : current));
    }, 320);
  }, [voice, baseOctave]);

  const playChordNotes = useCallback(async (notes: string[]) => {
    const ready = await ensureAudioReady();
    if (!ready) return;
    playChord(notesToAscendingMidi(notes, baseOctave), { voice });
  }, [voice, baseOctave]);

  /**
   * Sounds one physical key.
   *
   * The pitch always comes from the key's own MIDI number, never from its
   * scale degree. That distinction is the whole point: a scale's root appears
   * on the keyboard twice — once at the bottom and once an octave up — and
   * routing both through the degree index made the upper one sound the lower
   * one's pitch. The degree is used only to decide which note chip pulses.
   *
   * `degreeIndex` is null for keys outside the scale. Those still sound: a
   * keyboard where most keys are dead is a diagram, not an instrument.
   */
  const playKey = useCallback(async (midi: number, degreeIndex: number | null) => {
    const ready = await ensureAudioReady();
    if (!ready) return;

    stopPlayback();
    setIsPlaying(false);
    playNote(midi, degreeIndex === null ? 0.45 : 0.55, voice);

    setActiveMidi(midi);
    setTimeout(() => setActiveMidi((current) => (current === midi ? null : current)), 320);
    if (degreeIndex !== null) {
      setActiveIndex(degreeIndex);
      setTimeout(
        () => setActiveIndex((current) => (current === degreeIndex ? null : current)),
        320,
      );
    }
  }, [voice]);

  return {
    supported,
    isPlaying,
    activeIndex,
    activeMidi,
    playScale,
    playDegree,
    playChordNotes,
    playKey,
    stop,
  };
}

/** Shared ref type for components that want to stop playback on key change. */
export type ScalePlayer = ReturnType<typeof useScalePlayer>;

/** Stops playback whenever `key` changes — e.g. the user picks a new root. */
export function useStopOnChange(stop: () => void, key: unknown) {
  const previous = useRef(key);
  useEffect(() => {
    if (previous.current !== key) {
      previous.current = key;
      stop();
    }
  }, [key, stop]);
}
