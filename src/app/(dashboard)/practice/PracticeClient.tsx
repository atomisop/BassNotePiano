"use client";

import { Celebrate } from "@/components/ui/Celebrate";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Pause, Play, Plus } from "@/components/ui/appIcons";
import { Card, Eyebrow } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Tabs } from "@/components/ui/Tabs";
import { useMetronome, METRONOME_MAX_BPM, METRONOME_MIN_BPM } from "@/components/scales/useMetronome";
import {
  GUITAR_EXERCISES,
  PIANO_EXERCISES,
  type GuitarExercise,
  type PianoExercise,
  type PianoSection,
} from "@/lib/fingerExercises";
import { DAILY_GOAL_SECONDS, type FingerPracticeStatus } from "@/lib/fingerPracticeConstants";
import { useWakeLock } from "@/hooks/useWakeLock";
import { announceChange } from "@/lib/liveEvents";
import { PageBack } from "@/components/ui/BackLink";

type Instrument = "PIANO" | "GUITAR";

const HEARTBEAT_MS = 15_000;

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Steps per group in the step rows: one bar at four beats, so a long pattern reads as a few short ones. */
const STEPS_PER_GROUP = 4;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const raisedKey =
  "tap inline-flex items-center justify-center gap-2 rounded-full bg-neu-base px-4 py-2.5 text-small font-semibold text-slate-100 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low disabled:opacity-50";

// ---------------------------------------------------------------------------
// Piano: a mini keyboard with finger numbers, and the step chips
// ---------------------------------------------------------------------------

const WHITE_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const KEY_COUNT = 15; // C to C to C

/** Each step's key on a two-octave strip: the occurrence of that letter nearest the previous step. */
function keyPositions(section: PianoSection): number[] {
  const out: number[] = [];
  let previous = 0;
  for (const step of section.steps) {
    const base = WHITE_INDEX[step.note];
    const options = [base, base + 7, base + 14].filter((n) => n < KEY_COUNT);
    const best = options.reduce((a, b) => (Math.abs(b - previous) < Math.abs(a - previous) ? b : a));
    out.push(best);
    previous = best;
  }
  return out;
}


