"use client";

import { useMemo } from "react";
import { buildKeys, countWhiteKeys } from "@/lib/piano/notes";

// A black key is 70% of a white key wide (a real one is nearer 58%): at 320px that is still 24px or more, the WCAG 2.2 minimum touch target.
const BLACK_RATIO = 0.7;

/**
 * An on-screen piano that is really playable: pointer down plays (no waiting for a click), pointer up releases, and every key is a
 * real button with its note name as its accessible name, so it also works with Tab and Space/Enter and a screen reader.
 * The guided target and the last result are shown with an outline AND text elsewhere on the page, never by colour alone.
 */
export function PianoKeyboard({
  startMidi,
  endMidi,
  pressed,
  target,
  showLabels,
  onNoteOn,
  onNoteOff,
}: {
  startMidi: number;
  endMidi: number;
  pressed: ReadonlySet<number>;
  target: number | null;
  showLabels: boolean;
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
}) {
  const keys = useMemo(() => buildKeys(startMidi, endMidi), [startMidi, endMidi]);
  const whites = countWhiteKeys(keys);
  const whiteWidth = 100 / whites;

  return (
    <div role="group" aria-label="Piano keyboard" className="relative mx-auto h-44 w-full max-w-3xl select-none touch-none sm:h-56">
      {keys
        .filter((k) => !k.isBlack)
        .map((k) => {
          const down = pressed.has(k.midi);
          const isTarget = target === k.midi;
          return (
            <button
              key={k.midi}
              type="button"
              aria-label={k.name}
              aria-pressed={down}
              data-midi={k.midi}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                onNoteOn(k.midi);
              }}
              onPointerUp={() => onNoteOff(k.midi)}
              onPointerCancel={() => onNoteOff(k.midi)}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  onNoteOn(k.midi);
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") onNoteOff(k.midi);
              }}
              style={{ left: `${k.whiteIndex * whiteWidth}%`, width: `${whiteWidth}%` }}
              className={`absolute inset-y-0 flex items-end justify-center rounded-b-lg border border-black/40 pb-2 text-small font-semibold text-black outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-signal ${
                down ? "bg-slate-300" : "bg-white"
              } ${isTarget ? "z-[5] ring-4 ring-signal" : ""}`}
            >
              {showLabels && k.name.replace(/\d/, "")}
              {isTarget && <span className="sr-only"> (next note)</span>}
            </button>
          );
        })}
      {keys
        .filter((k) => k.isBlack)
        .map((k) => {
          const down = pressed.has(k.midi);
          const isTarget = target === k.midi;
          return (
            <button
              key={k.midi}
              type="button"
              aria-label={k.name}
              aria-pressed={down}
              data-midi={k.midi}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                onNoteOn(k.midi);
              }}
              onPointerUp={() => onNoteOff(k.midi)}
              onPointerCancel={() => onNoteOff(k.midi)}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  onNoteOn(k.midi);
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") onNoteOff(k.midi);
              }}
              style={{ left: `${k.whiteIndex * whiteWidth - whiteWidth * BLACK_RATIO / 2}%`, width: `${whiteWidth * BLACK_RATIO}%` }}
              className={`absolute top-0 z-10 h-[62%] rounded-b-md border border-black text-caption font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-signal ${
                down ? "bg-slate-600" : "bg-black"
              } ${isTarget ? "ring-4 ring-signal" : ""}`}
            >
              {showLabels && <span className="absolute inset-x-0 bottom-1">{k.name.replace(/\d/, "")}</span>}
              {isTarget && <span className="sr-only"> (next note)</span>}
            </button>
          );
        })}
    </div>
  );
}
