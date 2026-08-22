"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ensureAudioReady,
  isAudioSupported,
  notesToAscendingMidi,
  playChord,
  playNote,
  playSequence,
  stopPlayback,
} from "@/lib/audio-engine";

/**
 * Owns playback state for the Scale Explorer.
 *
 * The engine itself is deliberately stateless-ish and global (one AudioContext
 * per tab), so this hook exists to hold the two things React actually needs to
 * render: whether a run is in progress, and which note of it is sounding right
 * now.
 */
export function useScalePlayer() {
  const [supported, setSupported] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  /** Index into the note list currently sounding, or null. Drives highlighting. */
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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
  }, []);

  /**
   * Plays the scale as a run, ending on the root an octave up.
   *
   * The extra root is not cosmetic — a pentatonic that stops on its 6th
   * doesn't resolve, and students consistently read that as "the scale sounds
   * wrong" rather than "the run ended early".
   */
  const playScale = useCallback(
    async (notes: string[]) => {
      if (notes.length === 0) return;
      const ready = await ensureAudioReady();
      if (!ready) return;

      const withOctave = [...notes, notes[0]];
      setIsPlaying(true);
      playSequence(notesToAscendingMidi(withOctave), {
        tempo: 116,
        onStep: (index) => setActiveIndex(index),
        onEnd: () => {
          setIsPlaying(false);
          setActiveIndex(null);
        },
      });
    },
    [],
  );

  /** Auditions one scale degree in the register it occupies within the run. */
  const playDegree = useCallback(async (notes: string[], index: number) => {
    const ready = await ensureAudioReady();
    if (!ready) return;

    const midis = notesToAscendingMidi(notes);
    const midi = midis[index];
    if (midi === undefined) return;

    stopPlayback();
    setIsPlaying(false);
    playNote(midi);

    // Purely a visual pulse on the tapped chip — short, and independent of the
    // note's own (longer) decay.
    setActiveIndex(index);
    setTimeout(() => setActiveIndex((current) => (current === index ? null : current)), 320);
  }, []);

  const playChordNotes = useCallback(async (notes: string[]) => {
    const ready = await ensureAudioReady();
    if (!ready) return;
    playChord(notesToAscendingMidi(notes));
  }, []);

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
    playNote(midi, degreeIndex === null ? 0.45 : 0.55);

    if (degreeIndex !== null) {
      setActiveIndex(degreeIndex);
      setTimeout(
        () => setActiveIndex((current) => (current === degreeIndex ? null : current)),
        320,
      );
    }
  }, []);

  return {
    supported,
    isPlaying,
    activeIndex,
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
