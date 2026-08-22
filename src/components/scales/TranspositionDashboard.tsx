"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ROOT_KEYS, spellScale, getScaleInAllKeys, type RootKey } from "@/lib/music-theory";
import type { ScaleVariant } from "@/lib/scale-content";
import type { ScalePlayer } from "@/components/scales/useScalePlayer";
import { PianoKeyboard } from "@/components/scales/PianoKeyboard";

export interface TranspositionDashboardProps {
  variant: ScaleVariant;
  root: RootKey;
  player: ScalePlayer;
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/** Spells `variant` at `root`, plus a reference table of all 12 keys with the active root highlighted. */
export function TranspositionDashboard({ variant, root, player }: TranspositionDashboardProps) {
  const spelled = useMemo(() => spellScale(root, variant.formula), [root, variant.formula]);
  const allKeys = useMemo(() => getScaleInAllKeys(variant.formula), [variant.formula]);

  const { supported, isPlaying, activeIndex, playScale, playDegree, playKey, stop } = player;

  return (
    <div className="glass-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">
            Transposition Dashboard
          </p>
          <h2 className="mt-1 font-serif text-xl text-slate-50">{variant.name}</h2>
          <p className="mt-2 font-mono text-xs text-slate-500">
            {variant.formula.split("-").join(" – ")}
          </p>
        </div>

        {/* Rendered only where the Web Audio API actually exists, rather than
            showing a control that silently does nothing. */}
        {supported && (
          <button
            type="button"
            onClick={() => (isPlaying ? stop() : playScale(spelled.notes))}
            aria-label={
              isPlaying ? "Stop playback" : `Play the ${variant.name} scale in ${root}`
            }
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[rgb(var(--c-a-400)/0.4)] px-3.5 py-2 text-sm font-medium text-[rgb(var(--c-a-300))] transition duration-200 hover:border-[rgb(var(--c-a-400))] hover:bg-[rgb(var(--c-a-400)/0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-a-400)/0.7)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            {isPlaying ? <StopIcon /> : <PlayIcon />}
            {isPlaying ? "Stop" : "Hear this scale"}
          </button>
        )}
      </div>

      <motion.div
        key={root + variant.name}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.36 }}
        className="mt-6 flex flex-wrap gap-3"
      >
        {spelled.notes.map((note, i) => {
          // The run appends the root an octave up, which arrives as an index
          // one past the end of this list — light the root chip again for it,
          // otherwise the final note of every scale looks unplayed.
          const isActive = activeIndex === i || (activeIndex === spelled.notes.length && i === 0);

          return (
            <button
              key={`${note}-${i}`}
              type="button"
              disabled={!supported}
              onClick={() => playDegree(spelled.notes, i)}
              aria-label={`Play ${note}, scale degree ${spelled.degrees[i]}`}
              className={`flex w-16 cursor-pointer flex-col items-center rounded-xl border py-3 transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-a-400)/0.7)] disabled:cursor-default motion-safe:duration-200 ${
                isActive
                  ? "border-[rgb(var(--c-a-400))] bg-[rgb(var(--c-a-400)/0.2)] motion-safe:scale-105"
                  : "border-[rgb(var(--c-a-400)/0.25)] bg-[rgb(var(--c-a-400)/0.05)] hover:border-[rgb(var(--c-a-400)/0.6)] hover:bg-[rgb(var(--c-a-400)/0.1)]"
              }`}
            >
              <span className="font-serif text-lg text-slate-50">{note}</span>
              <span className="mt-1 text-[11px] text-[rgb(var(--c-a-300)/0.8)]">{spelled.degrees[i]}</span>
            </button>
          );
        })}
      </motion.div>

      {/* The same scale, a third way: where it sits under the hands. Rendered
          whether or not audio is supported — the shape of a kiñit on the keys
          is worth seeing even on a browser that can't sound it; the keys are
          just inert there. */}
      <div className="mt-7">
        <PianoKeyboard
          notes={spelled.notes}
          degrees={spelled.degrees}
          activeIndex={activeIndex}
          onPlayKey={playKey}
          disabled={!supported}
        />
      </div>

      {supported && (
        <p className="mt-3 text-[11px] text-slate-500">
          Tap any note or key to hear it. Keys outside the scale still sound.
        </p>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">
            {variant.name} spelled in all twelve keys. Current key: {root}.
          </caption>
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-slate-500">
              <th scope="col" className="pb-2 pr-4 font-medium uppercase">
                Key
              </th>
              {/* Degree tokens (b3, #4, ...) are case-sensitive — no uppercase transform here. */}
              {spelled.degrees.map((d, i) => (
                <th scope="col" key={`${d}-${i}`} className="pb-2 pr-4 font-medium">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROOT_KEYS.map((key) => (
              <tr
                key={key}
                className={`border-t border-ink/5 ${key === root ? "bg-[rgb(var(--c-a-400)/0.05)]" : ""}`}
              >
                <th
                  scope="row"
                  className={`py-2 pr-4 text-left font-medium ${
                    key === root ? "text-[rgb(var(--c-a-300))]" : "text-slate-300"
                  }`}
                >
                  {key}
                </th>
                {allKeys[key].map((note, i) => (
                  <td key={i} className="py-2 pr-4 text-slate-400">
                    {note}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
