"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PianoKeyboard } from "@/components/piano/PianoKeyboard";
import { keyboardKeyToMidi, midiToName } from "@/lib/piano/notes";
import { usePianoAudio } from "@/lib/piano/usePianoAudio";
import { useMidiInput } from "@/lib/piano/useMidiInput";
import {
  accuracyPercent,
  applyNote,
  createSession,
  hardestNote,
  progressPercent,
  targetNote,
  type Exercise,
  type PracticeMode,
} from "@/lib/piano/practiceScoring";
import { buttonVariants } from "@/components/ui/button";

// A plain five-note scale to warm the hands up. It is a teaching exercise, NOT a transcription of any Ethiopian qenet
// (Tizita, Bati, Ambassel, Anchihoye): those come from the teacher, once the content is reviewed (see Rework.md, P1-MUS-01).
const WARM_UP: Exercise = { id: "pentatonic-warm-up", title: "Five-note warm-up", notes: [60, 62, 64, 67, 69, 72] };
const START = 60;
const END = 72;

type Tab = "listen" | PracticeMode;
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "listen", label: "Listen", hint: "Hear the phrase, then play along freely." },
  { id: "guided", label: "Guided", hint: "The next key is outlined. Play the phrase in order." },
  { id: "memory", label: "From memory", hint: "No outline. Play the phrase from what you heard." },
];

