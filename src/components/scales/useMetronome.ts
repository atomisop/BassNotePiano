"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const METRONOME_MIN_BPM = 30;
export const METRONOME_MAX_BPM = 240;

// How far ahead (seconds) clicks are queued on the audio clock, and how
// often (ms) the queue is topped up. Scheduling on the audio clock rather
// than firing each click from a JS timer is what keeps the beat steady even
// when the page is busy re-rendering: a late timer only delays the top-up,
// never a click that is already queued.
const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

export interface Metronome {
  supported: boolean;
  running: boolean;
  bpm: number;
  beatsPerBar: number;
  /** Index of the beat currently sounding, or -1 when stopped. */
  beat: number;
  setBpm: (bpm: number) => void;
  setBeatsPerBar: (beats: number) => void;
  start: () => void;
  stop: () => void;
}

/**
 * A click-track metronome on the Web Audio API. Lives at the lesson-page
 * level (not inside its tool panel) so it keeps time while the panel is
 * closed and the student is playing along with the lesson. The first beat
 * of each bar is accented with a higher click.
 */
export function useMetronome(): Metronome {
  const [supported, setSupported] = useState(false);
  const [running, setRunning] = useState(false);
  const [bpm, setBpmState] = useState(80);
  const [beatsPerBar, setBeatsState] = useState(4);
  const [beat, setBeat] = useState(-1);

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextTimeRef = useRef(0);
  const nextBeatRef = useRef(0);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beatsPerBar);
  const visualTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const w = window as WindowWithWebkitAudio;
    setSupported(typeof window.AudioContext !== "undefined" || typeof w.webkitAudioContext !== "undefined");
  }, []);

  const click = useCallback((ctx: AudioContext, time: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.7 : 0.45, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }, []);

  const schedule = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    while (nextTimeRef.current < ctx.currentTime + LOOKAHEAD_S) {
      const beatIndex = nextBeatRef.current;
      const at = nextTimeRef.current;
      click(ctx, at, beatIndex === 0);
      // The visual beat follows the sound, not the scheduler.
      const delay = Math.max(0, (at - ctx.currentTime) * 1000);
      visualTimeouts.current.push(setTimeout(() => setBeat(beatIndex), delay));
      nextTimeRef.current += 60 / bpmRef.current;
      nextBeatRef.current = (beatIndex + 1) % beatsRef.current;
    }
    // Keep the pending-timeout list from growing without bound.
    if (visualTimeouts.current.length > 64) visualTimeouts.current = visualTimeouts.current.slice(-16);
  }, [click]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    visualTimeouts.current.forEach(clearTimeout);
    visualTimeouts.current = [];
    setRunning(false);
    setBeat(-1);
  }, []);

  const start = useCallback(() => {
    if (timerRef.current) return;
    const w = window as WindowWithWebkitAudio;
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    // Created (or resumed) inside the tap that starts it: browsers only
    // allow audio to begin from a user gesture.
    if (!ctxRef.current) ctxRef.current = new Ctor();
    void ctxRef.current.resume();
    nextTimeRef.current = ctxRef.current.currentTime + 0.06;
    nextBeatRef.current = 0;
    timerRef.current = setInterval(schedule, TICK_MS);
    schedule();
    setRunning(true);
  }, [schedule]);

  const setBpm = useCallback((next: number) => {
    const clamped = Math.round(Math.min(METRONOME_MAX_BPM, Math.max(METRONOME_MIN_BPM, next)));
    bpmRef.current = clamped;
    setBpmState(clamped);
  }, []);

  const setBeatsPerBar = useCallback((next: number) => {
    beatsRef.current = next;
    nextBeatRef.current = nextBeatRef.current % next;
    setBeatsState(next);
  }, []);

  // Leaving the page stops the clicks and releases the audio device.
  useEffect(
    () => () => {
      stop();
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    [stop],
  );

  return { supported, running, bpm, beatsPerBar, beat, setBpm, setBeatsPerBar, start, stop };
}
