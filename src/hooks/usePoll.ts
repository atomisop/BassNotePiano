"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const POLL_TIMEOUT_MS = 8000;
const DEFAULT_MAX_FAILURES = 3;

/**
 * Races a promise against a timeout. Server actions can't take an
 * AbortSignal, so a hung request would otherwise leave a poll waiting
 * forever; this gives every tick a hard ending.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error("timeout"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Polls `tick` on an interval with a timeout on every call.
 *
 * A single failed tick stays quiet (the next one usually succeeds). After
 * `maxFailures` in a row, `failed` turns true so the screen can say what
 * broke and offer `retry`; the loop keeps trying in the background and clears
 * `failed` itself the moment a tick succeeds.
 *
 * Ticks never overlap: if one is still in flight when the next is due, the
 * next is skipped.
 *
 * `resetKey` is for polls that follow a selection (the open conversation):
 * when it changes, the previous tick's signal is aborted, the failure count
 * starts over, and a tick runs right away for the new selection. A tick
 * should check `signal.aborted` after each await and bail out, so a slow
 * answer for the old selection can't overwrite the new one.
 */
export function usePoll(
  tick: (signal: AbortSignal) => Promise<void>,
  intervalMs: number,
  {
    enabled = true,
    immediate = false,
    resetKey = null,
    timeoutMs = POLL_TIMEOUT_MS,
    maxFailures = DEFAULT_MAX_FAILURES,
  }: {
    enabled?: boolean;
    immediate?: boolean;
    resetKey?: string | null;
    timeoutMs?: number;
    maxFailures?: number;
  } = {},
) {
  const [failed, setFailed] = useState(false);
  const tickRef = useRef(tick);
  const generation = useRef(0);
  const inFlight = useRef<number | null>(null);
  const failures = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    tickRef.current = tick;
  });

  const run = useCallback(async () => {
    const gen = generation.current;
    if (inFlight.current === gen) return;
    inFlight.current = gen;
    const ctrl = new AbortController();
    controller.current = ctrl;
    try {
      await withTimeout(tickRef.current(ctrl.signal), timeoutMs, () => ctrl.abort());
      if (gen !== generation.current) return;
      failures.current = 0;
      setFailed(false);
    } catch {
      if (gen !== generation.current) return;
      failures.current += 1;
      if (failures.current >= maxFailures) setFailed(true);
    } finally {
      if (inFlight.current === gen) inFlight.current = null;
    }
  }, [timeoutMs, maxFailures]);

  useEffect(() => {
    generation.current += 1;
    failures.current = 0;
    setFailed(false);
    if (!enabled) return;
    if (immediate || resetKey !== null) void run();
    const id = setInterval(() => void run(), intervalMs);
    return () => {
      clearInterval(id);
      controller.current?.abort();
      generation.current += 1;
    };
  }, [enabled, immediate, resetKey, intervalMs, run]);

  const retry = useCallback(() => {
    failures.current = 0;
    setFailed(false);
    void run();
  }, [run]);

  return { failed, retry };
}