export function PianoLesson() {
  const audio = usePianoAudio();
  const [tab, setTab] = useState<Tab>("guided");
  const [labels, setLabels] = useState(true);
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set());
  const [session, setSession] = useState(() => createSession(WARM_UP, "guided"));
  const [demoNote, setDemoNote] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);

  const scoring = tab === "listen" ? null : session;

  const noteOn = useCallback(
    (midi: number) => {
      audio.noteOn(midi);
      setPressed((prev) => new Set(prev).add(midi));
      if (tab !== "listen") setSession((s) => applyNote(s, midi, performance.now()));
    },
    [audio, tab],
  );
  const noteOff = useCallback(
    (midi: number) => {
      audio.noteOff(midi);
      setPressed((prev) => {
        if (!prev.has(midi)) return prev;
        const next = new Set(prev);
        next.delete(midi);
        return next;
      });
    },
    [audio],
  );

  const midi = useMidiInput({ onNoteOn: noteOn, onNoteOff: noteOff });

  // The computer keyboard plays too: A S D F G H J K are the white keys from middle C, W E T Y U the black ones.
  useEffect(() => {
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const m = keyboardKeyToMidi(e.key, START);
      if (m !== null && m <= END) noteOn(m);
    };
    const up = (e: KeyboardEvent) => {
      const m = keyboardKeyToMidi(e.key, START);
      if (m !== null && m <= END) noteOff(m);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [noteOn, noteOff]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function chooseTab(next: Tab) {
    stopDemo();
    setTab(next);
    setLabels(next !== "memory");
    if (next !== "listen") setSession(createSession(WARM_UP, next));
  }

  function restart() {
    setSession(createSession(WARM_UP, tab === "memory" ? "memory" : "guided"));
  }

  function stopDemo() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setDemoNote(null);
    setPlaying(false);
  }

  function playDemo() {
    stopDemo();
    audio.unlock();
    setPlaying(true);
    WARM_UP.notes.forEach((m, i) => {
      timers.current.push(
        window.setTimeout(() => {
          audio.noteOn(m);
          setDemoNote(m);
        }, i * 650),
        window.setTimeout(() => audio.noteOff(m), i * 650 + 500),
      );
    });
    timers.current.push(
      window.setTimeout(() => {
        setDemoNote(null);
        setPlaying(false);
      }, WARM_UP.notes.length * 650),
    );
  }

  const target = tab === "guided" ? targetNote(session) : tab === "listen" ? demoNote : null;
  const feedback = useMemo(() => {
    if (!scoring) return playing ? "Listen to the phrase." : "Tap Hear it, then try the notes yourself.";
    if (scoring.finished) return "Finished. Well done.";
    if (!scoring.last) return tab === "guided" ? `Play ${midiToName(WARM_UP.notes[0])} to begin.` : "Play the phrase from memory.";
    if (scoring.last.result === "correct") return `Correct: ${midiToName(scoring.last.midi)}.`;
    return tab === "guided"
      ? `Not quite: you played ${midiToName(scoring.last.midi)}. The next note is ${midiToName(scoring.last.expected)}.`
      : `Not quite: you played ${midiToName(scoring.last.midi)}. Try again.`;
  }, [scoring, tab, playing]);

  const activeTab = TABS.find((t) => t.id === tab)!;
  const hardest = scoring ? hardestNote(scoring) : null;

  return (
    <div className="mx-auto w-full max-w-3xl pb-24">
      <h1 className="font-hero text-hero font-bold text-balance text-slate-50">Piano practice</h1>
      <p className="mt-1.5 text-small text-slate-400">
        {WARM_UP.title}: a plain five-note scale to warm your hands up. It is a teaching exercise, not a recording of any Ethiopian mode.
      </p>

      <div role="group" aria-label="Practice mode" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => chooseTab(t.id)}
            className={buttonVariants({ variant: tab === t.id ? "primary" : "secondary", size: "sm" })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-small text-slate-400">{activeTab.hint}</p>

      {scoring && (
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-small text-slate-50/80">
            <span id="piano-progress-label">Progress</span>
            <span>
              {scoring.position} of {WARM_UP.notes.length} notes
            </span>
          </div>
          <div
            role="progressbar"
            aria-labelledby="piano-progress-label"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent(scoring)}
            className="h-2 overflow-hidden rounded-full bg-slate-50/10"
          >
            <div className="h-full rounded-full bg-signal transition-[width] duration-200" style={{ width: `${progressPercent(scoring)}%` }} />
          </div>
        </div>
      )}

      <p role="status" aria-live="polite" className="mt-5 min-h-[1.5rem] text-body text-slate-50">
        {feedback}
      </p>

      <div className="mt-4">
        <PianoKeyboard startMidi={START} endMidi={END} pressed={pressed} target={target} showLabels={labels} onNoteOn={noteOn} onNoteOff={noteOff} />
      </div>

      {scoring?.finished && (
        <section aria-label="Your result" className="mt-6 rounded-2xl glass-surface-subtle p-5">
          <h2 className="text-title font-semibold text-slate-50">Your result</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-small text-slate-400">Accuracy</dt>
              <dd className="text-headline font-bold text-slate-50">{accuracyPercent(scoring)}%</dd>
            </div>
            <div>
              <dt className="text-small text-slate-400">Notes played</dt>
              <dd className="text-headline font-bold text-slate-50">{scoring.attempts}</dd>
            </div>
            <div>
              <dt className="text-small text-slate-400">Needed a retry</dt>
              <dd className="text-headline font-bold text-slate-50">{hardest === null ? "None" : midiToName(hardest)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={restart} className={buttonVariants({ variant: "primary", size: "sm" })}>
              Try again
            </button>
            {tab === "guided" && (
              <button type="button" onClick={() => chooseTab("memory")} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Try it from memory
              </button>
            )}
          </div>
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {tab === "listen" && (
          <button type="button" onClick={playing ? stopDemo : playDemo} className={buttonVariants({ variant: "primary", size: "sm" })}>
            {playing ? "Stop" : "Hear it"}
          </button>
        )}
        {tab === "memory" && (
          <button type="button" onClick={playDemo} disabled={playing} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Hear it again
          </button>
        )}
        {scoring && !scoring.finished && (
          <button type="button" onClick={restart} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Start over
          </button>
        )}
        <label className="inline-flex items-center gap-2 text-small text-slate-300">
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--signal,255_140_66))]" />
          Show note names
        </label>
        <label className="inline-flex items-center gap-2 text-small text-slate-300">
          <input type="checkbox" checked={audio.muted} onChange={(e) => audio.setMuted(e.target.checked)} className="h-4 w-4" />
          Mute sound
        </label>
        <label className="inline-flex items-center gap-2 text-small text-slate-300">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audio.volume}
            onChange={(e) => audio.setVolume(Number(e.target.value))}
            aria-label="Volume"
            className="w-28"
          />
        </label>
      </div>

      <div className="mt-6 text-small text-slate-400">
        <p>
          Play with your finger or mouse, or with the A S D F G H J K keys (W E T Y U for the black keys). Tab to a key and press Space to play it.
        </p>
        {audio.state === "unsupported" && <p className="mt-2 text-amber-300">This browser cannot play sound. You can still follow the outlined keys and the written feedback.</p>}
        <div className="mt-3">
          {midi.supported ? (
            <>
              <button type="button" onClick={() => void midi.enable()} disabled={midi.status === "requesting" || midi.status === "connected"} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                {midi.status === "connected" ? "Keyboard connected" : "Connect a MIDI keyboard"}
              </button>
              <span role="status" className="ml-3">
                {midi.status === "connected" && midi.devices.join(", ")}
                {midi.status === "no-device" && "No keyboard found. Plug one in and it will connect."}
                {midi.status === "denied" && "Access to MIDI was not allowed. The on-screen keys still work."}
              </span>
            </>
          ) : (
            <p>A physical MIDI keyboard needs a browser that supports Web MIDI, such as Chrome or Edge on a computer. The on-screen keys work everywhere.</p>
          )}
        </div>
        <p className="mt-3">Results on this screen are not saved yet.</p>
      </div>
    </div>
  );
}