function PianoSectionView({ section, activeStep }: { section: PianoSection; activeStep: number | null }) {
  const positions = useMemo(() => keyPositions(section), [section]);
  const lit = activeStep === null ? null : activeStep % section.steps.length;
  const litKey = lit === null ? null : positions[lit];
  const litFinger = lit === null ? null : section.steps[lit].finger;

  return (
    <div className="rounded-2xl bg-neu-base p-4 shadow-raised-low">
      <h3 className="text-body font-semibold text-slate-50">{section.label}</h3>
      <p className="mt-0.5 text-small text-slate-500">Note on top, finger number below</p>

      {/* Steps in groups of four (one bar), with a gap between groups. */}
      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-2" aria-label={`${section.label}, notes and fingers`}>
        {chunk(section.steps.map((step, i) => ({ step, i })), STEPS_PER_GROUP).map((group, g) => (
          <li key={g} className="flex gap-1">
            {group.map(({ step, i }) => (
              <span
                key={i}
                aria-label={`${step.note}, finger ${step.finger}`}
                className={`flex h-12 w-10 flex-col items-center justify-center rounded-lg transition ${
                  lit === i ? "bg-signal text-signal-ink" : "bg-neu-lift text-slate-100"
                }`}
              >
                <span className="text-small font-semibold leading-none">{step.note}</span>
                <span className={`mt-1 text-small font-bold leading-none ${lit === i ? "" : "text-signal-fg"}`}>{step.finger}</span>
              </span>
            ))}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex h-20 gap-[3px]" aria-hidden>
        {Array.from({ length: KEY_COUNT }).map((_, i) => (
          <div
            key={i}
            className={`relative flex flex-1 items-end justify-center rounded-b-md pb-1 text-small font-bold transition ${
              litKey === i ? "bg-signal text-signal-ink" : "bg-slate-200/90 text-slate-500"
            }`}
          >
            {litKey === i ? litFinger : "CDEFGAB"[i % 7]}
          </div>
        ))}
      </div>
    </div>
  );
}

function PianoExerciseView({ exercise, activeStep }: { exercise: PianoExercise; activeStep: number | null }) {
  return (
    <div className="space-y-3">
      {exercise.sections.map((section) => (
        <PianoSectionView key={section.hand + section.label} section={section} activeStep={activeStep} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guitar: a tab strip with fret numbers, the finger under each, pick direction above
// ---------------------------------------------------------------------------

function GuitarTab({ exercise, activeStep }: { exercise: GuitarExercise; activeStep: number | null }) {
  const lit = activeStep === null ? null : activeStep % exercise.steps.length;
  const names = ["e", "B", "G", "D", "A", "E"];

  const fingerstyle = exercise.steps.some((st) => st.pickFinger);
  const legend = fingerstyle
    ? [["T", "thumb"], ["I", "index"], ["M", "middle"], ["R", "ring"]]
    : [["1", "index"], ["2", "middle"], ["3", "ring"], ["4", "pinky"]];

  return (
    <div className="rounded-2xl bg-neu-base p-3 shadow-raised-low sm:p-5">
      <div className="flex flex-wrap gap-1.5">
        {legend.map(([key, name]) => (
          <span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-neu-lift px-3 py-1 text-small text-slate-300">
            <span className="font-bold text-signal-fg">{key}</span>
            {name}
          </span>
        ))}
      </div>

      <div className="mt-4 flex">
        <div className="flex shrink-0 flex-col pt-7">
          {names.map((n) => (
            <span key={n} className="flex h-10 w-6 items-center justify-center text-small font-semibold text-slate-500">
              {n}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 overflow-x-auto pb-1">
          {exercise.steps.map((step, i) => (
            <div key={i} className={`flex min-w-[2.75rem] flex-1 flex-col items-center ${i > 0 && i % STEPS_PER_GROUP === 0 ? "ml-3 border-l border-slate-700" : ""}`}>
              <span className="flex h-7 items-center text-body font-bold text-slate-400">
                {step.pick === "D" ? "\u2193" : step.pick === "U" ? "\u2191" : step.pickFinger ?? ""}
              </span>
              {[1, 2, 3, 4, 5, 6].map((str) => (
                <div key={str} className="relative flex h-10 w-full items-center justify-center">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-slate-500/50" />
                  {step.string === str && (
                    <span
                      className={`relative z-10 flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-small font-bold ${
                        lit === i ? "bg-signal text-signal-ink" : "bg-neu-base text-slate-100 shadow-raised-low"
                      }`}
                    >
                      {step.fret}
                    </span>
                  )}
                </div>
              ))}
              <span className="mt-1 flex h-7 items-center text-small font-bold text-signal-fg">
                {step.finger === 0 ? (step.pickFinger ? "" : "open") : step.finger}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PracticeClient({
  initialStatus,
  defaultInstrument,
  onBeat,
  nextHref = null,
}: {
  /** The lesson to return to once today's 10 minutes are done. */
  nextHref?: string | null;
  initialStatus: FingerPracticeStatus;
  defaultInstrument: Instrument;
  onBeat: () => Promise<FingerPracticeStatus & { justCompleted: boolean }>;
}) {
  const [status, setStatus] = useState<FingerPracticeStatus>(initialStatus);
  const [instrument, setInstrument] = useState<Instrument>(defaultInstrument);
  const [exerciseId, setExerciseId] = useState<string>(
    defaultInstrument === "GUITAR" ? GUITAR_EXERCISES[0].id : PIANO_EXERCISES[0].id,
  );
  const [running, setRunning] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [localExtra, setLocalExtra] = useState(0);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const lastBeatRef = useRef<number>(0);
  const metronome = useMetronome();
  const wakeLock = useWakeLock(running);
  // The timer only counts while the screen is on and this page is in view. Say so when it was paused.
  const [pausedWhileAway, setPausedWhileAway] = useState(false);
  useEffect(() => {
    if (!running) {
      setPausedWhileAway(false);
      return;
    }
    let hiddenWhileRunning = false;
    function onChange() {
      if (document.visibilityState === "hidden") hiddenWhileRunning = true;
      else if (hiddenWhileRunning) {
        hiddenWhileRunning = false;
        setPausedWhileAway(true);
      }
    }
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [running]);

  const pianoExercise = PIANO_EXERCISES.find((e) => e.id === exerciseId) ?? PIANO_EXERCISES[0];
  const guitarExercise = GUITAR_EXERCISES.find((e) => e.id === exerciseId) ?? GUITAR_EXERCISES[0];
  const exercise = instrument === "PIANO" ? pianoExercise : guitarExercise;
  const stepCount = instrument === "PIANO" ? Math.max(...pianoExercise.sections.map((s) => s.steps.length)) : guitarExercise.steps.length;

  function chooseInstrument(next: Instrument) {
    setInstrument(next);
    setExerciseId(next === "GUITAR" ? GUITAR_EXERCISES[0].id : PIANO_EXERCISES[0].id);
    setActiveStep(null);
  }

  function chooseExercise(id: string, bpm: number) {
    setExerciseId(id);
    setActiveStep(null);
    metronome.setBpm(bpm);
  }

  // The tempo starts at the first exercise's own speed, so the number on screen matches "Start at N BPM" below it.
  const firstBpm = useRef(exercise.bpm);
  const setBpm = metronome.setBpm;
  useEffect(() => {
    setBpm(firstBpm.current);
  }, [setBpm]);

  const beat = useCallback(async () => {
    try {
      const next = await onBeat();
      setStatus(next);
      setPausedWhileAway(false);
      setLocalExtra(0);
      lastBeatRef.current = Date.now();
      if (next.justCompleted) {
        setJustCompleted(true);
        // The practice banner and the locked lessons depend on today's practice being done.
        announceChange("status", "page");
      }
    } catch (err) {
      console.error("Practice heartbeat failed (will retry):", err);
    }
  }, [onBeat]);

  // Heartbeats only while the timer runs and the tab is in view.
  useEffect(() => {
    if (!running) return;
    lastBeatRef.current = Date.now();
    beat();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") beat();
    }, HEARTBEAT_MS);
    const clock = setInterval(() => {
      if (document.visibilityState === "visible") setLocalExtra(Math.min(20, Math.floor((Date.now() - lastBeatRef.current) / 1000)));
    }, 1000);
    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [running, beat]);

  // Follow-along: the highlighted step advances once per beat while practicing.
  useEffect(() => {
    if (!running) return;
    setActiveStep(0);
    const ms = 60_000 / metronome.bpm;
    const interval = setInterval(() => setActiveStep((s) => ((s ?? -1) + 1) % stepCount), ms);
    return () => clearInterval(interval);
  }, [running, metronome.bpm, stepCount, exerciseId]);

  function toggle() {
    if (running) {
      setRunning(false);
      metronome.stop();
      setActiveStep(null);
    } else {
      setJustCompleted(false);
      setRunning(true);
      metronome.setBpm(exercise.bpm);
      metronome.start();
    }
  }

  const shownSeconds = status.completedToday ? DAILY_GOAL_SECONDS : Math.min(DAILY_GOAL_SECONDS, status.todaySeconds + (running ? localExtra : 0));
  const exercises = instrument === "PIANO" ? PIANO_EXERCISES : GUITAR_EXERCISES;

  return (
    <div className="grid gap-4 md:gap-(--space-group)">
      <div data-deck-header className="deck-header -mt-4 pt-6">
        <PageBack href="/dashboard" />
        <h1 className="font-hero text-hero font-bold text-balance text-slate-50">Finger exercises</h1>
      </div>

      {/* Three blocks, in the order you use them: today's timer and the tempo (side by side on computers), then the exercise. */}
      <div className="grid gap-4 md:grid-cols-2 md:gap-(--space-group)">
      {/* ---- Today ---- */}
      <Card className="!p-4 md:!p-6">
        <div className="flex items-center gap-4">
          <ProgressRing
            value={shownSeconds}
            max={DAILY_GOAL_SECONDS}
            size={96}
            strokeWidth={8}
            label={`Practice today: ${mmss(shownSeconds)} of ${mmss(DAILY_GOAL_SECONDS)}`}
            caption={`${mmss(shownSeconds)} / ${mmss(DAILY_GOAL_SECONDS)}`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-slate-50">
              {status.completedToday ? "Done for today" : running ? "Practicing" : "10 minutes to go"}
            </p>
            <p className="mt-1 text-small text-slate-400">{status.streak} day streak</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:flex">
          <button type="button" onClick={toggle} className={buttonVariants({ size: "lg", className: "min-h-12 w-full sm:w-auto sm:px-8" })}>
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Pause" : status.completedToday ? "Practice more" : "Start"}
          </button>
          {status.completedToday && (
            <a href={nextHref ?? "/dashboard"} className={`${raisedKey} min-h-12 w-full sm:w-auto`}>
              {nextHref ? "Continue to your lesson" : "Go to scales"}
            </a>
          )}
        </div>
        {running && !status.completedToday && (
          <p className="mt-3 text-small text-slate-500" role="status">
            {pausedWhileAway
              ? "The timer paused while your screen was off or this app was in the background. It counts again now."
              : wakeLock.held
                ? "Your screen stays on while you practice."
                : "Keep this screen on and in view: the timer pauses when your phone locks or you switch apps."}
          </p>
        )}
        {justCompleted && <Celebrate />}
        {justCompleted && (
          <p className="mt-3 rounded-xl bg-neu-base px-4 py-3 text-small font-semibold text-slate-50 shadow-pressed-low">
            10 minutes done. {"\u{1F389}"}
          </p>
        )}
      </Card>

      {/* ---- Metronome ---- */}
      <Card className="!p-4 md:!p-6">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>Tempo</Eyebrow>
          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: metronome.beatsPerBar }).map((_, i) => (
              <span
                key={i}
                className={`h-3 w-3 rounded-full transition ${metronome.running && metronome.beat === i ? "bg-signal" : "bg-neu-base shadow-pressed-low"}`}
              />
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Slower"
            onClick={() => metronome.setBpm(Math.max(METRONOME_MIN_BPM, metronome.bpm - 4))}
            className={`${raisedKey} h-12 w-12 !px-0`}
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="flex-1 rounded-xl bg-neu-base py-2 text-center shadow-pressed-low">
            <p className="text-body font-semibold tabular-nums text-slate-50">{metronome.bpm}</p>
            <p className="text-small text-slate-500">BPM</p>
          </div>
          <button
            type="button"
            aria-label="Faster"
            onClick={() => metronome.setBpm(Math.min(METRONOME_MAX_BPM, metronome.bpm + 4))}
            className={`${raisedKey} h-12 w-12 !px-0`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => (metronome.running ? metronome.stop() : metronome.start())}
          disabled={!metronome.supported}
          className={`${raisedKey} mt-3 min-h-12 w-full`}
        >
          {metronome.running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {metronome.running ? "Stop the beat" : "Beat only, no timer"}
        </button>
      </Card>
      </div>

      {/* ---- Exercises ---- */}
      <section aria-labelledby="exercise-heading" className="min-w-0 space-y-3 md:space-y-4">
        <h2 id="exercise-heading" className="text-title font-semibold text-slate-50">The exercise</h2>
        <Tabs<Instrument>
          label="Instrument"
          value={instrument}
          onChange={chooseInstrument}
          items={[
            { id: "PIANO", label: "Piano" },
            { id: "GUITAR", label: "Guitar and bass" },
          ]}
        />

        <div className="-mx-4 flex touch-pan-x snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          {exercises.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => chooseExercise(e.id, e.bpm)}
              aria-pressed={e.id === exerciseId}
              className={`tap shrink-0 snap-start scroll-mx-4 rounded-full px-4 py-2.5 text-small font-semibold transition ${
                e.id === exerciseId ? "bg-signal/16 text-signal-fg" : "bg-neu-base text-slate-300 hover:text-slate-100"
              }`}
            >
              {e.title}
            </button>
          ))}
        </div>

        <div>
          <p className="text-body text-slate-200">{exercise.summary}</p>
          <p className="mt-0.5 text-small tabular-nums text-slate-500">Start at {exercise.bpm} BPM, then speed up once it is even.</p>
        </div>

        {instrument === "PIANO" ? (
          <PianoExerciseView exercise={pianoExercise} activeStep={activeStep} />
        ) : (
          <GuitarTab exercise={guitarExercise} activeStep={activeStep} />
        )}

        {/* The method is one tap away, not in the way. */}
        <details className="group rounded-2xl bg-neu-base shadow-raised-low">
          <summary className="tap flex cursor-pointer list-none items-center justify-between px-4 py-3 text-small font-semibold text-slate-100 [&::-webkit-details-marker]:hidden">
            How to play
            <span className="text-slate-500 transition group-open:rotate-45">+</span>
          </summary>
          <div className="px-4 pb-4">
            <ol className="space-y-2 text-small text-slate-300">
              {exercise.how.map((line, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neu-lift text-small font-bold text-signal-fg">
                    {i + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </div>
        </details>
      </section>

    </div>
  );
}
