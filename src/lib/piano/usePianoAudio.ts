"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { midiToFrequency } from "@/lib/piano/notes";

export type AudioState = "idle" | "ready" | "unsupported";

/**
 * Real piano-ish sound through the Web Audio API (no sample files, so nothing to license or download).
 * The AudioContext is created on the first note, which is always inside a tap or key press, because browsers (iOS above all)
 * keep audio locked until a gesture. A note is two oscillators (a triangle and a quieter octave above) under a fast-attack,
 * slow-decay envelope, released when the key goes up. Mute and volume are honoured for every note.
 */
export function usePianoAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const voices = useRef(new Map<number, { stop: (at: number) => void }>());
  const [state, setState] = useState<AudioState>("idle");
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);

  useEffect(() => {
    mutedRef.current = muted;
    volumeRef.current = volume;
    if (masterRef.current && ctxRef.current) masterRef.current.gain.setTargetAtTime(muted ? 0 : volume, ctxRef.current.currentTime, 0.01);
  }, [muted, volume]);

  const ensure = useCallback((): AudioContext | null => {
    if (ctxRef.current) {
      if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
      return ctxRef.current;
    }
    const Ctor = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctor) {
      setState("unsupported");
      return null;
    }
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = mutedRef.current ? 0 : volumeRef.current;
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;
    void ctx.resume();
    setState("ready");
    return ctx;
  }, []);

  const noteOn = useCallback(
    (midi: number) => {
      const ctx = ensure();
      const master = masterRef.current;
      if (!ctx || !master) return;
      voices.current.get(midi)?.stop(ctx.currentTime);
      const now = ctx.currentTime;
      const freq = midiToFrequency(midi);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.35);
      gain.connect(master);
      const a = ctx.createOscillator();
      a.type = "triangle";
      a.frequency.value = freq;
      const b = ctx.createOscillator();
      b.type = "sine";
      b.frequency.value = freq * 2;
      const bGain = ctx.createGain();
      bGain.gain.value = 0.25;
      a.connect(gain);
      b.connect(bGain).connect(gain);
      a.start(now);
      b.start(now);
      voices.current.set(midi, {
        stop: (at: number) => {
          gain.gain.cancelScheduledValues(at);
          gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), at);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
          a.stop(at + 0.3);
          b.stop(at + 0.3);
        },
      });
    },
    [ensure],
  );

  const noteOff = useCallback((midi: number) => {
    const ctx = ctxRef.current;
    const voice = voices.current.get(midi);
    if (!ctx || !voice) return;
    voice.stop(ctx.currentTime);
    voices.current.delete(midi);
  }, []);

  useEffect(() => {
    const live = voices.current;
    return () => {
      live.clear();
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);

  return { noteOn, noteOff, state, muted, setMuted, volume, setVolume, unlock: ensure };
}
