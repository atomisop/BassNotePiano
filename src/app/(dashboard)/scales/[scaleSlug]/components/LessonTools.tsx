"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, FileVideo, Minus, Plus } from "lucide-react";
import type { CourseLessonWithProgress } from "@/lib/courseContent";
import { SCALE_NOTE_MAX_LENGTH } from "@/lib/scaleNotes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/Tabs";
import { METRONOME_MAX_BPM, METRONOME_MIN_BPM, type Metronome } from "@/components/scales/useMetronome";

/* ========================================================================
   Metronome
   ======================================================================== */

const METERS = [
  { id: "2", label: "2/4" },
  { id: "3", label: "3/4" },
  { id: "4", label: "4/4" },
  { id: "6", label: "6/8" },
] as const;

export function MetronomePanel({ metronome }: { metronome: Metronome }) {
  const { supported, running, bpm, beatsPerBar, beat, setBpm, setBeatsPerBar, start, stop } = metronome;

  if (!supported) {
    return <p className="text-small text-slate-400">This browser can&apos;t play audio, so the metronome isn&apos;t available here.</p>;
  }

  return (
    <div className="space-y-5">
      {/* The beat, made visible. Status, not a control, so ink and paper. */}
      <div className="flex items-center justify-center gap-2" aria-hidden>
        {Array.from({ length: beatsPerBar }, (_, i) => (
          <span
            key={i}
            className={cn(
              "rounded-full transition-[transform,background-color] duration-75",
              i === 0 ? "h-4 w-4" : "h-3 w-3",
              running && beat === i ? "scale-125 bg-slate-50" : "bg-slate-700",
            )}
          />
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <Button variant="secondary" size="icon" aria-label="Slower" onClick={() => setBpm(bpm - 1)}>
            <Minus className="h-4 w-4" />
          </Button>
          <p className="text-center">
            <span className="block text-body font-semibold tabular-nums text-slate-50">{bpm}</span>
            <span className="text-small text-slate-400">beats per minute</span>
          </p>
          <Button variant="secondary" size="icon" aria-label="Faster" onClick={() => setBpm(bpm + 1)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <input
          type="range"
          min={METRONOME_MIN_BPM}
          max={METRONOME_MAX_BPM}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          aria-label="Tempo in beats per minute"
          className="mt-4 h-11 w-full cursor-pointer accent-[rgb(var(--signal))]"
        />
      </div>

      <Tabs
        label="Beats per bar"
        value={String(beatsPerBar) as (typeof METERS)[number]["id"]}
        onChange={(id) => setBeatsPerBar(Number(id))}
        items={METERS.map((m) => ({ id: m.id, label: m.label }))}
      />

      <Button className="w-full" onClick={running ? stop : start}>
        {running ? "Stop" : "Start"}
      </Button>
      <p className="text-small text-slate-400">Keeps playing while you close this panel.</p>
    </div>
  );
}

/* ========================================================================
   Notes
   ======================================================================== */

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string };

/**
 * Private notes for this scale, saved to the student's account. Autosaves a
 * moment after typing stops, and again when the panel closes, so nothing
 * typed is ever lost to a forgotten save button.
 */
export function NotesPanel({
  initialBody,
  onSave,
}: {
  initialBody: string;
  onSave: (body: string) => Promise<{ ok: true; savedAt: string } | { ok: false; error: string }>;
}) {
  const [body, setBody] = useState(initialBody);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const lastSaved = useRef(initialBody);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next === null || next === lastSaved.current) return;
    setState({ kind: "saving" });
    try {
      const result = await onSave(next);
      if (result.ok) {
        lastSaved.current = next;
        setState({ kind: "saved", at: result.savedAt });
      } else {
        setState({ kind: "error", message: result.error });
      }
    } catch {
      setState({ kind: "error", message: "Couldn't save. Check your connection; your text is still here." });
    }
  }, [onSave]);

  function handleChange(value: string) {
    setBody(value);
    pending.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }

  // Save whatever is pending when the panel closes or the page changes.
  useEffect(() => () => void flush(), [flush]);

  const over = body.length > SCALE_NOTE_MAX_LENGTH;

  return (
    <div className="flex h-full flex-col">
      <label htmlFor="scale-note" className="text-small text-slate-400">
        Only you can see these. Saved to your account.
      </label>
      <textarea
        id="scale-note"
        value={body}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => void flush()}
        placeholder="Fingerings, tricky spots, what your teacher said…"
        rows={12}
        className="mt-3 min-h-64 w-full flex-1 resize-y rounded-control p-3 text-body text-slate-50 placeholder:text-slate-500 focus-visible:border-signal focus-visible:outline-none bg-neu-base shadow-raised-low"
      />
      <div className="mt-2 flex items-center justify-between gap-3 text-small" aria-live="polite">
        <span className={state.kind === "error" ? "text-[rgb(var(--c-rd-300))]" : "text-slate-400"}>
          {state.kind === "saving" && "Saving…"}
          {state.kind === "saved" && "Saved"}
          {state.kind === "error" && state.message}
        </span>
        <span className={cn("tabular-nums", over ? "text-[rgb(var(--c-rd-300))]" : "text-slate-500")}>
          {body.length.toLocaleString("en-US")} / {SCALE_NOTE_MAX_LENGTH.toLocaleString("en-US")}
        </span>
      </div>
    </div>
  );
}

/* ========================================================================
   Files
   ======================================================================== */

/**
 * The lesson files the student can already open. Only unlocked lessons are
 * listed, so this never becomes a way around the one-at-a-time lesson order.
 */
export function FilesPanel({ lessons }: { lessons: CourseLessonWithProgress[] }) {
  const unlocked = lessons.filter((l, i) => i === 0 || lessons[i - 1].completed);

  if (unlocked.length === 0) {
    return <p className="text-small text-slate-400">No files for this scale yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {unlocked.map((lesson) => {
        const Icon = lesson.type === "VIDEO" ? FileVideo : FileText;
        return (
          <li key={lesson.id}>
            <a
              href={lesson.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-3 rounded-control px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-small font-semibold text-slate-50">{lesson.title}</span>
              <span className="shrink-0 text-small text-slate-400">{lesson.type === "VIDEO" ? "Video" : "PDF"}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
